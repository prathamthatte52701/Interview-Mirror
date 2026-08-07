import { getAuthToken } from '../lib/auth.js';

const RAW_API_BASE = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/+$/, '');
const API_ROOT = RAW_API_BASE.endsWith('/interview')
  ? RAW_API_BASE.slice(0, -'/interview'.length)
  : RAW_API_BASE;

export const API_BASE = `${API_ROOT}/interview`;

function serverUnavailableMessage() {
  return 'Interview server is not running. Please start the backend server and try again.';
}

async function request(path, options = {}) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 30000);
  const token = getAuthToken();

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers
      },
      signal: controller.signal,
      ...options
    });
  } catch (err) {
    if (err?.name === 'AbortError') {
      throw new Error('Interview server did not respond in time. Please try again.');
    }
    throw new Error(serverUnavailableMessage());
  } finally {
    window.clearTimeout(timeoutId);
  }

  if (!res.ok) {
    if (res.status === 401) {
      window.dispatchEvent(new CustomEvent('auth:token-expired'));
    }

    const contentType = res.headers.get('content-type') || '';
    const err = contentType.includes('application/json')
      ? await res.json().catch(() => ({}))
      : { error: res.status >= 500 ? '' : await res.text().catch(() => '') };

    const fallback =
      res.status === 502 || res.status === 503 || res.status === 504 || res.status === 500
        ? serverUnavailableMessage()
        : `Request failed: ${res.status}`;

    throw new Error(err.message || err.error || fallback);
  }
  return res.json();
}

export const createSession = (payload) =>
  request('/start', { method: 'POST', body: JSON.stringify(payload) });

export const submitAnswer = (payload) =>
  request('/answer', { method: 'POST', body: JSON.stringify(payload) });

export const analyzeLiveAnswer = (payload) =>
  request('/live-analysis', { method: 'POST', body: JSON.stringify(payload) });

export const endSession = (sessionId) =>
  request('/end', { method: 'POST', body: JSON.stringify({ sessionId }) });

export const fetchSession = (id) => request(`/sessions/${id}`);

export const fetchQuestionBank = (role) =>
  request(`/question-bank${role ? `?role=${role}` : ''}`);

export const fetchSessions = () => request('/sessions');

export const uploadResume = async (file) => {
  const fd = new FormData();
  fd.append('resume', file);

  let res;
  const token = getAuthToken();
  try {
    res = await fetch(`${API_BASE}/upload-resume`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: fd
    });
  } catch {
    throw new Error(serverUnavailableMessage());
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || err.error || 'Resume upload failed. You can paste resume text instead.');
  }
  return res.json();
};
