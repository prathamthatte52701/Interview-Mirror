import { useState } from 'react';
import { ArrowLeft, Lock, Mail, ShieldCheck } from 'lucide-react';
import { adminLogin } from '../lib/adminAuth.js';

export default function AdminLoginPage({ onAuthSuccess, onNavigate }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function goTo(path) {
    if (onNavigate) {
      onNavigate(path);
    } else {
      window.history.pushState({}, '', path);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (busy) return;
    setError('');
    setBusy(true);
    try {
      const user = await adminLogin({ email, password });
      if (onAuthSuccess) onAuthSuccess(user);
      else goTo('/admin');
    } catch (err) {
      setError(err.message || 'Unable to log in.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page auth-page-next">
      <div className="auth-page-frame">
        <header className="auth-topbar">
          <div className="auth-brand">
            <span className="auth-brand-mark" aria-hidden="true">IM</span>
            <div>
              <strong>InterviewMirror <em>AI</em></strong>
            </div>
          </div>
        </header>

        <section className="auth-shell auth-shell--centered">
          <div className="auth-card-wrap auth-card-wrap--solo">
            <form className="auth-card" onSubmit={handleSubmit} noValidate>
              <div className="auth-card-header">
                <span className="auth-card-kicker">
                  <ShieldCheck size={13} style={{ marginRight: 5, verticalAlign: -2 }} />
                  Admin
                </span>
                <h2>Admin sign in</h2>
                <p>Restricted access. Operator credentials only.</p>
              </div>

              {error && (
                <div className="auth-message" role="alert">
                  {error}
                </div>
              )}

              <div className="auth-field">
                <label htmlFor="adminEmail">Email</label>
                <div className="auth-input-shell">
                  <Mail size={18} />
                  <input
                    id="adminEmail"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@example.com"
                    autoComplete="username"
                    required
                  />
                </div>
              </div>

              <div className="auth-field">
                <label htmlFor="adminPassword">Password</label>
                <div className="auth-input-shell">
                  <Lock size={18} />
                  <input
                    id="adminPassword"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                  />
                </div>
              </div>

              <button className="auth-submit" type="submit" disabled={busy}>
                {busy ? 'Signing in…' : 'Sign in'}
              </button>

              <div className="auth-switch" style={{ marginTop: '18px' }}>
                <button type="button" onClick={() => goTo('/')} className="auth-back-link">
                  <ArrowLeft size={15} />
                  Back to InterviewMirror AI
                </button>
              </div>
            </form>
          </div>
        </section>
      </div>
    </main>
  );
}
