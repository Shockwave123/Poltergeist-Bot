/**
 * Account Command - Overview of the linked WhatsApp account and session state
 */

const config = require('../../config');
const sessionManager = require('../../utils/sessionManager');
const packageInfo = require('../../package.json');

const formatUptime = (seconds) => {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  return parts.join(' ') || `${Math.floor(seconds)}s`;
};

const methodLabel = (method) => ({
  qr: 'QR code scan',
  pairing: 'Pairing code (phone number)',
  'session-id': 'SESSION_ID environment variable',
  'session-file': 'Saved session file',
  none: 'Not linked yet'
}[method] || method);

module.exports = {
  name: 'account',
  aliases: ['myaccount', 'myprofile', 'botinfo'],
  category: 'general',
  description: 'Show the linked WhatsApp account details and session status',
  usage: '.account',

  async execute(sock, msg, args, extra) {
    try {
      const rawId = sock.user?.id || '';
      const number = rawId.split(':')[0].split('@')[0] || 'unknown';
      const deviceId = rawId.includes(':') ? rawId.split(':')[1].split('@')[0] : null;
      const isLid = rawId.includes('@lid');

      const state = sessionManager.getState();
      const status = sessionManager.getStatus();
      const linkedAt = state.linkedAt ? new Date(state.linkedAt).toLocaleString() : 'unknown';
      const sessionSize = sessionManager.getSessionId().length;

      const lines = [
        '╭───『 📱 *LINKED ACCOUNT* 』───',
        '│',
        `│ 🤖 *Bot:* ${config.botName} v${packageInfo.version}`,
        `│ 👤 *Name:* ${sock.user?.name || 'unknown'}`,
        `│ 📱 *Number:* ${number}`,
        `│ 🔌 *Device slot:* ${deviceId || 'n/a'}${isLid ? ' (LID identity)' : ''}`,
        '│',
        '│ 🔗 *Link method:* ' + methodLabel(status.authMethod),
        `│ 🕒 *Linked at:* ${linkedAt}`,
        `│ 🔑 *Session stored:* ${status.hasSession ? '✅ yes' : '❌ no'}${sessionSize ? ` (${sessionSize} chars)` : ''}`,
        `│ 📩 *Welcome delivered:* ${status.welcomeSent ? '✅ yes' : '⏳ not yet'}`,
        '│',
        `│ ⚡ *Prefix:* ${config.prefix}`,
        `│ ⏱️ *Process uptime:* ${formatUptime(process.uptime())}`,
        `│ 🧠 *Memory:* ${Math.round(process.memoryUsage().rss / (1024 * 1024))} MB`,
        '│'
      ];

      if (extra.isGroup) {
        lines.push(
          '│ 🔒 Session details are hidden in group chats.',
          '│ Ask in the bot DM with `.account` or use `.sessionid` (owner).',
          '│'
        );
      } else if (status.hasSession) {
        lines.push(
          `│ 🔎 *Session preview:* ${status.sessionPreview}`,
          '│ Use `.sessionid` (owner only) to receive the full string.',
          '│'
        );
      }

      lines.push(
        '├─『 🧰 *ACCOUNT TOOLS* 』──',
        `│ • \`${extra.prefix || '.'}sessionid\` - get the session id (owner)`,
        `│ • \`${extra.prefix || '.'}privacy\` - view/change privacy settings (owner)`,
        `│ • \`${extra.prefix || '.'}setbio\` - change the account about text (owner)`,
        `│ • \`${extra.prefix || '.'}blocklist\` - see blocked contacts (owner)`,
        `│ • \`${extra.prefix || '.'}archive\` / \`${extra.prefix || '.'}pin\` / \`${extra.prefix || '.'}mutechat\` - manage chats`,
        `│ • \`${extra.prefix || '.'}health\` - connection + runtime diagnostics (owner)`,
        '╰──────────────────────────────'
      );

      return extra.reply(lines.join('\n'));
    } catch (error) {
      console.error('[account] failed:', error);
      return extra.reply(`❌ Could not read the account details: ${error.message}`);
    }
  }
};
