/**
 * Small persistent rolling group message history for summaries.
 */

const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '../database/groupConversation.json');
const MAX_MESSAGES = 500;

function read() {
  try { return fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : {}; }
  catch { return {}; }
}

function write(data) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

function addMessage(chatId, sender, text) {
  if (!chatId || !text) return;
  const data = read();
  const history = data[chatId] || [];
  history.push({ sender, text: String(text).trim(), at: Date.now() });
  data[chatId] = history.slice(-MAX_MESSAGES);
  write(data);
}

function getMessages(chatId, limit = 100) {
  return (read()[chatId] || []).slice(-limit);
}

function clearMessages(chatId) {
  const data = read();
  delete data[chatId];
  write(data);
}

module.exports = { addMessage, getMessages, clearMessages };
