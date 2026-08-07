import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import InterviewerStage from '../components/InterviewerStage.jsx';
import AnswerComposer from '../components/AnswerComposer.jsx';
import AnalysisPanel from '../components/AnalysisPanel.jsx';
import PresencePanel from '../components/PresencePanel.jsx';
import TranscriptPanel from '../components/TranscriptPanel.jsx';
import { useSpeech } from '../hooks/useSpeech.js';
import { usePresence } from '../hooks/usePresence.js';

const TOTAL_SECONDS = 90;

const TOKEN_KEY = 'interview_mirror_access_token';

function decodeJwt(token) {
  if (!token) return null;
  try { return JSON.parse(atob(token.split('.')[1])); } catch { return null; }
}

export default function InterviewPage({
  draft,
  session,
  currentQuestion,
  latestAnalysis,
  transcript,
  onSubmitAnswer,
  onAnalyzeLiveAnswer,
  onEndSession,
  onNavigate,
  busy
}) {
  const {
    transcript: speechText,
    isListening,
    isSpeaking,
    speak,
    stopSpeaking,
    stopAllSpeechActivity,
    startListening,
    stopListening,
    resetTranscript,
    speechError
  } = useSpeech(draft.persona);

  const {
    videoRef,
    metrics,
    cameraReady,
    cameraStatus,
    cameraMessage,
    cameraBusy,
    startCamera,
    stopCamera,
    presenceSnapshot
  } = usePresence();

  const [followUpText, setFollowUpText] = useState('');
  const [mood, setMood] = useState('neutral');
  const [liveAnalysis, setLiveAnalysis] = useState(null);
  const [guestExpiredMsg, setGuestExpiredMsg] = useState('');
  const [remainingSeconds, setRemainingSeconds] = useState(TOTAL_SECONDS);
  const [startedAt, setStartedAt] = useState(Date.now());
  const questionIndexRef = useRef(0);
  const silenceTimerRef = useRef(null);
  const liveAnalysisTimerRef = useRef(null);
  const liveAnalysisKeyRef = useRef('');
  const submittingRef = useRef(false);

  const handleEndInterview = useCallback(() => {
    window.clearTimeout(silenceTimerRef.current);
    window.clearTimeout(liveAnalysisTimerRef.current);
    stopAllSpeechActivity();
    stopCamera('Camera stopped because the interview ended.');
    onEndSession();
  }, [onEndSession, stopAllSpeechActivity, stopCamera]);

  useEffect(() => () => {
    window.clearTimeout(silenceTimerRef.current);
    window.clearTimeout(liveAnalysisTimerRef.current);
    stopAllSpeechActivity();
    stopCamera('Camera stopped because you left the interview page.');
  }, [stopAllSpeechActivity, stopCamera]);

  useEffect(() => {
    if (!currentQuestion) return undefined;

    window.clearTimeout(silenceTimerRef.current);
    resetTranscript();
    setFollowUpText('');
    setLiveAnalysis(null);
    setMood('neutral');
    setRemainingSeconds(TOTAL_SECONDS);
    setStartedAt(Date.now());
    submittingRef.current = false;
    liveAnalysisKeyRef.current = '';

    const isFirstQuestion = questionIndexRef.current === 0;
    questionIndexRef.current += 1;

    const intro = isFirstQuestion
      ? `${session?.interviewer?.intro || `Hello ${draft.candidateName}.`} `
      : '';

    const timeoutId = window.setTimeout(() => {
      speak(`${intro}${currentQuestion}`, { autoListen: true });
    }, 300);

    return () => window.clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentQuestion]);

  useEffect(() => {
    const id = setInterval(() => {
      setRemainingSeconds(s => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (isListening) setMood('listening');
    else if (!isSpeaking && mood === 'listening') setMood('neutral');
  }, [isListening, isSpeaking, mood]);

  async function handleSubmit(answer) {
    const cleanAnswer = String(answer || '').trim();
    if (!cleanAnswer || busy || submittingRef.current) return null;

    submittingRef.current = true;
    window.clearTimeout(silenceTimerRef.current);
    window.clearTimeout(liveAnalysisTimerRef.current);
    stopListening();

    // Set guest_used on first answer submission only
    try {
      const token = localStorage.getItem(TOKEN_KEY);
      const decoded = decodeJwt(token);
      if (decoded?.isGuest && !localStorage.getItem('guest_used')) {
        localStorage.setItem('guest_used', JSON.stringify({ used: true, setAt: Date.now() }));
      }
    } catch {
      // silent — never crash the interview
    }

    const responseSeconds = Math.max(
      5,
      Math.round((Date.now() - startedAt) / 1000)
    );

    try {
      const result = await onSubmitAnswer(
        cleanAnswer,
        responseSeconds,
        presenceSnapshot
      );

      if (result) {
        setLiveAnalysis(null);
        setMood(result.interviewerMood || 'neutral');

        if (result.adaptiveFollowUp === true && result.followUp) {
          setFollowUpText(result.followUp);
          speak(result.followUp, { autoListen: true });
        }
      }

      return result;
    } catch (err) {
      if (err?.status === 401 || err?.response?.status === 401) {
        setGuestExpiredMsg('Your demo session has expired. Sign up to continue.');
        window.setTimeout(() => onNavigate?.('/login'), 3000);
      }
      return null;
    } finally {
      resetTranscript();
      submittingRef.current = false;
    }
  }

  useEffect(() => {
    window.clearTimeout(silenceTimerRef.current);

    const cleanAnswer = speechText.trim();
    if (!isListening || isSpeaking || busy || submittingRef.current || !cleanAnswer) {
      return undefined;
    }

    silenceTimerRef.current = window.setTimeout(() => {
      handleSubmit(cleanAnswer);
    }, 5500);

    return () => window.clearTimeout(silenceTimerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speechText, isListening, isSpeaking, busy, currentQuestion]);

  useEffect(() => {
    window.clearTimeout(liveAnalysisTimerRef.current);

    const cleanAnswer = speechText.trim();
    const wordCount = cleanAnswer.split(/\s+/).filter(Boolean).length;
    if (
      !onAnalyzeLiveAnswer ||
      !isListening ||
      isSpeaking ||
      busy ||
      submittingRef.current ||
      wordCount < 25
    ) {
      return undefined;
    }

    const analysisKey = `${currentQuestion}|${Math.floor(wordCount / 12)}`;
    if (liveAnalysisKeyRef.current === analysisKey) return undefined;

    liveAnalysisTimerRef.current = window.setTimeout(async () => {
      try {
        const responseSeconds = Math.max(5, Math.round((Date.now() - startedAt) / 1000));
        const result = await onAnalyzeLiveAnswer(cleanAnswer, responseSeconds, presenceSnapshot);
        if (result?.analysis && !submittingRef.current) {
          liveAnalysisKeyRef.current = analysisKey;
          setLiveAnalysis(result.analysis);
        }
      } catch (error) {
        if (error?.status === 401 || error?.response?.status === 401) {
          setGuestExpiredMsg('Your demo session has expired. Sign up to continue.');
          window.setTimeout(() => onNavigate?.('/login'), 3000);
        } else {
          console.warn('Live answer analysis unavailable:', error?.message || error);
        }
      }
    }, 3200);

    return () => window.clearTimeout(liveAnalysisTimerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speechText, isListening, isSpeaking, busy, currentQuestion, startedAt]);

  useEffect(() => {
    if (remainingSeconds === 0 && !submittingRef.current) {
      stopListening();
      if (!busy) {
        handleSubmit(speechText.trim() || '[No response given]');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remainingSeconds]);

  const pressureScore = useMemo(() => session?.pressureScore || 50, [session]);
  const currentRound = transcript.length + 1;
  const roleLabel = draft.role?.replaceAll('-', ' ') || 'Interview';
  const difficultyLabel = draft.difficulty || 'medium';
  const personaLabel = draft.persona?.replaceAll('-', ' ') || 'AI interviewer';
  const canSubmitInterview = transcript.length > 0 && !busy;

  const timeTone =
    remainingSeconds > 45
      ? 'var(--success)'
      : remainingSeconds > 20
      ? 'var(--warning)'
      : 'var(--danger)';

  if (!currentQuestion) {
    return (
      <div className="panel panel-lg anim-fade-in">
        <div className="error-banner">
          Unable to start interview because no question was returned for this setup.
          Please go back to setup and choose another domain, or check that the backend question bank is available.
        </div>
        <button className="btn btn-danger" type="button" onClick={handleEndInterview} disabled={busy}>
          End Session
        </button>
      </div>
    );
  }

  return (
    <div
      className="anim-fade-in"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '18px'
      }}
    >
      {guestExpiredMsg && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0,0,0,0.75)',
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <div className="panel" style={{ maxWidth: 420, textAlign: 'center', padding: '36px 28px' }}>
            <div style={{ fontSize: '2rem', marginBottom: '14px' }}>⏱</div>
            <h3 style={{ marginBottom: '12px' }}>Demo session expired</h3>
            <p style={{ color: 'var(--text-muted)', marginBottom: '20px', lineHeight: 1.6 }}>{guestExpiredMsg}</p>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>Redirecting in 3 seconds...</p>
          </div>
        </div>
      )}
      {/* Cinematic top strip */}
      <div
        style={{
          position: 'relative',
          overflow: 'hidden',
          borderRadius: '28px',
          border: '1px solid rgba(255,255,255,0.08)',
          background:
            'radial-gradient(circle at top right, rgba(96,165,250,0.14), transparent 24%), radial-gradient(circle at top left, rgba(167,139,250,0.10), transparent 22%), linear-gradient(180deg, rgba(22,22,22,0.98), rgba(10,10,10,0.98))',
          padding: '20px 22px',
          boxShadow: '0 18px 45px rgba(0,0,0,0.35)'
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: '18px',
            flexWrap: 'wrap'
          }}
        >
          <div style={{ flex: 1, minWidth: '280px' }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '7px 12px',
                borderRadius: '999px',
                background: 'rgba(74,222,128,0.10)',
                border: '1px solid rgba(74,222,128,0.20)',
                color: '#86efac',
                fontSize: '0.76rem',
                fontWeight: 700,
                marginBottom: '12px'
              }}
            >
              <span className="live-dot" />
              Interview in progress
            </div>

            <h2
              style={{
                margin: '0 0 8px',
                fontSize: 'clamp(1.5rem, 2.2vw, 2rem)',
                lineHeight: 1.12,
                letterSpacing: '-0.03em'
              }}
            >
              Live AI Interview Room
            </h2>

            <p
              style={{
                margin: 0,
                color: 'var(--text-muted)',
                fontSize: '0.98rem',
                lineHeight: 1.8,
                maxWidth: '720px'
              }}
            >
              Stay focused, answer naturally, and let the AI evaluate your
              clarity, structure, presence, and overall interview performance in
              real time.
            </p>
          </div>

          <button
            className="btn btn-danger btn-sm"
            onClick={handleEndInterview}
            disabled={busy}
            style={{
              minWidth: '160px',
              alignSelf: 'flex-start'
            }}
          >
            {busy ? <span className="spinner" /> : null}
            End Session
          </button>
          
        </div>

        <div
          style={{
            marginTop: '18px',
            display: 'grid',
            gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
            gap: '12px'
          }}
        >
          {[
            {
              label: 'Current Round',
              value: `Q${currentRound}`
            },
            {
              label: 'Candidate',
              value: draft.candidateName || 'Candidate'
            },
            {
              label: 'Role',
              value: roleLabel
            },
            {
              label: 'Difficulty',
              value: difficultyLabel
            }
          ].map(item => (
            <div
              key={item.label}
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '18px',
                padding: '14px 16px'
              }}
            >
              <div
                style={{
                  fontSize: '0.72rem',
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  marginBottom: '6px'
                }}
              >
                {item.label}
              </div>
              <div
                style={{
                  color: 'var(--text-primary)',
                  fontWeight: 700,
                  fontSize: '0.96rem',
                  lineHeight: 1.4
                }}
              >
                {item.value}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Live status strip */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1.1fr 0.9fr 0.8fr 0.8fr',
          gap: '12px'
        }}
      >
        <div
          className="panel panel-sm"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            minHeight: '70px'
          }}
        >
          <div
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '12px',
              background: 'rgba(96,165,250,0.12)',
              border: '1px solid rgba(96,165,250,0.22)',
              display: 'grid',
              placeItems: 'center',
              color: '#93c5fd',
              flexShrink: 0
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 20h9" />
              <path d="M12 4h9" />
              <path d="M4 9h16" />
              <path d="M4 15h16" />
            </svg>
          </div>
          <div>
            <div
              style={{
                fontSize: '0.72rem',
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                marginBottom: '4px'
              }}
            >
              Persona
            </div>
            <div
              style={{
                color: 'var(--text-primary)',
                fontWeight: 700,
                fontSize: '0.9rem'
              }}
            >
              {personaLabel}
            </div>
          </div>
        </div>

        <div
          className="panel panel-sm"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            minHeight: '70px'
          }}
        >
          <div>
            <div
              style={{
                fontSize: '0.72rem',
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                marginBottom: '4px'
              }}
            >
              Voice Status
            </div>
            <div
              style={{
                color: 'var(--text-primary)',
                fontWeight: 700,
                fontSize: '0.9rem'
              }}
            >
              {isSpeaking
                ? 'AI speaking'
                : isListening
                ? 'Listening to you'
                : 'Waiting for response'}
            </div>
          </div>

          <span
            className={`badge ${
              isSpeaking || isListening ? 'badge-live' : 'badge-default'
            }`}
            style={{ fontSize: '0.72rem' }}
          >
            {isSpeaking ? 'LIVE AUDIO' : isListening ? 'MIC ON' : 'IDLE'}
          </span>
        </div>

        <div
          className="panel panel-sm"
          style={{
            minHeight: '70px'
          }}
        >
          <div
            style={{
              fontSize: '0.72rem',
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              marginBottom: '4px'
            }}
          >
            Time Left
          </div>
          <div
            style={{
              color: timeTone,
              fontWeight: 800,
              fontSize: '1.2rem',
              lineHeight: 1.2
            }}
          >
            {remainingSeconds}s
          </div>
        </div>

        <div
          className="panel panel-sm"
          style={{
            minHeight: '70px'
          }}
        >
          <div
            style={{
              fontSize: '0.72rem',
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              marginBottom: '4px'
            }}
          >
            Pressure Mode
          </div>
          <div
            style={{
              color: 'var(--text-primary)',
              fontWeight: 800,
              fontSize: '1.2rem',
              lineHeight: 1.2
            }}
          >
            {pressureScore}/100
          </div>
        </div>
      </div>

      {/* Main interview layout */}
      <div className="interview-layout" style={{ gap: '18px' }}>
        {/* Left */}
        <div className="col-stack" style={{ gap: '16px' }}>
          <div
            style={{
              borderRadius: '28px',
              overflow: 'hidden',
              boxShadow: '0 16px 40px rgba(0,0,0,0.25)'
            }}
          >
            <InterviewerStage
              interviewer={session?.interviewer}
              persona={draft.persona}
              currentQuestion={currentQuestion}
              followUpText={followUpText}
              pressureScore={pressureScore}
              mood={mood}
              isSpeaking={isSpeaking}
            />
          </div>

          <div
            className="panel"
            style={{
              padding: '18px',
              background:
                'linear-gradient(180deg, rgba(20,20,20,0.98), rgba(12,12,12,0.98))'
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                marginBottom: '14px',
                flexWrap: 'wrap'
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: '0.74rem',
                    color: 'var(--text-muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    marginBottom: '5px'
                  }}
                >
                  Response Console
                </div>
                <div
                  style={{
                    color: 'var(--text-primary)',
                    fontWeight: 700,
                    fontSize: '0.96rem'
                  }}
                >
                  Speak your answer, then submit manually or pause for auto-submit
                </div>
              </div>

              <span className="badge badge-default" style={{ fontSize: '0.72rem' }}>
                {roleLabel} · {difficultyLabel}
              </span>
            </div>

            <AnswerComposer
              transcript={speechText}
              isListening={isListening}
              onStartListening={startListening}
              onStopListening={stopListening}
              onSubmit={handleSubmit}
              onClear={resetTranscript}
              speechError={speechError}
              busy={busy}
              remainingSeconds={remainingSeconds}
              totalSeconds={TOTAL_SECONDS}
              micDisabled={isSpeaking}
            />
          </div>

          <div
            className="panel"
            style={{
              padding: '18px'
            }}
          >
            <div
              style={{
                fontSize: '0.74rem',
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                marginBottom: '10px'
              }}
            >
              Session Transcript
            </div>

            <TranscriptPanel transcript={transcript} />
          </div>
        </div>

        {/* Right */}
        <div className="col-stack" style={{ gap: '16px' }}>
          <div
            className="panel"
            style={{
              padding: '18px'
            }}
          >
            <div
              style={{
                fontSize: '0.74rem',
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                marginBottom: '10px'
              }}
            >
              Presence Monitor
            </div>

            <PresencePanel
              videoRef={videoRef}
              metrics={metrics}
              cameraReady={cameraReady}
              cameraStatus={cameraStatus}
              cameraMessage={cameraMessage}
              cameraBusy={cameraBusy}
              onEnableCamera={startCamera}
              onDisableCamera={() => stopCamera('Camera turned off. Enable camera to resume visual analysis.')}
            />
          </div>

          <div
            className="panel"
            style={{
              padding: '18px'
            }}
          >
            <div
              style={{
                fontSize: '0.74rem',
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                marginBottom: '10px'
              }}
            >
              Live Analysis
            </div>

            <AnalysisPanel analysis={liveAnalysis || latestAnalysis} cameraReady={cameraReady && cameraStatus === 'on'} />
          </div>

          <div
            className="panel panel-sm"
            style={{
              display: 'flex',
              gap: '8px',
              flexWrap: 'wrap',
              alignItems: 'center'
            }}
          >
            <button
              className="btn btn-ghost btn-sm"
              onClick={() =>
                isSpeaking
                  ? stopSpeaking()
                  : speak(followUpText || currentQuestion)
              }
            >
              {isSpeaking ? (
                <>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="6" y="6" width="12" height="12" rx="1" />
                  </svg>
                  Stop Audio
                </>
              ) : (
                <>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                  Replay Question
                </>
              )}
            </button>

            <button
              className="btn btn-ghost btn-sm"
              onClick={resetTranscript}
              disabled={busy}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="1 4 1 10 7 10" />
                <path d="M3.51 15a9 9 0 103.13-9.36L1 10" />
              </svg>
              Clear Draft
            </button>

            <span style={{ flex: 1 }} />

            <span
              style={{
                fontSize: '0.75rem',
                color: 'var(--text-muted)',
                display: 'flex',
                alignItems: 'center'
              }}
            >
              {followUpText ? 'Follow-up generated by AI' : 'Main question active'}
            </span>
          </div>
        </div>
      </div>

      <div
        className="panel panel-sm interview-submit-panel"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '14px',
          flexWrap: 'wrap'
        }}
      >
        <div>
          <div
            style={{
              fontSize: '0.74rem',
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              marginBottom: '4px'
            }}
          >
            Final Step
          </div>
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            Submit this interview to generate your final dashboard report.
          </div>
        </div>
        <button
          type="button"
          className="btn btn-primary btn-lg interview-submit-btn"
          onClick={handleEndInterview}
          disabled={!canSubmitInterview}
        >
          {busy ? <span className="spinner" /> : null}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
            <path d="m5 12 5 5L20 7" />
          </svg>
          Submit
        </button>
      </div>
    </div>
  );
}
