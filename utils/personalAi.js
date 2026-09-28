/**
 * Local persistence for private journal, mood, expenses, and study cards.
 */

const fs = require('fs');
const path = require('path');
const FILE = path.join(__dirname, '../database/personalAi.json');

function read() {
  try { return fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : {}; }
  catch { return {}; }
}
function write(data) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}
function user(data, id) {
  if (!data[id]) data[id] = { journal: [], expenses: [], cards: [] };
  data[id].journal ||= [];
  data[id].expenses ||= [];
  data[id].cards ||= [];
  return data[id];
}
function getUser(id) { return user(read(), id); }
function addJournal(id, entry) { const data = read(); user(data, id).journal.push(entry); write(data); }
function addExpense(id, expense) { const data = read(); user(data, id).expenses.push(expense); write(data); }
function addCard(id, card) { const data = read(); user(data, id).cards.push(card); write(data); }
function getCards(id) { return getUser(id).cards; }
module.exports = { getUser, addJournal, addExpense, addCard, getCards };
