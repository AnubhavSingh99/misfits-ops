import { Router, Request, Response } from 'express';
import { logger } from '../utils/logger';
import {
  getQueries,
  getQueryTypes,
  updateQueryStatus,
  updateQueryDetails,
  getDashboardStats,
  getOrCreateQueryType
} from '../services/csService';
import {
  startPolling,
  stopPolling,
  getPollingStatus,
  triggerManualPoll,
  reprocessFromDate
} from '../services/csPollingService';
import { queryProduction } from '../services/database';
import {
  sendTicketToSlack,
  sendSLABreachNotification,
  getChannelTypes,
  checkSLABreaches,
  SlackChannelType,
  SLACK_CHANNELS
} from '../services/slackService';

const router = Router();

// ============================================
// DASHBOARD & STATS
// ============================================

/**
 * GET /api/cs/stats
 * Get dashboard statistics
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const stats = await getDashboardStats();
    res.json(stats);
  } catch (error) {
    logger.error('Error fetching CS stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// ============================================
// QUERIES CRUD
// ============================================

/**
 * POST /api/cs/queries
 * Create a new query manually (for WhatsApp, PlayStore, AppStore queries)
 */
router.post('/queries', async (req: Request, res: Response) => {
  try {
    const {
      stakeholder_type,
      query_type_id,
      query_subtype_id,
      source,
      user_name,
      user_contact,
      subject,
      description,
      priority,
      club_id,
      club_name
    } = req.body;

    // Validate required fields
    if (!stakeholder_type || !query_type_id || !user_contact || !subject) {
      return res.status(400).json({
        error: 'stakeholder_type, query_type_id, user_contact, and subject are required'
      });
    }

    const validStakeholders = ['user', 'leader', 'venue'];
    if (!validStakeholders.includes(stakeholder_type)) {
      return res.status(400).json({
        error: `Invalid stakeholder_type. Must be one of: ${validStakeholders.join(', ')}`
      });
    }

    const validSources = ['app', 'website', 'whatsapp', 'playstore', 'appstore'];
    if (source && !validSources.includes(source)) {
      return res.status(400).json({
        error: `Invalid source. Must be one of: ${validSources.join(', ')}`
      });
    }

    // Import pool for direct insert
    const { getLocalPool } = await import('../services/database');
    const pool = getLocalPool();

    // Get SLA hours from query type
    const typeResult = await pool.query(
      'SELECT default_sla_hours FROM cs_query_types WHERE id = $1',
      [query_type_id]
    );
    const slaHours = typeResult.rows[0]?.default_sla_hours || 24;

    // Insert the query
    const insertQuery = `
      INSERT INTO cs_queries (
        stakeholder_type,
        query_type_id,
        query_subtype_id,
        source,
        user_id,
        user_name,
        user_contact,
        subject,
        description,
        priority,
        status,
        sla_hours,
        club_id,
        club_name,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
      RETURNING *
    `;

    const params = [
      stakeholder_type,
      query_type_id,
      query_subtype_id || null,
      source || 'whatsapp',
      0, // user_id
      user_name || '',
      user_contact,
      subject,
      description || '',
      priority || 'normal',
      'created', // Initial status
      slaHours,
      club_id || null,
      club_name || null
    ];

    const result = await pool.query(insertQuery, params);
    logger.info(`Created manual CS query: ${result.rows[0].ticket_number}`);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    logger.error('Error creating query:', error);
    res.status(500).json({ error: 'Failed to create query' });
  }
});

/**
 * GET /api/cs/queries
 * Get all queries with optional filters
 */
router.get('/queries', async (req: Request, res: Response) => {
  try {
    const filters = {
      stakeholder_type: req.query.stakeholder_type as string | undefined,
      status: req.query.status as string | undefined,
      priority: req.query.priority as string | undefined,
      query_type_id: req.query.query_type_id ? parseInt(req.query.query_type_id as string) : undefined,
      assigned_to: req.query.assigned_to as string | undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 50,
      offset: req.query.offset ? parseInt(req.query.offset as string) : 0
    };

    const result = await getQueries(filters);
    res.json(result);
  } catch (error) {
    logger.error('Error fetching queries:', error);
    res.status(500).json({ error: 'Failed to fetch queries' });
  }
});

/**
 * PATCH /api/cs/queries/:id/status
 * Update query status
 */
router.patch('/queries/:id/status', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status, assigned_to, resolution_notes } = req.body;

    if (!status) {
      return res.status(400).json({ error: 'Status is required' });
    }

    const validStatuses = ['created', 'in_progress', 'ticket_communicated', 'resolved', 'resolution_communicated'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
    }

    const query = await updateQueryStatus(parseInt(id), status, assigned_to, resolution_notes);

    if (!query) {
      return res.status(404).json({ error: 'Query not found' });
    }

    res.json(query);
  } catch (error) {
    logger.error('Error updating query status:', error);
    res.status(500).json({ error: 'Failed to update query status' });
  }
});

