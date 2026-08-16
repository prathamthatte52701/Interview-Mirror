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

describe('endSession — delivery metrics', () => {
  it('stores deliveryMetrics on the session summary for a newly-ended session', async () => {
    const user = await createUser();
    const token = tokenFor(user);

    const startRes = await request(app)
      .post('/api/interview/start')
      .set('Authorization', `Bearer ${token}`)
      .send({ role: 'software-engineer', candidateName: 'Test Candidate' });
    const sessionId = startRes.body.session.id;

    await request(app)
      .post('/api/interview/answer')
      .set('Authorization', `Bearer ${token}`)
      .send({ sessionId, answer: 'Um, so I basically worked on this, you know, project.' });

    const endRes = await request(app)
      .post('/api/interview/end')
      .set('Authorization', `Bearer ${token}`)
      .send({ sessionId });

    expect(endRes.status).toBe(200);
    expect(endRes.body.deliveryMetrics).toBeDefined();
    expect(endRes.body.deliveryMetrics.fillerWordCount).toBeGreaterThan(0);
    expect(Array.isArray(endRes.body.deliveryMetrics.perAnswer)).toBe(true);
  }, 60000);

  it('reading an old session without deliveryMetrics on its summary does not throw', async () => {
    const user = await createUser();

    const oldSession = await InterviewSession.create({
      id: 'old-session-1',
      userId: user._id,
      role: 'software-engineer',
      candidateName: 'Legacy Candidate',
      transcript: [],
      endedAt: new Date(),
      summary: { averageMetrics: { overall: 7 }, questionsAnswered: 1 }
    });

    const token = tokenFor(user);
    const getRes = await request(app)
      .get(`/api/interview/sessions/${oldSession.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(getRes.status).toBe(200);
    expect(getRes.body.summary.deliveryMetrics).toBeUndefined();
  }, 30000);
});
