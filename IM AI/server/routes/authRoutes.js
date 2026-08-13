import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { nanoid } from 'nanoid';
import { DATABASE_UNAVAILABLE_MESSAGE, requireDatabase } from '../config/db.js';
import { requireAuth, safeUser } from '../middleware/auth.js';
import { makeLimiter, userKeyGenerator } from '../middleware/rateLimit.js';
import { generateRawRecoveryCode, formatRecoveryCode, normalizeRecoveryCodeInput } from '../lib/recoveryCode.js';
import { deleteUserAndSessions } from '../lib/accountLifecycle.js';
import logger from '../lib/logger.js';
import City, { normalizeCityName } from '../models/City.js';
import User from '../models/User.js';

const router = express.Router();

const FULL_NAME_REGEX = /^[A-Za-z][A-Za-z .'-]*$/;

const ALLOWED_CITIES = new Set([
  'Mumbai', 'Delhi', 'Bangalore', 'Hyderabad', 'Ahmedabad',
  'Chennai', 'Kolkata', 'Surat', 'Pune', 'Jaipur',
  'Lucknow', 'Kanpur', 'Nagpur', 'Indore', 'Thane',
  'Bhopal', 'Visakhapatnam', 'Patna', 'Vadodara', 'Ghaziabad',
  'Ludhiana', 'Agra', 'Nashik', 'Faridabad', 'Meerut',
  'Rajkot', 'Varanasi', 'Srinagar', 'Aurangabad', 'Dhanbad'
]);

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function normalizeUsername(username) {
  return String(username || '').trim();
}

function normalizeFullName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function usernameKey(username) {
  return normalizeUsername(username);
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

function passwordPolicyError(password) {
  const value = String(password || '');
  if (/\s/.test(value)) return 'Password cannot contain spaces.';
  if (value.length < 8 || value.length > 64) return 'Password must be between 8 and 64 characters.';
  if (!/[A-Z]/.test(value)) return 'Use at least 1 uppercase letter.';
  if (!/[a-z]/.test(value)) return 'Use at least 1 lowercase letter.';
  if (!/\d/.test(value)) return 'Use at least 1 number.';
  if (!/[^A-Za-z0-9\s]/.test(value)) return 'Use at least 1 special character.';
  return '';
}

function cleanContactNumber(value) {
  return String(value || '').replace(/\D/g, '');
}

function addressWordCount(value) {
  const text = String(value || '').trim();
  return text ? text.split(/\s+/).length : 0;
}

function hasLongAddressWord(value) {
  const text = String(value || '').trim();
  if (!text) return false;
  return text.split(/\s+/).some((word) => word.length > 14);
}

async function isAllowedCity(city) {
  if (!city) return true;
  if (ALLOWED_CITIES.has(city)) return true;

  const existingCity = await City.findOne({
    countryCode: 'IN',
    normalizedName: normalizeCityName(city),
    isActive: true
  }).select('_id');

  return Boolean(existingCity);
}

async function validateSignup(body) {
  const fullName = normalizeFullName(body.fullName);
  const username = normalizeUsername(body.username);
  const email = normalizeEmail(body.email);
  const contactNumber = cleanContactNumber(body.contactNumber);
  const city = String(body.city || '').trim();
  const address = String(body.address || '').trim();

  if (!fullName) return { message: 'Full name is required.' };
  if (fullName.length < 2) return { message: 'Full name must be at least 2 characters.' };
  if (fullName.length > 40) return { message: 'Full name can be maximum 40 characters.' };
  if (!FULL_NAME_REGEX.test(fullName)) return { message: "Full name can only contain letters, spaces, apostrophes, hyphens, and periods, and must start with a letter." };
  if (!username) return { message: 'Username is required.' };
  if (/\s/.test(username)) return { message: 'Username cannot contain spaces.' };
  if (username.length < 3) return { message: 'Username must be at least 3 characters.' };
  if (username.length > 12) return { message: 'Username can be maximum 12 characters.' };
  if (!email) return { message: 'Email is required.' };
  if (!isValidEmail(email)) return { message: 'Enter a valid email address.' };
  if (!body.password) return { message: 'Password is required.' };

  const pwdError = passwordPolicyError(body.password);
  if (pwdError) return { message: pwdError };

  if (!contactNumber) return { message: 'Contact number is required.' };
  if (!/^[6-9]\d{9}$/.test(contactNumber)) return { message: 'Contact number must be a valid 10-digit Indian mobile number.' };
  if (address && !/^[A-Za-z0-9 ,.\-]+$/.test(address)) return { message: 'Address can only contain English letters, numbers, spaces, commas, dots, and hyphens.' };
  if (addressWordCount(address) > 50) return { message: 'Address can be maximum 50 words.' };
  if (hasLongAddressWord(address)) return { message: 'Each address word can be maximum 14 characters.' };
  if (city && !(await isAllowedCity(city))) return { message: 'Select a valid city.' };

  return { fullName, username, email, contactNumber, city, address };
}

/* ── SIGNUP ── */
const signupLimiter = makeLimiter({ windowMs: 60 * 60 * 1000, max: 10, prefix: 'rl:signup:' });

router.post('/signup', signupLimiter, requireDatabase, async (req, res) => {
  try {
    const validation = await validateSignup(req.body);
    if (validation.message) {
      return res.status(400).json({ success: false, message: validation.message });
    }

    const existing = await User.findOne({ email: validation.email });

    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'An account with this email already exists. Please login.'
      });
    }

    const passwordHash = await bcrypt.hash(String(req.body.password), 12);
    const rawRecoveryCode = generateRawRecoveryCode();
    const recoveryCodeHash = await bcrypt.hash(rawRecoveryCode, 12);

    await User.create({
      fullName: validation.fullName,
      username: validation.username,
      normalizedUsername: usernameKey(validation.username),
      email: validation.email,
      passwordHash,
      contactNumber: validation.contactNumber,
      city: validation.city,
      address: validation.address,
      recoveryCodeHash,
      recoveryCodeCreatedAt: new Date()
    });

    logger.info('signup', { email: validation.email, username: validation.username });
    res.status(201).json({
      success: true,
      message: 'Account created successfully. Save your recovery code, then log in to continue.',
      recoveryCode: formatRecoveryCode(rawRecoveryCode)
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'An account with this email already exists. Please login.'
      });
    }
    logger.error('signup_error', { message: error?.message || String(error) });
    res.status(500).json({ success: false, message: 'Unable to create account. Please try again.' });
  }
});

