/**
 * TTX - Translate to Speech Command
 * Translates text into a target language, then synthesizes it as speech.
 * Usage: .ttx <lang code> <text>
 * Example: .ttx es Hello world
 */

const { generateSpeech, parseTtsInput, detectLang } = require('../../utils/tts');
const { toPTT } = require('../../utils/converter');
const APIs = require('../../utils/api');

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

function getTextFromMessage(msg) {
  const current = unwrapMessage(msg.message);
  const contextInfo = current.extendedTextMessage?.contextInfo
    || current.buttonsResponseMessage?.contextInfo
    || current.listResponseMessage?.contextInfo;
  const quoted = unwrapMessage(contextInfo?.quotedMessage);
  return quoted?.conversation || quoted?.extendedTextMessage?.text || '';
}

module.exports = {
  name: 'ttx',
  aliases: ['ttsx', 'speaktrans'],
  category: 'general',
  description: 'Translate text into a language, then speak it (translate → synthesize → speech)',
  usage: '.ttx <lang code> <text>  |  reply to a message with .ttx <lang code>',
  async execute(sock, msg, args, extra) {
    try {
      const chatId = extra.from;

      let targetLang = '';
      let text = '';

      // Case 1: .ttx <lang> <text> directly
      if (args.length >= 2) {
        const first = args[0].toLowerCase();
        if (['en', 'hi', 'id', 'es', 'fr', 'de', 'pt', 'ar', 'ja', 'ko'].includes(first)) {
          targetLang = first;
          text = args.slice(1).join(' ').trim();
        } else {
          return extra.reply('❌ Invalid language code. Use: en, hi, id, es, fr, de, pt, ar, ja, ko');
        }
      }
      // Case 2: reply to a message with .ttx <lang>
      else if (args.length === 1) {
        targetLang = args[0].toLowerCase();
        if (!['en', 'hi', 'id', 'es', 'fr', 'de', 'pt', 'ar', 'ja', 'ko'].includes(targetLang)) {
          return extra.reply('❌ Invalid language code. Use: en, hi, id, es, fr, de, pt, ar, ja, ko');
        }
        text = getTextFromMessage(msg);
      }

      if (!text) {
        return extra.reply(
          '❗ Please provide text to translate and speak.\n\n' +
          'Usage: `.ttx <lang> <text>`\n' +
          'Example: `.ttx es Hello world`\n' +
          'Or reply to a message with: `.ttx es`\n' +
          'Lang codes: en, hi, id, es, fr, de, pt, ar, ja, ko'
        );
      }

      await extra.react('🌐');

      // Step 1: Translate
      let translated;
      try {
        const result = await APIs.translate(text, targetLang);
        translated = result?.translation || result?.text || result || '';
      } catch (e) {
        translated = '';
      }
      if (!translated || !String(translated).trim()) {
        // Fallback: Google Translate public endpoint
        try {
          const axios = require('axios');
          const gt = await axios.get('https://translate.googleapis.com/translate_a/single', {
            params: { client: 'gtx', sl: 'auto', tl: targetLang, dt: 't', q: text },
            timeout: 20000
          });
          const data = gt.data;
          if (data && data[0] && data[0][0] && data[0][0][0]) {
            translated = data[0][0][0];
          }
        } catch (e2) {
          translated = '';
        }
      }
      translated = String(translated || '').trim();
      if (!translated) throw new Error('Translation returned empty result');

      // Step 2: Synthesize the translated text
      const mp3Buffer = await generateSpeech(translated, targetLang);

      let audioBuffer = mp3Buffer;
      let mimetype = 'audio/mpeg';
      try {
        audioBuffer = await toPTT(mp3Buffer, 'mp3');
        mimetype = 'audio/ogg; codecs=opus';
      } catch (convErr) {
        console.error('TTX opus conversion failed:', convErr.message || convErr);
      }

      await sock.sendMessage(chatId, {
        audio: audioBuffer,
        mimetype,
        ptt: true,
        caption: `🌐 Translated to ${targetLang.toUpperCase()}: ${translated}`
      }, { quoted: msg });

      await extra.react('✅');
    } catch (error) {
      console.error('[ttx] error:', error);
      try { await extra.react('❌'); } catch { /* ignore */ }
      await extra.reply(`❌ TTX failed: ${error.message}`);
    }
  }
};
