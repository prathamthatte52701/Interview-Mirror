const ADMIN_TOKEN_KEY = 'interview_mirror_admin_token';

const RAW_API_BASE = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/+$/, '');
const API_ROOT = RAW_API_BASE.endsWith('/interview')
  ? RAW_API_BASE.slice(0, -'/interview'.length)
  : RAW_API_BASE;
const ADMIN_BASE = `${API_ROOT}/admin`;

export function getAdminToken() {
  return localStorage.getItem(ADMIN_TOKEN_KEY) || '';
}

export function setAdminToken(token) {
  if (token) localStorage.setItem(ADMIN_TOKEN_KEY, token);
}

export function clearAdminToken() {
  localStorage.removeItem(ADMIN_TOKEN_KEY);
}

async function adminRequest(path, options = {}) {
  const token = getAdminToken();
  let res;
  try {
    res = await fetch(`${ADMIN_BASE}${path}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers
      },
      ...options
    });
  } catch {
    throw new Error('Server is down. Please try again later.');
  }

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const error = new Error(data.message || data.error || `Request failed: ${res.status}`);
    error.status = res.status;
    throw error;
  }

  return data;
}

export async function adminLogin({ email, password }) {
  const data = await adminRequest('/login', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  });
  setAdminToken(data.token);
  return data.user;
}

export function adminLogout() {
  clearAdminToken();
}

export async function fetchAdminHealth() {
  return adminRequest('/health');
}

export async function fetchAdminUsers({ page = 1, limit = 20, search = '' } = {}) {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (search) params.set('search', search);
  return adminRequest(`/users?${params.toString()}`);
}

export async function banAdminUser(id) {
  return adminRequest(`/users/${id}/ban`, { method: 'PATCH' });
}

export async function unbanAdminUser(id) {
  return adminRequest(`/users/${id}/unban`, { method: 'PATCH' });
}

export async function deleteAdminUser(id) {
  return adminRequest(`/users/${id}`, {
    method: 'DELETE',
    body: JSON.stringify({ confirm: true })
  });
}

export async function fetchAdminSessions({ page = 1, limit = 20, userId = '' } = {}) {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (userId) params.set('userId', userId);
  return adminRequest(`/sessions?${params.toString()}`);
}
