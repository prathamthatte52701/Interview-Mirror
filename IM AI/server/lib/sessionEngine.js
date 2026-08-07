import { nanoid } from 'nanoid';
import { questionBank, personaProfiles } from './questionBank.js';
import { analyzeAnswer, summarizeSession } from './scoring.js';
import InterviewSession from '../models/InterviewSession.js';
import {
  hasAI,
  generateAnalysisWithAI,
  generateFollowUpWithAI,
  generateDynamicQuestion,
  generateSessionSummaryWithAI
} from './aiProvider.js';

// ─── Question Picker ───────────────────────────────────────────────────────────
function scoreQuestion(q, session) {
  const profileText = `${session.resumeText || ''} ${session.jdText || ''}`.toLowerCase();
  const keywordScore = (q.keywords || []).reduce((s, kw) => s + (profileText.includes(kw) ? 2 : 0), 0);
  const diffBoost = session.difficulty === q.difficulty ? 2 : 0;
  const modeBoost = session.interviewMode?.toLowerCase().includes(q.category) ? 1.5 : 0;
  return keywordScore + diffBoost + modeBoost;
}

function questionsForRole(role) {
  return questionBank.filter(q => q.role === role);
}

function numberOrNull(value) {
  const num = Number(value);
  return Number.isFinite(num) ? Math.round(num) : null;
}

function applyPresenceSnapshot(analysis, presenceSnapshot) {
  const hasVisualPresence = Boolean(
    presenceSnapshot?.cameraActive &&
    presenceSnapshot?.visualMetricsAvailable
  );

  analysis.visualMetricsAvailable = hasVisualPresence;
  analysis.cameraStatus = presenceSnapshot?.cameraStatus || (hasVisualPresence ? 'on' : 'off');

  if (!hasVisualPresence) {
    analysis.confidenceScore = null;
    analysis.eyeContactScore = null;
    analysis.postureScore = null;
    analysis.attentionScore = null;
    analysis.visualConfidenceScore = null;
    analysis.faceVisibilityScore = null;
    analysis.engagementScore = null;
    return analysis;
  }

  analysis.eyeContactScore = numberOrNull(presenceSnapshot.eyeContact);
  analysis.postureScore = numberOrNull(presenceSnapshot.posture);
  analysis.attentionScore = numberOrNull(presenceSnapshot.attention);
  analysis.visualConfidenceScore = numberOrNull(presenceSnapshot.confidence);
  analysis.faceVisibilityScore = numberOrNull(presenceSnapshot.faceVisibility);
  analysis.engagementScore = numberOrNull(presenceSnapshot.engagement);
  analysis.confidenceScore = analysis.visualConfidenceScore ?? analysis.confidenceScore ?? null;

  return analysis;
}

const MAX_ADAPTIVE_FOLLOW_UPS = 2;
const LOW_SCORE_FOLLOW_UP_THRESHOLD = 4.8;

function adaptiveFollowUpCount(session) {
  return (session.transcript || []).filter((entry) => entry.questionMeta?.isAdaptiveFollowUp).length;
}

function shouldAskAdaptiveFollowUp(session, analysis) {
  const overall = Number(analysis?.metrics?.overall ?? 0);
  const wordCount = Number(analysis?.wordCount ?? 0);
  const currentIsFollowUp = Boolean(session.currentMeta?.isAdaptiveFollowUp);

  return !currentIsFollowUp
    && adaptiveFollowUpCount(session) < MAX_ADAPTIVE_FOLLOW_UPS
    && (overall > 0 && overall <= LOW_SCORE_FOLLOW_UP_THRESHOLD || wordCount > 0 && wordCount < 25);
}

function pickBankQuestion(session) {
  const roleQuestions = questionsForRole(session.role);
  if (roleQuestions.length === 0) return null;

  const candidates = roleQuestions
    .filter(q => !session.askedQuestions.includes(q.question))
    .sort((a, b) => scoreQuestion(b, session) - scoreQuestion(a, session));
  return candidates[0] || roleQuestions[0];
}

