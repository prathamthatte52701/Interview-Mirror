import { useMemo, useState } from 'react';
import {
  BarChart3, CalendarDays, Eye, EyeOff, KeyRound, Lock, LogOut,
  Mail, PlayCircle, ShieldAlert, ShieldCheck, Trash2, UserRound
} from 'lucide-react';
import { changePassword, deleteAccount, getPasswordPolicyStatus, logoutEverywhere, regenerateRecoveryCode } from '../lib/auth.js';
import { useToast } from '../hooks/useToast.js';
import PasswordChecklist, { PasswordStrengthMeter } from '../components/PasswordChecklist.jsx';
import RecoveryCodeCard from '../components/RecoveryCodeCard.jsx';

function displayName(user) {
  return user?.username || user?.email || 'Interview Mirror User';
}

function lastInterviewDate(history) {
  const dates = history
    .map((item) => new Date(item.createdAt))
    .filter((date) => !Number.isNaN(date.getTime()))
    .sort((a, b) => b - a);

  return dates[0] ? dates[0].toLocaleString() : 'Not available';
}

function averageScore(history) {
  const scores = history
    .map((item) => item.summary?.averageMetrics?.overall)
    .filter((score) => Number.isFinite(score));

  if (!scores.length) return 'Not available';
  return `${(scores.reduce((sum, score) => sum + score, 0) / scores.length).toFixed(1)}/10`;
}

function memberSince(value) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

function ChangePasswordSection() {
  const { showToast } = useToast();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const passwordStatus = useMemo(() => getPasswordPolicyStatus(newPassword), [newPassword]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!confirmPassword || confirmPassword !== newPassword) {
      setError('New password and confirmation do not match.');
      return;
    }

    setBusy(true);
    try {
      await changePassword({ currentPassword, newPassword });
      showToast('Password changed successfully.', 'success');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(err.message || 'Unable to change password.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="profile-settings-card">
      <h3><Lock size={17} /> Change Password</h3>
      <p>Update the password used to sign in to your account.</p>

      <form onSubmit={handleSubmit} className="profile-settings-form" noValidate>
        <div className="auth-field">
          <label htmlFor="currentPassword">Current password</label>
          <div className="auth-input-shell">
            <Lock size={18} />
            <input
              id="currentPassword"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>
        </div>

        <div className="auth-field">
          <label htmlFor="newPassword">New password</label>
          <div className="auth-input-shell">
            <Lock size={18} />
            <input
              id="newPassword"
              type={showNew ? 'text' : 'password'}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value.slice(0, 64))}
              autoComplete="new-password"
            />
            <button type="button" className="auth-password-toggle" onClick={() => setShowNew((v) => !v)} aria-label={showNew ? 'Hide password' : 'Show password'}>
              {showNew ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        {newPassword && <PasswordStrengthMeter status={passwordStatus} />}
        {newPassword && <PasswordChecklist status={passwordStatus} />}

        <div className="auth-field">
          <label htmlFor="confirmNewPassword">Confirm new password</label>
          <div className="auth-input-shell">
            <Lock size={18} />
            <input
              id="confirmNewPassword"
              type={showNew ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value.slice(0, 64))}
              autoComplete="new-password"
            />
          </div>
        </div>

        {error && <p className="auth-field-error">{error}</p>}

        <button type="submit" className="btn btn-primary" disabled={busy || !currentPassword || !newPassword}>
          {busy ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Change Password'}
        </button>
      </form>
    </section>
  );
}

function RecoveryCodeSection() {
  const { showToast } = useToast();
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [newCode, setNewCode] = useState('');

  async function handleConfirm(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const data = await regenerateRecoveryCode(password);
      setNewCode(data.recoveryCode || '');
      setConfirming(false);
      setPassword('');
    } catch (err) {
      setError(err.message || 'Unable to regenerate recovery code.');
    } finally {
      setBusy(false);
    }
  }

  if (newCode) {
    return (
      <section className="profile-settings-card">
        <RecoveryCodeCard
          code={newCode}
          title="Save your new recovery code"
          description="Your old recovery code no longer works. Store this one somewhere safe."
          continueLabel="I've saved my new code"
          onContinue={() => { setNewCode(''); showToast('Recovery code regenerated.', 'success'); }}
        />
      </section>
    );
  }

  return (
    <section className="profile-settings-card">
      <h3><KeyRound size={17} /> Recovery Code</h3>
      <p>Generate a new recovery code if you've lost or shared your current one. Your old code stops working immediately.</p>

      {confirming ? (
        <form onSubmit={handleConfirm} className="profile-inline-confirm" noValidate>
          <div className="auth-field">
            <label htmlFor="recoveryConfirmPassword">Confirm your password to continue</label>
            <div className="auth-input-shell">
              <Lock size={18} />
              <input
                id="recoveryConfirmPassword"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                autoFocus
              />
            </div>
          </div>
          {error && <p className="auth-field-error">{error}</p>}
          <div className="profile-actions">
            <button type="button" className="btn btn-ghost" onClick={() => { setConfirming(false); setPassword(''); setError(''); }} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={busy || !password}>
              {busy ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Confirm & Generate'}
            </button>
          </div>
        </form>
      ) : (
        <div className="profile-actions">
          <button type="button" className="btn btn-secondary" onClick={() => setConfirming(true)}>
            Generate new recovery code
          </button>
        </div>
      )}
    </section>
  );
}

