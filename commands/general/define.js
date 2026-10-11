const axios = require('axios');

module.exports = {
  name: 'define',
  aliases: ['meaning', 'dictionary'],
  category: 'general',
  description: 'Get an English dictionary definition',
  usage: '.define <word>',

  async execute(sock, msg, args, extra) {
    const word = args.join(' ').trim();
    if (!word) return extra.reply('Usage: `.define <word>`\nExample: `.define resilient`');
    try {
      const response = await axios.get(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`, { timeout: 12000 });
      const entry = response.data?.[0];
      const meanings = (entry?.meanings || []).flatMap((meaning) =>
        (meaning.definitions || []).slice(0, 2).map((definition) => ({
          part: meaning.partOfSpeech,
          text: definition.definition,
          example: definition.example
        }))
      ).slice(0, 4);
      if (!meanings.length) throw new Error('No definition found.');
      const lines = [`📖 *${entry.word || word}*`, entry.phonetic || '', ''];
      meanings.forEach((meaning, index) => {
        lines.push(`${index + 1}. _${meaning.part || 'Meaning'}:_ ${meaning.text}`);
        if (meaning.example) lines.push(`   Example: ${meaning.example}`);
      });
      return extra.reply(lines.filter(Boolean).join('\n'));
    } catch (error) {
      return extra.reply(`Could not find a definition for "${word}". ${error.response?.status === 404 ? '' : error.message}`.trim());
    }
  }
};