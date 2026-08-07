import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  Home,
  IdCard,
  Lock,
  Mail,
  MapPin,
  Phone,
  Sparkles,
  TrendingUp,
  BarChart3,
  UserCheck,
  User,
  X
} from 'lucide-react';
import {
  FALLBACK_CITIES,
  cleanContactNumber,
  countWords,
  fetchIndianCities,
  getPasswordPolicyError,
  getPasswordPolicyStatus,
  guestLogin,
  hasLongAddressWord,
  isServerDownError,
  isValidEmail,
  loginUser,
  normalizeFullName,
  normalizeUsername,
  setAuthToken,
  signUpUser
} from '../lib/auth.js';

const FEATURE_ITEMS = [
  { icon: TrendingUp, label: 'Adaptive Interviews' },
  { icon: BarChart3, label: 'Detailed Performance Reports' },
  { icon: UserCheck, label: 'Recruiter-level Feedback' }
];

const PASSWORD_RULES = [
  { key: 'length', label: '8-64 characters' },
  { key: 'uppercase', label: '1 uppercase' },
  { key: 'lowercase', label: '1 lowercase' },
  { key: 'number', label: '1 number' },
  { key: 'special', label: '1 special character' }
];

const DASH_METRICS = [
  { label: 'Communication', value: 89 },
  { label: 'Technical', value: 84 },
  { label: 'Confidence', value: 91 },
  { label: 'Problem Solving', value: 87 }
];

const INDIAN_PHONE_REGEX = /^[6-9]\d{9}$/;

function BrandMark() {
  return (
    <span className="auth-brand-mark" aria-hidden="true">
      IM
    </span>
  );
}

