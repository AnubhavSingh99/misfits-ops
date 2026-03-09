import { Router, Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { Pool } from 'pg';
import { logger } from '../utils/logger';

const router = Router();

const MISFITS_URL = process.env.MISFITS_BACKEND_URL || 'http://localhost:8000';
const ADMIN_USER_PK = parseInt(process.env.SUPPORT_ADMIN_USER_PK || '1', 10);

// Critical: Refuse to start with a guessable default JWT secret
const JWT_SECRET = process.env.MISFITS_JWT_SECRET;
if (!JWT_SECRET) {
  logger.warn('MISFITS_JWT_SECRET is not set — support proxy endpoints will be disabled');
}

// Validate that :id param is a positive integer
function validateId(req: Request, res: Response, next: NextFunction): void {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id) || id <= 0 || String(id) !== req.params.id) {
    res.status(400).json({ error: 'Invalid ticket ID' });
    return;
  }
  next();
}

// Block all support routes if JWT secret is not configured
function requireJwtSecret(_req: Request, res: Response, next: NextFunction): void {
  if (!JWT_SECRET) {
    res.status(503).json({ error: 'Support proxy not configured: MISFITS_JWT_SECRET is required' });
    return;
  }
  next();
}

router.use(requireJwtSecret);

// Direct connection to misfits PostgreSQL for ticket listing (bypasses broken Go endpoint)
const misfitsPool = new Pool({
  host: process.env.MISFITS_DB_HOST || 'localhost',
  port: parseInt(process.env.MISFITS_DB_PORT || '5432', 10),
  database: process.env.MISFITS_DB_NAME || 'misfits',
  user: process.env.MISFITS_DB_USER || 'postgres',
  password: process.env.MISFITS_DB_PASSWORD || 'postgres',
  max: 5,
  idleTimeoutMillis: 30000,
});

// Cache the admin JWT token
let adminToken: string | null = null;
let adminTokenExpiry = 0;

function getAdminToken(): string {
  if (!JWT_SECRET) throw new Error('MISFITS_JWT_SECRET not configured');
  const now = Math.floor(Date.now() / 1000);
  if (adminToken && adminTokenExpiry > now + 60) {
    return adminToken;
  }
  const exp = now + 3600; // 1 hour
  adminToken = jwt.sign({ USER_ID_KEY: ADMIN_USER_PK, EXP_KEY: exp }, JWT_SECRET);
  adminTokenExpiry = exp;
  return adminToken;
}

