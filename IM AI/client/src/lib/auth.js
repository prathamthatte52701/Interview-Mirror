const TOKEN_KEY = 'interview_mirror_access_token';

const RAW_API_BASE = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/+$/, '');
const API_ROOT = RAW_API_BASE.endsWith('/interview')
  ? RAW_API_BASE.slice(0, -'/interview'.length)
  : RAW_API_BASE;
const AUTH_BASE = `${API_ROOT}/auth`;
const CITIES_BASE = `${API_ROOT}/cities`;

export const FALLBACK_CITIES = [
  'Mumbai', 'Delhi', 'Bangalore', 'Hyderabad', 'Ahmedabad',
  'Chennai', 'Kolkata', 'Surat', 'Pune', 'Jaipur',
  'Lucknow', 'Kanpur', 'Nagpur', 'Indore', 'Thane',
  'Bhopal', 'Visakhapatnam', 'Patna', 'Vadodara', 'Ghaziabad',
  'Ludhiana', 'Agra', 'Nashik', 'Faridabad', 'Meerut',
  'Rajkot', 'Varanasi', 'Srinagar', 'Aurangabad', 'Dhanbad'
];

export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export function normalizeUsername(username) {
  return String(username || '').trim();
}

export function normalizeFullName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

export function cleanContactNumber(value) {
  return String(value || '').replace(/\D/g, '');
}

export function countWords(value) {
  const text = String(value || '').trim();
  return text ? text.split(/\s+/).length : 0;
}

export function hasLongAddressWord(value) {
  const text = String(value || '').trim();
  if (!text) return false;
  return text.split(/\s+/).some((word) => word.length > 14);
}

export function getPasswordPolicyStatus(password) {
  const value = String(password || '');
  return {
    length: value.length >= 8 && value.length <= 64,
    uppercase: /[A-Z]/.test(value),
    lowercase: /[a-z]/.test(value),
    number: /\d/.test(value),
    special: /[^A-Za-z0-9\s]/.test(value)
  };
}

export function getPasswordPolicyError(password) {
  const value = String(password || '');
  if (/\s/.test(value)) return 'Password cannot contain spaces.';
  const status = getPasswordPolicyStatus(value);
  if (Object.values(status).every(Boolean)) return '';
  return 'Password must be between 8 and 64 characters.';
}

export function getAuthToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}

export function setAuthToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
}

export function clearAuthToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export function isTokenExpired(token) {
  if (!token) return true;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return typeof payload.exp === 'number' && payload.exp * 1000 < Date.now();
  } catch {
    return true;
  }
}

export function getTokenExpiryMs(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return typeof payload.exp === 'number' ? payload.exp * 1000 : 0;
  } catch {
    return 0;
  }
}

export function isServerDownError(message) {
  const m = String(message || '').toLowerCase();
  return m.includes('server is not running') || m.includes('failed to fetch') || m.includes('networkerror') || m.includes('network error');
}

async function authRequest(path, options = {}) {
  let res;
  try {
    res = await fetch(`${AUTH_BASE}${path}`, {
      headers: { 'Content-Type': 'application/json', ...options.headers },
      ...options
    });
  } catch {
    throw new Error('Server is down. Please try again later.');
  }

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.message || data.error || `Request failed: ${res.status}`);
  }

  return data;
}

export async function fetchIndianCities({ search = '' } = {}) {
  const params = new URLSearchParams({ countryCode: 'IN' });
  if (search) params.set('search', search);

  let res;
  try {
    res = await fetch(`${CITIES_BASE}?${params.toString()}`);
  } catch {
    throw new Error('Unable to load cities.');
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || 'Unable to load cities.');
  return Array.isArray(data.cities) ? data.cities : [];
}

