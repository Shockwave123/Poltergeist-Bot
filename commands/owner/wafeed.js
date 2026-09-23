/** WA Feed: show recent activity of the linked account (owner only) */

const config = require('../../config');

module.exports = {
  name: 'wafeed',
  aliases: ['activity', 'feed', 'recentactivity'],
  category: 'owner',
  description: 'Show recent account activity: connection events and message volume (owner only)',
  usage: '.wafeed',
  ownerOnly: true,

  async execute(sock, msg, args, extra) {
    try {
      let stats = {
        reconnects: 'n/a',
        lastDisconnectReason: '',
        uptimeSeconds: Math.round(process.uptime()),
        qrCount: 'n/a'
      };
      try {
        const index = require('../../index');
        if (typeof index.connectionStats === 'function') stats = { ...stats, ...index.connectionStats() };
      } catch (error) { /* running without main process */ }

      const lines = [
        '╭───『 📡 *WA FEED* 』───',
        '│',
        `│ 🔌 State: *${stats.linked ? 'linked' : 'not linked'}* (socket ${stats.connected ? 'online' : 'offline'})`,
        `│ 🔄 Reconnects this run: ${stats.reconnects}`,
        `│ ⏱️ Uptime: ${Math.floor(stats.uptimeSeconds / 60)}m ${stats.uptimeSeconds % 60}s`,
        `│ 📱 Linked number: ${sock.user?.id ? sock.user.id.split(':')[0].split('@')[0] : 'unknown'}`,
        `│ 👤 Display name: ${sock.user?.name || 'unknown'}`,
        `│ 🧭 App version: ${sock.user?.ws?.url ? 'live' : 'unknown'}`,
        '│'
      ];

      if (stats.lastDisconnectReason) {
        lines.push(`│ ⚠️ Last disconnect: ${stats.lastDisconnectReason}`);
      }

      lines.push(
        '│',
        '│ 💡 *TIPS*',
        `│ • \`${extra.prefix || '.'}health\` - full diagnostics`,
        `│ • \`${extra.prefix || '.'}uptime\` - process uptime`,
        `│ • \`${extra.prefix || '.'}account\` - linked account details`,
        '╰─────────────────────────────'
      );

      return extra.reply(lines.join('\n'));
    } catch (error) {
      console.error('[wafeed] failed:', error);
      return extra.reply(`❌ Could not read the feed: ${error.message}`);
    }
  }
};
