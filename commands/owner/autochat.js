/**
 * Continuous chatbot mode for one owner-selected chat.
 */

const autoChat = require('../../utils/autoChat');
const { clearContinuousChat } = require('../admin/chatbot');

module.exports = {
  name: 'autochat',
  aliases: ['continuouschat', 'chatmode'],
  category: 'owner',
  description: 'Enable continuous chat in this chat or AI replies to private messages',
  usage: '.autochat [on/off|dm on/off]',
  ownerOnly: true,

  async execute(sock, msg, args, extra) {
    const option = (args[0] || '').toLowerCase();
    const chatId = extra.from;

    if (option === 'dm') {
      const dmOption = (args[1] || '').toLowerCase();
      if (!['on', 'off'].includes(dmOption)) {
        return extra.reply(`Private-chat AI replies are ${autoChat.isDmEnabled() ? 'on' : 'off'}. Use ".autochat dm on" or ".autochat dm off".`);
      }
      autoChat.setDmEnabled(dmOption === 'on');
      return extra.reply(dmOption === 'on'
        ? '✅ AI replies are on for private messages from other people. The owner can turn this off with `.autochat dm off`.'
        : '✅ AI replies to private messages are off.');
    }

    if (!option) {
      const activeChat = autoChat.getActiveChat();
      return extra.reply(
        `*CONTINUOUS CHAT*\n\nStatus: ${activeChat ? '✅ On' : '❌ Off'}\n` +
        `Private-chat replies: ${autoChat.isDmEnabled() ? '✅ On' : '❌ Off'}\n` +
        `${activeChat ? `Active chat: ${activeChat === chatId ? 'this chat' : 'another chat'}\n` : ''}\n` +
        `Use *.autochat on* to start in this chat.\n` +
        `Use *.autochat off* to stop it.\n` +
        `Use *.autochat dm on/off* to control private-chat replies.`
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
