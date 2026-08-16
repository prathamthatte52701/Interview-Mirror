import { useMemo, useState } from 'react';
import {
  BarChart3, CalendarDays, Download, Eye, EyeOff, KeyRound, Lock, LogOut,
  Mail, PlayCircle, ShieldAlert, ShieldCheck, Trash2, UserRound
} from 'lucide-react';
import { changePassword, deleteAccount, getPasswordPolicyStatus, logoutEverywhere, regenerateRecoveryCode } from '../lib/auth.js';
import { useToast } from '../hooks/useToast.js';
import { formatDateTime, formatLabel } from '../lib/sessionFormat.js';
import PasswordChecklist, { PasswordStrengthMeter } from '../components/PasswordChecklist.jsx';
import RecoveryCodeCard from '../components/RecoveryCodeCard.jsx';

const REPORT_DIMENSION_LABELS = {
  relevance: 'Relevance',
  clarity: 'Clarity',
  structure: 'Structure',
  specificity: 'Specificity',
  confidence: 'Confidence',
  delivery: 'Delivery',
  roleFit: 'Role Fit'
};
const REPORT_DIMENSION_KEYS = Object.keys(REPORT_DIMENSION_LABELS);

function displayName(user) {
  return user?.username || user?.email || 'Interview Mirror User';
}

// Only sessions with a real, scored summary count as "completed" for every
// aggregate in this file — an abandoned/unscored session has nothing to average.
function scoredSessions(history) {
  return history.filter((item) => Number.isFinite(item.summary?.averageMetrics?.overall));
}

function lastInterviewDate(history) {
  const sorted = history
    .map((item) => item.createdAt)
    .filter(Boolean)
    .sort((a, b) => new Date(b) - new Date(a));

  return formatDateTime(sorted[0]);
}

const AVERAGE_WINDOW_OPTIONS = [
  { value: 3, label: 'Last 3' },
  { value: 5, label: 'Last 5' },
  { value: 10, label: 'Last 10' },
  { value: 20, label: 'Last 20' },
  { value: 50, label: 'Last 50' },
  { value: 100, label: 'Last 100' },
  { value: 'all', label: 'All Time' }
];

function windowedAverageScore(history, window) {
  const scored = [...scoredSessions(history)].sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
  );
  if (!scored.length) return { display: 'Not available', note: '' };

  const windowed = window === 'all' ? scored : scored.slice(0, window);
  const scores = windowed.map((item) => item.summary.averageMetrics.overall);
  const display = `${(scores.reduce((sum, score) => sum + score, 0) / scores.length).toFixed(1)}/10`;

  const note = window !== 'all' && windowed.length < window
    ? `Showing average of your ${windowed.length} session${windowed.length === 1 ? '' : 's'} (fewer than ${window} available).`
    : '';

  return { display, note };
}

function sanitizeFilenamePart(value) {
  return String(value || '').replace(/[^A-Za-z0-9_-]/g, '_') || 'report';
}

function paintPage(doc) {
  doc.setFillColor(10, 10, 10);
  doc.rect(0, 0, 210, 297, 'F');
}

function newPage(doc) {
  doc.addPage();
  paintPage(doc);
  return 28;
}

function ensureSpace(doc, y, needed = 8, limit = 280) {
  return y + needed > limit ? newPage(doc) : y;
}

function sectionHeading(doc, text, y) {
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(text, 20, y);
  return y + 10;
}

function tableHeaderRow(doc, columns, y) {
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  columns.forEach(([label, x]) => doc.text(label, x, y));
  doc.setDrawColor(90, 90, 90);
  doc.line(20, y + 3, 190, y + 3);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(200, 200, 200);
  return y + 9;
}

