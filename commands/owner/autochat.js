/**
 * Continuous chatbot mode for one owner-selected chat.
 */

const autoChat = require('../../utils/autoChat');
const {
  clearContinuousChat,
  PERSONALITIES,
  findPersonality,
  normalizePersonalityInput
} = require('../admin/chatbot');

module.exports = {
  name: 'autochat',
  aliases: ['continuouschat', 'chatmode'],
  category: 'owner',
  description: 'Enable continuous chat in this chat or AI replies to private messages',
  usage: '.autochat [on/off|dm on/off|personality <name|cycle|default>]',
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

    if (option === 'personality') {
      const requested = args.slice(1).join(' ').trim();
      const currentSelection = autoChat.getPersonality();
      if (!requested) {
        const current = currentSelection === 'cycle'
          ? 'Automatic cycle'
          : (PERSONALITIES.find(({ id }) => id === currentSelection)?.name || 'Group chatbot setting');
        return extra.reply(
          `Auto-chat personality: *${current}*\n` +
          `Use ".autochat personality cycle", ".autochat personality default", or a character name.\n` +
          `Available: ${PERSONALITIES.map(({ name }) => name).join(', ')}`
        );
      }

      const normalized = normalizePersonalityInput(requested);
      if (['cycle', 'auto', 'automatic'].includes(normalized)) {
        autoChat.setPersonality('cycle');
        return extra.reply(
          '*Auto-chat personality set to automatic cycle through all 11 personalities.*\n' +
          'This only changes the reply style. Use `.autochat on` in the chat to start replies; a non-owner must then send a normal message.'
        );
      }

      const selected = findPersonality(requested)
        || (['default bot', 'default personality', 'bot default'].includes(normalized)
          ? PERSONALITIES.find(({ id }) => id === 'default')
          : null);
      if (!selected) {
        return extra.reply(
          `*Usage: .autochat personality cycle | default | <name>*\n` +
          `Available: ${PERSONALITIES.map(({ name }) => name).join(', ')}`
        );
      }
      autoChat.setPersonality(selected.id);
      return extra.reply(
        `*Auto-chat personality set to ${selected.name}.*\n` +
        'This only changes the reply style. Use `.autochat on` in the chat to start replies; a non-owner must then send a normal message.'
      );
    }

    if (!option) {
      const activeChat = autoChat.getActiveChat();
      const currentSelection = autoChat.getPersonality();
      const personality = currentSelection === 'cycle'
        ? 'Automatic cycle'
        : (PERSONALITIES.find(({ id }) => id === currentSelection)?.name || 'Group chatbot setting');
      return extra.reply(
        `*CONTINUOUS CHAT*\n\nStatus: ${activeChat ? '✅ On' : '❌ Off'}\n` +
        `Private-chat replies: ${autoChat.isDmEnabled() ? '✅ On' : '❌ Off'}\n` +
        `Personality: ${personality}\n` +
        `${activeChat ? `Active chat: ${activeChat === chatId ? 'this chat' : 'another chat'}\n` : ''}\n` +
        `Use *.autochat on* to start in this chat.\n` +
        `Use *.autochat off* to stop it.\n` +
        `Use *.autochat dm on/off* to control private-chat replies.\n` +
        `Use *.autochat personality <name|cycle|default>* to choose a character.`
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

    return extra.reply('❌ Use `.autochat on/off`, `.autochat dm on/off`, or `.autochat personality <name|cycle|default>`.');
  },
};
