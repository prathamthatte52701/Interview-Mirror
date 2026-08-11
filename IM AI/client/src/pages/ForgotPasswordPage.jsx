import { useMemo, useState } from 'react';
import {
  ArrowLeft,
  Check,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Mail,
  Sparkles,
  User,
  X
} from 'lucide-react';
import {
  forgotPassword,
  getPasswordPolicyError,
  getPasswordPolicyStatus,
  isServerDownError,
  isValidEmail,
  normalizeEmail,
  normalizeUsername
} from '../lib/auth.js';
import RecoveryCodeCard from '../components/RecoveryCodeCard.jsx';

const PASSWORD_RULES = [
  { key: 'length',    label: '8-64 characters' },
  { key: 'uppercase', label: '1 uppercase' },
  { key: 'lowercase', label: '1 lowercase' },
  { key: 'number',    label: '1 number' },
  { key: 'special',  label: '1 special character' }
];

function PasswordChecklist({ status }) {
  return (
    <div className="auth-password-rules" aria-label="Password requirements">
      {PASSWORD_RULES.map((rule) => {
        const passed = status[rule.key];
        return (
          <span key={rule.key} className={passed ? 'is-met' : ''}>
            {passed ? <Check size={13} /> : <X size={13} />}
            {rule.label}
          </span>
        );
      })}
    </div>
  );
}

