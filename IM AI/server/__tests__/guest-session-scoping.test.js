import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { setupTestDb, teardownTestDb, clearCollections } from './helpers/db.js';
import { getApp } from './helpers/testApp.js';
import { decodeToken } from './helpers/jwt.js';

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

async function mintGuest(ip) {
  const res = await request(app).post('/api/auth/guest').set('X-Forwarded-For', ip);
  expect(res.status).toBe(200);
  return res.body.token;
}

function startPayload() {
  return {
    role: 'software-engineer',
    candidateName: 'Test Candidate'
  };
}

async function createUser({ username, email } = {}) {
  const passwordHash = await bcrypt.hash('Password1!', 12);
  return User.create({
    fullName: 'Real User',
    username: username || `u${Math.random().toString(36).slice(2, 8)}`,
    normalizedUsername: username || `u${Math.random().toString(36).slice(2, 8)}`,
    email: email || `u-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
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

describe('Guest session scoping', () => {
  it('mints different guestId claims for different guest tokens', async () => {
    const tokenA = await mintGuest('30.0.0.1');
    const tokenB = await mintGuest('30.0.0.2');
    const decodedA = decodeToken(tokenA);
    const decodedB = decodeToken(tokenB);
    expect(decodedA.guestId).toBeTruthy();
    expect(decodedB.guestId).toBeTruthy();
    expect(decodedA.guestId).not.toBe(decodedB.guestId);
  });

  it("guest B's session list does not include guest A's session", async () => {
    const tokenA = await mintGuest('30.0.0.3');
    const tokenB = await mintGuest('30.0.0.4');

    const startRes = await request(app)
      .post('/api/interview/start')
      .set('Authorization', `Bearer ${tokenA}`)
      .send(startPayload());
    expect(startRes.status).toBe(201);
    const sessionId = startRes.body.session.id;

    const listRes = await request(app)
      .get('/api/interview/sessions')
      .set('Authorization', `Bearer ${tokenB}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.some((s) => s.id === sessionId)).toBe(false);
  }, 30000);

  it("guest B's GET /sessions/:id on guest A's session returns 404", async () => {
    const tokenA = await mintGuest('30.0.0.5');
    const tokenB = await mintGuest('30.0.0.6');

    const startRes = await request(app)
      .post('/api/interview/start')
      .set('Authorization', `Bearer ${tokenA}`)
      .send(startPayload());
    const sessionId = startRes.body.session.id;

    const getRes = await request(app)
      .get(`/api/interview/sessions/${sessionId}`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(getRes.status).toBe(404);
  }, 30000);

  it("guest B cannot POST /answer against guest A's session", async () => {
    const tokenA = await mintGuest('30.0.0.7');
    const tokenB = await mintGuest('30.0.0.8');

    const startRes = await request(app)
      .post('/api/interview/start')
      .set('Authorization', `Bearer ${tokenA}`)
      .send(startPayload());
    const sessionId = startRes.body.session.id;

    const answerRes = await request(app)
      .post('/api/interview/answer')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ sessionId, answer: 'This is my answer to your question.' });
    expect(answerRes.status).toBe(500);
    expect(answerRes.body.analysis).toBeUndefined();
  }, 30000);

  it("guest B cannot POST /end against guest A's session", async () => {
    const tokenA = await mintGuest('30.0.0.9');
    const tokenB = await mintGuest('30.0.0.10');

    const startRes = await request(app)
      .post('/api/interview/start')
      .set('Authorization', `Bearer ${tokenA}`)
      .send(startPayload());
    const sessionId = startRes.body.session.id;

    const endRes = await request(app)
      .post('/api/interview/end')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ sessionId });
    expect(endRes.status).toBe(500);
    expect(endRes.body.overallScore).toBeUndefined();
  }, 30000);

  it('a hand-signed guest token with no guestId claim gets 401', async () => {
    const legacyToken = jwt.sign(
      { username: 'guest_legacy', isGuest: true },
      process.env.JWT_SECRET,
      { expiresIn: '45m' }
    );

    const res = await request(app)
      .get('/api/interview/sessions')
      .set('Authorization', `Bearer ${legacyToken}`);
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('guest A can see their own session in their own list', async () => {
    const tokenA = await mintGuest('30.0.0.11');

    const startRes = await request(app)
      .post('/api/interview/start')
      .set('Authorization', `Bearer ${tokenA}`)
      .send(startPayload());
    const sessionId = startRes.body.session.id;

    const listRes = await request(app)
      .get('/api/interview/sessions')
      .set('Authorization', `Bearer ${tokenA}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.some((s) => s.id === sessionId)).toBe(true);
  }, 30000);

  it('a real authenticated user still has sessions correctly scoped by userId', async () => {
    const userA = await createUser();
    const userB = await createUser();
    const tokenA = tokenFor(userA);
    const tokenB = tokenFor(userB);

    const startRes = await request(app)
      .post('/api/interview/start')
      .set('Authorization', `Bearer ${tokenA}`)
      .send(startPayload());
    expect(startRes.status).toBe(201);
    const sessionId = startRes.body.session.id;

    const ownListRes = await request(app)
      .get('/api/interview/sessions')
      .set('Authorization', `Bearer ${tokenA}`);
    expect(ownListRes.body.some((s) => s.id === sessionId)).toBe(true);

    const otherListRes = await request(app)
      .get('/api/interview/sessions')
      .set('Authorization', `Bearer ${tokenB}`);
    expect(otherListRes.body.some((s) => s.id === sessionId)).toBe(false);

    const otherGetRes = await request(app)
      .get(`/api/interview/sessions/${sessionId}`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(otherGetRes.status).toBe(404);
  }, 30000);
});
