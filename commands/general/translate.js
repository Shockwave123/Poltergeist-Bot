/**
 * Translate Command - Translate text to different languages
 */

const APIs = require('../../utils/api');
const { sendVoiceNote } = require('../../utils/voiceNote');

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
      
      const result = await APIs.translate(text, targetLang);
      const translated = result.translation || result;
      
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
