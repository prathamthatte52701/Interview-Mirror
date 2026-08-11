import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import request from 'supertest';
import { setupTestDb, teardownTestDb, clearCollections } from './helpers/db.js';
import { getApp } from './helpers/testApp.js';
import { decodeToken } from './helpers/jwt.js';

let app;

const SIGNUP_BODY = {
  fullName: 'Remember Me',
  username: 'rememberer',
  email: 'remember@example.com',
  password: 'Password1!',
  contactNumber: '9876543210',
  city: '',
  address: ''
};

beforeAll(async () => {
  await setupTestDb();
  app = await getApp();
  await request(app).post('/api/auth/signup').send(SIGNUP_BODY);
}, 60000);

afterEach(async () => {
  // no-op: single shared user across these tests, don't wipe the DB between them
});

afterAll(async () => {
  await teardownTestDb();
});

function loginBody(rememberMe) {
  return {
    username: SIGNUP_BODY.username,
    email: SIGNUP_BODY.email,
    password: SIGNUP_BODY.password,
    rememberMe
  };
}

describe('Remember Me login expiry', () => {
  it('issues a ~7d token when rememberMe is true', async () => {
    const res = await request(app).post('/api/auth/login').send(loginBody(true));
    expect(res.status).toBe(200);
    const decoded = decodeToken(res.body.token);
    const days = (decoded.exp - decoded.iat) / (60 * 60 * 24);
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThan(7.1);
  });

  it('issues a ~1h token when rememberMe is false', async () => {
    const res = await request(app).post('/api/auth/login').send(loginBody(false));
    expect(res.status).toBe(200);
    const decoded = decodeToken(res.body.token);
    const hours = (decoded.exp - decoded.iat) / (60 * 60);
    expect(hours).toBeGreaterThan(0.9);
    expect(hours).toBeLessThan(1.1);
  });

  it('issues a ~1h token when rememberMe is omitted', async () => {
    const body = loginBody(undefined);
    delete body.rememberMe;
    const res = await request(app).post('/api/auth/login').send(body);
    expect(res.status).toBe(200);
    const decoded = decodeToken(res.body.token);
    const hours = (decoded.exp - decoded.iat) / (60 * 60);
    expect(hours).toBeLessThan(1.1);
  });

  it.each([['true'], [1], [null]])('treats malformed rememberMe value %j as false without crashing', async (value) => {
    const res = await request(app).post('/api/auth/login').send(loginBody(value));
    expect(res.status).toBe(200);
    const decoded = decodeToken(res.body.token);
    const hours = (decoded.exp - decoded.iat) / (60 * 60);
    expect(hours).toBeLessThan(1.1);
  });

  it('rejects an expired 1h token on a protected route', async () => {
    const login = await request(app).post('/api/auth/login').send(loginBody(false));
    const decoded = decodeToken(login.body.token);
    expect(decoded.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));

    // Sign our own already-expired token with the same secret/payload shape
    const jwt = (await import('jsonwebtoken')).default;
    const expiredToken = jwt.sign(
      { userId: decoded.userId, username: decoded.username, email: decoded.email },
      process.env.JWT_SECRET,
      { expiresIn: -10 }
    );

    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${expiredToken}`);
    expect(res.status).toBe(401);
  });
});
