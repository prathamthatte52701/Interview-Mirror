import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  BarChart3,
  Bot,
  Brain,
  Briefcase,
  CheckCircle,
  Cloud,
  Code2,
  Cpu,
  Database,
  FileText,
  Gauge,
  Landmark,
  Lock,
  Megaphone,
  MessageSquare,
  Palette,
  PlayCircle,
  Rocket,
  Settings,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Smile,
  Sparkles,
  Target,
  Timer,
  UploadCloud,
  User,
  UserCheck,
  Users,
  Zap
} from 'lucide-react';
import { uploadResume, analyzeATS } from '../services/api.js';
import { useAuthStatus } from '../hooks/useAuthStatus.js';

const DOMAINS = [
  { value: 'software-engineer', label: 'Software Engineering', icon: Code2 },
  { value: 'data-scientist', label: 'Data Science', icon: Database },
  { value: 'product-manager', label: 'Product Manager', icon: Target },
  { value: 'hr-general', label: 'HR & General', icon: Users },
  { value: 'finance', label: 'Finance', icon: Landmark },
  { value: 'devops', label: 'DevOps & Cloud', icon: Cloud },
  { value: 'machine-learning', label: 'Machine Learning', icon: Cpu },
  { value: 'marketing', label: 'Marketing', icon: Megaphone },
  { value: 'cybersecurity', label: 'Cybersecurity', icon: ShieldCheck },
  { value: 'design', label: 'Design & UX', icon: Palette }
];

const PERSONAS = [
  {
    value: 'calm-senior-interviewer',
    label: 'Calm Senior',
    icon: Bot,
    desc: 'Methodical and thorough'
  },
  {
    value: 'friendly-recruiter',
    label: 'Friendly',
    icon: Smile,
    desc: 'Warm and conversational'
  },
  {
    value: 'strict-panelist',
    label: 'Strict Panel',
    icon: ShieldAlert,
    desc: 'Direct and demanding'
  },
  {
    value: 'startup-founder',
    label: 'Startup CTO',
    icon: Rocket,
    desc: 'Fast-paced builder'
  },
  {
    value: 'technical-mentor',
    label: 'Technical Mentor',
    icon: Brain,
    desc: 'Supportive and hint-friendly'
  },
  {
    value: 'senior-engineering-manager',
    label: 'Eng Manager',
    icon: Briefcase,
    desc: 'Practical tradeoffs'
  },
  {
    value: 'strict-product-interviewer',
    label: 'Product Panel',
    icon: Target,
    desc: 'Concise and impact-focused'
  }
];

const DIFFICULTIES = [
  { value: 'easy', label: 'Easy', desc: 'Entry level' },
  { value: 'medium', label: 'Medium', desc: 'Mid-level' },
  { value: 'hard', label: 'Hard', desc: 'Senior+' }
];

const STEP_IDS = ['candidateName', 'domainSection', 'personaSection', 'contextSection'];

const PRESSURE_MODES = [
  { value: 'balanced', label: 'Balanced', desc: 'Normal pacing' },
  { value: 'high-pressure', label: 'High Pressure', desc: 'Intense follow-ups' }
];

const SESSION_LENGTHS = [
  { value: 'quick', label: 'Quick', icon: Zap, desc: '~5-10 min, fewer questions — good for a fast warm-up' },
  { value: 'full', label: 'Full', icon: Timer, desc: '~15-20 min, full adaptive interview' }
];

// Must match App.jsx's CONTEXT_LIMITS — passed down as the contextLimits prop.
const DEFAULT_CONTEXT_LIMITS = { resumeText: 12000, jdText: 8000 };

function normalizePastedContext(value, limit) {
  const text = String(value || '');
  if (text.length <= limit) return text;
  return `${text.slice(0, limit)}\n\n[Context trimmed to keep interview setup responsive.]`;
}

function ContextCounter({ length, limit }) {
  const warn = limit - length <= 200;
  return (
    <div className={`setup-char-counter ${warn ? 'warn' : ''}`}>
      {length.toLocaleString()} / {limit.toLocaleString()}
    </div>
  );
}

const ACCEPTED_RESUME_EXTENSIONS = ['.txt', '.pdf', '.doc', '.docx'];

function isAcceptedFileType(file) {
  const name = String(file?.name || '').toLowerCase();
  return ACCEPTED_RESUME_EXTENSIONS.some((ext) => name.endsWith(ext));
}

function SelectCard({
  selected,
  onSelect,
  className = '',
  style = {},
  children,
  ariaLabel
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={ariaLabel}
      className={className}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect();
        }
      }}
      style={{
        cursor: 'pointer',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        position: 'relative',
        zIndex: 1,
        ...style
      }}
    >
      {children}
    </div>
  );
}

