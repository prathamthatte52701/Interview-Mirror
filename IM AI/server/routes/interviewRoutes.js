import express from 'express';
import multer from 'multer';
import {
  createSession, answerQuestion, endSession,
  getSession, listSessions, liveAnalyzeAnswer
} from '../lib/sessionEngine.js';
import { questionBank } from '../lib/questionBank.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
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
    res.json(await listSessions(req.userId));
  } catch (err) {
    console.error('[/sessions]', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/sessions/:id', requireAuth, async (req, res) => {
  const session = await getSession(req.params.id, req.userId);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  res.json(session);
});

// ── Question Bank ───────────────────────────────────────────────────────────────
router.get('/question-bank', (req, res) => {
  const { role } = req.query;
  const rows = role ? questionBank.filter(q => q.role === role) : questionBank;
  res.json({ count: rows.length, questions: rows });
});

// ── Start Interview ─────────────────────────────────────────────────────────────
router.post('/start', requireAuth, async (req, res) => {
  const { role, candidateName, interviewMode, difficulty, persona, resumeText, jdText, pressureMode } = req.body;
  if (!String(role || '').trim() || !String(candidateName || '').trim()) {
    return res.status(400).json({ error: 'role and candidateName are required' });
  }
  try {
    const result = await createSession({
      userId: req.userId,
      role: String(role).trim().toLowerCase().replace(/\s+/g, '-'),
      candidateName: String(candidateName).trim(),
      interviewMode,
      difficulty,
      persona,
      resumeText: cleanContext(resumeText, CONTEXT_LIMITS.resumeText),
      jdText: cleanContext(jdText, CONTEXT_LIMITS.jdText),
      pressureMode
    });
    res.status(201).json(result);
  } catch (err) {
    console.error('[/start]', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Submit Answer ───────────────────────────────────────────────────────────────
router.post('/answer', requireAuth, async (req, res) => {
  const { sessionId, answer, responseSeconds, presenceSnapshot } = req.body;
  if (!sessionId || !answer) {
    return res.status(400).json({ error: 'sessionId and answer are required' });
  }
  try {
    const result = await answerQuestion(sessionId, answer, { responseSeconds, presenceSnapshot, userId: req.userId });
    res.json(result);
  } catch (err) {
    console.error('[/answer]', err);
    res.status(500).json({ error: err.message });
  }
});

// ── End Interview ───────────────────────────────────────────────────────────────
router.post('/live-analysis', requireAuth, async (req, res) => {
  const { sessionId, answer, responseSeconds, presenceSnapshot } = req.body;
  if (!sessionId || !String(answer || '').trim()) {
    return res.status(400).json({ error: 'sessionId and answer are required' });
  }
  try {
    const result = await liveAnalyzeAnswer(sessionId, answer, {
      responseSeconds,
      presenceSnapshot,
      userId: req.userId
    });
    res.json(result);
  } catch (err) {
    console.error('[/live-analysis]', err);
    res.status(500).json({ error: 'Unable to analyze answer right now.' });
  }
});

router.post('/end', requireAuth, async (req, res) => {
  const { sessionId } = req.body;
  if (!sessionId) return res.status(400).json({ error: 'sessionId is required' });
  try {
    const summary = await endSession(sessionId, req.userId);
    res.json(summary);
  } catch (err) {
    console.error('[/end]', err);
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
