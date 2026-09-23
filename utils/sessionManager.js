/**
 * Session Manager - Single source of truth for the bot's WhatsApp credentials.
 *
 * Responsibilities:
 *  - Export/import the `PoltergeistMD!` session string (gzip + base64 of creds.json)
 *  - Remember which phone number linked the bot and HOW it was linked (QR / pairing code / env session)
 *  - Persist the session id to disk so a restart on the same filesystem does not need a re-link
 *  - Track whether the welcome message (which now carries the session id) was delivered
 *
 * The in-memory state is also mirrored onto `config.sessionID` so the rest of the
 * codebase keeps working unchanged.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const config = require('../config');

const SESSION_PREFIX = 'PoltergeistMD!';
const ROOT_DIR = path.join(__dirname, '..');
const STATE_FILE = path.join(ROOT_DIR, 'database', 'session.json');

const DEFAULT_STATE = {
  sessionId: '',
  authMethod: 'none', // 'qr' | 'pairing' | 'session-id' | 'session-file' | 'none'
  phoneNumber: '',
  linkedAt: 0,
  pairingRequestedAt: 0,
  lastWelcomedSessionId: '',
  updatedAt: 0
};

let cache = null;

const getSessionFolder = () => path.join(ROOT_DIR, config.sessionName || 'session');
const getCredsFile = () => path.join(getSessionFolder(), 'creds.json');

/** Write a file atomically so a crash mid-write cannot corrupt it. */
const atomicWrite = (filePath, data) => {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const tmpPath = `${filePath}.${process.pid}.tmp`;
    fs.writeFileSync(tmpPath, data, 'utf8');
    fs.renameSync(tmpPath, filePath);
    return true;
  } catch (error) {
    console.error('[sessionManager] write failed:', error.message);
    return false;
  }
};

const readState = () => {
  try {
    if (!fs.existsSync(STATE_FILE)) return { ...DEFAULT_STATE };
    const parsed = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    return { ...DEFAULT_STATE, ...(parsed && typeof parsed === 'object' ? parsed : {}) };
  } catch (error) {
    console.error('[sessionManager] state read failed:', error.message);
    return { ...DEFAULT_STATE };
  }
};

/** Current persisted + in-memory session state. */
const getState = () => {
  if (!cache) cache = readState();
  return cache;
};

/** Merge a patch into the state and persist it. */
const setState = (patch = {}) => {
  const next = { ...getState(), ...patch, updatedAt: Date.now() };
  cache = next;
  atomicWrite(STATE_FILE, JSON.stringify(next, null, 2));
  if (typeof next.sessionId === 'string') {
    config.sessionID = next.sessionId;
  }
  return next;
};

/** gzip + base64 encode raw creds.json content into a shareable session string. */
const encodeCreds = (rawCreds) => {
  const buffer = Buffer.isBuffer(rawCreds) ? rawCreds : Buffer.from(String(rawCreds), 'utf8');
  return `${SESSION_PREFIX}${zlib.gzipSync(buffer).toString('base64')}`;
};

const isSessionIdValid = (sessionId) => (
  typeof sessionId === 'string' &&
  sessionId.startsWith(SESSION_PREFIX) &&
  sessionId.length > SESSION_PREFIX.length + 20
);

/**
 * Decode a `PoltergeistMD!...` session string back into raw creds.json content.
 * Throws when the format is invalid so callers can show a helpful message.
 */
const decodeSessionId = (sessionId) => {
  const value = String(sessionId || '').trim().replace(/\s+/g, '');
  if (!isSessionIdValid(value)) {
    throw new Error("Invalid session id. Expected a string that starts with 'PoltergeistMD!'");
  }
  const b64 = value.slice(SESSION_PREFIX.length).replace('...', '');
  return zlib.gunzipSync(Buffer.from(b64, 'base64')).toString('utf8');
};


/** Raw creds.json content from disk, or null when it does not exist/is unreadable. */
const readCredsRaw = () => {
  try {
    const credsFile = getCredsFile();
    if (!fs.existsSync(credsFile)) return null;
    const raw = fs.readFileSync(credsFile, 'utf8');
    if (!raw || !raw.trim()) return null;
    JSON.parse(raw); // sanity check - catch truncated writes early
    return raw;
  } catch (error) {
    console.error('[sessionManager] creds read failed:', error.message);
    return null;
  }
};

const hasLocalCreds = () => {
  const raw = readCredsRaw();
  return Boolean(raw && isUsableCreds(raw));
};

/**
 * A creds payload is only usable if it carries the key material Baileys needs.
 * A truncated or placeholder file (e.g. `{me, registered}` only) makes Baileys
 * crash with `Cannot read properties of undefined (reading 'public')`.
 */
const isUsableCreds = (raw) => {
  try {
    const parsed = JSON.parse(String(raw || ''));
    if (!parsed || typeof parsed !== 'object') return false;
    return Boolean(
      parsed.noiseKey?.keyPair?.public &&
      parsed.identityKey?.public &&
      parsed.signedPreKey?.keyPair?.public
    );
  } catch (error) {
    return false;
  }
};

/** True when a creds file exists on disk but is broken/placeholder content. */
const hasBrokenCreds = () => {
  const raw = readCredsRaw();
  return Boolean(raw) && !isUsableCreds(raw);
};

