import { Router } from 'express';

const router = Router();

router.get('/', (req, res) => {
  res.json({ success: true, data: [], message: 'Notifications endpoint - using mock data' });
});

router.put('/:id/read', (req, res) => {
  res.json({ success: true, message: 'Mark notification as read - using mock data' });
});

export default router;