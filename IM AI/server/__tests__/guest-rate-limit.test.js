import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import request from 'supertest';
import { setupTestDb, teardownTestDb, clearCollections } from './helpers/db.js';
import { getApp } from './helpers/testApp.js';

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

describe('POST /api/auth/guest rate limiting', () => {
  it('allows the first guest request from an IP', async () => {
    const res = await request(app)
      .post('/api/auth/guest')
      .set('X-Forwarded-For', '10.0.0.1');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.token).toBeTruthy();
  });

  it('blocks a second request from the same IP within 24h with 429', async () => {
    await request(app).post('/api/auth/guest').set('X-Forwarded-For', '10.0.0.2');
    const res = await request(app).post('/api/auth/guest').set('X-Forwarded-For', '10.0.0.2');
    expect(res.status).toBe(429);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBeTruthy();
  });

  it('allows a request from a different IP', async () => {
    await request(app).post('/api/auth/guest').set('X-Forwarded-For', '10.0.0.3');
    const res = await request(app).post('/api/auth/guest').set('X-Forwarded-For', '10.0.0.4');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('persists the limit across a simulated server restart', async () => {
    await request(app).post('/api/auth/guest').set('X-Forwarded-For', '10.0.0.5');
    // Re-import app.js fresh (module cache still holds the same process, but the
    // limiter's state lives in Mongo, not in-process — this proves persistence).
    const rebuiltApp = await getApp();
    const res = await request(rebuiltApp).post('/api/auth/guest').set('X-Forwarded-For', '10.0.0.5');
    expect(res.status).toBe(429);
  });

  it('does not block after clearCollections resets the rate-limit collection', async () => {
    await request(app).post('/api/auth/guest').set('X-Forwarded-For', '10.0.0.6');
    await clearCollections();
    const res = await request(app).post('/api/auth/guest').set('X-Forwarded-For', '10.0.0.6');
    expect(res.status).toBe(200);
  });
});
