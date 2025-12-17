import express from 'express';
import { query } from '../services/database';
import { logger } from '../utils/logger';

const router = express.Router();

// TEST ENDPOINT: Simulate your Music POC scenario
router.post('/music-poc-scenario', async (req, res) => {
  try {
    logger.info('🎵 Starting Music POC scenario test...');

    // Step 1: Create Saurabh as Music Activity Head
    const saurabh = await query(`
      INSERT INTO poc_structure (name, poc_type, activities, team_name, team_role)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (name, poc_type) DO UPDATE SET
        activities = $3,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `, ['Saurabh', 'activity_head', ['Music'], 'Phoenix', 'Leader']);

    logger.info(`✅ Saurabh created as Music Activity Head: ID ${saurabh.rows[0].id}`);

    // Step 2: Create sample Music meetups across cities
    const musicMeetups = [
      {
        series_id: 'MUM-MUS-001',
        name: 'Mumbai Music Jam #1',
        city: 'Mumbai',
        area: 'Bandra',
        price: 1500,
        capacity: 25,
        frequency: 'weekly',
        meetups_per_month: 4
      },
      {
        series_id: 'MUM-MUS-002',
        name: 'Mumbai Music Jam #2',
        city: 'Mumbai',
        area: 'Andheri',
        price: 1200,
        capacity: 20,
        frequency: 'weekly',
        meetups_per_month: 4
      },
      {
        series_id: 'DEL-MUS-001',
        name: 'Delhi Music Sessions #1',
        city: 'Delhi',
        area: 'CP',
        price: 1000,
        capacity: 30,
        frequency: 'biweekly',
        meetups_per_month: 2
      },
      {
        series_id: 'BLR-MUS-001',
        name: 'Bangalore Music Meetup #1',
        city: 'Bangalore',
        area: 'Koramangala',
        price: 800,
        capacity: 15,
        frequency: 'weekly',
        meetups_per_month: 4
      }
    ];

    const createdMeetups = [];

    for (const meetup of musicMeetups) {
      const result = await query(`
        INSERT INTO meetups (
          meetup_series_id, activity, city, area, name,
          price_per_meetup, capacity, frequency, meetups_per_month,
          activity_head_id, current_stage, health_status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (meetup_series_id) DO UPDATE SET
          activity_head_id = $10,
          updated_at = CURRENT_TIMESTAMP
        RETURNING *
      `, [
        meetup.series_id, 'Music', meetup.city, meetup.area, meetup.name,
        meetup.price, meetup.capacity, meetup.frequency, meetup.meetups_per_month,
        saurabh.rows[0].id, 'stage_1', 'GREEN'
      ]);

      createdMeetups.push(result.rows[0]);
    }

    logger.info(`✅ Created ${createdMeetups.length} Music meetups for Saurabh`);

    // Step 3: Add some realistic metrics to make it interesting
    for (const meetup of createdMeetups) {
      // Simulate different health statuses
      let health = 'GREEN';
      let capacity_util = 0.8;
      let repeat_rate = 0.7;
      let rating = 4.8;
      let revenue_achievement = 1.1;

      // Make some meetups have issues for testing
      if (meetup.meetup_series_id === 'DEL-MUS-001') {
        health = 'YELLOW';
        capacity_util = 0.6;
        repeat_rate = 0.5;
        rating = 4.3;
        revenue_achievement = 0.8;
      } else if (meetup.meetup_series_id === 'BLR-MUS-001') {
        health = 'RED';
        capacity_util = 0.4;
        repeat_rate = 0.3;
        rating = 4.1;
        revenue_achievement = 0.6;
      }

      await query(`
        UPDATE meetups
        SET
          health_status = $1,
          capacity_utilization = $2,
          repeat_rate = $3,
          average_rating = $4,
          revenue_achievement = $5,
          actual_revenue = $6
        WHERE id = $7
      `, [
        health, capacity_util, repeat_rate, rating, revenue_achievement,
        meetup.expected_revenue * revenue_achievement,
        meetup.id
      ]);
    }

    logger.info(`✅ Added realistic health metrics to meetups`);

    // Step 4: Test the filtering
    const saurabh_music_data = await query(`
      SELECT
        m.*,
        CASE m.health_status
          WHEN 'GREEN' THEN '🟢'
          WHEN 'YELLOW' THEN '🟡'
          WHEN 'RED' THEN '🔴'
          ELSE '⚪'
        END as health_emoji,
        p.name as poc_name
      FROM meetups m
      JOIN poc_structure p ON m.activity_head_id = p.id
      WHERE p.name = 'Saurabh' AND m.activity = 'Music'
      ORDER BY
        CASE m.health_status
          WHEN 'RED' THEN 1
          WHEN 'YELLOW' THEN 2
          WHEN 'GREEN' THEN 3
          ELSE 4
        END
    `);

    // Calculate summary
    const summary = await query(`
      SELECT
        COUNT(*) as total_meetups,
        SUM(m.actual_revenue) as total_revenue,
        SUM(m.expected_revenue) as target_revenue,
        AVG(m.capacity_utilization) as avg_capacity,
        COUNT(CASE WHEN m.health_status = 'GREEN' THEN 1 END) as green_count,
        COUNT(CASE WHEN m.health_status = 'YELLOW' THEN 1 END) as yellow_count,
        COUNT(CASE WHEN m.health_status = 'RED' THEN 1 END) as red_count
      FROM meetups m
      JOIN poc_structure p ON m.activity_head_id = p.id
      WHERE p.name = 'Saurabh' AND m.activity = 'Music'
    `);

    const result = {
      success: true,
      message: '🎵 Music POC scenario created successfully!',
      scenario: {
        poc: {
          name: 'Saurabh',
          role: 'Music Activity Head',
          team: 'Phoenix',
          id: saurabh.rows[0].id
        },
        summary: summary.rows[0],
        meetups: saurabh_music_data.rows
      },
      test_instructions: {
        frontend_filter: 'Select "Saurabh - Music" from the "View As" dropdown',
        expected_result: 'Should show only Saurabh\'s Music meetups with health indicators',
        database_query: 'Data is filtered at database level based on POC assignment',
        real_time: 'Changes to health/revenue will update instantly via WebSocket'
      }
    };

    logger.info('🎵 Music POC scenario completed successfully!');
    res.json(result);

  } catch (error) {
    logger.error('Failed to create Music POC scenario:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create scenario',
      details: error.message
    });
  }
});