export default function ForgotPasswordPage({ onNavigate }) {
  const [username, setUsername]             = useState('');
  const [email, setEmail]                   = useState('');
  const [recoveryCode, setRecoveryCode]     = useState('');
  const [newPassword, setNewPassword]       = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNew, setShowNew]               = useState(false);
  const [showConfirm, setShowConfirm]       = useState(false);
  const [fieldErrors, setFieldErrors]       = useState({});
  const [message, setMessage]               = useState('');
  const [messageType, setMessageType]       = useState('error');
  const [busy, setBusy]                     = useState(false);
  const [serverDown, setServerDown]         = useState(false);
  const [newRecoveryCode, setNewRecoveryCode] = useState('');

  const passwordStatus = useMemo(() => getPasswordPolicyStatus(newPassword), [newPassword]);

  function goTo(path) {
    if (onNavigate) {
      onNavigate(path);
    } else {
      window.history.pushState({}, '', path);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  }

  function clearFieldError(field) {
    setFieldErrors((prev) => ({ ...prev, [field]: '' }));
    setMessage('');
  }

  function validate() {
    const errors = {};
    const cleanUsername = normalizeUsername(username);
    const cleanEmail    = normalizeEmail(email);

    if (!cleanUsername) {
      errors.username = 'Username is required.';
    } else if (/\s/.test(cleanUsername)) {
      errors.username = 'Username cannot contain spaces.';
    } else if (cleanUsername.length < 3) {
      errors.username = 'Username must be at least 3 characters.';
    } else if (cleanUsername.length > 12) {
      errors.username = 'Username can be maximum 12 characters.';
    }

    if (!cleanEmail) {
      errors.email = 'Email is required.';
    } else if (!isValidEmail(cleanEmail)) {
      errors.email = 'This is not a valid email.';
    }

    if (!recoveryCode.trim()) {
      errors.recoveryCode = 'Recovery code is required.';
    }

    if (!newPassword) {
      errors.newPassword = 'New password is required.';
    } else if (/\s/.test(newPassword)) {
      errors.newPassword = 'Password cannot contain spaces.';
    } else {
      const pErr = getPasswordPolicyError(newPassword);
      if (pErr) errors.newPassword = pErr;
    }

    if (!confirmPassword) {
      errors.confirmPassword = 'Confirm password is required.';
    } else if (/\s/.test(confirmPassword)) {
      errors.confirmPassword = 'Confirm password cannot contain spaces.';
    } else if (newPassword && confirmPassword !== newPassword) {
      errors.confirmPassword = 'Passwords do not match.';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  function handleUsernameChange(e) {
    const v = e.target.value.slice(0, 12);
    setUsername(v);
    if (/\s/.test(v)) {
      setFieldErrors((p) => ({ ...p, username: 'Username cannot contain spaces.' }));
      return;
    }
    if (v.length >= 12) {
      setFieldErrors((p) => ({ ...p, username: 'Username can be maximum 12 characters.' }));
      return;
    }
    clearFieldError('username');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!validate()) return;

    setMessage('');
    setServerDown(false);
    setBusy(true);

    try {
      const data = await forgotPassword({ username, email, recoveryCode, newPassword, confirmNewPassword: confirmPassword });
      setNewRecoveryCode(data.recoveryCode || '');
    } catch (err) {
      const msg = err.message || 'Unable to reset password. Please try again.';
      if (isServerDownError(msg)) {
        setServerDown(true);
      } else {
        setMessageType('error');
        setMessage(msg);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page auth-page-next">
      {serverDown && (
        <div className="auth-server-down" role="alert">
          <span className="auth-server-down-icon">⚠</span>
          <div>
            <strong>Server is down.</strong>
            <span>Please try again later.</span>
          </div>
        </div>
      )}

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
            {newRecoveryCode ? (
              <div className="auth-card">
                <RecoveryCodeCard
                  code={newRecoveryCode}
                  title="Save your new recovery code"
                  description="Your old recovery code is no longer valid. You'll need this new one next time you reset your password."
                  continueLabel="I've saved my code — Continue to login"
                  onContinue={() => goTo('/login')}
                />
              </div>
            ) : (
            <form className="auth-card" onSubmit={handleSubmit} noValidate>
              <div className="auth-card-header">
                <span className="auth-card-kicker">Account Recovery</span>
                <h2>Reset your password</h2>
                <p>Enter your username, email, and recovery code, then choose a new password.</p>
              </div>

              {message && (
                <div className={`auth-message ${messageType === 'success' ? 'is-success' : ''}`} role="alert">
                  {message}
                </div>
              )}

              {/* Username */}
              <div className="auth-field">
                <label htmlFor="fpUsername">Username</label>
                <div className={`auth-input-shell ${fieldErrors.username ? 'has-error' : ''}`}>
                  <User size={18} />
                  <input
                    id="fpUsername"
                    type="text"
                    value={username}
                    onChange={handleUsernameChange}
                    placeholder="Your username"
                    autoComplete="username"
                    maxLength={12}
                    aria-invalid={fieldErrors.username ? 'true' : 'false'}
                  />
                </div>
                {fieldErrors.username && <p className="auth-field-error">{fieldErrors.username}</p>}
              </div>

              {/* Email */}
              <div className="auth-field">
                <label htmlFor="fpEmail">Email address</label>
                <div className={`auth-input-shell ${fieldErrors.email ? 'has-error' : ''}`}>
                  <Mail size={18} />
                  <input
                    id="fpEmail"
                    type="email"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); clearFieldError('email'); }}
                    placeholder="you@example.com"
                    autoComplete="email"
                    aria-invalid={fieldErrors.email ? 'true' : 'false'}
                  />
                </div>
                {fieldErrors.email && <p className="auth-field-error">{fieldErrors.email}</p>}
              </div>

              {/* Recovery code */}
              <div className="auth-field">
                <label htmlFor="fpRecoveryCode">Recovery code</label>
                <div className={`auth-input-shell ${fieldErrors.recoveryCode ? 'has-error' : ''}`}>
                  <KeyRound size={18} />
                  <input
                    id="fpRecoveryCode"
                    type="text"
                    value={recoveryCode}
                    onChange={(e) => { setRecoveryCode(e.target.value); clearFieldError('recoveryCode'); }}
                    placeholder="XXXX-XXXX-XX"
                    autoComplete="off"
                    aria-invalid={fieldErrors.recoveryCode ? 'true' : 'false'}
                  />
                </div>
                {fieldErrors.recoveryCode && <p className="auth-field-error">{fieldErrors.recoveryCode}</p>}
              </div>

              {/* New Password */}
              <div className="auth-field">
                <label htmlFor="fpNewPwd">New password</label>
                <div className={`auth-input-shell ${fieldErrors.newPassword ? 'has-error' : ''}`}>
                  <Lock size={18} />
                  <input
                    id="fpNewPwd"
                    type={showNew ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => { setNewPassword(e.target.value.slice(0, 64)); clearFieldError('newPassword'); }}
                    placeholder="Create a new password"
                    autoComplete="new-password"
                    maxLength={64}
                  />
                  <button
                    type="button"
                    className="auth-password-toggle"
                    onClick={() => setShowNew((v) => !v)}
                    aria-label={showNew ? 'Hide password' : 'Show password'}
                  >
                    {showNew ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                {fieldErrors.newPassword && <p className="auth-field-error">{fieldErrors.newPassword}</p>}
              </div>

              <PasswordChecklist status={passwordStatus} />

              {/* Confirm Password */}
              <div className="auth-field">
                <label htmlFor="fpConfirmPwd">Confirm new password</label>
                <div className={`auth-input-shell ${fieldErrors.confirmPassword ? 'has-error' : ''}`}>
                  <Lock size={18} />
                  <input
                    id="fpConfirmPwd"
                    type={showConfirm ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => { setConfirmPassword(e.target.value.slice(0, 64)); clearFieldError('confirmPassword'); }}
                    placeholder="Repeat new password"
                    autoComplete="new-password"
                    maxLength={64}
                  />
                  <button
                    type="button"
                    className="auth-password-toggle"
                    onClick={() => setShowConfirm((v) => !v)}
                    aria-label={showConfirm ? 'Hide confirm password' : 'Show confirm password'}
                  >
                    {showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                {fieldErrors.confirmPassword && <p className="auth-field-error">{fieldErrors.confirmPassword}</p>}
              </div>

              <button className="auth-submit" type="submit" disabled={busy}>
                {busy ? (
                  <><span className="spinner" /> Resetting password...</>
                ) : (
                  <>Reset password <Sparkles size={17} /></>
                )}
              </button>

              <div className="auth-switch" style={{ marginTop: '18px' }}>
                <button type="button" onClick={() => goTo('/login')} className="auth-back-link">
                  <ArrowLeft size={15} />
                  Back to login
                </button>
              </div>

              <div className="auth-card-security">
                <Lock size={14} />
                <span>Password is hashed and stored securely.</span>
              </div>
            </form>
            )}
          </div>
        </section>

        <footer className="auth-legal-footer" aria-label="Legal links">
          <button type="button" onClick={() => goTo('/terms')}>Terms of Service</button>
          <span aria-hidden="true">/</span>
          <button type="button" onClick={() => goTo('/privacy')}>Privacy Policy</button>
          <span aria-hidden="true">/</span>
          <button type="button" onClick={() => goTo('/contact')}>Contact Us</button>
        </footer>
      </div>
    </main>
  );
}