/* ── LOGIN ── */
const loginLimiter = makeLimiter({ windowMs: 15 * 60 * 1000, max: 5, prefix: 'rl:login:' });

router.post('/login', loginLimiter, requireDatabase, async (req, res) => {
  const username = normalizeUsername(req.body.username);
  const email = normalizeEmail(req.body.email);
  try {
    const password = String(req.body.password || '');
    const rememberMe = req.body.rememberMe === true;

    if (!username) return res.status(400).json({ success: false, message: 'Username is required.' });
    if (username.length < 3) return res.status(400).json({ success: false, message: 'Username must be at least 3 characters.' });
    if (username.length > 12) return res.status(400).json({ success: false, message: 'Username can be maximum 12 characters.' });
    if (/\s/.test(username)) return res.status(400).json({ success: false, message: 'Username cannot contain spaces.' });
    if (!email) return res.status(400).json({ success: false, message: 'Email is required.' });
    if (!isValidEmail(email)) return res.status(400).json({ success: false, message: 'Enter a valid email address.' });
    if (!password) return res.status(400).json({ success: false, message: 'Password is required.' });
    if (/\s/.test(password)) return res.status(400).json({ success: false, message: 'Password cannot contain spaces.' });
    if (!process.env.JWT_SECRET) {
      return res.status(500).json({ success: false, message: 'Authentication is not configured.' });
    }

    const user = await User.findOne({ email, normalizedUsername: usernameKey(username) });
    if (!user) {
      logger.warn('login_attempt', { email, username, success: false, reason: 'no_matching_account' });
      return res.status(401).json({ success: false, message: 'No matching account was found for this username and email.' });
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) {
      logger.warn('login_attempt', { email, username, success: false, reason: 'bad_password' });
      return res.status(401).json({ success: false, message: 'Invalid username, email, or password.' });
    }

    const token = jwt.sign(
      { userId: String(user._id), username: user.username, email: user.email, tokenVersion: user.tokenVersion },
      process.env.JWT_SECRET,
      { expiresIn: rememberMe ? '7d' : '1h' }
    );

    logger.info('login_attempt', { email, username, success: true });
    res.json({ success: true, token, user: safeUser(user) });
  } catch (error) {
    logger.error('login_error', { email, username, message: error?.message || String(error) });
    res.status(500).json({ success: false, message: 'Unable to log in. Please try again.' });
  }
});

/* ── FORGOT PASSWORD ── */
const forgotPasswordLimiter = makeLimiter({ windowMs: 60 * 60 * 1000, max: 3, prefix: 'rl:forgot:' });

