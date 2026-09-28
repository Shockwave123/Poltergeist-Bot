/**
 * Chat Actions - safe wrappers around Baileys chatModify / privacy helpers.
 *
 * WhatsApp warns that a malformed app-state update can unlink every device, so
 * every call here sticks to the documented payload shapes and always supplies
 * the newest message of the chat when the API asks for `lastMessages`.
 */

/**
 * Newest message we know about for a chat (used as `lastMessages`).
 * Falls back to the message that triggered the command.
 */
const getLastMessageFor = (chatId, fallbackMsg = null) => {
  try {
    // Required lazily: index.js requires the command loader at startup
    const { store } = require('../index');
    const chat = store?.messages?.get(chatId);
    if (chat && chat.size) {
      let newest = null;
      for (const message of chat.values()) {
        if (!newest || (message.messageTimestamp || 0) > (newest.messageTimestamp || 0)) {
          newest = message;
        }
      }
      if (newest?.key) {
        return { key: newest.key, messageTimestamp: newest.messageTimestamp };
      }
    }
  } catch (error) {
    // Store unavailable (e.g. right after a restart) - fall through
  }

  if (fallbackMsg?.key) {
    return {
      key: fallbackMsg.key,
      messageTimestamp: fallbackMsg.messageTimestamp || Math.floor(Date.now() / 1000)
    };
  }
  return null;
};

const buildLastMessages = (chatId, fallbackMsg) => {
  const last = getLastMessageFor(chatId, fallbackMsg);
  return last ? [last] : [];
};

/** Archive or unarchive a chat. */
const archiveChat = async (sock, chatId, archive, fallbackMsg) => {
  await sock.chatModify({ archive, lastMessages: buildLastMessages(chatId, fallbackMsg) }, chatId);
  return archive;
};

/** Pin or unpin a chat. */
const pinChat = async (sock, chatId, pin) => {
  await sock.chatModify({ pin }, chatId);
  return pin;
};

/** Mute (duration in milliseconds) or unmute (null) a chat. */
const muteChat = async (sock, chatId, durationMs) => {
  await sock.chatModify({ mute: durationMs }, chatId);
  return durationMs;
};

/** Mark a chat as read or unread. */
const markChatRead = async (sock, chatId, read, fallbackMsg) => {
  await sock.chatModify({ markRead: read, lastMessages: buildLastMessages(chatId, fallbackMsg) }, chatId);
  return read;
};

/** Delete the chat from the linked account's chat list. */
const deleteChat = async (sock, chatId, fallbackMsg) => {
  await sock.chatModify({ delete: true, lastMessages: buildLastMessages(chatId, fallbackMsg) }, chatId);
  return true;
};

/** Human readable mute duration ("8h", "7d", "off"). */
const formatMuteDuration = (ms) => {
  if (!ms) return 'off (unmuted)';
  const hours = Math.round(ms / (60 * 60 * 1000));
  if (ms >= 24 * 60 * 60 * 1000) return `${Math.round(ms / (24 * 60 * 60 * 1000))} day(s)`;
  return `${hours} hour(s)`;
};

/** Parse durations such as 8h, 1d, 30m, 7d into milliseconds. */
const parseDuration = (value) => {
  const match = String(value || '').trim().toLowerCase().match(/^(\d+)\s*(m|min|mins|h|hr|hrs|hour|hours|d|day|days|w|week|weeks)$/);
  if (!match) return null;
  const amount = Number(match[1]);
  const unit = match[2];
  if (unit.startsWith('m')) return amount * 60 * 1000;
  if (unit.startsWith('h')) return amount * 60 * 60 * 1000;
  if (unit.startsWith('d')) return amount * 24 * 60 * 60 * 1000;
  return amount * 7 * 24 * 60 * 60 * 1000;
};

module.exports = {
  getLastMessageFor,
  buildLastMessages,
  archiveChat,
  pinChat,
  muteChat,
  markChatRead,
  deleteChat,
  formatMuteDuration,
  parseDuration
};
