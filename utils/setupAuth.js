const crypto = require('node:crypto');

const MIN_SETUP_PASSWORD_LENGTH = 16;

function isSetupPasswordConfigured(password) {
  return typeof password === 'string'
    && Buffer.byteLength(password, 'utf8') >= MIN_SETUP_PASSWORD_LENGTH;
}

function verifySetupPassword(authorization, expectedPassword) {
  if (!isSetupPasswordConfigured(expectedPassword)) return false;
  const match = /^Basic\s+([A-Za-z0-9+/]+=*)$/i.exec(String(authorization || ''));
  if (!match) return false;

  const decoded = Buffer.from(match[1], 'base64').toString('utf8');
  const separator = decoded.indexOf(':');
  if (separator < 0) return false;

  const actual = Buffer.from(decoded.slice(separator + 1), 'utf8');
  const expected = Buffer.from(expectedPassword, 'utf8');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

module.exports = {
  MIN_SETUP_PASSWORD_LENGTH,
  isSetupPasswordConfigured,
  verifySetupPassword
};
