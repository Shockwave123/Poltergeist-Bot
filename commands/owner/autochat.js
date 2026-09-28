/**
 * Continuous chatbot mode for one owner-selected chat.
 */

const autoChat = require('../../utils/autoChat');
const { clearContinuousChat } = require('../admin/chatbot');

module.exports = {
  name: 'autochat',
  aliases: ['continuouschat', 'chatmode'],
  category: 'owner',
  description: 'Keep the chatbot active in one selected chat',
  usage: '.autochat <on/off>',
  ownerOnly: true,

  async execute(sock, msg, args, extra) {
    const option = (args[0] || '').toLowerCase();
    const chatId = extra.from;

    if (!option) {
      const activeChat = autoChat.getActiveChat();
      return extra.reply(
        `*CONTINUOUS CHAT*\n\nStatus: ${activeChat ? '✅ On' : '❌ Off'}\n` +
        `${activeChat ? `Active chat: ${activeChat === chatId ? 'this chat' : 'another chat'}\n` : ''}\n` +
        `Use *.autochat on* to start in this chat.\n` +
        `Use *.autochat off* to stop it.`
      );
    }

    if (option === 'on') {
      const result = autoChat.enable(chatId);
      if (!result.enabled) {
        return extra.reply('❌ Continuous chat is already active in another chat. Disable it there first.');
      }
      clearContinuousChat(chatId);
      return extra.reply('✅ Continuous chat enabled for this chat. I will follow the conversation until you turn it off.');
    }

    if (option === 'off') {
      autoChat.disable();
      clearContinuousChat(chatId);
      return extra.reply('✅ Continuous chat disabled.');
    }

    return extra.reply('❌ Use `.autochat on` or `.autochat off`.');
  },
};
