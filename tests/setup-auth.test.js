const assert = require('node:assert/strict');
const {
  isSetupPasswordConfigured,
  verifySetupPassword
} = require('../utils/setupAuth');

const password = 'a-long-private-setup-password';
const validAuthorization = `Basic ${Buffer.from(`owner:${password}`).toString('base64')}`;

assert.equal(isSetupPasswordConfigured('1234567890123456'), true);
assert.equal(isSetupPasswordConfigured(password), true);
assert.equal(isSetupPasswordConfigured('short'), false);
assert.equal(verifySetupPassword(validAuthorization, password), true);
assert.equal(verifySetupPassword(validAuthorization, 'different-long-password'), false);
assert.equal(verifySetupPassword('Bearer token', password), false);
assert.equal(verifySetupPassword(validAuthorization, ''), false);

console.log('Setup endpoint authentication tests passed.');
