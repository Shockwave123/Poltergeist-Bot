/**
 * ViewOnce Command - Reveal view-once messages
 */

const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const config = require('../../config');
const { normalizeJidWithLid } = require('../../utils/jidHelper');

const MEDIA_TYPES = ['imageMessage', 'videoMessage', 'audioMessage'];

function unwrapMessage(message) {
  let content = message || {};
  for (let depth = 0; depth < 5; depth += 1) {
    const inner = content.ephemeralMessage?.message
      || content.documentWithCaptionMessage?.message;
    if (!inner) break;
    content = inner;
  }
  return content;
}

function getViewOnceMedia(quotedMessage) {
  const quoted = unwrapMessage(quotedMessage);
  const viewOnceContent = quoted.viewOnceMessageV2Extension?.message
    || quoted.viewOnceMessageV2?.message
    || quoted.viewOnceMessage?.message;
  const mediaMessage = viewOnceContent ? unwrapMessage(viewOnceContent) : quoted;
  const messageType = MEDIA_TYPES.find((type) =>
    mediaMessage[type] && (viewOnceContent || mediaMessage[type].viewOnce)
  );
  return messageType
    ? { messageType, message: { [messageType]: mediaMessage[messageType] } }
    : null;
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
  aliases: ['readvo', 'vv', 'readviewonce', 'wow'],
  category: 'general',
  description: 'Reveal view-once messages and forward them to owner DM',
  usage: '.viewonce (reply to view-once message)',
  getViewOnceMedia,
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

      if (!ctx?.quotedMessage || !ctx?.stanzaId) {
        return await sock.sendMessage(
          chatId,
          { text: '🗑️ Reply to a *view-once* message to reveal it.' },
          { quoted: msg }
        );
      }

      const mediaInfo = getViewOnceMedia(ctx.quotedMessage);
      if (!mediaInfo) {
        return await sock.sendMessage(
          chatId,
          { text: '❌ This is not a view-once message!' },
          { quoted: msg }
        );
      }

      const { messageType: mtype, message: actualMsg } = mediaInfo;
      const mediaMessage = actualMsg[mtype];
      const targetMessage = {
        key: {
          remoteJid: chatId,
          id: ctx.stanzaId,
          participant: ctx.participant
        },
        message: ctx.quotedMessage
      };

      if (!mediaMessage.url && !mediaMessage.directPath) {
        if (!mediaMessage.mediaKey || typeof sock.updateMediaMessage !== 'function') {
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
      }

      await sock.sendMessage(chatId, { react: { text: '✅', key: msg.key } });

      // Remove the trigger command message after successful delivery to owner
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
