/**
 * Ping Command - Check bot response time + quick health snapshot
 */

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
      const rtt = Date.now() - start;

      const mem = process.memoryUsage();
      const ramMb = Math.round(mem.rss / (1024 * 1024));
      const heapMb = Math.round(mem.heapUsed / (1024 * 1024));

      const uptimeSec = Math.round(process.uptime());
      const d = Math.floor(uptimeSec / 86400);
      const h = Math.floor((uptimeSec % 86400) / 3600);
      const m = Math.floor((uptimeSec % 3600) / 60);
      const uptime = d ? `${d}d ${h}h ${m}m` : h ? `${h}h ${m}m` : `${m}m`;

      const ramBar = (() => {
        const pct = Math.min(ramMb / 460, 1);
        const filled = Math.round(pct * 10);
        return '█'.repeat(filled) + '░'.repeat(10 - filled);
      })();

      const text = [
        `🏓 *Pong!* — ${rtt}ms`,
        ``,
        `⏱️ *Uptime:* ${uptime}`,
        `💾 *RAM:* ${ramMb} MB [${ramBar}] / 460 MB`,
        `🧠 *Heap:* ${heapMb} MB`,
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