/**
 * Lightweight personal expense tracker.
 */

const { addExpense, getUser } = require('../../utils/personalAi');

module.exports = {
  name: 'expense',
  aliases: ['spend', 'budget'],
  category: 'general',
  description: 'Log an expense or view recent spending',
  usage: '.expense 4500 lunch and cab | .expense total',

  async execute(sock, msg, args, extra) {
    const text = args.join(' ').trim();
    if (!text) return extra.reply('Use `.expense 4500 lunch` or `.expense total`.');
    const user = getUser(extra.sender);
    if (text.toLowerCase() === 'total') {
      const total = user.expenses.reduce((sum, item) => sum + item.amount, 0);
      return extra.reply(`💰 Total logged spending: ${total.toLocaleString()}\nEntries: ${user.expenses.length}`);
    }
    const match = text.match(/(?:^|\s)(\d+(?:[.,]\d{1,2})?)/);
    if (!match) return extra.reply('I need an amount. Example: `.expense 4500 lunch and cab`.');
    const amount = Number(match[1].replace(',', '.'));
    const note = text.slice(match.index + match[0].length).trim() || 'Uncategorized';
    addExpense(extra.sender, { amount, note, at: Date.now() });
    return extra.reply(`Logged ${amount.toLocaleString()} for ${note}.`);
  },
};
