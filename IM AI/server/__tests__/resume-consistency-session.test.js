import { describe, it, expect, beforeAll, afterEach, afterAll, vi } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { setupTestDb, teardownTestDb, clearCollections } from './helpers/db.js';

const analyzeResumeConsistencyMock = vi.fn();

vi.mock('../lib/aiProvider.js', () => ({
  hasAI: () => true,
  generateAnalysisWithAI: vi.fn().mockResolvedValue(null),
  generateFollowUpWithAI: vi.fn().mockResolvedValue(null),
  generateDynamicQuestion: vi.fn().mockResolvedValue(null),
  generateSessionSummaryWithAI: vi.fn().mockResolvedValue(null),
  analyzeResumeConsistency: analyzeResumeConsistencyMock
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
  analyzeResumeConsistencyMock.mockReset();
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

async function runSession(token, resumeText) {
  const startRes = await request(app)
    .post('/api/interview/start')
    .set('Authorization', `Bearer ${token}`)
    .send({ role: 'software-engineer', candidateName: 'Test Candidate', resumeText });
  const sessionId = startRes.body.session.id;

  await request(app)
    .post('/api/interview/answer')
    .set('Authorization', `Bearer ${token}`)
    .send({ sessionId, answer: 'I led the backend team for two years at my last company.' });

  return request(app)
    .post('/api/interview/end')
    .set('Authorization', `Bearer ${token}`)
    .send({ sessionId });
}

describe('endSession — resume consistency flags', () => {
  it('stores the flags returned by analyzeResumeConsistency on the session summary', async () => {
    analyzeResumeConsistencyMock.mockResolvedValueOnce([
      { questionIndex: 0, resumeLine: 'Led a team of 5 engineers', answerExcerpt: 'led the backend team for two years', confidence: 95, explanation: 'Answer omits team size claim.' }
    ]);

    const user = await createUser();
    const token = tokenFor(user);
    const endRes = await runSession(token, 'Led a team of 5 engineers at Acme Corp.');

    expect(endRes.status).toBe(200);
    expect(endRes.body.resumeConsistencyFlags).toHaveLength(1);
    expect(endRes.body.resumeConsistencyFlags[0]).toMatchObject({ confidence: 95 });
    expect(analyzeResumeConsistencyMock).toHaveBeenCalledTimes(1);
  }, 30000);

  it('stores null on the session summary when analyzeResumeConsistency returns null (e.g. no resume uploaded)', async () => {
    analyzeResumeConsistencyMock.mockResolvedValueOnce(null);

    const user = await createUser();
    const token = tokenFor(user);
    const endRes = await runSession(token, '');

    expect(endRes.status).toBe(200);
    expect(endRes.body.resumeConsistencyFlags).toBeNull();
  }, 30000);
});
