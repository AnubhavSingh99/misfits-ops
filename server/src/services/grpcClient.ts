/**
 * Shared gRPC client utility
 * Uses grpcurl CLI to call gRPC services on the Misfits backend.
 * Used by venueRepository.ts (LocationService) and startYourClub.ts (SuperAdminService).
 */
import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from '../utils/logger';
import * as fs from 'fs';
import * as path from 'path';

const execAsync = promisify(exec);

const GRPC_API_KEY = '024d77dd28d21f0a99bfc2bb1c6ce9089d9273772c8319848d0a34f9ff9ae3d3';
const GRPC_HOST = '15.207.255.212:8001';
const PROD_GRPCURL_BIN = '/home/ec2-user/go/bin/grpcurl';
const LOCAL_GRPCURL_BIN = path.resolve(__dirname, '../../bin/grpcurl');

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

// Evaluate at runtime (after dotenv loads), not at module load time
function getGrpcurlBin(): string {
  const fromEnv = process.env.GRPCURL_BIN?.trim();
  if (fromEnv && fs.existsSync(fromEnv)) {
    return fromEnv;
  }

  if (process.env.NODE_ENV === 'production' && fs.existsSync(PROD_GRPCURL_BIN)) {
    return PROD_GRPCURL_BIN;
  }

  if (fs.existsSync(LOCAL_GRPCURL_BIN)) {
    return LOCAL_GRPCURL_BIN;
  }

  return 'grpcurl';
}

/**
 * Call a gRPC method via grpcurl
 * @param service - e.g., 'LocationService', 'SuperAdminService'
 * @param method - e.g., 'CreateVenue', 'StartYourClubPickApplication'
 * @param data - request object (will be JSON-serialized)
 * @returns parsed response object
 */
export async function callGrpc(service: string, method: string, data: any): Promise<any> {
  const bin = getGrpcurlBin();
  const jsonData = JSON.stringify(data);
  const escaped = jsonData.replace(/'/g, "'\\''");
  const cmd = `${shellQuote(bin)} -plaintext -H 'x-api-key: ${GRPC_API_KEY}' -d '${escaped}' ${GRPC_HOST} ${service}.${method}`;

  logger.info(`gRPC call: ${service}.${method}`, { data });

  try {
    const { stdout, stderr } = await execAsync(cmd, { timeout: 30000 });
    if (stderr) logger.warn(`gRPC ${method} stderr: ${stderr}`);
    const result = stdout && stdout.trim() ? JSON.parse(stdout) : {};
    logger.info(`gRPC ${method} response:`, { result });
    return result;
  } catch (error: any) {
    logger.error(`gRPC ${service}.${method} failed:`, {
      error: error.message,
      stderr: error.stderr,
      cmd: cmd.substring(0, 200) + '...'
    });
    throw new Error(`gRPC ${method} failed: ${error.stderr || error.message}`);
  }
}

// Re-export constants for venueRepository.ts backward compat
export { GRPC_API_KEY, GRPC_HOST, getGrpcurlBin };
