import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

let mongod;

export async function setupTestDb() {
  mongod = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongod.getUri('test');
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';
  process.env.NODE_ENV = 'test';

  const { connectDatabase } = await import('../../config/db.js');
  await connectDatabase();
}

export async function clearCollections() {
  const collections = await mongoose.connection.db.listCollections().toArray();
  await Promise.all(
    collections.map((c) => mongoose.connection.db.collection(c.name).deleteMany({}))
  );
}

export async function teardownTestDb() {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
}
