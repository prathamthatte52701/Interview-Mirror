import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from 'vitest';
import request from 'supertest';
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

function signupBody() {
  counter += 1;
  return {
    fullName: 'Recovery User',
    username: `rc${counter}`,
    email: `rc${counter}@example.com`,
    password: 'Password1!',
    contactNumber: '9876543210',
    city: '',
    address: ''
  };
}

async function signup() {
  const body = signupBody();
  const res = await request(app).post('/api/auth/signup').send(body);
  return { body, recoveryCode: res.body.recoveryCode };
}

describe('Recovery-code password reset', () => {
  it('issues a recovery code on signup and never stores it in plaintext', async () => {
    const { body, recoveryCode } = await signup();
    expect(recoveryCode).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{2}$/);

    const user = await User.findOne({ email: body.email });
    expect(user.recoveryCodeHash).toBeTruthy();
    expect(user.recoveryCodeHash).not.toBe(recoveryCode);
    expect(user.recoveryCodeHash.startsWith('$2')).toBe(true); // bcrypt hash prefix
  });

  it('resets the password with the correct code and issues a new code', async () => {
    const { body, recoveryCode } = await signup();

    const res = await request(app).post('/api/auth/forgot-password').send({
      username: body.username,
      email: body.email,
      recoveryCode,
      newPassword: 'NewPassword1!',
      confirmNewPassword: 'NewPassword1!'
    });

    expect(res.status).toBe(200);
    expect(res.body.recoveryCode).toBeTruthy();
    expect(res.body.recoveryCode).not.toBe(recoveryCode);

    const login = await request(app).post('/api/auth/login').send({
      username: body.username, email: body.email, password: 'NewPassword1!'
    });
    expect(login.status).toBe(200);
  });

  it('rejects a wrong recovery code and leaves the password unchanged', async () => {
    const { body } = await signup();

    const res = await request(app).post('/api/auth/forgot-password').send({
      username: body.username,
      email: body.email,
      recoveryCode: 'WRONG-CODE-XX',
      newPassword: 'NewPassword1!',
      confirmNewPassword: 'NewPassword1!'
    });
    expect(res.status).toBe(401);

    const login = await request(app).post('/api/auth/login').send({
      username: body.username, email: body.email, password: body.password
    });
    expect(login.status).toBe(200);
  });

  it('rejects a correct code paired with the wrong username/email', async () => {
    const { recoveryCode } = await signup();
    const other = await signup();

    const res = await request(app).post('/api/auth/forgot-password').send({
      username: other.body.username,
      email: other.body.email,
      recoveryCode, // belongs to the FIRST user, not `other`
      newPassword: 'NewPassword1!',
      confirmNewPassword: 'NewPassword1!'
    });
    expect(res.status).toBe(401);
  });

  it('rejects the old code after it has already been used for a successful reset', async () => {
    const { body, recoveryCode } = await signup();

    const first = await request(app).post('/api/auth/forgot-password').send({
      username: body.username,
      email: body.email,
      recoveryCode,
      newPassword: 'NewPassword1!',
      confirmNewPassword: 'NewPassword1!'
    });
    expect(first.status).toBe(200);

    const second = await request(app).post('/api/auth/forgot-password').send({
      username: body.username,
      email: body.email,
      recoveryCode, // reusing the now-stale code
      newPassword: 'AnotherPassword1!',
      confirmNewPassword: 'AnotherPassword1!'
    });
    expect(second.status).toBe(401);
  });

  it('trips the rate limit after 3 requests in an hour', async () => {
    const { body } = await signup();
    const attempt = () => request(app).post('/api/auth/forgot-password').send({
      username: body.username,
      email: body.email,
      recoveryCode: 'WRONG-CODE-XX',
      newPassword: 'NewPassword1!',
      confirmNewPassword: 'NewPassword1!'
    });

    await attempt();
    await attempt();
    await attempt();
    const fourth = await attempt();
    expect(fourth.status).toBe(429);
  });

  it('never includes the recovery code in login or /me responses', async () => {
    const { body } = await signup();
    const login = await request(app).post('/api/auth/login').send({
      username: body.username, email: body.email, password: body.password
    });
    expect(login.body.user.recoveryCode).toBeUndefined();
    expect(login.body.user.recoveryCodeHash).toBeUndefined();
    expect(JSON.stringify(login.body)).not.toMatch(/\$2[aby]\$/);

    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${login.body.token}`);
    expect(JSON.stringify(me.body)).not.toMatch(/recoveryCode/i);
  });
});
