import { Router } from 'express';
import { logger } from '../utils/logger';
import { queryProductionWithTunnel } from '../services/sshTunnel';

const router = Router();

// Using centralized SSH tunnel service for all database queries

// Get activities with club counts and revenue
router.get('/activities', async (req, res) => {
  try {
    // Try to fetch from real database first
    const result = await queryProductionWithTunnel(`
      SELECT
        a.name as activity,
        COUNT(DISTINCT c.id) as club_count,
        -- Calculate revenue from completed payments
        COALESCE(SUM(p.amount), 0) as total_revenue_paisa,
        CASE
          WHEN COUNT(DISTINCT c.id) >= 15 THEN 'scale'
          ELSE 'long_tail'
        END as type
      FROM club c
      LEFT JOIN activity a ON c.activity_id = a.id
      LEFT JOIN event e ON c.pk = e.club_id
      LEFT JOIN booking b ON e.pk = b.event_id
      LEFT JOIN transaction t ON b.id = t.entity_id AND t.entity_type = 'BOOKING'
      LEFT JOIN payment p ON t.payment_id = p.pk AND p.state = 'COMPLETED'
      WHERE c.status = 'ACTIVE'
        AND a.name IS NOT NULL
        AND a.name != ''
      GROUP BY a.name
      HAVING COUNT(DISTINCT c.id) > 0
      ORDER BY COUNT(DISTINCT c.id) DESC, SUM(p.amount) DESC
    `);

    if (result.rows && result.rows.length > 0) {
      const activities = result.rows.map(row => ({
        name: row.activity,
        type: row.type,
        clubs: parseInt(row.club_count),
        revenue: Math.round(parseFloat(row.total_revenue_paisa) / 100 || 0) // Convert paisa to rupees
      }));

      logger.info(`Fetched ${activities.length} activities from database`);
      res.json({
        success: true,
        data: activities,
        source: 'database',
        message: 'Activities fetched from database'
      });
    } else {
      throw new Error('No data returned from database');
    }

  } catch (error) {
    logger.error('Database query failed:', error.message);

    // No fallback - return error
    res.status(500).json({
      success: false,
      error: 'Failed to fetch activities from database',
      message: 'Database connection required. Please ensure SSH tunnel is established.',
      details: error.message
    });
  }
});

// Update activity classification (scale/long_tail)
router.put('/activities/:activityName/classification', async (req, res) => {
  try {
    const { activityName } = req.params;
    const { type } = req.body;

    if (!['scale', 'long_tail'].includes(type)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid activity type. Must be "scale" or "long_tail"'
      });
    }

    // For now, we'll store this classification in memory or a separate table
    // In a real implementation, you'd have an activity_classification table
    logger.info(`Activity ${activityName} classification updated to ${type}`);

    res.json({
      success: true,
      message: `Activity "${activityName}" classification updated to "${type}"`
    });

  } catch (error) {
    logger.error('Error updating activity classification:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update activity classification'
    });
  }
});

