import { ArrowLeft, Lock, Mail, MessageSquareText } from 'lucide-react';

export default function ContactPage({ onNavigate }) {
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
              <span className="auth-card-kicker">Support</span>
              <h1>
                <MessageSquareText size={22} style={{ display: 'inline', marginRight: 10, verticalAlign: 'middle', color: '#e879f9' }} />
                Contact Us
              </h1>
              <p className="static-page-meta">InterviewMirror AI — Support &amp; Feedback</p>
            </div>

            <div className="static-page-body">
              <h2>Get in Touch</h2>
              <p>We are a small team building InterviewMirror AI as an intelligent interview practice platform. We welcome your feedback, bug reports, and feature suggestions. Please use the contact information below to reach us.</p>

              <div className="static-contact-card">
                <div className="static-contact-icon"><Mail size={20} /></div>
                <div>
                  <strong>Support Email</strong>
                  <span>support@interviewmirror.ai (placeholder — not yet active)</span>
                </div>
              </div>

              <h2>What to Include in Your Message</h2>
              <p>When reaching out for support, please include your registered username and email, a clear description of the issue or feedback, any error messages you encountered, and the browser and device you are using. This helps us resolve your issue faster.</p>

              <h2>Response Time</h2>
              <p>As a prototype platform, we aim to respond to all support requests within 2–5 business days. During high-traffic periods response times may be longer. We appreciate your patience and are committed to improving the platform based on your feedback.</p>

              <h2>Bug Reports</h2>
              <p>If you encounter a bug or unexpected behavior, please describe the steps to reproduce it, what you expected to happen, and what actually happened. Screenshots or screen recordings are always helpful and appreciated.</p>

              <h2>Feature Requests</h2>
              <p>InterviewMirror AI is actively being developed. We welcome suggestions for new interview domains, feedback types, export formats, and any other features you believe would improve your practice experience. Your input directly shapes the platform's roadmap.</p>

              <h2>Data Deletion Requests</h2>
              <p>If you wish to delete your account or specific session data, please contact us with your registered email and username. We will process deletion requests within a reasonable timeframe in accordance with our Privacy Policy.</p>
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