async function generateProgressReportPdf(user, history) {
  const scored = scoredSessions(history);
  if (!scored.length) return; // caller keeps the button disabled for this case; defensive no-op here too

  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  paintPage(doc);

  // ── Page 1 — Overview ──────────────────────────────────────────────────
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(19);
  doc.setFont('helvetica', 'bold');
  doc.text('Interview Mirror AI', 20, 26);
  doc.setFontSize(13);
  doc.setTextColor(180, 180, 180);
  doc.setFont('helvetica', 'normal');
  doc.text('Progress Report', 20, 34);

  doc.setFontSize(10);
  doc.setTextColor(150, 150, 150);
  doc.text(`Candidate: ${user?.fullName || user?.username || 'N/A'}`, 20, 44);
  doc.text(`Email: ${user?.email || 'N/A'}`, 20, 50);

  const byDate = [...scored].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  const overallScores = scored.map((item) => item.summary.averageMetrics.overall);
  const overallAverage = overallScores.reduce((sum, score) => sum + score, 0) / overallScores.length;

  const dimensionAverages = REPORT_DIMENSION_KEYS
    .map((key) => {
      const values = scored.map((item) => item.summary.averageMetrics[key]).filter(Number.isFinite);
      return values.length ? { key, avg: values.reduce((sum, v) => sum + v, 0) / values.length } : null;
    })
    .filter(Boolean);

  let y = 64;
  y = sectionHeading(doc, 'Overview', y);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(200, 200, 200);
  doc.text(`Total sessions completed: ${scored.length}`, 24, y); y += 7;
  doc.text(
    `Date range: ${new Date(byDate[0].createdAt).toLocaleDateString()} to ${new Date(byDate.at(-1).createdAt).toLocaleDateString()}`,
    24, y
  ); y += 7;
  doc.text(`Overall average score: ${overallAverage.toFixed(1)}/10`, 24, y); y += 10;

  if (dimensionAverages.length) {
    const strongest = [...dimensionAverages].sort((a, b) => b.avg - a.avg)[0];
    const weakest = [...dimensionAverages].sort((a, b) => a.avg - b.avg)[0];
    doc.text(`Strongest area overall: ${REPORT_DIMENSION_LABELS[strongest.key]} (${strongest.avg.toFixed(1)}/10)`, 24, y); y += 7;
    doc.text(`Weakest area overall: ${REPORT_DIMENSION_LABELS[weakest.key]} (${weakest.avg.toFixed(1)}/10)`, 24, y); y += 7;
  }

  // ── Page 2 — Per-domain breakdown ──────────────────────────────────────
  y = newPage(doc);
  y = sectionHeading(doc, 'Per-Domain Breakdown', y);

  const byDomain = new Map();
  scored.forEach((item) => {
    const key = item.role || 'unknown';
    if (!byDomain.has(key)) byDomain.set(key, []);
    byDomain.get(key).push(item.summary.averageMetrics.overall);
  });

  y = tableHeaderRow(doc, [['Domain', 24], ['Sessions', 130], ['Avg Score', 160]], y);
  [...byDomain.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .forEach(([domain, scores]) => {
      y = ensureSpace(doc, y);
      const avg = scores.reduce((sum, v) => sum + v, 0) / scores.length;
      doc.text(formatLabel(domain), 24, y);
      doc.text(String(scores.length), 130, y);
      doc.text(`${avg.toFixed(1)}/10`, 160, y);
      y += 7;
    });

  // ── Page 3+ — Session log ──────────────────────────────────────────────
  y = newPage(doc);
  y = sectionHeading(doc, 'Session Log', y);
  y = tableHeaderRow(doc, [['Date', 24], ['Domain', 75], ['Difficulty', 135], ['Score', 170]], y);

  [...scored]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .forEach((item) => {
      y = ensureSpace(doc, y);
      doc.text(new Date(item.createdAt).toLocaleDateString(), 24, y);
      doc.text(formatLabel(item.role), 75, y);
      doc.text(formatLabel(item.difficulty), 135, y);
      doc.text(`${item.summary.averageMetrics.overall.toFixed(1)}/10`, 170, y);
      y += 7;
    });

  const filenameCandidate = sanitizeFilenamePart(user?.username || user?.fullName || 'user');
  const filenameDate = sanitizeFilenamePart(new Date().toLocaleDateString());
  doc.save(`InterviewMirrorAI_ProgressReport_${filenameCandidate}_${filenameDate}.pdf`);
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
  const [confirming, setConfirming] = useState(false);

  async function handleConfirm() {
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
        {confirming ? (
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setConfirming(false)} disabled={busy}>
              Cancel
            </button>
            <button type="button" className="btn btn-danger" onClick={handleConfirm} disabled={busy}>
              {busy ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Yes, log out everywhere'}
            </button>
          </>
        ) : (
          <button type="button" className="btn btn-secondary" onClick={() => setConfirming(true)} disabled={busy}>
            <LogOut size={16} /> Log out everywhere
          </button>
        )}
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
  const { showToast } = useToast();
  const primaryName = displayName(user);
  const initial = primaryName?.[0]?.toUpperCase() || 'I';
  const since = user?.createdAt ? formatDateTime(user.createdAt) : null;
  const [reportBusy, setReportBusy] = useState(false);
  const [averageWindow, setAverageWindow] = useState('all');
  const hasCompletedSessions = scoredSessions(history).length > 0;
  const windowedAverage = useMemo(
    () => windowedAverageScore(history, averageWindow),
    [history, averageWindow]
  );

  async function handleDownloadReport() {
    if (!hasCompletedSessions || reportBusy) return;
    setReportBusy(true);
    try {
      await generateProgressReportPdf(user, history);
    } catch (err) {
      showToast(err?.message || 'Failed to generate progress report.', 'error');
    } finally {
      setReportBusy(false);
    }
  }

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
            <div className="profile-stat-header-row">
              <span>Average score</span>
              {hasCompletedSessions && (
                <select
                  className="profile-average-window-select"
                  value={averageWindow}
                  onChange={(e) => {
                    const raw = e.target.value;
                    setAverageWindow(raw === 'all' ? 'all' : Number(raw));
                  }}
                  aria-label="Average score window"
                >
                  {AVERAGE_WINDOW_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              )}
            </div>
            <strong>{windowedAverage.display}</strong>
            {windowedAverage.note && (
              <small className="profile-stat-note">{windowedAverage.note}</small>
            )}
          </div>
        </section>

        {!user?.isGuest && (
          <section className="profile-actions-card">
            <div>
              <h3>Progress report</h3>
              <p>
                {hasCompletedSessions
                  ? 'Download a PDF covering your entire interview history — overview, per-domain breakdown, and a full session log.'
                  : 'Complete your first interview to unlock this.'}
              </p>
            </div>
            <div className="profile-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleDownloadReport}
                disabled={!hasCompletedSessions || reportBusy}
                title={hasCompletedSessions ? undefined : 'Complete your first interview to unlock this.'}
              >
                {reportBusy ? <span className="spinner" style={{ width: 14, height: 14 }} /> : <><Download size={16} /> Download Progress Report</>}
              </button>
            </div>
          </section>
        )}

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
