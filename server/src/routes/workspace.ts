import { Router } from 'express';

const router = Router();

router.get('/', (req, res) => {
  res.json({ success: true, data: null, message: 'Workspace endpoint - using mock data' });
});

router.put('/', (req, res) => {
  res.json({ success: true, message: 'Workspace update endpoint - using mock data' });
});

export default router;