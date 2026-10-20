/**
 * Countdown Command - Time remaining until a target date
 * Usage: .countdown <YYYY-MM-DD> [description]
 * Example: .countdown 2026-12-31 New Year
 */

module.exports = {
  name: 'countdown',
  aliases: ['cd', 'countdownto'],
  category: 'utility',
  description: 'Countdown to a target date',
  usage: '.countdown <YYYY-MM-DD> [description]\nExample: .countdown 2026-12-31 New Year',
  async execute(sock, msg, args, extra) {
    try {
      const chatId = extra.from;

      if (args.length < 1) {
        return await sock.sendMessage(chatId, {
          text: '❌ Usage: `.countdown <YYYY-MM-DD> [description]`\nExample: `.countdown 2026-12-31 New Year`'
        }, { quoted: msg });
      }

      const targetStr = args[0];
      const description = args.slice(1).join(' ') || 'Event';
      const target = new Date(targetStr);

      if (isNaN(target.getTime())) {
        return await sock.sendMessage(chatId, {
          text: '❌ Invalid date format. Use YYYY-MM-DD.'
        }, { quoted: msg });
      }

      const now = new Date();
      const diffMs = target.getTime() - now.getTime();

      if (diffMs < 0) {
        return await sock.sendMessage(chatId, {
          text: `⏳ *Countdown: ${description}*\n\nThat date has already passed.`
        }, { quoted: msg });
      }

      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      const diffSeconds = Math.floor((diffMs % (1000 * 60)) / 1000);

      await sock.sendMessage(chatId, {
        text: `⏳ *Countdown: ${description}*\n\n📅 Target: ${targetStr}\n⏱️ ${diffDays} days, ${diffHours} hours, ${diffMinutes} minutes, ${diffSeconds} seconds remaining`
      }, { quoted: msg });

    } catch (error) {
      console.error('[countdown] error:', error);
      await sock.sendMessage(msg.key.remoteJid, {
        text: '❌ Countdown failed: ' + (error.message || 'Unknown error')
      }, { quoted: msg });
    }
  }
};
