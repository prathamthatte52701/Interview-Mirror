import { ArrowLeft, Eye, Lock } from 'lucide-react';

export default function PrivacyPage({ onNavigate }) {
  function goTo(path) {
    if (onNavigate) {
      onNavigate(path);
    } else {
      window.history.pushState({}, '', path);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  }

  return (
    <main className="auth-page auth-page-next static-page">
      <div className="auth-bg-grid" aria-hidden="true" />
      <div className="auth-page-frame">
        <header className="auth-topbar">
          <div className="auth-brand">
            <span className="auth-brand-mark" aria-hidden="true">IM</span>
            <div>
              <strong>InterviewMirror <em>AI</em></strong>
              <small>AI interview practice workspace</small>
            </div>
          </div>
          <div className="auth-session-pill">
            <Lock size={15} />
            <span>Secure local demo</span>
          </div>
        </header>

        <section className="static-page-shell">
          <div className="static-page-card">
            <div className="static-page-card-bar" aria-hidden="true" />

            <div className="static-page-header">
              <span className="auth-card-kicker">Legal</span>
              <h1><Eye size={22} style={{ display: 'inline', marginRight: 10, verticalAlign: 'middle', color: '#8b5cf6' }} />Privacy Policy</h1>
              <p className="static-page-meta">Last updated: June 2026 · InterviewMirror AI</p>
            </div>

            <div className="static-page-body">
              <h2>1. Information We Collect</h2>
              <p>When you create an account, we collect your full name, username, email address, contact number, and optional city and address. During interview sessions, we collect your spoken or typed answers, session timestamps, performance metrics, and AI-generated feedback scores.</p>

              <h2>2. How We Use Your Information</h2>
              <p>We use collected information to authenticate your account, provide personalized interview practice sessions, generate performance feedback, maintain your session history, and improve the quality of the platform. We do not sell your personal information to third parties.</p>

              <h2>3. Data Storage and Security</h2>
              <p>Your data is stored in a MongoDB database. Passwords are hashed using industry-standard bcrypt before storage and are never stored in plain text. Authentication tokens are signed using JWT and expire after one hour to protect your session. We apply reasonable technical safeguards to protect your data from unauthorized access.</p>

              <h2>4. Session Data</h2>
              <p>Interview session transcripts, AI analysis results, scores, and history are stored to allow you to review past performance. This data is associated with your account and is accessible only to you when logged in. You may request deletion of your data by contacting us.</p>

              <h2>5. Cookies and Local Storage</h2>
              <p>InterviewMirror AI uses browser local storage to maintain your authentication session token. No tracking cookies or third-party advertising cookies are used. Clearing your browser's local storage will log you out of your session.</p>

              <h2>6. Third-Party Services</h2>
              <p>The platform uses the Gemini AI API for generating interview questions and analyzing responses. Interaction data sent to this API is subject to the respective provider's privacy policies. We do not send identifiable personal information to AI providers beyond what is necessary for generating interview content.</p>

              <h2>7. Data Retention</h2>
              <p>Account data and session history are retained as long as your account exists. Interview transcripts may be retained for up to 90 days after a session. You may request removal of specific sessions or full account deletion by contacting our support team.</p>

              <h2>8. Your Rights</h2>
              <p>You have the right to access, correct, or delete your personal information. You may contact us at any time to request data export or account deletion. We will process such requests within a reasonable timeframe.</p>

              <h2>9. Changes to This Policy</h2>
              <p>We may update this Privacy Policy from time to time. Significant changes will be communicated through the platform. Continued use of the service after changes take effect indicates your acceptance of the updated policy.</p>
            </div>

            <div className="static-page-footer">
              <button type="button" className="static-back-btn" onClick={() => goTo('/login')}>
                <ArrowLeft size={16} />
                Back to Login
              </button>
            </div>
          </div>
        </section>

        <footer className="auth-legal-footer">
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
