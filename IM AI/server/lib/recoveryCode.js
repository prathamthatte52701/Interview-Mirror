import crypto from 'crypto';

// Excludes I/O/0/1 to avoid ambiguity when a user copies the code by hand.
const CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateRawRecoveryCode() {
  const bytes = crypto.randomBytes(10);
  return Array.from(bytes, (b) => CHARSET[b % CHARSET.length]).join('');
}

export function formatRecoveryCode(raw) {
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 10)}`;
}

export function normalizeRecoveryCodeInput(input) {
  return String(input || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}
