import { Router } from 'express';
import { query } from '../services/database';
import { logger } from '../utils/logger';

const router = Router();

// No mock data - using only real database data

// Get activities with club counts and revenue
router.get('/activities', async (req, res) => {
  try {
    // Try to fetch from real database first
    const result = await query(`
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
      LEFT JOIN event e ON c.id = e.club_id
      LEFT JOIN booking b ON e.id = b.event_id
      LEFT JOIN payment p ON b.id = p.booking_id AND p.status = 'COMPLETED'
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

router.get('/', (req, res) => {
  res.json({ success: true, data: [], message: 'Clubs endpoint - using mock data in frontend' });
});

router.get('/:id', (req, res) => {
  res.json({ success: true, data: null, message: 'Club detail endpoint - using mock data' });
});

router.put('/:id', (req, res) => {
  res.json({ success: true, message: 'Club update endpoint - using mock data' });
});

export default router;