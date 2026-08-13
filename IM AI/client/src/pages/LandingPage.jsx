import { useEffect, useState } from 'react';
import {
  Activity,
  ArrowRight,
  BarChart3,
  Brain,
  BriefcaseBusiness,
  CalendarDays,
  Code2,
  Cpu,
  DollarSign,
  Eye,
  FileText,
  Gauge,
  GitBranch,
  Megaphone,
  MessageSquareText,
  Mic,
  Palette,
  PenTool,
  Settings,
  Shield,
  Sparkles,
  Target,
  UserRound,
  Users,
  Waves,
  Zap,
  ChevronDown
} from 'lucide-react';
import '../styles/landing.css';
import { fetchSessions, NetworkError } from '../services/api.js';

const ROLES = [
  { icon: Code2, name: 'Software Engineering', slug: 'software-engineer' },
  { icon: BriefcaseBusiness, name: 'Product Manager', slug: 'product-manager' },
  { icon: DollarSign, name: 'Finance', slug: 'finance' },
  { icon: Cpu, name: 'Machine Learning', slug: 'machine-learning' },
  { icon: Shield, name: 'Cybersecurity', slug: 'cybersecurity' },
  { icon: BarChart3, name: 'Data Science', slug: 'data-scientist' },
  { icon: Users, name: 'HR & General', slug: 'hr-general' },
  { icon: GitBranch, name: 'DevOps', slug: 'devops' },
  { icon: Megaphone, name: 'Marketing', slug: 'marketing' },
  { icon: PenTool, name: 'Design & UX', slug: 'design' }
];

const PREVIEW_EXAMPLES = [
  {
    question: 'Tell me about a project where you made a difficult technical decision under pressure.',
    metrics: [
      { icon: Shield,   label: 'Confidence',  value: '8.7/10', color: 'cyan'   },
      { icon: Brain,    label: 'Clarity',     value: '9.1/10', color: 'blue'   },
      { icon: Target,   label: 'Specificity', value: '8.4/10', color: 'violet' },
      { icon: Activity, label: 'Presence',    value: 'Strong', color: 'green'  }
    ],
    analysis: [
      'Detected confident opening and clear project context.',
      'Good structure, but answer can include stronger outcome metrics.',
      'Eye contact and vocal flow indicate strong interview presence.'
    ]
  },
  {
    question: 'Walk me through how you would prioritize a backlog with conflicting stakeholder requests.',
    metrics: [
      { icon: Shield,   label: 'Confidence',  value: '7.9/10', color: 'cyan'   },
      { icon: Brain,    label: 'Clarity',     value: '8.6/10', color: 'blue'   },
      { icon: Target,   label: 'Specificity', value: '8.9/10', color: 'violet' },
      { icon: Activity, label: 'Presence',    value: 'Steady', color: 'green'  }
    ],
    analysis: [
      'Answer opens with a clear prioritization framework.',
      'Consider naming a concrete stakeholder trade-off example.',
      'Calm pacing and consistent tone throughout the response.'
    ]
  },
  {
    question: 'Describe a time you had to explain a technical concept to a non-technical audience.',
    metrics: [
      { icon: Shield,   label: 'Confidence',  value: '8.2/10', color: 'cyan'   },
      { icon: Brain,    label: 'Clarity',     value: '9.3/10', color: 'blue'   },
      { icon: Target,   label: 'Specificity', value: '7.8/10', color: 'violet' },
      { icon: Activity, label: 'Presence',    value: 'Strong', color: 'green'  }
    ],
    analysis: [
      'Simplified analogy landed well for a non-technical listener.',
      'Could tighten the answer — slightly over the ideal length.',
      'Confident tone maintained without noticeable filler words.'
    ]
  }
];

const FEATURES = [
  {
    icon: Brain,
    title: 'Adaptive AI Questions',
    desc: 'Questions adapt in real-time based on your role, difficulty, resume context, and previous answers.'
  },
  {
    icon: MessageSquareText,
    title: 'Speak Naturally',
    desc: 'Respond with voice or text while InterviewMirror AI captures and evaluates every answer.'
  },
  {
    icon: Waves,
    title: 'Live Performance Signals',
    desc: 'Track confidence, clarity, structure, specificity, and interviewer readiness in one place.'
  },
  {
    icon: Eye,
    title: 'Presence Intelligence',
    desc: 'Get posture, eye-contact, and tone-aware feedback for realistic practice sessions.'
  }
];

