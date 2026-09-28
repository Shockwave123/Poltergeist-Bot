/**
 * Persistent one-time reminders.
 */

const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '../database/reminders.json');
const POLL_MS = 15000;
let socket = null;
let timer = null;

function read() {
  try { return fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : []; }
  catch { return []; }
}

function write(reminders) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(reminders, null, 2));
}

function setSocket(sock) {
  socket = sock;
  if (!timer) timer = setInterval(checkDue, POLL_MS);
  checkDue();
}

function addReminder(reminder) {
  const reminders = read();
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  reminders.push({ ...reminder, id, createdAt: Date.now() });
  write(reminders);
  return id;
}

function getReminders(userId, chatId) {
  return read().filter((item) => item.userId === userId && item.chatId === chatId).sort((a, b) => a.at - b.at);
}

function cancelReminder(id, userId, chatId) {
  const reminders = read();
  const remaining = reminders.filter((item) => !(item.id === id && item.userId === userId && item.chatId === chatId));
  if (remaining.length === reminders.length) return false;
  write(remaining);
  return true;
}

async function checkDue() {
  if (!socket) return;
  const now = Date.now();
  const reminders = read();
  const due = reminders.filter((item) => item.at <= now);
  if (!due.length) return;

  const pending = reminders.filter((item) => item.at > now);
  write(pending);
  for (const reminder of due) {
    try {
      await socket.sendMessage(reminder.chatId, {
        text: `⏰ Reminder: ${reminder.text}`,
      });
    } catch (error) {
      console.error('[reminders] delivery error:', error.message);
      pending.push(reminder);
    }
  }
  write(pending);
}

module.exports = { setSocket, addReminder, getReminders, cancelReminder };
