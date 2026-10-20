/**
 * Tip Command - Tip and bill splitter
 * Usage: .tip <amount> [tip_percent] [people]
 * Example: .tip 50 15 4
 */

module.exports = {
  name: 'tip',
  aliases: ['gratuity', 'billsplit'],
  category: 'utility',
  description: 'Calculate tip and split bill',
  usage: '.tip <amount> [tip_percent] [people]\nExample: .tip 50 15 4\nExample: .tip 100 20',
  async execute(sock, msg, args, extra) {
    try {
      const chatId = extra.from;

      if (args.length === 0) {
        return extra.reply(
          '💰 *Tip Calculator*\n\n' +
          'Usage: `.tip <amount> [tip_percent] [people]`\n' +
          'Example: `.tip 50 15 4`\n' +
          'Example: `.tip 100 20`\n' +
          'Default tip: 15%, Default people: 1'
        );
      }

      const amount = parseFloat(args[0]);
      const tipPercent = args.length > 1 ? parseFloat(args[1]) : 15;
      const people = args.length > 2 ? parseInt(args[2], 10) || 1 : 1;

      if (!amount || amount <= 0) {
        return extra.reply('❌ Please provide a valid bill amount.');
      }

      if (tipPercent < 0 || tipPercent > 100) {
        return extra.reply('❌ Tip percentage must be between 0 and 100.');
      }

      if (people < 1) {
        return extra.reply('❌ Number of people must be at least 1.');
      }

      const tipAmount = (amount * tipPercent) / 100;
      const total = amount + tipAmount;
      const perPerson = total / people;
      const tipPerPerson = tipAmount / people;

      await extra.reply(
        `💰 *Tip Calculator*\n\n` +
        `Bill amount: $${amount.toFixed(2)}\n` +
        `Tip (${tipPercent}%): $${tipAmount.toFixed(2)}\n` +
        `Total: $${total.toFixed(2)}\n` +
        `People: ${people}\n` +
        `Per person: $${perPerson.toFixed(2)}\n` +
        `Tip per person: $${tipPerPerson.toFixed(2)}`
      );
    } catch (error) {
      console.error('[tip] error:', error);
      await extra.reply(`❌ Tip calculation failed: ${error.message}`);
    }
  }
};
