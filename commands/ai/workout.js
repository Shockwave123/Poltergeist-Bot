/**
 * Workout Command - Generate a workout plan
 * Usage: .workout <goal> [level]
 * Example: .weight loss beginner
 */

const { generateContent } = require('../../utils/googleAi');
const { getKey } = require('../../utils/userApiKeys');

module.exports = {
  name: 'workout',
  aliases: ['exercise', 'fitness'],
  category: 'ai',
  description: 'Generate a personalized workout plan',
  usage: '.workout <goal> [level]\nExample: .workout weight loss beginner\nLevels: beginner, intermediate, advanced',
  async execute(sock, msg, args, extra) {
    try {
      const chatId = extra.from;

      if (args.length === 0) {
        return extra.reply(
          '💪 *Workout Plan Generator*\n\n' +
          'Usage: `.workout <goal> [level]`\n' +
          'Example: `.workout weight loss beginner`\n' +
          'Example: `.workout muscle gain intermediate`\n' +
          'Levels: beginner, intermediate, advanced'
        );
      }

      const lastArg = args[args.length - 1].toLowerCase();
      const levels = ['beginner', 'intermediate', 'advanced'];
      let level = 'beginner';
      let goalArgs = args;

      if (levels.includes(lastArg)) {
        level = lastArg;
        goalArgs = args.slice(0, -1);
      }

      const goal = goalArgs.join(' ').trim();
      if (!goal) {
        return extra.reply('❌ Please specify a fitness goal (e.g., weight loss, muscle gain, endurance).');
      }

      await extra.react('💪');

      const prompt = [
        `Create a ${level}-level workout plan for: ${goal}`,
        'Include: exercises, sets, reps, rest time, and frequency per week.',
        'Add warm-up and cool-down suggestions.',
        'Keep it safe and practical for home or gym.',
      ].join(' ');

      const plan = await generateContent([{ text: prompt }], {
        temperature: 0.6,
        maxOutputTokens: 1000,
        timeout: 60000,
        apiKey: getKey(extra.sender),
        senderId: extra.sender,
      });

      await sock.sendMessage(chatId, {
        text: `💪 *Workout Plan: ${goal}* (Level: ${level})\n\n${plan.trim()}`,
      }, { quoted: msg });

      await extra.react('✅');
    } catch (error) {
      console.error('[workout] error:', error);
      try { await extra.react('❌'); } catch { /* ignore */ }
      if (error.message?.includes('not configured')) {
        return extra.reply(error.message);
      }
      await extra.reply(`❌ Workout generation failed: ${error.message}`);
    }
  }
};
