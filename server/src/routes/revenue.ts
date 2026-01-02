import express from 'express';
import { queryProduction } from '../services/database';
import { logger } from '../utils/logger';

const router = express.Router();

// GET /api/revenue - Basic revenue summary
router.get('/', async (req, res) => {
  try {
    // Import the real revenue calculation logic from database.ts
    const { queryProductionWithTunnel } = await import('../services/sshTunnel');

    const revenueQuery = `
      SELECT
        DATE_TRUNC('month', p.created_at) as month,
        SUM(p.amount)/100.0 as total_revenue_rupees
      FROM payment p
      JOIN transaction t ON t.payment_id = p.pk
      JOIN booking b ON t.entity_id = b.id AND t.entity_type = 'BOOKING'
      JOIN event e ON b.event_id = e.pk
      JOIN club c ON e.club_id = c.pk
      WHERE p.state = 'COMPLETED'
        AND p.created_at >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '3 months')
        AND c.status = 'ACTIVE'
      GROUP BY DATE_TRUNC('month', p.created_at)
      ORDER BY month DESC
      LIMIT 4;
    `;

    const result = await queryProductionWithTunnel(revenueQuery);

    // Get current month revenue (January 2026)
    const currentMonthData = result.rows.find(row =>
      new Date(row.month).getMonth() === new Date().getMonth() &&
      new Date(row.month).getFullYear() === new Date().getFullYear()
    );
    const currentMonthRevenue = parseFloat(currentMonthData?.total_revenue_rupees || '0');

    // Calculate last 3 completed months average (Oct, Nov, Dec 2025)
    const last3Months = result.rows.filter(row => {
      const rowDate = new Date(row.month);
      const currentDate = new Date();
      return rowDate.getTime() < new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getTime();
    }).slice(0, 3);

    const averageMonthly = last3Months.reduce((sum, row) =>
      sum + parseFloat(row.total_revenue_rupees), 0
    ) / Math.max(last3Months.length, 1);

    // Use average of last 3 months as target (realistic expectation)
    const targetRevenue = averageMonthly;
    const progressPercentage = (currentMonthRevenue / targetRevenue) * 100;

    res.json({
      success: true,
      data: {
        current_revenue: Math.round(currentMonthRevenue * 100), // Convert to paisa
        target_revenue: Math.round(targetRevenue * 100),
        progress_percentage: Math.min(progressPercentage, 100),
        raw_data: result.rows
      }
    });
  } catch (error) {
    logger.error('Failed to fetch revenue data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch revenue data',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// GET /api/revenue/growth - Time-period growth analysis (PRD v8.1)
router.get('/growth', async (req, res) => {
  try {
    const {
      period1_start,
      period1_end,
      period2_start,
      period2_end,
      activity,
      city,
      poc_id
    } = req.query;

    // Validate required parameters
    if (!period1_start || !period1_end || !period2_start || !period2_end) {
      return res.status(400).json({
        error: 'Missing required parameters: period1_start, period1_end, period2_start, period2_end'
      });
    }

    let whereClause = '';
    let queryParams: any[] = [period1_start, period1_end, period2_start, period2_end];
    let paramIndex = 5;

    // Add filters
    if (activity && activity !== 'All') {
      whereClause += ` AND m.activity = $${paramIndex}`;
      queryParams.push(activity);
      paramIndex++;
    }

    if (city && city !== 'All') {
      whereClause += ` AND m.city = $${paramIndex}`;
      queryParams.push(city);
      paramIndex++;
    }

    if (poc_id) {
      whereClause += ` AND (m.activity_head_id = $${paramIndex} OR m.city_head_id = $${paramIndex})`;
      queryParams.push(poc_id);
      paramIndex++;
    }

    // Get growth analysis data
    const growthData = await query(`
      WITH period1_data AS (
        SELECT
          m.id,
          m.name,
          m.activity,
          m.city,
          m.actual_revenue,
          m.created_at,
          CASE
            WHEN m.created_at >= $1 THEN true
            ELSE false
          END as is_new_in_period1
        FROM meetups m
        WHERE m.created_at <= $2
        AND m.actual_revenue > 0
        ${whereClause}
      ),
      period2_data AS (
        SELECT
          m.id,
          m.name,
          m.activity,
          m.city,
          m.actual_revenue,
          m.created_at,
          CASE
            WHEN m.created_at >= $3 THEN true
            ELSE false
          END as is_new_in_period2
        FROM meetups m
        WHERE m.created_at <= $4
        AND m.actual_revenue > 0
        ${whereClause}
      ),
      growth_analysis AS (
        SELECT
          COALESCE(p1.id, p2.id) as meetup_id,
          COALESCE(p1.name, p2.name) as meetup_name,
          COALESCE(p1.activity, p2.activity) as activity,
          COALESCE(p1.city, p2.city) as city,
          COALESCE(p1.actual_revenue, 0) as period1_revenue,
          COALESCE(p2.actual_revenue, 0) as period2_revenue,
          COALESCE(p2.actual_revenue, 0) - COALESCE(p1.actual_revenue, 0) as revenue_growth,
          CASE
            WHEN p1.id IS NULL THEN 'new'
            ELSE 'existing'
          END as club_type,
          p2.is_new_in_period2
        FROM period1_data p1
        FULL OUTER JOIN period2_data p2 ON p1.id = p2.id
        WHERE p2.id IS NOT NULL  -- Only include clubs that exist in period2
      )
      SELECT
        -- Overall metrics
        SUM(period1_revenue) as total_period1_revenue,
        SUM(period2_revenue) as total_period2_revenue,
        SUM(revenue_growth) as total_growth,
        ROUND(
          CASE
            WHEN SUM(period1_revenue) > 0
            THEN (SUM(revenue_growth) / SUM(period1_revenue)) * 100
            ELSE 0
          END, 2
        ) as growth_percentage,

        -- Growth attribution
        SUM(CASE WHEN club_type = 'existing' THEN revenue_growth ELSE 0 END) as existing_club_growth,
        SUM(CASE WHEN club_type = 'new' THEN period2_revenue ELSE 0 END) as new_club_revenue,

        -- Club counts
        COUNT(*) as total_clubs,
        COUNT(CASE WHEN club_type = 'existing' THEN 1 END) as existing_clubs,
        COUNT(CASE WHEN club_type = 'new' THEN 1 END) as new_clubs,

        -- JSON aggregation of club details
        json_agg(
          json_build_object(
            'meetup_id', meetup_id,
            'name', meetup_name,
            'activity', activity,
            'city', city,
            'period1_revenue', period1_revenue,
            'period2_revenue', period2_revenue,
            'growth', revenue_growth,
            'growth_percentage', CASE
              WHEN period1_revenue > 0
              THEN ROUND((revenue_growth / period1_revenue) * 100, 2)
              ELSE NULL
            END,
            'type', club_type
          )
          ORDER BY revenue_growth DESC
        ) as club_details
      FROM growth_analysis
    `, queryParams);

    const result = growthData.rows[0];

    res.json({
      success: true,
      period1: {
        start: period1_start,
        end: period1_end,
        revenue: parseFloat(result.total_period1_revenue || 0)
      },
      period2: {
        start: period2_start,
        end: period2_end,
        revenue: parseFloat(result.total_period2_revenue || 0)
      },
      totalGrowth: {
        absoluteGrowth: parseFloat(result.total_growth || 0),
        percentGrowth: parseFloat(result.growth_percentage || 0)
      },
      attribution: {
        existingClubs: {
          revenue: parseFloat(result.existing_club_growth || 0),
          percentage: result.total_growth > 0
            ? Math.round((result.existing_club_growth / result.total_growth) * 100)
            : 0
        },
        newClubs: {
          revenue: parseFloat(result.new_club_revenue || 0),
          percentage: result.total_growth > 0
            ? Math.round((result.new_club_revenue / result.total_growth) * 100)
            : 0
        }
      },
      clubCounts: {
        total: result.total_clubs || 0,
        existing: result.existing_clubs || 0,
        new: result.new_clubs || 0
      },
      clubDetails: result.club_details || [],
      filters: {
        activity,
        city,
        poc_id
      }
    });

  } catch (error) {
    logger.error('Failed to fetch revenue growth analysis:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch revenue growth analysis'
    });
  }
});

// GET /api/revenue/compare - Compare two specific periods
router.get('/compare', async (req, res) => {
  try {
    const { periods, activity, city, poc_id } = req.query;

    if (!periods) {
      return res.status(400).json({
        error: 'Missing periods parameter (should be JSON array)'
      });
    }

    const periodList = JSON.parse(periods as string);

    if (periodList.length !== 2) {
      return res.status(400).json({
        error: 'Exactly 2 periods required for comparison'
      });
    }

    // Use the growth endpoint with dynamic periods
    const compareData = await query(`
      SELECT
        activity,
        city,
        SUM(CASE WHEN created_at BETWEEN $1 AND $2 THEN actual_revenue ELSE 0 END) as period1_revenue,
        SUM(CASE WHEN created_at BETWEEN $3 AND $4 THEN actual_revenue ELSE 0 END) as period2_revenue,
        COUNT(CASE WHEN created_at BETWEEN $1 AND $2 THEN 1 END) as period1_count,
        COUNT(CASE WHEN created_at BETWEEN $3 AND $4 THEN 1 END) as period2_count
      FROM meetups
      WHERE (created_at BETWEEN $1 AND $2 OR created_at BETWEEN $3 AND $4)
      GROUP BY activity, city
      ORDER BY period2_revenue DESC
    `, [
      periodList[0].start,
      periodList[0].end,
      periodList[1].start,
      periodList[1].end
    ]);

    res.json({
      success: true,
      comparison: compareData.rows,
      periods: periodList
    });

  } catch (error) {
    logger.error('Failed to compare periods:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to compare periods'
    });
  }
});

// GET /api/revenue/attribution - Growth attribution analysis
router.get('/attribution', async (req, res) => {
  try {
    const { start_date, end_date, activity, city } = req.query;

    const attributionData = await query(`
      WITH club_ages AS (
        SELECT
          m.*,
          EXTRACT(MONTHS FROM AGE(CURRENT_DATE, m.created_at)) as age_months,
          CASE
            WHEN m.created_at >= CURRENT_DATE - INTERVAL '3 months' THEN 'new'
            WHEN m.created_at >= CURRENT_DATE - INTERVAL '12 months' THEN 'recent'
            ELSE 'established'
          END as club_maturity
        FROM meetups m
        WHERE m.actual_revenue > 0
        ${start_date ? `AND m.created_at >= '${start_date}'` : ''}
        ${end_date ? `AND m.created_at <= '${end_date}'` : ''}
        ${activity && activity !== 'All' ? `AND m.activity = '${activity}'` : ''}
        ${city && city !== 'All' ? `AND m.city = '${city}'` : ''}
      )
      SELECT
        club_maturity,
        COUNT(*) as club_count,
        SUM(actual_revenue) as total_revenue,
        AVG(actual_revenue) as avg_revenue_per_club,
        ROUND(AVG(age_months), 1) as avg_age_months
      FROM club_ages
      GROUP BY club_maturity
      ORDER BY total_revenue DESC
    `);

    res.json({
      success: true,
      attribution: attributionData.rows,
      filters: { start_date, end_date, activity, city }
    });

  } catch (error) {
    logger.error('Failed to fetch attribution data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch attribution data'
    });
  }
});

// GET /api/revenue/trends - Historical trends by club
router.get('/trends', async (req, res) => {
  try {
    const { club_id, months = 6 } = req.query;

    let whereClause = '';
    let queryParams = [months];

    if (club_id) {
      whereClause = 'AND m.id = $2';
      queryParams.push(club_id);
    }

    const trendsData = await query(`
      SELECT
        m.id,
        m.name,
        m.activity,
        m.city,
        m.actual_revenue,
        m.created_at,
        DATE_TRUNC('month', m.updated_at) as month,
        LAG(m.actual_revenue) OVER (PARTITION BY m.id ORDER BY m.updated_at) as previous_revenue,
        m.actual_revenue - LAG(m.actual_revenue) OVER (PARTITION BY m.id ORDER BY m.updated_at) as revenue_change
      FROM meetups m
      WHERE m.updated_at >= CURRENT_DATE - INTERVAL '$1 months'
      ${whereClause}
      ORDER BY m.id, m.updated_at
    `, queryParams);

    res.json({
      success: true,
      trends: trendsData.rows,
      timeframe_months: months
    });

  } catch (error) {
    logger.error('Failed to fetch trends:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch trends'
    });
  }
});

