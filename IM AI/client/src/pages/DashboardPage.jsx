import { useEffect, useMemo, useState } from 'react';
import { Clock3, History, ListChecks } from 'lucide-react';
import {
  RadarChart, PolarGrid, PolarAngleAxis, Radar, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, XAxis, YAxis
} from 'recharts';
import ScoreRing from '../components/ScoreRing.jsx';
import SessionList from '../components/SessionList.jsx';
import SessionDetail from '../components/SessionDetail.jsx';
import GuestLockScreen from '../components/GuestLockScreen.jsx';
import { useSessionHistory } from '../hooks/useSessionHistory.js';
import { useAuthStatus } from '../hooks/useAuthStatus.js';
import { useToast } from '../hooks/useToast.js';
import { formatLabel, formatDateTime, sessionScore, sessionTitle } from '../lib/sessionFormat.js';

function AccordionItem({ q, a, ideal, score }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`accordion-item ${open ? 'open' : ''}`}>
      <button className="accordion-trigger" onClick={() => setOpen(v => !v)}>
        <span style={{ flex: 1, fontSize: '0.82rem', paddingRight: '8px' }}>
          {q?.slice(0, 90)}{q?.length > 90 ? '…' : ''}
          {!open && a && (
            <span style={{ display: 'block', fontSize: '0.74rem', color: 'rgba(255,255,255,0.35)', marginTop: '3px' }}>
              {a.slice(0, 100)}{a.length > 100 ? '…' : ''}
            </span>
          )}
        </span>
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
              <div className="compare-block-text">{a || 'No answer recorded.'}</div>
            </div>
            <div className="compare-block">
              <div className="compare-block-label ideal">Model Answer</div>
              <div className="compare-block-text">{ideal || 'AI model answer not available for this question.'}</div>
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

const COMPARE_METRIC_KEYS = ['overall', 'confidence', 'clarity', 'structure', 'specificity'];

function sanitizeFilenamePart(value) {
  return String(value || '').replace(/[^A-Za-z0-9_-]/g, '_') || 'report';
}

