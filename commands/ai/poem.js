/**
 * Poem Command - Generate a poem on any topic
 * Usage: .poem <topic> [style]
 * Example: .poem love haiku
 */

const { generateContent } = require('../../utils/googleAi');
const { getKey } = require('../../utils/userApiKeys');

module.exports = {
  name: 'poem',
  aliases: ['poetry'],
  category: 'ai',
  description: 'Generate a poem on any topic',
  usage: '.poem <topic> [style]\nExample: .poem nature haiku\nStyles: haiku, sonnet, free verse, limerick',
  async execute(sock, msg, args, extra) {
    try {
      const chatId = extra.from;

      if (args.length === 0) {
        return extra.reply(
          '🎭 *Poem Generator*\n\n' +
          'Usage: `.poem <topic> [style]`\n' +
          'Example: `.poem autumn haiku`\n' +
          'Styles: haiku, sonnet, free verse, limerick'
        );
      }

      const lastArg = args[args.length - 1].toLowerCase();
      const styles = ['haiku', 'sonnet', 'freeverse', 'free verse', 'limerick'];
      let style = '';
      let topicArgs = args;

      if (styles.includes(lastArg)) {
        style = lastArg;
        topicArgs = args.slice(0, -1);
      }

      const topic = topicArgs.join(' ').trim();
      if (!topic) {
        return extra.reply('❌ Please provide a topic for the poem.');
      }

      await extra.react('🎭');

      const stylePrompt = style ? `Write it as a ${style}.` : '';
      const prompt = [
        `Write an original poem about "${topic}".`,
        stylePrompt,
        'Make it creative, evocative, and well-structured.',
      ].join(' ');

      const poem = await generateContent([{ text: prompt }], {
        temperature: 0.8,
        maxOutputTokens: 800,
        timeout: 60000,
        apiKey: getKey(extra.sender),
        senderId: extra.sender,
      });

      await sock.sendMessage(chatId, {
        text: `🎭 *Poem: ${topic}*${style ? ` (${style})` : ''}\n\n${poem.trim()}`,
      }, { quoted: msg });

      await extra.react('✅');
    } catch (error) {
      console.error('[poem] error:', error);
      try { await extra.react('❌'); } catch { /* ignore */ }
      if (error.message?.includes('not configured')) {
        return extra.reply(error.message);
      }
      await extra.reply(`❌ Poem generation failed: ${error.message}`);
    }
  }
};
