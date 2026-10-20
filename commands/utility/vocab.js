/**
 * Vocab Command - Word definition and synonyms
 * Usage: .vocab <word>
 * Example: .vocab serendipity
 */

const axios = require('axios');

module.exports = {
  name: 'vocab',
  aliases: ['define', 'dictionary', 'word'],
  category: 'utility',
  description: 'Get word definition and synonyms',
  usage: '.vocab <word>\nExample: .vocab serendipity',
  async execute(sock, msg, args, extra) {
    try {
      const chatId = extra.from;
      const word = args.join(' ').trim();

      if (!word) {
        return extra.reply(
          '📖 *Dictionary*\n\n' +
          'Usage: `.vocab <word>`\n' +
          'Example: `.vocab serendipity`'
        );
      }

      const response = await axios.get(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`, {
        timeout: 15000,
      });

      const entries = response.data;
      if (!entries || entries.length === 0) {
        return extra.reply(`❌ No definition found for "${word}".`);
      }

      const entry = entries[0];
      const phonetic = entry.phonetic || entry.phonetics?.[0]?.text || '';
      const meanings = entry.meanings || [];

      const lines = [
        `📖 *${word}*${phonetic ? ` (/${phonetic}/)` : ''}`,
        '',
      ];

      let count = 0;
      for (const meaning of meanings) {
        if (count >= 3) break;
        const partOfSpeech = meaning.partOfSpeech || 'unknown';
        const definitions = meaning.definitions || [];
        if (definitions.length === 0) continue;

        lines.push(`• *${partOfSpeech}:*`);
        lines.push(`  ${definitions[0].definition}`);

        const synonyms = definitions[0].synonyms || [];
        if (synonyms.length > 0) {
          lines.push(`  Synonyms: ${synonyms.slice(0, 5).join(', ')}`);
        }

        lines.push('');
        count += 1;
      }

      if (lines.length <= 2) {
        return extra.reply(`❌ No definition found for "${word}".`);
      }

      await extra.reply(lines.join('\n'));
    } catch (error) {
      console.error('[vocab] error:', error);
      if (error.response && error.response.status === 404) {
        return extra.reply(`❌ Word "${args.join(' ')}" not found in dictionary.`);
      }
      await extra.reply(`❌ Dictionary lookup failed: ${error.message}`);
    }
  }
};
