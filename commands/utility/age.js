/**
 * Age Command - Calculate age from birthdate
 * Usage: .age <YYYY-MM-DD>
 * Example: .age 1995-05-15
 */

module.exports = {
  name: 'age',
  aliases: ['birthday', 'dob'],
  category: 'utility',
  description: 'Calculate age from birthdate',
  usage: '.age <YYYY-MM-DD>\nExample: .age 1995-05-15',
  async execute(sock, msg, args, extra) {
    try {
      const chatId = extra.from;

      if (args.length === 0) {
        return extra.reply(
          '🎂 *Age Calculator*\n\n' +
          'Usage: `.age <YYYY-MM-DD>`\n' +
          'Example: `.age 1995-05-15`'
        );
      }

      const birth = new Date(args[0]);
      const today = new Date();

      if (isNaN(birth.getTime())) {
        return extra.reply('❌ Invalid date format. Use YYYY-MM-DD.');
      }

      if (birth > today) {
        return extra.reply('❌ Birthdate cannot be in the future.');
      }

      let years = today.getFullYear() - birth.getFullYear();
      const monthDiff = today.getMonth() - birth.getMonth();
      const dayDiff = today.getDate() - birth.getDate();

      if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
        years -= 1;
      }

      const months = (monthDiff + 12) % 12;
      const days = dayDiff >= 0 ? dayDiff : new Date(today.getFullYear(), today.getMonth(), 0).getDate() - birth.getDate() + today.getDate();

      await extra.reply(
        `🎂 *Age*\n\n` +
        `Birthdate: ${birth.toDateString()}\n` +
        `Age: ${years} years, ${months} months, ${days} days\n` +
        `Total days alive: ${Math.floor((today - birth) / (1000 * 60 * 60 * 24))}`
      );
    } catch (error) {
      console.error('[age] error:', error);
      await extra.reply(`❌ Age calculation failed: ${error.message}`);
    }
  }
};
