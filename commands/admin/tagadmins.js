/**
 * Tagadmins Command - Mention all group admins, optionally with a message
 * Usage: .tagadmins [message]
 */

module.exports = {
  name: 'tagadmins',
  aliases: ['admins', 'tagadmin'],
  category: 'admin',
  description: 'Mention all group admins (optionally with a message)',
  usage: '.tagadmins [message]\nExample: .tagadmins we need a decision here',
  groupOnly: true,
  adminOnly: true,
  botAdminNeeded: false,

  async execute(sock, msg, args, extra) {
    try {
      const participants = extra.groupMetadata?.participants || [];
      const adminJids = participants
        .filter((p) => p.admin === 'admin' || p.admin === 'superadmin')
        .map((p) => p.id || p.lid)
        .filter(Boolean);

      if (adminJids.length === 0) {
        return extra.reply('❌ No admins found in this group.');
      }

      const message = args.join(' ').trim();
      const mentions = adminJids
        .map((jid) => '@' + jid.split('@')[0])
        .join(' ');

      const text =
        '🛡️ *GROUP ADMINS*\n\n' +
        (message ? message + '\n\n' : '') +
        mentions;

      await sock.sendMessage(extra.from, { text, mentions: adminJids }, { quoted: msg });
    } catch (error) {
      console.error('[tagadmins] error:', error);
      await extra.reply('❌ Error: ' + error.message);
    }
  }
};
