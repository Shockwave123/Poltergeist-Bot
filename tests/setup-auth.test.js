const assert = require('node:assert/strict');
const {
  isSetupPasswordConfigured,
  verifySetupPasswordValue,
  createSetupSession,
  isValidSetupSession,
  revokeSetupSession,
  SETUP_SESSION_TTL_MS
} = require('../utils/setupAuth');

const password = 'a-long-private-setup-password';

assert.equal(isSetupPasswordConfigured('1234567890123456'), true);
assert.equal(isSetupPasswordConfigured(password), true);
assert.equal(isSetupPasswordConfigured('short'), false);
assert.equal(verifySetupPasswordValue(password, password), true);
assert.equal(verifySetupPasswordValue('different-long-password', password), false);
assert.equal(verifySetupPasswordValue(password, ''), false);

const now = Date.now();
const token = createSetupSession(now);
assert.equal(typeof token, 'string');
assert.equal(isValidSetupSession(token, now), true);
assert.equal(isValidSetupSession(token, now + SETUP_SESSION_TTL_MS), false);
assert.equal(isValidSetupSession(token, now), false);

const revocableToken = createSetupSession(now);
assert.equal(isValidSetupSession(revocableToken, now), true);
revokeSetupSession(revocableToken);
assert.equal(isValidSetupSession(revocableToken, now), false);
assert.equal(isValidSetupSession('not-a-session-token', now), false);

console.log('Admin login and session authentication tests passed.');