function DashboardPreview() {
  return (
    <div className="auth-preview-panel" aria-hidden="true">
      <div className="auth-preview-header">
        <span className="auth-preview-header-title">Latest Session</span>
        <span>Completed</span>
      </div>

      <div className="auth-preview-session">
        <div className="auth-preview-role">
          <div className="auth-preview-logo">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.25 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.85A11 11 0 0012 23z" fill="#34A853" />
              <path d="M5.84 14.1a6.6 6.6 0 010-4.2V7.05H2.18a11 11 0 000 9.9l3.66-2.85z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1a11 11 0 00-9.82 6.05l3.66 2.85C6.71 7.3 9.14 5.38 12 5.38z" fill="#EA4335" />
            </svg>
          </div>
          <div>
            <strong>Google Software Engineer II</strong>
            <span>48 min &bull; May 10, 2024</span>
          </div>
        </div>
        <div className="auth-preview-score">
          <span className="auth-preview-score-label">Overall Score</span>
          <strong className="auth-preview-score-value">88<span style={{ fontSize: 13, fontWeight: 500, color: 'var(--auth-muted)' }}>/100</span></strong>
        </div>
      </div>

      <div className="auth-preview-metrics">
        {DASH_METRICS.map((metric) => (
          <div className="auth-preview-metric" key={metric.label}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
            <div className="auth-preview-metric-track">
              <div className="auth-preview-metric-fill" style={{ width: `${metric.value}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AuthField({
  id,
  label,
  icon: Icon,
  type,
  value,
  onChange,
  placeholder,
  autoComplete,
  error,
  trailing,
  maxLength
}) {
  return (
    <div className="auth-field">
      <label htmlFor={id}>{label}</label>
      <div className={`auth-input-shell ${error ? 'has-error' : ''}`}>
        <Icon size={18} />
        <input
          id={id}
          type={type}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          autoComplete={autoComplete}
          maxLength={maxLength}
          aria-invalid={error ? 'true' : 'false'}
          aria-describedby={error ? `${id}-error` : undefined}
        />
        {trailing}
      </div>
      {error && (
        <p className="auth-field-error" id={`${id}-error`}>
          {error}
        </p>
      )}
    </div>
  );
}

function PasswordChecklist({ status }) {
  return (
    <div className="auth-password-rules" aria-label="Password requirements">
      {PASSWORD_RULES.map((rule) => {
        const passed = status[rule.key];
        return (
          <span key={rule.key} className={passed ? 'is-met' : ''}>
            {passed ? <Check size={13} /> : <X size={13} />}
            {rule.label}
          </span>
        );
      })}
    </div>
  );
}

export default function AuthPage({ mode = 'login', onAuthSuccess, onSwitch, onNavigate, guestSessionEnded = false }) {
  const isSignup = mode === 'signup';

  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [city, setCity] = useState('');
  const [cityInput, setCityInput] = useState('');
  const [cityOptions, setCityOptions] = useState(FALLBACK_CITIES);
  const [citySuggestions, setCitySuggestions] = useState([]);
  const [showCitySuggestions, setShowCitySuggestions] = useState(false);
  const [address, setAddress] = useState('');
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('error');
  const [fieldErrors, setFieldErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [toastMessage, setToastMessage] = useState('');
  const [serverDown, setServerDown] = useState(false);
  const [guestBusy, setGuestBusy] = useState(false);
  const [guestError, setGuestError] = useState('');
  const [guestAlreadyUsed, setGuestAlreadyUsed] = useState(() => {
    const raw = localStorage.getItem('guest_used');
    if (!raw) return false;
    try {
      const parsed = JSON.parse(raw);
      const sevenDays = 7 * 24 * 60 * 60 * 1000;
      if (Date.now() - parsed.setAt < sevenDays) return true;
      localStorage.removeItem('guest_used');
      return false;
    } catch {
      localStorage.removeItem('guest_used');
      return false;
    }
  });

  const passwordStatus = useMemo(() => getPasswordPolicyStatus(password), [password]);
  const addressWordCount = useMemo(() => countWords(address), [address]);

  useEffect(() => {
    if (!isSignup) return;
    let cancelled = false;

    async function loadCities() {
      try {
        const cities = await fetchIndianCities();
        if (!cancelled && cities.length) setCityOptions(cities);
      } catch {
        if (!cancelled) setCityOptions(FALLBACK_CITIES);
      }
    }

    loadCities();
    return () => { cancelled = true; };
  }, [isSignup]);

  useEffect(() => {
    if (!toastMessage) return undefined;
    const id = window.setTimeout(() => setToastMessage(''), 2800);
    return () => window.clearTimeout(id);
  }, [toastMessage]);

  const [showSessionEndedBanner, setShowSessionEndedBanner] = useState(guestSessionEnded);

  useEffect(() => {
    if (guestSessionEnded) setShowSessionEndedBanner(true);
  }, [guestSessionEnded]);

  useEffect(() => {
    if (!showSessionEndedBanner) return undefined;
    const id = window.setTimeout(() => setShowSessionEndedBanner(false), 5000);
    return () => window.clearTimeout(id);
  }, [showSessionEndedBanner]);

  function clearFieldError(field) {
    setFieldErrors((prev) => ({ ...prev, [field]: '' }));
    setMessage('');
  }

  function validateForm() {
    const cleanEmail = email.trim().toLowerCase();
    const cleanFullName = normalizeFullName(fullName);
    const cleanContact = cleanContactNumber(contactNumber);
    const errors = {};

    if (isSignup) {
      if (!cleanFullName) {
        errors.fullName = 'Full name is required.';
      } else if (cleanFullName.length < 2) {
        errors.fullName = 'Full name must be at least 2 characters.';
      } else if (cleanFullName.length > 20) {
        errors.fullName = 'Full name can be maximum 20 characters.';
      } else if (!/^[A-Za-z\s]+$/.test(cleanFullName)) {
        errors.fullName = 'Full name can only contain letters and spaces.';
      }
    }

    const cleanUsername = normalizeUsername(username);
    if (!cleanUsername) {
      errors.username = 'Username is required.';
    } else if (/\s/.test(cleanUsername)) {
      errors.username = 'Username cannot contain spaces.';
    } else if (cleanUsername.length < 3) {
      errors.username = 'Username must be at least 3 characters.';
    } else if (cleanUsername.length > 12) {
      errors.username = 'Username can be maximum 12 characters.';
    }

    if (!cleanEmail) {
      errors.email = 'Email address is required.';
    } else if (!isValidEmail(cleanEmail)) {
      errors.email = 'Enter a valid email address.';
    }

    if (!password) {
      errors.password = 'Password is required.';
    } else if (/\s/.test(password)) {
      errors.password = 'Password cannot contain spaces.';
    } else if (isSignup) {
      const pErr = getPasswordPolicyError(password);
      if (pErr) errors.password = pErr;
    }

    if (isSignup) {
      if (!confirmPassword) {
        errors.confirmPassword = 'Confirm password is required.';
      } else if (/\s/.test(confirmPassword)) {
        errors.confirmPassword = 'Confirm password cannot contain spaces.';
      } else if (confirmPassword !== password) {
        errors.confirmPassword = 'Passwords do not match.';
      }

      if (!cleanContact) {
        errors.contactNumber = 'Contact number is required.';
      } else if (!INDIAN_PHONE_REGEX.test(cleanContact)) {
        errors.contactNumber = 'Contact number must be a valid 10-digit Indian mobile number.';
      }

      if (address && !/^[A-Za-z0-9 ,.\-]*$/.test(address)) {
        errors.address = 'Address can only contain English letters, numbers, spaces, commas, dots, and hyphens.';
      } else if (addressWordCount > 50) {
        errors.address = 'Address can be maximum 50 words.';
      } else if (hasLongAddressWord(address)) {
        errors.address = 'Each address word can be maximum 14 characters.';
      }

      const allowedCityNames = cityOptions.map((item) => (
        typeof item === 'string' ? item : item?.name
      )).filter(Boolean);
      if (city && !allowedCityNames.includes(city)) {
        errors.city = 'Select a valid city.';
      }
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!validateForm()) { setMessage(''); return; }

    setMessage('');
    setServerDown(false);
    setBusy(true);

    try {
      if (isSignup) {
        await signUpUser({ fullName, username, email, password, contactNumber, city, address, cityOptions });
        setFullName('');
        setUsername('');
        setEmail('');
        setPassword('');
        setConfirmPassword('');
        setContactNumber('');
        setCity('');
        setCityInput('');
        setCitySuggestions([]);
        setAddress('');
        setFieldErrors({});
        setMessageType('success');
        setMessage('Account created successfully. Please log in to continue.');
        setToastMessage('Account created successfully. Please log in to continue.');
        await new Promise((r) => window.setTimeout(r, 650));
        onSwitch('login');
      } else {
        const user = await loginUser({ username, email, password });
        setToastMessage('Login successful.');
        await new Promise((r) => window.setTimeout(r, 650));
        onAuthSuccess(user);
      }
    } catch (err) {
      const msg = err.message || 'Authentication failed. Please try again.';
      if (isServerDownError(msg)) {
        setServerDown(true);
      } else if (isSignup && msg.toLowerCase().includes('email already exists')) {
        setFieldErrors((p) => ({ ...p, email: msg }));
      } else {
        setMessageType('error');
        setMessage(msg);
      }
    } finally {
      setBusy(false);
    }
  }

  function switchMode() {
    setMessage('');
    setMessageType('error');
    setFieldErrors({});
    setShowPassword(false);
    setShowConfirmPassword(false);
    setConfirmPassword('');
    setServerDown(false);
    onSwitch(isSignup ? 'login' : 'signup');
  }

  /* ── field change handlers ── */

  function handleFullNameChange(e) {
    const v = e.target.value.slice(0, 20);
    setFullName(v);
    if (!/^[A-Za-z\s]*$/.test(v)) {
      setFieldErrors((p) => ({ ...p, fullName: 'Full name can only contain letters and spaces.' }));
      return;
    }
    if (v.length >= 20) {
      setFieldErrors((p) => ({ ...p, fullName: 'Full name can be maximum 20 characters.' }));
      return;
    }
    clearFieldError('fullName');
  }

  function handleUsernameChange(e) {
    const v = e.target.value.slice(0, 12);
    setUsername(v);
    if (/\s/.test(v)) {
      setFieldErrors((p) => ({ ...p, username: 'Username cannot contain spaces.' }));
      return;
    }
    if (v.length >= 12) {
      setFieldErrors((p) => ({ ...p, username: 'Username can be maximum 12 characters.' }));
      return;
    }
    clearFieldError('username');
  }

  function handleEmailChange(e) {
    const v = e.target.value.toLowerCase();
    setEmail(v);
    if (v.trim() && !isValidEmail(v.trim())) {
      setFieldErrors((p) => ({ ...p, email: 'This is not a valid email.' }));
      return;
    }
    clearFieldError('email');
  }

  function handlePasswordChange(e) {
    const v = e.target.value.slice(0, 64);
    setPassword(v);
    if (/\s/.test(v)) {
      setFieldErrors((p) => ({ ...p, password: 'Password cannot contain spaces.' }));
      return;
    }
    if (v.length > 0 && v.length < 8) {
      setFieldErrors((p) => ({ ...p, password: 'Password must be at least 8 characters.' }));
      return;
    }
    if (v.length >= 64) {
      setFieldErrors((p) => ({ ...p, password: 'Password must be between 8 and 64 characters.' }));
      return;
    }
    clearFieldError('password');
  }

  function handleConfirmPasswordChange(e) {
    const v = e.target.value.slice(0, 64);
    setConfirmPassword(v);
    if (/\s/.test(v)) {
      setFieldErrors((p) => ({ ...p, confirmPassword: 'Confirm password cannot contain spaces.' }));
      return;
    }
    if (v && password && v !== password) {
      setFieldErrors((p) => ({ ...p, confirmPassword: 'Passwords do not match.' }));
      return;
    }
    clearFieldError('confirmPassword');
  }

  function handleContactNumberChange(e) {
    const raw = e.target.value;
    const digits = cleanContactNumber(raw).slice(0, 10);
    setContactNumber(digits);

    if (raw !== cleanContactNumber(raw)) {
      setFieldErrors((p) => ({ ...p, contactNumber: 'Only numbers are allowed.' }));
      return;
    }
    if (digits.length === 10) {
      if (!INDIAN_PHONE_REGEX.test(digits)) {
        setFieldErrors((p) => ({ ...p, contactNumber: 'Contact number must start with 6, 7, 8, or 9.' }));
        return;
      }
      clearFieldError('contactNumber');
      return;
    }
    if (digits.length > 0) {
      setFieldErrors((p) => ({ ...p, contactNumber: 'Contact number must be exactly 10 digits.' }));
      return;
    }
    clearFieldError('contactNumber');
  }

  function handleCityInputChange(e) {
    const v = e.target.value;
    setCityInput(v);
    setCity('');
    clearFieldError('city');
    if (!v.trim()) {
      setCitySuggestions([]);
      setShowCitySuggestions(false);
      return;
    }
    const lower = v.toLowerCase();
    const matches = cityOptions
      .map((item) => (typeof item === 'string' ? { name: item, state: '' } : item))
      .filter((item) => item.name.toLowerCase().startsWith(lower))
      .slice(0, 8);
    setCitySuggestions(matches);
    setShowCitySuggestions(matches.length > 0);
  }

  function handleCitySelect(item) {
    setCity(item.name);
    setCityInput(item.state ? `${item.name}, ${item.state}` : item.name);
    setCitySuggestions([]);
    setShowCitySuggestions(false);
    clearFieldError('city');
  }

  function handleCityBlur() {
    setTimeout(() => setShowCitySuggestions(false), 150);
    if (cityInput.trim() && !city) {
      setFieldErrors((p) => ({ ...p, city: 'Select a valid city from the list.' }));
    }
  }

  function handleAddressChange(e) {
    const v = e.target.value;
    setAddress(v);
    if (v && !/^[A-Za-z0-9 ,.\-]*$/.test(v)) {
      setFieldErrors((p) => ({ ...p, address: 'Address can only contain English letters, numbers, spaces, commas, dots, and hyphens.' }));
      return;
    }
    if (countWords(v) > 50) {
      setFieldErrors((p) => ({ ...p, address: 'Address can be maximum 50 words.' }));
      return;
    }
    if (hasLongAddressWord(v)) {
      setFieldErrors((p) => ({ ...p, address: 'Each address word can be maximum 14 characters.' }));
      return;
    }
    clearFieldError('address');
  }

  async function handleGuestLogin() {
    if (guestAlreadyUsed) return;
    setGuestBusy(true);
    setGuestError('');
    try {
      const data = await guestLogin();
      setAuthToken(data.token);
      onAuthSuccess({
        username: data.username,
        isGuest: true,
        email: '',
        fullName: data.username,
        accountType: 'Guest'
      });
    } catch (err) {
      setGuestError(err.message || 'Failed to start demo. Please try again.');
    } finally {
      setGuestBusy(false);
    }
  }

  function goTo(path) {
    if (onNavigate) {
      onNavigate(path);
    } else {
      window.history.pushState({}, '', path);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  }

  return (
    <main className="auth-page auth-page-next">
      {toastMessage && (
        <div className="auth-toast is-success" role="status" aria-live="polite">
          <Check size={16} />
          <span>{toastMessage}</span>
        </div>
      )}

      {showSessionEndedBanner && (
        <div className="auth-server-down" role="alert" style={{ borderColor: 'rgba(78,168,255,0.30)' }}>
          <span className="auth-server-down-icon" style={{ color: 'var(--auth-secondary)' }}>&#9432;</span>
          <div>
            <strong>Demo session ended.</strong>
            <span>Your demo session has ended. Sign up to continue.</span>
          </div>
        </div>
      )}

      {serverDown && (
        <div className="auth-server-down" role="alert">
          <span className="auth-server-down-icon">&#9888;</span>
          <div>
            <strong>Server is down.</strong>
            <span>Please try again later.</span>
          </div>
        </div>
      )}

      <div className="auth-page-frame">
        <header className="auth-topbar">
          <div className="auth-brand">
            <BrandMark />
            <div>
              <strong>InterviewMirror <em>AI</em></strong>
            </div>
          </div>
        </header>

        <section className="auth-shell">
          <section className="auth-copy" aria-labelledby="authHeroTitle">
            <div className="auth-eyebrow">
              <Sparkles size={14} />
              <span>AI Powered Interview Practice</span>
            </div>
            <h1 id="authHeroTitle">
              Practice interviews with realistic{' '}
              <span className="auth-hero-gradient">
                <em className="auth-hero-ai">AI recruiters.</em>
              </span>
            </h1>
            <p>
              Train with adaptive interview simulations, receive structured
              feedback, and improve with every session.
            </p>

            <div className="auth-feature-list">
              {FEATURE_ITEMS.map(({ icon: Icon, label }) => (
                <span key={label}>
                  <span className="auth-feature-icon"><Icon size={20} /></span>
                  {label}
                </span>
              ))}
            </div>

            <DashboardPreview />
          </section>

          <div className="auth-card-wrap">
            <form className="auth-card" onSubmit={handleSubmit} noValidate>
              <div className="auth-card-header">
                <h2>{isSignup ? 'Create your account' : 'Welcome back'}</h2>
                <p>
                  {isSignup
                    ? 'Start your interview preparation journey.'
                    : 'Continue your interview preparation.'}
                </p>
              </div>

              {message && (
                <div className={`auth-message ${messageType === 'success' ? 'is-success' : ''}`} role="alert">
                  {message}
                </div>
              )}

              {/* Full Name — signup only */}
              {isSignup && (
                <AuthField
                  id="authFullName"
                  label="Full name"
                  icon={IdCard}
                  type="text"
                  value={fullName}
                  onChange={handleFullNameChange}
                  placeholder="Your full name"
                  autoComplete="name"
                  error={fieldErrors.fullName}
                  maxLength={20}
                />
              )}

              <AuthField
                id="authUsername"
                label="Username"
                icon={User}
                type="text"
                value={username}
                onChange={handleUsernameChange}
                placeholder="Pratham"
                autoComplete="username"
                error={fieldErrors.username}
                maxLength={12}
              />

              <AuthField
                id="authEmail"
                label="Email address"
                icon={Mail}
                type="email"
                value={email}
                onChange={handleEmailChange}
                placeholder="you@example.com"
                autoComplete="email"
                error={fieldErrors.email}
              />

              <AuthField
                id="authPassword"
                label="Password"
                icon={Lock}
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={handlePasswordChange}
                placeholder={isSignup ? 'Create a password' : 'Enter your password'}
                autoComplete={isSignup ? 'new-password' : 'current-password'}
                error={fieldErrors.password}
                maxLength={64}
                trailing={(
                  <button
                    type="button"
                    className="auth-password-toggle"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                )}
              />

              {isSignup && <PasswordChecklist status={passwordStatus} />}

              {/* Confirm Password — signup only */}
              {isSignup && (
                <AuthField
                  id="authConfirmPassword"
                  label="Confirm password"
                  icon={Lock}
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={handleConfirmPasswordChange}
                  placeholder="Repeat your password"
                  autoComplete="new-password"
                  error={fieldErrors.confirmPassword}
                  maxLength={64}
                  trailing={(
                    <button
                      type="button"
                      className="auth-password-toggle"
                      onClick={() => setShowConfirmPassword((v) => !v)}
                      aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                    >
                      {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  )}
                />
              )}

              {isSignup && (
                <>
                  <AuthField
                    id="authContactNumber"
                    label="Contact number"
                    icon={Phone}
                    type="tel"
                    value={contactNumber}
                    onChange={handleContactNumberChange}
                    placeholder="9876543210"
                    autoComplete="tel"
                    error={fieldErrors.contactNumber}
                    maxLength={10}
                  />

                  <div className="auth-field" style={{ position: 'relative' }}>
                    <label htmlFor="authCity">City</label>
                    <div className={`auth-input-shell ${fieldErrors.city ? 'has-error' : ''}`}>
                      <MapPin size={18} />
                      <input
                        id="authCity"
                        type="text"
                        placeholder="Type city name (optional)"
                        value={cityInput}
                        onChange={handleCityInputChange}
                        onBlur={handleCityBlur}
                        autoComplete="off"
                      />
                    </div>
                    {fieldErrors.city && (
                      <span className="auth-field-error">{fieldErrors.city}</span>
                    )}
                    {showCitySuggestions && (
                      <ul className="auth-city-suggestions">
                        {citySuggestions.map((item) => (
                          <li
                            key={`${item.name}-${item.state}`}
                            onMouseDown={() => handleCitySelect(item)}
                          >
                            {item.state ? `${item.name}, ${item.state}` : item.name}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <AuthField
                    id="authAddress"
                    label="Address"
                    icon={Home}
                    type="text"
                    value={address}
                    onChange={handleAddressChange}
                    placeholder="Optional address"
                    autoComplete="street-address"
                    error={fieldErrors.address}
                  />
                  <div className={`auth-word-counter ${addressWordCount > 50 ? 'is-over' : ''}`}>
                    {addressWordCount}/50 words
                  </div>
                </>
              )}

              {!isSignup && (
                <div className="auth-remember-row">
                  <label>
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                    />
                    <span>Remember me</span>
                  </label>
                  <button
                    type="button"
                    className="auth-forgot-link"
                    onClick={() => goTo('/forgot-password')}
                  >
                    Forgot Password?
                  </button>
                </div>
              )}

              <button className="auth-submit" type="submit" disabled={busy}>
                {busy ? (
                  <>
                    <span className="spinner" />
                    {isSignup ? 'Creating account...' : 'Signing in...'}
                  </>
                ) : (
                  <>
                    {isSignup ? 'Create account' : 'Sign in'}
                    <ArrowRight size={18} />
                  </>
                )}
              </button>

              {!isSignup && (
                <>
                  <div className="auth-divider"><span>or</span></div>

                  {guestAlreadyUsed ? (
                    <div style={{ textAlign: 'center' }}>
                      <p style={{ fontSize: '13px', color: 'var(--auth-muted)', marginBottom: '14px' }}>
                        You've already used your free demo. Sign up to continue.
                      </p>
                      <button
                        type="button"
                        className="auth-guest-btn"
                        onClick={() => onSwitch('signup')}
                      >
                        Create a free account
                      </button>
                    </div>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="auth-guest-btn"
                        onClick={handleGuestLogin}
                        disabled={guestBusy}
                      >
                        {guestBusy ? (
                          <><span className="spinner" /> Starting demo...</>
                        ) : (
                          <><User size={18} /> Continue as Guest</>
                        )}
                      </button>
                      {guestError && (
                        <p className="auth-field-error" style={{ textAlign: 'center', marginTop: '8px' }}>
                          {guestError}
                        </p>
                      )}
                    </>
                  )}
                </>
              )}

              <div className="auth-switch">
                {isSignup ? 'Already have an account?' : "Don't have an account?"}
                <button type="button" onClick={switchMode}>
                  {isSignup ? 'Log in' : 'Create one'}
                </button>
              </div>
            </form>
          </div>
        </section>

        <footer className="auth-legal-footer" aria-label="Legal links">
          <button type="button" onClick={() => goTo('/privacy')}>Privacy</button>
          <span aria-hidden="true">&bull;</span>
          <button type="button" onClick={() => goTo('/terms')}>Terms</button>
          <span aria-hidden="true">&bull;</span>
          <button type="button" onClick={() => goTo('/contact')}>Support</button>
        </footer>
      </div>
    </main>
  );
}
