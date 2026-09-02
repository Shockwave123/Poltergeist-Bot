/**
 * Custom one-time reminders.
 */

const reminders = require('../../utils/reminders');

function parseDateTime(dateText, timeText) {
  const value = `${dateText}T${timeText}:00`;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00$/.test(value)) return NaN;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : NaN;
}

function formatDate(timestamp) {
  return new Date(timestamp).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

module.exports = {
  name: 'remind',
  aliases: ['reminder', 'alarm'],
  category: 'general',
  description: 'Set a reminder for a future date and time',
  usage: '.remind YYYY-MM-DD HH:mm <message>',

  setSocket: reminders.setSocket,

  async execute(sock, msg, args, extra) {
    const subcommand = (args[0] || '').toLowerCase();

    if (subcommand === 'list' || subcommand === 'all') {
      const items = reminders.getReminders(extra.sender, extra.from);
      if (!items.length) return extra.reply('You have no reminders in this chat.');
      return extra.reply(`⏰ *Your reminders*\n\n${items.map((item, index) => `${index + 1}. ${item.text}\n   ${formatDate(item.at)}\n   ID: ${item.id}`).join('\n\n')}`);
    }

    if (subcommand === 'cancel' || subcommand === 'delete') {
      const id = args[1];
      if (!id) return extra.reply('Use `.remind cancel ID`. Run `.reminders` to see reminder IDs.');
      return extra.reply(reminders.cancelReminder(id, extra.sender, extra.from) ? '✅ Reminder cancelled.' : '❌ Reminder not found in this chat.');
    }

    if (args.length < 3) {
      return extra.reply('Use `.remind YYYY-MM-DD HH:mm <message>`\nExample: `.remind 2026-09-10 18:30 call Mum`\nUse `.reminders` to list or `.remind cancel ID` to cancel.');
    }

    const timestamp = parseDateTime(args[0], args[1]);
    const text = args.slice(2).join(' ').trim();
    if (!Number.isFinite(timestamp) || timestamp <= Date.now()) {
      return extra.reply('❌ Enter a future date as `YYYY-MM-DD HH:mm`. The time uses the bot server timezone.');
    }
    if (!text) return extra.reply('❌ Add what you want me to remind you about.');

    const id = reminders.addReminder({ userId: extra.sender, chatId: extra.from, at: timestamp, text });
    return extra.reply(`✅ Reminder set for ${formatDate(timestamp)}.\nID: ${id}`);
  },
};