const STATS = [
  { value: '10+',       label: 'Interview Domains', color: 'cyan'    },
  { value: 'Live',      label: 'AI Evaluation',     color: 'cyan'    },
  { value: 'TTS + STT', label: 'Voice Enabled',     color: 'violet'  },
  { value: 'PDF',       label: 'Export Reports',    color: 'magenta' }
];

const FAQ_ITEMS = [
  {
    q: 'Is InterviewMirror AI free to use?',
    a: 'Yes — you can try a full mock interview as a guest with no signup. Creating a free account unlocks unlimited practice sessions and your full interview history.'
  },
  {
    q: 'Do I need to upload a resume?',
    a: 'No, it’s optional. Uploading a resume or job description lets the AI personalize questions to your actual background, but every domain works fine without one.'
  },
  {
    q: 'Is my interview data private?',
    a: 'Yes. Your answers, scores, and any uploaded resume are tied to your account and never shown to other users. Sessions are not used to train any AI model outside this app.'
  },
  {
    q: 'What happens if the AI model is unavailable?',
    a: 'InterviewMirror AI has a deterministic fallback scoring system, so your interview keeps working end-to-end even if the AI provider has an outage.'
  },
  {
    q: 'Do I need a camera or microphone?',
    a: 'A microphone is recommended for the most realistic experience, but you can type your answers instead. Camera-based presence feedback is optional and can be skipped.'
  },
  {
    q: 'Which roles and domains are supported?',
    a: '10 domains today — Software Engineering, Product, Finance, Machine Learning, Cybersecurity, Data Science, HR & General, DevOps, Marketing, and Design/UX — each with 3 difficulty levels.'
  },
  {
    q: 'Can my college or placement cell use this for the whole batch?',
    a: 'Yes — reach out through the Support link in the footer and we’ll set up cohort access.'
  }
];

const ROLE_LABELS = {
  'software-engineer':   'Software Engineering',
  'product-manager':     'Product Manager',
  'finance':             'Finance',
  'machine-learning':    'Machine Learning',
  'cybersecurity':       'Cybersecurity',
  'data-scientist':      'Data Science',
  'hr-general':          'HR & General',
  'devops':              'DevOps',
  'marketing':           'Marketing',
  'design':              'Design & UX'
};

