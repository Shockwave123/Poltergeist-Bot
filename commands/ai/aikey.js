/**
 * AI Key Management Command
 * Allows users to set, test, or remove their personal AI provider API key.
 */

const { isConfigured, getSetupMessage, testAiKey, resolveAiCredentials, getAiHealth, providerLabel: getProviderLabel } = require('../../utils/googleAi');
const { getUserAiConfig, setKey, removeKey, detectProvider } = require('../../utils/userApiKeys');

/** Human readable failover / key-health block used by the status card. */
const buildHealthBlock = (prefix) => {
  const health = getAiHealth();
  if (!health.configured) {
    return [
      '├─『 ⚠️ *FAILOVER* 』──',
      '│ No global keys configured yet.',
      '│ Add Gemini, OpenRouter, NVIDIA NIM and/or Z.AI keys so the bot',
      '│ can switch providers automatically when one is offline.',
      '│'
    ].join('\n');
  }

  const lines = [
    '├─『 🔁 *FAILOVER STATUS* 』──',
    `│ Priority: *${health.priority.join(' → ')}*`,
    `│ Keys: ${health.geminiKeys} Gemini, ${health.openrouterKeys} OpenRouter, ${health.nvidiaKeys} NVIDIA NIM, ${health.zaiKeys} Z.AI`,
  ];

  health.entries.forEach((entry) => {
    const state = entry.status === 'ready'
      ? '✅ ready'
      : entry.status === 'cooling-down'
        ? `⏳ cooling down (${entry.cooldownSeconds}s)`
        : '♻️ recovering';
    lines.push(`│ • ${entry.label} (${entry.source}) ${entry.keyId} - ${state}`);
    if (entry.status === 'cooling-down' && entry.lastError) {
      lines.push(`│   ↳ ${String(entry.lastError).slice(0, 70)}`);
    }
  });

  lines.push('│ Configured providers cover for each other automatically.');
  lines.push('│');
  return lines.join('\n');
};

module.exports = {
  name: 'aikey',
  aliases: ['aiconfig', 'setkey', 'aistatus'],
  category: 'ai',
  description: 'Manage your personal AI provider API key',
  usage: '.aikey | .aikey set <key> | .aikey test | .aikey status | .aikey remove',

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
      } else if (['nvidia', 'nim'].includes(keyInput?.toLowerCase())) {
        forcedProvider = 'nvidia';
        keyInput = args[2]?.trim();
      } else if (['zai', 'z.ai', 'zhipu'].includes(keyInput?.toLowerCase())) {
        forcedProvider = 'zai';
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
      const detectedProviderLabel = getProviderLabel(detected);

      await extra.reply('⏳ Validating and testing your ' + detectedProviderLabel + ' key... Please wait.');

      const testResult = await testAiKey(keyInput, detected);
      if (!testResult.ok) {
        return extra.reply(
          '❌ *Key Verification Failed!*\n\n' +
          'Provider: *' + detectedProviderLabel + '*\n' +
          'Reason: ' + testResult.message + '\n\n' +
          'Please ensure the key is active and has available quota, then try again.'
        );
      }

      try {
        setKey(userId, keyInput, detected);
        try { await sock.sendMessage(extra.from, { delete: msg.key }); } catch {}
        return extra.reply(
          '✅ *API Key Saved Successfully!*\n\n' +
          '• *Provider:* ' + detectedProviderLabel + '\n' +
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

      const providerName = getProviderLabel(active.provider);
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
    const health = getAiHealth();

    let personalStatus = '❌ None saved';
    if (personalConf && personalConf.key) {
      const pName = getProviderLabel(personalConf.provider);
      personalStatus = '✅ ' + pName + ' (Personal)';
    }

    const globalStatus = hasGlobal
      ? `✅ ${health.geminiKeys} Gemini + ${health.openrouterKeys} OpenRouter + ${health.nvidiaKeys} NVIDIA NIM + ${health.zaiKeys} Z.AI key(s)`
      : '❌ None';
    const overallReady = Boolean(personalConf?.key || hasGlobal);

    const statusCard = [
      '╭───『 🤖 *AI CONFIGURATION* 』───',
      '│',
      '│ 👤 *Personal Key:* ' + personalStatus,
      '│ 🌐 *Bot Global Keys:* ' + globalStatus,
      '│ ⚡ *Status:* ' + (overallReady ? '✅ Ready to chat!' : '⚠️ Needs setup'),
      '│',
      buildHealthBlock(extra.prefix || '.'),
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
      '│ 🔹 *Option 3: NVIDIA NIM*',
      '│ 1. Open: https://build.nvidia.com/',
      '│ 2. Create an API key and send: `' + (extra.prefix || '.') + 'aikey set nvidia YOUR_KEY`',
      '│',
      '│ 🔹 *Option 4: Z.AI*',
      '│ 1. Open: https://z.ai/',
      '│ 2. Create an API key and send: `' + (extra.prefix || '.') + 'aikey set zai YOUR_KEY`',
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
