/**
 * Proxy helper for forwarding SYC admin writes to the Go backend API.
 * The Go backend connects to the DB as `postgres` (full permissions),
 * so we route writes through it instead of writing directly with `dev`.
 */

import { logger } from '../../utils/logger';

interface ApiResponse {
  ok: boolean;
  status: number;
  data: any;
  error?: string;
}

export async function misfitsApi(
  method: string,
  path: string,
  body?: Record<string, any>
): Promise<ApiResponse> {
  // Read env at call time (not module load) so dotenv.config() has run
  const apiUrl = process.env.MISFITS_API_URL || 'https://prod.misfits.net.in/api/v1';
  const apiToken = process.env.MISFITS_API_TOKEN || '';

  const url = `${apiUrl}${path}`;
  const opts: RequestInit = {
    method,
    headers: {
      'Authorization': `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
    },
  };
  if (body && method !== 'GET') {
    opts.body = JSON.stringify(body);
  }

  try {
    const res = await fetch(url, opts);
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const errMsg = data?.error || data?.message || `HTTP ${res.status}`;
      logger.error(`Misfits API error: ${method} ${path} → ${res.status}: ${errMsg}`);
      return { ok: false, status: res.status, data, error: errMsg };
    }

    return { ok: true, status: res.status, data };
  } catch (err: any) {
    logger.error(`Misfits API fetch failed: ${method} ${path} → ${err.message}`);
    return { ok: false, status: 500, data: null, error: err.message };
  }
}
