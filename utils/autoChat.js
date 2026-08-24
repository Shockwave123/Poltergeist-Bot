/**
 * Owner-controlled continuous chatbot state.
 */

const fs = require('fs');
const path = require('path');

const STATE_FILE = path.join(__dirname, '../database/autochat.json');

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    }
  } catch (error) {
    console.error('[autochat] load error:', error.message);
  }
  return { enabled: false, chatId: null };
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
  const activeChat = getActiveChat();
  if (activeChat && activeChat !== chatId) {
    return { enabled: false, activeChat };
  }
  saveState({ enabled: true, chatId });
  return { enabled: true, activeChat: chatId };
}

function disable() {
  saveState({ enabled: false, chatId: null });
}

module.exports = { getActiveChat, enable, disable };
