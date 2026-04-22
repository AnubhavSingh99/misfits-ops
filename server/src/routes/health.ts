import express from 'express';
import { logger } from '../utils/logger';
import { calculateClubHealth, calculateSystemHealth } from '../services/healthEngine';
import { queryProduction } from '../services/database';
import * as fs from 'fs';
import * as path from 'path';

const router = express.Router();
const localDataDir = path.resolve(__dirname, '../../data');

function readJsonFile<T>(fileName: string, fallback: T): T {
  try {
    const filePath = path.join(localDataDir, fileName);
    if (!fs.existsSync(filePath)) {
      return fallback;
    }

    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
  } catch (error) {
    logger.warn(`Failed to read fallback data file ${fileName}:`, error);
    return fallback;
  }
}

function buildHealthFallback() {
  const clubs = readJsonFile<Array<{ id: number; name: string; activity: string; city: string; area: string; currentMeetups?: number; currentRevenue?: number; status?: string }>>('existing_clubs.json', []);

  const clubsWithHealth = clubs.map((club, index) => {
    const meetups = club.currentMeetups || 0;
    const revenue = club.currentRevenue || 0;
    let healthStatus: 'healthy' | 'at_risk' | 'critical' = 'critical';

    if (meetups >= 10 || revenue >= 35000) {
      healthStatus = 'healthy';
    } else if (meetups >= 6 || revenue >= 20000) {
      healthStatus = 'at_risk';
    }

    return {
      club_id: club.id,
      club_name: club.name,
      activity_name: club.activity,
      city_name: club.city,
      area_name: club.area,
      health_status: healthStatus,
      health_score: healthStatus === 'healthy' ? 82 : healthStatus === 'at_risk' ? 58 : 28,
      current_meetups: meetups,
      current_revenue: revenue,
      rank: index + 1
    };
  });

  const healthyClubs = clubsWithHealth.filter(club => club.health_status === 'healthy').length;
  const atRiskClubs = clubsWithHealth.filter(club => club.health_status === 'at_risk').length;
  const criticalClubs = clubsWithHealth.filter(club => club.health_status === 'critical').length;
  const activeClubs = clubsWithHealth.length;

  return {
    success: true,
    clubs: clubsWithHealth,
    metrics: {
      healthy_clubs: healthyClubs,
      at_risk_clubs: atRiskClubs,
      critical_clubs: criticalClubs,
      active_clubs: activeClubs,
      total_meetups: clubsWithHealth.reduce((sum, club) => sum + club.current_meetups, 0),
      active_meetups: clubsWithHealth.reduce((sum, club) => sum + club.current_meetups, 0),
      meetup_target: Math.max(activeClubs * 10, 1),
      meetup_achievement_pct: Math.round((clubsWithHealth.reduce((sum, club) => sum + club.current_meetups, 0) / Math.max(activeClubs * 10, 1)) * 100),
      total_events: clubsWithHealth.reduce((sum, club) => sum + club.current_meetups, 0),
      filtered_by: 'all',
      filter_applied: false
    },
    source: 'local_fallback',
    generated_at: new Date().toISOString()
  };
}

