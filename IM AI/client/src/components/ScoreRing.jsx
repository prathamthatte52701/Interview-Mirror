export default function ScoreRing({ score = 0, max = 10, size = 90, label = '', strokeWidth = 5 }) {
  const pct = Math.min(1, Math.max(0, score / max));
  const r = (size - strokeWidth * 2) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - pct);
  const display = max === 10 ? score.toFixed(1) : `${Math.round(score)}`;

  const color = pct >= 0.75 ? '#4ade80' : pct >= 0.55 ? '#22d3ee' : pct >= 0.4 ? '#facc15' : '#f87171';
  const glowColor = pct >= 0.75 ? 'rgba(74,222,128,0.35)' : pct >= 0.55 ? 'rgba(34,211,238,0.35)' : pct >= 0.4 ? 'rgba(250,204,21,0.3)' : 'rgba(248,113,113,0.28)';
  const filterId = `glow-${label.replace(/\s/g,'-').toLowerCase()}`;

  return (
    <div className="score-ring-card">
      <div style={{ position: 'relative', width: size, height: size }}>
        <svg width={size} height={size}>
          <defs>
            <filter id={filterId} x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>
          {/* Track */}
          <circle
            cx={size / 2} cy={size / 2} r={r}
            fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={strokeWidth}
          />
          {/* Glow ring (blurred, slightly larger) */}
          <circle
            cx={size / 2} cy={size / 2} r={r}
            fill="none" stroke={color} strokeWidth={strokeWidth + 3}
            strokeDasharray={circ} strokeDashoffset={offset}
            strokeLinecap="round"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            style={{
              transition: 'stroke-dashoffset 1.2s cubic-bezier(0,0,0.3,1), stroke 0.4s ease',
              opacity: 0.25,
              filter: `blur(4px)`
            }}
          />
          {/* Main ring */}
          <circle
            cx={size / 2} cy={size / 2} r={r}
            fill="none" stroke={color} strokeWidth={strokeWidth}
            strokeDasharray={circ} strokeDashoffset={offset}
            strokeLinecap="round"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            style={{ transition: 'stroke-dashoffset 1.2s cubic-bezier(0,0,0.3,1), stroke 0.4s ease' }}
          />
        </svg>
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center'
        }}>
          <span style={{
            fontSize: '1.2rem', fontWeight: 800,
            color: color,
            letterSpacing: '-0.03em',
            textShadow: `0 0 12px ${glowColor}`
          }}>
            {display}
          </span>
          <span style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.3)', marginTop: '1px' }}>
            /{max}
          </span>
        </div>
      </div>
      {label && <div className="score-ring-label">{label}</div>}
    </div>
  );
}
