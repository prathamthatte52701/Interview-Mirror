import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { requireDatabase, getDbStatus } from '../config/db.js';
import { requireAuth, requireAdmin, adminSafeUser } from '../middleware/auth.js';
import { makeLimiter, getRecentRateLimitHitCount } from '../middleware/rateLimit.js';
import { hasAI } from '../lib/aiProvider.js';
import { deleteUserAndSessions } from '../lib/accountLifecycle.js';
import logger from '../lib/logger.js';
import User from '../models/User.js';
import InterviewSession from '../models/InterviewSession.js';

const router = express.Router();

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function pagination(query) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
  return { page, limit, skip: (page - 1) * limit };
}

/* ── ADMIN LOGIN ── */
const adminLoginLimiter = makeLimiter({ windowMs: 15 * 60 * 1000, max: 5, prefix: 'rl:adminLogin:' });

router.post('/login', adminLoginLimiter, requireDatabase, async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const password = String(req.body.password || '');

  try {
    if (!email || !password) {
      logger.warn('admin_login_attempt', { email, success: false, reason: 'missing_credentials' });
      return res.status(400).json({ success: false, message: 'Email and password are required.' });
    }
    if (!process.env.JWT_SECRET) {
      return res.status(500).json({ success: false, message: 'Authentication is not configured.' });
    }

    const user = await User.findOne({ email, role: 'admin' });
    if (!user) {
      logger.warn('admin_login_attempt', { email, success: false, reason: 'no_such_admin' });
      return res.status(401).json({ success: false, message: 'Invalid admin credentials.' });
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) {
      logger.warn('admin_login_attempt', { email, success: false, reason: 'bad_password' });
      return res.status(401).json({ success: false, message: 'Invalid admin credentials.' });
    }

    const token = jwt.sign(
      { userId: String(user._id), email: user.email, role: 'admin' },
      process.env.JWT_SECRET,
      { expiresIn: '2h' }
    );

    logger.info('admin_login_attempt', { email, success: true });
    res.json({ success: true, token, user: adminSafeUser(user) });
  } catch (error) {
    logger.error('admin_login_error', { message: error?.message || String(error) });
    res.status(500).json({ success: false, message: 'Unable to log in. Please try again.' });
  }
});

router.use(requireAuth, requireAdmin);

/* ── HEALTH ── */
router.get('/health', (req, res) => {
  const db = getDbStatus();
  res.json({
    success: true,
    db: { connected: db.connected, error: db.error || '' },
    aiMode: hasAI() ? 'gemini' : 'heuristic',
    uptimeSeconds: Math.round(process.uptime()),
    recentRateLimitHits: getRecentRateLimitHitCount()
  });
});

/* ── USERS ── */
router.get('/users', async (req, res) => {
  try {
    const { page, limit, skip } = pagination(req.query);
    const search = String(req.query.search || '').trim();
    const filter = search
      ? {
        $or: [
          { email: new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') },
          { username: new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }
        ]
      }
      : {};

    const [items, total] = await Promise.all([
      User.find(filter).select('-passwordHash -recoveryCodeHash').sort({ createdAt: -1 }).skip(skip).limit(limit),
      User.countDocuments(filter)
    ]);

    res.json({ success: true, items: items.map(adminSafeUser), total, page, limit });
  } catch (error) {
    logger.error('admin_users_list_error', { message: error?.message });
    res.status(500).json({ success: false, message: 'Unable to load users.' });
  }
});

router.patch('/users/:id/ban', async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(req.params.id, { status: 'banned' }, { returnDocument: 'after' });
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
    logger.info('admin_action', { action: 'ban', targetUserId: req.params.id, adminId: String(req.userId) });
    res.json({ success: true, user: adminSafeUser(user) });
  } catch (error) {
    logger.error('admin_ban_error', { message: error?.message });
    res.status(500).json({ success: false, message: 'Unable to ban user.' });
  }
});

router.patch('/users/:id/unban', async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(req.params.id, { status: 'active' }, { returnDocument: 'after' });
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
    logger.info('admin_action', { action: 'unban', targetUserId: req.params.id, adminId: String(req.userId) });
    res.json({ success: true, user: adminSafeUser(user) });
  } catch (error) {
    logger.error('admin_unban_error', { message: error?.message });
    res.status(500).json({ success: false, message: 'Unable to unban user.' });
  }
});

router.delete('/users/:id', async (req, res) => {
  if (req.body?.confirm !== true) {
    return res.status(400).json({ success: false, message: 'Set { confirm: true } in the request body to permanently delete this user.' });
  }
  try {
    const user = await deleteUserAndSessions(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
    logger.info('admin_action', { action: 'delete_cascade', targetUserId: req.params.id, adminId: String(req.userId) });
    res.json({ success: true, message: 'User and their sessions deleted.' });
  } catch (error) {
    logger.error('admin_delete_error', { message: error?.message });
    res.status(500).json({ success: false, message: 'Unable to delete user.' });
  }
});

/* ── SESSIONS (view-only) ── */
router.get('/sessions', async (req, res) => {
  try {
    const { page, limit, skip } = pagination(req.query);
    const filter = {};
    if (req.query.userId) filter.userId = req.query.userId;

    const [items, total] = await Promise.all([
      InterviewSession.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      InterviewSession.countDocuments(filter)
    ]);

    logger.info('admin_action', { action: 'view_sessions', adminId: String(req.userId) });
    res.json({ success: true, items, total, page, limit });
  } catch (error) {
    logger.error('admin_sessions_list_error', { message: error?.message });
    res.status(500).json({ success: false, message: 'Unable to load sessions.' });
  }
});

export default router;
