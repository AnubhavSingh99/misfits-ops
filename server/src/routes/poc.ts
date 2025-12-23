import express from 'express';
import { query } from '../services/database';
import { logger } from '../utils/logger';

const router = express.Router();


// GET /api/poc/list - Get all POCs with assignment data
router.get('/list', async (req, res) => {
  try {
    const pocs = await query(`
      SELECT
        p.*,
        COUNT(DISTINCT pa.club_id) as club_count,
        COALESCE(AVG(
          CASE
            WHEN c.health_status = 'green' THEN 100
            WHEN c.health_status = 'yellow' THEN 60
            WHEN c.health_status = 'red' THEN 20
            ELSE 50
          END
        ), 50) as health_score
      FROM poc_structure p
      LEFT JOIN poc_assignments pa ON p.id = pa.poc_id AND pa.unassigned_at IS NULL
      LEFT JOIN clubs c ON pa.club_id = c.id
      WHERE p.is_active = true
      GROUP BY p.id, p.name, p.poc_type, p.activities, p.cities, p.team_name
      ORDER BY p.name
    `);

    res.json(pocs.rows);
  } catch (error) {
    logger.error('Failed to fetch POCs from database:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch POCs',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// GET /api/poc/:pocId/meetups - Get meetups for specific POC (Your Music example)
router.get('/:pocId/meetups', async (req, res) => {
  try {
    const { pocId } = req.params;
    const { activity, city, health, stage, search } = req.query;

    let whereConditions = ['(m.activity_head_id = $1 OR m.city_head_id = $1)'];
    let queryParams = [pocId];
    let paramIndex = 2;

    // Add filters
    if (activity && activity !== 'All') {
      whereConditions.push(`m.activity = $${paramIndex}`);
      queryParams.push(activity);
      paramIndex++;
    }

    if (city && city !== 'All') {
      whereConditions.push(`m.city = $${paramIndex}`);
      queryParams.push(city);
      paramIndex++;
    }

    if (health && health !== 'All') {
      whereConditions.push(`m.health_status = $${paramIndex}`);
      queryParams.push(health);
      paramIndex++;
    }

    if (stage && stage !== 'All') {
      whereConditions.push(`m.current_stage = $${paramIndex}`);
      queryParams.push(stage);
      paramIndex++;
    }

    if (search) {
      whereConditions.push(`(m.name ILIKE $${paramIndex} OR m.meetup_series_id ILIKE $${paramIndex})`);
      queryParams.push(`%${search}%`);
      paramIndex++;
    }

    const meetupsQuery = `
      SELECT
        m.*,
        c.name as club_name,
        p_activity.name as activity_head_name,
        p_city.name as city_head_name,
        -- Real-time calculations
        CASE
          WHEN m.health_status = 'GREEN' THEN '🟢'
          WHEN m.health_status = 'YELLOW' THEN '🟡'
          WHEN m.health_status = 'RED' THEN '🔴'
          ELSE '⚪'
        END as health_emoji,
        -- Revenue percentage
        ROUND((m.actual_revenue / NULLIF(m.expected_revenue, 0) * 100), 1) as revenue_percentage
      FROM meetups m
      LEFT JOIN club c ON m.club_id = c.pk
      LEFT JOIN poc_structure p_activity ON m.activity_head_id = p_activity.id
      LEFT JOIN poc_structure p_city ON m.city_head_id = p_city.id
      WHERE ${whereConditions.join(' AND ')}
      ORDER BY
        CASE m.health_status
          WHEN 'RED' THEN 1
          WHEN 'YELLOW' THEN 2
          WHEN 'GREEN' THEN 3
          ELSE 4
        END,
        m.updated_at DESC
    `;

    const meetups = await query(meetupsQuery, queryParams);

    res.json({
      pocId,
      totalMeetups: meetups.rows.length,
      meetups: meetups.rows
    });

  } catch (error) {
    logger.error('Failed to fetch POC meetups:', error);
    res.status(500).json({ error: 'Failed to fetch POC meetups' });
  }
});

// POST /api/poc/assign - Assign meetups to POC (Dynamic allocation)
router.post('/assign', async (req, res) => {
  try {
    const { meetupIds, pocId, assignmentType, reason, assignedBy } = req.body;

    // Validate inputs
    if (!meetupIds || !pocId || !assignmentType || !assignedBy) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Start transaction
    await query('BEGIN');

    for (const meetupId of meetupIds) {
      // Update meetup assignment
      if (assignmentType === 'activity_head') {
        await query(`
          UPDATE meetups
          SET activity_head_id = $1, updated_at = CURRENT_TIMESTAMP
          WHERE id = $2
        `, [pocId, meetupId]);
      } else if (assignmentType === 'city_head') {
        await query(`
          UPDATE meetups
          SET city_head_id = $1, updated_at = CURRENT_TIMESTAMP
          WHERE id = $2
        `, [pocId, meetupId]);
      }

      // Record assignment history
      await query(`
        INSERT INTO poc_assignments (meetup_id, poc_id, assignment_type, assigned_by, reason)
        VALUES ($1, $2, $3, $4, $5)
      `, [meetupId, pocId, assignmentType, assignedBy, reason]);

      // Unassign previous POC if exists
      await query(`
        UPDATE poc_assignments
        SET unassigned_at = CURRENT_TIMESTAMP
        WHERE meetup_id = $1 AND assignment_type = $2 AND unassigned_at IS NULL AND poc_id != $3
      `, [meetupId, assignmentType, pocId]);
    }

    await query('COMMIT');

    logger.info(`Assigned ${meetupIds.length} meetups to POC ${pocId} by ${assignedBy}`);

    res.json({
      success: true,
      message: `Successfully assigned ${meetupIds.length} meetups`,
      assignedMeetups: meetupIds.length
    });

  } catch (error) {
    await query('ROLLBACK');
    logger.error('Failed to assign POC:', error);
    res.status(500).json({ error: 'Failed to assign POC' });
  }
});

// GET /api/poc/performance - Real-time performance metrics
router.get('/performance', async (req, res) => {
  try {
    const { pocId, period = '30' } = req.query;

    let whereClause = '';
    let queryParams = [period];

    if (pocId) {
      whereClause = 'AND (m.activity_head_id = $2 OR m.city_head_id = $2)';
      queryParams.push(pocId);
    }

    const performance = await query(`
      SELECT
        p.id,
        p.name,
        p.poc_type,
        p.team_name,
        COUNT(DISTINCT m.id) as total_meetups,
        SUM(m.actual_revenue) as total_revenue,
        SUM(m.expected_revenue) as target_revenue,
        ROUND(AVG(
          CASE
            WHEN m.health_status = 'GREEN' THEN 100
            WHEN m.health_status = 'YELLOW' THEN 60
            WHEN m.health_status = 'RED' THEN 20
            ELSE 0
          END
        )) as avg_health_score,
        COUNT(CASE WHEN m.health_status = 'GREEN' THEN 1 END) as healthy_meetups,
        COUNT(CASE WHEN m.health_status = 'YELLOW' THEN 1 END) as warning_meetups,
        COUNT(CASE WHEN m.health_status = 'RED' THEN 1 END) as critical_meetups
      FROM poc_structure p
      LEFT JOIN meetups m ON (
        (p.poc_type = 'activity_head' AND m.activity_head_id = p.id)
        OR
        (p.poc_type = 'city_head' AND m.city_head_id = p.id)
      )
      WHERE p.is_active = true
        AND m.updated_at >= CURRENT_DATE - INTERVAL '$1 days'
        ${whereClause}
      GROUP BY p.id, p.name, p.poc_type, p.team_name
      ORDER BY total_revenue DESC
    `, queryParams);

    res.json(performance.rows);

  } catch (error) {
    logger.error('Failed to fetch POC performance:', error);
    res.status(500).json({ error: 'Failed to fetch POC performance' });
  }
});

// Example API for your Music scenario
// GET /api/poc/saurabh/music - Get Saurabh's music meetups specifically
router.get('/saurabh/music', async (req, res) => {
  try {
    // This demonstrates the exact filtering you mentioned
    const musicMeetups = await query(`
      SELECT
        m.*,
        c.name as club_name,
        CASE m.health_status
          WHEN 'GREEN' THEN '🟢'
          WHEN 'YELLOW' THEN '🟡'
          WHEN 'RED' THEN '🔴'
          ELSE '⚪'
        END as health_display,
        ROUND(m.actual_revenue, 2) as revenue,
        m.expected_revenue as target_revenue,
        ROUND((m.actual_revenue / NULLIF(m.expected_revenue, 0) * 100), 1) as achievement_percentage
      FROM meetups m
      LEFT JOIN club c ON m.club_id = c.pk
      JOIN poc_structure p ON m.activity_head_id = p.id
      WHERE p.name = 'Saurabh'
        AND m.activity = 'Music'
        AND p.poc_type = 'activity_head'
      ORDER BY
        CASE m.health_status
          WHEN 'RED' THEN 1    -- Critical first
          WHEN 'YELLOW' THEN 2 -- Warning next
          WHEN 'GREEN' THEN 3  -- Healthy last
          ELSE 4
        END,
        m.updated_at DESC
    `);

    const summary = await query(`
      SELECT
        COUNT(*) as total_music_meetups,
        SUM(m.actual_revenue) as total_revenue,
        SUM(m.expected_revenue) as target_revenue,
        ROUND(AVG(m.capacity_utilization), 1) as avg_capacity,
        COUNT(CASE WHEN m.health_status = 'GREEN' THEN 1 END) as healthy_count,
        COUNT(CASE WHEN m.health_status = 'YELLOW' THEN 1 END) as warning_count,
        COUNT(CASE WHEN m.health_status = 'RED' THEN 1 END) as critical_count
      FROM meetups m
      JOIN poc_structure p ON m.activity_head_id = p.id
      WHERE p.name = 'Saurabh'
        AND m.activity = 'Music'
        AND p.poc_type = 'activity_head'
    `);

    res.json({
      poc: 'Saurabh',
      activity: 'Music',
      summary: summary.rows[0],
      meetups: musicMeetups.rows,
      lastUpdated: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Failed to fetch Saurabh music data:', error);
    res.status(500).json({ error: 'Failed to fetch music data' });
  }
});

// POST /api/poc - Create new POC
router.post('/', async (req, res) => {
  try {
    const { name, poc_type, activities = [], cities = [], team_name, email, phone, user_id } = req.body;

    if (!name || !poc_type) {
      return res.status(400).json({ error: 'Name and poc_type are required' });
    }

    if (!['activity_head', 'city_head'].includes(poc_type)) {
      return res.status(400).json({ error: 'poc_type must be activity_head or city_head' });
    }

    const result = await query(`
      INSERT INTO poc_structure (name, poc_type, activities, cities, team_name, email, phone, user_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [name, poc_type, activities, cities, team_name, email, phone, user_id]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    logger.error('Failed to create POC:', error);
    res.status(500).json({ error: 'Failed to create POC' });
  }
});

// PUT /api/poc/:id - Update POC
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, poc_type, activities = [], cities = [], team_name, email, phone, is_active } = req.body;

    const result = await query(`
      UPDATE poc_structure
      SET name = COALESCE($1, name),
          poc_type = COALESCE($2, poc_type),
          activities = COALESCE($3, activities),
          cities = COALESCE($4, cities),
          team_name = COALESCE($5, team_name),
          email = COALESCE($6, email),
          phone = COALESCE($7, phone),
          is_active = COALESCE($8, is_active),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $9
      RETURNING *
    `, [name, poc_type, activities, cities, team_name, email, phone, is_active, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'POC not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Failed to update POC:', error);
    res.status(500).json({ error: 'Failed to update POC' });
  }
});

export default router;