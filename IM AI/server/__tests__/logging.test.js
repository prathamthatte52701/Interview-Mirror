import { describe, it, expect, vi, beforeAll, afterEach, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { setupTestDb, teardownTestDb, clearCollections } from './helpers/db.js';
import { getApp } from './helpers/testApp.js';

let app;
let logger;
let User;
let counter = 0;

beforeAll(async () => {
  await setupTestDb();
  app = await getApp();
  logger = (await import('../lib/logger.js')).default;
  User = (await import('../models/User.js')).default;
}, 60000);

afterEach(async () => {
  vi.restoreAllMocks();
  await clearCollections();
});

afterAll(async () => {
  await teardownTestDb();
});

async function createUser({ role = 'user' } = {}) {
  counter += 1;
  const passwordHash = await bcrypt.hash('Password1!', 12);
  const doc = { email: `log${counter}@example.com`, passwordHash, role, status: 'active' };
  if (role !== 'admin') {
    doc.fullName = 'Log User';
    doc.username = `log${counter}`;
    doc.normalizedUsername = `log${counter}`;
    doc.contactNumber = '9876543210';
  }
  return User.create(doc);
}

describe('Winston logging hooks', () => {
  it('logs a failed login attempt with a reason', async () => {
    const warnSpy = vi.spyOn(logger, 'warn');
    await request(app).post('/api/auth/login').send({
      username: 'nouser', email: 'nouser@example.com', password: 'WrongPass1!'
    });
    expect(warnSpy).toHaveBeenCalledWith(
      'login_attempt',
      expect.objectContaining({ success: false })
    );
  });

  it('logs a successful login attempt', async () => {
    counter += 1;
    const passwordHash = await bcrypt.hash('Password1!', 12);
    await User.create({
      fullName: 'Log Success', username: `ls${counter}`, normalizedUsername: `ls${counter}`,
      email: `ls${counter}@example.com`, passwordHash, contactNumber: '9876543210'
    });

    const infoSpy = vi.spyOn(logger, 'info');
    await request(app).post('/api/auth/login').send({
      username: `ls${counter}`, email: `ls${counter}@example.com`, password: 'Password1!'
    });
    expect(infoSpy).toHaveBeenCalledWith(
      'login_attempt',
      expect.objectContaining({ success: true })
    );
  });

  it('logs a rate-limit trigger', async () => {
    const warnSpy = vi.spyOn(logger, 'warn');
    const attempt = () => request(app)
      .post('/api/auth/login')
      .set('X-Forwarded-For', '30.0.0.1')
      .send({ username: 'nouser', email: 'nouser@example.com', password: 'WrongPass1!' });

    for (let i = 0; i < 6; i++) await attempt();
    expect(warnSpy).toHaveBeenCalledWith(
      'rate_limit_exceeded',
      expect.objectContaining({ route: '/api/auth/login' })
    );
  });

  it('logs an admin ban action', async () => {
    const admin = await createUser({ role: 'admin' });
    await User.updateOne({ _id: admin._id }, { passwordHash: await bcrypt.hash('Password1!', 12) });
    const loginRes = await request(app).post('/api/admin/login').send({
      email: admin.email, password: 'Password1!'
    });
    const target = await createUser();

    const infoSpy = vi.spyOn(logger, 'info');
    await request(app)
      .patch(`/api/admin/users/${target._id}/ban`)
      .set('Authorization', `Bearer ${loginRes.body.token}`);

    expect(infoSpy).toHaveBeenCalledWith(
      'admin_action',
      expect.objectContaining({ action: 'ban', targetUserId: String(target._id) })
    );
  });
});
