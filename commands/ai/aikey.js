/**
 * AI Key Management Command
 * Allows users to set, test, or remove their personal Google Gemini or OpenRouter API key.
 */

const { isConfigured, getSetupMessage, testAiKey, resolveAiCredentials } = require('../../utils/googleAi');
const { getUserAiConfig, setKey, removeKey, detectProvider } = require('../../utils/userApiKeys');

module.exports = {
  name: 'aikey',
  aliases: ['googleai', 'gemini', 'openrouter', 'aiconfig', 'setkey'],
  category: 'ai',
  description: 'Manage your personal Google Gemini or OpenRouter API key',
  usage: '.aikey | .aikey set <key> | .aikey test | .aikey remove',

  async execute(sock, msg, args, extra) {
    const action = (args[0] || '').toLowerCase();
    const userId = extra.sender;

    // 1. SET API KEY
    if (action === 'set') {
      // In group chats, warn and try to delete to protect the user's key
      if (extra.isGroup) {
        try { await sock.sendMessage(extra.from, { delete: msg.key }); } catch {}
        return extra.reply(
          '⚠️ *Security Warning:* Please set your API key in a *private chat* with the bot so other group members cannot see your private key!'
        );
      }

      let keyInput = args[1]?.trim();
      let forcedProvider = null;

      // Check if user passed provider explicitly, e.g. .aikey set gemini <key>
      if (['gemini', 'google', 'googleai'].includes(keyInput?.toLowerCase())) {
        forcedProvider = 'gemini';
        keyInput = args[2]?.trim();
      } else if (['openrouter', 'or'].includes(keyInput?.toLowerCase())) {
        forcedProvider = 'openrouter';
        keyInput = args[2]?.trim();
      }

      if (!keyInput) {
        return extra.reply(
          '❌ *Missing Key!*\n\n' +
          'Usage: `' + (extra.prefix || '.') + 'aikey set YOUR_API_KEY`\n\n' +
          'Examples:\n' +
          '• For Google Gemini: `' + (extra.prefix || '.') + 'aikey set AIzaSy...`\n' +
          '• For OpenRouter: `' + (extra.prefix || '.') + 'aikey set sk-or-v1-...`'
        );
      }

      // Basic sanity length check
      if (keyInput.length < 15) {
        return extra.reply('❌ The provided API key seems too short. Please double-check that you copied the complete key.');
      }

      const detected = forcedProvider || detectProvider(keyInput);
      const providerLabel = detected === 'openrouter' ? 'OpenRouter' : 'Google Gemini';

      await extra.reply('⏳ Validating and testing your ' + providerLabel + ' key... Please wait.');

      const testResult = await testAiKey(keyInput, detected);
      if (!testResult.ok) {
        return extra.reply(
          '❌ *Key Verification Failed!*\n\n' +
          'Provider: *' + providerLabel + '*\n' +
          'Reason: ' + testResult.message + '\n\n' +
          'Please ensure the key is active and has available quota, then try again.'
        );
      }

      try {
        setKey(userId, keyInput, detected);
        try { await sock.sendMessage(extra.from, { delete: msg.key }); } catch {}
        return extra.reply(
          '✅ *API Key Saved Successfully!*\n\n' +
          '• *Provider:* ' + providerLabel + '\n' +
          '• *Encryption:* AES-256-GCM\n' +
          '• *Status:* Verified & Active\n\n' +
          'You can now use all AI features seamlessly: `' + (extra.prefix || '.') + 'ai`, `' + (extra.prefix || '.') + 'deepread`, and group chat features!'
        );
      } catch (err) {
        return extra.reply('❌ Could not save your key: ' + err.message);
      }
    }

    // 2. REMOVE API KEY
    if (action === 'remove' || action === 'delete' || action === 'clear') {
      removeKey(userId);
      return extra.reply('✅ Your personal saved API key has been removed.');
    }

    // 3. TEST CURRENT CONFIGURATION
    if (action === 'test') {
      const active = resolveAiCredentials({ senderId: userId });
      if (!active) {
        return extra.reply('❌ No active AI key found! Use `' + (extra.prefix || '.') + 'aikey set <key>` to configure one.');
      }

      const providerName = active.provider === 'openrouter' ? 'OpenRouter' : 'Google Gemini';
      await extra.reply('⏳ Testing connection with ' + providerName + ' (' + active.source + ' key)...');

      const res = await testAiKey(active.key, active.provider);
      if (res.ok) {
        return extra.reply('✅ *AI is working perfectly!*\nProvider: ' + providerName + '\nResponse: ' + res.message);
      }
      return extra.reply('❌ *Test Failed:* ' + res.message);
    }

    // 4. STATUS / GUIDE
    const personalConf = getUserAiConfig(userId);
    const hasGlobal = isConfigured();

    let personalStatus = '❌ None saved';
    if (personalConf && personalConf.key) {
      const pName = personalConf.provider === 'openrouter' ? 'OpenRouter' : 'Google Gemini';
      personalStatus = '✅ ' + pName + ' (Personal)';
    }

    let globalStatus = hasGlobal ? '✅ Active' : '❌ None';
    const overallReady = Boolean(personalConf?.key || hasGlobal);

    const statusCard = [
      '╭───『 🤖 *AI CONFIGURATION* 』───',
      '│',
      '│ 👤 *Personal Key:* ' + personalStatus,
      '│ 🌐 *Bot Global Key:* ' + globalStatus,
      '│ ⚡ *Status:* ' + (overallReady ? '✅ Ready to chat!' : '⚠️ Needs setup'),
      '│',
      '├─『 🔑 *HOW TO GET A KEY* 』──',
      '│',
      '│ 🔹 *Option 1: Google Gemini (Free & Fast)*',
      '│ 1. Open: https://aistudio.google.com/app/apikey',
      '│ 2. Create and copy your key',
      '│ 3. Send in DM: `' + (extra.prefix || '.') + 'aikey set YOUR_KEY`',
      '│',
      '│ 🔹 *Option 2: OpenRouter (Gemini, DeepSeek, etc.)*',
      '│ 1. Open: https://openrouter.ai/keys',
      '│ 2. Create and copy your key',
      '│ 3. Send in DM: `' + (extra.prefix || '.') + 'aikey set YOUR_KEY`',
      '│',
      '├─『 ⚙️ *COMMANDS* 』──',
      '│ • `' + (extra.prefix || '.') + 'aikey set <key>` : Save your key',
      '│ • `' + (extra.prefix || '.') + 'aikey test` : Test active connection',
      '│ • `' + (extra.prefix || '.') + 'aikey remove` : Delete your saved key',
      '╰───────────────────────────────'
    ].join('\n');

    return extra.reply(statusCard);
  }
};
