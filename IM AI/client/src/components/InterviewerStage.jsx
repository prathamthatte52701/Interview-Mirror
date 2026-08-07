import WaveformVisualizer from './WaveformVisualizer.jsx';

const MOOD_LABELS = {
  neutral:   { label: 'Neutral',   emoji: '◉' },
  listening: { label: 'Listening', emoji: '◌' },
  speaking:  { label: 'Speaking',  emoji: '▶' },
  impressed: { label: 'Impressed', emoji: '✦' },
  skeptical: { label: 'Skeptical', emoji: '△' }
};

const PERSONA_EMOJI = {
  'calm-senior-interviewer': '👩‍💼',
  'friendly-recruiter': '😊',
  'strict-panelist': '🎯',
  'startup-founder': '🚀',
  'technical-mentor': '*',
  'senior-engineering-manager': 'EM',
  'strict-product-interviewer': 'PI'
};

export default function InterviewerStage({
  interviewer,
  persona,
  mood = 'neutral',
  currentQuestion,
  followUpText,
  pressureScore = 50,
  isSpeaking
}) {
  const state = isSpeaking ? 'speaking' : mood;
  const moodMeta = MOOD_LABELS[state] || MOOD_LABELS.neutral;
  const emoji = PERSONA_EMOJI[persona] || '🤖';
  const urgency =
    pressureScore > 75 ? 'high' : pressureScore > 55 ? 'medium' : 'low';

  const pressureTone =
    urgency === 'high'
      ? {
          bg: 'rgba(248,113,113,0.12)',
          border: '1px solid rgba(248,113,113,0.22)',
          color: '#fca5a5'
        }
      : urgency === 'medium'
      ? {
          bg: 'rgba(250,204,21,0.10)',
          border: '1px solid rgba(250,204,21,0.20)',
          color: '#fde68a'
        }
      : {
          bg: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.10)',
          color: 'var(--text-secondary)'
        };

  return (
    <div
      className="interviewer-stage panel"
      style={{
        padding: 0,
        overflow: 'hidden',
        borderRadius: '32px',
        border: '1px solid rgba(255,255,255,0.08)',
        background:
          'radial-gradient(circle at top right, rgba(96,165,250,0.12), transparent 22%), radial-gradient(circle at top left, rgba(167,139,250,0.10), transparent 18%), linear-gradient(180deg, rgba(18,18,18,0.98), rgba(10,10,10,0.98))',
        boxShadow: '0 24px 70px rgba(0,0,0,0.42)'
      }}
    >
      <div
        className="stage-room"
        style={{
          padding: '26px',
          minHeight: '520px',
          display: 'flex',
          flexDirection: 'column',
          gap: '18px',
          background: 'transparent'
        }}
      >
        {/* Top bar */}
        <div
          className="stage-topbar"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            flexWrap: 'wrap'
          }}
        >
          <div className="flex items-center gap-2" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <span
              className="badge badge-live"
              style={{
                padding: '7px 12px',
                fontSize: '0.74rem',
                fontWeight: 700
              }}
            >
              <span className="live-dot" />
              LIVE SESSION
            </span>

            <span
              className="badge badge-default"
              style={{
                padding: '7px 12px',
                fontSize: '0.74rem',
                color: 'var(--text-secondary)'
              }}
            >
              Pressure {pressureScore}/100
            </span>
          </div>

          <span
            className={`badge ${urgency === 'high' ? 'badge-danger' : urgency === 'medium' ? 'badge-warning' : 'badge-default'}`}
            style={{
              padding: '7px 12px',
              fontSize: '0.74rem',
              background: pressureTone.bg,
              border: pressureTone.border,
              color: pressureTone.color
            }}
          >
            {urgency === 'high'
              ? '⚡ High pressure'
              : urgency === 'medium'
              ? '◈ Medium pressure'
              : '◎ Low pressure'}
          </span>
        </div>

        {/* Persona display */}
        <div
          className="ai-persona-display"
          style={{
            display: 'grid',
            gridTemplateColumns: '120px 1fr',
            gap: '22px',
            alignItems: 'center',
            padding: '22px',
            borderRadius: '26px',
            background: 'rgba(255,255,255,0.035)',
            border: '1px solid rgba(255,255,255,0.08)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)'
          }}
        >
          <div
            className="ai-avatar-container"
            style={{
              position: 'relative',
              width: '104px',
              height: '104px',
              margin: '0 auto'
            }}
          >
            <div
              className={`ai-avatar-ring ${isSpeaking ? 'speaking' : ''}`}
              style={{
                position: 'absolute',
                inset: '-10px',
                borderRadius: '50%',
                border: isSpeaking
                  ? '1.5px solid rgba(96,165,250,0.55)'
                  : '1px solid rgba(255,255,255,0.08)',
                boxShadow: isSpeaking
                  ? '0 0 0 8px rgba(96,165,250,0.07), 0 0 40px rgba(96,165,250,0.18)'
                  : 'none',
                transition: 'all 0.25s ease'
              }}
            />

            <div
              className="ai-avatar"
              style={{
                width: '104px',
                height: '104px',
                borderRadius: '50%',
                display: 'grid',
                placeItems: 'center',
                background:
                  'radial-gradient(circle at 30% 30%, rgba(255,255,255,0.10), transparent 26%), linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0.03))',
                border: '1px solid rgba(255,255,255,0.12)',
                boxShadow: '0 18px 50px rgba(0,0,0,0.28)'
              }}
            >
              <div
                className="ai-avatar-inner"
                style={{
                  fontSize: '2.5rem',
                  lineHeight: 1
                }}
              >
                {emoji}
              </div>
            </div>
          </div>

          <div className="ai-info" style={{ minWidth: 0 }}>
            <div
              className="ai-name"
              style={{
                fontSize: '1.35rem',
                fontWeight: 800,
                color: 'var(--text-primary)',
                letterSpacing: '-0.03em',
                marginBottom: '4px'
              }}
            >
              {interviewer?.name || 'AI Interviewer'}
            </div>

            <div
              className="ai-title"
              style={{
                fontSize: '0.92rem',
                color: 'var(--text-muted)',
                marginBottom: '14px',
                lineHeight: 1.6
              }}
            >
              {interviewer?.title || 'Virtual Interviewer'}
            </div>

            <div
              className="ai-mood-row"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                flexWrap: 'wrap'
              }}
            >
              <div
                className="mood-indicator"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 12px',
                  borderRadius: '999px',
                  background: isSpeaking
                    ? 'rgba(96,165,250,0.10)'
                    : 'rgba(255,255,255,0.05)',
                  border: isSpeaking
                    ? '1px solid rgba(96,165,250,0.22)'
                    : '1px solid rgba(255,255,255,0.08)',
                  color: isSpeaking ? '#bfdbfe' : 'var(--text-secondary)',
                  fontSize: '0.8rem',
                  fontWeight: 600
                }}
              >
                <span>{moodMeta.emoji}</span>
                <span>{moodMeta.label}</span>
              </div>

              <span
                className="badge badge-default"
                style={{
                  fontSize: '0.74rem',
                  padding: '8px 12px',
                  color: 'var(--text-secondary)',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.09)'
                }}
              >
                {persona?.replaceAll('-', ' ')}
              </span>
            </div>
          </div>
        </div>

        {/* Waveform */}
        <div
          style={{
            padding: '14px 18px',
            borderRadius: '22px',
            background: isSpeaking
              ? 'rgba(96,165,250,0.08)'
              : 'rgba(255,255,255,0.03)',
            border: isSpeaking
              ? '1px solid rgba(96,165,250,0.18)'
              : '1px solid rgba(255,255,255,0.06)'
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '8px',
              gap: '12px'
            }}
          >
            <span
              style={{
                fontSize: '0.76rem',
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.08em'
              }}
            >
              Voice activity
            </span>

            <span
              style={{
                fontSize: '0.78rem',
                color: isSpeaking ? '#93c5fd' : 'var(--text-secondary)',
                fontWeight: 600
              }}
            >
              {isSpeaking ? 'AI speaking...' : 'Standby'}
            </span>
          </div>

          <WaveformVisualizer active={isSpeaking} bars={24} />
        </div>

        {/* Question block */}
        <div
          className="question-box"
          style={{
            borderRadius: '26px',
            padding: '24px',
            background:
              followUpText
                ? 'linear-gradient(180deg, rgba(96,165,250,0.07), rgba(255,255,255,0.03))'
                : 'linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.025))',
            border: followUpText
              ? '1px solid rgba(96,165,250,0.18)'
              : '1px solid rgba(255,255,255,0.08)'
          }}
        >
          <div
            className="question-label"
            style={{
              fontSize: '0.74rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              color: followUpText ? '#93c5fd' : 'var(--text-muted)',
              marginBottom: '12px'
            }}
          >
            {followUpText ? '↳ Follow-up Question' : 'Current Question'}
          </div>

          <p
            className="question-text"
            style={{
              margin: 0,
              fontSize: '1.08rem',
              lineHeight: 1.9,
              color: 'var(--text-primary)',
              fontWeight: 500
            }}
          >
            {followUpText ||
              currentQuestion ||
              'Waiting for interview to begin...'}
          </p>
        </div>

        {/* Footer hint */}
        {interviewer?.style && (
          <div
            style={{
              marginTop: 'auto',
              padding: '14px 16px',
              borderRadius: '18px',
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.07)'
            }}
          >
            <div
              style={{
                fontSize: '0.72rem',
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                marginBottom: '6px'
              }}
            >
              Interview style
            </div>

            <p
              style={{
                margin: 0,
                fontSize: '0.82rem',
                color: 'var(--text-secondary)',
                fontStyle: 'italic',
                lineHeight: 1.7
              }}
            >
              {interviewer.style}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
