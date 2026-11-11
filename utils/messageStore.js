/**
 * Small in-memory message cache used by Baileys for message retries and poll votes.
 */

const MAX_CHATS = 100;
const MAX_MESSAGES_PER_CHAT = 50;
const store = {
  messages: new Map(),
  maxChats: MAX_CHATS,
  maxPerChat: MAX_MESSAGES_PER_CHAT,
};

function add(message) {
  const { remoteJid, id } = message?.key || {};
  if (!remoteJid || !id) return;

  let chatMessages = store.messages.get(remoteJid);
  if (!chatMessages) chatMessages = new Map();
  chatMessages.set(id, message);

  while (chatMessages.size > store.maxPerChat) {
    chatMessages.delete(chatMessages.keys().next().value);
  }

  store.messages.delete(remoteJid);
  store.messages.set(remoteJid, chatMessages);
  while (store.messages.size > store.maxChats) {
    store.messages.delete(store.messages.keys().next().value);
  }
}

function bind(ev) {
  ev.on('messages.upsert', ({ messages }) => messages.forEach(add));
}

async function loadMessage(remoteJid, id) {
  return store.messages.get(remoteJid)?.get(id) || null;
}

store.add = add;
store.bind = bind;
store.loadMessage = loadMessage;
module.exports = store;
