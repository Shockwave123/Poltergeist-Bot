/**
 * Translate Command - Translate text to different languages
 */

const APIs = require('../../utils/api');
const { sendVoiceNote } = require('../../utils/voiceNote');
const { generateContent } = require('../../utils/googleAi');
const { getKey } = require('../../utils/userApiKeys');

module.exports = {
  name: 'translate',
  aliases: ['tr', 'trans'],
  category: 'general',
  description: 'Translate text to another language',
  usage: '.translate <lang code> <text> [--audio]',
  
  async execute(sock, msg, args, extra) {
    try {
      const wantsAudio = args.some((arg) => ['--audio', '--voice'].includes(arg.toLowerCase()));
      const input = args.filter((arg) => !['--audio', '--voice'].includes(arg.toLowerCase()));
      if (input.length < 2) {
        return extra.reply('Usage: `.translate <language> <text> [--audio]`\nExample: `.translate es Hello world --audio`');
      }
      
      const targetLang = input[0];
      const text = input.slice(1).join(' ');
      
      await extra.reply('🔄 Translating...');
      
      let translated;
      try {
        const result = await APIs.translate(text, targetLang);
        translated = result?.translation || result?.text || result;
      } catch (translationError) {
        translated = '';
      }
      if (typeof translated !== 'string' || !translated.trim()) {
        translated = await generateContent([{
          text: `Translate the text into language code ${targetLang}. Return only the translation, preserving meaning and tone.\n\n${text}`
        }], {
          apiKey: getKey(extra.sender),
          senderId: extra.sender,
          temperature: 0.2,
          maxOutputTokens: 1200,
          timeout: 45000
        });
      }
      translated = String(translated).trim();
      
      let replyText = `🌐 *Translation*\n\n`;
      replyText += `📝 Original: ${text}\n`;
      replyText += `🔤 Translated: ${translated}\n`;
      replyText += `🌍 Language: ${targetLang.toUpperCase()}`;
      
      await extra.reply(replyText);
      if (wantsAudio) await sendVoiceNote(sock, extra.from, translated, msg, targetLang);
      
    } catch (error) {
      await extra.reply(`❌ Translation failed!\n\nSupported codes: en, es, fr, de, it, pt, ru, ja, ko, zh\n\nError: ${error.message}`);
    }
  }
};
