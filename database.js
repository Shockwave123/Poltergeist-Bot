/**
 * Simple JSON-based Database for Group Settings
 */

const fs = require('fs');
const path = require('path');
const config = require('./config');

const DB_PATH = path.join(__dirname, 'database');
const GROUPS_DB = path.join(DB_PATH, 'groups.json');
const USERS_DB = path.join(DB_PATH, 'users.json');
const WARNINGS_DB = path.join(DB_PATH, 'warnings.json');
const MODS_DB = path.join(DB_PATH, 'mods.json');
const SUDO_DB = path.join(DB_PATH, 'sudo.json');

// Initialize database directory
if (!fs.existsSync(DB_PATH)) {
  fs.mkdirSync(DB_PATH, { recursive: true });
}

// Initialize database files
const initDB = (filePath, defaultData = {}) => {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(defaultData, null, 2));
  }
};

initDB(GROUPS_DB, {});
initDB(USERS_DB, {});
initDB(WARNINGS_DB, {});
initDB(MODS_DB, { moderators: [] });
initDB(SUDO_DB, { sudoUsers: [] });

// ----------------------------------------------------------------------------
// Crash-safe storage layer
//  * everything is cached in memory so hot paths (per message) never hit disk
//  * writes are debounced and atomic (write temp file + rename) so a crash or a
//    Render redeploy in the middle of a write can never corrupt a database file
//  * a corrupt file is backed up instead of silently wiping user data
// ----------------------------------------------------------------------------
const dbCache = new Map(); // filePath -> parsed data
const pendingWrites = new Map(); // filePath -> timeout handle
const WRITE_DEBOUNCE_MS = 400;

