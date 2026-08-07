import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { DATABASE_UNAVAILABLE_MESSAGE, requireDatabase } from '../config/db.js';
import { requireAuth, safeUser } from '../middleware/auth.js';
import City, { normalizeCityName } from '../models/City.js';
import User from '../models/User.js';

const router = express.Router();

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
  if (fullName.length > 20) return { message: 'Full name can be maximum 20 characters.' };
  if (!/^[A-Za-z\s]+$/.test(fullName)) return { message: 'Full name can only contain letters and spaces.' };
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
router.post('/signup', requireDatabase, async (req, res) => {
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
    await User.create({
      fullName: validation.fullName,
      username: validation.username,
      normalizedUsername: usernameKey(validation.username),
      email: validation.email,
      passwordHash,
      contactNumber: validation.contactNumber,
      city: validation.city,
      address: validation.address
    });

    res.status(201).json({
      success: true,
      message: 'Account created successfully. Please log in to continue.'
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'An account with this email already exists. Please login.'
      });
    }
    console.error('[auth/signup]', error?.message || error);
    res.status(500).json({ success: false, message: 'Unable to create account. Please try again.' });
  }
});

/* ── LOGIN ── */
router.post('/login', requireDatabase, async (req, res) => {
  try {
    const username = normalizeUsername(req.body.username);
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || '');

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
      return res.status(401).json({ success: false, message: 'No matching account was found for this username and email.' });
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) {
      return res.status(401).json({ success: false, message: 'Invalid username, email, or password.' });
    }

    const token = jwt.sign(
      { userId: String(user._id), username: user.username, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    res.json({ success: true, token, user: safeUser(user) });
  } catch (error) {
    console.error('[auth/login]', error?.message || error);
    res.status(500).json({ success: false, message: 'Unable to log in. Please try again.' });
  }
});

/* ── FORGOT PASSWORD ── */
router.post('/forgot-password', requireDatabase, async (req, res) => {
  try {
    const username = normalizeUsername(req.body.username);
    const email = normalizeEmail(req.body.email);
    const newPassword = String(req.body.newPassword || '');
    const confirmNewPassword = String(req.body.confirmNewPassword || '');

    if (!username) return res.status(400).json({ success: false, message: 'Username is required.' });
    if (username.length < 3) return res.status(400).json({ success: false, message: 'Username must be at least 3 characters.' });
    if (username.length > 12) return res.status(400).json({ success: false, message: 'Username can be maximum 12 characters.' });
    if (/\s/.test(username)) return res.status(400).json({ success: false, message: 'Username cannot contain spaces.' });
    if (!email) return res.status(400).json({ success: false, message: 'Email is required.' });
    if (!isValidEmail(email)) return res.status(400).json({ success: false, message: 'This is not a valid email.' });
    if (!newPassword) return res.status(400).json({ success: false, message: 'New password is required.' });
    if (/\s/.test(newPassword)) return res.status(400).json({ success: false, message: 'Password cannot contain spaces.' });
    if (!confirmNewPassword) return res.status(400).json({ success: false, message: 'Confirm password is required.' });
    if (/\s/.test(confirmNewPassword)) return res.status(400).json({ success: false, message: 'Confirm password cannot contain spaces.' });
    if (newPassword !== confirmNewPassword) return res.status(400).json({ success: false, message: 'Passwords do not match.' });

    const pwdError = passwordPolicyError(newPassword);
    if (pwdError) return res.status(400).json({ success: false, message: pwdError });

    const user = await User.findOne({ email, normalizedUsername: usernameKey(username) });

    if (!user) {
      return res.status(404).json({ success: false, message: 'No account found with this username and email.' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await User.updateOne({ _id: user._id }, { passwordHash });

    res.json({ success: true, message: 'Password reset successfully. Please log in with your new password.' });
  } catch (error) {
    console.error('[auth/forgot-password]', error?.message || error);
    res.status(500).json({ success: false, message: 'Unable to reset password. Please try again.' });
  }
});

/* ── GUEST ── */
router.post('/guest', async (req, res) => {
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
    const token = jwt.sign(
      { username, isGuest: true },
      process.env.JWT_SECRET,
      { expiresIn: '45m' }
    );
    res.json({ success: true, token, username });
  } catch (error) {
    console.error('[auth/guest]', error?.message || error);
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

export default router;
