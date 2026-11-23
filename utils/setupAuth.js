const crypto = require('node:crypto');

const MIN_SETUP_PASSWORD_LENGTH = 16;
const SETUP_SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_ACTIVE_SETUP_SESSIONS = 100;
const sessions = new Map();

function isSetupPasswordConfigured(password) {
  return typeof password === 'string'
    && Buffer.byteLength(password, 'utf8') >= MIN_SETUP_PASSWORD_LENGTH;
}

function verifySetupPasswordValue(password, expectedPassword) {
  if (!isSetupPasswordConfigured(expectedPassword) || typeof password !== 'string') return false;
  const actual = Buffer.from(password, 'utf8');
  const expected = Buffer.from(expectedPassword, 'utf8');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function hashSessionToken(token) {
  if (typeof token !== 'string' || token.length < 40 || token.length > 100) return null;
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}

function removeExpiredSessions(now) {
  for (const [hash, expiresAt] of sessions) {
    if (expiresAt <= now) sessions.delete(hash);
  }
}

function createSetupSession(now = Date.now()) {
  removeExpiredSessions(now);
  while (sessions.size >= MAX_ACTIVE_SETUP_SESSIONS) {
    sessions.delete(sessions.keys().next().value);
  }

  const token = crypto.randomBytes(32).toString('base64url');
  const hash = hashSessionToken(token);
  sessions.set(hash, now + SETUP_SESSION_TTL_MS);
  return token;
}

function isValidSetupSession(token, now = Date.now()) {
  const hash = hashSessionToken(token);
  if (!hash) return false;
  const expiresAt = sessions.get(hash);
  if (!expiresAt) return false;
  if (expiresAt <= now) {
    sessions.delete(hash);
    return false;
  }
  return true;
}

function revokeSetupSession(token) {
  const hash = hashSessionToken(token);
  if (hash) sessions.delete(hash);
}

module.exports = {
  MIN_SETUP_PASSWORD_LENGTH,
  SETUP_SESSION_TTL_MS,
  isSetupPasswordConfigured,
  verifySetupPasswordValue,
  createSetupSession,
  isValidSetupSession,
  revokeSetupSession
};
