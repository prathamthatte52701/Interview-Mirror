import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import request from 'supertest';
import { setupTestDb, teardownTestDb, clearCollections } from './helpers/db.js';
import { getApp } from './helpers/testApp.js';

let app;
let counter = 0;

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

function signupBody(fullName) {
  counter += 1;
  return {
    fullName,
    username: `fn${counter}`,
    email: `fn${counter}@example.com`,
    password: 'Password1!',
    contactNumber: '9876543210',
    city: '',
    address: ''
  };
}

describe('Full name validation on signup', () => {
  it('accepts a hyphenated name', async () => {
    const res = await request(app).post('/api/auth/signup').send(signupBody('Siddharth-Kumar'));
    expect(res.status).toBe(201);
  });

  it("accepts a name with an apostrophe", async () => {
    const res = await request(app).post('/api/auth/signup').send(signupBody("O'Brien"));
    expect(res.status).toBe(201);
  });

  it('accepts a name with periods and spaces', async () => {
    const res = await request(app).post('/api/auth/signup').send(signupBody('A.K. Sharma'));
    expect(res.status).toBe(201);
  });

  it('accepts a 40-character name', async () => {
    const name = 'A' + 'b'.repeat(39);
    expect(name.length).toBe(40);
    const res = await request(app).post('/api/auth/signup').send(signupBody(name));
    expect(res.status).toBe(201);
  });

  it('rejects a 41-character name', async () => {
    const name = 'A' + 'b'.repeat(40);
    expect(name.length).toBe(41);
    const res = await request(app).post('/api/auth/signup').send(signupBody(name));
    expect(res.status).toBe(400);
  });

  it('rejects a name containing digits', async () => {
    const res = await request(app).post('/api/auth/signup').send(signupBody('John3'));
    expect(res.status).toBe(400);
  });

  it('rejects a name containing an emoji', async () => {
    const res = await request(app).post('/api/auth/signup').send(signupBody('John 😀'));
    expect(res.status).toBe(400);
  });

  it('rejects a name starting with punctuation', async () => {
    const res = await request(app).post('/api/auth/signup').send(signupBody('-John'));
    expect(res.status).toBe(400);
  });
});
