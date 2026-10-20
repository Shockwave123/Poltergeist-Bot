/**
 * Revoke Command - Reset/revoke the group invite link
 * Usage: .revoke
 */

module.exports = {
  name: 'revoke',
  aliases: ['resetlink', 'revokeinvite'],
  category: 'admin',
  description: 'Revoke the current group invite link and generate a new one',
  usage: '.revoke',
  groupOnly: true,
  adminOnly: true,
  botAdminNeeded: true,

  async execute(sock, msg, args, extra) {
    try {
      await sock.groupRevokeInvite(extra.from);
      return extra.reply(
        '🔄 *Invite link revoked*\n\n' +
        'The old link no longer works. A new link has been generated.\n' +
        'Use *.grouplink* to get the new one.'
      );
    } catch (error) {
      console.error('[revoke] error:', error);
      await extra.reply('❌ Error: ' + error.message);
    }
  }
};
