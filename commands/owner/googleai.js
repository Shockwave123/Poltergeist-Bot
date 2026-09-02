/**
 * Google AI setup and status.
 */

const { getSetupMessage, isConfigured } = require('../../utils/googleAi');
const { getKey, setKey, removeKey } = require('../../utils/userApiKeys');

module.exports = {
  name: 'googleai',
  aliases: ['gemini', 'aikey'],
  category: 'owner',
  description: 'Check Google AI setup instructions and status',
  usage: '.googleai',
  privateOnly: true,
  async execute(sock, msg, args, extra) {
    const option = (args[0] || '').toLowerCase();
    const userId = extra.sender;

    if (option === 'set') {
      const key = args[1]?.trim();
      if (!key || !/^(?:AIza|AQ\.)[A-Za-z0-9_.-]{20,}$/.test(key)) {
        return extra.reply('Use `.googleai set YOUR_GOOGLE_AI_KEY`. Google keys may start with `AIza` or `AQ.`.');
      }
      try {
        setKey(userId, key);
        try { await sock.sendMessage(extra.from, { delete: msg.key }); } catch { /* deletion is best effort */ }
        return extra.reply('✅ Your Google AI key was encrypted and saved for your account. It will be used for your AI requests.');
      } catch (error) {
        return extra.reply(`❌ Could not save your key: ${error.message}`);
      }
    }

    if (option === 'remove') {
      removeKey(userId);
      return extra.reply('✅ Your saved Google AI key was removed.');
    }

    const personalKey = getKey(userId);
    const status = personalKey || isConfigured() ? '✅ Configured' : '❌ Not configured';
    return extra.reply(
      `*GOOGLE AI STATUS*\n\n${status}\n\n` +
      (status === '✅ Configured' ? 'Your AI features are ready to use.' : getSetupMessage()) +
      '\n\nUse this command in a private chat.\nSet your own key: `.googleai set YOUR_KEY`\nRemove it: `.googleai remove`'
    );
  },
};
