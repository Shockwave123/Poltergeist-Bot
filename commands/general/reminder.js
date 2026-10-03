/**
 * Custom one-time reminders.
 */

const reminders = require('../../utils/reminders');
const moment = require('moment-timezone');
const config = require('../../config');

const RELATIVE_UNITS = {
  minute: 'minutes', minutes: 'minutes', min: 'minutes', mins: 'minutes',
  hour: 'hours', hours: 'hours', hr: 'hours', hrs: 'hours',
  day: 'days', days: 'days', week: 'weeks', weeks: 'weeks'
};

function parseDateTime(dateText, timeText) {
  const value = moment.tz(`${dateText} ${timeText}`, 'YYYY-MM-DD HH:mm', true, config.timezone);
  return value.isValid() ? value.valueOf() : NaN;
}

function parseReminder(args) {
  const input = args.join(' ').trim();
  const dated = input.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})\s+(.+)$/);
  if (dated) return { at: parseDateTime(dated[1], dated[2]), text: dated[3].trim() };

  const startsWithDelay = input.match(/^in\s+(\d+)\s+([a-z]+)(?:\s+to)?\s+(.+)$/i);
  const endsWithDelay = input.match(/^(.+?)\s+in\s+(\d+)\s+([a-z]+)$/i);
  const relative = startsWithDelay || endsWithDelay;
  if (relative) {
    const amount = Number(startsWithDelay ? startsWithDelay[1] : endsWithDelay[2]);
    const unit = RELATIVE_UNITS[(startsWithDelay ? startsWithDelay[2] : endsWithDelay[3]).toLowerCase()];
    const text = String(startsWithDelay ? startsWithDelay[3] : endsWithDelay[1]).trim();
    if (!unit || !text || !Number.isSafeInteger(amount) || amount < 1 || amount > 10080) return null;
    return { at: Date.now() + moment.duration(amount, unit).asMilliseconds(), text };
  }

  const atTime = input.match(/^(.+?)\s+at\s+(\d{1,2}:\d{2})$/i);
  if (atTime) {
    const due = moment.tz(atTime[2], 'H:mm', true, config.timezone);
    if (!due.isValid()) return { at: NaN, text: atTime[1].trim() };
    const now = moment().tz(config.timezone);
    due.year(now.year()).month(now.month()).date(now.date());
    if (due.valueOf() <= Date.now()) due.add(1, 'day');
    return { at: due.valueOf(), text: atTime[1].trim() };
  }

  return null;
}

function formatDate(timestamp) {
  return moment(timestamp).tz(config.timezone).format('MMM D, YYYY [at] h:mm A z');
}

module.exports = {
  name: 'remind',
  aliases: ['reminder', 'reminders', 'remindme', 'alarm'],
  category: 'general',
  description: 'Set, list, or cancel a reminder by duration or time',
  usage: '.remindme in 20 minutes to check the oven',

  setSocket: reminders.setSocket,

  async execute(sock, msg, args, extra) {
    const subcommand = (args[0] || '').toLowerCase();

    if (!args.length || subcommand === 'list' || subcommand === 'all') {
      const items = reminders.getReminders(extra.sender, extra.from);
      if (!items.length) return extra.reply('You have no reminders in this chat.');
      return extra.reply(`⏰ *Your reminders*\n\n${items.map((item, index) => `${index + 1}. ${item.text}\n   ${formatDate(item.at)}\n   ID: ${item.id}`).join('\n\n')}`);
    }

    if (subcommand === 'cancel' || subcommand === 'delete') {
      const id = args[1];
      if (!id) return extra.reply('Use `.remind cancel ID`. Run `.reminders` to see reminder IDs.');
      return extra.reply(reminders.cancelReminder(id, extra.sender, extra.from) ? '✅ Reminder cancelled.' : '❌ Reminder not found in this chat.');
    }

    const parsed = parseReminder(args);
    if (!parsed) {
      return extra.reply('Use `.remindme in 20 minutes to check the oven`, `.remindme call Mum at 18:30`, or `.remind YYYY-MM-DD HH:mm <task>`. Times use Asia/Kolkata.');
    }
    const { at: timestamp, text } = parsed;
    if (!Number.isFinite(timestamp) || timestamp <= Date.now()) {
      return extra.reply('❌ Enter a valid future reminder time.');
    }
    if (!text) return extra.reply('❌ Add what you want me to remind you about.');

    const id = reminders.addReminder({ userId: extra.sender, chatId: extra.from, at: timestamp, text });
    return extra.reply(`✅ Reminder set for ${formatDate(timestamp)}.\nID: ${id}`);
  },
};
