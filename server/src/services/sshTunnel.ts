import { Client, Pool } from 'pg';
import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from '../utils/logger';

const execAsync = promisify(exec);

// SSH configuration for on-demand connections
const SSH_CONFIG = {
  keyFile: process.env.SSH_KEY_PATH || '/Users/retalplaza/Downloads/DB claude key/claude-control-key',
  sshHost: process.env.SSH_HOST || '15.207.255.212',
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

// Queue for concurrent requests
let pendingQueries: Array<{
  text: string;
  params?: any[];
  resolve: (result: any) => void;
  reject: (error: Error) => void;
}> = [];

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

// Initialize SSH tunnel and connection pool
async function initializeTunnel() {
  if (establishingTunnel) {
    // Wait for current tunnel establishment
    while (establishingTunnel) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return;
  }

  if (tunnelEstablished && tunnelPool) {
    return;
  }

  establishingTunnel = true;

  try {
    // Find available port
    tunnelPort = await findAvailablePort();

    // Establish SSH tunnel
    const sshCommand = `ssh -i "${SSH_CONFIG.keyFile}" -o StrictHostKeyChecking=no -o ConnectTimeout=10 -f -N -L ${tunnelPort}:${SSH_CONFIG.dbHost}:${SSH_CONFIG.dbPort} ${SSH_CONFIG.sshUser}@${SSH_CONFIG.sshHost}`;

    logger.info(`Establishing SSH tunnel on port ${tunnelPort}...`);
    await execAsync(sshCommand);

    // Wait for tunnel to establish
    await new Promise(resolve => setTimeout(resolve, 2000));

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

    tunnelEstablished = true;
    logger.info(`SSH tunnel pool established on port ${tunnelPort}`);

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

  } catch (error) {
    logger.error('Failed to establish SSH tunnel:', error);
    throw error;
  } finally {
    establishingTunnel = false;
  }
}

// Helper to query production database with pooled SSH tunnel
export async function queryProductionWithTunnel(text: string, params?: any[]): Promise<any> {
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
    try {
      return await tunnelPool.query(text, params);
    } catch (error) {
      logger.error('Query failed, reinitializing tunnel:', error);
      // Reset tunnel state and retry
      await cleanup();
      await initializeTunnel();
      return await tunnelPool!.query(text, params);
    }
  }

  throw new Error('SSH tunnel pool not available');
}

// Cleanup function
async function cleanup() {
  tunnelEstablished = false;
  establishingTunnel = false;

  if (tunnelPool) {
    await tunnelPool.end();
    tunnelPool = null;
  }

  if (tunnelPort) {
    try {
      await execAsync(`lsof -ti:${tunnelPort} | xargs kill`);
      logger.info(`Cleaned up SSH tunnel on port ${tunnelPort}`);
    } catch (error) {
      // Ignore cleanup errors
    }
    tunnelPort = null;
  }
}

export { SSH_CONFIG };