import { describe, it, expect, beforeAll, afterEach, afterAll, vi } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { setupTestDb, teardownTestDb, clearCollections } from './helpers/db.js';

vi.mock('../lib/aiProvider.js', () => ({
  hasAI: () => true,
  generateAnalysisWithAI: vi.fn().mockResolvedValue(null),
  generateFollowUpWithAI: vi.fn().mockResolvedValue(null),
  generateDynamicQuestion: vi.fn().mockResolvedValue(null),
  generateSessionSummaryWithAI: vi.fn().mockResolvedValue(null),
  analyzeResumeConsistency: vi.fn().mockResolvedValue(null)
}));

let app;
let User;
let createSession;
let answerQuestion;
let getSession;
let listSessions;

beforeAll(async () => {
  await setupTestDb();
  const mod = await import('../app.js');
  app = mod.default;
  User = (await import('../models/User.js')).default;
  ({ createSession, answerQuestion, getSession, listSessions } = await import('../lib/sessionEngine.js'));
}, 60000);

afterEach(async () => {
  await clearCollections();
});

afterAll(async () => {
  await teardownTestDb();
});

async function createUser() {
  const passwordHash = await bcrypt.hash('Password1!', 12);
  return User.create({
    fullName: 'Real User',
    username: `u${Math.random().toString(36).slice(2, 8)}`,
    normalizedUsername: `u${Math.random().toString(36).slice(2, 8)}`,
    email: `u-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
    passwordHash,
    contactNumber: '9876543210',
    role: 'user',
    status: 'active'
  });
}

function tokenFor(user) {
  return jwt.sign(
    { userId: String(user._id), username: user.username, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

async function mintGuest() {
  const res = await request(app).post('/api/auth/guest').set('X-Forwarded-For', `10.${Math.floor(Math.random() * 250)}.0.1`);
  expect(res.status).toBe(200);
  return res.body.token;
}

const SHORT_ANSWER = 'no'; // <8 words -> heuristic scorer always flags it as low-quality, making it follow-up-eligible

async function answerUntilNoQuestion(userId, sessionId, maxRounds = 8) {
  const rounds = [];
  for (let i = 0; i < maxRounds; i++) {
    const result = await answerQuestion(sessionId, SHORT_ANSWER, { userId });
    rounds.push(result);
    if (!result.nextQuestion) break;
  }
  return rounds;
}

describe('session length mode — question count and follow-up caps', () => {
  it('quick mode ends after the reduced question count, not the full-mode count', async () => {
    const user = await createUser();
    const { session } = await createSession({
      userId: user._id, role: 'software-engineer', candidateName: 'Q', sessionLength: 'quick'
    });

    const rounds = await answerUntilNoQuestion(user._id, session.id);

    expect(rounds).toHaveLength(4); // QUICK_MODE_MAX_QUESTIONS
    expect(rounds.at(-1).nextQuestion).toBeNull();
  });

  it('full mode behaves exactly as before — not capped at the quick-mode count (regression check)', async () => {
    const user = await createUser();
    const { session } = await createSession({
      userId: user._id, role: 'software-engineer', candidateName: 'F', sessionLength: 'full'
    });

    const rounds = await answerUntilNoQuestion(user._id, session.id, 6);

    expect(rounds).toHaveLength(6);
    expect(rounds.every((r) => r.nextQuestion)).toBe(true);
  });

  it('a session created with no sessionLength field defaults to full-mode behavior (older client)', async () => {
    const user = await createUser();
    const { session } = await createSession({
      userId: user._id, role: 'software-engineer', candidateName: 'D'
    });

    expect(session.sessionLength).toBe('full');

    const rounds = await answerUntilNoQuestion(user._id, session.id, 6);
    expect(rounds).toHaveLength(6);
    expect(rounds.every((r) => r.nextQuestion)).toBe(true);
  });

  it('follow-up count is capped lower in quick mode (1) than full mode (2)', async () => {
    const quickUser = await createUser();
    const { session: quickSession } = await createSession({
      userId: quickUser._id, role: 'software-engineer', candidateName: 'Q', sessionLength: 'quick'
    });
    const quickRounds = await answerUntilNoQuestion(quickUser._id, quickSession.id);
    expect(quickRounds.filter((r) => r.adaptiveFollowUp)).toHaveLength(1);

    const fullUser = await createUser();
    const { session: fullSession } = await createSession({
      userId: fullUser._id, role: 'software-engineer', candidateName: 'F', sessionLength: 'full'
    });
    const fullRounds = await answerUntilNoQuestion(fullUser._id, fullSession.id, 6);
    expect(fullRounds.filter((r) => r.adaptiveFollowUp)).toHaveLength(2);
  });

  it('the stored session document reflects which mode was used, for history/dashboard display', async () => {
    const user = await createUser();
    const { session } = await createSession({
      userId: user._id, role: 'software-engineer', candidateName: 'Q', sessionLength: 'quick'
    });

    const fetched = await getSession(session.id, { userId: user._id });
    expect(fetched.sessionLength).toBe('quick');

    const list = await listSessions({ userId: user._id });
    expect(list.find((s) => s.id === session.id).sessionLength).toBe('quick');
  });
});

describe('session length mode — guest enforcement (server-side)', () => {
  function startPayload(overrides = {}) {
    return { role: 'software-engineer', candidateName: 'Guest Candidate', ...overrides };
  }

  it('a guest requesting sessionLength: "full" is rejected with GUEST_FULL_NOT_ALLOWED and no session is created', async () => {
    const guestToken = await mintGuest();

    const res = await request(app)
      .post('/api/interview/start')
      .set('Authorization', `Bearer ${guestToken}`)
      .send(startPayload({ sessionLength: 'full' }));

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('GUEST_FULL_NOT_ALLOWED');
    expect(res.body.session).toBeUndefined();
  });

  it('a guest requesting sessionLength: "quick" succeeds normally', async () => {
    const guestToken = await mintGuest();

    const res = await request(app)
      .post('/api/interview/start')
      .set('Authorization', `Bearer ${guestToken}`)
      .send(startPayload({ sessionLength: 'quick' }));

    expect(res.status).toBe(201);
    expect(res.body.session.sessionLength).toBe('quick');
  });

  it('a guest omitting sessionLength succeeds and is forced to quick, not full', async () => {
    const guestToken = await mintGuest();

    const res = await request(app)
      .post('/api/interview/start')
      .set('Authorization', `Bearer ${guestToken}`)
      .send(startPayload());

    expect(res.status).toBe(201);
    expect(res.body.session.sessionLength).toBe('quick');
  });

  it('a real authenticated (non-guest) user requesting "full" is never blocked by the guest check (regression)', async () => {
    const user = await createUser();
    const token = tokenFor(user);

    const res = await request(app)
      .post('/api/interview/start')
      .set('Authorization', `Bearer ${token}`)
      .send(startPayload({ sessionLength: 'full' }));

    expect(res.status).toBe(201);
    expect(res.body.session.sessionLength).toBe('full');
  });
});
