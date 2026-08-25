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
  usage: '.summary [number of messages]',
  groupOnly: true,

  async execute(sock, msg, args, extra) {
    try {
      const limit = Math.min(Math.max(Number(args[0]) || 100, 10), 500);
      const messages = getMessages(extra.from, limit);
      if (!messages.length) return extra.reply('There are no saved group messages to summarize yet.');
      const transcript = messages.map((entry) => `${entry.sender}: ${entry.text}`).join('\n');
      const answer = await generateContent([{ text: `Summarize this group chat for members who missed it. Return concise bullet points covering decisions, questions, tasks, links, and unresolved issues. Do not invent details.\n\n${transcript}` }], { temperature: 0.2, maxOutputTokens: 900, apiKey: getKey(extra.sender) });
      await extra.reply(`🧾 *Group Summary*\n\n${answer}`);
    } catch (error) {
      console.error('[summary] error:', error);
      await extra.reply(`❌ Could not create the summary: ${error.message}`);
    }
  },
};
