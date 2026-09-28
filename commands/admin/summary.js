/**
 * Summarize recent group messages with Gemini.
 */

const { generateContent } = require('../../utils/googleAi');
const { getMessages } = require('../../utils/groupConversation');
const { getKey } = require('../../utils/userApiKeys');

module.exports = {
  name: 'summary',
  aliases: ['summarize', 'chatsummary'],
  category: 'admin',
  description: 'Summarize recent group conversation',
  usage: '.summary [number of messages] or reply to a long message',

  async execute(sock, msg, args, extra) {
    try {
      const context = msg.message?.extendedTextMessage?.contextInfo;
      const quoted = context?.quotedMessage;
      const quotedText = quoted?.conversation || quoted?.extendedTextMessage?.text || quoted?.imageMessage?.caption || quoted?.documentMessage?.caption || '';
      const directText = args.join(' ').trim();
      const limit = Math.min(Math.max(Number(args[0]) || 100, 10), 500);
      const messages = directText && !/^\d+$/.test(directText) ? [] : getMessages(extra.from, limit);
      const transcript = directText && !/^\d+$/.test(directText)
        ? directText
        : quotedText || messages.map((entry) => `${entry.sender}: ${entry.text}`).join('\n');
      if (!transcript) return extra.reply('Send text or reply to a long message with `.summarize`, or use `.summary` in a group.');
      const answer = await generateContent([{ text: `Summarize this group chat for members who missed it. Return concise bullet points covering decisions, questions, tasks, links, and unresolved issues. Do not invent details.\n\n${transcript}` }], { temperature: 0.2, maxOutputTokens: 900, apiKey: getKey(extra.sender) });
      await extra.reply(`🧾 *Group Summary*\n\n${answer}`);
    } catch (error) {
      console.error('[summary] error:', error);
      await extra.reply(`❌ Could not create the summary: ${error.message}`);
    }
  },
};