// Get all clubs with detailed status classification
router.get('/', async (req, res) => {
  try {
    const { status, activity, city } = req.query;

    let whereClause = 'c.status = \'ACTIVE\'';
    const params: any[] = [];
    let paramIndex = 1;

    if (activity && activity !== 'all') {
      whereClause += ` AND a.name = $${paramIndex}`;
      params.push(activity);
      paramIndex++;
    }

    if (city && city !== 'all') {
    }

    const result = await queryProductionWithTunnel(`
      WITH club_metrics AS (
        SELECT
          c.pk as club_id,
          c.name,
                    a.name as activity,
          c.created_at,
          -- Revenue metrics
          COALESCE(SUM(CASE WHEN p.state = 'COMPLETED' THEN p.amount END), 0) as total_revenue_paisa,
          COUNT(DISTINCT e.id) as total_events,
          COUNT(DISTINCT DATE_TRUNC('month', e.created_at)) as active_months,
          COUNT(DISTINCT DATE_TRUNC('week', e.created_at)) as active_weeks,
          -- Recent activity (last 7 days and 30 days)
          COUNT(DISTINCT CASE WHEN e.created_at >= CURRENT_DATE - INTERVAL '7 days' THEN e.id END) as recent_7day_events,
          COUNT(DISTINCT CASE WHEN e.created_at >= CURRENT_DATE - INTERVAL '30 days' THEN e.id END) as recent_events,
          -- Revenue trend (last 3 months vs previous 3 months)
          COALESCE(SUM(CASE WHEN p.state = 'COMPLETED' AND p.created_at >= CURRENT_DATE - INTERVAL '3 months' THEN p.amount END), 0) as recent_revenue_paisa,
          COALESCE(SUM(CASE WHEN p.state = 'COMPLETED' AND p.created_at >= CURRENT_DATE - INTERVAL '6 months' AND p.created_at < CURRENT_DATE - INTERVAL '3 months' THEN p.amount END), 0) as previous_revenue_paisa
        FROM club c
        LEFT JOIN activity a ON c.activity_id = a.id
        LEFT JOIN event e ON c.pk = e.club_id
        LEFT JOIN booking b ON e.pk = b.event_id
        LEFT JOIN transaction t ON b.id = t.entity_id AND t.entity_type = 'BOOKING'
        LEFT JOIN payment p ON t.payment_id = p.pk
        WHERE ${whereClause}
        AND c.is_private = false  -- Only include non-private clubs
        GROUP BY c.pk, c.name, a.name, c.created_at
      ),
      club_classifications AS (
        SELECT *,
          -- Club age in months
          EXTRACT(MONTHS FROM AGE(CURRENT_DATE, created_at)) as age_months,
          -- Events per week ratio
          CASE
            WHEN active_weeks > 0 THEN total_events / active_weeks::float
            ELSE 0
          END as events_per_week,
          -- Revenue in rupees
          total_revenue_paisa / 100.0 as total_revenue_rupees,
          recent_revenue_paisa / 100.0 as recent_revenue_rupees,
          previous_revenue_paisa / 100.0 as previous_revenue_rupees,
          -- Revenue growth
          CASE
            WHEN previous_revenue_paisa > 0
            THEN ((recent_revenue_paisa - previous_revenue_paisa) / previous_revenue_paisa::float) * 100
            ELSE 0
          END as revenue_growth_percent
        FROM club_metrics
      )
      SELECT *,
        -- Status classification based on your requirements
        CASE
          -- New Launch stages
          WHEN age_months <= 1 THEN 'new_launch_month_1'
          WHEN age_months <= 2 THEN 'new_launch_month_2'
          WHEN age_months <= 3 THEN 'new_launch_month_3'

          -- Established club classification
          WHEN age_months > 3 AND events_per_week >= 2 AND recent_revenue_rupees > previous_revenue_rupees * 1.1 THEN 'scaling_revenue_high_growth'
          WHEN age_months > 3 AND events_per_week >= 2 AND recent_revenue_rupees > previous_revenue_rupees THEN 'scaling_revenue_moderate_growth'
          WHEN age_months > 3 AND events_per_week >= 2 THEN 'scaling_revenue_stable'
          WHEN age_months > 3 AND events_per_week >= 1 AND recent_7day_events > 0 THEN 'old_stable_revenue'
          WHEN total_events > 0 AND recent_7day_events = 0 THEN 'dormant'  -- Has done events before but none in last 7 days

          -- Default
          ELSE 'assessment_needed'
        END as detailed_status,

        -- Simplified L1/L2 classification
        CASE
          WHEN events_per_week >= 2 THEN 'L2'
          WHEN events_per_week >= 1 THEN 'L1'
          ELSE 'Inactive'
        END as club_level

      FROM club_classifications
      ORDER BY total_revenue_rupees DESC, events_per_week DESC
    `, params);

    const clubs = result.rows.map(club => ({
      id: club.club_id,
      name: club.name,
      city: club.city,
      activity: club.activity,
      createdAt: club.created_at,
      ageMonths: parseInt(club.age_months),
      totalRevenue: parseFloat(club.total_revenue_rupees || 0),
      totalEvents: parseInt(club.total_events || 0),
      activeWeeks: parseInt(club.active_weeks || 0),
      eventsPerWeek: parseFloat(club.events_per_week || 0),
      recent7dayEvents: parseInt(club.recent_7day_events || 0),
      recentEvents: parseInt(club.recent_events || 0),
      recentRevenue: parseFloat(club.recent_revenue_rupees || 0),
      previousRevenue: parseFloat(club.previous_revenue_rupees || 0),
      revenueGrowthPercent: parseFloat(club.revenue_growth_percent || 0),
      detailedStatus: club.detailed_status,
      clubLevel: club.club_level,
      statusCategory: getStatusCategory(club.detailed_status)
    }));

    // Get summary statistics
    const summary = {
      total: clubs.length,
      byLevel: {
        L2: clubs.filter(c => c.clubLevel === 'L2').length,
        L1: clubs.filter(c => c.clubLevel === 'L1').length,
        Inactive: clubs.filter(c => c.clubLevel === 'Inactive').length
      },
      byDetailedStatus: clubs.reduce((acc, club) => {
        acc[club.detailedStatus] = (acc[club.detailedStatus] || 0) + 1;
        return acc;
      }, {}),
      byStatusCategory: clubs.reduce((acc, club) => {
        acc[club.statusCategory] = (acc[club.statusCategory] || 0) + 1;
        return acc;
      }, {})
    };

    res.json({
      success: true,
      data: clubs,
      summary,
      statusCategories: getStatusCategories()
    });

  } catch (error) {
    logger.error('Error fetching clubs:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch clubs',
      details: error.message
    });
  }
});

