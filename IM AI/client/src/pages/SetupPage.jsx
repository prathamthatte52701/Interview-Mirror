import { useRef, useState } from 'react';
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
  UploadCloud,
  User,
  UserCheck,
  Users
} from 'lucide-react';
import { uploadResume } from '../services/api.js';

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

const PRESSURE_MODES = [
  { value: 'balanced', label: 'Balanced', desc: 'Normal pacing' },
  { value: 'high-pressure', label: 'High Pressure', desc: 'Intense follow-ups' }
];

const PASTED_CONTEXT_PREVIEW_LIMIT = 12000;

function normalizePastedContext(value) {
  const text = String(value || '');
  if (text.length <= PASTED_CONTEXT_PREVIEW_LIMIT) return text;
  return `${text.slice(0, PASTED_CONTEXT_PREVIEW_LIMIT)}\n\n[Context trimmed to keep interview setup responsive.]`;
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

export default function SetupPage({
  draft,
  setDraft,
  onStart,
  busy
}) {
  const [uploadingResume, setUploadingResume] = useState(false);
  const [resumeFilename, setResumeFilename] = useState('');
  const [dragover, setDragover] = useState(false);
  const fileRef = useRef(null);

  function patch(key, value) {
    setDraft((prev) => ({
      ...prev,
      [key]: value
    }));
  }

  async function handleResumeFile(file) {
    if (!file) return;

    setUploadingResume(true);
    try {
      const result = await uploadResume(file);
      patch('resumeText', result.text);
      setResumeFilename(file.name);
    } catch {
      const text = await file.text().catch(() => '');
      patch('resumeText', normalizePastedContext(text));
      setResumeFilename(file.name);
    } finally {
      setUploadingResume(false);
    }
  }

  function handleDrop(event) {
    event.preventDefault();
    event.stopPropagation();
    setDragover(false);

    const file = event.dataTransfer.files?.[0];
    if (file) handleResumeFile(file);
  }

  const selectedDomain = DOMAINS.find((domain) => domain.value === draft.role);
  const selectedPersona = PERSONAS.find((persona) => persona.value === draft.persona);
  const selectedDifficulty = DIFFICULTIES.find((difficulty) => difficulty.value === draft.difficulty);
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
              <a href="#candidateName" className="setup-step active">
                <User size={15} /> Candidate
              </a>
              <a href="#domainSection" className="setup-step">
                <Briefcase size={15} /> Domain
              </a>
              <a href="#personaSection" className="setup-step">
                <Brain size={15} /> Persona
              </a>
              <a href="#contextSection" className="setup-step">
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

            <details className="setup-details">
              <summary>Paste resume text</summary>
              <textarea
                className="form-textarea"
                value={draft.resumeText}
                onChange={(event) => patch('resumeText', normalizePastedContext(event.target.value))}
                placeholder="Paste your resume content here..."
                rows={4}
              />
            </details>

            <div className="form-field mt-4">
              <label className="form-label" htmlFor="jdText">
                <MessageSquare size={14} /> Job Description
              </label>
              <textarea
                id="jdText"
                className="form-textarea"
                value={draft.jdText}
                onChange={(event) => patch('jdText', normalizePastedContext(event.target.value))}
                placeholder="Paste the job description..."
                rows={4}
              />
            </div>
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
    </div>
  );
}
