import express from 'express';
import multer from 'multer';
import {
  createSession, answerQuestion, endSession,
  getSession, listSessions, liveAnalyzeAnswer,
  deleteSession, claimSession,
  toggleBookmark, listBookmarks
} from '../lib/sessionEngine.js';
import { questionBank } from '../lib/questionBank.js';
import { requireAuth } from '../middleware/auth.js';
import { makeLimiter, userKeyGenerator } from '../middleware/rateLimit.js';
import logger from '../lib/logger.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
const interviewActionLimiter = makeLimiter({
  windowMs: 60 * 60 * 1000,
  max: 20,
  prefix: 'rl:interviewAction:',
  keyGenerator: userKeyGenerator
});
const claimLimiter = makeLimiter({
  windowMs: 60 * 60 * 1000,
  max: 5,
  prefix: 'rl:claimSession:',
  keyGenerator: userKeyGenerator
});
const CONTEXT_LIMITS = {
  resumeText: 12000,
  jdText: 8000
};

function cleanContext(value = '', limit = 12000) {
  const text = String(value || '').trim();
  if (text.length <= limit) return text;
  return `${text.slice(0, limit)}\n\n[Context trimmed to keep interview setup responsive.]`;
}

// ── Sessions ────────────────────────────────────────────────────────────────────
router.get('/sessions', requireAuth, async (req, res) => {
  try {
    res.json(await listSessions({ userId: req.userId, guestId: req.guestId }));
  } catch (err) {
    logger.error('interview_sessions_error', { message: err.message });
    res.status(500).json({ error: err.message });
  }
});

router.get('/sessions/:id', requireAuth, async (req, res) => {
  const session = await getSession(req.params.id, { userId: req.userId, guestId: req.guestId });
  if (!session) return res.status(404).json({ error: 'Session not found' });
  res.json(session);
});

router.delete('/sessions/:id', requireAuth, async (req, res) => {
  try {
    await deleteSession(req.params.id, { userId: req.userId, guestId: req.guestId });
    logger.info('interview_session_deleted', {
      userId: req.userId,
      guestId: req.guestId,
      sessionId: req.params.id,
      ts: new Date().toISOString()
    });
    res.json({ success: true });
  } catch (err) {
    if (err.message === 'Session not found') return res.status(404).json({ error: err.message });
    logger.error('interview_session_delete_error', { message: err.message });
    res.status(500).json({ error: err.message });
  }
});

router.get('/bookmarks', requireAuth, async (req, res) => {
  try {
    res.json(await listBookmarks({ userId: req.userId, guestId: req.guestId }));
  } catch (err) {
    logger.error('interview_bookmarks_list_error', { message: err.message });
    res.status(500).json({ error: err.message });
  }
});

router.patch('/sessions/:id/questions/:questionIndex/bookmark', requireAuth, async (req, res) => {
  const { bookmarked } = req.body;
  if (typeof bookmarked !== 'boolean') {
    return res.status(400).json({ error: 'bookmarked (boolean) is required' });
  }
  try {
    const session = await toggleBookmark(req.params.id, req.params.questionIndex, bookmarked, { userId: req.userId, guestId: req.guestId });
    res.json({ success: true, sessionId: session.id, questionIndex: Number(req.params.questionIndex), bookmarked });
  } catch (err) {
    if (err.message === 'Session not found') return res.status(404).json({ error: err.message });
    logger.error('interview_bookmark_toggle_error', { message: err.message });
    res.status(500).json({ error: err.message });
  }
});

router.post('/sessions/:id/claim', requireAuth, claimLimiter, async (req, res) => {
  if (!req.userId) {
    return res.status(403).json({ error: 'Only registered users can claim a session.' });
  }
  try {
    await claimSession(req.params.id, req.userId);
    logger.info('interview_session_claimed', {
      userId: req.userId,
      sessionId: req.params.id,
      ts: new Date().toISOString()
    });
    res.json({ success: true });
  } catch (err) {
    if (err.message === 'Session not found') return res.status(404).json({ error: err.message });
    if (err.message === 'Session already claimed') return res.status(409).json({ error: err.message });
    logger.error('interview_session_claim_error', { message: err.message });
    res.status(500).json({ error: err.message });
  }
});

