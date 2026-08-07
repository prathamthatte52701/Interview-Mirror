import jwt from 'jsonwebtoken';
import { DATABASE_UNAVAILABLE_MESSAGE, ensureDatabase } from '../config/db.js';
import User from '../models/User.js';

export function safeUser(user) {
  return {
    id: String(user._id),
    fullName: user.fullName || '',
    username: user.username,
    email: user.email,
    contactNumber: user.contactNumber,
    city: user.city,
    address: user.address || '',
    accountType: user.accountType || 'Prototype User',
    createdAt: user.createdAt
  };
}

export async function requireAuth(req, res, next) {
  const header = req.get('Authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';

  if (!token) {
    return res.status(401).json({ success: false, message: 'Authentication required.' });
  }

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET || '');
  } catch {
    return res.status(401).json({ success: false, message: 'Session expired. Please log in again.' });
  }

  // Guest bypass — no MongoDB lookup needed
  if (payload.isGuest) {
    req.user = payload;
    req.userId = null;
    return next();
  }

  // Real users — database required
  if (!(await ensureDatabase())) {
    return res.status(503).json({
      success: false,
      message: DATABASE_UNAVAILABLE_MESSAGE
    });
  }

  try {
    const user = await User.findById(payload.userId).select('-passwordHash');
    if (!user) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }
    req.userId = user._id;
    req.user = user;
    next();
  } catch {
    res.status(401).json({ success: false, message: 'Session expired. Please log in again.' });
  }
}
