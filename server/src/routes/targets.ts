import { Router } from 'express';
import { Pool, Client } from 'pg';
import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from '../utils/logger';
import { query, getClient } from '../services/database';

const execAsync = promisify(exec);

const router = Router();

// Local operations database connection (for targets)
let localPool: Pool;

// SSH configuration for on-demand connections
const SSH_CONFIG = {
  keyFile: '/Users/retalplaza/Downloads/DB claude key/claude-control-key',
  sshHost: '15.207.255.212',
  sshUser: 'claude-control',
  dbHost: 'misfits.cgncbvolnhe7.ap-south-1.rds.amazonaws.com',
  dbPort: '5432',
  dbName: 'misfits',
  dbUser: 'dev',
  dbPassword: 'postgres'
};

// Initialize local database connection only
async function initializeLocalConnection() {
  if (!localPool) {
    localPool = new Pool({
      host: process.env.LOCAL_DB_HOST || 'localhost',
      port: parseInt(process.env.LOCAL_DB_PORT || '5432'),
      database: process.env.LOCAL_DB_NAME || 'misfits_ops',
      user: process.env.LOCAL_DB_USER || process.env.USER,
      password: process.env.LOCAL_DB_PASSWORD || '',
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });
  }
}

// Find available port for SSH tunnel
async function findAvailablePort(startPort = 5433): Promise<number> {
  for (let port = startPort; port < startPort + 10; port++) {
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

// Helper to query local operations database
async function queryLocal(text: string, params?: any[]) {
  await initializeLocalConnection();
  const client = await localPool.connect();
  try {
    const result = await client.query(text, params);
    return result;
  } finally {
    client.release();
  }
}

// Helper to query production database with on-demand SSH tunnel
async function queryProductionWithTunnel(text: string, params?: any[]) {
  let tunnelPort: number | null = null;
  let tunnelProcess: any = null;

  try {
    // Find available port
    tunnelPort = await findAvailablePort();

    // Establish SSH tunnel
    const sshCommand = `ssh -i "${SSH_CONFIG.keyFile}" -o StrictHostKeyChecking=no -f -N -L ${tunnelPort}:${SSH_CONFIG.dbHost}:${SSH_CONFIG.dbPort} ${SSH_CONFIG.sshUser}@${SSH_CONFIG.sshHost}`;

    logger.info(`Establishing SSH tunnel on port ${tunnelPort}...`);
    await execAsync(sshCommand);

    // Wait for tunnel to establish
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Create direct connection through tunnel
    const client = new Client({
      host: 'localhost',
      port: tunnelPort,
      database: SSH_CONFIG.dbName,
      user: SSH_CONFIG.dbUser,
      password: SSH_CONFIG.dbPassword,
      connectionTimeoutMillis: 10000
    });

    await client.connect();

    try {
      const result = await client.query(text, params);
      return result;
    } finally {
      await client.end();
    }

  } finally {
    // Clean up SSH tunnel
    if (tunnelPort) {
      try {
        await execAsync(`lsof -ti:${tunnelPort} | xargs kill`);
        logger.info(`Cleaned up SSH tunnel on port ${tunnelPort}`);
      } catch (error) {
        logger.warn(`Failed to clean up SSH tunnel on port ${tunnelPort}:`, error);
      }
    }
  }
}

// Get current metrics for all activities from production
async function getCurrentMetrics() {
  const currentMetricsQuery = `
    SELECT
      a.name as activity_name,
      a.id as activity_id,

      -- Current meetups: Events in last 7 days
      COUNT(DISTINCT CASE
        WHEN e.created_at >= CURRENT_DATE - INTERVAL '7 days'
        THEN e.pk
        ELSE NULL
      END) as current_meetups_week,

      -- Current meetups: Events in last 30 days
      COUNT(DISTINCT CASE
        WHEN e.created_at >= CURRENT_DATE - INTERVAL '30 days'
        THEN e.pk
        ELSE NULL
      END) as current_meetups_month,

      -- Total events all time
      COUNT(DISTINCT e.pk) as total_events,

      -- Active clubs count
      COUNT(DISTINCT CASE
        WHEN c.status = 'ACTIVE'
        THEN c.pk
        ELSE NULL
      END) as active_clubs_count,

      -- Revenue calculation (simplified for now - will add payment data later)
      0 as current_revenue_rupees

    FROM activity a
    LEFT JOIN club c ON a.id = c.activity_id AND c.is_private = false
    LEFT JOIN event e ON c.pk = e.club_id
    WHERE a.name IS NOT NULL
      AND a.name != 'Test'
      AND a.name != ''
    GROUP BY a.id, a.name
    HAVING COUNT(DISTINCT c.pk) > 0
    ORDER BY active_clubs_count DESC, a.name
  `;

  try {
    const result = await queryProductionWithTunnel(currentMetricsQuery);
    return result.rows;
  } catch (error) {
    logger.error('Failed to fetch current metrics from production:', error);
    return [];
  }
}

// ===== ACTIVITY-LEVEL TARGET ENDPOINTS =====

// Get all activity-level targets with current metrics
router.get('/activities', async (req, res) => {
  try {
    logger.info('Fetching activity-level scaling targets with current metrics...');

    // Get current metrics from production
    const currentMetrics = await getCurrentMetrics();

    // Get target data from local database
    const targetsQuery = `
      SELECT
        activity_name,
        activity_id,
        target_meetups_existing,
        target_revenue_existing_rupees,
        target_meetups_new,
        target_revenue_new_rupees,
        total_target_meetups,
        total_target_revenue_rupees,
        created_at,
        updated_at
      FROM activity_scaling_targets
      ORDER BY activity_name
    `;

    const targetsResult = await queryLocal(targetsQuery);
    const targets = targetsResult.rows;

    // Combine current metrics with targets
    const combined = currentMetrics.map(metric => {
      const target = targets.find(t => t.activity_name === metric.activity_name) || {};

      return {
        activity_name: metric.activity_name,
        activity_id: metric.activity_id,

        // Current metrics from production
        current_meetups_week: parseInt(metric.current_meetups_week || 0),
        current_meetups_month: parseInt(metric.current_meetups_month || 0),
        current_revenue_rupees: parseFloat(metric.current_revenue_rupees || 0),
        active_clubs_count: parseInt(metric.active_clubs_count || 0),
        total_events: parseInt(metric.total_events || 0),

        // Target data from local database
        target_meetups_existing: parseInt(target.target_meetups_existing || 0),
        target_revenue_existing_rupees: parseFloat(target.target_revenue_existing_rupees || 0),
        target_meetups_new: parseInt(target.target_meetups_new || 0),
        target_revenue_new_rupees: parseFloat(target.target_revenue_new_rupees || 0),
        total_target_meetups: parseInt(target.total_target_meetups || 0),
        total_target_revenue_rupees: parseFloat(target.total_target_revenue_rupees || 0),

        // Metadata
        targets_last_updated: target.updated_at || null
      };
    });

    res.json({
      success: true,
      activities: combined,
      summary: {
        total_activities: combined.length,
        total_active_clubs: combined.reduce((sum, a) => sum + a.active_clubs_count, 0),
        total_current_meetups: combined.reduce((sum, a) => sum + a.current_meetups_month, 0),
        total_target_meetups: combined.reduce((sum, a) => sum + a.total_target_meetups, 0),
        total_target_revenue: combined.reduce((sum, a) => sum + a.total_target_revenue_rupees, 0)
      },
      generated_at: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Failed to fetch activity targets:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch activity targets',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Update activity-level targets
router.put('/activities/:activityName', async (req, res) => {
  try {
    const activityName = decodeURIComponent(req.params.activityName);
    const {
      target_meetups_existing,
      target_revenue_existing_rupees,
      target_meetups_new,
      target_revenue_new_rupees
    } = req.body;

    logger.info(`Updating targets for activity: ${activityName}`);

    // Upsert activity targets
    const upsertQuery = `
      INSERT INTO activity_scaling_targets (
        activity_name,
        target_meetups_existing,
        target_revenue_existing_rupees,
        target_meetups_new,
        target_revenue_new_rupees,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
      ON CONFLICT (activity_name)
      DO UPDATE SET
        target_meetups_existing = $2,
        target_revenue_existing_rupees = $3,
        target_meetups_new = $4,
        target_revenue_new_rupees = $5,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `;

    const result = await queryLocal(upsertQuery, [
      activityName,
      target_meetups_existing || 0,
      target_revenue_existing_rupees || 0,
      target_meetups_new || 0,
      target_revenue_new_rupees || 0
    ]);

    res.json({
      success: true,
      activity: result.rows[0],
      message: 'Activity targets updated successfully'
    });

  } catch (error) {
    logger.error(`Failed to update activity targets for ${req.params.activityName}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to update activity targets',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// ===== CLUB-LEVEL TARGET ENDPOINTS =====

// Get detailed view for a specific activity (drill-down)
router.get('/activities/:activityName/clubs', async (req, res) => {
  try {
    const activityName = decodeURIComponent(req.params.activityName);
    logger.info(`Fetching detailed club data for activity: ${activityName}`);

    // Get existing clubs from production with current metrics
    const clubsQuery = `
      SELECT
        c.id as club_id,
        c.pk as club_pk,
        c.name as club_name,
        c.status,
        c.created_at,

        -- Current meetups: Events in last 30 days
        COUNT(DISTINCT CASE
          WHEN e.created_at >= CURRENT_DATE - INTERVAL '30 days'
          THEN e.pk
          ELSE NULL
        END) as current_meetups,

        -- Total events
        COUNT(DISTINCT e.pk) as total_events,

        -- Revenue (simplified for now)
        0 as current_revenue_rupees,

        -- Most recent city/area
        (
          SELECT ci.name
          FROM event e2
          LEFT JOIN location l2 ON e2.location_id = l2.id
          LEFT JOIN area ar2 ON l2.area_id = ar2.id
          LEFT JOIN city ci ON ar2.city_id = ci.id
          WHERE e2.club_id = c.pk
          ORDER BY e2.start_time DESC
          LIMIT 1
        ) as city_name,
        (
          SELECT ar2.name
          FROM event e2
          LEFT JOIN location l2 ON e2.location_id = l2.id
          LEFT JOIN area ar2 ON l2.area_id = ar2.id
          WHERE e2.club_id = c.pk
          ORDER BY e2.start_time DESC
          LIMIT 1
        ) as area_name

      FROM club c
      LEFT JOIN activity a ON c.activity_id = a.id
      LEFT JOIN event e ON c.pk = e.club_id
      WHERE a.name = $1
        AND c.status = 'ACTIVE'
        AND c.is_private = false
      GROUP BY c.pk, c.id, c.name, c.status, c.created_at
      ORDER BY current_meetups DESC, total_events DESC, c.name
    `;

    const clubsResult = await queryProductionWithTunnel(clubsQuery, [activityName]);

    // Get club targets from local database
    const targetQuery = `
      SELECT
        club_id,
        target_meetups,
        target_revenue_rupees,
        is_new_club,
        launch_date,
        new_club_tag_expires_at
      FROM club_scaling_targets
      WHERE activity_name = $1
    `;

    const targetsResult = await queryLocal(targetQuery, [activityName]);
    const targets = targetsResult.rows;

    // Combine clubs with their targets
    const clubsWithTargets = clubsResult.rows.map(club => {
      const target = targets.find(t => t.club_id === club.club_id) || {};

      return {
        club_id: club.club_id,
        club_pk: club.club_pk,
        club_name: club.club_name,
        status: club.status,
        city: club.city_name || 'Unknown',
        area: club.area_name || 'Unknown',

        // Current metrics
        current_meetups: parseInt(club.current_meetups || 0),
        current_revenue_rupees: parseFloat(club.current_revenue_rupees || 0),
        total_events: parseInt(club.total_events || 0),

        // Target data
        target_meetups: parseInt(target.target_meetups || 0),
        target_revenue_rupees: parseFloat(target.target_revenue_rupees || 0),

        // New club tracking
        is_new_club: target.is_new_club || false,
        launch_date: target.launch_date,
        new_club_tag_expires_at: target.new_club_tag_expires_at,

        // Calculated fields
        created_at: club.created_at,
        is_recently_created: club.created_at &&
          new Date(club.created_at) > new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), // 90 days
      };
    });

    res.json({
      success: true,
      activity_name: activityName,
      existing_clubs: clubsWithTargets,
      summary: {
        total_clubs: clubsWithTargets.length,
        new_clubs: clubsWithTargets.filter(c => c.is_new_club).length,
        total_current_meetups: clubsWithTargets.reduce((sum, c) => sum + c.current_meetups, 0),
        total_target_meetups: clubsWithTargets.reduce((sum, c) => sum + c.target_meetups, 0),
        total_target_revenue: clubsWithTargets.reduce((sum, c) => sum + c.target_revenue_rupees, 0)
      },
      generated_at: new Date().toISOString()
    });

  } catch (error) {
    logger.error(`Failed to fetch club details for ${req.params.activityName}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch club details',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Update club-level targets
router.put('/clubs/:clubId', async (req, res) => {
  try {
    const clubId = req.params.clubId;
    const {
      club_name,
      activity_name,
      target_meetups,
      target_revenue_rupees,
      is_new_club
    } = req.body;

    logger.info(`Updating targets for club: ${clubId}`);

    const upsertQuery = `
      INSERT INTO club_scaling_targets (
        club_id,
        club_name,
        activity_name,
        target_meetups,
        target_revenue_rupees,
        is_new_club,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
      ON CONFLICT (club_id)
      DO UPDATE SET
        club_name = $2,
        activity_name = $3,
        target_meetups = $4,
        target_revenue_rupees = $5,
        is_new_club = $6,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `;

    const result = await queryLocal(upsertQuery, [
      clubId,
      club_name,
      activity_name,
      target_meetups || 0,
      target_revenue_rupees || 0,
      is_new_club || false
    ]);

    res.json({
      success: true,
      club: result.rows[0],
      message: 'Club targets updated successfully'
    });

  } catch (error) {
    logger.error(`Failed to update club targets for ${req.params.clubId}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to update club targets',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// ===== NEW CLUB LAUNCH ENDPOINTS =====

// Get new club launch plans for an activity
router.get('/activities/:activityName/new-launches', async (req, res) => {
  try {
    const activityName = decodeURIComponent(req.params.activityName);

    const launchQuery = `
      SELECT *
      FROM new_club_launches
      WHERE activity_name = $1
        AND launch_status IN ('planned', 'in_progress')
      ORDER BY planned_launch_date, created_at
    `;

    const result = await queryLocal(launchQuery, [activityName]);

    res.json({
      success: true,
      activity_name: activityName,
      launch_plans: result.rows,
      summary: {
        total_planned: result.rows.length,
        total_target_meetups: result.rows.reduce((sum, l) => sum + (l.target_meetups || 0), 0),
        total_target_revenue: result.rows.reduce((sum, l) => sum + (l.target_revenue_rupees || 0), 0)
      }
    });

  } catch (error) {
    logger.error(`Failed to fetch launch plans for ${req.params.activityName}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch launch plans',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Add new club launch plan
router.post('/activities/:activityName/new-launches', async (req, res) => {
  try {
    const activityName = decodeURIComponent(req.params.activityName);
    const {
      planned_club_name,
      planned_city,
      planned_area,
      planned_launch_date,
      target_meetups,
      target_revenue_rupees
    } = req.body;

    const insertQuery = `
      INSERT INTO new_club_launches (
        activity_name,
        planned_club_name,
        planned_city,
        planned_area,
        planned_launch_date,
        target_meetups,
        target_revenue_rupees
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;

    const result = await queryLocal(insertQuery, [
      activityName,
      planned_club_name,
      planned_city,
      planned_area,
      planned_launch_date,
      target_meetups || 0,
      target_revenue_rupees || 0
    ]);

    res.json({
      success: true,
      launch_plan: result.rows[0],
      message: 'New club launch plan created successfully'
    });

  } catch (error) {
    logger.error('Failed to create launch plan:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create launch plan',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get filter options for the target management page
router.get('/filter-options', async (req, res) => {
  try {
    // Get filter data from production database (for areas, cities, activities)
    const filterQueries = {
      activities: `
        SELECT DISTINCT a.name as activity_name
        FROM activity a
        ORDER BY a.name
      `,
      areas: `
        SELECT DISTINCT a.name as area
        FROM area a
        ORDER BY a.name
      `,
      cities: `
        SELECT DISTINCT ci.name as city
        FROM city ci
        WHERE ci.is_active = true
        ORDER BY ci.name
      `,
      pocs: `
        SELECT DISTINCT 'POC 1' as poc_name
        UNION ALL
        SELECT DISTINCT 'POC 2' as poc_name
        ORDER BY poc_name
      `
    };

    // Query production data
    const [activitiesResult, areasResult, citiesResult, pocsResult] = await Promise.all([
      queryProductionWithTunnel(filterQueries.activities),
      queryProductionWithTunnel(filterQueries.areas),
      queryProductionWithTunnel(filterQueries.cities),
      queryProductionWithTunnel(filterQueries.pocs)
    ]);

    const filters = {
      activities: activitiesResult.rows.map(r => r.activity_name),
      areas: areasResult.rows.map(r => r.area),
      cities: citiesResult.rows.map(r => r.city),
      pocs: pocsResult.rows.map(r => r.poc_name),
      statuses: ['ACTIVE', 'INACTIVE']
    };

    res.json({
      success: true,
      filters
    });

  } catch (error) {
    logger.error('Failed to load filter options:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load filter options',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;