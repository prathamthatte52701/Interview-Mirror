import { useCallback, useEffect, useMemo, useState } from 'react';
import AuthPage from './pages/AuthPage.jsx';
import ForgotPasswordPage from './pages/ForgotPasswordPage.jsx';
import LandingPage from './pages/LandingPage.jsx';
import SetupPage from './pages/SetupPage.jsx';
import InterviewPage from './pages/InterviewPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import HistoryPage from './pages/HistoryPage.jsx';
import ProfilePage from './pages/ProfilePage.jsx';
import TermsPage from './pages/TermsPage.jsx';
import PrivacyPage from './pages/PrivacyPage.jsx';
import ContactPage from './pages/ContactPage.jsx';
import { analyzeLiveAnswer, createSession, endSession, fetchSession, submitAnswer } from './services/api.js';
import { clearAuthToken, fetchCurrentUser, getAuthToken, getTokenExpiryMs, isTokenExpired, logoutUser } from './lib/auth.js';
import { loadInterviewHistory } from './lib/storage.js';

const initialDraft = {
  candidateName: '',
  role: 'software-engineer',
  interviewMode: 'mixed',
  difficulty: 'medium',
  persona: 'calm-senior-interviewer',
  pressureMode: 'balanced',
  resumeText: '',
  jdText: ''
};

const CONTEXT_LIMITS = {
  resumeText: 12000,
  jdText: 8000
};

function trimContext(value = '', limit = 12000) {
  const text = String(value || '').trim();
  if (text.length <= limit) return text;
  return `${text.slice(0, limit)}\n\n[Context trimmed to keep interview setup responsive.]`;
}

function normalizeDraftForStart(draft, candidateName, role) {
  return {
    ...draft,
    candidateName,
    role,
    resumeText: trimContext(draft.resumeText, CONTEXT_LIMITS.resumeText),
    jdText: trimContext(draft.jdText, CONTEXT_LIMITS.jdText)
  };
}

const AUTH_ROUTES = new Set(['/login', '/signup']);
const PUBLIC_ROUTES = new Set(['/forgot-password', '/terms', '/privacy', '/contact']);
const PROTECTED_ROUTES = new Set([
  '/',
  '/home',
  '/setup',
  '/configure',
  '/interview',
  '/dashboard',
  '/history',
  '/profile'
]);

const PHASE_TO_PATH = {
  setup: '/setup',
  interview: '/interview',
  dashboard: '/dashboard'
};

const PHASE_LABELS = {
  setup: 'Setup',
  interview: 'Interview',
  dashboard: 'Results',
  history: 'History',
  profile: 'Profile'
};

const icons = {
  home: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="m3 11 9-8 9 8" />
      <path d="M5 10v10h14V10" />
    </svg>
  ),
  setup: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.07 4.93A10 10 0 105.93 19.07" />
    </svg>
  ),
  interview: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
    </svg>
  ),
  results: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  ),
  history: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  ),
  profile: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </svg>
  )
};

function getCurrentPath() {
  const path = window.location.pathname.replace(/\/+$/, '');
  return path || '/';
}

function phaseFromPath(path) {
  if (path === '/interview') return 'interview';
  if (path === '/dashboard') return 'dashboard';
  if (path === '/history') return 'history';
  if (path === '/profile') return 'profile';
  return 'setup';
}

function displayNameForUser(user) {
  if (!user) return '';
  if (user.isGuest) return 'Guest';
  return user.username || user.email?.split('@')[0] || '';
}

