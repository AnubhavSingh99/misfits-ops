import { Router, Request, Response } from 'express';
import { logger } from '../utils/logger';
import {
  syncUserReports,
  getUserSafetyReports,
  updateReportStatus,
  blockUser,
  unblockUser,
  getSafetyStats,
  getBlockedUsers
} from '../services/userSafetyService';

const router = Router();

// ============================================
// STATS & DASHBOARD
// ============================================

/**
 * GET /api/user-safety/stats
 * Get user safety dashboard statistics
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const stats = await getSafetyStats();
    res.json(stats);
  } catch (error) {
    logger.error('Error fetching user safety stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// ============================================
// REPORTS MANAGEMENT
// ============================================

/**
 * GET /api/user-safety/reports
 * Get all user safety reports with optional filters
 */
router.get('/reports', async (req: Request, res: Response) => {
  try {
    const { status, reported_user_id, reporter_user_id, limit, offset } = req.query;

    const filters: any = {};
    if (status) filters.status = status as string;
    if (reported_user_id) filters.reported_user_id = parseInt(reported_user_id as string);
    if (reporter_user_id) filters.reporter_user_id = parseInt(reporter_user_id as string);
    if (limit) filters.limit = parseInt(limit as string);
    if (offset) filters.offset = parseInt(offset as string);

    const reports = await getUserSafetyReports(filters);
    res.json(reports);
  } catch (error) {
    logger.error('Error fetching user safety reports:', error);
    res.status(500).json({ error: 'Failed to fetch reports' });
  }
});

/**
 * POST /api/user-safety/sync
 * Sync user reports from misfits database
 */
router.post('/sync', async (req: Request, res: Response) => {
  try {
    const result = await syncUserReports();
    res.json({
      message: 'Sync completed',
      synced: result.synced,
      errors: result.errors
    });
  } catch (error) {
    logger.error('Error syncing user reports:', error);
    res.status(500).json({ error: 'Failed to sync reports' });
  }
});

/**
 * PATCH /api/user-safety/reports/:id/status
 * Update status of a user safety report
 */
router.patch('/reports/:id/status', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status, resolution_notes } = req.body;

    if (!status) {
      return res.status(400).json({ error: 'status is required' });
    }

    const validStatuses = ['created', 'in_progress', 'resolved'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
      });
    }

    const report = await updateReportStatus(
      parseInt(id),
      status,
      resolution_notes
    );

    res.json(report);
  } catch (error) {
    logger.error('Error updating report status:', error);
    res.status(500).json({ error: 'Failed to update report status' });
  }
});

// ============================================
// USER BLOCKING
// ============================================

/**
 * GET /api/user-safety/blocked-users
 * Get all blocked users from the platform
 */
router.get('/blocked-users', async (req: Request, res: Response) => {
  try {
    const blockedUsers = await getBlockedUsers();
    res.json(blockedUsers);
  } catch (error) {
    logger.error('Error fetching blocked users:', error);
    res.status(500).json({ error: 'Failed to fetch blocked users' });
  }
});

/**
 * POST /api/user-safety/block-user
 * Block a user on the Misfits platform
 */
router.post('/block-user', async (req: Request, res: Response) => {
  try {
    const { user_id, reason } = req.body;

    if (!user_id) {
      return res.status(400).json({ error: 'user_id is required' });
    }

    if (!reason) {
      return res.status(400).json({ error: 'reason is required' });
    }

    await blockUser(parseInt(user_id), reason);

    res.json({
      message: 'User blocked successfully',
      user_id: parseInt(user_id)
    });
  } catch (error) {
    logger.error('Error blocking user:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to block user'
    });
  }
});

/**
 * POST /api/user-safety/unblock-user
 * Unblock a user on the Misfits platform
 */
router.post('/unblock-user', async (req: Request, res: Response) => {
  try {
    const { user_id } = req.body;

    if (!user_id) {
      return res.status(400).json({ error: 'user_id is required' });
    }

    await unblockUser(parseInt(user_id));

    res.json({
      message: 'User unblocked successfully',
      user_id: parseInt(user_id)
    });
  } catch (error) {
    logger.error('Error unblocking user:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to unblock user'
    });
  }
});

export default router;
