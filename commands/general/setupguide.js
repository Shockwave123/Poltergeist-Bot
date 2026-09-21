/**
 * Google AI Setup Guide - Step-by-step personal API key configuration
 */

const { getSetupMessage, isConfigured } = require('../../utils/googleAi');
const { getKey } = require('../../utils/userApiKeys');

module.exports = {
  name: 'setupguide',
  aliases: ['setup', 'guide', 'aisetup', 'getstarted'],
  category: 'general',
  description: 'Step-by-step guide to get and configure your personal Google AI key',
  usage: '.setupguide',

  async execute(sock, msg, args, extra) {
    try {
      const personalConf = require('../../utils/userApiKeys').getUserAiConfig(extra.sender);
      const globalKey = isConfigured();

      let personalStatus = '❌ No personal API key saved.';
      if (personalConf?.key) {
        const pName = personalConf.provider === 'openrouter' ? 'OpenRouter' : 'Google Gemini';
        personalStatus = `✅ Personal ${pName} key is active.`;
      }

      const guide = `
╔═══════════════════════════════════════════════════════════════╗
║          🤖 AI SETUP GUIDE (Gemini & OpenRouter)              ║
╚═══════════════════════════════════════════════════════════════╝

*STATUS*
${personalStatus}
${globalKey ? '✅ Bot has a global fallback API key.' : '❌ Bot has no global API key.'}

───────────────────────────────────────────────────────────────
*OPTION 1: Get Free Google Gemini API Key (Recommended)*

1. Visit: https://aistudio.google.com/app/apikey
2. Sign in with Google and click "Create API Key"
3. Copy your key (starts with "AIza" or "AQ.")
4. In private chat with the bot, send:
   ${extra.prefix || '.'}aikey set YOUR_KEY

───────────────────────────────────────────────────────────────
*OPTION 2: Get OpenRouter API Key (Multi-Model Support)*

1. Visit: https://openrouter.ai/keys
2. Sign in and generate an API key (starts with "sk-or-")
3. In private chat with the bot, send:
   ${extra.prefix || '.'}aikey set YOUR_KEY

───────────────────────────────────────────────────────────────
*STEP 3: Verify It Works*

<<<<<<< HEAD
Try any of these AI commands:
• ${extra.prefix || '.'}ai What is the speed of light?
• ${extra.prefix || '.'}deepread (reply to an image/doc with a question)
• ${extra.prefix || '.'}summary 100 (summarize last 100 messages in group)
• ${extra.prefix || '.'}aikey test (run diagnostic test)
=======
Try one of these AI features:

• .ai What is the capital of France?
• .deepread (reply to an image and ask a question)
• .summary 200 (in a group, summarize the last 200 messages)
• .roastai @someone
• .transcribe (reply to a voice note)

───────────────────────────────────────────────────────────────
*TROUBLESHOOTING*

❌ "Key normally starts with AIza or AQ"?
   → Your key format is invalid. Double-check you copied it fully.

❌ "Google AI is not configured"?
   → You need EITHER a personal key OR the bot owner needs a global key.
   → Try: .googleai set YOUR_KEY

❌ Still not working?
   → The key might be expired or have no free quota left.
   → Create a new key in Google AI Studio.
   → Revoke old keys you don't use.
>>>>>>> b2a8eb0b338d123d7b02d51698cdb5bd1799e037

───────────────────────────────────────────────────────────────
*MANAGE YOUR KEY*

• View status: ${extra.prefix || '.'}aikey
• Run connection test: ${extra.prefix || '.'}aikey test
• Remove saved key: ${extra.prefix || '.'}aikey remove

───────────────────────────────────────────────────────────────
*FEATURES ACTIVATED WITH YOUR KEY*

✓ Direct AI chat (${extra.prefix || '.'}ai, ${extra.prefix || '.'}gpt, ${extra.prefix || '.'}ask)
✓ Image & document analysis (${extra.prefix || '.'}deepread)
✓ Group chat summaries (${extra.prefix || '.'}summary)
✓ AI Chatbot replies on mention
✓ Voice note transcription (${extra.prefix || '.'}transcribe)
✓ Fun AI commands (${extra.prefix || '.'}roastai, ${extra.prefix || '.'}story, etc.)
`;

      await extra.reply(guide);
    } catch (error) {
      console.error('[setupguide] error:', error);
      await extra.reply(`❌ Error loading guide: ${error.message}`);
    }
  },
};
