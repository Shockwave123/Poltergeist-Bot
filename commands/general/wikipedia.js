const APIs = require('../../utils/api');

module.exports = {
  name: 'wikipedia',
  aliases: ['wiki'],
  category: 'general',
  description: 'Look up a topic on Wikipedia',
  usage: '.wikipedia <topic>',

  async execute(sock, msg, args, extra) {
    const query = args.join(' ').trim();
    if (!query) return extra.reply('Usage: `.wikipedia <topic>`\nExample: `.wikipedia Lagos`');
    try {
      const result = await APIs.wikiSearch(query);
      const summary = result?.extract || result?.description;
      if (!summary) throw new Error('Wikipedia returned no summary for that topic.');
      const title = result.title || query;
      const url = result.content_urls?.desktop?.page || result.content_urls?.mobile?.page || '';
      return extra.reply(`📚 *${title}*\n\n${summary}${url ? `\n\n${url}` : ''}`);
    } catch (error) {
      return extra.reply(`Wikipedia lookup failed: ${error.message}`);
    }
  }
};