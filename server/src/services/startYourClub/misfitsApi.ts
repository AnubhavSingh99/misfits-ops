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

function flattenValidationErrors(input: any): string[] {
  if (!input) return [];
  if (typeof input === 'string') {
    const value = input.trim();
    return value ? [value] : [];
  }
  if (Array.isArray(input)) {
    return input.flatMap((item) => flattenValidationErrors(item));
  }
  if (typeof input === 'object') {
    return Object.entries(input).flatMap(([field, value]) => {
      const messages = flattenValidationErrors(value);
      return messages.map((message) => (field ? `${field}: ${message}` : message));
    });
  }
  return [];
}

function extractBestErrorMessage(data: any, status: number): string {
  const message = typeof data?.message === 'string' ? data.message.trim() : '';
  const detail = typeof data?.detail === 'string' ? data.detail.trim() : '';
  const errorCode = typeof data?.error === 'string' ? data.error.trim() : '';
  const validation =
    flattenValidationErrors(data?.errors).concat(flattenValidationErrors(data?.details));
  if (validation.length > 0) return validation.join('; ');
  if (message && message.toLowerCase() !== 'validation_error') return message;
  if (detail) return detail;
  if (errorCode && errorCode.toLowerCase() !== 'validation_error') return errorCode;
  if (message) return message;
  if (errorCode) return errorCode;
  return `HTTP ${status}`;
}

export async function misfitsApi(
  method: string,
  path: string,
  body?: Record<string, any>
): Promise<ApiResponse> {
  // Read env at call time (not module load) so dotenv.config() has run
  const apiUrl = process.env.MISFITS_API_URL || 'https://prod.misfits.net.in/api/v1';
  const apiToken = process.env.MISFITS_API_TOKEN || '';
  if (!apiToken.trim()) {
    const message = 'MISFITS_API_TOKEN is not configured. Add MISFITS_API_TOKEN in .env to use Start Your Club write APIs.';
    logger.error(`Misfits API config error: ${message}`);
    return { ok: false, status: 500, data: null, error: message };
  }

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
    const data: any = await res.json().catch(() => ({}));

    if (!res.ok) {
      const errMsg = extractBestErrorMessage(data, res.status);
      logger.error(`Misfits API error: ${method} ${path} → ${res.status}: ${errMsg}`);
      return { ok: false, status: res.status, data, error: errMsg };
    }

    return { ok: true, status: res.status, data };
  } catch (err: any) {
    logger.error(`Misfits API fetch failed: ${method} ${path} → ${err.message}`);
    return { ok: false, status: 500, data: null, error: err.message };
  }
}
