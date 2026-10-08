/**
 * Owner-controlled continuous chatbot state.
 */

const fs = require('fs');
const path = require('path');

const STATE_FILE = process.env.AUTOCHAT_STATE_FILE || path.join(__dirname, '../database/autochat.json');
const MAX_RECENT_MESSAGES = 20;

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      return {
        enabled: false,
        chatId: null,
        dmEnabled: false,
        history: {},
        ...(parsed && typeof parsed === 'object' ? parsed : {})
      };
    }
  } catch (error) {
    console.error('[autochat] load error:', error.message);
  }
  return { enabled: false, chatId: null, dmEnabled: false, history: {} };
}

function saveState(state) {
  try {
    const directory = path.dirname(STATE_FILE);
    if (!fs.existsSync(directory)) fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('[autochat] save error:', error.message);
    return false;
  }
}

function getActiveChat() {
  const state = loadState();
  return state.enabled && state.chatId ? state.chatId : null;
}

function enable(chatId) {
  const state = loadState();
  const activeChat = state.enabled && state.chatId ? state.chatId : null;
  if (activeChat && activeChat !== chatId) {
    return { enabled: false, activeChat };
  }
  saveState({ ...state, enabled: true, chatId });
  return { enabled: true, activeChat: chatId };
}

function disable() {
  const state = loadState();
  saveState({ ...state, enabled: false, chatId: null });
}

function isDmEnabled() {
  return loadState().dmEnabled === true;
}

function setDmEnabled(enabled) {
  const state = loadState();
  return saveState({ ...state, dmEnabled: enabled === true });
}

function recordMessage(chatId, text) {
  if (!chatId || !text) return;
  const state = loadState();
  const history = state.history || {};
  const messages = history[chatId] || [];
  messages.push(String(text).trim());
  if (messages.length > MAX_RECENT_MESSAGES) messages.shift();
  history[chatId] = messages;
  state.history = history;
  saveState(state);
}

function getRecentMessages(chatId) {
  return [...(loadState().history?.[chatId] || [])];
}

module.exports = { getActiveChat, enable, disable, isDmEnabled, setDmEnabled, recordMessage, getRecentMessages };