async function proxyToMisfits(
  method: string,
  path: string,
  body?: any,
  query?: Record<string, string>
): Promise<{ status: number; data: any }> {
  const url = new URL(`${MISFITS_URL}/api${path}`);
  if (query) {
    Object.entries(query).forEach(([k, v]) => {
      if (v !== undefined && v !== '') url.searchParams.set(k, v);
    });
  }

  const token = getAdminToken();

  const res = await fetch(url.toString(), {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

// Agent endpoints — ticket listing queries production DB directly (Go backend's sqlc query is broken)
router.get('/agent/tickets', async (req: Request, res: Response) => {
  try {
    const status = (req.query.status as string) || null;
    const limit = parseInt((req.query.limit as string) || '50', 10);
    const offset = parseInt((req.query.offset as string) || '0', 10);

    const result = await misfitsPool.query(
      `SELECT st.id, st.ticket_number, st.subject, st.description,
              st.status::text as status, st.priority::text as priority,
              sc.name as category_name,
              st.created_at, st.updated_at,
              st.assigned_to,
              agent.first_name as assigned_agent_name,
              creator.first_name as user_name,
              creator.phone as user_phone,
              COALESCE(unread.cnt, 0)::int as unread_count,
              last_msg.content as last_message,
              last_msg.created_at as last_message_at,
              last_msg.sender_type::text as last_message_sender
       FROM support_ticket st
       LEFT JOIN support_category sc ON sc.id = st.category_id
       LEFT JOIN users agent ON agent.pk = st.assigned_to
       LEFT JOIN users creator ON creator.pk = st.user_id
       LEFT JOIN (
         SELECT ticket_id, COUNT(*) as cnt
         FROM support_message
         WHERE is_read = FALSE AND sender_type = 'USER'
         GROUP BY ticket_id
       ) unread ON unread.ticket_id = st.id
       LEFT JOIN LATERAL (
         SELECT content, created_at, sender_type
         FROM support_message
         WHERE ticket_id = st.id
         ORDER BY created_at DESC LIMIT 1
       ) last_msg ON true
       WHERE ($1::text IS NULL OR st.status::text = $1)
       ORDER BY st.updated_at DESC
       LIMIT $2 OFFSET $3`,
      [status, limit, offset]
    );

    res.json({ tickets: result.rows });
  } catch (error) {
    logger.error('Support proxy error (agent/tickets direct DB):', error);
    res.status(500).json({ error: 'Failed to load tickets from database' });
  }
});

router.get('/agent/stats', async (req: Request, res: Response) => {
  try {
    const result = await proxyToMisfits('GET', '/v1/support/agent/stats');
    res.status(result.status).json(result.data);
  } catch (error) {
    logger.error('Support proxy error (agent/stats):', error);
    res.status(502).json({ error: 'Failed to reach support backend' });
  }
});

router.patch('/agent/tickets/:id', validateId, async (req: Request, res: Response) => {
  try {
    const result = await proxyToMisfits('PATCH', `/v1/support/agent/tickets/${req.params.id}`, req.body);
    res.status(result.status).json(result.data);
  } catch (error) {
    logger.error('Support proxy error (agent/tickets/:id):', error);
    res.status(502).json({ error: 'Failed to reach support backend' });
  }
});

router.patch('/agent/tickets/:id/status', validateId, async (req: Request, res: Response) => {
  try {
    const result = await proxyToMisfits('PATCH', `/v1/support/agent/tickets/${req.params.id}/status`, req.body);
    res.status(result.status).json(result.data);
  } catch (error) {
    logger.error('Support proxy error (agent/tickets/:id/status):', error);
    res.status(502).json({ error: 'Failed to reach support backend' });
  }
});

router.patch('/agent/tickets/:id/priority', validateId, async (req: Request, res: Response) => {
  try {
    const { priority } = req.body;
    if (!priority || !['LOW', 'MEDIUM', 'HIGH', 'URGENT'].includes(priority)) {
      return res.status(400).json({ error: 'Invalid priority' });
    }
    const result = await proxyToMisfits('PATCH', `/v1/support/agent/tickets/${req.params.id}`, { priority });
    res.status(result.status).json(result.data);
  } catch (error) {
    logger.error('Support proxy error (agent/tickets/:id/priority):', error);
    res.status(502).json({ error: 'Failed to reach support backend' });
  }
});

router.post('/agent/tickets/:id/accept', validateId, async (req: Request, res: Response) => {
  try {
    const result = await proxyToMisfits('POST', `/v1/support/agent/tickets/${req.params.id}/accept`);
    res.status(result.status).json(result.data);
  } catch (error) {
    logger.error('Support proxy error (agent/tickets/:id/accept):', error);
    res.status(502).json({ error: 'Failed to reach support backend' });
  }
});

router.post('/agent/tickets/:id/resolve', validateId, async (req: Request, res: Response) => {
  try {
    const result = await proxyToMisfits('POST', `/v1/support/agent/tickets/${req.params.id}/resolve`, req.body);
    res.status(result.status).json(result.data);
  } catch (error) {
    logger.error('Support proxy error (agent/tickets/:id/resolve):', error);
    res.status(502).json({ error: 'Failed to reach support backend' });
  }
});

// Ticket detail & messages
router.get('/tickets/:id', validateId, async (req: Request, res: Response) => {
  try {
    const result = await proxyToMisfits('GET', `/v1/support/tickets/${req.params.id}`);
    res.status(result.status).json(result.data);
  } catch (error) {
    logger.error('Support proxy error (tickets/:id):', error);
    res.status(502).json({ error: 'Failed to reach support backend' });
  }
});

router.post('/tickets/:id/messages', validateId, async (req: Request, res: Response) => {
  try {
    const result = await proxyToMisfits('POST', `/v1/support/tickets/${req.params.id}/messages`, req.body);
    res.status(result.status).json(result.data);
  } catch (error) {
    logger.error('Support proxy error (tickets/:id/messages):', error);
    res.status(502).json({ error: 'Failed to reach support backend' });
  }
});

router.post('/tickets/:id/messages/read', validateId, async (req: Request, res: Response) => {
  try {
    const result = await proxyToMisfits('POST', `/v1/support/tickets/${req.params.id}/messages/read`, req.body);
    res.status(result.status).json(result.data);
  } catch (error) {
    logger.error('Support proxy error (tickets/:id/messages/read):', error);
    res.status(502).json({ error: 'Failed to reach support backend' });
  }
});

// File upload URL
router.post('/file/put-url', async (req: Request, res: Response) => {
  try {
    const result = await proxyToMisfits('POST', '/file/put-url', req.body);
    res.status(result.status).json(result.data);
  } catch (error) {
    logger.error('Support proxy error (file/put-url):', error);
    res.status(502).json({ error: 'Failed to reach support backend' });
  }
});

// /ws-info removed — WebSocket is now proxied server-side via the HTTP upgrade handler in server.ts
// The frontend connects to ws://<ops-host>/ws/support/chat?ticket_id=N directly

// SSE endpoint for real-time incoming request notifications
router.get('/agent/events', async (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  let lastWaitingIds = new Set<number>();

  const poll = async () => {
    try {
      const result = await misfitsPool.query(
        `SELECT st.id, st.ticket_number, st.subject,
                st.status::text as status, st.priority::text as priority,
                sc.name as category_name,
                st.user_note, st.created_at,
                u.first_name as user_name, u.phone as user_phone
         FROM support_ticket st
         LEFT JOIN support_category sc ON sc.id = st.category_id
         LEFT JOIN users u ON u.pk = st.user_id
         WHERE st.status = 'WAITING'
         ORDER BY st.created_at ASC`
      );

      const currentIds = new Set(result.rows.map((r: any) => r.id));

      // Detect new waiting tickets
      for (const row of result.rows) {
        if (!lastWaitingIds.has(row.id)) {
          res.write(`event: new_request\ndata: ${JSON.stringify(row)}\n\n`);
        }
      }

      // Detect accepted tickets (were waiting, now gone)
      for (const id of lastWaitingIds) {
        if (!currentIds.has(id)) {
          res.write(`event: request_accepted\ndata: ${JSON.stringify({ id })}\n\n`);
        }
      }

      lastWaitingIds = currentIds;

      // Always send current waiting list as heartbeat
      res.write(`event: waiting_list\ndata: ${JSON.stringify(result.rows)}\n\n`);
    } catch (error) {
      logger.error('SSE poll error:', error);
    }
  };

  // Initial poll
  await poll();

  // Poll every 5 seconds
  const interval = setInterval(poll, 5000);

  req.on('close', () => {
    clearInterval(interval);
  });
});

export default router;
