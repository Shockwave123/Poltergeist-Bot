/**
 * Transcribe a quoted WhatsApp voice note into text.
 */

const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const { transcribeAudio } = require('../../utils/speechToText');

function getContextInfo(message) {
  return message.message?.extendedTextMessage?.contextInfo
    || message.message?.buttonsResponseMessage?.contextInfo
    || message.message?.listResponseMessage?.contextInfo;
}

module.exports = {
  name: 'transcribe',
  aliases: ['stt', 'totext', 'voicetotext', 'voicetotxt'],
  category: 'general',
  description: 'Convert a quoted voice note into text',
  usage: '.transcribe (reply to a voice note)',

  async execute(sock, msg, args, extra) {
    try {
      const contextInfo = getContextInfo(msg);
      const quotedMessage = contextInfo?.quotedMessage;
      const audioMessage = quotedMessage?.audioMessage;

      if (!quotedMessage || !audioMessage) {
        return extra.reply('Reply to a voice note with `.transcribe` and I will turn it into text.');
      }

      const targetMessage = {
        key: {
          remoteJid: extra.from,
          id: contextInfo.stanzaId,
          participant: contextInfo.participant,
        },
        message: quotedMessage,
      };

      await extra.react('🎧');
      const audioBuffer = await downloadMediaMessage(
        targetMessage,
        'buffer',
        {},
        { logger: undefined, reuploadRequest: sock.updateMediaMessage },
      );

      if (!audioBuffer?.length) {
        throw new Error('The voice note could not be downloaded.');
      }

      const text = await transcribeAudio(
        audioBuffer,
        audioMessage.fileName || 'voice.ogg',
        audioMessage.mimetype || 'audio/ogg',
      );

      await extra.reply(`📝 ${text}`);
      await extra.react('✅');
    } catch (error) {
      console.error('Transcription command error:', error);
      try { await extra.react('❌'); } catch { /* ignore reaction errors */ }
      await extra.reply(`❌ Could not transcribe that voice note: ${error.message}`);
    }
  },
};