function LogoutEverywhereSection({ onLogout }) {
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    setBusy(true);
    try {
      await logoutEverywhere();
      showToast('Logged out of all devices.', 'success');
      onLogout('/login');
    } catch (err) {
      showToast(err.message || 'Unable to log out of all devices.', 'error');
      setBusy(false);
    }
  }

  return (
    <section className="profile-actions-card">
      <div>
        <h3>Log out of all devices</h3>
        <p>Invalidates every session token issued for your account, including this one.</p>
      </div>
      <div className="profile-actions">
        <button type="button" className="btn btn-secondary" onClick={handleClick} disabled={busy}>
          {busy ? <span className="spinner" style={{ width: 14, height: 14 }} /> : <><LogOut size={16} /> Log out everywhere</>}
        </button>
      </div>
    </section>
  );
}

function DeleteAccountSection({ user, onLogout }) {
  const { showToast } = useToast();
  const [confirming, setConfirming] = useState(false);
  const [identityConfirm, setIdentityConfirm] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const identityMatches = identityConfirm.trim().toLowerCase() === (user?.username || '').toLowerCase()
    || identityConfirm.trim().toLowerCase() === (user?.email || '').toLowerCase();

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!identityMatches) {
      setError('Type your exact username or email to confirm.');
      return;
    }
    setBusy(true);
    try {
      await deleteAccount(password);
      showToast('Account deleted.', 'success');
      onLogout('/login');
    } catch (err) {
      setError(err.message || 'Unable to delete account.');
      setBusy(false);
    }
  }

  return (
    <section className="profile-settings-card profile-danger-card">
      <h3><ShieldAlert size={17} /> Delete My Account</h3>
      <p>This permanently deletes your account and every interview session you've recorded. This cannot be undone.</p>

      {confirming ? (
        <form onSubmit={handleSubmit} className="profile-inline-confirm" noValidate>
          <div className="auth-field">
            <label htmlFor="deleteIdentityConfirm">Type your username or email to confirm</label>
            <div className="auth-input-shell">
              <UserRound size={18} />
              <input
                id="deleteIdentityConfirm"
                type="text"
                value={identityConfirm}
                onChange={(e) => setIdentityConfirm(e.target.value)}
                placeholder={user?.username || user?.email || ''}
                autoFocus
              />
            </div>
          </div>
          <div className="auth-field">
            <label htmlFor="deletePasswordConfirm">Password</label>
            <div className="auth-input-shell">
              <Lock size={18} />
              <input
                id="deletePasswordConfirm"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>
          </div>
          {error && <p className="auth-field-error">{error}</p>}
          <div className="profile-actions">
            <button type="button" className="btn btn-ghost" onClick={() => { setConfirming(false); setIdentityConfirm(''); setPassword(''); setError(''); }} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="btn btn-danger" disabled={busy || !identityMatches || !password}>
              {busy ? <span className="spinner" style={{ width: 14, height: 14 }} /> : <><Trash2 size={15} /> Permanently delete account</>}
            </button>
          </div>
        </form>
      ) : (
        <div className="profile-actions">
          <button type="button" className="btn btn-danger" onClick={() => setConfirming(true)}>
            <Trash2 size={15} /> Delete my account
          </button>
        </div>
      )}
    </section>
  );
}

export default function ProfilePage({ user, history = [], onLogout, onStart }) {
  const primaryName = displayName(user);
  const initial = primaryName?.[0]?.toUpperCase() || 'I';
  const since = memberSince(user?.createdAt);

  return (
    <div className="profile-page anim-fade-up">
      <div className="profile-shell">
        <section className="profile-hero-card">
          <div className="profile-avatar">
            <span>{initial}</span>
          </div>
          <div className="profile-identity">
            <span className="setup-eyebrow"><UserRound size={14} /> Profile</span>
            <h2>{primaryName}</h2>
            <p>{user?.email || 'Interview Mirror User'}</p>
          </div>
          {since && (
            <div className="profile-account-badge">
              <ShieldCheck size={15} />
              Member since {since}
            </div>
          )}
        </section>

        <section className="profile-grid">
          <div className="profile-stat-card">
            <Mail size={18} />
            <span>Email</span>
            <strong>{user?.email || 'Not available'}</strong>
          </div>
          <div className="profile-stat-card">
            <BarChart3 size={18} />
            <span>Total sessions</span>
            <strong>{history.length}</strong>
          </div>
          <div className="profile-stat-card">
            <CalendarDays size={18} />
            <span>Last interview</span>
            <strong>{lastInterviewDate(history)}</strong>
          </div>
          <div className="profile-stat-card">
            <ShieldCheck size={18} />
            <span>Average score</span>
            <strong>{averageScore(history)}</strong>
          </div>
        </section>

        <section className="profile-actions-card">
          <div>
            <h3>Account actions</h3>
            <p>Start another mock interview or sign out of this browser session.</p>
          </div>
          <div className="profile-actions">
            <button className="btn btn-primary" type="button" onClick={onStart}>
              <PlayCircle size={16} /> Start Interview
            </button>
            <button className="btn btn-danger" type="button" onClick={onLogout}>
              <LogOut size={16} /> Logout
            </button>
          </div>
        </section>

        {!user?.isGuest && (
          <>
            <ChangePasswordSection />
            <RecoveryCodeSection />
            <LogoutEverywhereSection onLogout={onLogout} />
            <DeleteAccountSection user={user} onLogout={onLogout} />
          </>
        )}
      </div>
    </div>
  );
}
