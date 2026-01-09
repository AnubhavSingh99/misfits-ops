import { Router } from 'express';
import { logger } from '../utils/logger';

const router = Router();

// Dashboard visibility configuration
// Set to true to show, false to hide
const DASHBOARD_CONFIG = {
  // Active dashboards
  'scaling-planner-v2': true,
  'leader-requirements': true,
  'venue-requirements': true,
  'health-dashboard': true,

  // Hidden dashboards (older/deprecated)
  'dashboard': false,
  'scaling-planner': false,
  'scaling-targets': false,
  'dimensional-dashboard': false,
  'poc-management': false,
  'workspace': false,
  'analytics': false,
  'revenue-growth': false,
  'scaling-upload': false,
  'wow-tracking': false,
};

// GET /api/config/dashboards - Get dashboard visibility config
router.get('/dashboards', async (req, res) => {
  try {
    res.json({
      success: true,
      dashboards: DASHBOARD_CONFIG
    });
  } catch (error) {
    logger.error('Failed to get dashboard config:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get dashboard config'
    });
  }
});

// GET /api/config/visible-dashboards - Get list of visible dashboard paths
router.get('/visible-dashboards', async (req, res) => {
  try {
    const visibleDashboards = Object.entries(DASHBOARD_CONFIG)
      .filter(([_, visible]) => visible)
      .map(([path]) => `/${path}`);

    // Always include root path for the default dashboard
    if (!visibleDashboards.includes('/')) {
      // Use scaling-planner-v2 as default
      visibleDashboards.unshift('/scaling-planner-v2');
    }

    res.json({
      success: true,
      visiblePaths: visibleDashboards,
      defaultPath: '/scaling-planner-v2'
    });
  } catch (error) {
    logger.error('Failed to get visible dashboards:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get visible dashboards'
    });
  }
});

export default router;
