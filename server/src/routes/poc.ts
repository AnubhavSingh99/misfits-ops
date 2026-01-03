import express from 'express';
import { queryLocal, queryProduction } from '../services/database';
import { logger } from '../utils/logger';

const router = express.Router();

// Use queryLocal as the main query function for POC operations
const query = queryLocal;


// GET /api/poc/list - Get all POCs with assignment data and team members
router.get('/list', async (req, res) => {
  try {
    const pocs = await queryLocal(`
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
      GROUP BY p.id, p.name, p.poc_type, p.activities, p.cities, p.team_name, p.team_members, p.display_in_activity_heads
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
    const {
      name,
      poc_type,
      activities = [],
      cities = [],
      team_name,
      email,
      phone,
      is_active,
      team_members = [],
      display_in_activity_heads
    } = req.body;

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
          team_members = COALESCE($9, team_members),
          display_in_activity_heads = COALESCE($10, display_in_activity_heads),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $11
      RETURNING *
    `, [name, poc_type, activities, cities, team_name, email, phone, is_active, JSON.stringify(team_members), display_in_activity_heads, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'POC not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Failed to update POC:', error);
    res.status(500).json({ error: 'Failed to update POC' });
  }
});

// DELETE /api/poc/:id/activity-head - Remove Activity Head role (but keep POC)
router.delete('/:id/activity-head', async (req, res) => {
  try {
    const { id } = req.params;

    // First check if POC exists and is an activity head
    const checkResult = await query(`
      SELECT id, name, poc_type, display_in_activity_heads
      FROM poc_structure
      WHERE id = $1 AND poc_type = 'activity_head'
    `, [id]);

    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Activity Head not found'
      });
    }

    // Remove from activity heads display and clear activities (but keep the POC)
    const result = await query(`
      UPDATE poc_structure
      SET display_in_activity_heads = false,
          activities = '{}',
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `, [id]);

    logger.info(`Activity Head role removed: ${checkResult.rows[0].name} (ID: ${id}) - POC retained`);

    res.json({
      success: true,
      message: `"${checkResult.rows[0].name}" removed from Activity Heads but POC retained`,
      updatedPOC: result.rows[0]
    });
  } catch (error) {
    logger.error('Failed to remove Activity Head role:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to remove Activity Head role'
    });
  }
});

// DELETE /api/poc/:id - Delete POC
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // First check if POC exists
    const checkResult = await query(`
      SELECT id, name FROM poc_structure WHERE id = $1
    `, [id]);

    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'POC not found'
      });
    }

    // Delete the POC
    const result = await query(`
      DELETE FROM poc_structure WHERE id = $1 RETURNING *
    `, [id]);

    logger.info(`POC deleted: ${checkResult.rows[0].name} (ID: ${id})`);

    res.json({
      success: true,
      message: `POC "${checkResult.rows[0].name}" deleted successfully`,
      deletedPOC: result.rows[0]
    });
  } catch (error) {
    logger.error('Failed to delete POC:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete POC'
    });
  }
});

// GET /api/poc/activity-heads - Get all activity heads for Activity Heads section
router.get('/activity-heads', async (req, res) => {
  try {
    const activityHeads = await query(`
      SELECT
        id,
        name,
        team_name,
        activities,
        cities,
        email,
        phone,
        is_active,
        created_at
      FROM poc_structure
      WHERE poc_type = 'activity_head' AND is_active = true AND display_in_activity_heads = true
      ORDER BY name
    `);

    res.json({
      success: true,
      activity_heads: activityHeads.rows
    });
  } catch (error) {
    logger.error('Failed to fetch activity heads:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch activity heads'
    });
  }
});

// GET /api/poc/teams - Get all unique team names for dropdown
router.get('/teams', async (req, res) => {
  try {
    const teams = await query(`
      SELECT DISTINCT team_name
      FROM poc_structure
      WHERE team_name IS NOT NULL AND team_name != '' AND is_active = true
      ORDER BY team_name
    `);

    res.json({
      success: true,
      teams: teams.rows.map(row => row.team_name)
    });
  } catch (error) {
    logger.error('Failed to fetch teams:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch teams'
    });
  }
});

// POST /api/poc/activity-head - Create activity head (maps to POC creation)
router.post('/activity-head', async (req, res) => {
  try {
    const { name, team, activities } = req.body;

    if (!name || !team) {
      return res.status(400).json({
        success: false,
        error: 'Name and team are required'
      });
    }

    // Create as activity head POC with display flag set to true
    const result = await query(`
      INSERT INTO poc_structure (name, poc_type, activities, team_name, display_in_activity_heads)
      VALUES ($1, 'activity_head', $2, $3, true)
      RETURNING *
    `, [name, activities || [], team]);

    res.status(201).json({
      success: true,
      activity_head: result.rows[0]
    });
  } catch (error) {
    logger.error('Failed to create activity head:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create activity head'
    });
  }
});

