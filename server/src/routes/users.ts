import { Router } from 'express';

const router = Router();

router.get('/profile', (req, res) => {
  res.json({ success: true, data: null, message: 'User profile endpoint - using mock data' });
});

export default router;