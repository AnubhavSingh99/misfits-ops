import express from 'express';
import { logger } from '../utils/logger';
import { calculateClubHealth, calculateSystemHealth } from '../services/healthEngine';
import { queryProductionWithTunnel } from '../services/sshTunnel';

const router = express.Router();

/**
 * Execute query against Misfits database using centralized SSH tunnel service
 */
async function queryMisfits(text: string, params?: any[]): Promise<any> {
  try {
    logger.info('Executing query against production database using centralized SSH tunnel...');
    const result = await queryProductionWithTunnel(text, params);
    return result;
  } catch (error) {
    logger.error('Failed to query Misfits database:', error);
    throw error;
  }
}

// Get club health data with 4-metric health system using health engine
router.get('/clubs', async (req, res) => {
  try {
    logger.info('Fetching club health data...');

    // Get club status filter from query params (default to 'active' for backward compatibility)
    const { status } = req.query;
    let statusFilter = '';

    if (status && status !== 'all') {
      statusFilter = `AND c.status = '${status.toString().toUpperCase()}'`;
    }

    // Updated query to correctly calculate health metrics according to user specifications
    const healthQuery = `
      WITH last_week_events AS (
        -- Get events from last week to avoid duplication in joins
        SELECT
          e.pk as event_pk,
          e.club_id,
          e.max_people,
          e.created_at
        FROM event e
        WHERE e.created_at >= DATE_TRUNC('week', CURRENT_DATE - INTERVAL '1 week')
          AND e.created_at < DATE_TRUNC('week', CURRENT_DATE)
      ),
      last_week_bookings AS (
        -- Get bookings from last week events (Claude Control logic)
        SELECT
          lwe.club_id,
          -- Capacity calculation: REGISTERED + WAITLISTED + OPEN_FOR_REPLACEMENT + ATTENDED + NOT_ATTENDED
          COUNT(CASE WHEN b.booking_status IN ('REGISTERED', 'WAITLISTED', 'OPEN_FOR_REPLACEMENT', 'ATTENDED', 'NOT_ATTENDED')
                     THEN b.id ELSE NULL END) as capacity_bookings_count,
          COUNT(DISTINCT CASE WHEN b.booking_status IN ('REGISTERED', 'WAITLISTED', 'OPEN_FOR_REPLACEMENT', 'ATTENDED', 'NOT_ATTENDED')
                              THEN b.user_id ELSE NULL END) as unique_users,
          COUNT(CASE WHEN b.booking_status IN ('REGISTERED', 'WAITLISTED', 'OPEN_FOR_REPLACEMENT', 'ATTENDED', 'NOT_ATTENDED')
                     THEN b.id ELSE NULL END) as total_valid_bookings,
          AVG(CASE WHEN (b.feedback_details->>'rating')::numeric IS NOT NULL
                   THEN (b.feedback_details->>'rating')::numeric ELSE NULL END) as avg_rating
        FROM last_week_events lwe
        LEFT JOIN booking b ON lwe.event_pk = b.event_id
        GROUP BY lwe.club_id
      ),
      last_week_capacity AS (
        -- Calculate capacity separately to avoid duplication
        SELECT
          club_id,
          SUM(max_people) as total_slots
        FROM last_week_events
        GROUP BY club_id
      ),
      last_week_data AS (
        -- Get last week data (Monday to Sunday of previous week)
        SELECT
          c.pk as club_pk,
          c.id as club_id,
          c.name as club_name,
          c.status as club_status,
          c.created_at as club_created_date,
          a.name as activity,
          -- Get most common city and area for this club
          (
            SELECT ci.name
            FROM event e2
            JOIN location l2 ON e2.location_id = l2.id
            JOIN area ar2 ON l2.area_id = ar2.id
            JOIN city ci ON ar2.city_id = ci.id
            WHERE e2.club_id = c.pk
            GROUP BY ci.name
            ORDER BY COUNT(*) DESC
            LIMIT 1
          ) as city,
          (
            SELECT ar2.name
            FROM event e2
            JOIN location l2 ON e2.location_id = l2.id
            JOIN area ar2 ON l2.area_id = ar2.id
            WHERE e2.club_id = c.pk
            GROUP BY ar2.name
            ORDER BY COUNT(*) DESC
            LIMIT 1
          ) as area,
          -- Capacity utilization = All valid bookings / Total capacity (Claude Control logic)
          CASE
            WHEN COALESCE(lwc.total_slots, 0) > 0
            THEN ROUND((COALESCE(lwb.capacity_bookings_count, 0) * 100.0) / lwc.total_slots)
            ELSE 0
          END as last_week_capacity_percentage,

          -- Repeat rate: percentage of last week's attendees who had previously attended the club before
          CASE
            WHEN COALESCE(lwb.unique_users, 0) > 0
            THEN ROUND(
              (
                (SELECT COUNT(DISTINCT b_hist.user_id)
                 FROM event e_hist
                 JOIN booking b_hist ON e_hist.pk = b_hist.event_id
                 WHERE e_hist.club_id = c.pk
                   AND e_hist.created_at < DATE_TRUNC('week', CURRENT_DATE - INTERVAL '1 week')
                   AND b_hist.booking_status IN ('REGISTERED', 'WAITLISTED', 'OPEN_FOR_REPLACEMENT', 'ATTENDED', 'NOT_ATTENDED')
                   AND b_hist.user_id IN (SELECT DISTINCT user_id FROM last_week_events lwe_inner JOIN booking b_inner ON lwe_inner.event_pk = b_inner.event_id WHERE lwe_inner.club_id = c.pk AND b_inner.booking_status IN ('REGISTERED', 'WAITLISTED', 'OPEN_FOR_REPLACEMENT', 'ATTENDED', 'NOT_ATTENDED'))
                ) * 100.0
              ) / COALESCE(lwb.unique_users, 1)
            )
            ELSE 0
          END as last_week_repeat_rate_percentage,

          -- Average rating from last week's events (using feedback from bookings)
          ROUND(COALESCE(lwb.avg_rating, 0), 1) as last_week_avg_rating,

          -- Revenue from completed payments last week
          COALESCE((
            SELECT SUM(b.amount)
            FROM last_week_events lwe2
            JOIN booking b ON lwe2.event_pk = b.event_id
            WHERE lwe2.club_id = c.pk
            AND b.booking_payment_status = 'COMPLETED'
          ), 0) as last_week_revenue,

          -- Check if club has had events in the last 2 months (for dormant detection)
          CASE
            WHEN EXISTS (
              SELECT 1 FROM event e_hist
              WHERE e_hist.club_id = c.pk
              AND e_hist.created_at >= CURRENT_DATE - INTERVAL '2 months'
            ) THEN true
            ELSE false
          END as has_recent_historical_events

        FROM club c
        LEFT JOIN activity a ON c.activity_id = a.id
        LEFT JOIN last_week_bookings lwb ON c.pk = lwb.club_id
        LEFT JOIN last_week_capacity lwc ON c.pk = lwc.club_id
        WHERE c.status = 'ACTIVE'
        AND c.is_private = false
        AND (a.name IS NULL OR a.name != 'Test')
        ${statusFilter}
        GROUP BY c.pk, c.id, c.name, c.status, c.created_at, a.name, lwb.capacity_bookings_count,
                 lwb.unique_users, lwb.total_valid_bookings, lwb.avg_rating, lwc.total_slots
      ),
      two_weeks_ago_events AS (
        -- Get events from two weeks ago
        SELECT
          e.pk as event_pk,
          e.club_id,
          e.max_people,
          e.created_at
        FROM event e
        WHERE e.created_at >= DATE_TRUNC('week', CURRENT_DATE - INTERVAL '2 weeks')
          AND e.created_at < DATE_TRUNC('week', CURRENT_DATE - INTERVAL '1 week')
      ),
      two_weeks_ago_bookings AS (
        -- Get bookings from two weeks ago events
        SELECT
          twa.club_id,
          COUNT(CASE WHEN b.booking_status IN ('REGISTERED', 'WAITLISTED', 'OPEN_FOR_REPLACEMENT', 'ATTENDED', 'NOT_ATTENDED')
                     THEN b.id ELSE NULL END) as capacity_bookings_count,
          COUNT(DISTINCT CASE WHEN b.booking_status IN ('REGISTERED', 'WAITLISTED', 'OPEN_FOR_REPLACEMENT', 'ATTENDED', 'NOT_ATTENDED')
                              THEN b.user_id ELSE NULL END) as unique_users,
          COUNT(CASE WHEN b.booking_status IN ('REGISTERED', 'WAITLISTED', 'OPEN_FOR_REPLACEMENT', 'ATTENDED', 'NOT_ATTENDED')
                     THEN b.id ELSE NULL END) as total_valid_bookings,
          AVG(CASE WHEN (b.feedback_details->>'rating')::numeric IS NOT NULL
                   THEN (b.feedback_details->>'rating')::numeric ELSE NULL END) as avg_rating
        FROM two_weeks_ago_events twa
        LEFT JOIN booking b ON twa.event_pk = b.event_id
        GROUP BY twa.club_id
      ),
      two_weeks_ago_capacity AS (
        -- Calculate capacity for two weeks ago
        SELECT
          club_id,
          SUM(max_people) as total_slots
        FROM two_weeks_ago_events
        GROUP BY club_id
      ),
      last_to_last_week_data AS (
        -- Get week before last week data for comparison (two weeks ago)
        SELECT
          c.pk as club_pk,
          CASE
            WHEN COALESCE(twac.total_slots, 0) > 0
            THEN ROUND((COALESCE(twab.capacity_bookings_count, 0) * 100.0) / twac.total_slots)
            ELSE 0
          END as last_to_last_week_capacity_percentage,
          CASE
            WHEN COALESCE(twab.unique_users, 0) > 0
            THEN ROUND(
              (
                (SELECT COUNT(DISTINCT b_hist.user_id)
                 FROM event e_hist
                 JOIN booking b_hist ON e_hist.pk = b_hist.event_id
                 WHERE e_hist.club_id = c.pk
                   AND e_hist.created_at < DATE_TRUNC('week', CURRENT_DATE - INTERVAL '2 weeks')
                   AND b_hist.booking_status IN ('REGISTERED', 'WAITLISTED', 'OPEN_FOR_REPLACEMENT', 'ATTENDED', 'NOT_ATTENDED')
                   AND b_hist.user_id IN (SELECT DISTINCT user_id FROM two_weeks_ago_events twa_inner JOIN booking b_inner ON twa_inner.event_pk = b_inner.event_id WHERE twa_inner.club_id = c.pk AND b_inner.booking_status IN ('REGISTERED', 'WAITLISTED', 'OPEN_FOR_REPLACEMENT', 'ATTENDED', 'NOT_ATTENDED'))
                ) * 100.0
              ) / COALESCE(twab.unique_users, 1)
            )
            ELSE 0
          END as last_to_last_week_repeat_rate_percentage,
          ROUND(COALESCE(twab.avg_rating, 0), 1) as last_to_last_week_avg_rating,
          COALESCE((
            SELECT SUM(b.amount)
            FROM two_weeks_ago_events twa2
            JOIN booking b ON twa2.event_pk = b.event_id
            WHERE twa2.club_id = c.pk
            AND b.booking_payment_status = 'COMPLETED'
          ), 0) as last_to_last_week_revenue
        FROM club c
        LEFT JOIN activity a ON c.activity_id = a.id
        LEFT JOIN two_weeks_ago_bookings twab ON c.pk = twab.club_id
        LEFT JOIN two_weeks_ago_capacity twac ON c.pk = twac.club_id
        WHERE c.status = 'ACTIVE'
        AND c.is_private = false
        AND (a.name IS NULL OR a.name != 'Test')
        ${statusFilter}
      )
      SELECT
        lwd.*,
        llwd.last_to_last_week_capacity_percentage,
        llwd.last_to_last_week_repeat_rate_percentage,
        llwd.last_to_last_week_avg_rating,
        llwd.last_to_last_week_revenue,
        MAX(e.created_at) as last_event_date
      FROM last_week_data lwd
      LEFT JOIN last_to_last_week_data llwd ON lwd.club_pk = llwd.club_pk
      LEFT JOIN event e ON lwd.club_pk = e.club_id
      GROUP BY
        lwd.club_pk, lwd.club_id, lwd.club_name, lwd.club_status, lwd.club_created_date,
        lwd.activity, lwd.city, lwd.area, lwd.last_week_capacity_percentage,
        lwd.last_week_repeat_rate_percentage, lwd.last_week_avg_rating, lwd.last_week_revenue,
        lwd.has_recent_historical_events,
        llwd.last_to_last_week_capacity_percentage, llwd.last_to_last_week_repeat_rate_percentage,
        llwd.last_to_last_week_avg_rating, llwd.last_to_last_week_revenue
      ORDER BY lwd.club_status, lwd.club_name
    `;

    const result = await queryMisfits(healthQuery);

    if (result.rows && result.rows.length > 0) {
      // Process each club through the health engine using last week data
      const clubs = result.rows.map(row => {
        const clubHealthData = {
          club_id: row.club_id,
          club_name: row.club_name,
          club_status: row.club_status,
          activity: row.activity || 'Unknown',
          club_created_date: row.club_created_date,
          capacity_percentage: row.last_week_capacity_percentage || 0,
          repeat_rate_percentage: row.last_week_repeat_rate_percentage || 0,
          avg_rating: row.last_week_avg_rating || 0,
          weekly_revenue: row.last_week_revenue || 0,
          monthly_revenue_target: 20000,
          last_week_capacity_percentage: row.last_to_last_week_capacity_percentage || 0,
          last_week_repeat_rate_percentage: row.last_to_last_week_repeat_rate_percentage || 0,
          last_week_avg_rating: row.last_to_last_week_avg_rating || 0,
          last_week_revenue: row.last_to_last_week_revenue || 0,
          has_recent_historical_events: row.has_recent_historical_events || false,
          // Override for dormancy detection: if capacity is 0 and has historical events, it's dormant
          is_dormant: (row.last_week_capacity_percentage || 0) === 0 && (row.has_recent_historical_events === true)
        };

        const healthResult = calculateClubHealth(clubHealthData);

        return {
          id: row.club_id,
          name: row.club_name,
          club_status: row.club_status,
          activity: row.activity || 'Unknown',
          city: row.city || 'Unknown',
          area: row.area || 'Unknown',
          capacity: healthResult.capacity,
          capacity_health: healthResult.capacity_health,
          repeat_rate: healthResult.repeat_rate,
          rating: healthResult.rating,
          revenue: Math.round(row.last_week_revenue / 100), // Convert paisa to rupees (weekly)
          health_status: healthResult.health_status,
          health_score: healthResult.health_score,
          last_event: row.last_event_date ? row.last_event_date.toISOString().split('T')[0] : null,
          total_events: parseInt(row.last_week_events || 0),
          avg_attendance: Math.round(row.last_week_total_bookings || 0),
          week_over_week_change: healthResult.week_over_week_change,
          auto_detected_issues: healthResult.auto_detected_issues,
          requires_attention: healthResult.requires_attention,
          is_new_club: healthResult.is_new_club,
          revenue_achievement_pct: healthResult.revenue_achievement_pct,
          // Add historical metrics for week-over-week comparison in frontend
          last_week_metrics: {
            capacity: healthResult.capacity,
            repeat_rate: healthResult.repeat_rate,
            rating: healthResult.rating
          },
          two_weeks_ago_metrics: {
            capacity: row.last_to_last_week_capacity_percentage || 0,
            repeat_rate: row.last_to_last_week_repeat_rate_percentage || 0,
            rating: row.last_to_last_week_avg_rating || 0
          }
        };
      });

      // Calculate system-wide metrics using health engine
      const systemHealth = calculateSystemHealth(clubs);

      // Calculate total events with completed payments (last week)
      const totalEventsQuery = `
        SELECT COUNT(DISTINCT e.pk) as total_events_with_payments
        FROM event e
        JOIN booking b ON e.pk = b.event_id
        JOIN club c ON e.club_id = c.pk
        WHERE b.booking_payment_status = 'COMPLETED'
        AND e.created_at >= CURRENT_DATE - INTERVAL '7 days'
        AND c.status = 'ACTIVE'
        AND c.is_private = false
        ${statusFilter}
      `;

      const eventsResult = await queryMisfits(totalEventsQuery);
      const totalEventsWithPayments = eventsResult.rows[0]?.total_events_with_payments || 0;

      // Calculate meetup-based metrics from events
      const totalMeetups = parseInt(totalEventsWithPayments) || 0;
      const recentMeetups = totalMeetups;

      // Build comprehensive metrics object
      const metrics = {
        ...systemHealth,
        // Additional meetup-based metrics
        total_meetups: totalMeetups,
        active_meetups: recentMeetups,
        meetup_target: 1200, // Can be made configurable
        meetup_achievement_pct: Math.round((recentMeetups / 1200) * 100),
        total_events: totalMeetups,

        // Additional filter information
        filtered_by: status || 'all',
        filter_applied: !!status && status !== 'all'
      };

      logger.info(`Successfully fetched health data for ${clubs.length} clubs using last week data and updated health engine`);

      res.json({
        success: true,
        clubs: clubs,
        metrics: metrics,
        source: 'database_with_health_engine',
        generated_at: new Date().toISOString()
      });

    } else {
      throw new Error('No health data returned from database');
    }

  } catch (error) {
    logger.error('Health data fetch failed:', error);

    // Return error with suggestion to use fallback
    res.status(500).json({
      success: false,
      error: 'Failed to fetch health data from database',
      message: 'Database connection failed. Frontend will use mock data.',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get health interventions and action plans
router.get('/interventions', async (req, res) => {
  try {
    const { status } = req.query;

    // This would be a more complex query in practice
    const interventionsQuery = `
      SELECT
        c.id as club_id,
        c.name as club_name,
        a.name as activity,
        'intervention_needed' as action_type,
        CASE
          WHEN COUNT(e.pk) = 0 THEN 'No events created - immediate outreach needed'
          WHEN COUNT(DISTINCT b.user_id) < 5 THEN 'Low attendance - marketing support needed'
          ELSE 'General support needed'
        END as recommended_action,
        COUNT(e.pk) as recent_events,
        0 as avg_rating
      FROM club c
      LEFT JOIN activity a ON c.activity_id = a.id
      LEFT JOIN event e ON c.pk = e.club_id AND e.created_at >= CURRENT_DATE - INTERVAL '30 days'
      LEFT JOIN booking b ON e.pk = b.event_id AND b.booking_status = 'REGISTERED'
      WHERE c.status = 'ACTIVE'
      AND a.id NOT IN ('7', '30')
      AND LOWER(a.name) != 'test'
      GROUP BY c.pk, c.id, c.name, a.name
      HAVING COUNT(e.pk) < 4 OR COUNT(DISTINCT b.user_id) < 10
      ORDER BY COUNT(e.pk) ASC
    `;

    const result = await queryMisfits(interventionsQuery);

    res.json({
      success: true,
      interventions: result.rows || [],
      generated_at: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Interventions fetch failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch intervention data'
    });
  }
});

// Update club health status manually
router.put('/clubs/:clubId/status', async (req, res) => {
  try {
    const { clubId } = req.params;
    const { status, notes, updated_by } = req.body;

    if (!['healthy', 'at_risk', 'critical'].includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid status. Must be healthy, at_risk, or critical'
      });
    }

    // In a real implementation, you'd update a health_status table
    // For now, we'll just log the action
    logger.info(`Club ${clubId} health status manually updated to ${status} by ${updated_by}`);

    res.json({
      success: true,
      message: `Club health status updated to ${status}`,
      updated_at: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Health status update failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update health status'
    });
  }
});

export default router;