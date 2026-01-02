import express from 'express';
import { logger } from '../utils/logger';

const router = express.Router();

// GET /api/trends/revenue - Revenue trend data
router.get('/revenue', async (req, res) => {
  try {
    const { period, startDate, endDate } = req.query;
    const { queryProductionWithTunnel } = await import('../services/sshTunnel');

    let dateGrouping = '';
    let timeInterval = '';

    switch (period) {
      case 'wow':
        dateGrouping = "DATE_TRUNC('week', p.created_at)";
        timeInterval = "INTERVAL '8 weeks'";
        break;
      case 'mom':
        dateGrouping = "DATE_TRUNC('month', p.created_at)";
        timeInterval = "INTERVAL '6 months'";
        break;
      case 'yearly':
        dateGrouping = "DATE_TRUNC('year', p.created_at)";
        timeInterval = "INTERVAL '3 years'";
        break;
      default:
        dateGrouping = "DATE_TRUNC('week', p.created_at)";
        timeInterval = "INTERVAL '8 weeks'";
    }

    let dateFilter = `p.created_at >= CURRENT_DATE - ${timeInterval}`;
    if (startDate && endDate) {
      dateFilter = `p.created_at >= '${startDate}' AND p.created_at <= '${endDate}'`;
    }

    const revenueQuery = `
      SELECT
        ${dateGrouping} as period,
        SUM(p.amount)/100.0 as revenue_rupees
      FROM payment p
      JOIN transaction t ON t.payment_id = p.pk
      JOIN booking b ON t.entity_id = b.id AND t.entity_type = 'BOOKING'
      JOIN event e ON b.event_id = e.pk
      JOIN club c ON e.club_id = c.pk
      WHERE p.state = 'COMPLETED'
        AND ${dateFilter}
        AND c.status = 'ACTIVE'
      GROUP BY ${dateGrouping}
      ORDER BY period ASC;
    `;

    const result = await queryProductionWithTunnel(revenueQuery);
    res.json({ data: result.rows || [], success: true });

  } catch (error) {
    logger.error('Failed to fetch revenue trend:', error);
    res.status(500).json({
      error: 'Failed to fetch revenue trend',
      message: error instanceof Error ? error.message : 'Unknown error',
      success: false
    });
  }
});

// GET /api/trends/meetups - Meetup trend data
router.get('/meetups', async (req, res) => {
  try {
    const { period, startDate, endDate } = req.query;
    const { queryProductionWithTunnel } = await import('../services/sshTunnel');

    let dateGrouping = '';
    let timeInterval = '';

    switch (period) {
      case 'wow':
        dateGrouping = "DATE_TRUNC('week', e.created_at)";
        timeInterval = "INTERVAL '8 weeks'";
        break;
      case 'mom':
        dateGrouping = "DATE_TRUNC('month', e.created_at)";
        timeInterval = "INTERVAL '6 months'";
        break;
      case 'yearly':
        dateGrouping = "DATE_TRUNC('year', e.created_at)";
        timeInterval = "INTERVAL '3 years'";
        break;
      default:
        dateGrouping = "DATE_TRUNC('week', e.created_at)";
        timeInterval = "INTERVAL '8 weeks'";
    }

    let dateFilter = `e.created_at >= CURRENT_DATE - ${timeInterval}`;
    if (startDate && endDate) {
      dateFilter = `e.created_at >= '${startDate}' AND e.created_at <= '${endDate}'`;
    }

    const meetupsQuery = `
      SELECT
        ${dateGrouping} as period,
        COUNT(e.id) as meetup_count
      FROM event e
      JOIN club c ON e.club_id = c.pk
      WHERE ${dateFilter}
        AND c.status = 'ACTIVE'
        AND e.status != 'CANCELLED'
      GROUP BY ${dateGrouping}
      ORDER BY period ASC;
    `;

    const result = await queryProductionWithTunnel(meetupsQuery);
    res.json({ data: result.rows || [], success: true });

  } catch (error) {
    logger.error('Failed to fetch meetup trend:', error);
    res.status(500).json({
      error: 'Failed to fetch meetup trend',
      message: error instanceof Error ? error.message : 'Unknown error',
      success: false
    });
  }
});

// GET /api/trends/attendance - Attendance trend data
router.get('/attendance', async (req, res) => {
  try {
    const { period, startDate, endDate } = req.query;
    const { queryProductionWithTunnel } = await import('../services/sshTunnel');

    let dateGrouping = '';
    let timeInterval = '';

    switch (period) {
      case 'wow':
        dateGrouping = "DATE_TRUNC('week', e.created_at)";
        timeInterval = "INTERVAL '8 weeks'";
        break;
      case 'mom':
        dateGrouping = "DATE_TRUNC('month', e.created_at)";
        timeInterval = "INTERVAL '6 months'";
        break;
      case 'yearly':
        dateGrouping = "DATE_TRUNC('year', e.created_at)";
        timeInterval = "INTERVAL '3 years'";
        break;
      default:
        dateGrouping = "DATE_TRUNC('week', e.created_at)";
        timeInterval = "INTERVAL '8 weeks'";
    }

    let dateFilter = `e.created_at >= CURRENT_DATE - ${timeInterval}`;
    if (startDate && endDate) {
      dateFilter = `e.created_at >= '${startDate}' AND e.created_at <= '${endDate}'`;
    }

    const attendanceQuery = `
      SELECT
        ${dateGrouping} as period,
        COUNT(b.id) as total_attendees
      FROM event e
      JOIN club c ON e.club_id = c.pk
      JOIN booking b ON b.event_id = e.pk
      WHERE ${dateFilter}
        AND c.status = 'ACTIVE'
        AND e.status != 'CANCELLED'
        AND b.status = 'CONFIRMED'
      GROUP BY ${dateGrouping}
      ORDER BY period ASC;
    `;

    const result = await queryProductionWithTunnel(attendanceQuery);
    res.json({ data: result.rows || [], success: true });

  } catch (error) {
    logger.error('Failed to fetch attendance trend:', error);
    res.status(500).json({
      error: 'Failed to fetch attendance trend',
      message: error instanceof Error ? error.message : 'Unknown error',
      success: false
    });
  }
});

export default router;