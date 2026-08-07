import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronDown, Clock3, History, ListChecks } from 'lucide-react';
import {
  RadarChart, PolarGrid, PolarAngleAxis, Radar, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, XAxis, YAxis
} from 'recharts';
import ScoreRing from '../components/ScoreRing.jsx';

function AccordionItem({ q, a, ideal, score }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`accordion-item ${open ? 'open' : ''}`}>
      <button className="accordion-trigger" onClick={() => setOpen(v => !v)}>
        <span style={{ flex: 1, fontSize: '0.82rem', paddingRight: '8px' }}>{q?.slice(0, 90)}{q?.length > 90 ? '…' : ''}</span>
        <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', marginRight: '6px' }}>
          {score ? `${score}/10` : ''}
        </span>
        <svg className="accordion-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>
      {open && (
        <div className="accordion-body">
          <div className="accordion-compare">
            <div className="compare-block">
              <div className="compare-block-label candidate">Your Answer</div>
              <div>{a?.slice(0, 280)}{a?.length > 280 ? '…' : ''}</div>
            </div>
            <div className="compare-block">
              <div className="compare-block-label ideal">Model Answer</div>
              <div>{ideal || 'AI model answer not available for this question.'}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function hiringClass(rec) {
  if (!rec) return 'hiring-badge';
  const r = rec.toLowerCase();
  if (r.includes('strong')) return 'hiring-badge strong-hire';
  if (r === 'hire') return 'hiring-badge hire';
  if (r.includes('border')) return 'hiring-badge borderline';
  return 'hiring-badge no-hire';
}

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

function sessionScore(item) {
  return item?.summary?.averageMetrics?.overall ?? null;
}

function sessionTitle(item) {
  if (!item) return 'Interview session';
  const role = formatLabel(item.role, 'Interview');
  const candidate = item.candidateName ? `${item.candidateName} - ` : '';
  return `${candidate}${role}`;
}

const SESSION_GROUP_SIZE = 10;

function groupSessions(history = [], size = SESSION_GROUP_SIZE) {
  if (!history.length) return [];

  const groups = [];
  for (let index = 0; index < history.length; index += size) {
    const start = index + 1;
    const end = Math.min(index + size, history.length);
    groups.push({
      key: `sessions-${start}-${end}`,
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

export default function DashboardPage({ session, summary, history, onRestart, onLogout }) {
  // Capture isGuest at mount time — before token is cleared — to keep hooks order stable
  const [isGuestSession] = useState(() => {
    const decoded = decodeJwt(localStorage.getItem('interview_mirror_access_token'));
    return decoded?.isGuest === true;
  });
  const [countdown, setCountdown] = useState(5);

  const [exportBusy, setExportBusy] = useState(false);
  const [exportMessage, setExportMessage] = useState('');
  const [selectedHistoryId, setSelectedHistoryId] = useState(history?.[0]?.id || '');
  const [openSessionGroups, setOpenSessionGroups] = useState({});
  const sessionGroups = useMemo(() => groupSessions(history), [history]);

  // Guest: clear token immediately, run countdown, redirect at 0
  useEffect(() => {
    if (!isGuestSession) return undefined;
    localStorage.removeItem('interview_mirror_access_token');
    const id = setInterval(() => {
      setCountdown((c) => Math.max(0, c - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [isGuestSession]);

  useEffect(() => {
    if (isGuestSession && countdown === 0) {
      onLogout('/login');
    }
  }, [isGuestSession, countdown, onLogout]);

  useEffect(() => {
    if (!history?.length) {
      setSelectedHistoryId('');
      return;
    }

    setSelectedHistoryId((current) => (
      history.some((item) => item.id === current) ? current : history[0].id
    ));
  }, [history]);

  useEffect(() => {
    if (!sessionGroups.length) {
      setOpenSessionGroups({});
      return;
    }

    setOpenSessionGroups((previous) => {
      const next = {};
      sessionGroups.forEach((group, index) => {
        next[group.key] = previous[group.key] ?? index === 0;
      });
      return next;
    });
  }, [sessionGroups]);

  const selectedHistoryItem = useMemo(() => {
    if (!history?.length) return null;
    return history.find((item) => item.id === selectedHistoryId) || history[0];
  }, [history, selectedHistoryId]);

  const metrics = summary?.averageMetrics || {};
  const radarData = Object.entries(metrics)
    .filter(([k]) => k !== 'overall')
    .map(([metric, score]) => ({ metric, score }));

  const trendData = (session?.transcript || []).map((entry, i) => ({
    round: `Q${i + 1}`,
    overall:    entry.analysis?.metrics?.overall,
    confidence: entry.analysis?.metrics?.confidence,
    specificity: entry.analysis?.metrics?.specificity
  }));

  const strengths      = summary?.strengths || [];
  const weaknesses     = summary?.weaknesses || [];
  const coachingPlan   = summary?.coachingPlan || [];
  const hiringRec      = summary?.hiringRecommendation || 'N/A';
  const verdict        = summary?.overallVerdict || summary?.recommendation || '';
  const visualSummaryActive = summary?.visualMetricsAvailable === true;
  const selectedSummary = selectedHistoryItem?.summary || {};
  const selectedTranscript = selectedHistoryItem?.transcript || [];

  async function handleExportPDF() {
    setExportBusy(true);
    setExportMessage('');
    try {
      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

      doc.setFillColor(10, 10, 10);
      doc.rect(0, 0, 210, 297, 'F');

      doc.setTextColor(255, 255, 255);
      doc.setFontSize(22);
      doc.setFont('helvetica', 'bold');
      doc.text('Interview Mirror AI Report', 20, 28);

      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(150, 150, 150);
      doc.text(`Candidate: ${session?.candidateName || 'N/A'}`, 20, 40);
      doc.text(`Role: ${session?.role?.replaceAll('-', ' ') || 'N/A'}`, 20, 47);
      doc.text(`Difficulty: ${session?.difficulty || 'N/A'}   |   Questions: ${summary?.questionsAnswered || 0}`, 20, 54);
      doc.text(`Date: ${new Date(session?.createdAt).toLocaleDateString()}`, 20, 61);
      doc.text(`Hiring Recommendation: ${hiringRec}`, 20, 68);

      let y = 82;
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.text('Performance Scores', 20, y);
      y += 8;
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(180, 180, 180);
      Object.entries(metrics).forEach(([k, v]) => {
        doc.text(`${k}: ${v}/10`, 24, y);
        y += 7;
      });

      if (strengths.length) {
        y += 5;
        doc.setTextColor(255,255,255);
        doc.setFontSize(13);
        doc.setFont('helvetica', 'bold');
        doc.text('Top Strengths', 20, y);
        y += 8;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(180,180,180);
        strengths.forEach(s => { doc.text(`• ${s}`, 24, y); y += 7; });
      }

      if (weaknesses.length) {
        y += 5;
        doc.setTextColor(255,255,255);
        doc.setFontSize(13);
        doc.setFont('helvetica', 'bold');
        doc.text('Focus Areas', 20, y);
        y += 8;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(180,180,180);
        weaknesses.forEach(w => { doc.text(`• ${w}`, 24, y); y += 7; });
      }

      if (verdict) {
        y += 8;
        doc.setTextColor(255,255,255);
        doc.setFontSize(11);
        doc.setFont('helvetica', 'italic');
        const lines = doc.splitTextToSize(verdict, 168);
        lines.forEach(l => { doc.text(l, 20, y); y += 6; });
      }

      doc.save(`InterviewMirrorAI_${session?.candidateName || 'report'}_${new Date().toLocaleDateString().replace(/\//g, '-')}.pdf`);
      setExportMessage('PDF export is ready.');
    } catch (err) {
      console.error('PDF export failed:', err);
      setExportMessage('PDF export failed. Please try again.');
    } finally {
      setExportBusy(false);
    }
  }

  if (isGuestSession) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div className="panel" style={{ maxWidth: 480, textAlign: 'center', padding: '40px 32px' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '16px' }}>🎉</div>
          <h2 style={{ marginBottom: '12px' }}>Your interview is complete!</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: '8px', lineHeight: 1.6 }}>
            Create a free account to see your full results and track your progress.
          </p>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '28px' }}>
            Redirecting to login in {countdown}s...
          </p>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button className="btn btn-primary" onClick={() => onLogout('/signup')}>Sign Up</button>
            <button className="btn btn-ghost" onClick={() => onLogout('/login')}>Log In</button>
          </div>
        </div>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="anim-fade-up" style={{ maxWidth: 600, margin: '40px auto', textAlign: 'center' }}>
        <div style={{ fontSize: '3rem', marginBottom: '16px' }}>📊</div>
        <h2>No results yet</h2>
        <p style={{ color: 'var(--text-muted)', margin: '12px auto 24px', maxWidth: 420 }}>
          Complete an interview session to unlock your performance dashboard and AI coaching insights.
        </p>
        <button className="btn btn-primary btn-lg" onClick={onRestart}>Start an Interview</button>

      </div>
    );
  }

  return (
    <div className="anim-fade-up" style={{ maxWidth: 1100, margin: '0 auto' }}>
      {/* Hero */}
      <div className="dashboard-hero">
        <div>
          <div className="dashboard-hero-eyebrow">Interview Complete</div>
          <h2>{session?.candidateName || 'Candidate'} — Performance Report</h2>
          <p style={{ margin: '6px 0 14px', color: 'var(--text-muted)', fontSize: '0.88rem' }}>
            {session?.role?.replaceAll('-', ' ')} · {session?.difficulty} · {session?.interviewer?.name}
          </p>
          {verdict && (
            <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', maxWidth: 520, lineHeight: 1.6 }}>
              {verdict}
            </p>
          )}
        </div>
        <div className="flex flex-col items-center gap-3">
          <div className={hiringClass(hiringRec)}>
            {hiringRec === 'Strong Hire' ? '✦ ' : hiringRec === 'Hire' ? '✓ ' : ''}
            {hiringRec}
          </div>
          <div className="flex gap-2">
            <button className="btn btn-ghost btn-sm" onClick={onRestart}>New Interview</button>
            <button className="btn btn-secondary btn-sm" onClick={handleExportPDF} disabled={exportBusy}>
              {exportBusy ? <span className="spinner" style={{ width: 12, height: 12 }} /> : (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
              )}
              Export PDF
            </button>
          </div>
          {exportMessage && (
            <span className="dashboard-export-message">{exportMessage}</span>
          )}
        </div>
      </div>

      {/* Score rings */}
      <div className="score-ring-grid">
        <ScoreRing score={metrics.overall     ?? 0} max={10} label="Overall"     />
        <ScoreRing score={metrics.confidence  ?? 0} max={10} label="Confidence"  />
        <ScoreRing score={metrics.clarity     ?? 0} max={10} label="Clarity"     />
        <ScoreRing score={metrics.structure   ?? 0} max={10} label="Structure"   />
        <ScoreRing score={metrics.specificity ?? 0} max={10} label="Specificity" />
      </div>

      {/* Presence scores row */}
      {(summary.toneScore !== undefined || summary.confidenceScore !== undefined || summary.eyeContactScore !== undefined) && (
        <div className="grid-3" style={{ gap: '12px', marginBottom: '20px' }}>
          {[
            { label: 'Tone Score', value: summary.toneScore, max: 100, visual: false },
            { label: 'Confidence Score', value: summary.confidenceScore, max: 100, visual: true },
            { label: 'Eye Contact', value: summary.eyeContactScore, max: 100, visual: true }
          ].map(m => (
            <div key={m.label} className={`metric-card ${m.visual && !visualSummaryActive ? 'metric-card-disabled' : ''}`}>
              <div className="metric-card-label">{m.label}</div>
              <div className="metric-card-value">
                {m.visual && !visualSummaryActive ? 'N/A' : m.value ?? '--'}
                <span style={{ fontSize: '1rem', fontWeight: 400, color: 'var(--text-muted)' }}>/{m.max}</span>
              </div>
              <div className="progress-bar mt-2">
                <div className="progress-fill" style={{
                  width: `${m.visual && !visualSummaryActive ? 0 : m.value ?? 0}%`,
                  background: (m.value ?? 0) >= 70 ? 'var(--success)' : (m.value ?? 0) >= 50 ? 'var(--white)' : 'var(--danger)'
                }} />
              </div>
            </div>
          ))}
          {!visualSummaryActive && (
            <div className="visual-disabled-note dashboard-visual-note">
              Camera-based dashboard metrics are unavailable for sessions where the camera was off.
            </div>
          )}
        </div>
      )}

      {/* Charts */}
      <div className="charts-row">
        <div className="chart-card">
          <div className="panel-header"><span className="panel-title">Performance Radar</span></div>
          <ResponsiveContainer width="100%" height={260}>
            <RadarChart data={radarData}>
              <PolarGrid stroke="rgba(255,255,255,0.06)" />
              <PolarAngleAxis dataKey="metric" tick={{ fontSize: 10, fill: '#777' }} />
              <Radar dataKey="score" stroke="rgba(255,255,255,0.7)" fill="rgba(255,255,255,0.08)" strokeWidth={1.5} />
              <Tooltip contentStyle={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: 10 }} />
            </RadarChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card">
          <div className="panel-header"><span className="panel-title">Round-by-Round Trend</span></div>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis dataKey="round" tick={{ fontSize: 10, fill: '#777' }} />
              <YAxis domain={[0, 10]} tick={{ fontSize: 10, fill: '#777' }} />
              <Tooltip contentStyle={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: 10 }} />
              <Line type="monotone" dataKey="overall"    stroke="rgba(255,255,255,0.8)"  strokeWidth={2} dot={{ r: 3, fill: '#fff' }} />
              <Line type="monotone" dataKey="confidence" stroke="rgba(96,165,250,0.7)"   strokeWidth={2} dot={{ r: 3, fill: '#60a5fa' }} />
              <Line type="monotone" dataKey="specificity" stroke="rgba(74,222,128,0.7)"  strokeWidth={2} dot={{ r: 3, fill: '#4ade80' }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Feedback grid */}
      <div className="feedback-grid">
        <div className="feedback-card">
          <div className="feedback-card-title">Top Strengths</div>
          {strengths.length ? (
            <ul>{strengths.map((s, i) => (
              <li key={i}>
                <span className="list-bullet green" />
                {s}
              </li>
            ))}</ul>
          ) : <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>No notable strengths detected yet.</p>}
        </div>

        <div className="feedback-card">
          <div className="feedback-card-title">Focus Areas</div>
          {weaknesses.length ? (
            <ul>{weaknesses.map((w, i) => (
              <li key={i}>
                <span className="list-bullet orange" />
                {w}
              </li>
            ))}</ul>
          ) : <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>No repeated weakness patterns found.</p>}
        </div>

        {coachingPlan.length > 0 && (
          <div className="feedback-card" style={{ gridColumn: '1 / -1' }}>
            <div className="feedback-card-title">AI Coaching Plan</div>
            <ul>{coachingPlan.map((step, i) => (
              <li key={i}>
                <span className="list-bullet blue" />
                {step}
              </li>
            ))}</ul>
          </div>
        )}
      </div>

      {/* Ideal answer accordion */}
      {session?.transcript?.length > 0 && (
        <div className="panel" style={{ marginBottom: '20px' }}>
          <div className="panel-header">
            <span className="panel-title">Answer Comparison — Your vs Model</span>
            <span className="panel-badge">{session.transcript.length} questions</span>
          </div>
          <div className="accordion">
            {session.transcript.map((entry, i) => (
              <AccordionItem
                key={i}
                q={entry.question}
                a={entry.answer}
                ideal={entry.analysis?.idealAnswer}
                score={entry.analysis?.metrics?.overall}
              />
            ))}
          </div>
        </div>
      )}

      <div className="panel dashboard-sessions-panel">
        <div className="panel-header dashboard-session-header">
          <span className="panel-title panel-title-with-icon"><History size={16} /> All Sessions</span>
          <span className="panel-badge">{history.length}</span>
        </div>

        {history.length === 0 ? (
          <div className="dashboard-empty-state">
            <Clock3 size={22} />
            <strong>No interview sessions yet.</strong>
            <span>Complete an interview to see your compact session history here.</span>
          </div>
        ) : (
          <>
            <div className="session-select-label">
              <ListChecks size={15} /> Session groups
            </div>
            <div className="session-group-list">
              {sessionGroups.map((group) => {
                const expanded = Boolean(openSessionGroups[group.key]);
                return (
                  <div key={group.key} className={`session-group ${expanded ? 'open' : ''}`}>
                    <button
                      type="button"
                      className="session-group-trigger"
                      onClick={() => {
                        setOpenSessionGroups((previous) => ({
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
                          const score = sessionScore(item);
                          const active = selectedHistoryItem?.id === item.id;
                          return (
                            <button
                              key={item.id}
                              type="button"
                              className={`history-row ${active ? 'active' : ''}`}
                              onClick={() => setSelectedHistoryId(item.id)}
                            >
                              <span>
                                <strong>{sessionTitle(item)}</strong>
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

            {selectedHistoryItem && (
              <div className="selected-session-card">
                <div className="selected-session-title-row">
                  <div>
                    <span className="selected-session-eyebrow">Selected session</span>
                    <h3>{sessionTitle(selectedHistoryItem)}</h3>
                  </div>
                  <div className="history-card-score">
                    {sessionScore(selectedHistoryItem) ?? '--'}
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>/10</span>
                  </div>
                </div>

                <div className="session-detail-grid">
                  <DetailRow label="Interview type" value={formatLabel(selectedHistoryItem.role)} />
                  <DetailRow label="Persona" value={formatLabel(selectedHistoryItem.persona)} />
                  <DetailRow label="Date/time" value={formatDateTime(selectedHistoryItem.createdAt)} />
                  <DetailRow label="Result" value={selectedSummary.hiringRecommendation || 'Not available'} />
                </div>

                <div className="session-detail-grid">
                  <DetailRow label="Strengths" value={selectedSummary.strengths?.length ? selectedSummary.strengths.join('; ') : 'Not available'} />
                  <DetailRow label="Weaknesses" value={selectedSummary.weaknesses?.length ? selectedSummary.weaknesses.join('; ') : 'Not available'} />
                  <DetailRow label="Feedback summary" value={selectedSummary.overallVerdict || selectedSummary.recommendation || 'Not available'} />
                  <DetailRow label="Questions answered" value={selectedSummary.questionsAnswered ?? (selectedTranscript.length || 'Not available')} />
                </div>

                <div className="session-question-preview">
                  <div className="feedback-card-title"><CalendarDays size={14} /> Questions, answers, and AI feedback</div>
                  {selectedTranscript.length ? (
                    <div className="accordion">
                      {selectedTranscript.slice(0, 4).map((entry, index) => (
                        <AccordionItem
                          key={`${selectedHistoryItem.id}-${index}`}
                          q={entry.question}
                          a={entry.answer}
                          ideal={entry.analysis?.idealAnswer || entry.analysis?.rewrite}
                          score={entry.analysis?.metrics?.overall}
                        />
                      ))}
                    </div>
                  ) : (
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.84rem' }}>
                      Not available for this saved session.
                    </p>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