function formatRole(role) {
  if (!role) return 'Unknown Role';
  if (ROLE_LABELS[role]) return ROLE_LABELS[role];
  return role
    .split(/[-_\s]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  try {
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  } catch {
    return '';
  }
}

function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/* ── Sub-components ─────────────────────────────────────────────────── */

function RoleChip({ role, onSelect }) {
  const Icon = role.icon;
  return (
    <button className="landing-role-chip" type="button" onClick={() => onSelect(role.slug)}>
      <span className="landing-role-icon"><Icon size={15} /></span>
      {role.name}
      <ArrowRight size={13} aria-hidden="true" className="landing-role-arrow" />
    </button>
  );
}

function FeatureCard({ feature, index }) {
  const Icon = feature.icon;
  return (
    <article className="landing-feature-card" style={{ '--landing-delay': `${index * 70}ms` }}>
      <div className="landing-feature-icon-wrap">
        <span className="landing-feature-icon"><Icon size={22} /></span>
      </div>
      <h3>{feature.title}</h3>
      <p>{feature.desc}</p>
      <div className="landing-feature-bottom-line" aria-hidden="true" />
    </article>
  );
}

function AINeuralCore() {
  return (
    <div className="landing-neural-core" aria-hidden="true">
      <div className="lnc-img-wrap">
        <img
          src="/newimg.png"
          alt="AI Interviewer hologram"
          className="lnc-img"
          draggable="false"
        />
        <div className="lnc-img-fade" />
      </div>
      <div className="lnc-label">
        <span>INTERVIEWER IS </span>
        <b>LISTENING</b>
      </div>
    </div>
  );
}

function Waveform() {
  return (
    <div className="landing-waveform" aria-hidden="true">
      {Array.from({ length: 28 }).map((_, index) => (
        <i key={index} style={{ '--bar': index }} />
      ))}
    </div>
  );
}

function LastSessionCard({ loading, error, session, onStart }) {
  return (
    <section className="landing-last-session" aria-label="Your last interview">
      <div className="landing-last-session-inner">
        <div className="landing-last-session-header">
          <span>Your Last Interview</span>
        </div>
        <div className="lls-body">
          {loading && (
            <div className="lls-loading" aria-live="polite">
              <span className="lls-loading-dot" />
              <span className="lls-loading-dot" />
              <span className="lls-loading-dot" />
              <span>Loading...</span>
            </div>
          )}

          {!loading && !error && !session && (
            <div className="lls-empty">
              <p>No interview history yet.</p>
              <button className="landing-primary-cta landing-primary-cta--sm" type="button" onClick={onStart}>
                <Sparkles size={16} />
                Start Your First Interview
              </button>
            </div>
          )}

          {!loading && !error && session && (
            <div className="lls-row">
              <div className="lls-role-col">
                <div className="lls-role">{formatRole(session.role)}</div>
                <div className="lls-meta">
                  {session.createdAt && (
                    <span>
                      <CalendarDays size={11} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                      {formatDate(session.createdAt)}
                    </span>
                  )}
                  {session.difficulty && (
                    <span>{capitalize(session.difficulty)}</span>
                  )}
                  {session.interviewMode && (
                    <span>{capitalize(session.interviewMode)}</span>
                  )}
                  <span className={session.endedAt ? 'lls-badge-done' : 'lls-badge-progress'}>
                    {session.endedAt ? 'Completed' : 'In Progress'}
                  </span>
                </div>
                {session.summary?.recommendation && (
                  <p className="lls-tip">{session.summary.recommendation}</p>
                )}
              </div>

              {session.summary?.averageMetrics?.overall != null && (
                <div className="lls-score-col">
                  <span className="lls-score-val">
                    {Number(session.summary.averageMetrics.overall).toFixed(1)}/10
                  </span>
                  {session.summary.hiringRecommendation && (
                    <span className="lls-hire-badge">
                      {session.summary.hiringRecommendation}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/* ── Main page ──────────────────────────────────────────────────────── */

export default function LandingPage({ onStart, onProfile, onNavigate, userName }) {
  const displayName = typeof userName === 'string' ? userName.trim() : '';
  const profileGreetingName = displayName ? displayName.split(/\s+/)[0] : 'Candidate';

  const [lastSession, setLastSession] = useState(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [serverDown, setServerDown] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadLatestSession() {
      setSessionLoading(true);
      setServerDown(false);
      try {
        const sessions = await fetchSessions();
        if (!cancelled) {
          const latest = Array.isArray(sessions) && sessions.length > 0 ? sessions[0] : null;
          setLastSession(latest);
        }
      } catch (err) {
        if (!cancelled) {
          if (err instanceof NetworkError) setServerDown(true);
          setLastSession(null);
        }
      } finally {
        if (!cancelled) setSessionLoading(false);
      }
    }

    loadLatestSession();
    return () => { cancelled = true; };
  }, []);

  const [previewIndex, setPreviewIndex] = useState(0);

  useEffect(() => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) return;
    const id = setInterval(() => {
      setPreviewIndex((i) => (i + 1) % PREVIEW_EXAMPLES.length);
    }, 5500);
    return () => clearInterval(id);
  }, []);

  const activeExample = PREVIEW_EXAMPLES[previewIndex];

  return (
    <>
      <a href="#main-content" className="landing-skip-link">Skip to main content</a>
      <main className="landing-page-v2" id="main-content">
      {/* Server-down banner */}
      {serverDown && (
        <div className="landing-server-down" role="alert">
          <span className="landing-server-down-icon">⚠</span>
          <div>
            <strong>Server is down.</strong>
            <small>Please try again later.</small>
          </div>
        </div>
      )}

      <div className="landing-frame">
        {/* ── Navbar ── */}
        <nav className="landing-nav-v2" aria-label="Home navigation">
          <div className="landing-brand">
            <span className="landing-brand-mark" aria-hidden="true"><i /></span>
            <div>
              <strong>InterviewMirror <em>AI</em></strong>
              <small>AI INTERVIEW ENGINE</small>
            </div>
          </div>

          <div className="landing-nav-actions">
            <button className="landing-nav-pill" type="button" onClick={onStart}>
              <Settings size={16} />
              Setup Interview
            </button>
            <button className="landing-nav-pill landing-nav-pill--user" type="button" onClick={onProfile}>
              <UserRound size={16} />
              {`Hi, ${profileGreetingName}`}
              <ChevronDown size={14} />
            </button>
          </div>
        </nav>

        {/* ── Hero ── */}
        <section className="landing-hero-v2">
          <div className="landing-hero-badge">
            <Sparkles size={14} />
            Real-time AI Interview Simulation
          </div>

          <div className="landing-hero-grid-v2">
            {/* Left copy */}
            <section className="landing-hero-copy-v2" aria-labelledby="landingHeroTitle">
              <h1 id="landingHeroTitle">
                Train with an
                <span className="lh-gradient">AI Interviewer</span>
                that feels real.
              </h1>
              <p>
                Practice role-specific interviews across tech, product, business, and creative domains.
                InterviewMirror AI listens to your answers, analyzes your delivery, tracks your presence,
                and gives you a full performance breakdown that helps you improve fast.
              </p>

              <button className="landing-primary-cta" type="button" onClick={onStart}>
                <Sparkles size={17} />
                Start AI Mock Interview
                <ArrowRight size={18} />
              </button>

              <div className="landing-role-grid" aria-label="Interview domains">
                {ROLES.map((role) => (
                  <RoleChip key={role.name} role={role} onSelect={onStart} />
                ))}
              </div>
            </section>

            {/* Right: LIVE SESSION PREVIEW panel */}
            <aside className="landing-preview-wrap" aria-label="Live AI interview preview">
              <span className="lp-corner lp-corner--tl" aria-hidden="true" />
              <span className="lp-corner lp-corner--tr" aria-hidden="true" />
              <span className="lp-corner lp-corner--bl" aria-hidden="true" />
              <span className="lp-corner lp-corner--br" aria-hidden="true" />

              <div className="landing-preview-card-v2">
                <div className="landing-preview-border" aria-hidden="true" />

                <header className="landing-preview-header">
                  <div>
                    <span>LIVE SESSION PREVIEW</span>
                    <strong>Senior Interviewer Mode</strong>
                  </div>
                  <div className="landing-preview-badges">
                    <span className="landing-preview-tag">SAMPLE</span>
                    <span className="landing-live-ai"><i />LIVE AI</span>
                  </div>
                </header>

                <div className="landing-preview-content" key={previewIndex}>
                  <div className="landing-preview-body">
                    <AINeuralCore />

                    <div className="landing-question-stack">
                      <section className="landing-question-panel">
                        <span>CURRENT QUESTION</span>
                        <p>{activeExample.question}</p>
                        <Waveform />
                      </section>

                      <div className="landing-metric-grid">
                        {activeExample.metrics.map((metric) => {
                          const Icon = metric.icon;
                          return (
                            <article key={metric.label} className={`landing-metric-card landing-metric-card--${metric.color}`}>
                              <span className="lmc-icon"><Icon size={17} /></span>
                              <div>
                                <small>{metric.label}</small>
                                <strong>{metric.value}</strong>
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <section className="landing-analysis-feed">
                    <header>
                      <strong>AI ANALYSIS FEED</strong>
                      <span className="laf-live"><i />Real-time</span>
                    </header>
                    <div>
                      {activeExample.analysis.map((item, index) => (
                        <p key={item}>
                          <i className={`feed-dot feed-dot-${index}`} />
                          {item}
                        </p>
                      ))}
                    </div>
                  </section>
                </div>
              </div>
            </aside>
          </div>
        </section>

        {/* ── Feature cards ── */}
        <section className="landing-feature-grid-v2" aria-label="InterviewMirror AI features">
          {FEATURES.map((feature, index) => (
            <FeatureCard key={feature.title} feature={feature} index={index} />
          ))}
        </section>

        {/* ── Stats strip ── */}
        <section className="landing-stats-strip" aria-label="Platform stats">
          {STATS.map((item) => (
            <article key={item.label}>
              <strong className={`lss-val lss-val--${item.color}`}>{item.value}</strong>
              <span>{item.label}</span>
            </article>
          ))}
        </section>

        {/* ── FAQ ── */}
        <section className="landing-faq" aria-label="Frequently asked questions">
          <h2>Frequently Asked Questions</h2>
          {FAQ_ITEMS.map((item) => (
            <details key={item.q} className="landing-faq-item">
              <summary>{item.q}</summary>
              <p>{item.a}</p>
            </details>
          ))}
        </section>

        {/* ── Last Interview Card ── */}
        <LastSessionCard
          loading={sessionLoading}
          error={serverDown}
          session={lastSession}
          onStart={onStart}
        />

        <footer className="landing-footer" aria-label="Legal links">
          <button type="button" onClick={() => onNavigate?.('/privacy')}>Privacy</button>
          <span aria-hidden="true">&bull;</span>
          <button type="button" onClick={() => onNavigate?.('/terms')}>Terms</button>
          <span aria-hidden="true">&bull;</span>
          <button type="button" onClick={() => onNavigate?.('/contact')}>Support</button>
          <span aria-hidden="true">&bull;</span>
          <a href="https://github.com/prathamthatte52701/Interview-Mirror" target="_blank" rel="noopener noreferrer">GitHub</a>
          <span className="landing-footer-credit">Built by Neural Nexus</span>
        </footer>
      </div>
      </main>
    </>
  );
}
