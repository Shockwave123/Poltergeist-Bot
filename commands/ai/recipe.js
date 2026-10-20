/**
 * Recipe Command - Generate a recipe from ingredients
 * Usage: .recipe <ingredients>
 * Example: .recipe chicken, tomatoes, garlic, pasta
 */

const { generateContent } = require('../../utils/googleAi');
const { getKey } = require('../../utils/userApiKeys');

module.exports = {
  name: 'recipe',
  aliases: ['cook', 'recipie'],
  category: 'ai',
  description: 'Generate a recipe from ingredients you have',
  usage: '.recipe <ingredients>\nExample: .recipe chicken, tomatoes, garlic, pasta',
  async execute(sock, msg, args, extra) {
    try {
      const chatId = extra.from;
      const ingredients = args.join(' ').trim();

      if (!ingredients) {
        return extra.reply(
          '👨‍🍳 *Recipe Generator*\n\n' +
          'Usage: `.recipe <ingredients>`\n' +
          'Example: `.recipe chicken, tomatoes, garlic, pasta`\n' +
          'Example: `.recipe potatoes, eggs, cheese`'
        );
      }

      await extra.react('👨‍🍳');

      const prompt = [
        `Create a recipe using these ingredients: ${ingredients}`,
        'Include: dish name, prep time, cook time, servings, step-by-step instructions,',
        'and optional substitutions. Keep it practical and easy to follow.',
      ].join(' ');

      const recipe = await generateContent([{ text: prompt }], {
        temperature: 0.7,
        maxOutputTokens: 1000,
        timeout: 60000,
        apiKey: getKey(extra.sender),
        senderId: extra.sender,
      });

      await sock.sendMessage(chatId, {
        text: `👨‍🍳 *Recipe*\n\nIngredients: ${ingredients}\n\n${recipe.trim()}`,
      }, { quoted: msg });

      await extra.react('✅');
    } catch (error) {
      console.error('[recipe] error:', error);
      try { await extra.react('❌'); } catch { /* ignore */ }
      if (error.message?.includes('not configured')) {
        return extra.reply(error.message);
      }
      await extra.reply(`❌ Recipe generation failed: ${error.message}`);
    }
  }
};
