import { Client, Pool } from 'pg';
import { exec, spawn, ChildProcess } from 'child_process';
import { promisify } from 'util';
import { logger } from '../utils/logger';

const execAsync = promisify(exec);

// SSH configuration for on-demand connections
const SSH_CONFIG = {
  keyFile: process.env.SSH_KEY_PATH || '/Users/retalplaza/Downloads/DB claude key/claude-control-key',
  sshHost: process.env.SSH_HOST || 'grpc-prod.misfits.net.in',
  sshUser: process.env.SSH_USER || 'claude-control',
  dbHost: process.env.DB_HOST || 'misfits.cgncbvolnhe7.ap-south-1.rds.amazonaws.com',
  dbPort: process.env.DB_PORT || '5432',
  dbName: process.env.PROD_DB_NAME || 'misfits',
  dbUser: process.env.PROD_DB_USER || 'dev',
  dbPassword: process.env.PROD_DB_PASSWORD || 'postgres'
};

// Connection pooling for SSH tunnel
let tunnelPool: Pool | null = null;
let tunnelPort: number | null = null;
let tunnelEstablished = false;
let establishingTunnel = false;
let sshProcess: ChildProcess | null = null;
let sshControlSocket: string | null = null;

// Retry configuration - Reduced to prevent SSH tunnel storms
const RETRY_CONFIG = {
  maxRetries: 2, // Reduced from 5 to 2 (total 3 attempts)
  baseDelay: 2000, // 2 seconds
  maxDelay: 10000, // 10 seconds
  backoffMultiplier: 2
};

// Queue for concurrent requests
let pendingQueries: Array<{
  text: string;
  params?: any[];
  resolve: (result: any) => void;
  reject: (error: Error) => void;
}> = [];

// Sleep utility for retry delays
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Calculate exponential backoff delay
function getRetryDelay(attempt: number): number {
  const delay = RETRY_CONFIG.baseDelay * Math.pow(RETRY_CONFIG.backoffMultiplier, attempt);
  return Math.min(delay, RETRY_CONFIG.maxDelay);
}

// Find available port for SSH tunnel
async function findAvailablePort(startPort = 5434): Promise<number> {
  for (let port = startPort; port < startPort + 100; port++) {
    try {
      await execAsync(`lsof -ti:${port}`);
      // Port is in use, try next one
    } catch {
      // Port is available
      return port;
    }
  }
  throw new Error('No available ports found for SSH tunnel');
}

