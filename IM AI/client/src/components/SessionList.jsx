import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Search, Trash2 } from 'lucide-react';
import { groupSessions } from '../hooks/useSessionHistory.js';
import { formatDateTime, formatLabel, sessionScore, sessionTitle } from '../lib/sessionFormat.js';
import { useToast } from '../hooks/useToast.js';

export default function SessionList({ sessions = [], selectedId, onSelect, onDelete, loading = false, emptyState = null }) {
  const [query, setQuery] = useState('');
  const [openGroups, setOpenGroups] = useState({});
  const [confirmingId, setConfirmingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const { showToast } = useToast();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sessions;
    return sessions.filter((item) =>
      String(item.role || '').toLowerCase().includes(q) ||
      String(item.candidateName || '').toLowerCase().includes(q)
    );
  }, [sessions, query]);

  const groups = useMemo(() => groupSessions(filtered), [filtered]);

  useEffect(() => {
    if (!groups.length) {
      setOpenGroups({});
      return;
    }
    setOpenGroups((previous) => {
      const next = {};
      groups.forEach((group, index) => {
        next[group.key] = previous[group.key] ?? index === 0;
      });
      return next;
    });
  }, [groups]);

  async function handleDelete(id) {
    setDeletingId(id);
    try {
      await onDelete(id);
      showToast('Session deleted.', 'success');
    } catch (err) {
      showToast(err.message || 'Failed to delete session.', 'error');
    } finally {
      setDeletingId(null);
      setConfirmingId(null);
    }
  }

  if (loading) {
    return (
      <div className="session-group-list" aria-busy="true" aria-live="polite">
        {[0, 1, 2].map((i) => (
          <div key={i} className="session-group-skeleton" />
        ))}
      </div>
    );
  }

  if (!sessions.length) {
    return emptyState;
  }

  return (
    <div>
      <div className="session-search">
        <Search size={14} />
        <input
          type="text"
          placeholder="Search by role or candidate name..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search sessions"
        />
      </div>

      {filtered.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', padding: '12px 4px' }}>
          No sessions match "{query}".
        </p>
      ) : (
        <div className="session-group-list">
          {groups.map((group) => {
            const expanded = Boolean(openGroups[group.key]);
            return (
              <div key={group.key} className={`session-group ${expanded ? 'open' : ''}`}>
                <button
                  type="button"
                  className="session-group-trigger"
                  onClick={() => setOpenGroups((previous) => ({ ...previous, [group.key]: !expanded }))}
                  aria-expanded={expanded}
                >
                  <span className="session-group-title">
                    <ChevronDown size={14} />
                    Sessions {group.start}-{group.end}
                  </span>
                  <span className="session-group-count">{group.items.length}</span>
                </button>

                {expanded && (
                  <div className="session-group-items">
                    {group.items.map((item) => {
                      const score = sessionScore(item);
                      const active = selectedId === item.id;
                      const confirming = confirmingId === item.id;
                      const isDeleting = deletingId === item.id;
                      return (
                        <div key={item.id} className={`history-row-wrap ${active ? 'active' : ''}`}>
                          <button
                            type="button"
                            className={`history-row ${active ? 'active' : ''}`}
                            onClick={() => onSelect(item.id)}
                          >
                            <span>
                              <strong>{sessionTitle(item)}</strong>
                              <small>{formatDateTime(item.createdAt)} | {formatLabel(item.difficulty)}</small>
                            </span>
                            <em>{score == null ? '--' : score}/10</em>
                          </button>

                          {confirming ? (
                            <span className="history-row-confirm">
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                onClick={() => setConfirmingId(null)}
                                disabled={isDeleting}
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                onClick={() => handleDelete(item.id)}
                                disabled={isDeleting}
                              >
                                {isDeleting ? <span className="spinner" style={{ width: 12, height: 12 }} /> : 'Confirm delete'}
                              </button>
                            </span>
                          ) : (
                            <button
                              type="button"
                              className="history-row-delete"
                              onClick={() => setConfirmingId(item.id)}
                              aria-label={`Delete ${sessionTitle(item)}`}
                              title="Delete session"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