/** Move a broken creds.json aside so useMultiFileAuthState cannot load it. */
const quarantineBrokenCreds = () => {
  try {
    const credsFile = getCredsFile();
    if (!fs.existsSync(credsFile)) return false;
    const backup = `${credsFile}.broken-${Date.now()}`;
    fs.renameSync(credsFile, backup);
    console.warn(`⚠️ session/creds.json was unusable and has been quarantined to ${path.basename(backup)}.`);
    return true;
  } catch (error) {
    console.error('[sessionManager] quarantine failed:', error.message);
    // Last resort: delete it so boot can continue with a fresh pair
    try { fs.rmSync(getCredsFile(), { force: true }); return true; } catch (e) { return false; }
  }
};

/**
 * Build a session string from the creds.json currently on disk.
 * Only linked accounts (registered + real key material) may be exported —
 * anything else is a placeholder that would poison database/session.json.
 */
const exportSessionFromDisk = () => {
  const raw = readCredsRaw();
  if (!raw) return null;
  if (!isUsableCreds(raw)) {
    console.error('[sessionManager] export refused: creds on disk are not a linked account (registered=false or key material missing).');
    return null;
  }
  try {
    return encodeCreds(raw);
  } catch (error) {
    console.error('[sessionManager] session export failed:', error.message);
    return null;
  }
};

/**
 * Write a decoded session string to session/creds.json so Baileys can use it.
 * Returns true when the session was imported successfully.
 */
const importSessionToDisk = (sessionId, meta = {}) => {
  try {
    const raw = decodeSessionId(sessionId);
    JSON.parse(raw); // validate JSON before touching the filesystem
    if (!isUsableCreds(raw)) {
      console.error('[sessionManager] session import rejected: decoded creds lack key material.');
      return false;
    }
    const credsFile = getCredsFile();
    fs.mkdirSync(path.dirname(credsFile), { recursive: true });
    if (!atomicWrite(credsFile, raw)) return false;
    setState({
      sessionId: String(sessionId).trim().replace(/\s+/g, ''),
      authMethod: meta.authMethod || 'session-id',
      phoneNumber: meta.phoneNumber || getState().phoneNumber || '',
      linkedAt: meta.linkedAt || Date.now()
    });
    return true;
  } catch (error) {
    console.error('[sessionManager] session import failed:', error.message);
    return false;
  }
};

/** Remember a freshly generated session id (called right after a successful link). */
const setSessionId = (sessionId, meta = {}) => setState({
  sessionId: String(sessionId || '').trim(),
  authMethod: meta.authMethod || getState().authMethod || 'none',
  phoneNumber: meta.phoneNumber || getState().phoneNumber || '',
  linkedAt: meta.linkedAt || Date.now()
});

const getSessionId = () => getState().sessionId || '';

/** Delete every file inside the session folder (used when WhatsApp logs us out). */
const clearLocalCreds = () => {
  try {
    const folder = getSessionFolder();
    if (!fs.existsSync(folder)) return true;
    for (const entry of fs.readdirSync(folder)) {
      try {
        fs.rmSync(path.join(folder, entry), { recursive: true, force: true });
      } catch (error) {
        console.error(`[sessionManager] could not delete ${entry}:`, error.message);
      }
    }
    return true;
  } catch (error) {
    console.error('[sessionManager] session folder cleanup failed:', error.message);
    return false;
  }
};

/** Short, safe-to-display preview of a session id. */
const previewSession = (sessionId) => {
  const value = sessionId || getSessionId();
  if (!value) return 'none';
  if (value.length <= 26) return value;
  return `${value.slice(0, 18)}...${value.slice(-6)}`;
};

/** Welcome messages are only sent once per unique session id (no spam on redeploys). */
const needsWelcome = (sessionId) => {
  const id = sessionId || getSessionId();
  if (!id) return false;
  return getState().lastWelcomedSessionId !== id;
};

const markWelcomeSent = (sessionId) => setState({ lastWelcomedSessionId: sessionId || getSessionId() });

/** Non-sensitive status block used by the setup page and the `.account` command. */
const getStatus = () => {
  const state = getState();
  const hasCreds = hasLocalCreds();
  return {
    hasSession: Boolean(state.sessionId) || hasCreds,
    sessionIdPresent: Boolean(state.sessionId),
    credsOnDisk: hasCreds,
    sessionPreview: previewSession(state.sessionId),
    authMethod: state.authMethod,
    phoneNumber: state.phoneNumber,
    linkedAt: state.linkedAt,
    pairingRequestedAt: state.pairingRequestedAt,
    welcomeSent: Boolean(state.sessionId) && state.lastWelcomedSessionId === state.sessionId
  };
};

module.exports = {
  SESSION_PREFIX,
  DEFAULT_STATE,
  getSessionFolder,
  getCredsFile,
  getState,
  setState,
  encodeCreds,
  decodeSessionId,
  isSessionIdValid,
  readCredsRaw,
  isUsableCreds,
  hasLocalCreds,
  hasBrokenCreds,
  quarantineBrokenCreds,
  exportSessionFromDisk,
  importSessionToDisk,
  setSessionId,
  getSessionId,
  clearLocalCreds,
  previewSession,
  needsWelcome,
  markWelcomeSent,
  getStatus
};
