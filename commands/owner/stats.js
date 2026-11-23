/**
 * Stats Command - Live bot performance dashboard (owner only)
 */

const database = require('../../database');
const sessionManager = require('../../utils/sessionManager');
const config = require('../../config');

const fmtUptime = (s) => {
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d) return `${d}d ${h}h ${m}m`;
  if (h) return `${h}h ${m}m`;
  return `${m}m ${Math.floor(s % 60)}s`;
};

const mkBar = (used, max, width = 12) => {
  const pct = Math.min(used / max, 1);
  const filled = Math.round(pct * width);
  const emoji = pct >= 0.9 ? '🔴' : pct >= 0.7 ? '🟡' : '🟢';
  return `${emoji} ${'█'.repeat(filled)}${'░'.repeat(width - filled)} ${Math.round(pct * 100)}%`;
};

module.exports = {
  name: 'stats',
  aliases: ['botstats', 'performance', 'perfstats'],
  category: 'owner',
  description: 'Show live bot performance and resource usage (owner only)',
  usage: '.stats',
  ownerOnly: true,

  async execute(sock, msg, args, extra) {
    try {
      const mem = process.memoryUsage();
      const ramMb   = Math.round(mem.rss        / (1024 * 1024));
      const heapUsed = Math.round(mem.heapUsed  / (1024 * 1024));
      const heapTotal= Math.round(mem.heapTotal / (1024 * 1024));
      const extMb    = Math.round(mem.external  / (1024 * 1024));
      const RAM_LIMIT = config.health.memoryLimitMb;

      const uptimeSec = Math.round(process.uptime());

      const connStats = typeof sock.getConnectionStats === 'function'
        ? sock.getConnectionStats()
        : null;

      const session = sessionManager.getStatus();
      const dbCacheSize = typeof database.getCacheSize === 'function' ? database.getCacheSize() : '?';

      const linked    = connStats?.linked ?? Boolean(sock?.user?.id);
      const connected = connStats?.connected ?? Boolean(sock?.user?.id);
      const reconns   = connStats?.reconnects ?? '—';
      const totalMsgs = connStats?.totalMessagesSeen ?? '—';
      const method    = connStats?.authMethod ?? session.authMethod ?? '?';

      const lines = [
        '╭───『 📊 *BOT STATS* 』───',
        '│',
        '│ 🔌 *CONNECTION*',
        `│ • Status:     ${connected ? '✅ Connected' : '❌ Disconnected'} / ${linked ? 'linked' : 'not linked'}`,
        `│ • Auth:       ${method}`,
        `│ • Reconnects: ${reconns}`,
        `│ • Last close: ${connStats?.lastDisconnectReason || 'none'}`,
        `│ • Last activity: ${Number.isFinite(connStats?.lastServerTrafficAgeSeconds) ? `${connStats.lastServerTrafficAgeSeconds}s ago` : 'n/a'}`,
        `│ • Messages:   ${totalMsgs}`,
        '│',
        '│ ⏱️ *UPTIME*',
        `│ • Process:    ${fmtUptime(uptimeSec)}`,
        `│ • Bot:        ${connStats?.uptimeSeconds ? fmtUptime(connStats.uptimeSeconds) : fmtUptime(uptimeSec)}`,
        '│',
        '│ 💾 *MEMORY (RSS)*',
        `│ ${mkBar(ramMb, RAM_LIMIT)} — ${ramMb}/${RAM_LIMIT} MB`,
        '│',
        '│ 🧠 *HEAP*',
        `│ ${mkBar(heapUsed, heapTotal)} — ${heapUsed}/${heapTotal} MB used`,
        `│ • External:   ${extMb} MB`,
        '│',
        '│ 📦 *CACHES*',
        `│ • DB files cached:    ${dbCacheSize}`,
        `│ • Msg store (chats):  ${connStats?.messageStoreChats ?? 'n/a'}`,
        `│ • Session stored:     ${session.hasSession ? '✅' : '❌'}`,
        '│',
        `│ 💡 Run *.clearcache* to free RAM`,
        '╰──────────────────────────────',
      ];

      return extra.reply(lines.join('\n'));
    } catch (error) {
      console.error('[stats] failed:', error);
      return extra.reply(`❌ Could not fetch stats: ${error.message}`);
    }
  },
};
