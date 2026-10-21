/**
 * GetSS Command - Send selected status (replied message) to owner DM
 *
 * Accepts both genuine WhatsApp status forwards (WAProto statusAttributionType /
 * statusMentions) and regular forwarded status messages that WhatsApp flags with
 * isForwarded / forwardingScore and carry the status content in quotedMessage.
 */

const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const config = require('../../config');
const { normalizeJidWithLid } = require('../../utils/jidHelper');

// WAProto ContextInfo.StatusAttributionType values (string enum names)
const STATUS_ATTRIBUTION_FORWARDED_FROM_STATUS = "FORWARDED_FROM_STATUS";
const STATUS_META = "STATUS";

/**
 * Detect whether a message is a genuine WhatsApp status forward.
 * Checks WAProto metadata: statusAttributionType (FORWARDED_FROM_STATUS = 4)
 * and statusMentions array on the WebMessageInfo / ContextInfo.
 */
function isStatusForward(msg) {
  const message = msg.message || {};
  const current = unwrapMessage(message);

  // Check contextInfo on the top-level message for status attribution
  const ctx = current.extendedTextMessage?.contextInfo
    || current.imageMessage?.contextInfo
    || current.videoMessage?.contextInfo
    || current.buttonsResponseMessage?.contextInfo
    || current.listResponseMessage?.contextInfo
    || message.extendedTextMessage?.contextInfo
    || message.imageMessage?.contextInfo
    || message.videoMessage?.contextInfo;

  if (ctx) {
    const attribution = ctx.statusAttributionType;
    if (attribution === STATUS_ATTRIBUTION_FORWARDED_FROM_STATUS) return true;
    if (attribution === STATUS_META) return true;
    if (ctx.statusMentions && Array.isArray(ctx.statusMentions) && ctx.statusMentions.length > 0) return true;
    // Relaxed: a normal forwarded status (status shared as a regular forwarded message)
    // WhatsApp flags these with isForwarded / forwardingScore and carries the status
    // content in quotedMessage, which this command extracts and sends to owner DM.
    if (
      (ctx.isForwarded || ctx.forwardingScore) &&
      ctx.quotedMessage &&
      Object.keys(ctx.quotedMessage).length > 0
    ) {
      return true;
    }
  }

  // Check top-level WebMessageInfo fields for status mentions
  if (msg.message) {
    const top = msg.message;
    if (top.extendedTextMessage?.contextInfo?.statusMentions?.length) return true;
    if (top.imageMessage?.contextInfo?.statusMentions?.length) return true;
    if (top.videoMessage?.contextInfo?.statusMentions?.length) return true;
    /* Also check for string enum status attribution on top-level message */
    if (top.extendedTextMessage?.contextInfo?.statusAttributionType === STATUS_ATTRIBUTION_FORWARDED_FROM_STATUS) return true;
    if (top.extendedTextMessage?.contextInfo?.statusAttributionType === STATUS_META) return true;
    if (top.imageMessage?.contextInfo?.statusAttributionType === STATUS_ATTRIBUTION_FORWARDED_FROM_STATUS) return true;
    if (top.imageMessage?.contextInfo?.statusAttributionType === STATUS_META) return true;
    if (top.videoMessage?.contextInfo?.statusAttributionType === STATUS_ATTRIBUTION_FORWARDED_FROM_STATUS) return true;
    if (top.videoMessage?.contextInfo?.statusAttributionType === STATUS_META) return true;
  }

  // Fallback: check quoted message contextInfo for status attribution
  const quotedCtx = current.extendedTextMessage?.contextInfo
    || current.buttonsResponseMessage?.contextInfo
    || current.listResponseMessage?.contextInfo;
  if (quotedCtx?.quotedMessage) {
    const qCtx = quotedCtx.quotedMessage?.extendedTextMessage?.contextInfo
      || quotedCtx.quotedMessage?.imageMessage?.contextInfo
      || quotedCtx.quotedMessage?.videoMessage?.contextInfo;
    if (qCtx) {
      if (qCtx.statusAttributionType === STATUS_ATTRIBUTION_FORWARDED_FROM_STATUS) return true;
      if (qCtx.statusAttributionType === STATUS_META) return true;
      if (qCtx.statusMentions && Array.isArray(qCtx.statusMentions) && qCtx.statusMentions.length > 0) return true;
    }
  }

  return false;
}

function unwrapMessage(message) {
  let content = message || {};
  for (let depth = 0; depth < 5; depth += 1) {
    const inner = content.ephemeralMessage?.message ||
      content.viewOnceMessage?.message ||
      content.viewOnceMessageV2?.message ||
      content.documentWithCaptionMessage?.message;
    if (!inner) break;
    content = inner;
  }
  return content;
}

