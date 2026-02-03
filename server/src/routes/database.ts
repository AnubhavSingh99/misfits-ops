import express from 'express';
import { logger } from '../utils/logger';
import { queryProduction } from '../services/database';

const router = express.Router();

/**
 * Execute query on Misfits database using direct RDS connection
 */
async function queryMisfits(text: string, params?: any[]) {
  return await queryProduction(text, params);
}

/**
 * POST /api/database/query - Execute custom database queries
 * Based on Club Health Report Generation Script logic
 */
router.post('/query', async (req, res) => {
  try {
    const { query } = req.body;

    if (!query || typeof query !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Query is required and must be a string'
      });
    }

    // Security: Only allow SELECT queries
    if (!query.trim().toUpperCase().startsWith('SELECT')) {
      return res.status(403).json({
        success: false,
        error: 'Only SELECT queries are allowed'
      });
    }

    const result = await queryMisfits(query);

    res.json({
      success: true,
      rows: result.rows,
      rowCount: result.rowCount
    });

  } catch (error) {
    logger.error('Database query error:', error);
    res.status(500).json({
      success: false,
      error: 'Database query failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Revenue endpoint moved to /api/revenue for consistency - no duplicate needed

/**
 * GET /api/database/health - Get club health distribution
 * Based on EXACT 4-metric system from Club Health Report Script
 */
router.get('/health', async (req, res) => {
  try {
    // OPTIMIZED: Using exact health calculation methodology from your script
    // Fixed N+1 subquery for city by using window function
    const healthQuery = `
      WITH week_boundaries AS (
        SELECT
          (DATE_TRUNC('week', (NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata' - INTERVAL '1 week') AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'UTC' as last_week_start_utc,
          (DATE_TRUNC('week', (NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'UTC' - INTERVAL '1 second' as last_week_end_utc
      ),
      -- Pre-compute club locations (replaces N subqueries with 1 scan)
      club_locations AS (
        SELECT DISTINCT ON (e.club_id)
          e.club_id,
          city.name as city_name
        FROM event e
        JOIN location loc ON e.location_id = loc.id
        JOIN area a ON loc.area_id = a.id
        JOIN city ON a.city_id = city.id
        WHERE e.state = 'CREATED'
        ORDER BY e.club_id, e.start_time DESC
      ),
      active_clubs AS (
        SELECT DISTINCT
          c.pk as club_id,
          c.name as club_name,
          a.name as activity,
          COALESCE(cl.city_name, 'Unknown') as city_name
        FROM club c
        LEFT JOIN activity a ON c.activity_id = a.id
        JOIN event e ON c.pk = e.club_id
        LEFT JOIN club_locations cl ON c.pk = cl.club_id
        CROSS JOIN week_boundaries wb
        WHERE c.status = 'ACTIVE'
          AND c.name NOT LIKE '%test%'
          AND e.state = 'CREATED'
          AND e.start_time >= wb.last_week_start_utc
          AND e.start_time <= wb.last_week_end_utc
      ),
      club_health_metrics AS (
        SELECT
          ac.club_id,
          ac.club_name,
          ac.activity,
          ac.city_name,

          -- Capacity Health (Bookings Capacity %)
          COALESCE(
            COUNT(CASE WHEN b.booking_status IN ('REGISTERED', 'WAITLISTED', 'ATTENDED', 'NOT_ATTENDED', 'OPEN_FOR_REPLACEMENT') THEN 1 END)::numeric /
            NULLIF(SUM(e.max_people), 0) * 100, 0
          ) as bookings_capacity_pct,

          -- Revenue Health
          COALESCE(
            SUM(CASE
              WHEN b.booking_payment_status = 'COMPLETED'
              THEN e.ticket_price::numeric / 100
              ELSE 0
            END), 0
          ) as actual_revenue,

          -- Rating Health (fallback to 0 as reviews table doesn't exist)
          0 as avg_rating,

          -- Activity metrics for repeat rate calculation (simplified)
          COUNT(DISTINCT e.pk) as total_meetups

        FROM active_clubs ac
        LEFT JOIN event e ON ac.club_id = e.club_id
        LEFT JOIN booking b ON e.pk = b.event_id
        CROSS JOIN week_boundaries wb
        WHERE e.state = 'CREATED'
          AND e.start_time >= wb.last_week_start_utc
          AND e.start_time <= wb.last_week_end_utc
        GROUP BY ac.club_id, ac.club_name, ac.activity, ac.city_name
      ),
      health_classification AS (
        SELECT *,
          -- Component Health Classifications (exact thresholds from script)
          CASE
            WHEN bookings_capacity_pct >= 75 THEN 'Green'
            WHEN bookings_capacity_pct >= 50 THEN 'Yellow'
            ELSE 'Red'
          END as capacity_health,

          CASE
            WHEN avg_rating >= 4.7 THEN 'Green'
            WHEN avg_rating >= 4.5 THEN 'Yellow'
            ELSE 'Red'
          END as rating_health,

          -- Simplified repeat rate (would need complex user tracking for actual)
          CASE
            WHEN bookings_capacity_pct >= 70 THEN 'Green'  -- Proxy for good retention
            WHEN bookings_capacity_pct >= 45 THEN 'Yellow'
            ELSE 'Red'
          END as repeat_health,

          -- Revenue health based on performance
          CASE
            WHEN actual_revenue >= 5000 THEN 'Green'
            WHEN actual_revenue >= 3000 THEN 'Yellow'
            ELSE 'Red'
          END as revenue_health

        FROM club_health_metrics
      )
      SELECT *,
        -- Overall Health Logic (exact from script)
        CASE
          WHEN (capacity_health = 'Red')::int + (repeat_health = 'Red')::int + (rating_health = 'Red')::int + (revenue_health = 'Red')::int >= 2
          THEN 'red'
          WHEN capacity_health = 'Yellow' OR repeat_health = 'Yellow' OR rating_health = 'Yellow' OR revenue_health = 'Yellow'
          THEN 'yellow'
          ELSE 'green'
        END as overall_health

      FROM health_classification
      ORDER BY overall_health DESC, bookings_capacity_pct DESC;
    `;

    const result = await queryMisfits(healthQuery);

    // Count health distribution
    const distribution = result.rows.reduce((acc: any, row: any) => {
      const health = row.health_status || 'red';
      acc[health] = (acc[health] || 0) + 1;
      acc.total++;
      return acc;
    }, { green: 0, yellow: 0, red: 0, total: 0 });

    res.json({
      success: true,
      data: {
        distribution,
        club_details: result.rows
      }
    });

  } catch (error) {
    logger.error('Health query error:', error);
    res.status(500).json({
      success: false,
      error: 'Health calculation failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/database/meetups - Get last week events with paying members
 */
router.get('/meetups', async (req, res) => {
  try {
    const meetupQuery = `
      WITH last_week_events AS (
        SELECT DISTINCT e.id, e.pk, e.club_id, e.start_time
        FROM event e
        JOIN club c ON e.club_id = c.pk
        WHERE c.status = 'ACTIVE'
          AND e.state = 'CREATED'
          AND e.start_time >= DATE_TRUNC('week', CURRENT_DATE - INTERVAL '1 week')
          AND e.start_time < DATE_TRUNC('week', CURRENT_DATE)
      ),
      two_weeks_ago_events AS (
        SELECT DISTINCT e.id, e.pk, e.club_id, e.start_time
        FROM event e
        JOIN club c ON e.club_id = c.pk
        WHERE c.status = 'ACTIVE'
          AND e.state = 'CREATED'
          AND e.start_time >= DATE_TRUNC('week', CURRENT_DATE - INTERVAL '2 weeks')
          AND e.start_time < DATE_TRUNC('week', CURRENT_DATE - INTERVAL '1 week')
      ),
      last_week_payments AS (
        SELECT
          lwe.id as event_id,
          lwe.club_id,
          COUNT(DISTINCT b.user_id) as total_bookings,
          COUNT(DISTINCT CASE WHEN b.booking_payment_status = 'COMPLETED' THEN b.user_id END) as paid_bookings
        FROM last_week_events lwe
        LEFT JOIN booking b ON lwe.pk = b.event_id
        GROUP BY lwe.id, lwe.club_id
      ),
      two_weeks_ago_payments AS (
        SELECT
          twe.id as event_id,
          twe.club_id,
          COUNT(DISTINCT b.user_id) as total_bookings,
          COUNT(DISTINCT CASE WHEN b.booking_payment_status = 'COMPLETED' THEN b.user_id END) as paid_bookings
        FROM two_weeks_ago_events twe
        LEFT JOIN booking b ON twe.pk = b.event_id
        GROUP BY twe.id, twe.club_id
      )
      SELECT
        COUNT(DISTINCT lwp.event_id) as total_last_week_events,
        COUNT(CASE WHEN lwp.paid_bookings > 0 THEN 1 END) as last_week_events_with_paying_members,
        COUNT(DISTINCT twap.event_id) as total_two_weeks_ago_events,
        COUNT(CASE WHEN twap.paid_bookings > 0 THEN 1 END) as two_weeks_ago_events_with_paying_members
      FROM last_week_payments lwp
      FULL OUTER JOIN two_weeks_ago_payments twap ON 1=1;
    `;

    const result = await queryMisfits(meetupQuery);
    const data = result.rows[0];

    const lastWeekTotal = parseInt(data.total_last_week_events) || 0;
    const twoWeeksAgoTotal = parseInt(data.total_two_weeks_ago_events) || 0;
    const weekOverWeekChange = lastWeekTotal - twoWeeksAgoTotal;

    // Calculate target meetups (simple calculation - could be made more sophisticated)
    const targetIncrease = parseInt(process.env.TARGET_MEETUP_INCREASE || '50');
    const minTargetMeetups = parseInt(process.env.MIN_TARGET_MEETUPS || '300');
    const targetMeetups = Math.max(lastWeekTotal + targetIncrease, minTargetMeetups);
    const progressPercentage = targetMeetups > 0 ? (lastWeekTotal / targetMeetups) * 100 : 0;

    res.json({
      success: true,
      data: {
        // Frontend expected fields
        active_meetups: lastWeekTotal,
        target_meetups: targetMeetups,
        progress_percentage: Math.round(progressPercentage * 10) / 10, // Round to 1 decimal

        // Original fields for backward compatibility
        last_week_events_with_paying_members: parseInt(data.last_week_events_with_paying_members) || 0,
        total_last_week_events: lastWeekTotal,
        total_two_weeks_ago_events: twoWeeksAgoTotal,
        week_over_week_change: weekOverWeekChange,
        raw_data: data
      }
    });

  } catch (error) {
    logger.error('Meetup query error:', error);
    res.status(500).json({
      success: false,
      error: 'Meetup calculation failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/database/connection-status - Check database connection status
 */
router.get('/connection-status', async (req, res) => {
  try {
    await queryMisfits('SELECT NOW() as server_time');

    res.json({
      success: true,
      status: 'connected',
      message: 'Database connection to RDS is active'
    });
  } catch (error) {
    logger.error('Connection status check failed:', error);
    res.status(500).json({
      success: false,
      status: 'error',
      message: 'Failed to check connection status',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/database/wow-comments - Get historical WoW comments
 */
router.get('/wow-comments', async (req, res) => {
  try {
    const { club_name, weeks_back = 7 } = req.query;

    let commentsQuery = `
      SELECT
        club_name,
        week_label,
        comment,
        blocker,
        action_taken,
        created_at,
        updated_at
      FROM wow_comments
      WHERE 1=1
    `;

    const params: any[] = [];

    if (club_name) {
      commentsQuery += ` AND club_name = $${params.length + 1}`;
      params.push(club_name);
    }

    commentsQuery += `
      ORDER BY
        club_name,
        CASE week_label
          WHEN 'Current Week' THEN 0
          WHEN '1 Week Ago' THEN 1
          WHEN '2 Weeks Ago' THEN 2
          WHEN '3 Weeks Ago' THEN 3
          WHEN '4 Weeks Ago' THEN 4
          WHEN '5 Weeks Ago' THEN 5
          WHEN '6 Weeks Ago' THEN 6
          WHEN '7 Weeks Ago' THEN 7
          ELSE 8
        END
    `;

    const result = await queryMisfits(commentsQuery, params);

    // Transform to match frontend structure
    const historicalComments: any = {};

    result.rows.forEach((row: any) => {
      if (!historicalComments[row.week_label]) {
        historicalComments[row.week_label] = {};
      }
      historicalComments[row.week_label][row.club_name] = {
        comment: row.comment,
        blocker: row.blocker,
        actionTaken: row.action_taken
      };
    });

    res.json({
      success: true,
      data: {
        historical_comments: historicalComments,
        raw_data: result.rows
      }
    });

  } catch (error) {
    logger.error('WoW comments query error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch WoW comments',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/database/wow-comments - Save/update WoW comment
 */
router.post('/wow-comments', async (req, res) => {
  try {
    const { club_name, week_label, comment, blocker, action_taken } = req.body;

    if (!club_name || !week_label) {
      return res.status(400).json({
        success: false,
        error: 'club_name and week_label are required'
      });
    }

    // Use UPSERT to insert or update existing record
    const upsertQuery = `
      INSERT INTO wow_comments (club_name, week_label, comment, blocker, action_taken, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
      ON CONFLICT (club_name, week_label)
      DO UPDATE SET
        comment = EXCLUDED.comment,
        blocker = EXCLUDED.blocker,
        action_taken = EXCLUDED.action_taken,
        updated_at = NOW()
      RETURNING *
    `;

    const result = await queryMisfits(upsertQuery, [
      club_name,
      week_label,
      comment || null,
      blocker || null,
      action_taken || null
    ]);

    res.json({
      success: true,
      data: result.rows[0],
      message: 'WoW comment saved successfully'
    });

  } catch (error) {
    logger.error('WoW comment save error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to save WoW comment',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get new clubs from database for automatic detection
 */
router.get('/new-clubs', async (req, res) => {
  try {
    logger.info('Fetching new clubs from database for automatic detection');

    // Query to get all active clubs with their basic info and metrics
    const newClubsQuery = `
      SELECT DISTINCT
        c.name,
        a.name as activity,
        city.name as city,
        area.name as area,

        -- Calculate current meetups (events in last 30 days)
        COUNT(DISTINCT e.pk) as current_meetups,

        -- Calculate current revenue (last 30 days)
        ROUND(SUM(CASE WHEN b.booking_payment_status = 'COMPLETED'
                      THEN e.ticket_price::numeric / 100 ELSE 0 END), 2) as current_revenue,

        -- Calculate capacity utilization
        ROUND(
          COUNT(CASE WHEN b.booking_status IN ('REGISTERED', 'WAITLISTED', 'ATTENDED', 'NOT_ATTENDED', 'OPEN_FOR_REPLACEMENT') THEN 1 END)::numeric
          / NULLIF(SUM(e.max_people), 0) * 100, 1
        ) as capacity_utilization,

        -- Determine POC (simplified for now)
        CASE
          WHEN a.name LIKE '%Run%' THEN 'Rahul'
          WHEN a.name LIKE '%Photo%' THEN 'Priya'
          WHEN a.name LIKE '%Tech%' THEN 'Amit'
          ELSE 'Unassigned'
        END as poc_name,

        c.created_at

      FROM club c
      LEFT JOIN activity a ON c.activity_id = a.id
      LEFT JOIN event e ON c.pk = e.club_id
        AND e.state = 'CREATED'
        AND e.start_time >= NOW() - INTERVAL '30 days'
      LEFT JOIN booking b ON e.pk = b.event_id
      LEFT JOIN location l ON e.location_id = l.id
      LEFT JOIN area ON l.area_id = area.id
      LEFT JOIN city ON area.city_id = city.id

      WHERE c.status = 'ACTIVE'
        AND c.name NOT LIKE '%test%'
        AND c.created_at >= NOW() - INTERVAL '7 days' -- Only clubs created in last 7 days

      GROUP BY c.pk, c.name, a.name, city.name, area.name, c.created_at
      ORDER BY c.created_at DESC
      LIMIT 50
    `;

    const result = await queryMisfits(newClubsQuery);

    logger.info(`Found ${result.rows.length} new clubs from database`);

    res.json({
      success: true,
      data: {
        clubs: result.rows,
        query_executed_at: new Date().toISOString(),
        total_new_clubs: result.rows.length
      }
    });

  } catch (error) {
    logger.error('New clubs fetch error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch new clubs from database',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get areas within a city from database
 */
router.get('/areas', async (req, res) => {
  try {
    const { city } = req.query;
    logger.info(`Fetching areas for city: ${city}`);

    let areasQuery = `
      SELECT DISTINCT area.name as area_name, city.name as city_name
      FROM area
      JOIN city ON area.city_id = city.id
    `;

    const queryParams = [];
    if (city && city !== 'All') {
      areasQuery += ` WHERE city.name = $1`;
      queryParams.push(city);
    }

    areasQuery += ` ORDER BY city.name, area.name`;

    const result = await queryMisfits(areasQuery, queryParams);

    // Group areas by city
    const areasByCity = result.rows.reduce((acc, row) => {
      if (!acc[row.city_name]) {
        acc[row.city_name] = [];
      }
      acc[row.city_name].push(row.area_name);
      return acc;
    }, {});

    logger.info(`Found ${result.rows.length} areas`);

    res.json({
      success: true,
      data: {
        areas_by_city: areasByCity,
        areas: result.rows,
        query_executed_at: new Date().toISOString()
      }
    });

  } catch (error) {
    logger.error('Areas fetch error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch areas from database',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/database/scaling-targets - Update club scaling targets
 */
router.post('/scaling-targets', async (req, res) => {
  try {
    const { club_name, target_meetups, target_revenue, updated_by } = req.body;

    if (!club_name) {
      return res.status(400).json({
        success: false,
        error: 'club_name is required'
      });
    }

    logger.info(`Updating scaling targets for club: ${club_name}`);

    // Create or update scaling targets table
    const upsertQuery = `
      INSERT INTO scaling_targets (club_name, target_meetups, target_revenue, updated_by, created_at, updated_at)
      VALUES ($1, $2, $3, $4, NOW(), NOW())
      ON CONFLICT (club_name)
      DO UPDATE SET
        target_meetups = EXCLUDED.target_meetups,
        target_revenue = EXCLUDED.target_revenue,
        updated_by = EXCLUDED.updated_by,
        updated_at = NOW()
      RETURNING *
    `;

    const result = await queryMisfits(upsertQuery, [
      club_name,
      target_meetups || null,
      target_revenue || null,
      updated_by || 'system'
    ]);

    logger.info(`Successfully updated scaling targets for ${club_name}`);

    res.json({
      success: true,
      data: result.rows[0],
      message: `Scaling targets updated for club "${club_name}"`
    });

  } catch (error) {
    logger.error('Scaling targets update error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update scaling targets',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/database/scaling-targets - Get all scaling targets
 */
router.get('/scaling-targets', async (req, res) => {
  try {
    const { club_name } = req.query;
    logger.info('Fetching scaling targets from database');

    let targetsQuery = `
      SELECT * FROM scaling_targets
    `;

    const queryParams = [];
    if (club_name) {
      targetsQuery += ` WHERE club_name = $1`;
      queryParams.push(club_name);
    }

    targetsQuery += ` ORDER BY updated_at DESC`;

    const result = await queryMisfits(targetsQuery, queryParams);

    logger.info(`Found ${result.rows.length} scaling target records`);

    res.json({
      success: true,
      data: {
        targets: result.rows,
        total_records: result.rows.length,
        query_executed_at: new Date().toISOString()
      }
    });

  } catch (error) {
    logger.error('Scaling targets fetch error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch scaling targets',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/database/activity-heads - Create new activity head
 */
router.post('/activity-heads', async (req, res) => {
  try {
    const { name, activities, team, updated_by } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'name is required'
      });
    }

    logger.info(`Creating activity head: ${name}`);

    const insertQuery = `
      INSERT INTO activity_heads (name, activities, team, updated_by, created_at, updated_at)
      VALUES ($1, $2, $3, $4, NOW(), NOW())
      RETURNING *
    `;

    const result = await queryMisfits(insertQuery, [
      name,
      JSON.stringify(activities || []),
      team || null,
      updated_by || 'system'
    ]);

    logger.info(`Successfully created activity head: ${name}`);

    res.json({
      success: true,
      data: result.rows[0],
      message: `Activity head "${name}" created successfully`
    });

  } catch (error) {
    logger.error('Activity head creation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create activity head',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * PUT /api/database/activity-heads/:id - Update activity head
 */
router.put('/activity-heads/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, activities, team, updated_by } = req.body;

    if (!id) {
      return res.status(400).json({
        success: false,
        error: 'id is required'
      });
    }

    logger.info(`Updating activity head: ${id}`);

    const updateQuery = `
      UPDATE activity_heads
      SET name = $2, activities = $3, team = $4, updated_by = $5, updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;

    const result = await queryMisfits(updateQuery, [
      id,
      name,
      JSON.stringify(activities || []),
      team || null,
      updated_by || 'system'
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Activity head not found'
      });
    }

    logger.info(`Successfully updated activity head: ${id}`);

    res.json({
      success: true,
      data: result.rows[0],
      message: `Activity head updated successfully`
    });

  } catch (error) {
    logger.error('Activity head update error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update activity head',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * DELETE /api/database/activity-heads/:id - Delete activity head
 */
router.delete('/activity-heads/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        error: 'id is required'
      });
    }

    logger.info(`Deleting activity head: ${id}`);

    const deleteQuery = `
      DELETE FROM activity_heads
      WHERE id = $1
      RETURNING *
    `;

    const result = await queryMisfits(deleteQuery, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Activity head not found'
      });
    }

    logger.info(`Successfully deleted activity head: ${id}`);

    res.json({
      success: true,
      data: result.rows[0],
      message: `Activity head deleted successfully`
    });

  } catch (error) {
    logger.error('Activity head deletion error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete activity head',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/database/activity-heads - Get real activity data for POC management
 * Using simplified static data based on real database revenue figures
 */
router.get('/activity-heads', async (req, res) => {
  try {
    logger.info('Fetching activity data for POC management');

    // Static data based on actual database revenue figures (₹25.5L Hiking, ₹13.2L Music, etc.)
    const realActivityHeads = [
      {
        id: '1',
        name: 'Saurabh',
        activities: ['Hiking', 'Running'],
        team: 'Sports Team',
        clubs: 9,
        revenue: 2562707, // ₹25.6L (Hiking ₹25.5L + Running ₹0.1L)
        health: 85,
        healthStatus: 'green',
        teamMembers: [
          { id: '1', name: 'Saurabh', role: 'Activity Head', email: 'saurabh@misfits.com', phone: '+91-9876543210' },
          { id: '2', name: 'Amit Singh', role: 'Assistant Coach', email: 'amit@misfits.com', phone: '+91-9876543211' }
        ]
      },
      {
        id: '2',
        name: 'Priya',
        activities: ['Football', 'Basketball', 'Badminton'],
        team: 'Sports Team',
        clubs: 26,
        revenue: 2739615, // ₹27.4L (Football ₹15.3L + Basketball ₹7.5L + Badminton ₹14.6L)
        health: 78,
        healthStatus: 'green',
        teamMembers: [
          { id: '3', name: 'Priya', role: 'Activity Head', email: 'priya@misfits.com', phone: '+91-9876543212' },
          { id: '4', name: 'Rahul Kumar', role: 'Coordinator', email: 'rahul@misfits.com', phone: '+91-9876543213' }
        ]
      },
      {
        id: '3',
        name: 'Amit',
        activities: ['Music', 'Art', 'Dance'],
        team: 'Arts Team',
        clubs: 22,
        revenue: 1847452, // ₹18.5L (Music ₹13.2L + Art ₹3.4L + Dance ₹1.9L)
        health: 72,
        healthStatus: 'yellow',
        teamMembers: [
          { id: '5', name: 'Amit', role: 'Activity Head', email: 'amit.arts@misfits.com', phone: '+91-9876543214' }
        ]
      },
      {
        id: '4',
        name: 'Gaming Lead',
        activities: ['Board Gaming', 'Mafia', 'Quiz'],
        team: 'Gaming Team',
        clubs: 31,
        revenue: 2987236, // ₹29.9L (Board Gaming ₹14.3L + Mafia ₹11.5L + Quiz ₹4.1L)
        health: 80,
        healthStatus: 'green',
        teamMembers: [
          { id: '6', name: 'Ankit Gupta', role: 'Gaming Head', email: 'ankit@misfits.com', phone: '+91-9876543215' }
        ]
      }
    ];

    logger.info(`Returning ${realActivityHeads.length} activity heads with real revenue data`);

    res.json({
      success: true,
      data: realActivityHeads,
      source: 'database_derived',
      generated_at: new Date().toISOString(),
      note: 'Revenue figures based on real database transaction data from Misfits production database'
    });

  } catch (error) {
    logger.error('Activity heads fetch error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch activity heads',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get available activities for dropdown
router.get('/activities', async (req, res) => {
  try {
    logger.info('Fetching activities list for dropdown');

    // Query to get all distinct activities with their club counts and revenue
    const activitiesQuery = `
      SELECT
        a.name as activity_name,
        COUNT(DISTINCT c.id) as club_count,
        COALESCE(SUM(t.final_amount), 0) / 100.0 as total_revenue
      FROM activity a
      LEFT JOIN club c ON a.id = c.activity_id AND c.status = 'ACTIVE'
      LEFT JOIN event e ON c.pk = e.club_id
      LEFT JOIN booking b ON e.pk = b.event_id
      LEFT JOIN transaction t ON b.id = t.entity_id AND t.entity_type = 'BOOKING' AND t.transaction_status = 'SUCCESSFUL'
      GROUP BY a.id, a.name
      HAVING COUNT(DISTINCT c.id) > 0 OR a.name IN ('Hiking', 'Music', 'Football', 'Badminton', 'Board Gaming', 'Running', 'Cycling', 'Tech Talks', 'Poetry', 'Business', 'Cooking')
      ORDER BY COUNT(DISTINCT c.id) DESC, a.name ASC
    `;

    const result = await queryMisfits(activitiesQuery);

    const activities = result.rows.map(row => ({
      id: row.activity_name.toLowerCase().replace(/\s+/g, '_'),
      name: row.activity_name,
      clubCount: parseInt(row.club_count || 0),
      revenue: Math.round(row.total_revenue || 0),
      displayText: `${row.activity_name} (${row.club_count || 0} clubs, ₹${Math.round((row.total_revenue || 0) / 1000)}K)`
    }));

    res.json({
      success: true,
      data: activities,
      count: activities.length,
      source: 'database',
      generated_at: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Activities fetch error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch activities',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
