import { describe, it, expect, beforeAll, afterEach, afterAll, vi } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { setupTestDb, teardownTestDb, clearCollections } from './helpers/db.js';

vi.mock('../lib/aiProvider.js', () => ({
  hasAI: () => false,
  generateAnalysisWithAI: vi.fn().mockResolvedValue(null),
  generateFollowUpWithAI: vi.fn().mockResolvedValue(null),
  generateDynamicQuestion: vi.fn().mockResolvedValue(null),
  generateSessionSummaryWithAI: vi.fn().mockResolvedValue(null),
  analyzeResumeConsistency: vi.fn().mockResolvedValue(null)
}));

let app;
let User;

beforeAll(async () => {
  await setupTestDb();
  const mod = await import('../app.js');
  app = mod.default;
  User = (await import('../models/User.js')).default;
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

async function startSessionWithAnswers(token, answerCount = 2) {
  const startRes = await request(app)
    .post('/api/interview/start')
    .set('Authorization', `Bearer ${token}`)
    .send({ role: 'software-engineer', candidateName: 'Test Candidate' });
  expect(startRes.status).toBe(201);
  const sessionId = startRes.body.session.id;

  for (let i = 0; i < answerCount; i++) {
    await request(app)
      .post('/api/interview/answer')
      .set('Authorization', `Bearer ${token}`)
      .send({ sessionId, answer: `A reasonably detailed answer number ${i} to the interview question.` });
  }

  return sessionId;
}

describe('question bookmarking', () => {
  it('bookmarking a question sets the flag correctly and only on that specific question', async () => {
    const user = await createUser();
    const token = tokenFor(user);
    const sessionId = await startSessionWithAnswers(token, 2);

    const patchRes = await request(app)
      .patch(`/api/interview/sessions/${sessionId}/questions/0/bookmark`)
      .set('Authorization', `Bearer ${token}`)
      .send({ bookmarked: true });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.bookmarked).toBe(true);

    const getRes = await request(app)
      .get(`/api/interview/sessions/${sessionId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(getRes.body.transcript[0].bookmarked).toBe(true);
    expect(getRes.body.transcript[1].bookmarked).toBe(false);
  });

  it('un-bookmarking (toggling back to false) works', async () => {
    const user = await createUser();
    const token = tokenFor(user);
    const sessionId = await startSessionWithAnswers(token, 1);

    await request(app)
      .patch(`/api/interview/sessions/${sessionId}/questions/0/bookmark`)
      .set('Authorization', `Bearer ${token}`)
      .send({ bookmarked: true });

    const unsetRes = await request(app)
      .patch(`/api/interview/sessions/${sessionId}/questions/0/bookmark`)
      .set('Authorization', `Bearer ${token}`)
      .send({ bookmarked: false });
    expect(unsetRes.status).toBe(200);

    const getRes = await request(app)
      .get(`/api/interview/sessions/${sessionId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(getRes.body.transcript[0].bookmarked).toBe(false);
  });

  it('a user cannot bookmark a question in someone else\'s session', async () => {
    const owner = await createUser();
    const attacker = await createUser();
    const ownerToken = tokenFor(owner);
    const attackerToken = tokenFor(attacker);
    const sessionId = await startSessionWithAnswers(ownerToken, 1);

    const res = await request(app)
      .patch(`/api/interview/sessions/${sessionId}/questions/0/bookmark`)
      .set('Authorization', `Bearer ${attackerToken}`)
      .send({ bookmarked: true });
    expect([403, 404]).toContain(res.status);

    const getRes = await request(app)
      .get(`/api/interview/sessions/${sessionId}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(getRes.body.transcript[0].bookmarked).toBe(false);
  });

  it('GET /bookmarks returns only the requesting user\'s bookmarked questions, aggregated across multiple sessions', async () => {
    const user = await createUser();
    const token = tokenFor(user);
    const sessionA = await startSessionWithAnswers(token, 2);
    const sessionB = await startSessionWithAnswers(token, 1);

    await request(app).patch(`/api/interview/sessions/${sessionA}/questions/0/bookmark`).set('Authorization', `Bearer ${token}`).send({ bookmarked: true });
    await request(app).patch(`/api/interview/sessions/${sessionA}/questions/1/bookmark`).set('Authorization', `Bearer ${token}`).send({ bookmarked: true });
    await request(app).patch(`/api/interview/sessions/${sessionB}/questions/0/bookmark`).set('Authorization', `Bearer ${token}`).send({ bookmarked: true });

    const other = await createUser();
    const otherToken = tokenFor(other);
    const otherSession = await startSessionWithAnswers(otherToken, 1);
    await request(app).patch(`/api/interview/sessions/${otherSession}/questions/0/bookmark`).set('Authorization', `Bearer ${otherToken}`).send({ bookmarked: true });

    const res = await request(app).get('/api/interview/bookmarks').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(3);
    expect(res.body.every((b) => [sessionA, sessionB].includes(b.sessionId))).toBe(true);
    expect(res.body.some((b) => b.sessionId === otherSession)).toBe(false);
  });

  it('a user with zero bookmarks gets an empty array, not an error', async () => {
    const user = await createUser();
    const token = tokenFor(user);
    await startSessionWithAnswers(token, 1);

    const res = await request(app).get('/api/interview/bookmarks').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('a guest can bookmark their own session\'s questions and retrieve them', async () => {
    const guestToken = await mintGuest();
    const sessionId = await startSessionWithAnswers(guestToken, 1);

    const patchRes = await request(app)
      .patch(`/api/interview/sessions/${sessionId}/questions/0/bookmark`)
      .set('Authorization', `Bearer ${guestToken}`)
      .send({ bookmarked: true });
    expect(patchRes.status).toBe(200);

    const res = await request(app).get('/api/interview/bookmarks').set('Authorization', `Bearer ${guestToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].sessionId).toBe(sessionId);
  });

  it('a guest cannot bookmark another guest\'s session (regression check on guest scoping)', async () => {
    const guestAToken = await mintGuest();
    const guestBToken = await mintGuest();
    const sessionId = await startSessionWithAnswers(guestAToken, 1);

    const res = await request(app)
      .patch(`/api/interview/sessions/${sessionId}/questions/0/bookmark`)
      .set('Authorization', `Bearer ${guestBToken}`)
      .send({ bookmarked: true });
    expect([403, 404]).toContain(res.status);

    const guestBBookmarks = await request(app).get('/api/interview/bookmarks').set('Authorization', `Bearer ${guestBToken}`);
    expect(guestBBookmarks.body).toEqual([]);
  });
});
