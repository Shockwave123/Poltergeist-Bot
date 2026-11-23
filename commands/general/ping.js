/**
 * Ping Command - Check bot response time + quick health snapshot
 */

const config = require('../../config');

function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes || !parts.length) parts.push(`${minutes}m`);
  return parts.join(' ');
}

module.exports = {
  name: 'ping',
  aliases: ['p', 'latency'],
  category: 'general',
  description: 'Check bot response time and quick health snapshot',
  usage: '.ping',

  async execute(sock, msg, args, extra) {
    try {
      const start = Date.now();
      const sent = await extra.reply('🏓 Pinging...');
      const responseMs = Date.now() - start;
      if (!sent?.key) throw new Error('WhatsApp did not return the ping message key.');

      const stats = typeof sock.getConnectionStats === 'function'
        ? sock.getConnectionStats()
        : {};

      const mem = process.memoryUsage();
      const ramMb = Math.round(mem.rss / (1024 * 1024));
      const heapMb = Math.round(mem.heapUsed / (1024 * 1024));
      const memoryLimitMb = stats.memoryLimitMb || config.health.memoryLimitMb;
      const memoryPercent = Math.round((ramMb / memoryLimitMb) * 100);
      const filled = Math.min(10, Math.round((ramMb / memoryLimitMb) * 10));
      const ramBar = '█'.repeat(filled) + '░'.repeat(10 - filled);
      const connected = typeof stats.connected === 'boolean'
        ? stats.connected
        : Boolean(sock.user?.id);
      const uptimeSeconds = stats.uptimeSeconds || Math.round(process.uptime());

      const text = [
        '🏓 *Pong!*',
        `⚡ *Send response:* ${responseMs} ms`,
        `🔌 *WhatsApp:* ${connected ? 'Connected' : 'Disconnected / reconnecting'}`,
        `⏱️ *Uptime:* ${formatUptime(uptimeSeconds)}`,
        `🔄 *Reconnects:* ${stats.reconnects ?? 'n/a'}`,
        `💾 *RAM:* ${ramMb} / ${memoryLimitMb} MB (${memoryPercent}%) [${ramBar}]`,
        `🧠 *Heap used:* ${heapMb} MB`
      ].join('\n');

      await sock.sendMessage(extra.from, {
        text,
        edit: sent.key,
      });
    } catch (error) {
      await extra.reply(`❌ Error: ${error.message}`);
    }
  },
};