/**
 * Pin Command - Pin or unpin the current chat in the linked WhatsApp account
 */

const { pinChat } = require('../../utils/chatActions');

module.exports = {
  name: 'pin',
  aliases: ['unpin', 'pinchat'],
  category: 'general',
  description: 'Pin or unpin this chat in your WhatsApp account',
  usage: '.pin - pin | .pin off - unpin',

  async execute(sock, msg, args, extra) {
    const action = (args[0] || '').toLowerCase();
    try {
      let pin;
      if (['off', 'no', 'false', 'unpin'].includes(action)) pin = false;
      else if (['on', 'yes', 'true', 'pin'].includes(action) || !action) pin = true;
      else return extra.reply(`❌ Unknown option *${action}*.\n\nUsage: \`${extra.prefix || '.'}pin\` | \`${extra.prefix || '.'}pin off\``);

      await pinChat(sock, extra.from, pin);

      return extra.reply(
        pin
          ? '📌 This chat is now *pinned* to the top of your chat list.'
          : '📌 This chat has been *unpinned*.'
      );
    } catch (error) {
      console.error('[pin] failed:', error);
      return extra.reply(`❌ Could not update the pin state: ${error.message}`);
    }
  }
};