// GET /api/health - Basic health summary
router.get('/', async (req, res) => {
  try {
    res.json({
      success: true,
      systemHealth: "at_risk",
      totalClubs: 135,
      healthyClubs: 16,
      criticalClubs: 118,
      health_distribution: {
        total: 135,
        healthy: 16,
        critical: 118,
        red: 118
      },
      message: "Basic health endpoint - Dashboard uses /api/health/clubs for real data"
    });
  } catch (error) {
    logger.error('Failed to fetch health data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch health data',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Execute query against Misfits database using direct RDS connection
 */
async function queryMisfits(text: string, params?: any[]): Promise<any> {
  try {
    logger.info('Executing query against production RDS database...');
    const result = await queryProduction(text, params);
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

    // SECURITY: Use parameterized query instead of string interpolation
    const queryParams: any[] = [];
    let statusFilter = '';
    if (status && status !== 'all') {
      const safeStatus = String(status).toUpperCase();
      // Whitelist valid statuses to prevent injection
      if (['ACTIVE', 'INACTIVE', 'SUSPENDED'].includes(safeStatus)) {
        queryParams.push(safeStatus);
        statusFilter = `c.status = $1`;
      }
    } else {
      // Default: show all clubs (no status filter)
      statusFilter = `c.status IN ('ACTIVE', 'INACTIVE')`;
    }

    // OPTIMIZED QUERY: Eliminated N+1 subqueries by using CTEs and JOINs
    // Key optimizations:
    // 1. City/Area: Pre-computed in club_locations CTE using window function (was: subquery per row)
    // 2. Repeat rate: Pre-computed in repeat_rate_calc CTE (was: correlated subquery per row)
    // 3. Revenue: Pre-computed in booking CTEs (was: subquery per row)
    // 4. Last event count: Pre-computed in event count CTE (was: subquery per row)
    // Expected speedup: 10-50x depending on data size
    const healthQuery = `
      WITH
      -- Pre-compute club locations using window function (replaces N subqueries with 1 scan)
      club_event_locations AS (
        SELECT
          e.club_id,
          ci.name as city_name,
          ar.name as area_name,
          ROW_NUMBER() OVER (PARTITION BY e.club_id ORDER BY COUNT(*) DESC) as rn
        FROM event e
        JOIN location l ON e.location_id = l.id
        JOIN area ar ON l.area_id = ar.id
        JOIN city ci ON ar.city_id = ci.id
        GROUP BY e.club_id, ci.name, ar.name
      ),
      club_locations AS (
        SELECT club_id, city_name, area_name
        FROM club_event_locations
        WHERE rn = 1
      ),
      -- Last week events
      last_week_events AS (
        SELECT
          e.pk as event_pk,
          e.club_id,
          e.max_people
        FROM event e
        WHERE e.created_at >= DATE_TRUNC('week', CURRENT_DATE - INTERVAL '1 week') + INTERVAL '1 day'
          AND e.created_at < DATE_TRUNC('week', CURRENT_DATE) + INTERVAL '1 day'
      ),
      -- Last week event count per club (pre-computed)
      last_week_event_counts AS (
        SELECT club_id, COUNT(*) as event_count
        FROM last_week_events
        GROUP BY club_id
      ),
      -- Last week bookings with aggregations
      last_week_bookings AS (
        SELECT
          lwe.club_id,
          COUNT(CASE WHEN b.booking_status IN ('REGISTERED', 'WAITLISTED', 'OPEN_FOR_REPLACEMENT', 'ATTENDED', 'NOT_ATTENDED')
                     THEN b.id END) as capacity_bookings_count,
          COUNT(DISTINCT CASE WHEN b.booking_status IN ('REGISTERED', 'WAITLISTED', 'OPEN_FOR_REPLACEMENT', 'ATTENDED', 'NOT_ATTENDED')
                              THEN b.user_id END) as unique_users,
          AVG(CASE WHEN (b.feedback_details->>'rating')::numeric IS NOT NULL
                   THEN (b.feedback_details->>'rating')::numeric END) as avg_rating,
          SUM(CASE WHEN b.booking_payment_status = 'COMPLETED' THEN b.amount ELSE 0 END) as revenue
        FROM last_week_events lwe
        LEFT JOIN booking b ON lwe.event_pk = b.event_id
        GROUP BY lwe.club_id
      ),
      -- Last week capacity
      last_week_capacity AS (
        SELECT club_id, SUM(max_people) as total_slots
        FROM last_week_events
        GROUP BY club_id
      ),
      -- Pre-compute repeat users for last week (replaces N correlated subqueries)
      last_week_users AS (
        SELECT DISTINCT lwe.club_id, b.user_id
        FROM last_week_events lwe
        JOIN booking b ON lwe.event_pk = b.event_id
        WHERE b.booking_status IN ('REGISTERED', 'WAITLISTED', 'OPEN_FOR_REPLACEMENT', 'ATTENDED', 'NOT_ATTENDED')
      ),
      historical_users AS (
        SELECT DISTINCT e.club_id, b.user_id
        FROM event e
        JOIN booking b ON e.pk = b.event_id
        WHERE e.created_at < DATE_TRUNC('week', CURRENT_DATE - INTERVAL '1 week')
          AND b.booking_status IN ('REGISTERED', 'WAITLISTED', 'OPEN_FOR_REPLACEMENT', 'ATTENDED', 'NOT_ATTENDED')
      ),
      repeat_rate_calc AS (
        SELECT
          lwu.club_id,
          COUNT(DISTINCT CASE WHEN hu.user_id IS NOT NULL THEN lwu.user_id END) as repeat_users
        FROM last_week_users lwu
        LEFT JOIN historical_users hu ON lwu.club_id = hu.club_id AND lwu.user_id = hu.user_id
        GROUP BY lwu.club_id
      ),
      -- Recent events check for dormant detection (single scan)
      recent_events AS (
        SELECT club_id, MAX(created_at) as last_event_date,
               BOOL_OR(created_at >= CURRENT_DATE - INTERVAL '2 months') as has_recent
        FROM event
        GROUP BY club_id
      ),
      -- Two weeks ago events
      two_weeks_ago_events AS (
        SELECT e.pk as event_pk, e.club_id, e.max_people
        FROM event e
        WHERE e.created_at >= DATE_TRUNC('week', CURRENT_DATE - INTERVAL '2 weeks') + INTERVAL '1 day'
          AND e.created_at < DATE_TRUNC('week', CURRENT_DATE - INTERVAL '1 week') + INTERVAL '1 day'
      ),
      two_weeks_ago_bookings AS (
        SELECT
          twa.club_id,
          COUNT(CASE WHEN b.booking_status IN ('REGISTERED', 'WAITLISTED', 'OPEN_FOR_REPLACEMENT', 'ATTENDED', 'NOT_ATTENDED')
                     THEN b.id END) as capacity_bookings_count,
          COUNT(DISTINCT CASE WHEN b.booking_status IN ('REGISTERED', 'WAITLISTED', 'OPEN_FOR_REPLACEMENT', 'ATTENDED', 'NOT_ATTENDED')
                              THEN b.user_id END) as unique_users,
          AVG(CASE WHEN (b.feedback_details->>'rating')::numeric IS NOT NULL
                   THEN (b.feedback_details->>'rating')::numeric END) as avg_rating,
          SUM(CASE WHEN b.booking_payment_status = 'COMPLETED' THEN b.amount ELSE 0 END) as revenue
        FROM two_weeks_ago_events twa
        LEFT JOIN booking b ON twa.event_pk = b.event_id
        GROUP BY twa.club_id
      ),
      two_weeks_ago_capacity AS (
        SELECT club_id, SUM(max_people) as total_slots
        FROM two_weeks_ago_events
        GROUP BY club_id
      ),
      -- Pre-compute repeat users for two weeks ago
      two_weeks_ago_users AS (
        SELECT DISTINCT twa.club_id, b.user_id
        FROM two_weeks_ago_events twa
        JOIN booking b ON twa.event_pk = b.event_id
        WHERE b.booking_status IN ('REGISTERED', 'WAITLISTED', 'OPEN_FOR_REPLACEMENT', 'ATTENDED', 'NOT_ATTENDED')
      ),
      historical_users_2w AS (
        SELECT DISTINCT e.club_id, b.user_id
        FROM event e
        JOIN booking b ON e.pk = b.event_id
        WHERE e.created_at < DATE_TRUNC('week', CURRENT_DATE - INTERVAL '2 weeks')
          AND b.booking_status IN ('REGISTERED', 'WAITLISTED', 'OPEN_FOR_REPLACEMENT', 'ATTENDED', 'NOT_ATTENDED')
      ),
      repeat_rate_calc_2w AS (
        SELECT
          twu.club_id,
          COUNT(DISTINCT CASE WHEN hu.user_id IS NOT NULL THEN twu.user_id END) as repeat_users
        FROM two_weeks_ago_users twu
        LEFT JOIN historical_users_2w hu ON twu.club_id = hu.club_id AND twu.user_id = hu.user_id
        GROUP BY twu.club_id
      )
      SELECT
        c.pk as club_pk,
        c.id as club_id,
        c.name as club_name,
        c.status as club_status,
        c.created_at as club_created_date,
        a.name as activity,
        COALESCE(cl.city_name, 'Unknown') as city,
        COALESCE(cl.area_name, 'Unknown') as area,
        -- Last week metrics
        CASE WHEN COALESCE(lwc.total_slots, 0) > 0
             THEN ROUND((COALESCE(lwb.capacity_bookings_count, 0) * 100.0) / lwc.total_slots)
             ELSE 0 END as last_week_capacity_percentage,
        CASE WHEN COALESCE(lwb.unique_users, 0) > 0
             THEN ROUND((COALESCE(rrc.repeat_users, 0) * 100.0) / lwb.unique_users)
             ELSE 0 END as last_week_repeat_rate_percentage,
        ROUND(COALESCE(lwb.avg_rating, 0), 1) as last_week_avg_rating,
        COALESCE(lwb.revenue, 0) as last_week_revenue,
        -- Two weeks ago metrics
        CASE WHEN COALESCE(twac.total_slots, 0) > 0
             THEN ROUND((COALESCE(twab.capacity_bookings_count, 0) * 100.0) / twac.total_slots)
             ELSE 0 END as last_to_last_week_capacity_percentage,
        CASE WHEN COALESCE(twab.unique_users, 0) > 0
             THEN ROUND((COALESCE(rrc2.repeat_users, 0) * 100.0) / twab.unique_users)
             ELSE 0 END as last_to_last_week_repeat_rate_percentage,
        ROUND(COALESCE(twab.avg_rating, 0), 1) as last_to_last_week_avg_rating,
        COALESCE(twab.revenue, 0) as last_to_last_week_revenue,
        -- Additional fields
        re.last_event_date,
        COALESCE(lwec.event_count, 0) as last_week_events,
        COALESCE(re.has_recent, false) as has_recent_historical_events
      FROM club c
      LEFT JOIN activity a ON c.activity_id = a.id
      LEFT JOIN club_locations cl ON c.pk = cl.club_id
      LEFT JOIN last_week_bookings lwb ON c.pk = lwb.club_id
      LEFT JOIN last_week_capacity lwc ON c.pk = lwc.club_id
      LEFT JOIN repeat_rate_calc rrc ON c.pk = rrc.club_id
      LEFT JOIN two_weeks_ago_bookings twab ON c.pk = twab.club_id
      LEFT JOIN two_weeks_ago_capacity twac ON c.pk = twac.club_id
      LEFT JOIN repeat_rate_calc_2w rrc2 ON c.pk = rrc2.club_id
      LEFT JOIN recent_events re ON c.pk = re.club_id
      LEFT JOIN last_week_event_counts lwec ON c.pk = lwec.club_id
      WHERE ${statusFilter}
        AND c.is_private = false
        AND (a.name IS NULL OR a.name != 'Test')
      ORDER BY c.status, c.name
    `;

    const result = await queryMisfits(healthQuery, queryParams.length > 0 ? queryParams : undefined);

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
          // Dormancy logic: 1 week no events = dormant, 2+ weeks no events = critical
          is_dormant: Number(row.last_week_capacity_percentage || 0) === 0 &&
                     Number(row.last_to_last_week_capacity_percentage || 0) > 0 &&
                     (row.has_recent_historical_events === true)
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
      // OPTIMIZED: Simple aggregation query with proper parameterization
      const totalEventsQuery = `
        SELECT COUNT(DISTINCT e.pk) as total_events_with_payments
        FROM event e
        JOIN booking b ON e.pk = b.event_id
        JOIN club c ON e.club_id = c.pk
        WHERE b.booking_payment_status = 'COMPLETED'
        AND e.created_at >= CURRENT_DATE - INTERVAL '7 days'
        AND ${statusFilter}
        AND c.is_private = false
      `;

      const eventsResult = await queryMisfits(totalEventsQuery, queryParams.length > 0 ? queryParams : undefined);
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

    res.json({
      ...buildHealthFallback(),
      warning: error instanceof Error ? error.message : 'Unknown database error'
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
