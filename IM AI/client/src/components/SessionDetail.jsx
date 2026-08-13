import { CalendarDays } from 'lucide-react';
import { formatDateTime, formatLabel, sessionScore, sessionTitle } from '../lib/sessionFormat.js';

function DetailRow({ label, value }) {
  return (
    <div className="session-detail-row">
      <span>{label}</span>
      <strong>{value || 'Not available'}</strong>
    </div>
  );
}

export default function SessionDetail({ session, transcript, transcriptLoading = false, loading = false, eyebrow = 'Selected session', className = '' }) {
  const rootClass = `panel selected-session-card${className ? ` ${className}` : ''}`;

  if (loading) {
    return (
      <div className={rootClass} aria-busy="true" aria-live="polite">
        <div className="session-group-skeleton" style={{ height: 60 }} />
        <div className="session-group-skeleton" />
        <div className="session-group-skeleton" />
      </div>
    );
  }

  if (!session) return null;

  const summary = session.summary || {};

  return (
    <div className={rootClass}>
      <div className="selected-session-title-row">
        <div>
          <span className="selected-session-eyebrow">{eyebrow}</span>
          <h3>{sessionTitle(session)}</h3>
        </div>
        <div className="history-card-score">
          {sessionScore(session) ?? '--'}
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>/10</span>
        </div>
      </div>

      <div className="session-detail-grid">
        <DetailRow label="Interview type" value={formatLabel(session.role)} />
        <DetailRow label="Persona" value={formatLabel(session.persona)} />
        <DetailRow label="Date/time" value={formatDateTime(session.createdAt)} />
        <DetailRow label="Result" value={summary.hiringRecommendation || 'Not available'} />
        <DetailRow label="Strengths" value={summary.strengths?.length ? summary.strengths.join('; ') : 'Not available'} />
        <DetailRow label="Weaknesses" value={summary.weaknesses?.length ? summary.weaknesses.join('; ') : 'Not available'} />
        <DetailRow label="Feedback summary" value={summary.overallVerdict || summary.recommendation || 'Not available'} />
        <DetailRow label="Questions answered" value={summary.questionsAnswered ?? (transcript?.length || 'Not available')} />
      </div>

      <div className="session-question-preview">
        <div className="feedback-card-title"><CalendarDays size={14} /> Questions, answers, and AI feedback</div>
        {transcriptLoading ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text-muted)', fontSize: '0.84rem', padding: '10px 2px' }}>
            <span className="spinner" style={{ width: 14, height: 14 }} />
            Loading transcript...
          </div>
        ) : transcript?.length ? (
          <div className="history-answer-list">
            {transcript.map((entry, index) => (
              <div className="history-answer-card" key={`${session.id}-${index}`}>
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
  );
}
