import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { setupTestDb, teardownTestDb, clearCollections } from './helpers/db.js';
import { getApp } from './helpers/testApp.js';

// Regression check for Feature 1 (client/src/lib/auth.js, AdminDashboardPage.jsx):
// the client only clears a stored token / redirects to login on a genuine 401/403
// from the server. This file confirms /api/auth/me and /api/admin/health still
// return 401 (not 200, not a 5xx) for missing/invalid/expired tokens, so the
// client-side "only treat 401/403 as logged-out" logic has something real to key off.

let app;

beforeAll(async () => {
  await setupTestDb();
  app = await getApp();
}, 60000);

afterEach(async () => {
  await clearCollections();
});

afterAll(async () => {
  await teardownTestDb();
});

describe('GET /api/auth/me — status codes', () => {
  it('returns 401 with no Authorization header', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('returns 401 for a malformed/garbage token', async () => {
    const res = await request(app).get('/api/auth/me').set('Authorization', 'Bearer not-a-real-jwt');
    expect(res.status).toBe(401);
  });

  it('returns 401 for a well-formed but expired token', async () => {
    const expiredToken = jwt.sign(
      { userId: '000000000000000000000000', username: 'ghost', email: 'ghost@example.com' },
      process.env.JWT_SECRET,
      { expiresIn: -10 }
    );
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${expiredToken}`);
    expect(res.status).toBe(401);
  });
});

describe('GET /api/admin/health — status codes', () => {
  it('returns 401 with no Authorization header', async () => {
    const res = await request(app).get('/api/admin/health');
    expect(res.status).toBe(401);
  });

  it('returns 401 for a malformed/garbage token', async () => {
    const res = await request(app).get('/api/admin/health').set('Authorization', 'Bearer not-a-real-jwt');
    expect(res.status).toBe(401);
  });

  it('returns 401 for a well-formed but expired token', async () => {
    const expiredToken = jwt.sign(
      { userId: '000000000000000000000000', username: 'ghost', email: 'ghost@example.com', role: 'admin' },
      process.env.JWT_SECRET,
      { expiresIn: -10 }
    );
    const res = await request(app).get('/api/admin/health').set('Authorization', `Bearer ${expiredToken}`);
    expect(res.status).toBe(401);
  });
});
