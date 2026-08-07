import { useState } from 'react';
import { CameraOff } from 'lucide-react';

function ScoreBar({ label, value, max = 10, disabled = false }) {
  const safeValue = Number.isFinite(value) ? value : null;
  const pct = disabled || safeValue == null ? 0 : Math.min(100, (safeValue / max) * 100);
  const color = pct >= 70 ? 'var(--success)' : pct >= 50 ? 'var(--white)' : 'var(--danger)';
  return (
    <div className={`score-bar-row ${disabled ? 'score-bar-row-disabled' : ''}`}>
      <span className="score-bar-label">{label}</span>
      <div className="score-bar-track">
        <div className="score-bar-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="score-bar-num">{disabled || safeValue == null ? 'N/A' : `${safeValue}/${max}`}</span>
    </div>
  );
}

export default function AnalysisPanel({ analysis, cameraReady = false }) {
  const [showIdeal, setShowIdeal] = useState(false);

  if (!analysis) {
    return (
      <div className="panel panel-sm">
        <div className="panel-header">
          <span className="panel-title">Live Evaluation</span>
        </div>
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', lineHeight: 1.6 }}>
            Answer a question to unlock AI-powered scorecards, feedback, and coaching.
          </p>
        </div>
      </div>
    );
  }

  const {
    metrics,
    confidenceScore,
    toneScore,
    eyeContactScore,
    postureScore,
    attentionScore,
    faceVisibilityScore,
    engagementScore,
    visualMetricsAvailable,
    strengths,
    weaknesses,
    improvements,
    evidence,
    idealAnswer,
    rewrite
  } = analysis;
  const overall = metrics?.overall ?? 0;
  const overallColor = overall >= 7.5 ? 'var(--success)' : overall >= 6 ? 'var(--info)' : overall >= 5 ? 'var(--warning)' : 'var(--danger)';
  const visualSignalsActive = cameraReady && visualMetricsAvailable !== false;

  return (
    <div className="panel panel-sm" style={{ overflow: 'hidden' }}>
      <div className="panel-header">
        <span className="panel-title">Live Evaluation</span>
        <span style={{
          fontSize: '1.3rem', fontWeight: 800, color: overallColor,
          fontVariantNumeric: 'tabular-nums'
        }}>
          {overall}/10
        </span>
      </div>

      {/* Score bars */}
      <div className="score-bar-wrap mt-2">
        <ScoreBar label="Relevance"  value={metrics?.relevance  ?? 0} />
        <ScoreBar label="Clarity"    value={metrics?.clarity    ?? 0} />
        <ScoreBar label="Structure"  value={metrics?.structure  ?? 0} />
        <ScoreBar label="Specificity" value={metrics?.specificity ?? 0} />
        <ScoreBar label="Confidence" value={metrics?.confidence ?? 0} />
        <ScoreBar label="Role Fit"   value={metrics?.roleFit    ?? 0} />
      </div>

      {/* Presence scores */}
      {(confidenceScore !== undefined || toneScore !== undefined || eyeContactScore !== undefined) && (
        <div className="score-bar-wrap mt-3">
          <div className="feedback-title">Presence signals</div>
          <ScoreBar label="Tone" value={toneScore ?? null} max={100} />
          <ScoreBar label="Confidence" value={visualSignalsActive ? confidenceScore : null} max={100} disabled={!visualSignalsActive} />
          <ScoreBar label="Eye Contact" value={visualSignalsActive ? eyeContactScore : null} max={100} disabled={!visualSignalsActive} />
          <ScoreBar label="Posture" value={visualSignalsActive ? postureScore : null} max={100} disabled={!visualSignalsActive} />
          <ScoreBar label="Attention" value={visualSignalsActive ? attentionScore : null} max={100} disabled={!visualSignalsActive} />
          <ScoreBar label="Face Visible" value={visualSignalsActive ? faceVisibilityScore : null} max={100} disabled={!visualSignalsActive} />
          <ScoreBar label="Engagement" value={visualSignalsActive ? engagementScore : null} max={100} disabled={!visualSignalsActive} />
          {!visualSignalsActive && (
            <div className="visual-disabled-note">
              <CameraOff size={14} />
              Enable camera to analyze posture, attention, eye contact, confidence, and face visibility.
            </div>
          )}
        </div>
      )}

      <div className="divider" />

      {/* Strengths */}
      {strengths?.length > 0 && (
        <div className="feedback-section">
          <div className="feedback-title">Strengths</div>
          <div className="feedback-list">
            {strengths.map((s, i) => (
              <div key={i} className="feedback-item">
                <span className="feedback-dot success" />
                {s}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Weaknesses */}
      {weaknesses?.length > 0 && (
        <div className="feedback-section">
          <div className="feedback-title">Focus Areas</div>
          <div className="feedback-list">
            {weaknesses.map((w, i) => (
              <div key={i} className="feedback-item">
                <span className="feedback-dot danger" />
                {w}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Improvements */}
      {improvements?.length > 0 && (
        <div className="feedback-section">
          <div className="feedback-title">Coaching Tips</div>
          <div className="feedback-list">
            {improvements.slice(0, 3).map((imp, i) => (
              <div key={i} className="feedback-item">
                <span className="feedback-dot info" />
                {imp}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Ideal answer toggle */}
      {idealAnswer && (
        <div style={{ marginTop: '10px' }}>
          <button
            className="btn btn-ghost btn-sm w-full"
            onClick={() => setShowIdeal(v => !v)}
            style={{ justifyContent: 'space-between', width: '100%' }}
          >
            <span>Model Answer</span>
            <svg
              width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              style={{ transform: showIdeal ? 'rotate(180deg)' : 'none', transition: '0.2s' }}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          {showIdeal && (
            <div className="ideal-answer-block mt-2" style={{ fontStyle: 'normal' }}>
              {idealAnswer}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
