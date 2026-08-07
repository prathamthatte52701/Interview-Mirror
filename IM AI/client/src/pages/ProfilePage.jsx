import { BarChart3, CalendarDays, LogOut, Mail, PlayCircle, ShieldCheck, UserRound } from 'lucide-react';

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

export default function ProfilePage({ user, history = [], onLogout, onStart }) {
  const primaryName = displayName(user);
  const initial = primaryName?.[0]?.toUpperCase() || 'I';

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
          <div className="profile-account-badge">
            <ShieldCheck size={15} />
            {user?.accountType || 'Prototype User'}
          </div>
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
      </div>
    </div>
  );
}