/**
 * PATCH /api/cs/queries/:id/assign
 * Assign query to agent
 */
router.patch('/queries/:id/assign', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { assigned_to } = req.body;

    if (!assigned_to) {
      return res.status(400).json({ error: 'assigned_to is required' });
    }

    const query = await updateQueryStatus(parseInt(id), 'in_progress', assigned_to);

    if (!query) {
      return res.status(404).json({ error: 'Query not found' });
    }

    res.json(query);
  } catch (error) {
    logger.error('Error assigning query:', error);
    res.status(500).json({ error: 'Failed to assign query' });
  }
});

/**
 * PATCH /api/cs/queries/:id
 * Update query details (description, attachments)
 */
router.patch('/queries/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { description, attachments } = req.body;

    const query = await updateQueryDetails(parseInt(id), { description, attachments });

    if (!query) {
      return res.status(404).json({ error: 'Query not found' });
    }

    res.json({ success: true, query });
  } catch (error) {
    logger.error('Error updating query details:', error);
    res.status(500).json({ error: 'Failed to update query details' });
  }
});

// ============================================
// QUERY TYPES
// ============================================

/**
 * GET /api/cs/query-types
 * Get all query types (optionally filtered by stakeholder)
 */
router.get('/query-types', async (req: Request, res: Response) => {
  try {
    const stakeholderType = req.query.stakeholder_type as string | undefined;
    const types = await getQueryTypes(stakeholderType);
    res.json(types);
  } catch (error) {
    logger.error('Error fetching query types:', error);
    res.status(500).json({ error: 'Failed to fetch query types' });
  }
});

/**
 * POST /api/cs/query-types
 * Create a new query type
 */
router.post('/query-types', async (req: Request, res: Response) => {
  try {
    const { stakeholder_type, name, parent_id, default_sla_hours } = req.body;

    if (!stakeholder_type || !name) {
      return res.status(400).json({ error: 'stakeholder_type and name are required' });
    }

    const validTypes = ['user', 'leader', 'venue'];
    if (!validTypes.includes(stakeholder_type)) {
      return res.status(400).json({ error: `Invalid stakeholder_type. Must be one of: ${validTypes.join(', ')}` });
    }

    const queryType = await getOrCreateQueryType(
      stakeholder_type,
      name,
      parent_id || null,
      default_sla_hours || 24
    );

    res.status(201).json(queryType);
  } catch (error) {
    logger.error('Error creating query type:', error);
    res.status(500).json({ error: 'Failed to create query type' });
  }
});

// ============================================
// POLLING CONTROL
// ============================================

/**
 * GET /api/cs/polling/status
 * Get polling status
 */
router.get('/polling/status', (req: Request, res: Response) => {
  const status = getPollingStatus();
  res.json(status);
});

/**
 * POST /api/cs/polling/start
 * Start the polling job
 */
router.post('/polling/start', (req: Request, res: Response) => {
  startPolling();
  res.json({ message: 'Polling started', status: getPollingStatus() });
});

/**
 * POST /api/cs/polling/stop
 * Stop the polling job
 */
router.post('/polling/stop', (req: Request, res: Response) => {
  stopPolling();
  res.json({ message: 'Polling stopped', status: getPollingStatus() });
});

/**
 * POST /api/cs/polling/trigger
 * Manually trigger a poll
 */
router.post('/polling/trigger', async (req: Request, res: Response) => {
  try {
    const result = await triggerManualPoll();
    res.json(result);
  } catch (error) {
    logger.error('Error triggering manual poll:', error);
    res.status(500).json({ error: 'Failed to trigger poll' });
  }
});

/**
 * POST /api/cs/polling/reprocess
 * Reprocess data from a specific date
 */
router.post('/polling/reprocess', async (req: Request, res: Response) => {
  try {
    const { from_date } = req.body;

    if (!from_date) {
      return res.status(400).json({ error: 'from_date is required (ISO format)' });
    }

    const fromDate = new Date(from_date);
    if (isNaN(fromDate.getTime())) {
      return res.status(400).json({ error: 'Invalid date format' });
    }

    const result = await reprocessFromDate(fromDate);
    res.json(result);
  } catch (error) {
    logger.error('Error reprocessing data:', error);
    res.status(500).json({ error: 'Failed to reprocess data' });
  }
});

// ============================================
// CLUBS & HOSTS (from Misfits DB)
// ============================================

/**
 * GET /api/cs/clubs
 * Get all active clubs from Misfits DB for leader queries
 */
