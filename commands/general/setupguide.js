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
      const personalKey = getKey(extra.sender);
      const globalKey = isConfigured();

      const guide = `
╔═══════════════════════════════════════════════════════════════╗
║          🤖 GOOGLE AI SETUP GUIDE                             ║
╚═══════════════════════════════════════════════════════════════╝

*STATUS*
${personalKey ? '✅ You have a personal API key saved.' : '❌ No personal API key saved.'}
${globalKey ? '✅ Bot has a global API key.' : '❌ Bot does not have a global API key.'}

───────────────────────────────────────────────────────────────
*STEP 1: Get Your Free Google AI API Key*

1. Go to: https://aistudio.google.com/app/apikey
2. Sign in with your Google account (create one free if needed)
3. Click "Create API Key"
4. Select or create a Google Cloud project
5. Copy the generated key (starts with "AIza" or "AQ.")
6. Keep it private — never share it!

───────────────────────────────────────────────────────────────
*STEP 2: Save Your Key to This Bot*

Send me this message (replace YOUR_KEY with your actual key):

.googleai set YOUR_KEY

Example:
.googleai set AIza7h8d9j0k1l2m3n4o5p6q7r8s9t0u1v2w

After sending, I'll encrypt and store your key privately.

───────────────────────────────────────────────────────────────
*STEP 3: Verify It Works*

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

───────────────────────────────────────────────────────────────
*MANAGE YOUR KEY*

View status:
.googleai

Remove your saved key:
.googleai remove

───────────────────────────────────────────────────────────────
*FEATURES THAT USE YOUR KEY*

✓ Chat & AI responses (.ai, .gpt, .ask)
✓ Chatbot replies (@mention the bot)
✓ Document & image analysis (.deepread, .read)
✓ Group/text summaries (.summary, .summarize)
✓ AI roasts & fun commands (.roastai, .story, etc.)
✓ Voice note transcription (.transcribe, .stt)
✓ Auto-chat mode (.autochat on)

───────────────────────────────────────────────────────────────

Questions? Send me a message or check the bot's help menu.
`;

      await extra.reply(guide);
    } catch (error) {
      console.error('[setupguide] error:', error);
      await extra.reply(`❌ Error loading guide: ${error.message}`);
    }
  },
};
