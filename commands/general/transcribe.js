/**
 * Transcribe a quoted WhatsApp voice note into text.
 */

const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const { transcribeAudio } = require('../../utils/speechToText');
const { getKey } = require('../../utils/userApiKeys');

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
  name: 'transcribe',
  aliases: ['stt', 'totext', 'voicetotext', 'voicetotxt'],
  category: 'general',
  description: 'Transcribe an attached, replied-to, or tagged audio recording into text',
  usage: '.transcribe (attach/reply to audio)  |  @bot .transcribe (when tagged)',

  async execute(sock, msg, args, extra) {
    try {
      const current = unwrapMessage(msg.message);
      const contextInfo = current.extendedTextMessage?.contextInfo
        || current.buttonsResponseMessage?.contextInfo
        || current.listResponseMessage?.contextInfo;
      const quotedMessage = unwrapMessage(contextInfo?.quotedMessage);
      const currentAudio = current.audioMessage || (current.documentMessage?.mimetype?.startsWith('audio/') ? current.documentMessage : null);
      const quotedAudio = quotedMessage.audioMessage || (quotedMessage.documentMessage?.mimetype?.startsWith('audio/') ? quotedMessage.documentMessage : null);
      const selectedMessage = currentAudio ? current : quotedMessage;
      const audioMessage = currentAudio || quotedAudio;

      if (!audioMessage) {
        return extra.reply('Attach or reply to an audio file with `.transcribe` and I will turn it into text.');
      }

      const targetMessage = currentAudio
        ? { key: msg.key, message: selectedMessage }
        : {
          key: {
            remoteJid: extra.from,
            id: contextInfo.stanzaId,
            participant: contextInfo.participant,
          },
          message: selectedMessage,
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
        audioMessage.mimetype || (audioMessage.ptt ? 'audio/ogg' : 'audio/mpeg'),
        { apiKey: getKey(extra.sender), senderId: extra.sender },
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