router.post('/forgot-password', forgotPasswordLimiter, requireDatabase, async (req, res) => {
  const username = normalizeUsername(req.body.username);
  const email = normalizeEmail(req.body.email);
  try {
    const recoveryCode = normalizeRecoveryCodeInput(req.body.recoveryCode);
    const newPassword = String(req.body.newPassword || '');
    const confirmNewPassword = String(req.body.confirmNewPassword || '');

    if (!username) return res.status(400).json({ success: false, message: 'Username is required.' });
    if (username.length < 3) return res.status(400).json({ success: false, message: 'Username must be at least 3 characters.' });
    if (username.length > 12) return res.status(400).json({ success: false, message: 'Username can be maximum 12 characters.' });
    if (/\s/.test(username)) return res.status(400).json({ success: false, message: 'Username cannot contain spaces.' });
    if (!email) return res.status(400).json({ success: false, message: 'Email is required.' });
    if (!isValidEmail(email)) return res.status(400).json({ success: false, message: 'This is not a valid email.' });
    if (!recoveryCode) return res.status(400).json({ success: false, message: 'Recovery code is required.' });
    if (!newPassword) return res.status(400).json({ success: false, message: 'New password is required.' });
    if (/\s/.test(newPassword)) return res.status(400).json({ success: false, message: 'Password cannot contain spaces.' });
    if (!confirmNewPassword) return res.status(400).json({ success: false, message: 'Confirm password is required.' });
    if (/\s/.test(confirmNewPassword)) return res.status(400).json({ success: false, message: 'Confirm password cannot contain spaces.' });
    if (newPassword !== confirmNewPassword) return res.status(400).json({ success: false, message: 'Passwords do not match.' });

    const pwdError = passwordPolicyError(newPassword);
    if (pwdError) return res.status(400).json({ success: false, message: pwdError });

    const user = await User.findOne({ email, normalizedUsername: usernameKey(username) });

    if (!user) {
      logger.warn('password_reset', { email, username, success: false, reason: 'no_matching_account' });
      return res.status(404).json({ success: false, message: 'No account found with this username and email.' });
    }

    if (!user.recoveryCodeHash) {
      logger.warn('password_reset', { email, username, success: false, reason: 'no_recovery_code_on_file' });
      return res.status(400).json({ success: false, message: 'No recovery code on file for this account.' });
    }

    const codeMatches = await bcrypt.compare(recoveryCode, user.recoveryCodeHash);
    if (!codeMatches) {
      logger.warn('password_reset', { email, username, success: false, reason: 'bad_recovery_code' });
      return res.status(401).json({ success: false, message: 'Invalid recovery code.' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    const newRawCode = generateRawRecoveryCode();
    const newRecoveryCodeHash = await bcrypt.hash(newRawCode, 12);

    await User.updateOne(
      { _id: user._id },
      { passwordHash, recoveryCodeHash: newRecoveryCodeHash, recoveryCodeCreatedAt: new Date() }
    );

    logger.info('password_reset', { email, username, success: true });
    res.json({
      success: true,
      message: 'Password reset successfully. Save your new recovery code, then log in.',
      recoveryCode: formatRecoveryCode(newRawCode)
    });
  } catch (error) {
    logger.error('password_reset_error', { email, username, message: error?.message || String(error) });
    res.status(500).json({ success: false, message: 'Unable to reset password. Please try again.' });
  }
});

/* ── GUEST ── */
const guestLimiter = makeLimiter({ windowMs: 24 * 60 * 60 * 1000, max: 1, prefix: 'rl:guest:' });

router.post('/guest', guestLimiter, async (req, res) => {
  try {
    if (!process.env.JWT_SECRET) {
      return res.status(500).json({ success: false, message: 'Authentication is not configured.' });
    }
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let suffix = '';
    for (let i = 0; i < 8; i++) {
      suffix += chars[Math.floor(Math.random() * chars.length)];
    }
    const username = `guest_${suffix}`;
    const guestId = nanoid();
    const token = jwt.sign(
      { username, isGuest: true, guestId },
      process.env.JWT_SECRET,
      { expiresIn: '45m' }
    );
    logger.info('guest_session_start', { username, guestId, ip: req.ip });
    res.json({ success: true, token, username });
  } catch (error) {
    logger.error('guest_session_error', { message: error?.message || String(error) });
    res.status(500).json({ success: false, message: 'Failed to start demo. Please try again.' });
  }
});

/* ── ME ── */
router.get('/me', requireAuth, (req, res) => {
  if (req.user.isGuest) {
    return res.json({
      success: true,
      user: {
        id: '',
        username: req.user.username,
        fullName: req.user.username,
        email: '',
        contactNumber: '',
        city: '',
        address: '',
        accountType: 'Guest',
        isGuest: true
      }
    });
  }
  res.json({ success: true, user: safeUser(req.user) });
});

function requireAccountOwner(req, res) {
  if (!req.userId) {
    res.status(403).json({ success: false, message: 'Guests do not have an account to manage. Please sign up to unlock this.' });
    return false;
  }
  return true;
}

/* ── CHANGE PASSWORD ── */
const changePasswordLimiter = makeLimiter({ windowMs: 60 * 60 * 1000, max: 5, prefix: 'rl:password-change:', keyGenerator: userKeyGenerator });

router.patch('/password', requireAuth, changePasswordLimiter, requireDatabase, async (req, res) => {
  if (!requireAccountOwner(req, res)) return;
  try {
    const currentPassword = String(req.body.currentPassword || '');
    const newPassword = String(req.body.newPassword || '');

    if (!currentPassword) return res.status(400).json({ success: false, message: 'Current password is required.' });
    if (!newPassword) return res.status(400).json({ success: false, message: 'New password is required.' });
    if (/\s/.test(newPassword)) return res.status(400).json({ success: false, message: 'Password cannot contain spaces.' });

    const pwdError = passwordPolicyError(newPassword);
    if (pwdError) return res.status(400).json({ success: false, message: pwdError });

    const user = await User.findById(req.userId);
    const passwordMatches = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!passwordMatches) {
      return res.status(401).json({ success: false, message: 'Current password is incorrect.' });
    }

    user.passwordHash = await bcrypt.hash(newPassword, 12);
    await user.save();

    logger.info('password_changed', { userId: String(user._id) });
    res.json({ success: true, message: 'Password changed successfully.' });
  } catch (error) {
    logger.error('password_change_error', { userId: String(req.userId), message: error?.message || String(error) });
    res.status(500).json({ success: false, message: 'Unable to change password. Please try again.' });
  }
});

/* ── REGENERATE RECOVERY CODE ── */
const recoveryCodeRegenerateLimiter = makeLimiter({ windowMs: 60 * 60 * 1000, max: 5, prefix: 'rl:recovery-regen:', keyGenerator: userKeyGenerator });

router.post('/recovery-code/regenerate', requireAuth, recoveryCodeRegenerateLimiter, requireDatabase, async (req, res) => {
  if (!requireAccountOwner(req, res)) return;
  try {
    const password = String(req.body.password || '');

    const user = await User.findById(req.userId);
    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) {
      return res.status(401).json({ success: false, message: 'Incorrect password.' });
    }

    const rawRecoveryCode = generateRawRecoveryCode();
    user.recoveryCodeHash = await bcrypt.hash(rawRecoveryCode, 12);
    user.recoveryCodeCreatedAt = new Date();
    await user.save();

    logger.info('recovery_code_regenerated', { userId: String(user._id) });
    res.json({
      success: true,
      message: 'Recovery code regenerated. Save it now — it will not be shown again.',
      recoveryCode: formatRecoveryCode(rawRecoveryCode)
    });
  } catch (error) {
    logger.error('recovery_code_regenerate_error', { userId: String(req.userId), message: error?.message || String(error) });
    res.status(500).json({ success: false, message: 'Unable to regenerate recovery code. Please try again.' });
  }
});

/* ── DELETE ACCOUNT ── */
const deleteAccountLimiter = makeLimiter({ windowMs: 60 * 60 * 1000, max: 5, prefix: 'rl:account-delete:', keyGenerator: userKeyGenerator });

router.delete('/account', requireAuth, deleteAccountLimiter, requireDatabase, async (req, res) => {
  if (!requireAccountOwner(req, res)) return;
  try {
    const password = String(req.body.password || '');

    const user = await User.findById(req.userId);
    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) {
      return res.status(401).json({ success: false, message: 'Incorrect password.' });
    }

    await deleteUserAndSessions(req.userId);

    logger.info('account_deleted', { userId: String(req.userId) });
    res.json({ success: true, message: 'Account deleted.' });
  } catch (error) {
    logger.error('account_delete_error', { userId: String(req.userId), message: error?.message || String(error) });
    res.status(500).json({ success: false, message: 'Unable to delete account. Please try again.' });
  }
});

/* ── LOGOUT EVERYWHERE ── */
const logoutEverywhereLimiter = makeLimiter({ windowMs: 60 * 60 * 1000, max: 5, prefix: 'rl:logout-everywhere:', keyGenerator: userKeyGenerator });

router.post('/logout-everywhere', requireAuth, logoutEverywhereLimiter, requireDatabase, async (req, res) => {
  if (!requireAccountOwner(req, res)) return;
  try {
    await User.findByIdAndUpdate(req.userId, { $inc: { tokenVersion: 1 } });

    logger.info('logout_everywhere', { userId: String(req.userId) });
    res.json({ success: true, message: 'Logged out of all devices. Please log in again.' });
  } catch (error) {
    logger.error('logout_everywhere_error', { userId: String(req.userId), message: error?.message || String(error) });
    res.status(500).json({ success: false, message: 'Unable to log out of all devices. Please try again.' });
  }
});

export default router;
