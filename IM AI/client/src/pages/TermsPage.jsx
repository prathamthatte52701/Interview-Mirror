import { ArrowLeft, Lock, Shield } from 'lucide-react';

export default function TermsPage({ onNavigate }) {
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
              <h1><Shield size={22} style={{ display: 'inline', marginRight: 10, verticalAlign: 'middle', color: '#22d3ee' }} />Terms of Service</h1>
              <p className="static-page-meta">Last updated: June 2026 · InterviewMirror AI</p>
            </div>

            <div className="static-page-body">
              <h2>1. Acceptance of Terms</h2>
              <p>By accessing or using InterviewMirror AI, you agree to be bound by these Terms of Service. This platform is a prototype demo intended for practice and evaluation purposes. Use of the service constitutes acceptance of these terms.</p>

              <h2>2. Description of Service</h2>
              <p>InterviewMirror AI is an AI-powered interview practice platform. It provides role-specific mock interview questions, real-time feedback, performance analysis, and session history tracking. The platform is designed to help candidates prepare for professional interviews in a private, focused environment.</p>

              <h2>3. User Accounts</h2>
              <p>You are responsible for maintaining the security of your account credentials. You agree not to share your password or allow unauthorized access to your account. Each account is for a single individual user. Creating multiple accounts to circumvent platform limitations is prohibited.</p>

              <h2>4. Acceptable Use</h2>
              <p>You agree to use InterviewMirror AI only for lawful purposes and in a manner consistent with all applicable laws and regulations. You must not attempt to reverse-engineer, extract data from, or disrupt the platform's systems or AI services. Automated scraping, bulk data extraction, or unauthorized API access is prohibited.</p>

              <h2>5. Data and Privacy</h2>
              <p>Your session data, interview transcripts, and performance metrics are stored to provide you with history and feedback features. We take reasonable steps to protect your data. Please review our Privacy Policy for full details on how your information is collected and used.</p>

              <h2>6. Limitation of Liability</h2>
              <p>InterviewMirror AI is provided as a demonstration prototype. The platform, its developers, and affiliated parties make no warranties, express or implied, regarding the accuracy, completeness, or fitness of the service for any particular purpose. We are not liable for any direct, indirect, or consequential damages arising from your use of the platform.</p>

              <h2>7. Modifications to Terms</h2>
              <p>We reserve the right to update these Terms of Service at any time. Continued use of the platform after changes are posted constitutes acceptance of the revised terms. We recommend reviewing these terms periodically.</p>

              <h2>8. Governing Law</h2>
              <p>These terms are governed by applicable law. Any disputes arising from the use of this platform shall be resolved through appropriate legal channels in the jurisdiction where the service operates.</p>
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
