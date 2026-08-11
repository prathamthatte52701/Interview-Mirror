import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import '../lib/env.js';
import User from '../models/User.js';

async function main() {
  const email = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || '';

  if (!email || !password) {
    console.error('ADMIN_EMAIL and ADMIN_PASSWORD must both be set in the environment. Refusing to run.');
    process.exitCode = 1;
    return;
  }

  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI missing. Add it to .env before seeding an admin.');
    process.exitCode = 1;
    return;
  }

  try {
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 8000 });

    const passwordHash = await bcrypt.hash(password, 12);
    await User.findOneAndUpdate(
      { email },
      { $set: { email, passwordHash, role: 'admin', status: 'active' } },
      { upsert: true, setDefaultsOnInsert: true }
    );

    console.log(`Admin account seeded for ${email}.`);
    console.warn('These credentials were read from environment variables only and were never written to disk by this script. Do not add them to any committed file.');
  } catch (error) {
    console.error('Admin seed failed:', error?.message || error);
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close().catch(() => {});
  }
}

main();
