import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { setupTestDb, teardownTestDb, clearCollections } from './helpers/db.js';
import { getApp } from './helpers/testApp.js';
import { decodeToken } from './helpers/jwt.js';

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

async function createUser({ role = 'user', status = 'active', email, username } = {}) {
  const passwordHash = await bcrypt.hash('Password1!', 12);
  const doc = {
    email: email || `user-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
    passwordHash,
    role,
    status
  };
  if (role !== 'admin') {
    doc.fullName = 'Test User';
    doc.username = username || `u${Math.random().toString(36).slice(2, 8)}`;
    doc.normalizedUsername = doc.username;
    doc.contactNumber = '9876543210';
  }
  return User.create(doc);
}

function tokenFor(user, extra = {}) {
  return jwt.sign(
    { userId: String(user._id), username: user.username, email: user.email, ...extra },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

function adminTokenFor(user) {
  return jwt.sign(
    { userId: String(user._id), email: user.email, role: 'admin' },
    process.env.JWT_SECRET,
    { expiresIn: '2h' }
  );
}

describe('Admin panel', () => {
  it('rejects a non-admin user with 403 on admin routes', async () => {
    const user = await createUser({ role: 'user' });
    const token = tokenFor(user);

    const usersRes = await request(app).get('/api/admin/users').set('Authorization', `Bearer ${token}`);
    expect(usersRes.status).toBe(403);

    const healthRes = await request(app).get('/api/admin/health').set('Authorization', `Bearer ${token}`);
    expect(healthRes.status).toBe(403);
  });

  it('rejects admin login with wrong password', async () => {
    await createUser({ role: 'admin', email: 'admin@example.com' });
    const res = await request(app)
      .post('/api/admin/login')
      .send({ email: 'admin@example.com', password: 'WrongPass1!' });
    expect(res.status).toBe(401);
  });

  it('logs in an admin and issues a token with role admin', async () => {
    const admin = await createUser({ role: 'admin', email: 'admin2@example.com' });
    await User.updateOne({ _id: admin._id }, { passwordHash: await bcrypt.hash('Password1!', 12) });

    const res = await request(app)
      .post('/api/admin/login')
      .send({ email: 'admin2@example.com', password: 'Password1!' });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    const decoded = decodeToken(res.body.token);
    expect(decoded.role).toBe('admin');
  });

  it('rejects an already-issued token immediately after the user is banned (not just on next login)', async () => {
    const admin = await createUser({ role: 'admin', email: 'admin3@example.com' });
    const adminToken = adminTokenFor(admin);
    const user = await createUser({ role: 'user' });
    const userToken = tokenFor(user);

    const before = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${userToken}`);
    expect(before.status).toBe(200);

    const banRes = await request(app)
      .patch(`/api/admin/users/${user._id}/ban`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(banRes.status).toBe(200);

    const after = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${userToken}`);
    expect(after.status).toBe(403);
  });

  it('ban then unban round-trips correctly', async () => {
    const admin = await createUser({ role: 'admin', email: 'admin4@example.com' });
    const adminToken = adminTokenFor(admin);
    const user = await createUser({ role: 'user' });

    await request(app).patch(`/api/admin/users/${user._id}/ban`).set('Authorization', `Bearer ${adminToken}`);
    const unbanRes = await request(app)
      .patch(`/api/admin/users/${user._id}/unban`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(unbanRes.status).toBe(200);

    const fresh = await User.findById(user._id);
    expect(fresh.status).toBe('active');
  });

  it('rejects delete without { confirm: true }', async () => {
    const admin = await createUser({ role: 'admin', email: 'admin5@example.com' });
    const adminToken = adminTokenFor(admin);
    const user = await createUser({ role: 'user' });

    const res = await request(app)
      .delete(`/api/admin/users/${user._id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});
    expect(res.status).toBe(400);

    const stillThere = await User.findById(user._id);
    expect(stillThere).not.toBeNull();
  });

  it('deletes the user when { confirm: true } is sent', async () => {
    const admin = await createUser({ role: 'admin', email: 'admin6@example.com' });
    const adminToken = adminTokenFor(admin);
    const user = await createUser({ role: 'user' });

    const res = await request(app)
      .delete(`/api/admin/users/${user._id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ confirm: true });
    expect(res.status).toBe(200);

    const gone = await User.findById(user._id);
    expect(gone).toBeNull();
  });

  it('returns sessions belonging to multiple different users, not scoped to the admin', async () => {
    const admin = await createUser({ role: 'admin', email: 'admin7@example.com' });
    const adminToken = adminTokenFor(admin);
    const userA = await createUser({ role: 'user' });
    const userB = await createUser({ role: 'user' });

    await InterviewSession.create({
      id: 'sess-a', userId: userA._id, role: 'software-engineer', candidateName: 'A'
    });
    await InterviewSession.create({
      id: 'sess-b', userId: userB._id, role: 'software-engineer', candidateName: 'B'
    });

    const res = await request(app).get('/api/admin/sessions').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const owners = new Set(res.body.items.map((s) => String(s.userId)));
    expect(owners.has(String(userA._id))).toBe(true);
    expect(owners.has(String(userB._id))).toBe(true);
  });

  it('admin health endpoint reports db/AI mode/uptime for an authenticated admin', async () => {
    const admin = await createUser({ role: 'admin', email: 'admin8@example.com' });
    const adminToken = adminTokenFor(admin);

    const res = await request(app).get('/api/admin/health').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.db.connected).toBe(true);
    expect(['gemini', 'heuristic']).toContain(res.body.aiMode);
    expect(typeof res.body.uptimeSeconds).toBe('number');
  });
});
