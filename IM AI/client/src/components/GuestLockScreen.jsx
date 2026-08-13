export default function GuestLockScreen({ icon = '🔒', title, message, extra = null, onSignUp, onLogIn, signUpLabel = 'Sign Up Free', logInLabel = 'Log In' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
      <div className="panel" style={{ maxWidth: 480, textAlign: 'center', padding: '40px 32px' }}>
        <div style={{ fontSize: '2.5rem', marginBottom: '16px' }}>{icon}</div>
        <h2 style={{ marginBottom: '12px' }}>{title}</h2>
        <p style={{ color: 'var(--text-muted)', marginBottom: extra ? '8px' : '28px', lineHeight: 1.6 }}>
          {message}
        </p>
        {extra && (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '28px' }}>
            {extra}
          </p>
        )}
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={onSignUp}>{signUpLabel}</button>
          <button className="btn btn-ghost" onClick={onLogIn}>{logInLabel}</button>
        </div>
      </div>
    </div>
  );
}
