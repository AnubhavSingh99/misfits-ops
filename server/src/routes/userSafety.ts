import { Router } from 'express';
import * as userSafetyService from '../services/userSafetyService';
import { logger } from '../utils/logger';

const router = Router();

/**
 * GET /api/user-safety/stats
 * Get dashboard statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const stats = await userSafetyService.getSafetyStats();
    res.json(stats);
  } catch (error: any) {
    logger.error('Error fetching safety stats:', error);
    res.status(500).json({
      error: 'Failed to fetch safety stats',
      message: error.message
    });
  }
});

/**
 * GET /api/user-safety/reports
 * Get user safety reports with optional filters
 */
router.get('/reports', async (req, res) => {
  try {
    const filters: userSafetyService.UserSafetyReportFilters = {
      status: req.query.status as string,
      reported_user_id: req.query.reported_user_id ? parseInt(req.query.reported_user_id as string) : undefined,
      reporter_user_id: req.query.reporter_user_id ? parseInt(req.query.reporter_user_id as string) : undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
      offset: req.query.offset ? parseInt(req.query.offset as string) : undefined,
    };

    const reports = await userSafetyService.getUserSafetyReports(filters);
    res.json(reports);
  } catch (error: any) {
    logger.error('Error fetching user safety reports:', error);
    res.status(500).json({
      error: 'Failed to fetch user safety reports',
      message: error.message
    });
  }
});

/**
 * POST /api/user-safety/sync
 * Sync reports from misfits database
 */
router.post('/sync', async (req, res) => {
  try {
    const result = await userSafetyService.syncUserReports();
    res.json({
      success: true,
      synced: result.synced,
      errors: result.errors,
      message: `Synced ${result.synced} reports with ${result.errors} errors`
    });
  } catch (error: any) {
    logger.error('Error syncing user safety reports:', error);
    res.status(500).json({
      error: 'Failed to sync user safety reports',
      message: error.message
    });
  }
});

/**
 * PATCH /api/user-safety/reports/:id/status
 * Update report status
 */
router.patch('/reports/:id/status', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { status, resolution_notes } = req.body;

    if (!['created', 'in_progress', 'resolved'].includes(status)) {
      return res.status(400).json({
        error: 'Invalid status',
        message: 'Status must be created, in_progress, or resolved'
      });
    }

    const report = await userSafetyService.updateReportStatus(id, status, resolution_notes);
    res.json({
      success: true,
      report
    });
  } catch (error: any) {
    logger.error('Error updating report status:', error);
    res.status(500).json({
      error: 'Failed to update report status',
      message: error.message
    });
  }
});

/**
 * POST /api/user-safety/block-user
 * Block a user
 */
router.post('/block-user', async (req, res) => {
  try {
    const { user_id, reason } = req.body;

    if (!user_id) {
      return res.status(400).json({
        error: 'Missing user_id',
        message: 'user_id is required'
      });
    }

    await userSafetyService.blockUser(user_id, reason || 'Safety violation');
    res.json({
      success: true,
      message: `User ${user_id} blocked successfully`
    });
  } catch (error: any) {
    logger.error('Error blocking user:', error);
    res.status(500).json({
      error: 'Failed to block user',
      message: error.message
    });
  }
});

/**
 * POST /api/user-safety/unblock-user
 * Unblock a user
 */
router.post('/unblock-user', async (req, res) => {
  try {
    const { user_id } = req.body;

    if (!user_id) {
      return res.status(400).json({
        error: 'Missing user_id',
        message: 'user_id is required'
      });
    }

    await userSafetyService.unblockUser(user_id);
    res.json({
      success: true,
      message: `User ${user_id} unblocked successfully`
    });
  } catch (error: any) {
    logger.error('Error unblocking user:', error);
    res.status(500).json({
      error: 'Failed to unblock user',
      message: error.message
    });
  }
});

/**
 * GET /api/user-safety/blocked-users
 * Get all blocked users
 */
router.get('/blocked-users', async (req, res) => {
  try {
    const blockedUsers = await userSafetyService.getBlockedUsers();
    res.json(blockedUsers);
  } catch (error: any) {
    logger.error('Error fetching blocked users:', error);
    res.status(500).json({
      error: 'Failed to fetch blocked users',
      message: error.message
    });
  }
});

export default router;