export async function signUpUser({ fullName, username, email, password, contactNumber, city, address, cityOptions = FALLBACK_CITIES }) {
  const cleanFullName = normalizeFullName(fullName);
  const cleanUsername = normalizeUsername(username);
  const cleanEmail = normalizeEmail(email);
  const cleanContact = cleanContactNumber(contactNumber);

  if (!cleanFullName) throw new Error('Full name is required.');
  if (cleanFullName.length < 2) throw new Error('Full name must be at least 2 characters.');
  if (cleanFullName.length > 20) throw new Error('Full name can be maximum 20 characters.');
  if (!/^[A-Za-z\s]+$/.test(cleanFullName)) throw new Error('Full name can only contain letters and spaces.');
  if (!cleanUsername) throw new Error('Username is required.');
  if (/\s/.test(cleanUsername)) throw new Error('Username cannot contain spaces.');
  if (cleanUsername.length < 3) throw new Error('Username must be at least 3 characters.');
  if (cleanUsername.length > 12) throw new Error('Username can be maximum 12 characters.');
  if (!cleanEmail) throw new Error('Email is required.');
  if (!isValidEmail(cleanEmail)) throw new Error('Enter a valid email address.');
  if (!password) throw new Error('Password is required.');
  if (/\s/.test(password)) throw new Error('Password cannot contain spaces.');

  const passwordPolicyError = getPasswordPolicyError(password);
  if (passwordPolicyError) throw new Error(passwordPolicyError);
  if (!cleanContact) throw new Error('Contact number is required.');
  if (!/^[6-9]\d{9}$/.test(cleanContact)) throw new Error('Contact number must be a valid 10-digit Indian mobile number.');
  if (countWords(address) > 50) throw new Error('Address can be maximum 50 words.');
  if (hasLongAddressWord(address)) throw new Error('Each address word can be maximum 14 characters.');
  const allowedCityNames = cityOptions.map((item) => (
    typeof item === 'string' ? item : item?.name
  )).filter(Boolean);
  if (city && !allowedCityNames.includes(city)) throw new Error('Select a valid city.');

  return authRequest('/signup', {
    method: 'POST',
    body: JSON.stringify({
      fullName: cleanFullName,
      username: cleanUsername,
      email: cleanEmail,
      password,
      contactNumber: cleanContact,
      city,
      address: String(address || '').trim()
    })
  });
}

export async function loginUser({ username, email, password }) {
  const cleanUsername = normalizeUsername(username);
  const cleanEmail = normalizeEmail(email);

  if (!cleanUsername) throw new Error('Username is required.');
  if (/\s/.test(cleanUsername)) throw new Error('Username cannot contain spaces.');
  if (cleanUsername.length < 3) throw new Error('Username must be at least 3 characters.');
  if (cleanUsername.length > 12) throw new Error('Username can be maximum 12 characters.');
  if (!cleanEmail) throw new Error('Email is required.');
  if (!isValidEmail(cleanEmail)) throw new Error('Enter a valid email address.');
  if (!password) throw new Error('Password is required.');
  if (/\s/.test(password)) throw new Error('Password cannot contain spaces.');

  const data = await authRequest('/login', {
    method: 'POST',
    body: JSON.stringify({ username: cleanUsername, email: cleanEmail, password })
  });

  setAuthToken(data.token);
  return data.user;
}

export async function forgotPassword({ username, email, newPassword, confirmNewPassword }) {
  const cleanUsername = normalizeUsername(username);
  const cleanEmail = normalizeEmail(email);

  if (!cleanUsername) throw new Error('Username is required.');
  if (/\s/.test(cleanUsername)) throw new Error('Username cannot contain spaces.');
  if (cleanUsername.length < 3) throw new Error('Username must be at least 3 characters.');
  if (cleanUsername.length > 12) throw new Error('Username can be maximum 12 characters.');
  if (!cleanEmail) throw new Error('Email is required.');
  if (!isValidEmail(cleanEmail)) throw new Error('This is not a valid email.');
  if (!newPassword) throw new Error('New password is required.');
  if (/\s/.test(newPassword)) throw new Error('Password cannot contain spaces.');
  if (!confirmNewPassword) throw new Error('Confirm password is required.');
  if (/\s/.test(confirmNewPassword)) throw new Error('Confirm password cannot contain spaces.');
  if (newPassword !== confirmNewPassword) throw new Error('Passwords do not match.');

  const policyError = getPasswordPolicyError(newPassword);
  if (policyError) throw new Error(policyError);

  return authRequest('/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ username: cleanUsername, email: cleanEmail, newPassword, confirmNewPassword })
  });
}

export async function guestLogin() {
  return authRequest('/guest', { method: 'POST' });
}

export async function fetchCurrentUser() {
  const token = getAuthToken();
  if (!token) return null;

  try {
    const data = await authRequest('/me', {
      headers: { Authorization: `Bearer ${token}` }
    });
    return data.user;
  } catch (error) {
    clearAuthToken();
    throw error;
  }
}

export function logoutUser() {
  clearAuthToken();
}