// POST /api/poc/:pocId/team-members - Add team member to POC
router.post('/:pocId/team-members', async (req, res) => {
  try {
    const { pocId } = req.params;
    const { name, role, email, phone } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'Name is required'
      });
    }

    // Get current team members
    const pocResult = await query(`
      SELECT team_members FROM poc_structure WHERE id = $1
    `, [pocId]);

    if (pocResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'POC not found'
      });
    }

    const currentTeamMembers = pocResult.rows[0].team_members || [];
    const newTeamMember = {
      id: Date.now().toString(),
      name,
      role: role || '',
      email: email || '',
      phone: phone || ''
    };

    const updatedTeamMembers = [...currentTeamMembers, newTeamMember];

    // Update POC with new team member
    await query(`
      UPDATE poc_structure
      SET team_members = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
    `, [JSON.stringify(updatedTeamMembers), pocId]);

    res.status(201).json({
      success: true,
      message: 'Team member added successfully',
      team_member: newTeamMember
    });
  } catch (error) {
    logger.error('Failed to add team member:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to add team member'
    });
  }
});

// DELETE /api/poc/:pocId/team-members/:memberId - Remove team member
router.delete('/:pocId/team-members/:memberId', async (req, res) => {
  try {
    const { pocId, memberId } = req.params;

    // Get current team members
    const pocResult = await query(`
      SELECT team_members FROM poc_structure WHERE id = $1
    `, [pocId]);

    if (pocResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'POC not found'
      });
    }

    const currentTeamMembers = pocResult.rows[0].team_members || [];
    const updatedTeamMembers = currentTeamMembers.filter((member: any) => member.id !== memberId);

    if (currentTeamMembers.length === updatedTeamMembers.length) {
      return res.status(404).json({
        success: false,
        error: 'Team member not found'
      });
    }

    // Update POC with team member removed
    await query(`
      UPDATE poc_structure
      SET team_members = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
    `, [JSON.stringify(updatedTeamMembers), pocId]);

    res.json({
      success: true,
      message: 'Team member removed successfully'
    });
  } catch (error) {
    logger.error('Failed to remove team member:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to remove team member'
    });
  }
});

// Activity Categorization endpoints

// Get all activity categorizations
router.get('/activity-categories', async (req, res) => {
  try {
    const result = await queryLocal(`
      SELECT activity_name, category
      FROM activity_categorizations
      ORDER BY activity_name
    `);

    const categorizations = {
      scale: [],
      long_tail: []
    };

    result.rows.forEach(row => {
      categorizations[row.category].push(row.activity_name);
    });

    res.json({
      success: true,
      categorizations
    });
  } catch (error) {
    logger.error('Failed to get activity categorizations:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get activity categorizations'
    });
  }
});

// Update activity categorization
router.put('/activity-categories/:activityName', async (req, res) => {
  try {
    const { activityName } = req.params;
    const { category } = req.body;

    if (!category || !['scale', 'long_tail'].includes(category)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid category. Must be "scale" or "long_tail"'
      });
    }

    if (!activityName) {
      return res.status(400).json({
        success: false,
        error: 'Activity name is required'
      });
    }

    // Use INSERT ... ON CONFLICT to update existing or insert new
    await queryLocal(`
      INSERT INTO activity_categorizations (activity_name, category, updated_at)
      VALUES ($1, $2, CURRENT_TIMESTAMP)
      ON CONFLICT (activity_name)
      DO UPDATE SET
        category = EXCLUDED.category,
        updated_at = CURRENT_TIMESTAMP
    `, [activityName, category]);

    res.json({
      success: true,
      message: `Activity "${activityName}" categorized as "${category}"`,
      activity: activityName,
      category
    });
  } catch (error) {
    logger.error('Failed to update activity categorization:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update activity categorization'
    });
  }
});

// Delete activity categorization
router.delete('/activity-categories/:activityName', async (req, res) => {
  try {
    const { activityName } = req.params;

    if (!activityName) {
      return res.status(400).json({
        success: false,
        error: 'Activity name is required'
      });
    }

    const result = await queryLocal(`
      DELETE FROM activity_categorizations
      WHERE activity_name = $1
      RETURNING activity_name, category
    `, [activityName]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Activity categorization not found'
      });
    }

    res.json({
      success: true,
      message: `Activity "${activityName}" categorization deleted`,
      deleted: result.rows[0]
    });
  } catch (error) {
    logger.error('Failed to delete activity categorization:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete activity categorization'
    });
  }
});

export default router;