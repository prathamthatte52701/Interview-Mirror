import { nanoid } from 'nanoid';
import { questionBank, personaProfiles } from './questionBank.js';
import { analyzeAnswer, summarizeSession } from './scoring.js';
import { computeDeliveryMetrics } from './speechMetrics.js';
import InterviewSession from '../models/InterviewSession.js';
import {
  hasAI,
  generateAnalysisWithAI,
  generateFollowUpWithAI,
  generateDynamicQuestion,
  generateSessionSummaryWithAI,
  analyzeResumeConsistency
} from './aiProvider.js';

function buildScopeFilter({ userId, guestId }) {
  if (userId) return { userId };
  if (guestId) return { guestId };
  return { _id: null }; // no identity at all → match nothing, never fall back to userId:null
}

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

// ─── Session Length Mode ───────────────────────────────────────────────────────
// 'full' is the original, unbounded (manually-ended) behavior. 'quick' caps total
// questions and follow-up depth for a short warm-up session.
const MAX_ADAPTIVE_FOLLOW_UPS_FULL = 2;
const MAX_ADAPTIVE_FOLLOW_UPS_QUICK = 1;
const QUICK_MODE_MAX_QUESTIONS = 4;
const LOW_SCORE_FOLLOW_UP_THRESHOLD = 4.8;

export function normalizeSessionLength(value) {
  return value === 'quick' ? 'quick' : 'full';
}

function maxAdaptiveFollowUps(session) {
  return session.sessionLength === 'quick' ? MAX_ADAPTIVE_FOLLOW_UPS_QUICK : MAX_ADAPTIVE_FOLLOW_UPS_FULL;
}

function adaptiveFollowUpCount(session) {
  return (session.transcript || []).filter((entry) => entry.questionMeta?.isAdaptiveFollowUp).length;
}

function shouldAskAdaptiveFollowUp(session, analysis) {
  const overall = Number(analysis?.metrics?.overall ?? 0);
  const wordCount = Number(analysis?.wordCount ?? 0);
  const currentIsFollowUp = Boolean(session.currentMeta?.isAdaptiveFollowUp);

  return !currentIsFollowUp
    && adaptiveFollowUpCount(session) < maxAdaptiveFollowUps(session)
    && (overall > 0 && overall <= LOW_SCORE_FOLLOW_UP_THRESHOLD || wordCount > 0 && wordCount < 25);
}

