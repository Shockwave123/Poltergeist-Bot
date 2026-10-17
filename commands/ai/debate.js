/**
 * Debate Command - Structured AI debate between two sides.
 *
 * Usage:
 *   .debate <topic>              - Pro vs con debate on a topic
 *   .vs <Side A> vs <Side B>     - Debate Side A vs Side B
 *
 * Render free tier: exactly 2 sequential AI calls (opening + rebuttal),
 * short token limits, automatic Gemini/OpenRouter failover.
 */

const { generateContent } = require('../../utils/googleAi');
const { getKey } = require('../../utils/userApiKeys');

const MAX_TOKENS = 600;

module.exports = {
  name: 'debate',
  aliases: ['vs'],
  category: 'ai',
  description: 'Structured AI debate between two viewpoints',
  usage: '.debate <topic>  |  .vs <Side A> vs <Side B>',

  async execute(sock, msg, args, extra) {
    try {
      const raw = args.join(' ').trim();
      if (!raw) {
        return extra.reply(
          '⚔️ *AI Debate*\n\n' +
          'Usage:\n' +
          `• ${extra.prefix || '.'}debate <topic>  — pro vs con debate\n` +
          `• ${extra.prefix || '.'}vs <Side A> vs <Side B>  — custom sides\n\n` +
          'Example: .debate SQL vs NoSQL\n' +
          'Example: .vs Python vs JavaScript'
        );
      }

      let sideA, sideB, topic;
      const vsMatch = raw.match(/^(.+?)\s+vs\s+(.+)$/i);
      if (vsMatch) {
        sideA = vsMatch[1].trim();
        sideB = vsMatch[2].trim();
        topic = `${sideA} vs ${sideB}`;
      } else {
        sideA = 'Proponent';
        sideB = 'Opponent';
        topic = raw;
      }

      await extra.react('⚔️');

      // Round 1: side A opens. Round 2: side B rebuts (2 calls total - free tier friendly)
      let conversation = '';
      const turns = [
        { speaker: sideA, stance: 'arguing FOR' },
        { speaker: sideB, stance: 'arguing AGAINST (rebuttal)' },
      ];

      for (const turn of turns) {
        const prompt = [
          'You are participating in a structured WhatsApp debate.',
          `Topic: ${topic}`,
          `You are ${turn.speaker}, ${turn.stance}.`,
          conversation ? `Debate so far:\n${conversation}` : 'You have the opening statement.',
          `Reply now as ${turn.speaker}. Max 200 words. Start your message with [${turn.speaker}]. Be persuasive but respectful - no insults.`,
        ].join('\n\n');

        const response = await generateContent([{ text: prompt }], {
          temperature: 0.7,
          maxOutputTokens: MAX_TOKENS,
          timeout: 60000,
          apiKey: getKey(extra.sender),
          senderId: extra.sender,
        });

        conversation += `[${turn.speaker}] ${response}\n\n`;
      }

      await extra.reply(
        `⚔️ *AI DEBATE*\nTopic: *${topic}*\nSides: [${sideA}] vs [${sideB}]\n\n${conversation.trim()}`
      );
      await extra.react('✅');
    } catch (error) {
      console.error('[debate] error:', error);
      try { await extra.react('❌'); } catch { /* ignore */ }
      if (error.message?.includes('not configured')) {
        return extra.reply(error.message);
      }
      await extra.reply(`❌ Debate failed.\n\n${error.message}`);
    }
  },
};
