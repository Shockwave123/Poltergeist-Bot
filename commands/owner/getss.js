/**
 * GetSS Command - Send selected status (replied message) to owner DM
 */

const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const config = require('../../config');
const { normalizeJidWithLid } = require('../../utils/jidHelper');

module.exports = {
  name: 'getss',
  aliases: ['statusget', 'getstatus'],
  category: 'owner',
  description: 'Send the replied status/media to owner DM',
  usage: '.getss (reply to status message)',
  ownerOnly: true,

  async execute(sock, msg, args) {
    try {
      const chatId = msg.key.remoteJid;

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
