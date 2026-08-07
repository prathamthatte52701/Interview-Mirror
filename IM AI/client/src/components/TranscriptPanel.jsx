export default function TranscriptPanel({ transcript }) {
  if (!transcript.length) {
    return (
      <div className="panel panel-sm">
        <div className="panel-header">
          <span className="panel-title">Transcript</span>
          <span className="panel-badge">0 rounds</span>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>
          Your Q&A history will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="panel panel-sm">
      <div className="panel-header">
        <span className="panel-title">Transcript</span>
        <span className="panel-badge">{transcript.length} rounds</span>
      </div>
      <div className="transcript-list">
        {[...transcript].reverse().map((entry, i) => (
          <div key={i} className="transcript-entry">
            <div className="transcript-q">Q: {entry.question}</div>
            <div className="transcript-a">A: {entry.answer?.slice(0, 140)}{entry.answer?.length > 140 ? '…' : ''}</div>
            {entry.analysis?.metrics?.overall && (
              <div className="transcript-score">
                ◈ {entry.analysis.metrics.overall}/10
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