export default function App() {
  const [routePath, setRoutePath] = useState(getCurrentPath);
  const [currentUser, setCurrentUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [draft, setDraft] = useState(initialDraft);
  const [session, setSession] = useState(null);
  const [currentQuestion, setCurrentQ] = useState('');
  const [localHistory, setLocalHistory] = useState([]);
  const [selectedHistoryId, setSelectedHistoryId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [accountOpen, setAccountOpen] = useState(false);
  const [guestSessionEnded, setGuestSessionEnded] = useState(false);

  const navigate = useCallback((path, options = {}) => {
    const nextPath = path || '/setup';
    const method = options.replace ? 'replaceState' : 'pushState';

    if (window.location.pathname !== nextPath) {
      window.history[method]({}, '', nextPath);
    }

    setRoutePath(nextPath);
  }, []);

  const navigateToPhase = useCallback((nextPhase, options = {}) => {
    navigate(PHASE_TO_PATH[nextPhase] || '/setup', options);
    setAccountOpen(false);
  }, [navigate]);

  useEffect(() => {
    const onPopState = () => setRoutePath(getCurrentPath());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function restoreUser() {
      try {
        const user = await fetchCurrentUser();
        if (!cancelled) setCurrentUser(user);
      } catch (err) {
        if (!cancelled) setError(err.message || 'Please log in again.');
      } finally {
        if (!cancelled) setAuthChecked(true);
      }
    }

    restoreUser();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!authChecked) return;

    if (!currentUser) {
      if (!AUTH_ROUTES.has(routePath) && !PUBLIC_ROUTES.has(routePath)) {
        navigate('/login', { replace: true });
      }
      return;
    }

    if (AUTH_ROUTES.has(routePath) || routePath === '/') {
      navigate('/home', { replace: true });
      return;
    }

    if (routePath === '/configure') {
      navigate('/setup', { replace: true });
      return;
    }

    if (!PROTECTED_ROUTES.has(routePath)) {
      navigate('/home', { replace: true });
      return;
    }

    if (routePath === '/interview' && !session) {
      setError('Setup is required before starting an interview. Please choose your interview settings first.');
      navigate('/setup', { replace: true });
    }
  }, [authChecked, currentUser, navigate, routePath, session]);

  useEffect(() => {
    if (!currentUser) return;
    setDraft((prev) => {
      if (prev.candidateName?.trim()) return prev;
      return { ...prev, candidateName: displayNameForUser(currentUser) };
    });
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) {
      setLocalHistory([]);
      return;
    }

    if (currentUser.isGuest) {
      setLocalHistory([]);
      return;
    }

    let cancelled = false;

    async function loadHistory() {
      try {
        const history = await loadInterviewHistory();
        if (!cancelled) setLocalHistory(Array.isArray(history) ? history : []);
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load interview history.');
      }
    }

    loadHistory();
    return () => {
      cancelled = true;
    };
  }, [currentUser]);

  const phase = phaseFromPath(routePath);
  const transcript = session?.transcript || [];
  const latestAnalysis = transcript.at(-1)?.analysis || null;
  const selectedHistoryRecord = useMemo(() => {
    if (selectedHistoryId) {
      return localHistory.find((item) => item.id === selectedHistoryId) || null;
    }
    return session ? null : localHistory[0] || null;
  }, [localHistory, selectedHistoryId, session]);

  const summaryForDashboard = useMemo(() =>
    selectedHistoryRecord?.summary
    || session?.summary
    || localHistory.find((item) => item.id === session?.id)?.summary
    || null,
    [session, localHistory, selectedHistoryRecord]
  );

  async function handleStartSession() {
    const candidateName = draft?.candidateName?.trim();
    const role = draft?.role?.trim();

    if (!candidateName) {
      setError('Enter your name before starting the interview.');
      return;
    }

    if (!role) {
      setError('Select an interview domain before starting the interview.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      const res = await createSession(normalizeDraftForStart(draft, candidateName, role));
      const nextSession = res?.session;
      const firstQuestion = res?.firstQuestion || nextSession?.currentQuestion;

      if (!nextSession?.id) {
        throw new Error('Unable to start interview. The backend returned an invalid session.');
      }

      if (!firstQuestion) {
        throw new Error('No questions found for the selected domain. Please choose another domain or check the question bank.');
      }

      setSession(nextSession);
      setSelectedHistoryId('');
      setCurrentQ(firstQuestion);
      navigateToPhase('interview');
    } catch (err) {
      setError(err.message || 'Failed to start interview');
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmitAnswer(answer, responseSeconds, presenceSnapshot) {
    if (!session?.id) return null;
    setBusy(true);
    setError('');
    try {
      const result = await submitAnswer({
        sessionId: session.id,
        answer,
        responseSeconds,
        presenceSnapshot
      });
      const refreshed = await fetchSession(session.id);
      setSession(refreshed);
      setCurrentQ(result.nextQuestion || '');
      return result;
    } catch (err) {
      setError(err.message || 'Failed to submit answer');
      throw err;
    } finally {
      setBusy(false);
    }
  }

  async function handleAnalyzeLiveAnswer(answer, responseSeconds, presenceSnapshot) {
    if (!session?.id) return null;
    return analyzeLiveAnswer({
      sessionId: session.id,
      answer,
      responseSeconds,
      presenceSnapshot
    });
  }

  async function handleEndSession() {
    if (!session?.id) return;
    setBusy(true);
    setError('');
    try {
      await endSession(session.id);
      const refreshed = await fetchSession(session.id);
      setSession(refreshed);
      if (!currentUser?.isGuest) {
        const history = await loadInterviewHistory();
        setLocalHistory(Array.isArray(history) ? history : []);
      }
      navigateToPhase('dashboard');
    } catch (err) {
      setError(err.message || 'Failed to end interview');
    } finally {
      setBusy(false);
    }
  }

  function handleRestart() {
    setSession(null);
    setCurrentQ('');
    setDraft({
      ...initialDraft,
      candidateName: displayNameForUser(currentUser)
    });
    setError('');
    navigateToPhase('setup');
  }

  function handleAuthSuccess(user) {
    setCurrentUser(user);
    setGuestSessionEnded(false);
    setDraft((prev) => ({
      ...prev,
      candidateName: prev.candidateName || displayNameForUser(user)
    }));
    navigate(user.isGuest ? '/setup' : '/home', { replace: true });
  }

  function handleLogout(redirectTo = '/login') {
    const wasGuest = currentUser?.isGuest === true;
    logoutUser();
    setCurrentUser(null);
    setSession(null);
    setCurrentQ('');
    setSelectedHistoryId('');
    setError('');
    setAccountOpen(false);
    if (wasGuest) setGuestSessionEnded(true);
    navigate(redirectTo, { replace: true });
  }

  /* ── Auto-logout: precise timer fires exactly when JWT expires ── */
  useEffect(() => {
    if (!currentUser) return;
    const token = getAuthToken();
    const isGuest = currentUser.isGuest === true;
    if (isTokenExpired(token)) {
      if (isGuest) setGuestSessionEnded(true);
      handleLogout();
      return;
    }
    const delay = getTokenExpiryMs(token) - Date.now();
    const timer = window.setTimeout(() => {
      if (isGuest) setGuestSessionEnded(true);
      handleLogout();
    }, delay);
    return () => window.clearTimeout(timer);
  }, [currentUser]);

  /* ── Auto-logout: 401 from any API call (token rejected by server) ── */
  useEffect(() => {
    function onTokenExpired() {
      clearAuthToken();
      handleLogout();
    }
    window.addEventListener('auth:token-expired', onTokenExpired);
    return () => window.removeEventListener('auth:token-expired', onTokenExpired);
  }, []);

  if (!currentUser) {
    if (!authChecked) {
      return (
        <main className="auth-page auth-page-next">
          <div className="auth-bg-grid" aria-hidden="true" />
          <div className="auth-page-frame">
            <section className="auth-shell">
              <form className="auth-card">
                <div className="auth-card-header">
                  <span className="auth-card-kicker">Loading</span>
                  <h2>Checking your session</h2>
                  <p>Please wait while InterviewMirror AI restores your secure session.</p>
                </div>
              </form>
            </section>
          </div>
        </main>
      );
    }

    if (routePath === '/forgot-password') {
      return <ForgotPasswordPage onNavigate={navigate} />;
    }

    if (routePath === '/terms') {
      return <TermsPage onNavigate={navigate} />;
    }

    if (routePath === '/privacy') {
      return <PrivacyPage onNavigate={navigate} />;
    }

    if (routePath === '/contact') {
      return <ContactPage onNavigate={navigate} />;
    }

    return (
      <AuthPage
        mode={routePath === '/signup' ? 'signup' : 'login'}
        onAuthSuccess={handleAuthSuccess}
        onSwitch={(nextMode) => navigate(nextMode === 'signup' ? '/signup' : '/login')}
        onNavigate={navigate}
        guestSessionEnded={guestSessionEnded}
      />
    );
  }

  const isInInterview = phase === 'interview';

  if (routePath === '/forgot-password') {
    return <ForgotPasswordPage onNavigate={navigate} />;
  }

  if (routePath === '/terms') {
    return <TermsPage onNavigate={navigate} />;
  }

  if (routePath === '/privacy') {
    return <PrivacyPage onNavigate={navigate} />;
  }

  if (routePath === '/contact') {
    return <ContactPage onNavigate={navigate} />;
  }

  if (routePath === '/home') {
    return (
      <LandingPage
        userName={displayNameForUser(currentUser)}
        onStart={() => navigateToPhase('setup')}
        onProfile={() => navigate('/profile')}
        onNavigate={navigate}
      />
    );
  }

  return (
    <div className="app-wrapper">
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <div className="sidebar-logo-mark"><span /></div>
            <span className="sidebar-logo-text">Interview Mirror AI</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          <span className="nav-section-label">Navigation</span>
          <button
            className="nav-item"
            onClick={() => navigate('/home')}
          >
            <span className="nav-icon">{icons.home}</span>
            Home
          </button>
          <button
            className={`nav-item ${phase === 'setup' ? 'active' : ''}`}
            onClick={() => navigateToPhase('setup')}
          >
            <span className="nav-icon">{icons.setup}</span>
            Setup
          </button>
          <button
            className={`nav-item ${phase === 'interview' ? 'active' : ''}`}
            onClick={() => session && navigateToPhase('interview')}
            disabled={!session}
            style={{ opacity: !session ? 0.35 : 1, cursor: !session ? 'not-allowed' : 'pointer' }}
          >
            <span className="nav-icon">{icons.interview}</span>
            Interview
            {isInInterview && (
              <span className="badge badge-live" style={{ marginLeft: 'auto', padding: '1px 6px', fontSize: '0.62rem' }}>
                LIVE
              </span>
            )}
          </button>
          <button
            className={`nav-item ${phase === 'dashboard' ? 'active' : ''}`}
            onClick={() => navigateToPhase('dashboard')}
          >
            <span className="nav-icon">{icons.results}</span>
            Results
          </button>
          <button
            className={`nav-item ${phase === 'history' ? 'active' : ''}`}
            onClick={() => navigate('/history')}
          >
            <span className="nav-icon">{icons.history}</span>
            History
            <span className="nav-count">{localHistory.length}</span>
          </button>
          <button
            className={`nav-item ${phase === 'profile' ? 'active' : ''}`}
            onClick={() => navigate('/profile')}
          >
            <span className="nav-icon">{icons.profile}</span>
            Profile
          </button>
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-mode-badge">
            <span className="mode-dot" />
            <span>AI Interview Engine</span>
          </div>
        </div>
      </aside>

      <div className="main-area">
        <header className="topbar">
          <div className="topbar-left">
            <div className="topbar-breadcrumb">
              Interview Mirror AI
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ opacity: 0.3 }}>
                <polyline points="9 18 15 12 9 6" />
              </svg>
              <span>{PHASE_LABELS[phase] || phase}</span>
              {session?.candidateName && (
                <>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ opacity: 0.3 }}>
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                  <span style={{ color: 'var(--text-muted)' }}>{session.candidateName}</span>
                </>
              )}
            </div>
          </div>
          <div className="topbar-right">
            {session && (
              <span className="badge badge-default" style={{ fontSize: '0.72rem' }}>
                {session.role?.replaceAll('-', ' ')} / {session.difficulty}
              </span>
            )}
            <div className="topbar-user">
              <span>{currentUser.isGuest ? 'Demo session' : currentUser.email}</span>
              <button
                className="topbar-avatar"
                type="button"
                aria-label="Open profile menu"
                onClick={() => setAccountOpen((open) => !open)}
              >
                {displayNameForUser(currentUser)?.[0]?.toUpperCase() || '?'}
              </button>
              {accountOpen && (
                <div className="account-menu">
                  <div className="account-menu-header">
                    <strong>{displayNameForUser(currentUser) || 'Prototype User'}</strong>
                    <span>{currentUser.email}</span>
                  </div>
                  <button
                    type="button"
                    className="account-menu-link"
                    onClick={() => {
                      setAccountOpen(false);
                      navigate('/profile');
                    }}
                  >
                    Profile
                  </button>
                  <button type="button" className="account-menu-danger" onClick={handleLogout}>
                    Logout
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <div className="page-content">
          {error && (
            <div className="error-banner" style={{ marginBottom: '16px' }}>
              {error}
            </div>
          )}

          {phase === 'setup' && (
            <SetupPage
              draft={draft}
              setDraft={setDraft}
              onStart={handleStartSession}
              busy={busy}
            />
          )}

          {phase === 'interview' && session && (
            <InterviewPage
              draft={draft}
              session={session}
              currentQuestion={currentQuestion}
              latestAnalysis={latestAnalysis}
              transcript={transcript}
              busy={busy}
              onSubmitAnswer={handleSubmitAnswer}
              onAnalyzeLiveAnswer={handleAnalyzeLiveAnswer}
              onEndSession={handleEndSession}
              onNavigate={navigate}
            />
          )}

          {phase === 'dashboard' && (
            <DashboardPage
              session={selectedHistoryRecord || session}
              summary={summaryForDashboard}
              history={localHistory}
              onRestart={handleRestart}
              onLogout={handleLogout}
            />
          )}

          {phase === 'history' && (
            <HistoryPage
              history={localHistory}
              onStart={handleRestart}
              onLogout={handleLogout}
            />
          )}

          {phase === 'profile' && (
            <ProfilePage
              user={currentUser}
              history={localHistory}
              onStart={() => navigateToPhase('setup')}
              onLogout={handleLogout}
            />
          )}
        </div>
      </div>
    </div>
  );
}
