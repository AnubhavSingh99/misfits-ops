import { Router } from 'express';

const router = Router();

router.get('/', (req, res) => {
  res.json({ success: true, data: [], message: 'Tasks endpoint - using mock data' });
});

router.post('/', (req, res) => {
  res.json({ success: true, message: 'Create task endpoint - using mock data' });
});

export default router;