import { Router } from 'express';

const router = Router();

router.post('/login', (req, res) => {
  res.json({ success: true, message: 'Auth endpoint - coming soon' });
});

router.post('/logout', (req, res) => {
  res.json({ success: true, message: 'Logout successful' });
});

export default router;