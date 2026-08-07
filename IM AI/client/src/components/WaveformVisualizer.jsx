export default function WaveformVisualizer({ active = false, bars = 20, color = '#ffffff' }) {
  const heights = Array.from({ length: bars }, (_, i) => {
    const base = 4 + Math.sin(i * 0.9) * 10;
    return Math.max(4, Math.round(base + Math.random() * 16));
  });

  return (
    <div className={`waveform ${active ? 'active' : 'idle'}`} aria-hidden="true">
      {heights.map((h, i) => (
        <div
          key={i}
          className="waveform-bar"
          style={{
            '--height': `${h}px`,
            '--delay': `${(i * 0.06).toFixed(2)}s`,
            height: active ? undefined : '3px',
            background: color,
            opacity: active ? 1 : 0.15
          }}
        />
      ))}
    </div>
  );
}
