/**
 * DateCalc Command - Days between two dates
 * Usage: .datecalc <YYYY-MM-DD> <YYYY-MM-DD>
 * Example: .datecalc 2026-01-01 2026-12-31
 */

module.exports = {
  name: 'datecalc',
  aliases: ['datediff', 'daysbetween'],
  category: 'utility',
  description: 'Calculate days between two dates',
  usage: '.datecalc <YYYY-MM-DD> <YYYY-MM-DD>\nExample: .datecalc 2026-01-01 2026-12-31',
  async execute(sock, msg, args, extra) {
    try {
      const chatId = extra.from;

      if (args.length < 2) {
        return extra.reply(
          '📅 *Date Difference Calculator*\n\n' +
          'Usage: `.datecalc <YYYY-MM-DD> <YYYY-MM-DD>`\n' +
          'Example: `.datecalc 2026-01-01 2026-12-31`'
        );
      }

      const date1 = new Date(args[0]);
      const date2 = new Date(args[1]);

      if (isNaN(date1.getTime()) || isNaN(date2.getTime())) {
        return extra.reply('❌ Invalid date format. Use YYYY-MM-DD for both dates.');
      }

      const diffMs = Math.abs(date2 - date1);
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      const diffWeeks = Math.floor(diffDays / 7);
      const diffMonths = Math.floor(diffDays / 30.44);
      const diffYears = Math.floor(diffDays / 365.25);

      await extra.reply(
        `📅 *Date Difference*\n\n` +
        `From: ${date1.toDateString()}\n` +
        `To: ${date2.toDateString()}\n\n` +
        `Days: ${diffDays}\n` +
        `Weeks: ${diffWeeks}\n` +
        `Months (approx): ${diffMonths}\n` +
        `Years (approx): ${diffYears}`
      );
    } catch (error) {
      console.error('[datecalc] error:', error);
      await extra.reply(`❌ Date calculation failed: ${error.message}`);
    }
  }
};
