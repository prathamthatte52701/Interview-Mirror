import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { setupTestDb, teardownTestDb, clearCollections } from './helpers/db.js';
import { getApp } from './helpers/testApp.js';

let app;
let User;
let counter = 0;

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
  counter += 1;
  const passwordHash = await bcrypt.hash('Password1!', 12);
  return User.create({
    fullName: 'Rate Limit User',
    username: `rl${counter}`,
    normalizedUsername: `rl${counter}`,
    email: `rl${counter}@example.com`,
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

describe('Rate limiting across routes', () => {
  it('login: allows 5 attempts per 15min/IP, blocks the 6th', async () => {
    const attempt = () => request(app)
      .post('/api/auth/login')
      .set('X-Forwarded-For', '20.0.0.1')
      .send({ username: 'nouser', email: 'nouser@example.com', password: 'WrongPass1!' });

    for (let i = 0; i < 5; i++) {
      const res = await attempt();
      expect(res.status).not.toBe(429);
    }
    const sixth = await attempt();
    expect(sixth.status).toBe(429);
  });

  it('login: a different IP is not blocked by another IP hitting its limit', async () => {
    const attempt = (ip) => request(app)
      .post('/api/auth/login')
      .set('X-Forwarded-For', ip)
      .send({ username: 'nouser', email: 'nouser@example.com', password: 'WrongPass1!' });

    for (let i = 0; i < 6; i++) await attempt('20.0.0.2');
    const other = await attempt('20.0.0.3');
    expect(other.status).not.toBe(429);
  });

  it('signup: allows 10 per hour/IP, blocks the 11th', async () => {
    const attempt = (n) => request(app)
      .post('/api/auth/signup')
      .set('X-Forwarded-For', '20.0.0.4')
      .send({
        fullName: 'Signup Limit',
        username: `sl${n}`,
        email: `sl${n}@example.com`,
        password: 'Password1!',
        contactNumber: '9876543210',
        city: '',
        address: ''
      });

    for (let i = 0; i < 10; i++) {
      const res = await attempt(i);
      expect(res.status).not.toBe(429);
    }
    const eleventh = await attempt(999);
    expect(eleventh.status).toBe(429);
  }, 20000);

  it('interview actions: allows 20/hour per authenticated user, blocks the 21st', async () => {
    const user = await createUser();
    const token = tokenFor(user);
    const attempt = () => request(app)
      .post('/api/interview/start')
      .set('Authorization', `Bearer ${token}`)
      .send({ role: '', candidateName: '' }); // intentionally invalid — limiter still counts it

    for (let i = 0; i < 20; i++) {
      const res = await attempt();
      expect(res.status).not.toBe(429);
    }
    const twentyFirst = await attempt();
    expect(twentyFirst.status).toBe(429);
  }, 20000);

  it('interview actions: one user hitting their limit does not block a different user', async () => {
    const userA = await createUser();
    const userB = await createUser();
    const tokenA = tokenFor(userA);
    const tokenB = tokenFor(userB);

    const attempt = (token) => request(app)
      .post('/api/interview/start')
      .set('Authorization', `Bearer ${token}`)
      .send({ role: '', candidateName: '' });

    for (let i = 0; i < 21; i++) await attempt(tokenA);
    const forUserB = await attempt(tokenB);
    expect(forUserB.status).not.toBe(429);
  }, 20000);

  it('admin login: allows 5 per 15min/IP, blocks the 6th', async () => {
    const attempt = () => request(app)
      .post('/api/admin/login')
      .set('X-Forwarded-For', '20.0.0.5')
      .send({ email: 'noadmin@example.com', password: 'WrongPass1!' });

    for (let i = 0; i < 5; i++) {
      const res = await attempt();
      expect(res.status).not.toBe(429);
    }
    const sixth = await attempt();
    expect(sixth.status).toBe(429);
  });
});