// Initialize SSH tunnel with retry logic
async function initializeTunnel(): Promise<void> {
  if (establishingTunnel) {
    // Wait for current tunnel establishment
    while (establishingTunnel) {
      await sleep(100);
    }
    return;
  }

  if (tunnelEstablished && tunnelPool) {
    return;
  }

  establishingTunnel = true;

  for (let attempt = 0; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
    try {
      // Find available port
      tunnelPort = await findAvailablePort();

      // Create unique control socket path for this tunnel
      sshControlSocket = `/tmp/ssh-tunnel-${tunnelPort}-${Date.now()}.sock`;

      // Establish SSH tunnel in foreground with control socket
      const sshArgs = [
        '-i', SSH_CONFIG.keyFile,
        '-o', 'StrictHostKeyChecking=no',  // Accept both new and changed keys
        '-o', 'UserKnownHostsFile=/home/ec2-user/.ssh/known_hosts',
        '-o', 'ConnectTimeout=30',
        '-o', 'ServerAliveInterval=60',
        '-o', 'ServerAliveCountMax=3',
        '-M', // Master mode - enables control socket
        '-S', sshControlSocket, // Control socket path
        '-N', // No command execution
        '-L', `${tunnelPort}:${SSH_CONFIG.dbHost}:${SSH_CONFIG.dbPort}`,
        `${SSH_CONFIG.sshUser}@${SSH_CONFIG.sshHost}`
      ];

      logger.info(`Establishing SSH tunnel on port ${tunnelPort} (attempt ${attempt + 1}/${RETRY_CONFIG.maxRetries + 1})...`);

      // Spawn SSH process in foreground
      await new Promise<void>((resolve, reject) => {
        sshProcess = spawn('ssh', sshArgs, {
          stdio: ['pipe', 'pipe', 'pipe']  // Changed from 'ignore' to 'pipe' for stdin to allow graceful close
        });

        let sshErrorOutput = '';
        let hostKeyIssue = false;

        sshProcess.stderr?.on('data', (data) => {
          const message = data.toString();
          sshErrorOutput += message;

          // Check for host key change errors
          if (message.includes('REMOTE HOST IDENTIFICATION HAS CHANGED') ||
              message.includes('Offending') ||
              message.includes('Host key verification failed')) {
            hostKeyIssue = true;
          }
        });

        sshProcess.on('error', (error) => {
          reject(new Error(`SSH spawn failed: ${error.message}`));
        });

        sshProcess.on('exit', (code, signal) => {
          if (code !== null && code !== 0) {
            reject(new Error(`SSH exited with code ${code}: ${sshErrorOutput}`));
          } else if (signal) {
            reject(new Error(`SSH killed with signal ${signal}`));
          }
        });

        // Wait for tunnel to establish
        setTimeout(async () => {
          // Check if process is still alive and tunnel is working
          if (sshProcess && !sshProcess.killed) {
            try {
              await execAsync(`nc -z localhost ${tunnelPort}`);
              logger.info(`SSH tunnel verified on port ${tunnelPort} (PID: ${sshProcess.pid})`);
              resolve();
            } catch (ncError) {
              // If host key issue detected, handle it
              if (hostKeyIssue) {
                logger.warn(`Host key changed for ${SSH_CONFIG.sshHost}, removing old key...`);
                try {
                  await execAsync(`ssh-keygen -R ${SSH_CONFIG.sshHost} 2>/dev/null || true`);
                  logger.info('Old host key removed, please retry');
                } catch (cleanupError) {
                  logger.warn('Failed to remove old host key:', cleanupError);
                }
              }
              reject(new Error(`SSH tunnel port ${tunnelPort} not accessible: ${sshErrorOutput}`));
            }
          } else {
            reject(new Error(`SSH process died: ${sshErrorOutput}`));
          }
        }, 3000);
      });

      // Create connection pool through tunnel
      tunnelPool = new Pool({
        host: 'localhost',
        port: tunnelPort,
        database: SSH_CONFIG.dbName,
        user: SSH_CONFIG.dbUser,
        password: SSH_CONFIG.dbPassword,
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 15000
      });

      // Test database connection
      const testClient = await tunnelPool.connect();
      await testClient.query('SELECT 1');
      testClient.release();

      tunnelEstablished = true;
      logger.info(`SSH tunnel pool established successfully on port ${tunnelPort} after ${attempt + 1} attempt(s)`);

      // Process any queued queries
      const queries = [...pendingQueries];
      pendingQueries = [];

      for (const query of queries) {
        try {
          const result = await tunnelPool.query(query.text, query.params);
          query.resolve(result);
        } catch (error) {
          query.reject(error as Error);
        }
      }

      establishingTunnel = false;
      return; // Success, exit retry loop

    } catch (error) {
      logger.warn(`SSH tunnel attempt ${attempt + 1} failed:`, error);

      // Cleanup failed attempt
      await cleanup();

      if (attempt === RETRY_CONFIG.maxRetries) {
        logger.error(`Failed to establish SSH tunnel after ${RETRY_CONFIG.maxRetries + 1} attempts`);
        establishingTunnel = false;
        throw new Error(`SSH tunnel establishment failed after ${RETRY_CONFIG.maxRetries + 1} attempts: ${error}`);
      }

      // Wait with exponential backoff before next attempt
      const delay = getRetryDelay(attempt);
      logger.info(`Retrying SSH tunnel in ${delay}ms...`);
      await sleep(delay);
    }
  }
}

// Check if error is a connection error that requires tunnel reset
function isConnectionError(error: any): boolean {
  const connectionCodes = [
    'ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'ETIMEDOUT',
    'ECONNABORTED', 'EHOSTUNREACH', 'ENETUNREACH'
  ];

  const connectionMessages = [
    'connection terminated unexpectedly',
    'server closed the connection',
    'Connection terminated',
    'connect ECONNREFUSED'
  ];

  const errorCode = error?.code;
  const errorMessage = error?.message?.toLowerCase() || '';

  return connectionCodes.includes(errorCode) ||
         connectionMessages.some(msg => errorMessage.includes(msg));
}

