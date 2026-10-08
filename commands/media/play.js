const path = require('node:path');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const { fetchPublicUrl } = require('../../utils/webContent');

const MAX_AUDIO_BYTES = 45 * 1024 * 1024;
const AUDIO_TYPES = {
  '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.wav': 'audio/wav',
  '.ogg': 'audio/ogg', '.opus': 'audio/ogg', '.oga': 'audio/ogg', '.webm': 'audio/webm'
};

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
  name: 'play',
  aliases: ['playaudio'],
  category: 'media',
  description: 'Send a replied-to audio file or direct public audio URL as a WhatsApp audio message',
  usage: '.play (reply to audio) or .play <direct audio URL>',

  async execute(sock, msg, args, extra) {
    try {
      const current = unwrapMessage(msg.message);
      const quoted = current.extendedTextMessage?.contextInfo?.quotedMessage;
      const quotedKey = current.extendedTextMessage?.contextInfo;
      const quotedContent = unwrapMessage(quoted);
      const audioMessage = current.audioMessage || quotedContent.audioMessage;
      const documentMessage = current.documentMessage || quotedContent.documentMessage;
      let audio;
      let mimetype;
      let fileName = 'audio';

      if (audioMessage || (documentMessage && String(documentMessage.mimetype || '').startsWith('audio/'))) {
        const direct = Boolean(current.audioMessage || current.documentMessage);
        const sourceMessage = direct
          ? { key: msg.key, message: current }
          : { key: { remoteJid: extra.from, id: quotedKey?.stanzaId, participant: quotedKey?.participant }, message: quotedContent };
        audio = await downloadMediaMessage(sourceMessage, 'buffer', {}, {
          logger: undefined,
          reuploadRequest: sock.updateMediaMessage
        });
        mimetype = audioMessage?.mimetype || documentMessage?.mimetype || 'audio/mpeg';
        fileName = documentMessage?.fileName || 'audio';
      } else if (args[0]) {
        const url = args[0];
        const response = await fetchPublicUrl(url, { maxBytes: MAX_AUDIO_BYTES, accept: 'audio/*,application/octet-stream' });
        fileName = path.basename(new URL(response.url).pathname) || 'audio';
        const extension = path.extname(fileName).toLowerCase();
        mimetype = response.contentType.split(';')[0].trim();
        if (mimetype === 'application/octet-stream') mimetype = AUDIO_TYPES[extension] || mimetype;
        if (!mimetype.startsWith('audio/')) {
          throw new Error('The link must return a direct audio file, not a streaming or social page.');
        }
        audio = response.buffer;
      } else {
        return extra.reply('Reply to an audio file with `.play`, or use `.play <direct public audio URL>`.');
      }

      if (!Buffer.isBuffer(audio) || !audio.length) throw new Error('The audio file is empty or could not be downloaded.');
      if (audio.length > MAX_AUDIO_BYTES) throw new Error('Audio must be 45 MB or smaller.');
      return sock.sendMessage(extra.from, { audio, mimetype, ptt: false, fileName }, { quoted: msg });
    } catch (error) {
      console.error('[play] failed:', error.message);
      return extra.reply(`Could not send that audio: ${error.message}`);
    }
  }
};