export default function DashboardPage({ session, summary, history = [], loading = false, onRestart, onLogout, onSessionDeleted }) {
  const { isGuestSession } = useAuthStatus();
  const [countdown, setCountdown] = useState(5);
  const { showToast } = useToast();

  const [exportBusy, setExportBusy] = useState(false);
  const [hasBrowsedSession, setHasBrowsedSession] = useState(false);
  const [compareMode, setCompareMode] = useState(false);
  const [compareSelectedIds, setCompareSelectedIds] = useState([]);
  const [showComparison, setShowComparison] = useState(false);

  const {
    sessions, selectedId, selectSession, selectedSession, selectedTranscript, transcriptLoading, deleteSession
  } = useSessionHistory(history, loading, onSessionDeleted);

  function handleSelectSession(id) {
    selectSession(id);
    setHasBrowsedSession(true);
  }

  function toggleCompareMode() {
    setCompareMode((v) => !v);
    setCompareSelectedIds([]);
    setShowComparison(false);
  }

  function toggleCompareSelection(id) {
    setCompareSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 2) return prev;
      return [...prev, id];
    });
  }

  // Guest: clear token immediately, run countdown, redirect at 0
  useEffect(() => {
    if (!isGuestSession) return undefined;
    if (session?.id) localStorage.setItem('pending_claim_session_id', session.id);
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

  const metrics = summary?.averageMetrics || {};
  const radarData = Object.entries(metrics)
    .filter(([k]) => k !== 'overall')
    .map(([metric, score]) => ({ metric, score }));
  const radarHasEnoughData = radarData.filter((d) => Number.isFinite(d.score)).length >= 2;
  const radarTextSummary = radarData.length
    ? `Performance radar across ${radarData.length} metrics: ${radarData.map((d) => `${d.metric} ${Number.isFinite(d.score) ? d.score : 'not available'}`).join(', ')}.`
    : '';

  const trendData = (session?.transcript || []).map((entry, i) => ({
    round: `Q${i + 1}`,
    overall:    entry.analysis?.metrics?.overall,
    confidence: entry.analysis?.metrics?.confidence,
    specificity: entry.analysis?.metrics?.specificity
  }));
  const trendHasEnoughData = trendData.filter((d) => Number.isFinite(d.overall)).length >= 2;
  const trendTextSummary = trendData.length
    ? `Overall score trend across ${trendData.length} questions: ${trendData.map((d) => `${d.round} ${Number.isFinite(d.overall) ? d.overall : 'not available'}`).join(', ')}.`
    : '';

  const strengths      = summary?.strengths || [];
  const weaknesses     = summary?.weaknesses || [];
  const coachingPlan   = summary?.coachingPlan || [];
  const hiringRec      = summary?.hiringRecommendation || 'N/A';
  const verdict        = summary?.overallVerdict || summary?.recommendation || '';
  const visualSummaryActive = summary?.visualMetricsAvailable === true;

  const compareSessions = useMemo(
    () => compareSelectedIds.map((id) => sessions.find((item) => item.id === id)).filter(Boolean),
    [compareSelectedIds, sessions]
  );

  const compareRadarData = useMemo(() => {
    if (compareSessions.length !== 2) return [];
    const [sA, sB] = compareSessions;
    const metricsA = sA.summary?.averageMetrics || {};
    const metricsB = sB.summary?.averageMetrics || {};
    const keys = Array.from(new Set([...Object.keys(metricsA), ...Object.keys(metricsB)])).filter((k) => k !== 'overall');
    return keys.map((metric) => ({ metric, scoreA: metricsA[metric], scoreB: metricsB[metric] }));
  }, [compareSessions]);

  const compareTextSummary = compareSessions.length === 2
    ? `Comparison radar — ${sessionTitle(compareSessions[0])} vs ${sessionTitle(compareSessions[1])}: ${compareRadarData.map((d) => `${d.metric}: ${Number.isFinite(d.scoreA) ? d.scoreA : 'not available'} vs ${Number.isFinite(d.scoreB) ? d.scoreB : 'not available'}`).join(', ')}.`
    : '';

  async function handleExportPDF() {
    setExportBusy(true);
    try {
      // Export whichever session the user is currently viewing in the "All
      // Sessions" browser (if they've clicked one) — not always the page's main session.
      const exportTarget = hasBrowsedSession && selectedSession ? selectedSession : session;
      const exportSummary = hasBrowsedSession && selectedSession ? (selectedSession.summary || {}) : summary;
      const exportMetrics = exportSummary?.averageMetrics || {};
      const exportStrengths = exportSummary?.strengths || [];
      const exportWeaknesses = exportSummary?.weaknesses || [];
      const exportVerdict = exportSummary?.overallVerdict || exportSummary?.recommendation || '';
      const exportHiringRec = exportSummary?.hiringRecommendation || 'N/A';

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
      doc.text(`Candidate: ${exportTarget?.candidateName || 'N/A'}`, 20, 40);
      doc.text(`Role: ${exportTarget?.role?.replaceAll('-', ' ') || 'N/A'}`, 20, 47);
      doc.text(`Difficulty: ${exportTarget?.difficulty || 'N/A'}   |   Questions: ${exportSummary?.questionsAnswered || 0}`, 20, 54);
      doc.text(`Date: ${exportTarget?.createdAt ? new Date(exportTarget.createdAt).toLocaleDateString() : 'Date not available'}`, 20, 61);
      doc.text(`Hiring Recommendation: ${exportHiringRec}`, 20, 68);

      let y = 82;
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.text('Performance Scores', 20, y);
      y += 8;
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(180, 180, 180);
      Object.entries(exportMetrics).forEach(([k, v]) => {
        doc.text(`${k}: ${v}/10`, 24, y);
        y += 7;
      });

      if (exportStrengths.length) {
        y += 5;
        doc.setTextColor(255,255,255);
        doc.setFontSize(13);
        doc.setFont('helvetica', 'bold');
        doc.text('Top Strengths', 20, y);
        y += 8;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(180,180,180);
        exportStrengths.forEach(s => { doc.text(`• ${s}`, 24, y); y += 7; });
      }

      if (exportWeaknesses.length) {
        y += 5;
        doc.setTextColor(255,255,255);
        doc.setFontSize(13);
        doc.setFont('helvetica', 'bold');
        doc.text('Focus Areas', 20, y);
        y += 8;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(180,180,180);
        exportWeaknesses.forEach(w => { doc.text(`• ${w}`, 24, y); y += 7; });
      }

      const exportDelivery = exportSummary?.deliveryMetrics;
      if (exportDelivery) {
        y += 5;
        doc.setTextColor(255,255,255);
        doc.setFontSize(13);
        doc.setFont('helvetica', 'bold');
        doc.text('Speaking Pace & Filler Words (Estimated)', 20, y);
        y += 8;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(180,180,180);
        doc.text(`Average pace: ${exportDelivery.averageWpm} WPM`, 24, y);
        y += 7;
        doc.text(`Filler words: ${exportDelivery.fillerWordCount} (${exportDelivery.fillerWordRate}/100 words)`, 24, y);
        y += 7;
      }

      const exportFlags = exportSummary?.resumeConsistencyFlags;
      if (Array.isArray(exportFlags) && exportFlags.length > 0) {
        y += 5;
        doc.setTextColor(255,255,255);
        doc.setFontSize(13);
        doc.setFont('helvetica', 'bold');
        doc.text('Worth Double-Checking (AI-generated, review yourself)', 20, y);
        y += 8;
        doc.setFontSize(10);
        doc.setTextColor(180,180,180);
        exportFlags.forEach((flag) => {
          doc.setFont('helvetica', 'bold');
          doc.text(`Resume: "${flag.resumeLine}"`, 24, y);
          y += 6;
          doc.setFont('helvetica', 'normal');
          const answerLines = doc.splitTextToSize(`You said: "${flag.answerExcerpt}"`, 164);
          answerLines.forEach(l => { doc.text(l, 24, y); y += 6; });
          const explanationLines = doc.splitTextToSize(flag.explanation || '', 164);
          explanationLines.forEach(l => { doc.text(l, 24, y); y += 6; });
          y += 3;
        });
      }

      if (exportVerdict) {
        y += 8;
        doc.setTextColor(255,255,255);
        doc.setFontSize(11);
        doc.setFont('helvetica', 'italic');
        const lines = doc.splitTextToSize(exportVerdict, 168);
        lines.forEach(l => { doc.text(l, 20, y); y += 6; });
      }

      const filenameCandidate = sanitizeFilenamePart(exportTarget?.candidateName || 'report');
      const filenameDate = sanitizeFilenamePart(new Date().toLocaleDateString());
      doc.save(`InterviewMirrorAI_${filenameCandidate}_${filenameDate}.pdf`);
      showToast('PDF report downloaded.', 'success');
    } catch (err) {
      console.error('PDF export failed:', err);
      showToast('PDF export failed. Please try again.', 'error');
    } finally {
      setExportBusy(false);
    }
  }

  if (isGuestSession) {
    return (
      <GuestLockScreen
        icon="🎉"
        title="Your interview is complete!"
        message="Create a free account to see your full results and track your progress."
        extra={`Redirecting to login in ${countdown}s...`}
        onSignUp={() => onLogout('/signup')}
        onLogIn={() => onLogout('/login')}
        signUpLabel="Sign Up"
      />
    );
  }

  if (loading && !summary) {
    return (
      <div className="anim-fade-up" style={{ maxWidth: 600, margin: '40px auto', textAlign: 'center' }} aria-live="polite" aria-busy="true">
        <span className="spinner" style={{ width: 28, height: 28 }} />
        <p style={{ color: 'var(--text-muted)', marginTop: '14px' }}>Loading your dashboard...</p>
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
          {radarHasEnoughData ? (
            <>
              <ResponsiveContainer width="100%" height={260}>
                <RadarChart data={radarData}>
                  <PolarGrid stroke="rgba(255,255,255,0.06)" />
                  <PolarAngleAxis dataKey="metric" tick={{ fontSize: 10, fill: '#777' }} />
                  <Radar dataKey="score" stroke="rgba(255,255,255,0.7)" fill="rgba(255,255,255,0.08)" strokeWidth={1.5} />
                  <Tooltip contentStyle={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: 10 }} />
                </RadarChart>
              </ResponsiveContainer>
              <span className="sr-only">{radarTextSummary}</span>
            </>
          ) : (
            <div className="chart-empty-state">Not enough data yet for this view.</div>
          )}
        </div>

        <div className="chart-card">
          <div className="panel-header"><span className="panel-title">Round-by-Round Trend</span></div>
          {trendHasEnoughData ? (
            <>
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
              <span className="sr-only">{trendTextSummary}</span>
            </>
          ) : (
            <div className="chart-empty-state">Not enough data yet for this view.</div>
          )}
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
          <span className="flex items-center gap-2">
            <span className="panel-badge">{sessions.length}</span>
            {sessions.length > 1 && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={toggleCompareMode}>
                {compareMode ? 'Exit Compare Mode' : 'Compare Sessions'}
              </button>
            )}
          </span>
        </div>

        {!loading && sessions.length === 0 ? (
          <div className="dashboard-empty-state">
            <Clock3 size={22} />
            <strong>No interview sessions yet.</strong>
            <span>Complete an interview to see your compact session history here.</span>
          </div>
        ) : compareMode ? (
          <>
            <div className="session-select-label">
              <ListChecks size={15} /> Select up to 2 sessions to compare
            </div>
            <div className="session-group-list">
              {sessions.map((item) => {
                const score = sessionScore(item);
                const checked = compareSelectedIds.includes(item.id);
                const checkboxDisabled = !checked && compareSelectedIds.length >= 2;
                return (
                  <label
                    key={item.id}
                    className={`history-row history-row-compare ${checked ? 'active' : ''} ${checkboxDisabled ? 'disabled' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={checkboxDisabled}
                      onChange={() => toggleCompareSelection(item.id)}
                    />
                    <span>
                      <strong>{sessionTitle(item)}</strong>
                      <small>{formatDateTime(item.createdAt)} | {formatLabel(item.difficulty)}</small>
                    </span>
                    <em>{score == null ? '--' : score}/10</em>
                  </label>
                );
              })}
            </div>

            <div className="compare-controls">
              {compareSelectedIds.length < 2 ? (
                <span className="compare-hint">Select {2 - compareSelectedIds.length} more session{2 - compareSelectedIds.length === 1 ? '' : 's'} to compare.</span>
              ) : (
                <button type="button" className="btn btn-primary btn-sm" onClick={() => setShowComparison(true)}>
                  Compare Selected
                </button>
              )}
            </div>

            {showComparison && compareSessions.length === 2 && (
              <div className="compare-panel">
                <div className="compare-panel-header">
                  <span className="feedback-card-title">Session Comparison</span>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowComparison(false)}>
                    Close comparison
                  </button>
                </div>

                <div className="compare-columns">
                  {compareSessions.map((item, index) => {
                    const itemMetrics = item.summary?.averageMetrics || {};
                    return (
                      <div key={item.id} className="compare-column">
                        <div className="compare-column-header">
                          <span className="selected-session-eyebrow">Session {index + 1}</span>
                          <h3>{sessionTitle(item)}</h3>
                          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: '4px 0' }}>
                            {formatLabel(item.role)} · {formatDateTime(item.createdAt)}
                          </p>
                          <span className={hiringClass(item.summary?.hiringRecommendation)}>
                            {item.summary?.hiringRecommendation || 'N/A'}
                          </span>
                        </div>
                        <div className="score-ring-grid compare-score-ring-grid">
                          {COMPARE_METRIC_KEYS.map((key) => (
                            <ScoreRing
                              key={key}
                              score={itemMetrics[key] ?? 0}
                              max={10}
                              size={68}
                              label={key.charAt(0).toUpperCase() + key.slice(1)}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {compareRadarData.length > 0 && (
                  <div className="chart-card" style={{ marginTop: '16px' }}>
                    <div className="panel-header"><span className="panel-title">Overlaid Performance Radar</span></div>
                    <ResponsiveContainer width="100%" height={280}>
                      <RadarChart data={compareRadarData}>
                        <PolarGrid stroke="rgba(255,255,255,0.06)" />
                        <PolarAngleAxis dataKey="metric" tick={{ fontSize: 10, fill: '#777' }} />
                        <Radar name={sessionTitle(compareSessions[0])} dataKey="scoreA" stroke="rgba(96,165,250,0.9)" fill="rgba(96,165,250,0.18)" strokeWidth={1.5} />
                        <Radar name={sessionTitle(compareSessions[1])} dataKey="scoreB" stroke="rgba(74,222,128,0.9)" fill="rgba(74,222,128,0.18)" strokeWidth={1.5} />
                        <Tooltip contentStyle={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: 10 }} />
                      </RadarChart>
                    </ResponsiveContainer>
                    <span className="sr-only">{compareTextSummary}</span>
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="session-select-label">
              <ListChecks size={15} /> Session groups
            </div>
            <SessionList
              sessions={sessions}
              selectedId={selectedId}
              onSelect={handleSelectSession}
              onDelete={deleteSession}
              loading={loading}
            />

            <SessionDetail
              session={selectedSession}
              transcript={selectedTranscript}
              transcriptLoading={transcriptLoading}
              loading={loading}
            />
          </>
        )}
      </div>
    </div>
  );
}