/** Atomically persist the cached copy of a database file. */
const flushFile = (filePath) => {
  const pending = pendingWrites.get(filePath);
  if (pending) {
    clearTimeout(pending);
    pendingWrites.delete(filePath);
  }
  const data = dbCache.get(filePath);
  if (data === undefined) return true;
  try {
    const tmpPath = `${filePath}.${process.pid}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2));
    fs.renameSync(tmpPath, filePath);
    return true;
  } catch (error) {
    console.error(`Error writing database: ${error.message}`);
    return false;
  }
};

/** Queue a debounced flush so bursts of updates only produce one disk write. */
const scheduleFlush = (filePath) => {
  if (pendingWrites.has(filePath)) return true;
  const timer = setTimeout(() => {
    pendingWrites.delete(filePath);
    flushFile(filePath);
  }, WRITE_DEBOUNCE_MS);
  if (typeof timer.unref === 'function') timer.unref();
  pendingWrites.set(filePath, timer);
  return true;
};

/** Flush every pending database write immediately (used on shutdown/restart). */
const flushAll = () => {
  let ok = true;
  for (const filePath of dbCache.keys()) {
    if (!flushFile(filePath)) ok = false;
  }
  return ok;
};

// Read database (cached)
const readDB = (filePath) => {
  if (dbCache.has(filePath)) return dbCache.get(filePath);
  let data = {};
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      data = raw.trim() ? JSON.parse(raw) : {};
      if (!data || typeof data !== 'object' || Array.isArray(data)) data = {};
    }
  } catch (error) {
    console.error(`Error reading database (${path.basename(filePath)}): ${error.message}`);
    try {
      if (fs.existsSync(filePath)) {
        const backup = `${filePath}.corrupt-${Date.now()}`;
        fs.copyFileSync(filePath, backup);
        console.warn(`Backed up unreadable database to ${path.basename(backup)}`);
      }
    } catch (backupError) {
      console.error(`Could not back up database: ${backupError.message}`);
    }
    data = {};
  }
  dbCache.set(filePath, data);
  return data;
};

// Write database (debounced + atomic)
const writeDB = (filePath, data) => {
  dbCache.set(filePath, data);
  return scheduleFlush(filePath);
};

// Group Settings
const getGroupSettings = (groupId) => {
  const groups = readDB(GROUPS_DB);
  if (!groups[groupId]) {
    groups[groupId] = { ...config.defaultGroupSettings };
    writeDB(GROUPS_DB, groups);
  }
  return groups[groupId];
};

const updateGroupSettings = (groupId, settings) => {
  const groups = readDB(GROUPS_DB);
  groups[groupId] = { ...groups[groupId], ...settings };
  return writeDB(GROUPS_DB, groups);
};

// User Data
const getUser = (userId) => {
  const users = readDB(USERS_DB);
  if (!users[userId]) {
    users[userId] = {
      registered: Date.now(),
      premium: false,
      banned: false
    };
    writeDB(USERS_DB, users);
  }
  return users[userId];
};

const updateUser = (userId, data) => {
  const users = readDB(USERS_DB);
  users[userId] = { ...users[userId], ...data };
  return writeDB(USERS_DB, users);
};

// Warnings System
const getWarnings = (groupId, userId) => {
  const warnings = readDB(WARNINGS_DB);
  const key = `${groupId}_${userId}`;
  return warnings[key] || { count: 0, warnings: [] };
};

const addWarning = (groupId, userId, reason) => {
  const warnings = readDB(WARNINGS_DB);
  const key = `${groupId}_${userId}`;
  
  if (!warnings[key]) {
    warnings[key] = { count: 0, warnings: [] };
  }
  
  warnings[key].count++;
  warnings[key].warnings.push({
    reason,
    date: Date.now()
  });
  
  writeDB(WARNINGS_DB, warnings);
  return warnings[key];
};

const removeWarning = (groupId, userId) => {
  const warnings = readDB(WARNINGS_DB);
  const key = `${groupId}_${userId}`;
  
  if (warnings[key] && warnings[key].count > 0) {
    warnings[key].count--;
    warnings[key].warnings.pop();
    writeDB(WARNINGS_DB, warnings);
    return true;
  }
  return false;
};

const clearWarnings = (groupId, userId) => {
  const warnings = readDB(WARNINGS_DB);
  const key = `${groupId}_${userId}`;
  delete warnings[key];
  return writeDB(WARNINGS_DB, warnings);
};

// Moderators System
const getModerators = () => {
  const mods = readDB(MODS_DB);
  return mods.moderators || [];
};

const addModerator = (userId) => {
  const mods = readDB(MODS_DB);
  if (!mods.moderators) mods.moderators = [];
  if (!mods.moderators.includes(userId)) {
    mods.moderators.push(userId);
    return writeDB(MODS_DB, mods);
  }
  return false;
};

const removeModerator = (userId) => {
  const mods = readDB(MODS_DB);
  if (mods.moderators) {
    mods.moderators = mods.moderators.filter(id => id !== userId);
    return writeDB(MODS_DB, mods);
  }
  return false;
};

const isModerator = (userId) => {
  const mods = getModerators();
  return mods.includes(userId);
};

// Sudo Users System - stores full JIDs (e.g. 602455062940@s.whatsapp.net or xyz@lid)
const toStoredJid = (input) => {
  const s = String(input).trim();
  if (!s) return null;
  if (s.includes('@')) return s; // Already a JID
  const digits = s.replace(/\D/g, '');
  return digits.length >= 10 ? `${digits}@s.whatsapp.net` : null;
};

const getSudoUsers = () => {
  const sudo = readDB(SUDO_DB);
  const raw = sudo.sudoUsers || [];
  return raw.map((entry) => (entry.includes('@') ? entry : `${entry}@s.whatsapp.net`));
};

const addSudoUser = (userIdOrJid) => {
  const sudo = readDB(SUDO_DB);
  if (!sudo.sudoUsers) sudo.sudoUsers = [];
  const jid = toStoredJid(userIdOrJid);
  if (!jid) return false;
  if (!sudo.sudoUsers.includes(jid)) {
    sudo.sudoUsers.push(jid);
    return writeDB(SUDO_DB, sudo);
  }
  return false;
};

const removeSudoUser = (userIdOrJid) => {
  const sudo = readDB(SUDO_DB);
  if (!sudo.sudoUsers) return false;
  const jid = toStoredJid(userIdOrJid);
  if (!jid) return false;
  const before = sudo.sudoUsers.length;
  const jidUser = jid.split('@')[0];
  sudo.sudoUsers = sudo.sudoUsers.filter((entry) => {
    const entryJid = entry.includes('@') ? entry : `${entry}@s.whatsapp.net`;
    const entryUser = entryJid.split('@')[0];
    return entryJid !== jid && entryUser !== jidUser;
  });
  return writeDB(SUDO_DB, sudo) && sudo.sudoUsers.length < before;
};

const isSudoUser = (sender) => {
  const sudo = getSudoUsers();
  if (!sender) return false;
  const senderStr = String(sender).trim();
  const senderUser = senderStr.includes('@')
    ? senderStr.split('@')[0].split(':')[0]
    : (senderStr.replace(/\D/g, '') || senderStr);
  if (!senderUser) return false;
  return sudo.some((jid) => {
    const storedUser = jid.split('@')[0]?.split(':')[0] || '';
    if (!storedUser) return false;
    return (
      storedUser === senderUser ||
      (senderUser.length >= 10 && (storedUser.startsWith(senderUser) || senderUser.startsWith(storedUser)))
    );
  });
};

module.exports = {
  getGroupSettings,
  updateGroupSettings,
  getUser,
  updateUser,
  getWarnings,
  addWarning,
  removeWarning,
  clearWarnings,
  getModerators,
  addModerator,
  removeModerator,
  isModerator,
  getSudoUsers,
  addSudoUser,
  removeSudoUser,
  isSudoUser,
  flushAll,
  getCacheSize: () => dbCache.size
};
