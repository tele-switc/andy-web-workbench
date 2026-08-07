import { Router } from 'express';
import { checkCredentials, issueToken, verifyToken } from '../auth.js';

const router = Router();

// POST /api/auth/login — authenticate and return a token
router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ success: false, error: '请输入用户名和密码' });
  }
  if (!checkCredentials(username, password)) {
    return res.status(401).json({ success: false, error: '用户名或密码错误' });
  }
  const token = issueToken(username);
  res.json({ success: true, data: { token, username } });
});

// POST /api/auth/verify — check if a token is still valid
router.post('/verify', (req, res) => {
  const { token } = req.body || {};
  if (!token) return res.status(400).json({ success: false, error: '缺少token' });
  res.json({ success: true, data: { valid: !!verifyToken(token) } });
});

export default router;