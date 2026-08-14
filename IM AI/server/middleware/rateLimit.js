import rateLimit from 'express-rate-limit';
import MongoStore from 'rate-limit-mongo';
import logger from '../lib/logger.js';

// In-memory, per-process health-snapshot counter (admin panel "recent rate
// limit hits" widget) — separate from the per-route Mongo-backed limiters below.
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
  // The Mongo-backed store lets limits survive a server restart, but a rate
  // limiter is a defense-in-depth control, not core correctness — if Mongo is
  // unreachable, requests must still go through (fail open), not 500 every
  // route wired to a limiter (this previously took down guest login, which
  // has no other database dependency, whenever Mongo was down).
  const store = new MongoStore({
    uri: process.env.MONGO_URI,
    collectionName: 'rateLimitHits',
    expireTimeMs: windowMs,
    errorHandler: (err) => logger.error('rate_limit_store_error', { message: err?.message, prefix })
  });

  const limiter = rateLimit({
    windowMs,
    max,
    keyGenerator: (req) => `${prefix}${keyGenerator(req)}`,
    store,
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

  return (req, res, next) => {
    limiter(req, res, (err) => {
      if (err) {
        logger.error('rate_limit_middleware_error', { message: err?.message, prefix });
        return next();
      }
      next();
    });
  };
}