// ── Question Bank ───────────────────────────────────────────────────────────────
router.get('/question-bank', (req, res) => {
  const { role } = req.query;
  const rows = role ? questionBank.filter(q => q.role === role) : questionBank;
  res.json({ count: rows.length, questions: rows });
});

// ── Start Interview ─────────────────────────────────────────────────────────────
router.post('/start', requireAuth, interviewActionLimiter, async (req, res) => {
  const { role, candidateName, interviewMode, difficulty, persona, resumeText, jdText, pressureMode, sessionLength } = req.body;
  if (!String(role || '').trim() || !String(candidateName || '').trim()) {
    return res.status(400).json({ error: 'role and candidateName are required' });
  }

  // Guests can only ever get Quick mode — enforced here, not just hidden in the UI.
  // An explicit 'full' request from a guest is rejected outright; anything else
  // (omitted, 'quick', or garbage) is silently forced to 'quick' below.
  if (req.guestId && sessionLength === 'full') {
    return res.status(403).json({
      error: 'Guest sessions are Quick-mode only. Create a free account for full-length interviews.',
      code: 'GUEST_FULL_NOT_ALLOWED'
    });
  }

  try {
    const result = await createSession({
      userId: req.userId,
      guestId: req.guestId,
      role: String(role).trim().toLowerCase().replace(/\s+/g, '-'),
      candidateName: String(candidateName).trim(),
      interviewMode,
      difficulty,
      persona,
      resumeText: cleanContext(resumeText, CONTEXT_LIMITS.resumeText),
      jdText: cleanContext(jdText, CONTEXT_LIMITS.jdText),
      pressureMode,
      sessionLength: req.guestId ? 'quick' : sessionLength
    });
    res.status(201).json(result);
  } catch (err) {
    logger.error('interview_start_error', { message: err.message });
    res.status(500).json({ error: err.message });
  }
});

// ── Submit Answer ───────────────────────────────────────────────────────────────
router.post('/answer', requireAuth, interviewActionLimiter, async (req, res) => {
  const { sessionId, answer, responseSeconds, presenceSnapshot } = req.body;
  if (!sessionId || !answer) {
    return res.status(400).json({ error: 'sessionId and answer are required' });
  }
  try {
    const result = await answerQuestion(sessionId, answer, { responseSeconds, presenceSnapshot, userId: req.userId, guestId: req.guestId });
    res.json(result);
  } catch (err) {
    logger.error('interview_answer_error', { message: err.message });
    res.status(500).json({ error: err.message });
  }
});

// ── End Interview ───────────────────────────────────────────────────────────────
router.post('/live-analysis', requireAuth, interviewActionLimiter, async (req, res) => {
  const { sessionId, answer, responseSeconds, presenceSnapshot } = req.body;
  if (!sessionId || !String(answer || '').trim()) {
    return res.status(400).json({ error: 'sessionId and answer are required' });
  }
  try {
    const result = await liveAnalyzeAnswer(sessionId, answer, {
      responseSeconds,
      presenceSnapshot,
      userId: req.userId,
      guestId: req.guestId
    });
    res.json(result);
  } catch (err) {
    logger.error('interview_live_analysis_error', { message: err.message });
    res.status(500).json({ error: 'Unable to analyze answer right now.' });
  }
});

router.post('/end', requireAuth, async (req, res) => {
  const { sessionId } = req.body;
  if (!sessionId) return res.status(400).json({ error: 'sessionId is required' });
  try {
    const summary = await endSession(sessionId, { userId: req.userId, guestId: req.guestId });
    res.json(summary);
  } catch (err) {
    logger.error('interview_end_error', { message: err.message });
    res.status(500).json({ error: err.message });
  }
});

// ── Resume Upload ───────────────────────────────────────────────────────────────
router.post('/upload-resume', requireAuth, upload.single('resume'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  // For text files: read directly. For PDF: extract text (simplified).
  const buffer = req.file.buffer;
  const mimetype = req.file.mimetype;
  let text = '';

  if (mimetype === 'text/plain') {
    text = buffer.toString('utf-8');
  } else {
    // Basic PDF text extraction (look for readable strings)
    text = buffer.toString('latin1').replace(/[^\x20-\x7E\n]/g, ' ').replace(/\s+/g, ' ').trim();
    if (text.length < 100) {
      text = 'Resume uploaded. AI will consider the document context.';
    }
  }

  res.json({ text: text.slice(0, 3000), length: text.length });
});

export default router;
