/**
 * Time Command - Show current time for a timezone
 * Usage: .time <timezone>
 * Example: .time Asia/Karachi
 * Example: .time (shows UTC + common zones)
 */

const moment = require('moment-timezone');

const COMMON_ZONES = [
  'UTC', 'Asia/Karachi', 'Asia/Kolkata', 'Asia/Dubai', 'Asia/Riyadh',
  'America/New_York', 'America/Los_Angeles', 'Europe/London', 'Europe/Dubai',
  'Asia/Tokyo', 'Asia/Shanghai', 'Australia/Sydney'
];

module.exports = {
  name: 'time',
  aliases: ['clock', 'timezone'],
  category: 'utility',
  description: 'Show current time for a timezone (defaults to UTC)',
  usage: '.time [timezone]  |  Example: .time Asia/Karachi',
  async execute(sock, msg, args, extra) {
    try {
      const chatId = extra.from;

      if (args.length === 0) {
        const lines = ['🕐 *Current Time (Common Zones)*', ''];
        for (const zone of COMMON_ZONES) {
          const t = moment.tz(zone).format('hh:mm A');
          const d = moment.tz(zone).format('YYYY-MM-DD');
          lines.push(`• ${zone}: *${t}* (${d})`);
        }
        lines.push('', 'Usage: `.time Asia/Karachi`');
        return await sock.sendMessage(chatId, { text: lines.join('\n') }, { quoted: msg });
      }

      const zone = args.join(' ').trim();

      if (!moment.tz.zone(zone)) {
        return await sock.sendMessage(chatId, {
          text: `❌ Unknown timezone "${zone}".\n\nExample: .time Asia/Karachi\nExample: .time America/New_York`
        }, { quoted: msg });
      }

      const t = moment.tz(zone).format('dddd, h:mm:ss A');
      const d = moment.tz(zone).format('YYYY-MM-DD');
      const offset = moment.tz(zone).format('Z');

      await sock.sendMessage(chatId, {
        text: `🕐 *Time in ${zone}*\n\n${t}\n${d}\nUTC Offset: ${offset}`
      }, { quoted: msg });

    } catch (error) {
      console.error('[time] error:', error);
      await sock.sendMessage(msg.key.remoteJid, {
        text: '❌ Failed to get time. Try: `.time Asia/Karachi`'
      }, { quoted: msg });
    }
  }
};
