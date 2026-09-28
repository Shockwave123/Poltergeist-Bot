/**
 * AFK (Away From Keyboard) — owner offline mode
 * Stored in database/afk.json; per-user notify tracking in memory
 */

const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '../database');
const AFK_FILE = path.join(DB_PATH, 'afk.json');

const notifiedUsers = new Set();
const notifiedAt = new Map();
const REPEAT_COOLDOWN_MS = 60 * 60 * 1000;

const DEFAULT_MESSAGE =
  'This Poltergeist is currently offline. Please try again later.';

function loadState() {
  try {
    if (fs.existsSync(AFK_FILE)) {
      return JSON.parse(fs.readFileSync(AFK_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('[afk] load error:', e.message);
  }
  return { enabled: false, enabledGroups: false, enabledDMs: false, voice: false, message: DEFAULT_MESSAGE };
}

function saveState(state) {
  try {
    if (!fs.existsSync(DB_PATH)) {
      fs.mkdirSync(DB_PATH, { recursive: true });
    }
    fs.writeFileSync(AFK_FILE, JSON.stringify(state, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error('[afk] save error:', e.message);
    return false;
  }
}

function notifyKey(chatId, senderId) {
  return `${chatId}|${senderId}`;
}

function isEnabled() {
  return loadState().enabled === true;
}

function getMessage() {
  const state = loadState();
  return state.message || DEFAULT_MESSAGE;
}

function setEnabled(enabled, customMessage) {
  notifiedUsers.clear();
  notifiedAt.clear();
  const state = loadState();
  state.enabled = enabled;
  if (enabled && state.enabledGroups === undefined) state.enabledGroups = true;
  if (enabled && state.enabledDMs === undefined) state.enabledDMs = true;
  if (enabled && customMessage) {
    state.message = customMessage;
  } else if (!enabled) {
    state.message = DEFAULT_MESSAGE;
  }
  state.enabledAt = enabled ? Date.now() : null;
  return saveState(state);
}

function isVoiceEnabled() {
  return loadState().voice === true;
}

function setVoiceEnabled(enabled) {
  const state = loadState();
  state.voice = enabled === true;
  return saveState(state);
}

function setScope(scope, enabled) {
  const state = loadState();
  if (scope === 'groups') state.enabledGroups = enabled === true;
  if (scope === 'dms') state.enabledDMs = enabled === true;
  state.enabled = state.enabledGroups === true || state.enabledDMs === true;
  notifiedUsers.clear();
  notifiedAt.clear();
  return saveState(state);
}

function setMessage(message) {
  const state = loadState();
  state.message = String(message || '').trim() || DEFAULT_MESSAGE;
  return saveState(state);
}

function isScopeEnabled(isGroup) {
  const state = loadState();
  if (!state.enabled) return false;
  if (isGroup) return state.enabledGroups !== false;
  return state.enabledDMs !== false;
}

function shouldNotify(chatId, senderId) {
  const key = notifyKey(chatId, senderId);
  const last = notifiedAt.get(key);
  return !last || Date.now() - last >= REPEAT_COOLDOWN_MS;
}

function markNotified(chatId, senderId) {
  notifiedUsers.add(notifyKey(chatId, senderId));
  notifiedAt.set(notifyKey(chatId, senderId), Date.now());
}

module.exports = {
  isEnabled,
  getMessage,
  setEnabled,
  isVoiceEnabled,
  setVoiceEnabled,
  setScope,
  setMessage,
  isScopeEnabled,
  shouldNotify,
  markNotified,
  DEFAULT_MESSAGE,
};