// POST /api/revenue/record-history - Record revenue snapshot for historical tracking
router.post('/record-history', async (req, res) => {
  try {
    const { date } = req.body;
    const snapshotDate = date || new Date().toISOString().split('T')[0];

    // Record current revenue state for all active meetups
    await query(`
      INSERT INTO revenue_history (
        club_id, meetup_id, year, month, week, date,
        revenue_amount, meetups_conducted, capacity_achieved,
        is_new_club, club_age_months
      )
      SELECT
        m.club_id,
        m.id,
        EXTRACT(YEAR FROM $1::date),
        EXTRACT(MONTH FROM $1::date),
        EXTRACT(WEEK FROM $1::date),
        $1::date,
        m.actual_revenue,
        1, -- Assuming 1 meetup conducted
        m.capacity_utilization,
        CASE WHEN m.created_at >= $1::date - INTERVAL '1 month' THEN true ELSE false END,
        EXTRACT(MONTHS FROM AGE($1::date, m.created_at))
      FROM meetups m
      WHERE m.actual_revenue > 0
      ON CONFLICT DO NOTHING
    `, [snapshotDate]);

    res.json({
      success: true,
      message: 'Revenue history recorded successfully',
      snapshot_date: snapshotDate
    });

  } catch (error) {
    logger.error('Failed to record revenue history:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to record revenue history'
    });
  }
});