module.exports = {
  name: 'getss',
  aliases: ['statusget', 'getstatus'],
  category: 'owner',
  description: 'Forward a WhatsApp status message (reply to a forwarded status) to owner DM',
  usage: '.getss (reply to a forwarded status message)',
  ownerOnly: true,

  async execute(sock, msg, args) {
    try {
      const chatId = msg.key.remoteJid;

      if (!isStatusForward(msg)) {
        return await sock.sendMessage(chatId, {
          text: '❌ This command only works on forwarded WhatsApp status messages.\n\nReply to a message that was forwarded from a status (you will see a "forwarded" label and the status content quoted in the message).'
        }, { quoted: msg });
      }

      const ctx = msg.message?.extendedTextMessage?.contextInfo
        || msg.message?.imageMessage?.contextInfo
        || msg.message?.videoMessage?.contextInfo
        || msg.message?.buttonsResponseMessage?.contextInfo
        || msg.message?.listResponseMessage?.contextInfo;

      if (!ctx || !ctx.quotedMessage) {
        return await sock.sendMessage(chatId, { text: '❗ Reply to the status/forwarded message you want to send to owner DM.' }, { quoted: msg });
      }

      const quotedMsg = ctx.quotedMessage;

      // Try to extract the actual media/text from various status/forwarded wrappers
      let actualMsg = null;
      let mtype = null;

      if (quotedMsg.groupStatusMessageV2?.message) {
        actualMsg = quotedMsg.groupStatusMessageV2.message;
        mtype = Object.keys(actualMsg)[0];
      } else if (quotedMsg.groupStatusMessage?.message) {
        actualMsg = quotedMsg.groupStatusMessage.message;
        mtype = Object.keys(actualMsg)[0];
      } else {
        // Fallback: the quoted message itself may contain the media
        const keys = Object.keys(quotedMsg || {});
        // Prefer common media keys
        const candidates = ['imageMessage','videoMessage','documentMessage','audioMessage','stickerMessage','conversation','extendedTextMessage','contactMessage'];
        for (const k of candidates) {
          if (keys.includes(k)) {
            mtype = k;
            actualMsg = quotedMsg;
            break;
          }
        }
        // If still null, pick the first non-protocol key
        if (!actualMsg && keys.length) {
          mtype = keys.find(k => !k.endsWith('Message') || k !== 'protocolMessage') || keys[0];
          actualMsg = quotedMsg;
        }
      }

      if (!actualMsg || !mtype) {
        return await sock.sendMessage(chatId, { text: '❌ Could not extract media/text from the replied message.' }, { quoted: msg });
      }

      // Handle text status
      if (mtype === 'conversation' || mtype === 'extendedTextMessage' || mtype === 'text') {
        const text = actualMsg.conversation || actualMsg.extendedTextMessage?.text || '';
        const ownerNumber = Array.isArray(config.ownerNumber) ? config.ownerNumber[0] : config.ownerNumber;
        const ownerJid = ownerNumber ? normalizeJidWithLid(ownerNumber.includes('@') ? ownerNumber : `${ownerNumber}@s.whatsapp.net`) : null;

        if (!ownerJid) return await sock.sendMessage(chatId, { text: '❌ No owner configured.' }, { quoted: msg });

        await sock.sendMessage(ownerJid, { text: `📩 Status forwarded from ${chatId}\n\n${text}` });
        return await sock.sendMessage(chatId, { react: { text: '✅', key: msg.key } });
      }

      // Determine download type
      const downloadType = mtype === 'imageMessage' ? 'image' : mtype === 'videoMessage' ? 'video' : mtype === 'audioMessage' ? 'audio' : 'document';

      // If the media is wrapped (e.g., groupStatusMessageV2.message.imageMessage), adjust pointer
      let mediaObject = actualMsg[mtype] || actualMsg;
      if (actualMsg[mtype] && (actualMsg[mtype].message || actualMsg[mtype].mimetype)) {
        mediaObject = actualMsg[mtype];
      }

      // Download media
      const stream = await downloadContentFromMessage(mediaObject, downloadType);
      let buffer = Buffer.from([]);
      for await (const chunk of stream) {
        buffer = Buffer.concat([buffer, chunk]);
      }

      const caption = mediaObject?.caption || '';
      const ownerNumber = Array.isArray(config.ownerNumber) ? config.ownerNumber[0] : config.ownerNumber;
      const ownerJid = ownerNumber ? normalizeJidWithLid(ownerNumber.includes('@') ? ownerNumber : `${ownerNumber}@s.whatsapp.net`) : null;

      if (!ownerJid) return await sock.sendMessage(chatId, { text: '❌ No owner configured.' }, { quoted: msg });

      // Send to owner
      if (/video/.test(mtype)) {
        await sock.sendMessage(ownerJid, { video: buffer, caption });
      } else if (/image/.test(mtype)) {
        await sock.sendMessage(ownerJid, { image: buffer, caption });
      } else if (/audio/.test(mtype)) {
        await sock.sendMessage(ownerJid, { audio: buffer, ptt: true });
      } else if (mtype === 'documentMessage' || mtype === 'document') {
        await sock.sendMessage(ownerJid, { document: buffer, fileName: mediaObject?.fileName || 'file', caption });
      } else if (mtype === 'stickerMessage') {
        await sock.sendMessage(ownerJid, { sticker: buffer });
      } else {
        // Generic fallback: send as document
        await sock.sendMessage(ownerJid, { document: buffer, fileName: 'file' });
      }

      await sock.sendMessage(chatId, { react: { text: '✅', key: msg.key } });
    } catch (error) {
      console.error('Error in getss command:', error);
      try {
        await sock.sendMessage(msg.key.remoteJid, { text: '❌ Error sending status: ' + (error.message || 'Unknown') }, { quoted: msg });
      } catch (e) {}
    }
  }
};
