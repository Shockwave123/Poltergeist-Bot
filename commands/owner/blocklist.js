/**
 * Blocklist Command - List the contacts blocked by the linked account
 */

module.exports = {
  name: 'blocklist',
  aliases: ['blocked', 'blockedcontacts'],
  category: 'owner',
  description: 'List contacts blocked by the linked WhatsApp account (owner only)',
  usage: '.blocklist',
  ownerOnly: true,

  async execute(sock, msg, args, extra) {
    const prefix = extra.prefix || '.';

    try {
      if (typeof sock.fetchBlocklist !== 'function') {
        return extra.reply('❌ This Baileys version cannot read the block list.');
      }

      const blocked = await sock.fetchBlocklist();
      if (!Array.isArray(blocked) || blocked.length === 0) {
        return extra.reply(
          '✅ *Block list is empty.*\n\n' +
          `Use \`${prefix}block @user\` to block someone and \`${prefix}unblock @user\` to unblock them.`
        );
      }

      const listed = blocked.slice(0, 40).map((jid, index) => {
        const number = String(jid).split('@')[0];
        return `${index + 1}. +${number}`;
      });

      const lines = [
        `🚫 *BLOCKED CONTACTS* (${blocked.length})`,
        '',
        ...listed
      ];

      if (blocked.length > listed.length) {
        lines.push('', `… and ${blocked.length - listed.length} more.`);
      }

      lines.push('', `Use \`${prefix}unblock <number>\` to unblock someone.`);
      return extra.reply(lines.join('\n'));
    } catch (error) {
      console.error('[blocklist] failed:', error);
      return extra.reply(`❌ Could not read the block list: ${error.message}`);
    }
  }
};
