import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { setupTestDb, teardownTestDb, clearCollections } from './helpers/db.js';
import { getApp } from './helpers/testApp.js';

let app;
let User;

beforeAll(async () => {
  await setupTestDb();
  app = await getApp();
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

function startPayload() {
  return { role: 'software-engineer', candidateName: 'Test Candidate' };
}

async function startSession(token) {
  const res = await request(app)
    .post('/api/interview/start')
    .set('Authorization', `Bearer ${token}`)
    .send(startPayload());
  expect(res.status).toBe(201);
  return res.body.session.id;
}

async function answerOnce(token, sessionId) {
  await request(app)
    .post('/api/interview/answer')
    .set('Authorization', `Bearer ${token}`)
    .send({ sessionId, answer: 'A reasonably detailed answer to the interview question.' });
}

describe('GET /api/interview/sessions — transcript trimming', () => {
  it('never includes a transcript field on any list item, even after answering questions', async () => {
    const user = await createUser();
    const token = tokenFor(user);
    const sessionId = await startSession(token);
    await answerOnce(token, sessionId);

    const listRes = await request(app)
      .get('/api/interview/sessions')
      .set('Authorization', `Bearer ${token}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.length).toBeGreaterThan(0);
    listRes.body.forEach((item) => {
      expect(item).not.toHaveProperty('transcript');
    });
  }, 30000);

  it('list items retain all other expected fields', async () => {
    const user = await createUser();
    const token = tokenFor(user);
    const sessionId = await startSession(token);

    const listRes = await request(app)
      .get('/api/interview/sessions')
      .set('Authorization', `Bearer ${token}`);
    const item = listRes.body.find((s) => s.id === sessionId);
    expect(item).toBeDefined();
    expect(item).toMatchObject({
      id: sessionId,
      role: 'software-engineer',
      candidateName: 'Test Candidate'
    });
    expect(item).toHaveProperty('createdAt');
    expect(item).toHaveProperty('endedAt');
    expect(item).toHaveProperty('difficulty');
    expect(item).toHaveProperty('summary');
    expect(item).toHaveProperty('interviewMode');
    expect(item).toHaveProperty('persona');
  }, 30000);

  it('GET /sessions/:id (single session) still returns the full transcript', async () => {
    const user = await createUser();
    const token = tokenFor(user);
    const sessionId = await startSession(token);
    await answerOnce(token, sessionId);

    const getRes = await request(app)
      .get(`/api/interview/sessions/${sessionId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(getRes.status).toBe(200);
    expect(Array.isArray(getRes.body.transcript)).toBe(true);
    expect(getRes.body.transcript.length).toBeGreaterThan(0);
    expect(getRes.body.transcript[0]).toHaveProperty('question');
    expect(getRes.body.transcript[0]).toHaveProperty('answer');
  }, 30000);

  it('a session with zero transcript entries does not break the list or single-session endpoint', async () => {
    const user = await createUser();
    const token = tokenFor(user);
    const sessionId = await startSession(token);

    const listRes = await request(app)
      .get('/api/interview/sessions')
      .set('Authorization', `Bearer ${token}`);
    expect(listRes.status).toBe(200);
    const item = listRes.body.find((s) => s.id === sessionId);
    expect(item).toBeDefined();
    expect(item).not.toHaveProperty('transcript');

    const getRes = await request(app)
      .get(`/api/interview/sessions/${sessionId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.transcript).toEqual([]);
  }, 30000);

  it('ownership scoping still applies — a user only sees their own sessions in the trimmed list', async () => {
    const owner = await createUser();
    const other = await createUser();
    const ownerToken = tokenFor(owner);
    const otherToken = tokenFor(other);
    const sessionId = await startSession(ownerToken);

    const otherListRes = await request(app)
      .get('/api/interview/sessions')
      .set('Authorization', `Bearer ${otherToken}`);
    expect(otherListRes.body.some((s) => s.id === sessionId)).toBe(false);

    const ownerListRes = await request(app)
      .get('/api/interview/sessions')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(ownerListRes.body.some((s) => s.id === sessionId)).toBe(true);
  }, 30000);

  it('ownership scoping still applies on the single-session endpoint — other users get 404', async () => {
    const owner = await createUser();
    const other = await createUser();
    const ownerToken = tokenFor(owner);
    const otherToken = tokenFor(other);
    const sessionId = await startSession(ownerToken);

    const getRes = await request(app)
      .get(`/api/interview/sessions/${sessionId}`)
      .set('Authorization', `Bearer ${otherToken}`);
    expect(getRes.status).toBe(404);
  }, 30000);
});
