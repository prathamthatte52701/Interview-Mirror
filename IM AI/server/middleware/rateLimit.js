import rateLimit from 'express-rate-limit';
import MongoStore from 'rate-limit-mongo';
import logger from '../lib/logger.js';

// ponytail: in-memory, per-process, resets on restart — fine for a single-instance
// deploy; upgrade to a Mongo-backed counter if this ever needs to survive restarts
// or aggregate across multiple instances.
const HIT_WINDOW_MS = 60 * 60 * 1000;
const recentHits = [];

export function recordRateLimitHit() {
  recentHits.push(Date.now());
}

export function getRecentRateLimitHitCount() {
  const cutoff = Date.now() - HIT_WINDOW_MS;
  while (recentHits.length && recentHits[0] < cutoff) recentHits.shift();
  return recentHits.length;
}

export function userKeyGenerator(req) {
  return req.userId ? String(req.userId) : (req.user?.username || req.ip);
}

const ipKeyGenerator = (req) => req.ip;

export function makeLimiter({ windowMs, max, prefix, keyGenerator = ipKeyGenerator }) {
  return rateLimit({
    windowMs,
    max,
    keyGenerator: (req) => `${prefix}${keyGenerator(req)}`,
    store: new MongoStore({
      uri: process.env.MONGO_URI,
      collectionName: 'rateLimitHits',
      expireTimeMs: windowMs,
      errorHandler: (err) => logger.error('rate_limit_store_error', { message: err?.message, prefix })
    }),
    handler: (req, res, _next, options) => {
      const key = keyGenerator(req);
      logger.warn('rate_limit_exceeded', {
        route: req.originalUrl,
        key,
        ts: new Date().toISOString()
      });
      recordRateLimitHit();
      res.status(options.statusCode).json({
        success: false,
        message: 'Too many requests. Please try again later.'
      });
    }
  });
}
