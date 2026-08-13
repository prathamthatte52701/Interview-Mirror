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

const PASSWORD = 'Password1!';

async function createUser({ username, email } = {}) {
  const passwordHash = await bcrypt.hash(PASSWORD, 12);
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
    { userId: String(user._id), username: user.username, email: user.email, tokenVersion: user.tokenVersion },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

async function loginAndGetToken({ username, email, password }) {
  const res = await request(app).post('/api/auth/login').send({ username, email, password });
  return res;
}

async function mintGuest() {
  const res = await request(app).post('/api/auth/guest');
  expect(res.status).toBe(200);
  return res.body.token;
}

async function startSession(token) {
  const res = await request(app)
    .post('/api/interview/start')
    .set('Authorization', `Bearer ${token}`)
    .send({ role: 'software-engineer', candidateName: 'Test Candidate' });
  expect(res.status).toBe(201);
  return res.body.session.id;
}

describe('PATCH /api/auth/password', () => {
  it('changes the password with the correct current password', async () => {
    const user = await createUser();
    const token = tokenFor(user);

    const res = await request(app)
      .patch('/api/auth/password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: PASSWORD, newPassword: 'NewPassword2@' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('the new password works for a subsequent login', async () => {
    const user = await createUser({ username: 'loginuser' });
    const token = tokenFor(user);

    await request(app)
      .patch('/api/auth/password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: PASSWORD, newPassword: 'NewPassword2@' });

    const loginRes = await loginAndGetToken({ username: user.username, email: user.email, password: 'NewPassword2@' });
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.success).toBe(true);
  });

  it('rejects with 401 on wrong current password and leaves the old password intact', async () => {
    const user = await createUser({ username: 'wrongpwuser' });
    const token = tokenFor(user);

    const res = await request(app)
      .patch('/api/auth/password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'WrongPassword1!', newPassword: 'NewPassword2@' });
    expect(res.status).toBe(401);

    const loginRes = await loginAndGetToken({ username: user.username, email: user.email, password: PASSWORD });
    expect(loginRes.status).toBe(200);
  });

  it('rejects a new password that violates the signup policy', async () => {
    const user = await createUser();
    const token = tokenFor(user);

    const res = await request(app)
      .patch('/api/auth/password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: PASSWORD, newPassword: 'short1!' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/recovery-code/regenerate', () => {
  it('requires the correct password, and leaves the old recovery code working when wrong', async () => {
    const signupRes = await request(app).post('/api/auth/signup').send({
      fullName: 'Recovery User',
      username: 'recuser1',
      email: 'recuser1@example.com',
      password: PASSWORD,
      contactNumber: '9876543210',
      city: 'Mumbai',
      address: '123 Main St'
    });
    expect(signupRes.status).toBe(201);
    const oldRecoveryCode = signupRes.body.recoveryCode;

    const user = await User.findOne({ email: 'recuser1@example.com' });
    const token = tokenFor(user);

    const regenRes = await request(app)
      .post('/api/auth/recovery-code/regenerate')
      .set('Authorization', `Bearer ${token}`)
      .send({ password: 'WrongPassword1!' });
    expect(regenRes.status).toBe(401);

    const forgotRes = await request(app).post('/api/auth/forgot-password').send({
      username: 'recuser1',
      email: 'recuser1@example.com',
      recoveryCode: oldRecoveryCode,
      newPassword: 'AnotherPass3#',
      confirmNewPassword: 'AnotherPass3#'
    });
    expect(forgotRes.status).toBe(200);
  });

  it('after regeneration, the old recovery code no longer works and the new one does', async () => {
    const signupRes = await request(app).post('/api/auth/signup').send({
      fullName: 'Recovery User Two',
      username: 'recuser2',
      email: 'recuser2@example.com',
      password: PASSWORD,
      contactNumber: '9876543210',
      city: 'Mumbai',
      address: '123 Main St'
    });
    expect(signupRes.status).toBe(201);
    const oldRecoveryCode = signupRes.body.recoveryCode;

    const user = await User.findOne({ email: 'recuser2@example.com' });
    const token = tokenFor(user);

    const regenRes = await request(app)
      .post('/api/auth/recovery-code/regenerate')
      .set('Authorization', `Bearer ${token}`)
      .send({ password: PASSWORD });
    expect(regenRes.status).toBe(200);
    expect(regenRes.body.success).toBe(true);
    const newRecoveryCode = regenRes.body.recoveryCode;
    expect(newRecoveryCode).not.toBe(oldRecoveryCode);

    const oldCodeRes = await request(app).post('/api/auth/forgot-password').send({
      username: 'recuser2',
      email: 'recuser2@example.com',
      recoveryCode: oldRecoveryCode,
      newPassword: 'AnotherPass3#',
      confirmNewPassword: 'AnotherPass3#'
    });
    expect(oldCodeRes.status).toBe(401);

    const newCodeRes = await request(app).post('/api/auth/forgot-password').send({
      username: 'recuser2',
      email: 'recuser2@example.com',
      recoveryCode: newRecoveryCode,
      newPassword: 'AnotherPass3#',
      confirmNewPassword: 'AnotherPass3#'
    });
    expect(newCodeRes.status).toBe(200);
  });
});

describe('DELETE /api/auth/account', () => {
  it('requires the correct password and mutates nothing when wrong', async () => {
    const user = await createUser({ username: 'delwronguser' });
    const token = tokenFor(user);
    const sessionId = await startSession(token);

    const res = await request(app)
      .delete('/api/auth/account')
      .set('Authorization', `Bearer ${token}`)
      .send({ password: 'WrongPassword1!' });
    expect([401, 403]).toContain(res.status);

    const stillUser = await User.findById(user._id);
    expect(stillUser).not.toBeNull();
    const stillSessions = await InterviewSession.find({ userId: user._id });
    expect(stillSessions.length).toBeGreaterThan(0);
    expect(sessionId).toBeTruthy();
  });

  it('deletes the User and all their InterviewSessions on correct password', async () => {
    const user = await createUser({ username: 'deluser' });
    const token = tokenFor(user);
    await startSession(token);

    const res = await request(app)
      .delete('/api/auth/account')
      .set('Authorization', `Bearer ${token}`)
      .send({ password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const goneUser = await User.findById(user._id);
    expect(goneUser).toBeNull();
    const goneSessions = await InterviewSession.find({ userId: user._id });
    expect(goneSessions.length).toBe(0);
  });
});

describe('POST /api/auth/logout-everywhere', () => {
  it('invalidates the calling token for subsequent requests', async () => {
    const user = await createUser({ username: 'logoutuser' });
    const token = tokenFor(user);

    const res = await request(app)
      .post('/api/auth/logout-everywhere')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);
    expect(meRes.status).toBe(401);
  });

  it('a fresh login after logout-everywhere issues a working token', async () => {
    const user = await createUser({ username: 'logoutuser2' });
    const token = tokenFor(user);

    await request(app)
      .post('/api/auth/logout-everywhere')
      .set('Authorization', `Bearer ${token}`);

    const loginRes = await loginAndGetToken({ username: user.username, email: user.email, password: PASSWORD });
    expect(loginRes.status).toBe(200);
    const newToken = loginRes.body.token;

    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${newToken}`);
    expect(meRes.status).toBe(200);
  });
});

describe('Guest guard', () => {
  it('rejects guests with 403 on the new self-service endpoints', async () => {
    const guestToken = await mintGuest();

    const res = await request(app)
      .patch('/api/auth/password')
      .set('Authorization', `Bearer ${guestToken}`)
      .send({ currentPassword: 'x', newPassword: 'NewPassword2@' });
    expect(res.status).toBe(403);
  });
});
