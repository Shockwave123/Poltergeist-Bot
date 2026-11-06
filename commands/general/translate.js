/**
 * Translate Command
 */

const { sendVoiceNote } = require('../../utils/voiceNote');
const { generateContent } = require('../../utils/googleAi');
const { getKey } = require('../../utils/userApiKeys');
const fetch = require('node-fetch');

const TRANSLATION_TIMEOUT_MS = 10000;

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
  return quoted?.conversation
    || quoted?.extendedTextMessage?.text
    || quoted?.imageMessage?.caption
    || quoted?.videoMessage?.caption
    || quoted?.documentMessage?.caption
    || '';
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
  description: 'Translate text between supported languages (supports replies and voice output)',
  usage: '.translate <lang_code> <text>  |  .translate <lang_code> (reply to a message)  |  Add --audio for voice',
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
          .map(([k, v]) => `• *${k}* — ${v}`)
          .join('\n');
        return extra.reply(
          '🌐 *Translator — Supported Languages*\n\n' +
          codes + '\n\n' +
          '*Usage:*\n' +
          `• .translate <lang_code> <text>\n` +
          `• .translate <lang_code> (reply to a message)\n` +
          '• Add `--audio` for voice output\n\n' +
          '*Example:* `.translate es Hello world`\n' +
          '*Example:* `.translate fr Bonjour --audio`'
        );
      }
      if (!LANGUAGE_CODES[targetLang]) {
        await extra.react('❌');
        return extra.reply(
          '❌ Unknown language code: *' + targetLang + '*\n\n' +
          'Use `.translate` to see all supported language codes.'
        );
      }
      if (!textToTranslate) {
        await extra.react('❌');
        return extra.reply('❌ No text found. Provide text or reply to a message.');
      }

      await extra.react('⏳');
      let translated = '';
      const failures = [];
      try {
        const googleUrl = new URL('https://translate.googleapis.com/translate_a/single');
        googleUrl.search = new URLSearchParams({
          client: 'gtx',
          sl: 'auto',
          tl: targetLang,
          dt: 't',
          q: textToTranslate
        }).toString();
        const response = await fetch(googleUrl.toString(), { timeout: TRANSLATION_TIMEOUT_MS });
        if (!response.ok) throw new Error(`Google Translate returned HTTP ${response.status}`);
        const data = await response.json();
        translated = Array.isArray(data?.[0])
          ? data[0].map((segment) => Array.isArray(segment) ? segment[0] : '').filter(Boolean).join('')
          : '';
        if (!translated.trim()) throw new Error('Google Translate returned an empty translation');
      } catch (error) {
        failures.push(`Google Translate: ${error.message}`);
      }

      if (!translated.trim()) {
        try {
          const myMemoryUrl = new URL('https://api.mymemory.translated.net/get');
          myMemoryUrl.search = new URLSearchParams({
            q: textToTranslate,
            langpair: `autodetect|${targetLang}`
          }).toString();
          const response = await fetch(myMemoryUrl.toString(), { timeout: TRANSLATION_TIMEOUT_MS });
          if (!response.ok) throw new Error(`MyMemory returned HTTP ${response.status}`);
          const data = await response.json();
          translated = data?.responseData?.translatedText || '';
          if (!translated.trim()) throw new Error(data?.responseDetails || 'MyMemory returned an empty translation');
        } catch (error) {
          failures.push(`MyMemory: ${error.message}`);
        }
      }

      if (!translated.trim()) {
        try {
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
            timeout: 10000,
            totalTimeout: 12000,
            fast: true
          });
        } catch (error) {
          failures.push(`AI fallback: ${error.message}`);
          throw new Error(`All translation services failed.\n${failures.join('\n')}`);
        }
      }
      translated = String(translated || '').trim();
      if (!translated) throw new Error('Empty translation');

      await extra.react('✅');
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
      try { await extra.react('❌'); } catch { /* ignore */ }
      await extra.reply(
        '❌ Translation failed!\n\n' +
        error.message + '\n\n' +
        'Use `.translate` to see all supported language codes.'
      );
    }
  }
};
