/**
 * ShortURL Command - Shorten a URL
 * Usage: .shorturl <url>
 * Example: .shorturl https://example.com/very/long/link
 */

const axios = require('axios');

module.exports = {
  name: 'shorturl',
  aliases: ['shorten', 'urlshort'],
  category: 'utility',
  description: 'Shorten a long URL',
  usage: '.shorturl <url>\nExample: .shorturl https://example.com/page',
  async execute(sock, msg, args, extra) {
    try {
      const chatId = extra.from;
      const url = args.join(' ').trim();

      if (!url) {
        return extra.reply(
          '🔗 *URL Shortener*\n\n' +
          'Usage: `.shorturl <url>`\n' +
          'Example: `.shorturl https://example.com/long-page`'
        );
      }

      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        return extra.reply('❌ Please provide a full URL starting with http:// or https://');
      }

      const response = await axios.get('https://tinyurl.com/api-create.php', {
        params: { url },
        timeout: 15000,
      });

      const short = response.data.trim();
      if (short.startsWith('Error') || short.length < 5) {
        throw new Error('Could not shorten URL');
      }

      await extra.reply(
        `🔗 *Shortened URL*\n\nOriginal: ${url}\nShort: ${short}`
      );
    } catch (error) {
      console.error('[shorturl] error:', error);
      await extra.reply(`❌ URL shortening failed: ${error.message}`);
    }
  }
};