// Helper to query production database with pooled SSH tunnel
export async function queryProductionWithTunnel(text: string, params?: any[]): Promise<any> {
  for (let queryAttempt = 0; queryAttempt <= 2; queryAttempt++) {
    try {
      // If tunnel not established and not being established, initialize it
      if (!tunnelEstablished && !establishingTunnel) {
        await initializeTunnel();
      }

      // If tunnel is being established, queue the query
      if (establishingTunnel) {
        return new Promise((resolve, reject) => {
          pendingQueries.push({ text, params, resolve, reject });
        });
      }

      // Use existing pool
      if (tunnelPool) {
        const result = await tunnelPool.query(text, params);
        return result;
      }

      throw new Error('SSH tunnel pool not available');

    } catch (error) {
      logger.error(`Query attempt ${queryAttempt + 1} failed:`, error);

      // Check if this is an application error (like missing table) vs connection error
      if (!isConnectionError(error)) {
        // Application error - don't reset tunnel, just throw the error
        throw error;
      }

      if (queryAttempt === 2) {
        throw new Error(`Query failed after 3 attempts: ${error}`);
      }

      // Only reset tunnel for connection errors
      logger.info('Reinitializing tunnel for retry...');
      await cleanup();

      // Wait before retry
      await sleep(1000 * (queryAttempt + 1));

      try {
        await initializeTunnel();
      } catch (initError) {
        logger.error('Failed to reinitialize tunnel:', initError);
        if (queryAttempt === 1) {
          throw initError;
        }
      }
    }
  }
}

// Cleanup function with proper pool and process management
let cleaningUp = false;
async function cleanup() {
  if (cleaningUp) return; // Prevent multiple cleanup calls
  cleaningUp = true;

  tunnelEstablished = false;
  establishingTunnel = false;

  // Store current values before nulling
  const currentPool = tunnelPool;
  const currentPort = tunnelPort;
  const currentSshProcess = sshProcess;
  const currentControlSocket = sshControlSocket;

  // Null the global references immediately
  tunnelPool = null;
  tunnelPort = null;
  sshProcess = null;
  sshControlSocket = null;

  if (currentPool) {
    try {
      await currentPool.end();
      logger.info('Database pool closed');
    } catch (error) {
      // Pool might already be closed, ignore error
      logger.debug('Pool cleanup error (ignored):', error);
    }
  }

  // Disconnect SSH tunnel using control socket for proper remote notification
  if (currentSshProcess && !currentSshProcess.killed && currentControlSocket) {
    try {
      logger.info(`Sending exit command via control socket (PID: ${currentSshProcess.pid})`);

      // Send explicit exit command through control socket
      // This properly notifies remote sshd to disconnect
      const exitCommand = `ssh -S ${currentControlSocket} -O exit ${SSH_CONFIG.sshUser}@${SSH_CONFIG.sshHost}`;
      await execAsync(exitCommand).catch(err => {
        // Exit command may fail if connection already closed, ignore
        logger.debug('Control socket exit command error (may be expected):', err.message);
      });

      // Give SSH time to disconnect gracefully
      await sleep(2000);

      // If still running, send SIGTERM as fallback
      if (!currentSshProcess.killed) {
        logger.warn(`SSH process ${currentSshProcess.pid} still alive after exit command, sending SIGTERM`);
        currentSshProcess.kill('SIGTERM');
        await sleep(1000);
      }

      // Force kill if still alive
      if (!currentSshProcess.killed) {
        logger.warn(`Force killing SSH process ${currentSshProcess.pid} with SIGKILL`);
        currentSshProcess.kill('SIGKILL');
      } else {
        logger.info(`SSH tunnel disconnected gracefully via control socket`);
      }

      // Clean up control socket file
      try {
        await execAsync(`rm -f ${currentControlSocket}`);
      } catch (err) {
        // Ignore cleanup errors
      }
    } catch (error) {
      // Ignore cleanup errors - process might already be dead
      logger.debug('SSH process cleanup error (ignored):', error);
    }
  } else if (currentSshProcess && !currentSshProcess.killed) {
    // Fallback if no control socket (shouldn't happen with new code)
    logger.warn('No control socket available, falling back to SIGTERM');
    try {
      currentSshProcess.kill('SIGTERM');
      await sleep(2000);
      if (!currentSshProcess.killed) {
        currentSshProcess.kill('SIGKILL');
      }
    } catch (error) {
      logger.debug('SSH process kill error (ignored):', error);
    }
  }

  cleaningUp = false;
}

export { SSH_CONFIG, cleanup as cleanupTunnel };