import { describe, it, expect, beforeAll, afterEach, afterAll, vi } from 'vitest';
import bcrypt from 'bcryptjs';
import { setupTestDb, teardownTestDb, clearCollections } from './helpers/db.js';

vi.mock('../lib/aiProvider.js', () => ({
  hasAI: () => false,
  generateAnalysisWithAI: vi.fn().mockResolvedValue(null),
  generateFollowUpWithAI: vi.fn().mockResolvedValue(null),
  generateDynamicQuestion: vi.fn().mockResolvedValue(null),
  generateSessionSummaryWithAI: vi.fn().mockResolvedValue(null),
  analyzeResumeConsistency: vi.fn().mockResolvedValue(null)
}));

let InterviewSession;
let User;
let endSession;
let nanoidCounter = 0;

beforeAll(async () => {
  await setupTestDb();
  InterviewSession = (await import('../models/InterviewSession.js')).default;
  User = (await import('../models/User.js')).default;
  ({ endSession } = await import('../lib/sessionEngine.js'));
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

function nextId() {
  nanoidCounter += 1;
  return `test-session-${nanoidCounter}`;
}

// A completed "previous" session — its summary.averageMetrics is set directly
// (no need to run it through endSession — only the delta math under test needs
// a real endSession call, and that's always on the "current" session).
async function seedPreviousSession({ owner, role, averageMetrics, minutesAgo }) {
  const id = nextId();
  const createdAt = new Date(Date.now() - minutesAgo * 60000);
  await InterviewSession.create({
    id,
    ...owner,
    role,
    candidateName: 'Prior Candidate',
    transcript: [],
    createdAt,
    endedAt: createdAt,
    summary: { averageMetrics }
  });
  return id;
}

// The "current" session that will actually go through endSession — its
// transcript carries fixed analysis.metrics so summarizeSession's computed
// averageMetrics are fully deterministic and hand-computable.
async function createCurrentSession({ owner, role, metrics, minutesAgo = 0 }) {
  const id = nextId();
  const createdAt = new Date(Date.now() - minutesAgo * 60000);
  await InterviewSession.create({
    id,
    ...owner,
    role,
    candidateName: 'Current Candidate',
    createdAt,
    transcript: [{
      question: 'Q1',
      answer: 'A1',
      analysis: { metrics, fillerCount: 0, wordCount: 50 },
      responseSeconds: 30
    }]
  });
  return id;
}

describe('score deltas — vs. last time in the same domain', () => {
  it('two sessions in the same domain — second shows deltas matching hand-computed values', async () => {
    const user = await createUser();
    const owner = { userId: user._id };
    const role = 'software-engineer';

    await seedPreviousSession({
      owner, role, minutesAgo: 60,
      averageMetrics: { relevance: 5, clarity: 6, structure: 5, specificity: 4, confidence: 6, delivery: 5, roleFit: 6, overall: 5.3 }
    });

    const currentId = await createCurrentSession({
      owner, role,
      metrics: { relevance: 7, clarity: 6, structure: 8, specificity: 4.5, confidence: 5, delivery: 6, roleFit: 7, overall: 6.2 }
    });

    const summary = await endSession(currentId, owner);
    expect(summary.scoreDeltas).toEqual({
      relevance: 2, clarity: 0, structure: 3, specificity: 0.5, confidence: -1, delivery: 1, roleFit: 1
    });
  });

  it('two sessions in different domains — no delta computed, even though one is chronologically the previous session', async () => {
    const user = await createUser();
    const owner = { userId: user._id };

    await seedPreviousSession({
      owner, role: 'marketing', minutesAgo: 60,
      averageMetrics: { relevance: 5, clarity: 6, structure: 5, specificity: 4, confidence: 6, delivery: 5, roleFit: 6, overall: 5.3 }
    });

    const currentId = await createCurrentSession({
      owner, role: 'software-engineer',
      metrics: { relevance: 7, clarity: 6, structure: 8, specificity: 4.5, confidence: 5, delivery: 6, roleFit: 7, overall: 6.2 }
    });

    const summary = await endSession(currentId, owner);
    expect(summary.scoreDeltas).toBeNull();
  });

  it('A, B, A domain pattern — the third session compares against the first A, skipping over B', async () => {
    const user = await createUser();
    const owner = { userId: user._id };

    await seedPreviousSession({
      owner, role: 'software-engineer', minutesAgo: 120,
      averageMetrics: { relevance: 3, clarity: 3, structure: 3, specificity: 3, confidence: 3, delivery: 3, roleFit: 3, overall: 3 }
    });
    await seedPreviousSession({
      owner, role: 'marketing', minutesAgo: 60,
      averageMetrics: { relevance: 9, clarity: 9, structure: 9, specificity: 9, confidence: 9, delivery: 9, roleFit: 9, overall: 9 }
    });

    const currentId = await createCurrentSession({
      owner, role: 'software-engineer',
      metrics: { relevance: 5, clarity: 5, structure: 5, specificity: 5, confidence: 5, delivery: 5, roleFit: 5, overall: 5 }
    });

    const summary = await endSession(currentId, owner);
    expect(summary.scoreDeltas).toEqual({
      relevance: 2, clarity: 2, structure: 2, specificity: 2, confidence: 2, delivery: 2, roleFit: 2
    });
  });

  it("a user's very first session ever — no delta, stored as null, not zero", async () => {
    const user = await createUser();
    const owner = { userId: user._id };

    const currentId = await createCurrentSession({
      owner, role: 'software-engineer',
      metrics: { relevance: 7, clarity: 6, structure: 8, specificity: 4.5, confidence: 5, delivery: 6, roleFit: 7, overall: 6.2 }
    });

    const summary = await endSession(currentId, owner);
    expect(summary.scoreDeltas).toBeNull();
  });

  it('guest sessions compute deltas correctly for the same guest', async () => {
    const owner = { guestId: 'guest-alpha' };
    const role = 'data-scientist';

    await seedPreviousSession({
      owner, role, minutesAgo: 30,
      averageMetrics: { relevance: 4, clarity: 4, structure: 4, specificity: 4, confidence: 4, delivery: 4, roleFit: 4, overall: 4 }
    });

    const currentId = await createCurrentSession({
      owner, role,
      metrics: { relevance: 6, clarity: 6, structure: 6, specificity: 6, confidence: 6, delivery: 6, roleFit: 6, overall: 6 }
    });

    const summary = await endSession(currentId, owner);
    expect(summary.scoreDeltas).toEqual({
      relevance: 2, clarity: 2, structure: 2, specificity: 2, confidence: 2, delivery: 2, roleFit: 2
    });
  });

  it("a guest's session never compares against a different guest's session in the same domain (regression on guest scoping)", async () => {
    const role = 'data-scientist';
    await seedPreviousSession({
      owner: { guestId: 'guest-beta' }, role, minutesAgo: 30,
      averageMetrics: { relevance: 1, clarity: 1, structure: 1, specificity: 1, confidence: 1, delivery: 1, roleFit: 1, overall: 1 }
    });

    const currentId = await createCurrentSession({
      owner: { guestId: 'guest-gamma' }, role,
      metrics: { relevance: 6, clarity: 6, structure: 6, specificity: 6, confidence: 6, delivery: 6, roleFit: 6, overall: 6 }
    });

    const summary = await endSession(currentId, { guestId: 'guest-gamma' });
    expect(summary.scoreDeltas).toBeNull();
  });

  it("a real user's session never compares against a different user's session in the same domain (regression)", async () => {
    const userA = await createUser();
    const userB = await createUser();
    const role = 'finance';

    await seedPreviousSession({
      owner: { userId: userA._id }, role, minutesAgo: 30,
      averageMetrics: { relevance: 1, clarity: 1, structure: 1, specificity: 1, confidence: 1, delivery: 1, roleFit: 1, overall: 1 }
    });

    const currentId = await createCurrentSession({
      owner: { userId: userB._id }, role,
      metrics: { relevance: 6, clarity: 6, structure: 6, specificity: 6, confidence: 6, delivery: 6, roleFit: 6, overall: 6 }
    });

    const summary = await endSession(currentId, { userId: userB._id });
    expect(summary.scoreDeltas).toBeNull();
  });
});