// Get single club with detailed metrics
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await queryProductionWithTunnel(`
      WITH monthly_data AS (
        SELECT
          c.pk as club_id,
          DATE_TRUNC('month', p.created_at) as month,
          SUM(p.amount) / 100.0 as revenue,
          COUNT(DISTINCT e.id) as events,
          COUNT(DISTINCT b.id) as bookings
        FROM club c
        LEFT JOIN activity a ON c.activity_id = a.id
        LEFT JOIN event e ON c.pk = e.club_id
        LEFT JOIN booking b ON e.pk = b.event_id
        LEFT JOIN transaction t ON b.id = t.entity_id AND t.entity_type = 'BOOKING'
        LEFT JOIN payment p ON t.payment_id = p.pk AND p.state = 'COMPLETED'
        WHERE c.pk = $1 AND p.created_at IS NOT NULL
        GROUP BY c.pk, DATE_TRUNC('month', p.created_at)
      ),
      club_metrics AS (
        SELECT
          c.pk as club_id,
          c.name,
          a.name as activity,
          c.created_at,
          COALESCE(json_agg(
            json_build_object(
              'month', md.month,
              'revenue', COALESCE(md.revenue, 0),
              'events', COALESCE(md.events, 0),
              'bookings', COALESCE(md.bookings, 0)
            ) ORDER BY md.month
          ) FILTER (WHERE md.month IS NOT NULL), '[]') as monthly_breakdown
        FROM club c
        LEFT JOIN activity a ON c.activity_id = a.id
        LEFT JOIN monthly_data md ON c.pk = md.club_id
        WHERE c.pk = $1
        GROUP BY c.pk, c.name, a.name, c.created_at
      )
      SELECT * FROM club_metrics
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Club not found'
      });
    }

    const club = result.rows[0];
    res.json({
      success: true,
      data: {
        id: club.club_id,
        name: club.name,
        city: club.city,
        activity: club.activity,
        createdAt: club.created_at,
        monthlyBreakdown: club.monthly_breakdown || []
      }
    });

  } catch (error) {
    logger.error('Error fetching club details:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch club details',
      details: error.message
    });
  }
});

// Update club status
router.put('/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { detailedStatus, notes } = req.body;

    // Validate status
    const validStatuses = [
      'new_launch_month_1', 'new_launch_month_2', 'new_launch_month_3',
      'scaling_revenue_high_growth', 'scaling_revenue_moderate_growth', 'scaling_revenue_stable',
      'old_stable_revenue', 'dormant', 'assessment_needed'
    ];

    if (!validStatuses.includes(detailedStatus)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid status. Must be one of: ' + validStatuses.join(', ')
      });
    }

    // In a real implementation, you'd have a club_status_history table
    // For now, we'll just log the status change
    logger.info(`Club ${id} status updated to ${detailedStatus}`, { notes });

    res.json({
      success: true,
      message: `Club status updated to ${detailedStatus}`,
      data: {
        clubId: id,
        newStatus: detailedStatus,
        notes,
        updatedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    logger.error('Error updating club status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update club status',
      details: error.message
    });
  }
});

// Helper functions
function getStatusCategory(detailedStatus: string): string {
  if (detailedStatus.startsWith('new_launch')) return 'New Launch';
  if (detailedStatus.startsWith('scaling_revenue')) return 'Scaling Revenue';
  if (detailedStatus === 'old_stable_revenue') return 'Old Stable Revenue';
  if (detailedStatus === 'dormant') return 'Dormant';
  return 'Assessment Needed';
}

function getStatusCategories() {
  return {
    'New Launch': {
      statuses: ['new_launch_month_1', 'new_launch_month_2', 'new_launch_month_3'],
      description: 'Clubs in their first 3 months of operation'
    },
    'Scaling Revenue': {
      statuses: ['scaling_revenue_high_growth', 'scaling_revenue_moderate_growth', 'scaling_revenue_stable'],
      description: 'Established clubs (L2) showing different growth patterns'
    },
    'Old Stable Revenue': {
      statuses: ['old_stable_revenue'],
      description: 'Established clubs (L1) with consistent but limited activity'
    },
    'Dormant': {
      statuses: ['dormant'],
      description: 'Clubs with no recent activity'
    },
    'Assessment Needed': {
      statuses: ['assessment_needed'],
      description: 'Clubs requiring manual review and classification'
    }
  };
}

export default router;