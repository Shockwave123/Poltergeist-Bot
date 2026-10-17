/**
 * TTS - Text to Speech Command
 * Supports: direct text, replied-to messages, and tagged messages.
 * No character limit - converts the entire message.
 */

const { generateSpeech, parseTtsInput } = require('../../utils/tts');
const { toPTT } = require('../../utils/converter');

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

function getTextFromMessage(msg, extra) {
  const current = unwrapMessage(msg.message);

  // 1. Direct text from args (already parsed by caller)
  // 2. Replied-to message text
  const contextInfo = current.extendedTextMessage?.contextInfo
    || current.buttonsResponseMessage?.contextInfo
    || current.listResponseMessage?.contextInfo;
  const quoted = unwrapMessage(contextInfo?.quotedMessage);
  const quotedText = quoted?.conversation
    || quoted?.extendedTextMessage?.text
    || '';

  // 3. If bot is mentioned, the text after the mention is the content
  // (handled by parseTtsInput from args)

  return quotedText;
}

module.exports = {
  name: 'tts',
  aliases: ['speak', 'say'],
  category: 'general',
  description: 'Convert text to speech (direct text, reply to a message, or when tagged)',
  usage: '.tts [lang] <text>  |  reply to a message with .tts  |  @bot .tts <text>',

  async execute(sock, msg, args, extra) {
    try {
      const chatId = extra.from;

      // Determine the text to speak
      let text = '';
      let lang = 'en';

      // Check if we have args with text
      if (args && args.length > 0) {
        const parsed = parseTtsInput(args);
        text = parsed.text;
        lang = parsed.lang;
      }

      // If no text from args, try the replied-to message
      if (!text) {
        const quotedText = getTextFromMessage(msg, extra);
        if (quotedText) {
          text = quotedText;
          // Auto-detect language for quoted text
          const { detectLang } = require('../../utils/tts');
          lang = detectLang(text);
        }
      }

      if (!text) {
        return extra.reply(
          'Please provide text to convert to speech.\n\n' +
          'Example: `.tts hi how are you`\n' +
          'Example: `.tts hi namaste kaise ho`\n' +
          'Reply to a message with `.tts` to speak it\n' +
          'Lang codes: en, hi, id, es, fr, de, pt, ar, ja, ko'
        );
      }

      await extra.react('🎙️');

      const mp3Buffer = await generateSpeech(text, lang);

      let audioBuffer = mp3Buffer;
      let mimetype = 'audio/ogg; codecs=opus';

      try {
        audioBuffer = await toPTT(mp3Buffer, 'mp3');
      } catch (convErr) {
        console.error('TTS opus conversion failed:', convErr.message || convErr);
        audioBuffer = mp3Buffer;
        mimetype = 'audio/mpeg';
      }

      await sock.sendMessage(chatId, {
        audio: audioBuffer,
        mimetype,
        ptt: true
      }, { quoted: msg });

      await extra.react('✅');

    } catch (error) {
      console.error('TTS command error:', error);
      try { await extra.react('❌'); } catch { /* ignore */ }
      await extra.reply(`Failed to generate speech: ${error.message}`);
    }
  }
};
