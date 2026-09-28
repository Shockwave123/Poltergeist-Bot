/**
 * Health Command - Runtime diagnostics for the linked account and the bot process
 * (owner only, so infrastructure details stay private)
 */

const config = require('../../config');
const database = require('../../database');
const sessionManager = require('../../utils/sessionManager');
const { getAiHealth } = require('../../utils/googleAi');
const packageInfo = require('../../package.json');

const formatUptime = (seconds) => {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  if (!parts.length) parts.push(`${Math.floor(seconds)}s`);
  return parts.join(' ');
};

const buildLocalStats = (sock) => {
  const usage = process.memoryUsage();
  return {
    uptimeSeconds: Math.round(process.uptime()),
    connected: Boolean(sock?.ws && (typeof sock.ws.isOpen === 'boolean' ? sock.ws.isOpen : sock.ws.readyState === 1)),
    reconnects: 'n/a',
    lastDisconnectReason: '',
    authMethod: sessionManager.getState().authMethod,
    memoryMb: Math.round(usage.rss / (1024 * 1024)),
    heapUsedMb: Math.round(usage.heapUsed / (1024 * 1024)),
    qrCount: 'n/a'
  };
};

module.exports = {
  name: 'health',
  aliases: ['botstatus', 'diagnose', 'sysinfo', 'botdiagnostics'],
  category: 'owner',
  description: 'Show runtime, connection and AI diagnostics (owner only)',
  usage: '.health',
  ownerOnly: true,

  async execute(sock, msg, args, extra) {
    try {
      let stats = buildLocalStats(sock);
      try {
        const index = require('../../index');
        if (typeof index.connectionStats === 'function') stats = { ...stats, ...index.connectionStats() };
      } catch (error) {
        // Running without the main process stats - local stats are enough
      }

      const ai = getAiHealth();
      const session = sessionManager.getStatus();
      const memoryLimit = config.health.memoryLimitMb;
      const memoryPercent = Math.round((stats.memoryMb / memoryLimit) * 100);

      const linkState = stats.linked ? '✅ linked' : '❌ not linked';
      const socketState = stats.connected ? 'online' : 'offline';

      const aiLine = ai.configured
        ? `${ai.totalKeys} key(s) - ${ai.entries.filter((entry) => entry.status === 'ready').length} ready, ${ai.entries.filter((entry) => entry.status === 'cooling-down').length} cooling down`
        : '❌ no keys configured';

      const lines = [
        '╭───『 🩺 *BOT HEALTH* 』───',
        '│',
        '│ 🔌 *CONNECTION*',
        `│ • State: ${linkState} (socket ${socketState})`,
        `│ • Linked via: *${stats.authMethod || 'unknown'}*`,
        `│ • Session stored: ${session.hasSession ? '✅ yes' : '❌ no'}`,
        `│ • Reconnects this run: ${stats.reconnects}`,
        `│ • Last disconnect: ${stats.lastDisconnectReason || 'none'}`,
        `│ • QR codes generated: ${stats.qrCount}`,
        '│',
        '│ ⚙️ *RUNTIME*',
        `│ • Version: ${config.botName} v${packageInfo.version}`,
        `│ • Uptime: ${formatUptime(stats.uptimeSeconds)}`,
        `│ • RAM: ${stats.memoryMb} MB / ${memoryLimit} MB limit (${memoryPercent}%)`,
        `│ • Heap used: ${stats.heapUsedMb} MB`,
        `│ • Databases cached: ${typeof database.getCacheSize === 'function' ? database.getCacheSize() : 'n/a'}`,
        '│',
        '│ 🤖 *AI PROVIDERS*',
        `│ • ${aiLine}`,
        `│ • Priority: ${ai.priority ? ai.priority.join(' → ') : 'gemini → openrouter'}`
      ];

      if (ai.entries && ai.entries.length) {
        ai.entries.forEach((entry) => {
          const state = entry.status === 'ready'
            ? '✅'
            : entry.status === 'cooling-down'
              ? `⏳ ${entry.cooldownSeconds}s`
              : '♻️';
          lines.push(`│ • ${entry.label} ${entry.keyId}: ${state}`);
        });
      }

      lines.push(
        '│',
        '│ 🛡️ *SELF-HEALING*',
        `│ • Health check every ${Math.round(config.health.checkIntervalMs / 1000)}s`,
        `│ • Auto QR refresh after ${Math.round(config.health.qrRefreshTimeoutMs / 1000)}s`,
        `│ • Auto re-link when logged out: ${config.autoRelinkOnLogout ? '✅ on' : '❌ off'}`,
        '│',
        '╰─────────────────────────────'
      );

      return extra.reply(lines.join('\n'));
    } catch (error) {
      console.error('[health] failed:', error);
      return extra.reply(`❌ Could not run diagnostics: ${error.message}`);
    }
  }
};
