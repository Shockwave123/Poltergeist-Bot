/**
 * IP Command - IP address geolocation lookup
 * Usage: .ip [ip address or domain]
 * Example: .ip 8.8.8.8
 * Example: .ip google.com
 */

const axios = require('axios');

module.exports = {
  name: 'ip',
  aliases: ['iplookup', 'geoip'],
  category: 'utility',
  description: 'Look up IP address geolocation info',
  usage: '.ip [ip address or domain]\nExample: .ip 8.8.8.8\nExample: .ip google.com',
  async execute(sock, msg, args, extra) {
    try {
      const chatId = extra.from;
      const query = args.join(' ').trim();

      if (!query) {
        return extra.reply(
          '🌐 *IP Lookup*\n\n' +
          'Usage: `.ip <ip address or domain>`\n' +
          'Example: `.ip 8.8.8.8`\n' +
          'Example: `.ip google.com`'
        );
      }

      const response = await axios.get(`https://ipapi.co/${query}/json/`, {
        timeout: 15000,
      });
      const data = response.data;

      if (data.error) {
        return extra.reply(`❌ ${data.reason || 'Could not look up that IP/domain.'}`);
      }

      const lines = [
        `🌐 *IP Lookup: ${query}*`,
        '',
        `• IP: ${data.ip}`,
        `• City: ${data.city || 'N/A'}`,
        `• Region: ${data.region || 'N/A'}`,
        `• Country: ${data.country_name || 'N/A'} (${data.country_code || 'N/A'})`,
        `• ISP/Org: ${data.org || 'N/A'}`,
        `• ASN: ${data.asn || 'N/A'}`,
        `• Timezone: ${data.timezone || 'N/A'}`,
        `• Latitude: ${data.latitude || 'N/A'}`,
        `• Longitude: ${data.longitude || 'N/A'}`,
        `• Currency: ${data.currency || 'N/A'}`,
        `• Language: ${data.languages || 'N/A'}`,
      ];

      await extra.reply(lines.join('\n'));
    } catch (error) {
      console.error('[ip] error:', error);
      await extra.reply(`❌ IP lookup failed: ${error.message}`);
    }
  }
};
