/**
 * MarkRead Command - Mark the current chat as read or unread
 */

const { markChatRead } = require('../../utils/chatActions');

module.exports = {
  name: 'markread',
  aliases: ['markunread', 'readchat', 'chatread'],
  category: 'general',
  description: 'Mark this chat as read or unread in your WhatsApp account',
  usage: '.markread - mark read | .markread unread - mark unread',

  async execute(sock, msg, args, extra) {
    const action = (args[0] || '').toLowerCase();
    try {
      let read;
      if (['unread', 'off', 'no', 'false'].includes(action)) read = false;
      else if (['read', 'on', 'yes', 'true'].includes(action) || !action) read = true;
      else return extra.reply(`❌ Unknown option *${action}*.\n\nUsage: \`${extra.prefix || '.'}markread\` | \`${extra.prefix || '.'}markread unread\``);

      await markChatRead(sock, extra.from, read, msg);

      return extra.reply(
        read
          ? '✅ This chat has been marked as *read*.'
          : '📬 This chat has been marked as *unread* so you can come back to it.'
      );
    } catch (error) {
      console.error('[markread] failed:', error);
      return extra.reply(`❌ Could not update the read state: ${error.message}`);
    }
  }
};
