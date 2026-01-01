import { Client, Pool } from 'pg';
import { exec } from 'child_process';
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

// Retry configuration
const RETRY_CONFIG = {
  maxRetries: 5,
  baseDelay: 1000, // 1 second
  maxDelay: 30000, // 30 seconds
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

      // Establish SSH tunnel with retry-friendly options
      const sshCommand = `ssh -i "${SSH_CONFIG.keyFile}" -o StrictHostKeyChecking=no -o ConnectTimeout=30 -o ServerAliveInterval=60 -o ServerAliveCountMax=3 -f -N -L ${tunnelPort}:${SSH_CONFIG.dbHost}:${SSH_CONFIG.dbPort} ${SSH_CONFIG.sshUser}@${SSH_CONFIG.sshHost}`;

      logger.info(`Establishing SSH tunnel on port ${tunnelPort} (attempt ${attempt + 1}/${RETRY_CONFIG.maxRetries + 1})...`);
      await execAsync(sshCommand);

      // Wait for tunnel to establish with verification
      await sleep(3000);

      // Verify tunnel is working by testing the port
      try {
        await execAsync(`nc -z localhost ${tunnelPort}`);
        logger.info(`SSH tunnel verified on port ${tunnelPort}`);
      } catch {
        throw new Error(`SSH tunnel port ${tunnelPort} not accessible`);
      }

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

// Cleanup function with proper pool management
let cleaningUp = false;
async function cleanup() {
  if (cleaningUp) return; // Prevent multiple cleanup calls
  cleaningUp = true;

  tunnelEstablished = false;
  establishingTunnel = false;

  // Store current values before nulling
  const currentPool = tunnelPool;
  const currentPort = tunnelPort;

  // Null the global references immediately
  tunnelPool = null;
  tunnelPort = null;

  if (currentPool) {
    try {
      await currentPool.end();
      logger.info('Database pool closed');
    } catch (error) {
      // Pool might already be closed, ignore error
      logger.debug('Pool cleanup error (ignored):', error);
    }
  }

  if (currentPort) {
    try {
      await execAsync(`lsof -ti:${currentPort} | xargs kill`);
      logger.info(`Cleaned up SSH tunnel on port ${currentPort}`);
    } catch (error) {
      // Ignore cleanup errors - tunnel might already be closed
      logger.debug('SSH tunnel cleanup error (ignored):', error);
    }
  }

  cleaningUp = false;
}

export { SSH_CONFIG };