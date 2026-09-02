/**
 * Encrypted per-user API-key storage for hosted deployments.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '../database/googleKeys.json');
const SECRET_FILE = path.join(__dirname, '../database/.user-key-secret');
const ALGORITHM = 'aes-256-gcm';

function getEncryptionKey() {
  const secret = process.env.USER_KEYS_ENCRYPTION_KEY || getLocalSecret();
  return crypto.createHash('sha256').update(secret).digest();
}

function getLocalSecret() {
  try {
    if (fs.existsSync(SECRET_FILE)) return fs.readFileSync(SECRET_FILE, 'utf8').trim();
    const secret = crypto.randomBytes(32).toString('hex');
    fs.mkdirSync(path.dirname(SECRET_FILE), { recursive: true });
    fs.writeFileSync(SECRET_FILE, secret, { encoding: 'utf8', mode: 0o600 });
    return secret;
  } catch (error) {
    throw new Error(`Unable to initialize secure key storage: ${error.message}`);
  }
}

function read() {
  try { return fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : {}; }
  catch { return {}; }
}

function write(data) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2), { mode: 0o600 });
}

function encrypt(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return `${iv.toString('base64')}.${cipher.getAuthTag().toString('base64')}.${encrypted.toString('base64')}`;
}

function decrypt(value) {
  const [ivText, tagText, encryptedText] = value.split('.');
  const decipher = crypto.createDecipheriv(ALGORITHM, getEncryptionKey(), Buffer.from(ivText, 'base64'));
  decipher.setAuthTag(Buffer.from(tagText, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(encryptedText, 'base64')), decipher.final()]).toString('utf8');
}

function setKey(userId, key) {
  const data = read();
  data[userId] = encrypt(key);
  write(data);
}

function getKey(userId) {
  const value = read()[userId];
  if (!value) return null;
  return decrypt(value);
}

function removeKey(userId) {
  const data = read();
  delete data[userId];
  write(data);
}

module.exports = { setKey, getKey, removeKey };