router.get('/clubs', async (req: Request, res: Response) => {
  try {
    const { search } = req.query;

    let clubsQuery = `
      SELECT
        c.pk as club_id,
        c.id as club_uuid,
        c.name as club_name,
        a.name as activity,
        c.status
      FROM club c
      LEFT JOIN activity a ON c.activity_id = a.id
      WHERE c.status = 'ACTIVE'
        AND c.is_private = false
    `;

    const params: any[] = [];

    if (search) {
      clubsQuery += ` AND c.name ILIKE $1`;
      params.push(`%${search}%`);
    }

    clubsQuery += ` ORDER BY c.name ASC LIMIT 100`;

    const result = await queryProduction(clubsQuery, params);

    res.json({
      success: true,
      clubs: result.rows.map(row => ({
        id: row.club_id,
        uuid: row.club_uuid,
        name: row.club_name,
        activity: row.activity
      }))
    });
  } catch (error) {
    logger.error('Error fetching clubs:', error);
    res.status(500).json({ error: 'Failed to fetch clubs', details: error.message });
  }
});

/**
 * GET /api/cs/clubs/:clubId/hosts
 * Get hosts (leaders) for a specific club from Misfits DB
 */
router.get('/clubs/:clubId/hosts', async (req: Request, res: Response) => {
  try {
    const { clubId } = req.params;

    // Query to get all hosts associated with the club
    // Hosts could be the club leader or event hosts
    const hostsQuery = `
      SELECT DISTINCT
        u.pk as user_id,
        u.id as user_uuid,
        u.name as user_name,
        u.phone_number,
        u.email,
        'leader' as host_type
      FROM club c
      JOIN "user" u ON c.leader_id = u.pk
      WHERE c.pk = $1

      UNION

      SELECT DISTINCT
        u.pk as user_id,
        u.id as user_uuid,
        u.name as user_name,
        u.phone_number,
        u.email,
        'event_host' as host_type
      FROM event e
      JOIN event_host eh ON e.pk = eh.event_id
      JOIN "user" u ON eh.user_id = u.pk
      WHERE e.club_id = $1
        AND e.state = 'CREATED'

      ORDER BY user_name ASC
      LIMIT 50
    `;

    const result = await queryProduction(hostsQuery, [clubId]);

    res.json({
      success: true,
      hosts: result.rows.map(row => ({
        id: row.user_id,
        uuid: row.user_uuid,
        name: row.user_name,
        phone: row.phone_number,
        email: row.email,
        type: row.host_type
      }))
    });
  } catch (error) {
    logger.error('Error fetching hosts:', error);
    res.status(500).json({ error: 'Failed to fetch hosts', details: error.message });
  }
});

// ============================================
// SLACK INTEGRATION
// ============================================

/**
 * GET /api/cs/slack/channels
 * Get available channel types for dropdown
 */
router.get('/slack/channels', (req: Request, res: Response) => {
  const channels = getChannelTypes();
  res.json({ success: true, channels });
});

/**
 * POST /api/cs/slack/send/:id
 * Send a ticket to a Slack channel
 */
router.post('/slack/send/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { channel_type } = req.body;

    if (!channel_type) {
      return res.status(400).json({ error: 'channel_type is required' });
    }

    const validChannels = Object.keys(SLACK_CHANNELS).filter(k => k !== 'sla_breach');
    if (!validChannels.includes(channel_type)) {
      return res.status(400).json({
        error: `Invalid channel_type. Must be one of: ${validChannels.join(', ')}`
      });
    }

    const result = await sendTicketToSlack(parseInt(id), channel_type as SlackChannelType);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({ success: true, message: 'Ticket sent to Slack', messageTs: result.messageTs });
  } catch (error) {
    logger.error('Error sending ticket to Slack:', error);
    res.status(500).json({ error: 'Failed to send ticket to Slack' });
  }
});

/**
 * POST /api/cs/slack/check-sla
 * Manually trigger SLA breach check
 */
router.post('/slack/check-sla', async (req: Request, res: Response) => {
  try {
    const result = await checkSLABreaches();
    res.json({ success: true, ...result });
  } catch (error) {
    logger.error('Error checking SLA breaches:', error);
    res.status(500).json({ error: 'Failed to check SLA breaches' });
  }
});

/**
 * POST /api/cs/slack/notify-sla/:id
 * Manually send SLA breach notification for a ticket
 */
router.post('/slack/notify-sla/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await sendSLABreachNotification(parseInt(id));

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({ success: true, message: 'SLA breach notification sent' });
  } catch (error) {
    logger.error('Error sending SLA notification:', error);
    res.status(500).json({ error: 'Failed to send SLA notification' });
  }
});

export default router;
