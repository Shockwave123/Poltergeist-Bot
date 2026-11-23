/**
 * Uptime Command - Display bot uptime since it was started
 */

const config = require('../../config');
const packageInfo = require('../../package.json');

/**
 * Format time difference into human-readable string
 * @param {number} seconds - Total seconds of uptime
 * @returns {string} Formatted uptime string
 */
function formatUptime(seconds) {
  if (seconds <= 0) {
    return '0 seconds';
  }
  
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  const parts = [];
  
  if (days > 0) {
    parts.push(`${days} ${days === 1 ? 'day' : 'days'}`);
  }
  if (hours > 0) {
    parts.push(`${hours} ${hours === 1 ? 'hour' : 'hours'}`);
  }
  if (minutes > 0) {
    parts.push(`${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`);
  }
  if (secs > 0 || parts.length === 0) {
    parts.push(`${secs} ${secs === 1 ? 'second' : 'seconds'}`);
  }
  
  return parts.join(', ');
}

module.exports = {
  name: 'uptime',
  aliases: ['runtime', 'botuptime', 'alive'],
  category: 'general',
  description: 'Show how long the bot has been running',
  usage: '.uptime',
  
  async execute(sock, msg, args, extra) {
    try {
      const stats = typeof sock.getConnectionStats === 'function'
        ? sock.getConnectionStats()
        : null;
      const uptimeSeconds = stats?.uptimeSeconds ?? process.uptime();
      const uptime = formatUptime(uptimeSeconds);
      const botName = config.botName || 'Bot';
      const botVersion = `V${packageInfo.version}`;
      const connected = typeof stats?.connected === 'boolean'
        ? stats.connected
        : Boolean(sock?.user?.id);

      const message = [
        `╭━━『 *${botName} Uptime* 』━━╮`,
        '',
        `🧬 *Version:* ${botVersion}`,
        `⏱️ *Uptime:* ${uptime}`,
        `🔌 *WhatsApp:* ${connected ? 'Connected' : 'Disconnected / reconnecting'}`,
        `🔄 *Reconnects:* ${stats?.reconnects ?? 'n/a'}`,
        '',
        '╰━━━━━━━━━━━━━━━╯'
      ].join('\n');

      return extra.reply(message);
    } catch (error) {
      console.error('Error in uptime command:', error);
      return extra.reply(`❌ Could not fetch uptime information: ${error.message}`);
    }
  }
};

