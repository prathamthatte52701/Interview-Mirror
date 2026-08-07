import dns from 'dns';
import mongoose from 'mongoose';

dns.setServers(['8.8.8.8', '8.8.4.4']);

export const DATABASE_UNAVAILABLE_MESSAGE = 'Database not connected. Please try again later.';

let dbConnectionError = '';
let connectionPromise = null;

export function getDbStatus() {
  return {
    connected: mongoose.connection.readyState === 1,
    connecting: mongoose.connection.readyState === 2,
    error: dbConnectionError
  };
}

export async function connectDatabase() {
  const mongoUri = process.env.MONGO_URI;

  if (!mongoUri) {
    dbConnectionError = 'MongoDB connection unavailable';
    console.error('Database error:', dbConnectionError);
    return getDbStatus();
  }

  if (getDbStatus().connected) return getDbStatus();
  if (connectionPromise) return connectionPromise;

  connectionPromise = mongoose.connect(mongoUri, {
    serverSelectionTimeoutMS: 8000
  })
    .then(() => {
      dbConnectionError = '';
      console.log('MongoDB connected');
      return getDbStatus();
    })
    .catch((error) => {
      dbConnectionError = error?.message || 'MongoDB connection unavailable';
      console.error('Database error:', dbConnectionError);
      connectionPromise = null;
      return getDbStatus();
    });

  return connectionPromise;
}

export async function ensureDatabase() {
  if (getDbStatus().connected) return true;
  await connectDatabase();
  return getDbStatus().connected;
}

export async function requireDatabase(_req, res, next) {
  if (await ensureDatabase()) {
    next();
    return;
  }

  const dbError = dbConnectionError || 'Database connection unavailable';
  console.error('Database error:', dbError);
  res.status(503).json({
    success: false,
    message: DATABASE_UNAVAILABLE_MESSAGE
  });
}