// GET /api/revenue-growth - Simple endpoint for the frontend dashboard
router.get('/revenue-growth', async (req, res) => {
  try {
    // Get monthly revenue data (completed payments in rupees)
    const monthlyData = await query(`
      SELECT
        DATE_TRUNC('month', p.created_at) as month,
        SUM(p.amount)/100.0 as total_revenue_rupees
      FROM payment p
      JOIN booking b ON p.booking_id = b.pk
      JOIN event e ON b.event_id = e.pk
      JOIN club c ON e.club_id = c.pk
      WHERE p.status = 'COMPLETED'
      AND p.created_at >= CURRENT_DATE - INTERVAL '6 months'
      AND c.status = 'ACTIVE'
      GROUP BY DATE_TRUNC('month', p.created_at)
      ORDER BY month
    `);

    // Get club L1/L2 analysis
    const clubAnalysis = await query(`
      SELECT
        COUNT(DISTINCT c.pk) as total_active_clubs,
        SUM(CASE WHEN (COUNT(DISTINCT e.id) / NULLIF(COUNT(DISTINCT DATE_TRUNC('week', e.created_at)), 0)) >= 2 THEN 1 ELSE 0 END) as l2_clubs,
        SUM(CASE WHEN (COUNT(DISTINCT e.id) / NULLIF(COUNT(DISTINCT DATE_TRUNC('week', e.created_at)), 0)) >= 1 AND (COUNT(DISTINCT e.id) / NULLIF(COUNT(DISTINCT DATE_TRUNC('week', e.created_at)), 0)) < 2 THEN 1 ELSE 0 END) as l1_clubs,
        AVG(COUNT(DISTINCT e.id) / NULLIF(COUNT(DISTINCT DATE_TRUNC('week', e.created_at)), 0)) as avg_events_per_week
      FROM club c
      LEFT JOIN event e ON c.pk = e.club_id AND e.created_at >= CURRENT_DATE - INTERVAL '90 days'
      WHERE c.status = 'ACTIVE'
      GROUP BY c.pk, c.name, c.activity
    `);

    // Get top activities by revenue with growth calculation
    const topActivities = await query(`
      WITH current_month AS (
        SELECT
          c.activity,
          SUM(p.amount)/100.0 as current_revenue
        FROM payment p
        JOIN booking b ON p.booking_id = b.pk
        JOIN event e ON b.event_id = e.pk
        JOIN club c ON e.club_id = c.pk
        WHERE p.status = 'COMPLETED'
        AND p.created_at >= DATE_TRUNC('month', CURRENT_DATE)
        AND c.status = 'ACTIVE'
        GROUP BY c.activity
      ),
      previous_month AS (
        SELECT
          c.activity,
          SUM(p.amount)/100.0 as previous_revenue
        FROM payment p
        JOIN booking b ON p.booking_id = b.pk
        JOIN event e ON b.event_id = e.pk
        JOIN club c ON e.club_id = c.pk
        WHERE p.status = 'COMPLETED'
        AND p.created_at >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')
        AND p.created_at < DATE_TRUNC('month', CURRENT_DATE)
        AND c.status = 'ACTIVE'
        GROUP BY c.activity
      ),
      total_activity_revenue AS (
        SELECT
          c.activity,
          SUM(p.amount)/100.0 as revenue,
          COUNT(DISTINCT e.id) as events,
          (SUM(p.amount)/100.0 / NULLIF(COUNT(DISTINCT e.id), 0)) as revenue_per_event
        FROM payment p
        JOIN booking b ON p.booking_id = b.pk
        JOIN event e ON b.event_id = e.pk
        JOIN club c ON e.club_id = c.pk
        WHERE p.status = 'COMPLETED'
        AND p.created_at >= CURRENT_DATE - INTERVAL '3 months'
        AND c.status = 'ACTIVE'
        GROUP BY c.activity
      )
      SELECT
        tar.activity,
        tar.revenue,
        tar.events,
        tar.revenue_per_event,
        CASE
          WHEN pm.previous_revenue > 0 THEN
            ROUND(((cm.current_revenue - pm.previous_revenue) / pm.previous_revenue * 100)::numeric, 1)
          ELSE 0
        END as growth_percent
      FROM total_activity_revenue tar
      LEFT JOIN current_month cm ON tar.activity = cm.activity
      LEFT JOIN previous_month pm ON tar.activity = pm.activity
      ORDER BY tar.revenue DESC
      LIMIT 5
    `);

    // Calculate total growth
    const currentMonthRevenue = monthlyData.rows[monthlyData.rows.length - 1]?.total_revenue_rupees || 0;
    const previousMonthRevenue = monthlyData.rows[monthlyData.rows.length - 2]?.total_revenue_rupees || 0;
    const percentGrowth = previousMonthRevenue > 0
      ? ((currentMonthRevenue - previousMonthRevenue) / previousMonthRevenue) * 100
      : 0;

    // Format the response to match frontend expectations
    const response = {
      totalGrowth: {
        currentTotal: parseFloat(currentMonthRevenue),
        previousTotal: parseFloat(previousMonthRevenue),
        percentGrowth: parseFloat(percentGrowth.toFixed(1))
      },
      monthlyData: monthlyData.rows.map(row => ({
        month: row.month,
        total_revenue_rupees: parseFloat(row.total_revenue_rupees)
      })),
      topActivities: topActivities.rows.map(row => ({
        activity: row.activity,
        revenue: parseFloat(row.revenue),
        growth: parseFloat(row.growth_percent || 0)
      })),
      clubAnalysis: {
        totalActiveClubs: parseInt(clubAnalysis.rows[0]?.total_active_clubs || 0),
        l2Clubs: parseInt(clubAnalysis.rows[0]?.l2_clubs || 0),
        l1Clubs: parseInt(clubAnalysis.rows[0]?.l1_clubs || 0),
        avgEventsPerWeek: parseFloat(clubAnalysis.rows[0]?.avg_events_per_week || 0)
      }
    };

    res.json(response);

  } catch (error) {
    logger.error('Failed to fetch revenue growth data:', error);
    res.status(500).json({
      error: 'Failed to fetch revenue growth data'
    });
  }
});

export default router;