function normalizeQuestionText(question) {
  return String(question || '')
    .replace(/^["'\s]+|["'\s]+$/g, '')
    .replace(/^\d+[\).\s-]+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isValidQuestion(question, session) {
  const text = normalizeQuestionText(question);
  if (!text || text.length < 18 || text.length > 360) return false;
  if (session.askedQuestions.some((asked) => asked.toLowerCase() === text.toLowerCase())) return false;
  if (/^\{|\}$/.test(text) || /\bundefined\b|\bnull\b/i.test(text)) return false;
  return /[?]$/.test(text) || /^(tell|describe|explain|walk|how|what|why|when|give)\b/i.test(text);
}

async function getNextQuestion(session) {
  if (questionsForRole(session.role).length === 0) {
    return { question: null, meta: null };
  }

  // Try AI dynamic question first
  if (hasAI() && session.transcript.length < 10) {
    const aiQuestion = await generateDynamicQuestion({
      role: session.role,
      difficulty: session.difficulty,
      resumeText: session.resumeText,
      jdText: session.jdText,
      askedQuestions: session.askedQuestions,
      persona: session.persona
    });
    const cleanQuestion = normalizeQuestionText(aiQuestion);
    if (isValidQuestion(cleanQuestion, session)) {
      return {
        question: cleanQuestion,
        meta: {
          source: 'gemini',
          validated: true
        }
      };
    }
  }
  // Fallback to bank
  const q = pickBankQuestion(session);
  if (!q) return { question: null, meta: null };
  return { question: q.question, meta: q };
}

// ─── Create Session ────────────────────────────────────────────────────────────
export async function createSession(payload) {
  const personaMeta = personaProfiles[payload.persona] || personaProfiles['calm-senior-interviewer'];

  const session = {
    id: nanoid(10),
    userId: payload.userId,
    createdAt: new Date().toISOString(),
    role: payload.role,
    candidateName: payload.candidateName,
    interviewMode: payload.interviewMode || 'mixed',
    difficulty: payload.difficulty || 'medium',
    persona: payload.persona || 'calm-senior-interviewer',
    pressureMode: payload.pressureMode || 'balanced',
    resumeText: payload.resumeText || '',
    jdText: payload.jdText || '',
    askedQuestions: [],
    currentQuestion: null,
    currentMeta: null,
    transcript: [],
    pressureScore: payload.pressureMode === 'high-pressure' ? 72 : 48,
    interviewer: personaMeta,
    endedAt: null,
    summary: null
  };

  const { question, meta } = await getNextQuestion(session);
  if (!question) {
    throw new Error('No questions found for the selected interview domain.');
  }

  session.currentQuestion = question;
  session.currentMeta = meta;
  session.askedQuestions.push(question);

  await InterviewSession.create(session);

  return {
    session,
    firstQuestion: question,
    interviewerIntro: `${personaMeta.intro} Here is your first question: ${question}`
  };
}

// ─── Get Session ───────────────────────────────────────────────────────────────
function serializeSession(session) {
  if (!session) return null;
  const data = typeof session.toObject === 'function'
    ? session.toObject({ versionKey: false })
    : session;

  return {
    ...data,
    id: data.id,
    createdAt: data.createdAt instanceof Date ? data.createdAt.toISOString() : data.createdAt,
    updatedAt: data.updatedAt instanceof Date ? data.updatedAt.toISOString() : data.updatedAt,
    endedAt: data.endedAt instanceof Date ? data.endedAt.toISOString() : data.endedAt
  };
}

export async function getSession(sessionId, userId) {
  const session = await InterviewSession.findOne({ id: sessionId, userId });
  return serializeSession(session);
}

export async function liveAnalyzeAnswer(sessionId, answer, meta = {}) {
  const session = await getSession(sessionId, meta.userId);
  if (!session) throw new Error('Session not found');

  const questionText = session.currentQuestion;
  const rubric = session.currentMeta;
  const presenceSnapshot = meta.presenceSnapshot || null;
  let analysis = null;
  let source = 'heuristic';

  if (hasAI()) {
    const aiResult = await generateAnalysisWithAI({
      answer,
      question: questionText,
      role: session.role,
      rubric,
      presenceSnapshot
    });
    if (aiResult) {
      analysis = { ...aiResult, responseSeconds: meta.responseSeconds || 0 };
      source = 'gemini';
    }
  }

  if (!analysis) {
    analysis = analyzeAnswer({
      answer,
      question: questionText,
      role: session.role,
      transcriptSoFar: session.transcript,
      rubric,
      pressureScore: session.pressureScore,
      responseSeconds: meta.responseSeconds || 0
    });
  }

  return {
    source,
    analysis: applyPresenceSnapshot(analysis, presenceSnapshot)
  };
}

// ─── Submit Answer ─────────────────────────────────────────────────────────────
export async function answerQuestion(sessionId, answer, meta = {}) {
  const sessionDoc = await InterviewSession.findOne({ id: sessionId, userId: meta.userId });
  const session = serializeSession(sessionDoc);
  if (!session) throw new Error('Session not found');

  const questionText = session.currentQuestion;
  const rubric = session.currentMeta;
  const presenceSnapshot = meta.presenceSnapshot || null;

  // Analyze answer
  let analysis;
  if (hasAI()) {
    const aiResult = await generateAnalysisWithAI({
      answer,
      question: questionText,
      role: session.role,
      rubric,
      presenceSnapshot
    });
    if (aiResult) {
      analysis = { ...aiResult, responseSeconds: meta.responseSeconds || 0 };
    }
  }

  if (!analysis) {
    analysis = analyzeAnswer({
      answer,
      question: questionText,
      role: session.role,
      transcriptSoFar: session.transcript,
      rubric,
      pressureScore: session.pressureScore,
      responseSeconds: meta.responseSeconds || 0
    });
  }

  analysis = applyPresenceSnapshot(analysis, presenceSnapshot);

  // Follow-up
  let followUp = null;
  if (hasAI()) {
    followUp = await generateFollowUpWithAI({
      answer, analysis, persona: session.persona, previousQuestion: questionText
    });
  }
  if (!followUp) {
    followUp = analysis.missingPoints?.[0]
      ? `Can you elaborate on: ${analysis.missingPoints[0]}?`
      : 'What would you do differently if you faced this again?';
  }

  // Record transcript entry
  session.transcript.push({
    question: questionText,
    questionMeta: rubric,
    answer,
    createdAt: new Date().toISOString(),
    analysis,
    followUp,
    responseSeconds: meta.responseSeconds || 0,
    presenceSnapshot,
    pressureScoreBefore: session.pressureScore
  });

  // Update pressure score
  const delta = ((analysis.metrics?.overall || 5) < 6.2 ? 7 : -3)
    + ((analysis.fillerCount || 0) >= 3 ? 4 : 0)
    + (session.pressureMode === 'high-pressure' ? 5 : 0);
  session.pressureScore = Math.max(20, Math.min(95, (session.pressureScore || 50) + delta));

  let nextQ = null;
  let nextMeta = null;
  const askAdaptiveFollowUp = Boolean(shouldAskAdaptiveFollowUp(session, analysis) && followUp);

  if (askAdaptiveFollowUp) {
    nextQ = followUp;
    nextMeta = {
      isAdaptiveFollowUp: true,
      parentQuestion: questionText,
      reason: 'low-score',
      parentOverallScore: analysis.metrics?.overall ?? null
    };
  } else {
    ({ question: nextQ, meta: nextMeta } = await getNextQuestion(session));
  }

  session.currentQuestion = nextQ;
  session.currentMeta = nextMeta;
  if (nextQ) session.askedQuestions.push(nextQ);

  sessionDoc.transcript = session.transcript;
  sessionDoc.pressureScore = session.pressureScore;
  sessionDoc.currentQuestion = session.currentQuestion;
  sessionDoc.currentMeta = session.currentMeta;
  sessionDoc.askedQuestions = session.askedQuestions;
  await sessionDoc.save();

  const mood = session.pressureScore >= 75 ? 'skeptical'
    : (analysis.metrics?.overall || 0) >= 7.3 ? 'impressed'
    : 'neutral';

  return {
    analysis,
    followUp,
    adaptiveFollowUp: askAdaptiveFollowUp,
    nextQuestion: nextQ || null,
    pressureScore: session.pressureScore,
    interviewerMood: mood
  };
}

// ─── End Session ───────────────────────────────────────────────────────────────
export async function endSession(sessionId, userId) {
  const sessionDoc = await InterviewSession.findOne({ id: sessionId, userId });
  const session = serializeSession(sessionDoc);
  if (!session) throw new Error('Session not found');

  session.endedAt = new Date().toISOString();
  const baseSummary = summarizeSession(session);

  // Enhance with AI narrative if available
  let aiNarrative = null;
  if (hasAI() && session.transcript.length > 0) {
    aiNarrative = await generateSessionSummaryWithAI({
      transcript: session.transcript,
      role: session.role,
      candidateName: session.candidateName
    });
  }

  session.summary = { ...baseSummary, ...(aiNarrative || {}) };
  sessionDoc.endedAt = session.endedAt;
  sessionDoc.summary = session.summary;
  await sessionDoc.save();
  return session.summary;
}

// ─── List Sessions ─────────────────────────────────────────────────────────────
export async function listSessions(userId) {
  const sessions = await InterviewSession.find({ userId }).sort({ createdAt: -1 });
  return sessions.map((session) => {
    const s = serializeSession(session);
    return {
      id: s.id,
      createdAt: s.createdAt,
      endedAt: s.endedAt,
      role: s.role,
      candidateName: s.candidateName,
      difficulty: s.difficulty,
      summary: s.summary,
      transcript: s.transcript || [],
      interviewMode: s.interviewMode,
      persona: s.persona
    };
  });
}
