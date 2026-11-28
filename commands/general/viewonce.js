/**
 * ViewOnce Command - Reveal view-once messages
 */

const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const config = require('../../config');
const { normalizeJidWithLid } = require('../../utils/jidHelper');
const messageStore = require('../../utils/messageStore');

const MEDIA_TYPES = ['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage', 'stickerMessage'];

function unwrapMessage(message) {
  let content = message || {};
  for (let depth = 0; depth < 8; depth += 1) {
    const inner = content.ephemeralMessage?.message
      || content.viewOnceMessage?.message
      || content.viewOnceMessageV2?.message
      || content.viewOnceMessageV2Extension?.message
      || content.documentWithCaptionMessage?.message
      || content.message?.message; // handle nested message wrappers
    if (!inner) break;
    content = inner;
  }
  return content;
}

function getViewOnceMedia(quotedMessage) {
  const quoted = unwrapMessage(quotedMessage);

  // Check all possible view-once containers in order of specificity
  const viewOnceContent = quoted.viewOnceMessageV2Extension?.message
    || quoted.viewOnceMessageV2?.message
    || quoted.viewOnceMessage?.message
    || quoted.ephemeralMessage?.message;

  // First: check if any media type directly has viewOnce: true
  let detectedType = null;
  let mediaMessage = quoted;

  for (const type of MEDIA_TYPES) {
    if (quoted[type] && (quoted[type].viewOnce === true || quoted[type].viewOnce === 1)) {
      mediaMessage = quoted;
      detectedType = type;
      break;
    }
  }

  // Second: check inside view-once containers
  if (!detectedType && viewOnceContent) {
    const unwrapped = unwrapMessage(viewOnceContent);
    for (const type of MEDIA_TYPES) {
      if (unwrapped[type] && (unwrapped[type].viewOnce === true || unwrapped[type].viewOnce === 1)) {
        mediaMessage = unwrapped;
        detectedType = type;
        break;
      }
    }
    // Third: even without explicit viewOnce flag, if it's inside a viewOnce container, it's view-once
    if (!detectedType) {
      for (const type of MEDIA_TYPES) {
        if (unwrapped[type]) {
          mediaMessage = unwrapped;
          detectedType = type;
          break;
        }
      }
    }
  }

  // Fourth: check if the quoted message itself is a view-once media type (no container)
  if (!detectedType) {
    for (const type of MEDIA_TYPES) {
      if (quoted[type] && (quoted[type].mediaKey || quoted[type].directPath || quoted[type].url || quoted[type].fileEncSha256)) {
        // Has media data - could be view-once
        mediaMessage = quoted;
        detectedType = type;
        break;
      }
    }
  }

  return detectedType
    ? { messageType: detectedType, message: { [detectedType]: mediaMessage[detectedType] } }
    : null;
}

async function getQuotedTargetMessage(chatId, contextInfo) {
  if (!contextInfo?.stanzaId) return null;

  // First try to load from message store (cached)
  const cachedMessage = await messageStore.loadMessage(chatId, contextInfo.stanzaId);
  if (cachedMessage) return cachedMessage;

  if (!contextInfo.quotedMessage) return null;

  // If not cached, return the quoted message from contextInfo
  // This is the message that was quoted/replied to
  return {
    key: {
      remoteJid: chatId,
      id: contextInfo.stanzaId,
      participant: contextInfo.participant
    },
    message: contextInfo.quotedMessage
  };
}

async function downloadViewOnceMedia(sock, targetMessage, downloader = downloadMediaMessage) {
  return downloader(
    targetMessage,
    'buffer',
    {},
    { logger: undefined, reuploadRequest: sock.updateMediaMessage }
  );
}

