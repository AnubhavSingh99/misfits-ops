import { Router, Request, Response } from 'express';
import { getLocalPool } from '../services/database';
import { sendReplyNow, cancelReply, editReply } from '../services/sharkTank/replyQueue';

const router = Router();

// GET /api/shark-tank/pending-replies — all pending replies
router.get('/', async (_req: Request, res: Response) => {
  try {
    const pool = getLocalPool();
    const result = await pool.query(
      `SELECT pr.*, l.name as lead_name, l.instagram_handle, l.city
       FROM pending_replies pr
       JOIN leads l ON l.id = pr.lead_id
       WHERE pr.status = 'pending'
       ORDER BY pr.send_at ASC`
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('Error fetching pending replies:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch pending replies' });
  }
});

// PATCH /api/shark-tank/pending-replies/:id — edit reply text
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const { reply_text } = req.body;
    if (!reply_text) {
      return res.status(400).json({ success: false, error: 'reply_text required' });
    }
    const success = await editReply(parseInt(req.params.id), reply_text);
    if (!success) {
      return res.status(404).json({ success: false, error: 'Reply not found or already sent' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Error editing reply:', err);
    res.status(500).json({ success: false, error: 'Failed to edit reply' });
  }
});

// POST /api/shark-tank/pending-replies/:id/send-now — send immediately
router.post('/:id/send-now', async (req: Request, res: Response) => {
  try {
    const success = await sendReplyNow(parseInt(req.params.id));
    if (!success) {
      return res.status(404).json({ success: false, error: 'Reply not found or already sent' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Error sending reply:', err);
    res.status(500).json({ success: false, error: 'Failed to send reply' });
  }
});

// POST /api/shark-tank/pending-replies/:id/cancel — cancel reply
router.post('/:id/cancel', async (req: Request, res: Response) => {
  try {
    const success = await cancelReply(parseInt(req.params.id));
    if (!success) {
      return res.status(404).json({ success: false, error: 'Reply not found or already handled' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Error cancelling reply:', err);
    res.status(500).json({ success: false, error: 'Failed to cancel reply' });
  }
});

export default router;