function quickModeCapReached(session) {
  return session.sessionLength === 'quick' && session.askedQuestions.length >= QUICK_MODE_MAX_QUESTIONS;
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
    guestId: payload.guestId || null,
    createdAt: new Date().toISOString(),
    role: payload.role,
    candidateName: payload.candidateName,
    interviewMode: payload.interviewMode || 'mixed',
    difficulty: payload.difficulty || 'medium',
    persona: payload.persona || 'calm-senior-interviewer',
    pressureMode: payload.pressureMode || 'balanced',
    sessionLength: normalizeSessionLength(payload.sessionLength),
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

export async function getSession(sessionId, scope) {
  const session = await InterviewSession.findOne({ id: sessionId, ...buildScopeFilter(scope) });
  return serializeSession(session);
}

export async function liveAnalyzeAnswer(sessionId, answer, meta = {}) {
  const session = await getSession(sessionId, { userId: meta.userId, guestId: meta.guestId });
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
  const sessionDoc = await InterviewSession.findOne({ id: sessionId, ...buildScopeFilter({ userId: meta.userId, guestId: meta.guestId }) });
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
  const capReached = quickModeCapReached(session);
  const askAdaptiveFollowUp = !capReached && Boolean(shouldAskAdaptiveFollowUp(session, analysis) && followUp);

  if (capReached) {
    nextQ = null;
    nextMeta = null;
  } else if (askAdaptiveFollowUp) {
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

// ─── Score Deltas (vs. last time in the same domain) ────────────────────────────
const SCORE_DIMENSION_KEYS = ['relevance', 'clarity', 'structure', 'specificity', 'confidence', 'delivery', 'roleFit'];

async function findPreviousSameDomainSession(session, scope) {
  const previous = await InterviewSession.findOne({
    ...buildScopeFilter(scope),
    role: session.role,
    id: { $ne: session.id },
    endedAt: { $ne: null }
  }).sort({ createdAt: -1 });
  return previous ? serializeSession(previous) : null;
}

function computeScoreDeltas(currentMetrics, previousMetrics) {
  if (!currentMetrics || !previousMetrics) return null;

  const deltas = {};
  let hasAny = false;
  SCORE_DIMENSION_KEYS.forEach((key) => {
    const curr = currentMetrics[key];
    const prev = previousMetrics[key];
    if (Number.isFinite(curr) && Number.isFinite(prev)) {
      deltas[key] = +(curr - prev).toFixed(1);
      hasAny = true;
    }
  });
  return hasAny ? deltas : null;
}

// ─── End Session ───────────────────────────────────────────────────────────────
export async function endSession(sessionId, scope) {
  const sessionDoc = await InterviewSession.findOne({ id: sessionId, ...buildScopeFilter(scope) });
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
  session.summary.deliveryMetrics = computeDeliveryMetrics(session.transcript);
  session.summary.resumeConsistencyFlags = await analyzeResumeConsistency(session.resumeText, session.transcript);

  const previousSameDomain = await findPreviousSameDomainSession(session, scope);
  session.summary.scoreDeltas = computeScoreDeltas(
    session.summary.averageMetrics,
    previousSameDomain?.summary?.averageMetrics
  );

  sessionDoc.endedAt = session.endedAt;
  sessionDoc.summary = session.summary;
  await sessionDoc.save();
  return session.summary;
}

// ─── Delete Session ────────────────────────────────────────────────────────────
export async function deleteSession(sessionId, scope) {
  const scopeFilter = buildScopeFilter(scope);
  const existing = await InterviewSession.findOne({ id: sessionId, ...scopeFilter });
  if (!existing) throw new Error('Session not found');
  await InterviewSession.deleteOne({ id: sessionId, ...scopeFilter });
}

// ─── Claim Session ─────────────────────────────────────────────────────────────
export async function claimSession(sessionId, userId) {
  const sessionDoc = await InterviewSession.findOne({ id: sessionId });
  if (!sessionDoc) throw new Error('Session not found');
  if (sessionDoc.userId) throw new Error('Session already claimed');

  sessionDoc.userId = userId;
  sessionDoc.guestId = null;
  await sessionDoc.save();
  return serializeSession(sessionDoc);
}

// ─── List Sessions ─────────────────────────────────────────────────────────────
export async function listSessions(scope) {
  const sessions = await InterviewSession.find(buildScopeFilter(scope)).sort({ createdAt: -1 });
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
      interviewMode: s.interviewMode,
      persona: s.persona,
      sessionLength: s.sessionLength
    };
  });
}

// ─── Bookmarks ─────────────────────────────────────────────────────────────────
export async function toggleBookmark(sessionId, questionIndex, bookmarked, scope) {
  const idx = Number(questionIndex);
  if (!Number.isInteger(idx) || idx < 0) throw new Error('Session not found');

  const updated = await InterviewSession.findOneAndUpdate(
    { id: sessionId, ...buildScopeFilter(scope), [`transcript.${idx}`]: { $exists: true } },
    { $set: { [`transcript.${idx}.bookmarked`]: Boolean(bookmarked) } },
    { returnDocument: 'after' }
  );
  if (!updated) throw new Error('Session not found');
  return serializeSession(updated);
}

export async function listBookmarks(scope) {
  const sessions = await InterviewSession.find({
    ...buildScopeFilter(scope),
    'transcript.bookmarked': true
  }).sort({ createdAt: -1 });

  const bookmarks = [];
  sessions.forEach((sessionDoc) => {
    const s = serializeSession(sessionDoc);
    (s.transcript || []).forEach((entry, questionIndex) => {
      if (entry.bookmarked) {
        bookmarks.push({
          sessionId: s.id,
          questionIndex,
          question: entry.question,
          answer: entry.answer,
          role: s.role,
          difficulty: s.difficulty,
          candidateName: s.candidateName,
          sessionCreatedAt: s.createdAt
        });
      }
    });
  });
  return bookmarks;
}
