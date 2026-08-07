import { Camera, CameraOff, Power, ShieldAlert } from 'lucide-react';

function metricValue(value) {
  return Number.isFinite(value) ? value : null;
}

export default function PresencePanel({
  videoRef,
  metrics,
  cameraReady,
  cameraStatus,
  cameraMessage,
  cameraBusy,
  onEnableCamera,
  onDisableCamera
}) {
  const cameraOn = cameraReady && cameraStatus === 'on';
  const noPersonDetected = cameraStatus === 'no-person';
  const bars = [
    { key: 'eyeContact', label: 'Eye Contact', value: metricValue(metrics.eyeContact) },
    { key: 'posture', label: 'Posture', value: metricValue(metrics.posture) },
    { key: 'attention', label: 'Attention', value: metricValue(metrics.attention) },
    { key: 'confidence', label: 'Confidence', value: metricValue(metrics.confidence) },
    { key: 'faceVisibility', label: 'Face Visible', value: metricValue(metrics.faceVisibility) },
    { key: 'engagement', label: 'Engagement', value: metricValue(metrics.engagement) }
  ];

  const expressionColor = {
    Focused: 'var(--success)',
    Engaged: 'var(--info)',
    Calm: 'var(--text-secondary)',
    Attentive: 'var(--info)',
    Neutral: 'var(--text-muted)',
    Distracted: 'var(--warning)',
    'Attention drifting': 'var(--warning)',
    'Basic camera active': 'var(--info)'
  }[metrics.expression] || 'var(--text-muted)';

  return (
    <div className="panel panel-sm">
      <div className="panel-header">
        <span className="panel-title">Your Presence</span>
        <span className={`badge ${cameraOn ? 'badge-live' : cameraBusy || noPersonDetected ? 'badge-warning' : 'badge-danger'}`}>
          {cameraOn ? (
            <><span className="live-dot" /> Camera On</>
          ) : cameraBusy ? (
            <>Requesting</>
          ) : noPersonDetected ? (
            <>No person detected</>
          ) : (
            <>Camera Off</>
          )}
        </span>
      </div>

      <div className="camera-frame" style={{ marginBottom: '12px', aspectRatio: '4/3' }}>
        <video
          ref={videoRef}
          className="camera-video"
          muted
          autoPlay
          playsInline
          style={{ display: cameraOn ? 'block' : 'none' }}
        />

        {!cameraOn && (
          <div className="camera-placeholder">
            <CameraOff size={34} />
            <strong>{cameraBusy ? 'Requesting camera...' : noPersonDetected ? 'No person detected' : 'Camera off'}</strong>
            <span>{cameraMessage || 'Enable camera to analyze posture, attention, and face visibility.'}</span>
            {cameraStatus === 'denied' && (
              <span className="camera-retry-note">
                After changing browser permissions, click Enable Camera again.
              </span>
            )}
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={onEnableCamera}
              disabled={cameraBusy}
            >
              {cameraBusy ? <span className="spinner" style={{ width: 12, height: 12 }} /> : <Camera size={14} />}
              Enable Camera
            </button>
          </div>
        )}

        {cameraOn && (
          <div className="camera-overlay">
            <div className="camera-corner tl" />
            <div className="camera-corner tr" />
            <div className="camera-corner bl" />
            <div className="camera-corner br" />
            <div className="camera-status">
              <span className="badge badge-live">
                <span className="live-dot" />
                REC
              </span>
            </div>
          </div>
        )}
      </div>

      <div className={`camera-control-strip ${cameraOn ? 'on' : 'off'}`}>
        <div>
          <strong>{cameraOn ? 'Person detected' : noPersonDetected ? 'No person detected' : 'Camera off'}</strong>
          <span>
            {cameraOn
              ? 'Visibility-gated camera indicators are active for this session.'
              : noPersonDetected
              ? 'Camera is on, but visual metrics are paused until a person is visible.'
              : 'Enable camera to analyze posture, attention, and face visibility.'}
          </span>
        </div>
        <button
          type="button"
          className={`btn ${cameraOn ? 'btn-danger' : 'btn-secondary'} btn-sm`}
          onClick={cameraOn ? onDisableCamera : onEnableCamera}
          disabled={cameraBusy}
        >
          {cameraOn ? <Power size={14} /> : <Camera size={14} />}
          {cameraOn ? 'Turn Off Camera' : 'Enable Camera'}
        </button>
      </div>

      {cameraOn && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '10px' }}>
          <span style={{
            fontSize: '0.8rem',
            fontWeight: 600,
            color: expressionColor,
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid var(--border)',
            borderRadius: '999px',
            padding: '4px 12px'
          }}>
            {metrics.expression}
          </span>
        </div>
      )}

      {!cameraOn && (
        <div className="visual-disabled-note">
          <ShieldAlert size={14} />
          {noPersonDetected
            ? 'Camera-based parameters are paused until a person is visible.'
            : 'Camera-based parameters are disabled until a live camera stream is active.'}
        </div>
      )}

      <div className="score-bar-wrap" style={{ gap: '6px' }}>
        {bars.map(({ key, label, value }) => (
          <div key={key} className={`score-bar-row ${cameraOn ? '' : 'score-bar-row-disabled'}`}>
            <span className="score-bar-label" style={{ width: '82px', fontSize: '0.72rem' }}>{label}</span>
            <div className="score-bar-track" style={{ height: '3px' }}>
              <div
                className="score-bar-fill"
                style={{
                  width: `${cameraOn && value != null ? value : 0}%`,
                  background: value >= 75 ? 'var(--success)' : value >= 55 ? 'var(--white)' : 'var(--warning)'
                }}
              />
            </div>
            <span className="score-bar-num">{cameraOn && value != null ? `${value}%` : 'N/A'}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
