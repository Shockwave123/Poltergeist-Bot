/**
 * Owner-controlled continuous chatbot state.
 */

const fs = require('fs');
const path = require('path');

const STATE_FILE = process.env.AUTOCHAT_STATE_FILE || path.join(__dirname, '../database/autochat.json');
const MAX_RECENT_MESSAGES = 20;
const MAX_CONVERSATION_MESSAGES = 20;
const MAX_MESSAGE_LENGTH = 1000;
const SAVE_DEBOUNCE_MS = 250;
let cachedState = null;
let pendingSave = null;

function loadState() {
  if (cachedState) return cachedState;

  try {
    if (fs.existsSync(STATE_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      cachedState = {
        enabled: false,
        chatId: null,
        dmEnabled: false,
        history: {},
        conversations: {},
        ...(parsed && typeof parsed === 'object' ? parsed : {})
      };
      return cachedState;
    }
  } catch (error) {
    console.error('[autochat] load error:', error.message);
  }
  cachedState = { enabled: false, chatId: null, dmEnabled: false, history: {}, conversations: {} };
  return cachedState;
}

function flushState() {
  try {
    const directory = path.dirname(STATE_FILE);
    if (!fs.existsSync(directory)) fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(cachedState, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('[autochat] save error:', error.message);
    return false;
  }
}

function saveState(state, immediate = false) {
  cachedState = state;
  if (immediate) {
    if (pendingSave) clearTimeout(pendingSave);
    pendingSave = null;
    return flushState();
  }

  if (!pendingSave) {
    pendingSave = setTimeout(() => {
      pendingSave = null;
      flushState();
    }, SAVE_DEBOUNCE_MS);
    if (typeof pendingSave.unref === 'function') pendingSave.unref();
  }
  return true;
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
  saveState({ ...state, enabled: true, chatId }, true);
  return { enabled: true, activeChat: chatId };
}

function disable() {
  const state = loadState();
  saveState({ ...state, enabled: false, chatId: null }, true);
}

function isDmEnabled() {
  return loadState().dmEnabled === true;
}

function setDmEnabled(enabled) {
  const state = loadState();
  return saveState({ ...state, dmEnabled: enabled === true }, true);
}

function recordMessage(chatId, text) {
  if (!chatId || !text) return;
  const state = loadState();
  const history = state.history || {};
  const messages = history[chatId] || [];
  const cleanText = String(text).trim().slice(0, MAX_MESSAGE_LENGTH);
  if (!cleanText) return;
  messages.push(cleanText);
  if (messages.length > MAX_RECENT_MESSAGES) messages.shift();
  history[chatId] = messages;
  state.history = history;
  recordConversationMessageInState(state, chatId, 'user', cleanText);
  saveState(state);
}

function recordConversationMessageInState(state, chatId, role, text) {
  const conversations = state.conversations || {};
  const messages = Array.isArray(conversations[chatId]) ? conversations[chatId] : [];
  messages.push({
    role,
    text: String(text).trim().slice(0, MAX_MESSAGE_LENGTH),
    timestamp: Date.now()
  });
  conversations[chatId] = messages.slice(-MAX_CONVERSATION_MESSAGES);
  state.conversations = conversations;
}

function recordBotReply(chatId, text) {
  if (!chatId || !text) return false;
  const cleanText = String(text).trim().slice(0, MAX_MESSAGE_LENGTH);
  if (!cleanText) return false;
  const state = loadState();
  recordConversationMessageInState(state, chatId, 'assistant', cleanText);
  return saveState(state);
}

function getRecentMessages(chatId) {
  return [...(loadState().history?.[chatId] || [])];
}

function getRecentConversation(chatId) {
  const state = loadState();
  const conversation = state.conversations?.[chatId];
  if (Array.isArray(conversation) && conversation.length) {
    return conversation.slice(-MAX_CONVERSATION_MESSAGES)
      .filter((message) => message && ['user', 'assistant'].includes(message.role) && typeof message.text === 'string')
      .map((message) => ({ role: message.role, text: message.text }));
  }

  return (state.history?.[chatId] || []).slice(-MAX_CONVERSATION_MESSAGES)
    .map((text) => ({ role: 'user', text: String(text) }));
}

module.exports = {
  getActiveChat,
  enable,
  disable,
  isDmEnabled,
  setDmEnabled,
  recordMessage,
  recordBotReply,
  getRecentMessages,
  getRecentConversation
};