module.exports = {
  name: 'viewonce',
  aliases: ['readvo', 'vv', 'readviewonce', 'wow', 'view'],
  category: 'general',
  description: 'Reveal view-once messages and forward them to owner DM',
  usage: '.viewonce (or .view once) (reply to view-once message)',
  getViewOnceMedia,
  getQuotedTargetMessage,
  downloadViewOnceMedia,
  
  async execute(sock, msg, args) {
    try {
      const chatId = msg.key.remoteJid;

      // Try to get contextInfo from different message types (reply can be from text, image, video, etc.)
      const currentMessage = unwrapMessage(msg.message);
      const ctx = currentMessage.extendedTextMessage?.contextInfo
        || currentMessage.imageMessage?.contextInfo
        || currentMessage.videoMessage?.contextInfo
        || currentMessage.buttonsResponseMessage?.contextInfo
        || currentMessage.listResponseMessage?.contextInfo;

      if (!ctx?.stanzaId) {
        return await sock.sendMessage(
          chatId,
          { text: '🗑️ Reply to a *view-once* message to reveal it.' },
          { quoted: msg }
        );
      }

      const targetMessage = await getQuotedTargetMessage(chatId, ctx);
      if (!targetMessage?.message) {
        return await sock.sendMessage(
          chatId,
          { text: '❌ I could not retrieve that replied-to message. Try again while it is still in recent chat history.' },
          { quoted: msg }
        );
      }
      const mediaInfo = getViewOnceMedia(targetMessage.message);
      if (!mediaInfo) {
        return await sock.sendMessage(
          chatId,
          { text: '❌ This is not a view-once message!' },
          { quoted: msg }
        );
      }

      const { messageType: mtype, message: actualMsg } = mediaInfo;
      const mediaMessage = actualMsg[mtype];

      if (!mediaMessage.url && !mediaMessage.directPath) {
        if (!mediaMessage.mediaKey) {
          throw new Error('WhatsApp did not include a media download URL or media key for the quoted message. Ask the sender to resend it.');
        }
        if (typeof sock.updateMediaMessage !== 'function') {
          throw new Error('WhatsApp did not include a media download URL or media key for the quoted message. Ask the sender to resend it.');
        }
        await sock.updateMediaMessage(targetMessage);
      }

      const buffer = await downloadViewOnceMedia(sock, targetMessage);

      const caption = mediaMessage.caption || '';
      const ownerNumber = Array.isArray(config.ownerNumber)
        ? config.ownerNumber[0]
        : config.ownerNumber;
      const ownerJid = ownerNumber
        ? normalizeJidWithLid(ownerNumber.includes('@') ? ownerNumber : `${ownerNumber}@s.whatsapp.net`)
        : null;

      if (!ownerJid) {
        return await sock.sendMessage(
          chatId,
          { text: '❌ No owner number configured to forward view-once content.' },
          { quoted: msg }
        );
      }

      // Send to owner's DM only - no messages in the source chat
      const sourceText = `📩 Revealed view-once from ${chatId}`;
      await sock.sendMessage(ownerJid, { text: sourceText });

      if (/video/.test(mtype)) {
        await sock.sendMessage(ownerJid, {
          video: buffer,
          caption,
          mimetype: 'video/mp4'
        });
      } else if (/image/.test(mtype)) {
        await sock.sendMessage(ownerJid, {
          image: buffer,
          caption,
          mimetype: 'image/jpeg'
        });
      } else if (/audio/.test(mtype)) {
        await sock.sendMessage(ownerJid, {
          audio: buffer,
          ptt: mediaMessage.ptt === true,
          mimetype: mediaMessage.mimetype || 'audio/ogg; codecs=opus'
        });
      } else if (mtype === 'documentMessage') {
        await sock.sendMessage(ownerJid, {
          document: buffer,
          fileName: actualMsg.documentMessage?.fileName || 'document',
          caption,
          mimetype: actualMsg.documentMessage?.mimetype || 'application/octet-stream'
        });
      } else if (mtype === 'stickerMessage') {
        await sock.sendMessage(ownerJid, {
          sticker: buffer
        });
      }

      // Delete the trigger command message after successful delivery to owner
      try {
        await sock.sendMessage(chatId, { delete: msg.key });
      } catch (delErr) {
        console.error('[viewonce] failed to delete trigger:', delErr.message);
      }
    } catch (error) {
      console.error('Error in viewonce command:', error);
      await sock.sendMessage(
        msg.key.remoteJid,
        {
          text:
            '❌ Error processing view-once message: ' +
            (error.message || 'Unknown error')
        },
        { quoted: msg }
      );
    }
  }
};
