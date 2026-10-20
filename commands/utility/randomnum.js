/**
 * RandomNum Command - Generate a random number
 * Usage: .randomnum [min] [max]
 * Example: .randomnum 1 100
 * Example: .randomnum (defaults to 1-100)
 */

module.exports = {
  name: 'randomnum',
  aliases: ['rand', 'randomnumber', 'dice'],
  category: 'utility',
  description: 'Generate a random number within a range',
  usage: '.randomnum [min] [max]\nExample: .randomnum 1 100\nExample: .randomnum (defaults 1-100)',
  async execute(sock, msg, args, extra) {
    try {
      const chatId = extra.from;

      let min = 1;
      let max = 100;

      if (args.length >= 1) {
        min = parseInt(args[0], 10);
      }
      if (args.length >= 2) {
        max = parseInt(args[1], 10);
      }

      if (isNaN(min) || isNaN(max)) {
        return extra.reply('❌ Please provide valid numbers for min and max.');
      }

      if (min > max) {
        [min, max] = [max, min];
      }

      const range = max - min + 1;
      if (range > 1000000) {
        return extra.reply('❌ Range too large. Max range is 1,000,000.');
      }

      const result = Math.floor(Math.random() * range) + min;

      await extra.reply(
        `🎲 *Random Number*\n\n` +
        `Range: ${min} to ${max}\n` +
        `Result: *${result}*`
      );
    } catch (error) {
      console.error('[randomnum] error:', error);
      await extra.reply(`❌ Random number generation failed: ${error.message}`);
    }
  }
};
