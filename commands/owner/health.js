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
    linked: Boolean(sock?.user?.id),
    status: 'Runtime telemetry unavailable',
    reconnects: 'n/a',
    reconnectAttempts: 'n/a',
    failedProbes: 'n/a',
    lastDisconnectReason: '',
    lastSocketError: '',
    authMethod: sessionManager.getState().authMethod,
    lastServerTrafficAgeSeconds: null,
    totalMessagesSeen: 'n/a',
    messageStoreChats: 'n/a',
    memoryMb: Math.round(usage.rss / (1024 * 1024)),
    heapUsedMb: Math.round(usage.heapUsed / (1024 * 1024)),
    heapTotalMb: Math.round(usage.heapTotal / (1024 * 1024)),
    externalMb: Math.round(usage.external / (1024 * 1024)),
    memoryLimitMb: config.health.memoryLimitMb,
    qrCount: 'n/a',
    qrAgeSeconds: null,
    nodeVersion: process.version,
    platform: `${process.platform}/${process.arch}`,
    telemetryAvailable: false
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
      const localStats = buildLocalStats(sock);
      const runtimeStats = typeof sock.getConnectionStats === 'function'
        ? sock.getConnectionStats()
        : null;
      const stats = runtimeStats
        ? { ...localStats, ...runtimeStats, telemetryAvailable: true }
        : localStats;

      const ai = getAiHealth();
      const session = sessionManager.getStatus();
      const memoryLimit = stats.memoryLimitMb || config.health.memoryLimitMb;
      const memoryPercent = Math.round((stats.memoryMb / memoryLimit) * 100);
      const linkState = stats.linked ? '✅ linked' : '❌ not linked';
      const socketState = stats.connected ? 'connected' : 'disconnected';
      const overallState = stats.connected && stats.linked
        ? 'HEALTHY'
        : stats.connected
          ? 'PAIRING / NOT LINKED'
          : stats.status?.toLowerCase().includes('reconnect')
            ? 'RECONNECTING'
            : 'DISCONNECTED';
      const cpuUsage = process.cpuUsage();
      const userCpuSeconds = (cpuUsage.user / 1_000_000).toFixed(1);
      const systemCpuSeconds = (cpuUsage.system / 1_000_000).toFixed(1);

      const aiLine = ai.configured
        ? `${ai.totalKeys} key(s) - ${ai.entries.filter((entry) => entry.status === 'ready').length} ready, ${ai.entries.filter((entry) => entry.status === 'cooling-down').length} cooling down`
        : '❌ no keys configured';

      const lines = [
        '╭───『 🩺 *BOT HEALTH* 』───',
        '│',
        `│ 🟢 *Overall:* ${overallState}`,
        `│ • Runtime telemetry: ${stats.telemetryAvailable ? 'full' : 'local-only'}`,
        `│ • Status: ${stats.status || 'unknown'}`,
        '│',
        '│ 🔌 *CONNECTION*',
        `│ • State: ${linkState} (socket ${socketState})`,
        `│ • Linked via: *${stats.authMethod || 'unknown'}*`,
        `│ • Session stored: ${session.hasSession ? '✅ yes' : '❌ no'}`,
        `│ • Reconnects this run: ${stats.reconnects}`,
        `│ • Reconnect attempts: ${stats.reconnectAttempts}`,
        `│ • Failed probes: ${stats.failedProbes}`,
        `│ • Last disconnect: ${stats.lastDisconnectReason || 'none'}`,
        `│ • Last socket error: ${stats.lastSocketError || 'none'}`,
        `│ • Last server activity: ${Number.isFinite(stats.lastServerTrafficAgeSeconds) ? `${stats.lastServerTrafficAgeSeconds}s ago` : 'n/a'}`,
        `│ • QR codes generated: ${stats.qrCount}`,
        `│ • Current QR age: ${Number.isFinite(stats.qrAgeSeconds) ? `${stats.qrAgeSeconds}s` : 'n/a'}`,
        '│',
        '│ ⚙️ *RUNTIME*',
        `│ • Version: ${config.botName} v${packageInfo.version}`,
        `│ • Node.js: ${stats.nodeVersion}`,
        `│ • Platform: ${stats.platform}`,
        `│ • Uptime: ${formatUptime(stats.uptimeSeconds)}`,
        `│ • RAM: ${stats.memoryMb} MB / ${memoryLimit} MB limit (${memoryPercent}%)`,
        `│ • Heap: ${stats.heapUsedMb} / ${stats.heapTotalMb} MB`,
        `│ • External memory: ${stats.externalMb} MB`,
        `│ • CPU time: ${userCpuSeconds}s user / ${systemCpuSeconds}s system`,
        `│ • Messages seen: ${stats.totalMessagesSeen}`,
        `│ • Message-store chats: ${stats.messageStoreChats}`,
        `│ • Databases cached: ${typeof database.getCacheSize === 'function' ? database.getCacheSize() : 'n/a'}`,
        '│',
        '│ 🤖 *AI PROVIDERS*',
        `│ • ${aiLine}`,
        `│ • Priority: ${ai.priority ? ai.priority.join(' → ') : 'gemini → openrouter → nvidia → zai'}`
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
        `│ • Maximum reconnect delay: ${Math.round(config.health.maxReconnectDelayMs / 1000)}s`,
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