function GuestFullSessionModal({ onSignUp, onContinueQuick, onDismiss }) {
  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onClick={onDismiss}
    >
      <div
        className="panel modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="guest-full-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div style={{ fontSize: '2rem', marginBottom: '10px' }}>⏱️</div>
        <h3 id="guest-full-modal-title" style={{ marginBottom: '10px' }}>Full interviews need a free account</h3>
        <p style={{ color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: '24px' }}>
          Guest sessions are Quick-mode only, so you can try InterviewMirror AI in a few
          minutes. Create a free account to unlock full-length interviews, history, and
          detailed reports.
        </p>
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-primary" onClick={onSignUp}>Sign Up Free</button>
          <button type="button" className="btn btn-ghost" onClick={onContinueQuick}>Continue with Quick</button>
        </div>
      </div>
    </div>
  );
}

export default function SetupPage({
  draft,
  setDraft,
  onStart,
  busy,
  contextLimits = DEFAULT_CONTEXT_LIMITS,
  onLogout,
  guestFullBlocked = false,
  onGuestFullBlockedHandled
}) {
  const { isGuestSession } = useAuthStatus();
  const [showGuestModal, setShowGuestModal] = useState(false);
  const [uploadingResume, setUploadingResume] = useState(false);
  const [resumeFilename, setResumeFilename] = useState('');
  const [dragover, setDragover] = useState(false);
  const [resumeError, setResumeError] = useState('');
  const [activeStep, setActiveStep] = useState(STEP_IDS[0]);
  const fileRef = useRef(null);
  const [atsResult, setAtsResult] = useState(null);
  const [analyzingAts, setAnalyzingAts] = useState(false);
  const [atsError, setAtsError] = useState('');

  async function handleAnalyzeAts() {
    if (!draft?.resumeText?.trim()) {
      setAtsError('Please upload a resume or paste resume text first.');
      return;
    }
    if (!draft?.jdText?.trim()) {
      setAtsError('Please paste a job description first.');
      return;
    }

    setAtsError('');
    setAnalyzingAts(true);
    setAtsResult(null);

    try {
      const result = await analyzeATS({
        resumeText: draft.resumeText,
        jobDescription: draft.jdText
      });
      setAtsResult(result);
    } catch (err) {
      setAtsError(err?.message || 'ATS analysis failed. Please try again.');
    } finally {
      setAnalyzingAts(false);
    }
  }

  useEffect(() => {
    if (isGuestSession && draft.sessionLength === 'full') {
      patch('sessionLength', 'quick');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGuestSession]);

  useEffect(() => {
    if (guestFullBlocked) {
      setShowGuestModal(true);
      onGuestFullBlockedHandled?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guestFullBlocked]);

  function handleSelectSessionLength(value) {
    if (isGuestSession && value === 'full') {
      setShowGuestModal(true);
      return;
    }
    patch('sessionLength', value);
  }

  useEffect(() => {
    const elements = STEP_IDS
      .map((id) => document.getElementById(id))
      .filter(Boolean);
    if (!elements.length) return;

    const visibility = new Map();
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          visibility.set(entry.target.id, entry.intersectionRatio);
        });
        let topId = activeStep;
        let topRatio = 0;
        visibility.forEach((ratio, id) => {
          if (ratio > topRatio) {
            topRatio = ratio;
            topId = id;
          }
        });
        if (topRatio > 0) setActiveStep(topId);
      },
      { threshold: [0, 0.25, 0.5, 0.75, 1], rootMargin: '-120px 0px -60% 0px' }
    );

    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function patch(key, value) {
    setDraft((prev) => ({
      ...prev,
      [key]: value
    }));
  }

  async function handleResumeFile(file) {
    if (!file) return;

    if (!isAcceptedFileType(file)) {
      setResumeError('Unsupported file type — use PDF, TXT, DOC, or DOCX');
      return;
    }

    setResumeError('');
    setUploadingResume(true);
    try {
      const result = await uploadResume(file);
      patch('resumeText', result.text);
      setResumeFilename(file.name);
    } catch (err) {
      setResumeError(err?.message || 'Resume upload failed. You can paste resume text instead.');
    } finally {
      setUploadingResume(false);
    }
  }

  function handleDrop(event) {
    event.preventDefault();
    event.stopPropagation();
    setDragover(false);

    const file = event.dataTransfer.files?.[0];
    if (!file) return;

    if (!isAcceptedFileType(file)) {
      setResumeError('Unsupported file type — use PDF, TXT, DOC, or DOCX');
      return;
    }

    handleResumeFile(file);
  }

  const selectedDomain = DOMAINS.find((domain) => domain.value === draft.role);
  const selectedPersona = PERSONAS.find((persona) => persona.value === draft.persona);
  const selectedDifficulty = DIFFICULTIES.find((difficulty) => difficulty.value === draft.difficulty);
  const selectedLength = SESSION_LENGTHS.find((length) => length.value === draft.sessionLength);
  const selectedPressure = PRESSURE_MODES.find((mode) => mode.value === draft.pressureMode);
  const canStart = Boolean(draft?.candidateName?.trim() && draft?.role && draft?.persona) && !busy;

  return (
    <div className="setup-page anim-fade-up">
      <div className="setup-header">
        <div>
          <span className="setup-eyebrow setup-eyebrow-strong"><Settings size={14} /> Interview Setup</span>
          <h2><Sparkles size={28} /> Configure your interview</h2>
          <p>
            Tune the session around your target role, interviewer style, and
            practice difficulty.
          </p>
        </div>
      </div>

      <div className="setup-layout">
        <aside className="setup-side-panel">
          <div className="setup-side-card">
            <div className="setup-side-heading">
              <span className="setup-side-icon"><SlidersHorizontal size={17} /></span>
              <div>
                <strong>Setup navigation</strong>
                <span>Configure before launch</span>
              </div>
            </div>

            <div className="setup-step-list" aria-label="Setup sections">
              <a href="#candidateName" className={`setup-step ${activeStep === 'candidateName' ? 'active' : ''}`}>
                <User size={15} /> Candidate
              </a>
              <a href="#domainSection" className={`setup-step ${activeStep === 'domainSection' ? 'active' : ''}`}>
                <Briefcase size={15} /> Domain
              </a>
              <a href="#personaSection" className={`setup-step ${activeStep === 'personaSection' ? 'active' : ''}`}>
                <Brain size={15} /> Persona
              </a>
              <a href="#contextSection" className={`setup-step ${activeStep === 'contextSection' ? 'active' : ''}`}>
                <UploadCloud size={15} /> Context
              </a>
            </div>
          </div>
        </aside>

        <div className="col-stack">
          <div className="panel panel-sm">
            <div className="form-field">
              <label className="form-label" htmlFor="candidateName">
                <UserCheck size={14} /> Your Name
              </label>
              <input
                id="candidateName"
                name="candidateName"
                type="text"
                className="form-input"
                value={draft?.candidateName || ''}
                onChange={(event) => patch('candidateName', event.target.value)}
                placeholder="Enter your name"
                autoComplete="name"
              />
            </div>
          </div>

          <div className="panel panel-sm" id="domainSection">
            <div className="panel-header">
              <span className="panel-title panel-title-with-icon"><Briefcase size={16} /> Select Domain</span>
              <span className="panel-badge">{DOMAINS.length} available</span>
            </div>

            <div className="domain-grid">
              {DOMAINS.map((domain) => {
                const DomainIcon = domain.icon;
                return (
                  <SelectCard
                    key={domain.value}
                    selected={draft.role === domain.value}
                    onSelect={() => patch('role', domain.value)}
                    ariaLabel={domain.label}
                    className={`domain-card ${draft.role === domain.value ? 'selected' : ''}`}
                  >
                    <span className="domain-icon"><DomainIcon size={17} /></span>
                    <span className="domain-name">{domain.label}</span>
                  </SelectCard>
                );
              })}
            </div>
          </div>

          <div className="panel panel-sm">
            <div className="panel-header">
              <span className="panel-title panel-title-with-icon"><Timer size={16} /> Session Length</span>
            </div>

            <div className="difficulty-selector">
              {SESSION_LENGTHS.map((length) => {
                const LengthIcon = length.icon;
                const locked = isGuestSession && length.value === 'full';
                return (
                  <SelectCard
                    key={length.value}
                    selected={draft.sessionLength === length.value}
                    onSelect={() => handleSelectSessionLength(length.value)}
                    ariaLabel={locked ? `${length.label} (requires a free account)` : length.label}
                    className={`diff-btn ${draft.sessionLength === length.value ? 'selected' : ''} ${locked ? 'locked' : ''}`}
                  >
                    <div className="flex items-center justify-center gap-2">
                      <LengthIcon size={15} />
                      {length.label}
                      {locked && <Lock size={12} />}
                    </div>
                    <div className="diff-btn-sub">{length.desc}</div>
                  </SelectCard>
                );
              })}
            </div>
          </div>

          <div className="grid-2 setup-control-grid">
            <div className="panel panel-sm">
              <div className="panel-header">
                <span className="panel-title panel-title-with-icon"><Gauge size={16} /> Difficulty</span>
              </div>

              <div className="difficulty-selector">
                {DIFFICULTIES.map((difficulty) => (
                  <SelectCard
                    key={difficulty.value}
                    selected={draft.difficulty === difficulty.value}
                    onSelect={() => patch('difficulty', difficulty.value)}
                    ariaLabel={difficulty.label}
                    className={`diff-btn ${draft.difficulty === difficulty.value ? 'selected' : ''}`}
                  >
                    <div>{difficulty.label}</div>
                    <div className="diff-btn-sub">{difficulty.desc}</div>
                  </SelectCard>
                ))}
              </div>
            </div>

            <div className="panel panel-sm">
              <div className="panel-header">
                <span className="panel-title panel-title-with-icon"><BarChart3 size={16} /> Pressure Mode</span>
              </div>

              <div className="difficulty-selector">
                {PRESSURE_MODES.map((mode) => (
                  <SelectCard
                    key={mode.value}
                    selected={draft.pressureMode === mode.value}
                    onSelect={() => patch('pressureMode', mode.value)}
                    ariaLabel={mode.label}
                    className={`diff-btn ${draft.pressureMode === mode.value ? 'selected' : ''}`}
                  >
                    <div>{mode.label}</div>
                    <div className="diff-btn-sub">{mode.desc}</div>
                  </SelectCard>
                ))}
              </div>
            </div>
          </div>

          <div className="panel panel-sm" id="personaSection">
            <div className="panel-header">
              <span className="panel-title panel-title-with-icon"><Brain size={16} /> AI Interviewer Persona</span>
            </div>

            <div className="grid-2 persona-grid">
              {PERSONAS.map((persona) => {
                const PersonaIcon = persona.icon;
                return (
                  <SelectCard
                    key={persona.value}
                    selected={draft.persona === persona.value}
                    onSelect={() => patch('persona', persona.value)}
                    ariaLabel={persona.label}
                    className={`domain-card persona-card ${draft.persona === persona.value ? 'selected' : ''}`}
                  >
                    <span className="domain-icon"><PersonaIcon size={17} /></span>
                    <div>
                      <div className="domain-name">{persona.label}</div>
                      <div className="persona-desc">{persona.desc}</div>
                    </div>
                  </SelectCard>
                );
              })}
            </div>
          </div>
        </div>

        <div className="col-stack">
          <div className="panel panel-sm" id="contextSection">
            <div className="panel-header">
              <span className="panel-title panel-title-with-icon"><FileText size={16} /> Resume and Role Context</span>
              <span className="panel-badge">Optional</span>
            </div>

            <div
              className={`resume-dropzone ${dragover ? 'dragover' : ''}`}
              onClick={() => fileRef.current?.click()}
              onDragOver={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setDragover(true);
              }}
              onDragLeave={() => setDragover(false)}
              onDrop={handleDrop}
            >
              {uploadingResume ? (
                <div className="flex items-center justify-center gap-2 text-muted">
                  <span className="spinner" /> Parsing resume...
                </div>
              ) : resumeFilename ? (
                <div className="resume-file-state">
                  <strong>{resumeFilename}</strong>
                  <span>Click to replace</span>
                </div>
              ) : (
                <div className="resume-empty-state">
                  <strong>Drop PDF or TXT here</strong>
                  <span><UploadCloud size={14} /> or click to browse</span>
                </div>
              )}

              <input
                ref={fileRef}
                type="file"
                accept=".txt,.pdf,.doc,.docx"
                onChange={(event) => handleResumeFile(event.target.files?.[0])}
              />
            </div>

            {resumeError && (
              <p className="setup-field-error"><AlertCircle size={14} /> {resumeError}</p>
            )}

            <details className="setup-details">
              <summary>Paste resume text</summary>
              <textarea
                className="form-textarea"
                value={draft.resumeText}
                onChange={(event) => {
                  if (resumeError) setResumeError('');
                  patch('resumeText', normalizePastedContext(event.target.value, contextLimits.resumeText));
                }}
                placeholder="Paste your resume content here..."
                rows={4}
              />
              <ContextCounter length={(draft.resumeText || '').length} limit={contextLimits.resumeText} />
            </details>

            <div className="form-field mt-4">
              <label className="form-label" htmlFor="jdText">
                <MessageSquare size={14} /> Job Description
              </label>
              <textarea
                id="jdText"
                className="form-textarea"
                value={draft.jdText}
                onChange={(event) => patch('jdText', normalizePastedContext(event.target.value, contextLimits.jdText))}
                placeholder="Paste the job description..."
                rows={4}
              />
              <ContextCounter length={(draft.jdText || '').length} limit={contextLimits.jdText} />
            </div>

            <button
              type="button"
              className="btn btn-secondary w-full mt-4"
              onClick={handleAnalyzeAts}
              disabled={analyzingAts}
            >
              {analyzingAts ? (
                <>
                  <span className="spinner" /> Analyzing ATS Score...
                </>
              ) : (
                <>
                  <Sparkles size={16} /> Analyze ATS Score
                </>
              )}
            </button>

            {atsError && (
              <p className="setup-field-error" style={{ marginTop: '12px' }}>
                <AlertCircle size={14} /> {atsError}
              </p>
            )}

            {atsResult && (
              <div className="ats-result-card panel panel-sm mt-4" style={{ background: 'rgba(255,255,255,0.01)' }}>
                <div className="panel-header" style={{ marginBottom: '16px' }}>
                  <span className="panel-title panel-title-with-icon">
                    <Sparkles size={16} style={{ color: 'var(--success)' }} /> ATS Analysis Results
                  </span>
                </div>
                
                <div className="grid-2" style={{ gap: '12px' }}>
                  <div className="panel panel-sm" style={{ background: 'rgba(255,255,255,0.02)', textAlign: 'center', padding: '16px' }}>
                    <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)' }}>
                      ATS Score
                    </div>
                    <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--success)', marginTop: '8px', fontVariantNumeric: 'tabular-nums' }}>
                      {atsResult.score}/100
                    </div>
                  </div>
                  <div className="panel panel-sm" style={{ background: 'rgba(255,255,255,0.02)', textAlign: 'center', padding: '16px' }}>
                    <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)' }}>
                      Keyword Match
                    </div>
                    <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--info)', marginTop: '8px', fontVariantNumeric: 'tabular-nums' }}>
                      {atsResult.keywordMatch}%
                    </div>
                  </div>
                </div>

                <div className="divider" style={{ margin: '20px 0' }} />

                <div className="feedback-section">
                  <div className="feedback-title" style={{ color: 'var(--danger)' }}>Missing Keywords</div>
                  <div className="feedback-list">
                    {atsResult.missingKeywords.map((kw, i) => (
                      <div key={i} className="feedback-item">
                        <span className="feedback-dot danger" />
                        {kw}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="feedback-section" style={{ marginTop: '16px' }}>
                  <div className="feedback-title" style={{ color: 'var(--info)' }}>Suggestions</div>
                  <div className="feedback-list">
                    {atsResult.suggestions.map((suggestion, i) => (
                      <div key={i} className="feedback-item">
                        <span className="feedback-dot info" />
                        {suggestion}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="panel panel-sm setup-summary-panel">
            <div className="panel-header">
              <span className="panel-title panel-title-with-icon"><CheckCircle size={16} /> Session Blueprint</span>
              <span className="panel-badge">{canStart ? 'Ready' : 'Needs name'}</span>
            </div>

            <div className="setup-summary-list">
              {[
                ['Candidate', draft?.candidateName?.trim() || 'Not set'],
                ['Domain', selectedDomain?.label || 'Software Engineering'],
                ['Length', selectedLength?.label || 'Full'],
                ['Difficulty', selectedDifficulty?.label || 'Medium'],
                ['Interviewer', selectedPersona?.label || 'Calm Senior'],
                ['Pressure', selectedPressure?.label || 'Balanced'],
                ['Resume', resumeFilename || (draft.resumeText?.trim() ? 'Pasted text' : 'Optional')]
              ].map(([label, value]) => (
                <div key={label} className="setup-summary-row">
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
          </div>

          <button
            type="button"
            className="btn btn-primary btn-xl w-full setup-start-btn"
            onClick={onStart}
            disabled={!canStart}
          >
            {busy ? (
              <>
                <span className="spinner" /> Setting up interview...
              </>
            ) : (
              <>
                <PlayCircle size={18} /> Start AI Mock Interview
              </>
            )}
          </button>

          {!draft?.candidateName?.trim() && (
            <p className="setup-start-hint"><AlertCircle size={14} /> Enter your name to continue.</p>
          )}
        </div>
      </div>

      {showGuestModal && (
        <GuestFullSessionModal
          onSignUp={() => onLogout?.('/signup')}
          onContinueQuick={() => {
            patch('sessionLength', 'quick');
            setShowGuestModal(false);
          }}
          onDismiss={() => setShowGuestModal(false)}
        />
      )}
    </div>
  );
}
