/**
 * Translate Command
 */

const APIs = require('../../utils/api');
const { sendVoiceNote } = require('../../utils/voiceNote');
const { generateContent } = require('../../utils/googleAi');
const { getKey } = require('../../utils/userApiKeys');
const fetch = require('node-fetch');

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

const LANGUAGE_CODES = {
  en: 'English', es: 'Spanish', fr: 'French', de: 'German', it: 'Italian',
  pt: 'Portuguese', ru: 'Russian', ja: 'Japanese', ko: 'Korean', zh: 'Chinese',
  ar: 'Arabic', hi: 'Hindi', nl: 'Dutch', tr: 'Turkish', pl: 'Polish'
};

module.exports = {
  name: 'translate',
  aliases: ['tr', 'trans', 'trt'],
  category: 'general',
  description: 'Translate text (supports replies and voice output)',
  usage: '.translate <lang> <text> [--audio]\nReply: .translate <lang> [--audio]',
  async execute(sock, msg, args, extra) {
    try {
      const chatId = extra.from;
      const wantsAudio = args.some((a) => ['--audio', '--voice'].includes(a.toLowerCase()));
      const input = args.filter((a) => !['--audio', '--voice'].includes(a.toLowerCase()));
      let targetLang = '';
      let textToTranslate = '';
      if (input.length === 1) {
        targetLang = input[0].toLowerCase();
        textToTranslate = getTextFromMessage(msg);
      } else if (input.length >= 2) {
        targetLang = input[0].toLowerCase();
        textToTranslate = input.slice(1).join(' ');
      } else {
        const codes = Object.entries(LANGUAGE_CODES)
          .map(([k, v]) => k + ' - ' + v)
          .join(', ');
        return extra.reply('🌐 *Translator*\n\n' +
          'Usage: .translate <lang> <text>\n' +
          'Reply: .translate <lang> (reply to msg)\n' +
          'Add --audio for voice\n\n' +
          'Example: .translate es Hello world\n\n' +
          'Codes: ' + codes);
      }
      if (!LANGUAGE_CODES[targetLang]) {
        return extra.reply('❌ Unknown code: ' + targetLang +
          '\n\nSupported: ' + Object.keys(LANGUAGE_CODES).join(', '));
      }
      if (!textToTranslate) {
        return extra.reply('❌ No text found. Provide text or reply to a message.');
      }
      await extra.reply('🔄 Translating... ');
      let translated = '';
      try {
        const result = await APIs.translate(textToTranslate, targetLang);
        translated = result?.translation || result?.text || result || '';
      } catch (e) {}
      if (!translated || !translated.trim()) {
        try {
          const response = await fetch(
            'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=' +
            targetLang + '&dt=t&q=' + encodeURIComponent(textToTranslate),
            { timeout: 20000 }
          );
          if (response.ok) {
            const data = await response.json();
            if (data && data[0] && data[0][0] && data[0][0][0]) {
              translated = data[0][0][0];
            }
          }
        } catch (e) {}
      }
      if (!translated || !translated.trim()) {
        try {
          const response = await fetch(
            'https://api.mymemory.translated.net/get?q=' +
            encodeURIComponent(textToTranslate) + '&langpair=auto|' + targetLang,
            { timeout: 20000 }
          );
          if (response.ok) {
            const data = await response.json();
            if (data && data.responseData && data.responseData.translatedText) {
              translated = data.responseData.translatedText;
            }
          }
        } catch (e) {}
      }
      if (!translated || !translated.trim()) {
        translated = await generateContent([
          {
            text: 'Translate into ' + targetLang + ' (' + LANGUAGE_CODES[targetLang] +
              '). Return only the translation.\n\n' + textToTranslate
          }
        ], {
          apiKey: getKey(extra.sender),
          senderId: extra.sender,
          temperature: 0.2,
          maxOutputTokens: 1200,
          timeout: 45000
        });
      }
      translated = String(translated || '').trim();
      if (!translated) throw new Error('Empty translation');
      const replyText =
        '🌐 *Translation*\n\n' +
        '📝 Original: ' + textToTranslate + '\n' +
        '🔤 Translated: ' + translated + '\n' +
        '🌍 Language: ' + targetLang.toUpperCase() +
        ' (' + LANGUAGE_CODES[targetLang] + ')';
      await extra.reply(replyText);
      if (wantsAudio) {
        await sendVoiceNote(sock, extra.from, translated, msg, targetLang);
      }
    } catch (error) {
      console.error('[translate] error:', error);
      await extra.reply(
        '❌ Translation failed!\n\n' +
        error.message + '\n\n' +
        'Codes: ' + Object.keys(LANGUAGE_CODES).join(', ')
      );
    }
  }
};
