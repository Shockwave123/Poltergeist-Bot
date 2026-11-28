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
      const normalized = normalizePersonalityInput(requested);

      // List all personalities with descriptions
      if (!requested || normalized === 'list' || normalized === 'show' || normalized === 'all') {
        const current = currentSelection === 'cycle'
          ? 'Automatic cycle'
          : (PERSONALITIES.find(({ id }) => id === currentSelection)?.name || 'Group chatbot setting');
        const lines = PERSONALITIES.map((p, i) => {
          const marker = p.id === 'default' ? ' ⭐ (default)' : '';
          const desc = p.prompt ? `\n   └─ ${p.prompt.slice(0, 120)}${p.prompt.length > 120 ? '…' : ''}` : '';
          return `${i}. *${p.name}*${marker}${desc}`;
        });
        return extra.reply(
          `*AUTO-CHAT PERSONALITIES (${PERSONALITIES.length})*\n\n` +
          `Current: *${current}*\n\n` +
          lines.join('\n\n') +
          `\n\n*Usage:*\n` +
          `• \`.autochat personality <name>\` — Select a character\n` +
          `• \`.autochat personality cycle\` — Auto-cycle through all\n` +
          `• \`.autochat personality default\` — Reset to default\n` +
          `• \`.autochat personality list\` — Show this list`
        );
      }

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
          `*Usage: .autochat personality cycle | default | <name> | list*\n` +
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
