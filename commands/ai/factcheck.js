/**
 * FactCheck Command - Verify statements using Gemini (analytical reasoning + grounding).
 *
 * Usage:
 *   .factcheck <statement>     - Verify a claim
 *   reply to a message with .factcheck - verify quoted text
 *
 * Optimized for Render free instance: short timeouts, small token limits,
 * automatic failover between Gemini and OpenRouter.
 */

const { generateContent } = require('../../utils/googleAi');
const { getKey } = require('../../utils/userApiKeys');

function unwrapMessage(message) {
  let content = message || {};
  for (let depth = 0; depth < 5; depth += 1) {
    const inner = content.ephemeralMessage?.message ||
      content.viewOnceMessage?.message ||
      content.viewOnceMessageV2?.message ||
      content.documentWithCaptionMessage?.message;
    if (!inner) break;
    content = inner;
  }
  return content;
}

module.exports = {
  name: 'factcheck',
  aliases: ['verify', 'check'],
  category: 'ai',
  description: 'Fact-check a statement (True / Misleading / False with breakdown)',
  usage: '.factcheck <statement>  |  reply to a message with .factcheck',

  async execute(sock, msg, args, extra) {
    try {
      const current = unwrapMessage(msg.message);
      const contextInfo = current.extendedTextMessage?.contextInfo
        || current.buttonsResponseMessage?.contextInfo
        || current.listResponseMessage?.contextInfo;
      const quotedMessage = unwrapMessage(contextInfo?.quotedMessage);
      const quotedText = quotedMessage?.conversation || quotedMessage?.extendedTextMessage?.text || '';

      const statement = args.join(' ').trim() || quotedText;
      if (!statement) {
        return extra.reply(
          '🔍 *Fact Check*\n\n' +
          'Verify a statement or claim.\n\n' +
          `Usage: ${extra.prefix || '.'}factcheck <statement>\n` +
          'Or reply to a message with: .factcheck\n\n' +
          'Example: .factcheck The Earth is flat'
        );
      }

      await extra.react('🔍');

      const prompt = [
        'You are a meticulous fact-checker. Evaluate the following statement and rate its veracity.',
        '',
        `Statement: "${statement}"`,
        '',
        'Instructions:',
        '1. Rate as: True / Mostly True / Half True / Mostly False / False / Unverifiable',
        '2. Give a concise breakdown of the facts (2-4 bullet points)',
        '3. Note any missing context or nuance',
        '4. Keep it under 300 words',
        '',
        'Format:',
        'VERDICT: <rating>',
        'BREAKDOWN: <brief points>',
      ].join('\n');

      const answer = await generateContent([{ text: prompt }], {
        temperature: 0.2,
        maxOutputTokens: 700,
        timeout: 85000,
        apiKey: getKey(extra.sender),
        senderId: extra.sender,
      });

      await extra.reply(`🔍 *Fact Check*\n\n${answer}`);
      await extra.react('✅');
    } catch (error) {
      console.error('[factcheck] error:', error);
      try { await extra.react('❌'); } catch { /* ignore */ }
      if (error.message?.includes('not configured')) {
        return extra.reply(error.message);
      }
      await extra.reply(`❌ Fact check failed.\n\n${error.message}`);
    }
  },
};
