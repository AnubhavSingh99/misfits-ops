import express from 'express';
import { queryProduction } from '../services/database';
import { logger } from '../utils/logger';

const router = express.Router();

// GET /api/meetups - Basic meetups summary
router.get('/', async (req, res) => {
  try {
    res.json({
      success: true,
      totalMeetups: 0,
      monthlyMeetups: 0,
      averageAttendance: 0,
      message: "Meetups endpoint working - connect to production data for real metrics"
    });
  } catch (error) {
    logger.error('Failed to fetch meetups data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch meetups data',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;