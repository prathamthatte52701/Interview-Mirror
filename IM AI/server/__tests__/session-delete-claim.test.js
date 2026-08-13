import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { setupTestDb, teardownTestDb, clearCollections } from './helpers/db.js';
import { getApp } from './helpers/testApp.js';

let app;
let User;
let InterviewSession;

beforeAll(async () => {
  await setupTestDb();
  app = await getApp();
  User = (await import('../models/User.js')).default;
  InterviewSession = (await import('../models/InterviewSession.js')).default;
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

async function startSession(token) {
  const res = await request(app)
    .post('/api/interview/start')
    .set('Authorization', `Bearer ${token}`)
    .send(startPayload());
  expect(res.status).toBe(201);
  return res.body.session.id;
}

describe('DELETE /api/interview/sessions/:id', () => {
  it('owner (real user) can delete their own session', async () => {
    const user = await createUser();
    const token = tokenFor(user);
    const sessionId = await startSession(token);

    const delRes = await request(app)
      .delete(`/api/interview/sessions/${sessionId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(delRes.status).toBe(200);
    expect(delRes.body.success).toBe(true);
  }, 30000);

  it('deleted session no longer appears in GET /sessions and GET /sessions/:id returns 404', async () => {
    const user = await createUser();
    const token = tokenFor(user);
    const sessionId = await startSession(token);

    await request(app)
      .delete(`/api/interview/sessions/${sessionId}`)
      .set('Authorization', `Bearer ${token}`);

    const listRes = await request(app)
      .get('/api/interview/sessions')
      .set('Authorization', `Bearer ${token}`);
    expect(listRes.body.some((s) => s.id === sessionId)).toBe(false);

    const getRes = await request(app)
      .get(`/api/interview/sessions/${sessionId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(getRes.status).toBe(404);
  }, 30000);

  it('a different user cannot delete someone else\'s session', async () => {
    const owner = await createUser();
    const intruder = await createUser();
    const ownerToken = tokenFor(owner);
    const intruderToken = tokenFor(intruder);
    const sessionId = await startSession(ownerToken);

    const delRes = await request(app)
      .delete(`/api/interview/sessions/${sessionId}`)
      .set('Authorization', `Bearer ${intruderToken}`);
    expect(delRes.status).toBe(404);

    const getRes = await request(app)
      .get(`/api/interview/sessions/${sessionId}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(getRes.status).toBe(200);
  }, 30000);

  it('deleting a nonexistent session id returns 404, not 500', async () => {
    const user = await createUser();
    const token = tokenFor(user);

    const delRes = await request(app)
      .delete('/api/interview/sessions/does-not-exist')
      .set('Authorization', `Bearer ${token}`);
    expect(delRes.status).toBe(404);
  });

  it('a guest can delete their own guest-scoped session', async () => {
    const guestToken = await mintGuest('31.0.0.1');
    const sessionId = await startSession(guestToken);

    const delRes = await request(app)
      .delete(`/api/interview/sessions/${sessionId}`)
      .set('Authorization', `Bearer ${guestToken}`);
    expect(delRes.status).toBe(200);
    expect(delRes.body.success).toBe(true);

    const getRes = await request(app)
      .get(`/api/interview/sessions/${sessionId}`)
      .set('Authorization', `Bearer ${guestToken}`);
    expect(getRes.status).toBe(404);
  }, 30000);
});

describe('POST /api/interview/sessions/:id/claim', () => {
  it('a real user can claim an unclaimed guest session', async () => {
    const guestToken = await mintGuest('31.0.0.2');
    const sessionId = await startSession(guestToken);

    const user = await createUser();
    const userToken = tokenFor(user);

    const claimRes = await request(app)
      .post(`/api/interview/sessions/${sessionId}/claim`)
      .set('Authorization', `Bearer ${userToken}`);
    expect(claimRes.status).toBe(200);
    expect(claimRes.body.success).toBe(true);

    const listRes = await request(app)
      .get('/api/interview/sessions')
      .set('Authorization', `Bearer ${userToken}`);
    expect(listRes.body.some((s) => s.id === sessionId)).toBe(true);
  }, 30000);

  it('claiming an already-owned session is rejected with 409', async () => {
    const owner = await createUser();
    const ownerToken = tokenFor(owner);
    const sessionId = await startSession(ownerToken);

    const claimant = await createUser();
    const claimantToken = tokenFor(claimant);

    const claimRes = await request(app)
      .post(`/api/interview/sessions/${sessionId}/claim`)
      .set('Authorization', `Bearer ${claimantToken}`);
    expect(claimRes.status).toBe(409);
  }, 30000);

  it('claiming a nonexistent session id returns 404', async () => {
    const user = await createUser();
    const token = tokenFor(user);

    const claimRes = await request(app)
      .post('/api/interview/sessions/does-not-exist/claim')
      .set('Authorization', `Bearer ${token}`);
    expect(claimRes.status).toBe(404);
  });

  it('rate limit trips after 5 claim attempts/hour from the same user', async () => {
    const user = await createUser();
    const token = tokenFor(user);

    for (let i = 0; i < 5; i++) {
      const res = await request(app)
        .post('/api/interview/sessions/does-not-exist/claim')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).not.toBe(429);
    }

    const sixth = await request(app)
      .post('/api/interview/sessions/does-not-exist/claim')
      .set('Authorization', `Bearer ${token}`);
    expect(sixth.status).toBe(429);
    expect(sixth.body).toEqual({ success: false, message: 'Too many requests. Please try again later.' });
  }, 30000);

  it('a guest token cannot call the claim endpoint (403, not treated as userId: null)', async () => {
    const guestTokenA = await mintGuest('31.0.0.3');
    const sessionId = await startSession(guestTokenA);

    const guestTokenB = await mintGuest('31.0.0.4');
    const claimRes = await request(app)
      .post(`/api/interview/sessions/${sessionId}/claim`)
      .set('Authorization', `Bearer ${guestTokenB}`);
    expect(claimRes.status).toBe(403);
  }, 30000);

  it('guestId is cleared after a successful claim', async () => {
    const guestToken = await mintGuest('31.0.0.5');
    const sessionId = await startSession(guestToken);

    const user = await createUser();
    const userToken = tokenFor(user);

    await request(app)
      .post(`/api/interview/sessions/${sessionId}/claim`)
      .set('Authorization', `Bearer ${userToken}`);

    const doc = await InterviewSession.findOne({ id: sessionId });
    expect(String(doc.userId)).toBe(String(user._id));
    expect(doc.guestId).toBeNull();
  }, 30000);
});