// TEST ENDPOINT: Simulate POC reassignment
router.post('/reassign-music-meetup', async (req, res) => {
  try {
    const { meetupSeriesId, newPOCName } = req.body;

    // Get new POC
    const newPOC = await query(`
      SELECT id FROM poc_structure
      WHERE name = $1 AND poc_type = 'activity_head'
    `, [newPOCName]);

    if (newPOC.rows.length === 0) {
      return res.status(404).json({ error: 'POC not found' });
    }

    // Get old POC and meetup
    const oldData = await query(`
      SELECT m.id, m.activity_head_id, p.name as old_poc_name
      FROM meetups m
      JOIN poc_structure p ON m.activity_head_id = p.id
      WHERE m.meetup_series_id = $1
    `, [meetupSeriesId]);

    if (oldData.rows.length === 0) {
      return res.status(404).json({ error: 'Meetup not found' });
    }

    // Reassign
    await query(`
      UPDATE meetups
      SET activity_head_id = $1, updated_at = CURRENT_TIMESTAMP
      WHERE meetup_series_id = $2
    `, [newPOC.rows[0].id, meetupSeriesId]);

    // Record assignment history
    await query(`
      INSERT INTO poc_assignments (meetup_id, poc_id, assignment_type, assigned_by, reason)
      VALUES ($1, $2, 'activity_head', 'Test Admin', 'API Test Reassignment')
    `, [oldData.rows[0].id, newPOC.rows[0].id]);

    logger.info(`Reassigned ${meetupSeriesId} from ${oldData.rows[0].old_poc_name} to ${newPOCName}`);

    res.json({
      success: true,
      message: `Successfully reassigned ${meetupSeriesId}`,
      from: oldData.rows[0].old_poc_name,
      to: newPOCName,
      realtime_update: 'WebSocket will notify all connected clients of this change'
    });

  } catch (error) {
    logger.error('Failed to reassign meetup:', error);
    res.status(500).json({ error: 'Failed to reassign meetup' });
  }
});

// TEST ENDPOINT: Simulate health change
router.post('/change-health', async (req, res) => {
  try {
    const { meetupSeriesId, newHealth, metrics } = req.body;

    await query(`
      UPDATE meetups
      SET
        health_status = $1,
        capacity_utilization = $2,
        repeat_rate = $3,
        average_rating = $4,
        revenue_achievement = $5,
        health_last_calculated = CURRENT_TIMESTAMP
      WHERE meetup_series_id = $6
    `, [
      newHealth,
      metrics.capacity || 0.5,
      metrics.repeat || 0.5,
      metrics.rating || 4.0,
      metrics.revenue || 0.8,
      meetupSeriesId
    ]);

    logger.info(`Changed health of ${meetupSeriesId} to ${newHealth}`);

    res.json({
      success: true,
      message: `Health changed to ${newHealth}`,
      realtime_update: 'WebSocket will broadcast this change to relevant POCs'
    });

  } catch (error) {
    logger.error('Failed to change health:', error);
    res.status(500).json({ error: 'Failed to change health' });
  }
});

// GET current POC assignments for debugging
router.get('/current-assignments', async (req, res) => {
  try {
    const assignments = await query(`
      SELECT
        p.name as poc_name,
        p.poc_type,
        p.activities,
        COUNT(m.id) as meetup_count,
        SUM(m.actual_revenue) as total_revenue,
        array_agg(m.meetup_series_id) as meetup_ids
      FROM poc_structure p
      LEFT JOIN meetups m ON (
        (p.poc_type = 'activity_head' AND m.activity_head_id = p.id)
        OR
        (p.poc_type = 'city_head' AND m.city_head_id = p.id)
      )
      WHERE p.is_active = true
      GROUP BY p.id, p.name, p.poc_type, p.activities
      ORDER BY p.name
    `);

    res.json({
      current_assignments: assignments.rows,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Failed to get assignments:', error);
    res.status(500).json({ error: 'Failed to get assignments' });
  }
});

export default router;