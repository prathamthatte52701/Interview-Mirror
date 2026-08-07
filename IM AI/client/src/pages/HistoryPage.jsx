import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronDown, FileText, History, ListChecks } from 'lucide-react';

function formatLabel(value, fallback = 'Not available') {
  if (!value) return fallback;
  return String(value).replaceAll('-', ' ');
}

function formatDateTime(value) {
  if (!value) return 'Not available';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not available';
  return date.toLocaleString();
}

function scoreFor(item) {
  return item?.summary?.averageMetrics?.overall ?? null;
}

function titleFor(item) {
  if (!item) return 'Interview session';
  const role = formatLabel(item.role, 'Interview');
  return item.candidateName ? `${item.candidateName} - ${role}` : role;
}

const SESSION_GROUP_SIZE = 10;

function groupSessions(history = [], size = SESSION_GROUP_SIZE) {
  if (!history.length) return [];

  const groups = [];
  for (let index = 0; index < history.length; index += size) {
    const start = index + 1;
    const end = Math.min(index + size, history.length);
    groups.push({
      key: `history-${start}-${end}`,
      start,
      end,
      items: history.slice(index, end)
    });
  }
  return groups;
}

function DetailRow({ label, value }) {
  return (
    <div className="session-detail-row">
      <span>{label}</span>
      <strong>{value || 'Not available'}</strong>
    </div>
  );
}

function decodeJwt(token) {
  if (!token) return null;
  try { return JSON.parse(atob(token.split('.')[1])); } catch { return null; }
}

export default function HistoryPage({ history = [], onStart, onLogout }) {
  const [isGuestSession] = useState(() => {
    const decoded = decodeJwt(localStorage.getItem('interview_mirror_access_token'));
    return decoded?.isGuest === true;
  });
  const [selectedId, setSelectedId] = useState(history[0]?.id || '');
  const [openGroups, setOpenGroups] = useState({});
  const sessionGroups = useMemo(() => groupSessions(history), [history]);

  useEffect(() => {
    if (!history.length) {
      setSelectedId('');
      return;
    }

    setSelectedId((current) => (
      history.some((item) => item.id === current) ? current : history[0].id
    ));
  }, [history]);

  useEffect(() => {
    if (!sessionGroups.length) {
      setOpenGroups({});
      return;
    }

    setOpenGroups((previous) => {
      const next = {};
      sessionGroups.forEach((group, index) => {
        next[group.key] = previous[group.key] ?? index === 0;
      });
      return next;
    });
  }, [sessionGroups]);

  const selected = useMemo(() => (
    history.find((item) => item.id === selectedId) || history[0] || null
  ), [history, selectedId]);

  const selectedSummary = selected?.summary || {};
  const transcript = selected?.transcript || [];

  if (isGuestSession) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div className="panel" style={{ maxWidth: 480, textAlign: 'center', padding: '40px 32px' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '16px' }}>🔒</div>
          <h2 style={{ marginBottom: '12px' }}>History is locked</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: '28px', lineHeight: 1.6 }}>
            Sign in to view your interview history.
          </p>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button className="btn btn-primary" onClick={() => onLogout('/signup')}>Sign Up Free</button>
            <button className="btn btn-ghost" onClick={() => onLogout('/login')}>Log In</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="history-page anim-fade-up">
      <div className="history-page-header">
        <div>
          <span className="setup-eyebrow"><History size={14} /> Session history</span>
          <h2>Interview history</h2>
          <p>Review previous sessions without changing the setup-page history dropdown behavior.</p>
        </div>
      </div>

      {history.length === 0 ? (
        <div className="panel dashboard-empty-state history-empty-state">
          <History size={26} />
          <strong>No interview sessions yet.</strong>
          <span>Finish a mock interview and your results will appear here.</span>
          <button className="btn btn-primary" type="button" onClick={onStart}>Start Interview</button>
        </div>
      ) : (
        <div className="history-page-layout">
          <div className="panel history-table-panel">
            <div className="panel-header">
              <span className="panel-title panel-title-with-icon"><ListChecks size={16} /> Previous sessions</span>
              <span className="panel-badge">{history.length}</span>
            </div>

            <div className="history-table">
              {sessionGroups.map((group) => {
                const expanded = Boolean(openGroups[group.key]);
                return (
                  <div key={group.key} className={`session-group ${expanded ? 'open' : ''}`}>
                    <button
                      type="button"
                      className="session-group-trigger"
                      onClick={() => {
                        setOpenGroups((previous) => ({
                          ...previous,
                          [group.key]: !expanded
                        }));
                      }}
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
                          const score = scoreFor(item);
                          const active = item.id === selected?.id;
                          return (
                            <button
                              key={item.id}
                              type="button"
                              className={`history-row ${active ? 'active' : ''}`}
                              onClick={() => setSelectedId(item.id)}
                            >
                              <span>
                                <strong>{titleFor(item)}</strong>
                                <small>{formatDateTime(item.createdAt)} | {formatLabel(item.difficulty)}</small>
                              </span>
                              <em>{score == null ? '--' : score}/10</em>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="panel selected-session-card history-detail-panel">
            <div className="selected-session-title-row">
              <div>
                <span className="selected-session-eyebrow">History detail</span>
                <h3>{titleFor(selected)}</h3>
              </div>
              <div className="history-card-score">
                {scoreFor(selected) ?? '--'}
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>/10</span>
              </div>
            </div>

            <div className="session-detail-grid">
              <DetailRow label="Interview type" value={formatLabel(selected?.role)} />
              <DetailRow label="Persona" value={formatLabel(selected?.persona)} />
              <DetailRow label="Date/time" value={formatDateTime(selected?.createdAt)} />
              <DetailRow label="Result" value={selectedSummary.hiringRecommendation || 'Not available'} />
              <DetailRow label="Strengths" value={selectedSummary.strengths?.length ? selectedSummary.strengths.join('; ') : 'Not available'} />
              <DetailRow label="Weaknesses" value={selectedSummary.weaknesses?.length ? selectedSummary.weaknesses.join('; ') : 'Not available'} />
              <DetailRow label="Feedback summary" value={selectedSummary.overallVerdict || selectedSummary.recommendation || 'Not available'} />
              <DetailRow label="Questions answered" value={selectedSummary.questionsAnswered ?? (transcript.length || 'Not available')} />
            </div>

            <div className="session-question-preview">
              <div className="feedback-card-title"><FileText size={14} /> Questions and answers</div>
              {transcript.length ? (
                <div className="history-answer-list">
                  {transcript.map((entry, index) => (
                    <div className="history-answer-card" key={`${selected?.id}-${index}`}>
                      <strong>{entry.question || 'Question not available'}</strong>
                      <p>{entry.answer || 'User answer not available'}</p>
                      <small>
                        AI feedback: {entry.analysis?.rewrite || entry.analysis?.idealAnswer || entry.analysis?.strengths?.[0] || 'Not available'}
                      </small>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="dashboard-empty-state history-inline-empty">
                  <CalendarDays size={20} />
                  <strong>Detailed transcript not available.</strong>
                  <span>This saved session only has summary-level data.</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
