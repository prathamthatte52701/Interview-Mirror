import { useCallback, useEffect, useState } from 'react';
import { LogOut, RefreshCw, Search, ShieldCheck, Users, Activity, ListChecks } from 'lucide-react';
import {
  adminLogout,
  banAdminUser,
  deleteAdminUser,
  fetchAdminHealth,
  fetchAdminSessions,
  fetchAdminUsers,
  unbanAdminUser
} from '../lib/adminAuth.js';

const TABS = [
  { key: 'users', label: 'Users', icon: Users },
  { key: 'sessions', label: 'Sessions', icon: ListChecks },
  { key: 'health', label: 'System Health', icon: Activity }
];

function UsersTab({ onViewSessions }) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [data, setData] = useState({ items: [], total: 0, limit: 20 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchAdminUsers({ page, search });
      setData(res);
    } catch (err) {
      setError(err.message || 'Unable to load users.');
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => { load(); }, [load]);

  async function handleBan(id) {
    try {
      await banAdminUser(id);
      load();
    } catch (err) {
      setError(err.message || 'Unable to ban user.');
    }
  }

  async function handleUnban(id) {
    try {
      await unbanAdminUser(id);
      load();
    } catch (err) {
      setError(err.message || 'Unable to unban user.');
    }
  }

  async function handleDelete(id, email) {
    if (!window.confirm(`Permanently delete ${email}? This cannot be undone.`)) return;
    try {
      await deleteAdminUser(id);
      load();
    } catch (err) {
      setError(err.message || 'Unable to delete user.');
    }
  }

  const totalPages = Math.max(1, Math.ceil(data.total / (data.limit || 20)));

  return (
    <div className="admin-panel">
      <div className="admin-toolbar">
        <div className="admin-search">
          <Search size={16} />
          <input
            type="text"
            placeholder="Search by email or username"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <button type="button" className="admin-btn" onClick={load} disabled={loading}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {error && <div className="admin-error">{error}</div>}

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Full name</th>
              <th>Username</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((u) => (
              <tr key={u.id}>
                <td>{u.fullName}</td>
                <td>{u.username}</td>
                <td>{u.email}</td>
                <td>{u.role}</td>
                <td><span className={`admin-status admin-status-${u.status}`}>{u.status}</span></td>
                <td className="admin-row-actions">
                  <button type="button" className="admin-btn" onClick={() => onViewSessions(u.id)}>Sessions</button>
                  {u.status === 'banned' ? (
                    <button type="button" className="admin-btn" onClick={() => handleUnban(u.id)}>Unban</button>
                  ) : (
                    <button type="button" className="admin-btn admin-btn-warn" onClick={() => handleBan(u.id)}>Ban</button>
                  )}
                  <button type="button" className="admin-btn admin-btn-danger" onClick={() => handleDelete(u.id, u.email)}>Delete</button>
                </td>
              </tr>
            ))}
            {!loading && data.items.length === 0 && (
              <tr><td colSpan={6} className="admin-empty">No users found.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="admin-pagination">
        <button type="button" className="admin-btn" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
        <span>Page {page} of {totalPages}</span>
        <button type="button" className="admin-btn" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</button>
      </div>
    </div>
  );
}

function SessionsTab({ userId, onUserIdChange }) {
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ items: [], total: 0, limit: 20 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchAdminSessions({ page, userId });
      setData(res);
    } catch (err) {
      setError(err.message || 'Unable to load sessions.');
    } finally {
      setLoading(false);
    }
  }, [page, userId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [userId]);

  const totalPages = Math.max(1, Math.ceil(data.total / (data.limit || 20)));

  return (
    <div className="admin-panel">
      <div className="admin-toolbar">
        <div className="admin-search">
          <Search size={16} />
          <input
            type="text"
            placeholder="Filter by user ID"
            value={userId}
            onChange={(e) => onUserIdChange(e.target.value)}
          />
        </div>
        <button type="button" className="admin-btn" onClick={load} disabled={loading}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {error && <div className="admin-error">{error}</div>}

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Candidate</th>
              <th>Role</th>
              <th>User ID</th>
              <th>Started</th>
              <th>Ended</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((s) => (
              <tr key={s.id}>
                <td>{s.candidateName}</td>
                <td>{s.role}</td>
                <td className="admin-mono">{s.userId || '—'}</td>
                <td>{s.createdAt ? new Date(s.createdAt).toLocaleString() : '—'}</td>
                <td>{s.endedAt ? new Date(s.endedAt).toLocaleString() : 'In progress'}</td>
                <td><button type="button" className="admin-btn" onClick={() => setSelected(s)}>View</button></td>
              </tr>
            ))}
            {!loading && data.items.length === 0 && (
              <tr><td colSpan={6} className="admin-empty">No sessions found.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="admin-pagination">
        <button type="button" className="admin-btn" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
        <span>Page {page} of {totalPages}</span>
        <button type="button" className="admin-btn" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</button>
      </div>

      {selected && (
        <div className="admin-detail">
          <div className="admin-detail-header">
            <strong>{selected.candidateName} — {selected.role}</strong>
            <button type="button" className="admin-btn" onClick={() => setSelected(null)}>Close</button>
          </div>
          <div className="admin-detail-body admin-detail-readable">
            <div className="admin-detail-meta">
              <div><span>Candidate</span><strong>{selected.candidateName || '—'}</strong></div>
              <div><span>Role</span><strong>{selected.role || '—'}</strong></div>
              <div><span>Difficulty</span><strong>{selected.difficulty || '—'}</strong></div>
              <div><span>Interview mode</span><strong>{selected.interviewMode || '—'}</strong></div>
              <div><span>User ID</span><strong className="admin-mono">{selected.userId || selected.guestId || '—'}</strong></div>
              <div><span>Started</span><strong>{selected.createdAt ? new Date(selected.createdAt).toLocaleString() : '—'}</strong></div>
              <div><span>Ended</span><strong>{selected.endedAt ? new Date(selected.endedAt).toLocaleString() : 'In progress'}</strong></div>
            </div>

            <div className="admin-detail-qa-header">Transcript ({selected.transcript?.length || 0} questions)</div>
            {selected.transcript?.length ? (
              <div className="admin-detail-qa-list">
                {selected.transcript.map((entry, index) => (
                  <div className="admin-detail-qa-item" key={index}>
                    <strong>Q{index + 1}: {entry.question || 'Question not available'}</strong>
                    <p>{entry.answer || 'No answer recorded.'}</p>
                    {entry.analysis?.metrics?.overall != null && (
                      <span className="admin-mono">Score: {entry.analysis.metrics.overall}/10</span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p>No transcript recorded for this session.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function HealthTab() {
  const [health, setHealth] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetchedAt, setFetchedAt] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchAdminHealth();
      setHealth(res);
      setFetchedAt(new Date());
    } catch (err) {
      setError(err.message || 'Unable to load system health.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="admin-panel">
      <div className="admin-toolbar">
        <button type="button" className="admin-btn" onClick={load} disabled={loading}>
          <RefreshCw size={14} /> Refresh snapshot
        </button>
        {fetchedAt && <span className="admin-snapshot-time">Snapshot as of {fetchedAt.toLocaleTimeString()}</span>}
      </div>

      {error && <div className="admin-error">{error}</div>}

      {health && (
        <div className="admin-health-grid">
          <div className="admin-health-card">
            <span>Database</span>
            <strong className={health.db.connected ? 'admin-status-active' : 'admin-status-banned'}>
              {health.db.connected ? 'Connected' : 'Unavailable'}
            </strong>
          </div>
          <div className="admin-health-card">
            <span>AI mode</span>
            <strong>{health.aiMode}</strong>
          </div>
          <div className="admin-health-card">
            <span>Server uptime</span>
            <strong>{Math.floor(health.uptimeSeconds / 60)}m {health.uptimeSeconds % 60}s</strong>
          </div>
          <div className="admin-health-card">
            <span>Rate-limit hits (last hour)</span>
            <strong>{health.recentRateLimitHits}</strong>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminDashboardPage({ onNavigate }) {
  const [tab, setTab] = useState('users');
  const [sessionsUserId, setSessionsUserId] = useState('');
  const [ready, setReady] = useState(false);
  const [denied, setDenied] = useState(false);
  const [verifyError, setVerifyError] = useState('');
  const [retryToken, setRetryToken] = useState(0);

  function goTo(path) {
    if (onNavigate) onNavigate(path);
    else {
      window.history.pushState({}, '', path);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function attempt(isRetry) {
      try {
        await fetchAdminHealth();
        if (cancelled) return;
        setReady(true);
        setVerifyError('');
      } catch (err) {
        if (cancelled) return;
        // Only a genuine 401/403 means the admin session is actually invalid —
        // a network blip or 5xx must not bounce a valid admin to the login page.
        if (err.status === 401 || err.status === 403) {
          setDenied(true);
          return;
        }
        if (!isRetry) {
          window.setTimeout(() => {
            if (!cancelled) attempt(true);
          }, 1500);
          return;
        }
        setVerifyError(err.message || "Couldn't verify your admin session. Check your connection and try again.");
      }
    }

    attempt(false);
    return () => { cancelled = true; };
  }, [retryToken]);

  useEffect(() => {
    if (denied) goTo('/admin/login');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [denied]);

  function handleLogout() {
    adminLogout();
    goTo('/admin/login');
  }

  function viewUserSessions(userId) {
    setSessionsUserId(userId);
    setTab('sessions');
  }

  if (!ready) {
    return (
      <main className="admin-page">
        <div className="admin-loading">
          {verifyError || 'Checking admin session…'}
          {verifyError && (
            <div style={{ marginTop: '12px' }}>
              <button type="button" className="admin-btn" onClick={() => setRetryToken((n) => n + 1)}>
                <RefreshCw size={14} /> Retry
              </button>
            </div>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="admin-page">
      <header className="admin-header">
        <div className="admin-brand">
          <ShieldCheck size={18} />
          <strong>InterviewMirror AI — Admin</strong>
        </div>
        <button type="button" className="admin-btn" onClick={handleLogout}>
          <LogOut size={14} /> Logout
        </button>
      </header>

      <nav className="admin-tabs">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            className={`admin-tab ${tab === key ? 'is-active' : ''}`}
            onClick={() => setTab(key)}
          >
            <Icon size={15} /> {label}
          </button>
        ))}
      </nav>

      <div className="admin-content">
        {tab === 'users' && <UsersTab onViewSessions={viewUserSessions} />}
        {tab === 'sessions' && <SessionsTab userId={sessionsUserId} onUserIdChange={setSessionsUserId} />}
        {tab === 'health' && <HealthTab />}
      </div>
    </main>
  );
}
