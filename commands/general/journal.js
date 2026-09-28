/**
 * Private journal and mood log.
 */

const { addJournal, getUser } = require('../../utils/personalAi');

module.exports = {
  name: 'journal',
  aliases: ['mood', 'diary'],
  category: 'general',
  description: 'Save a private journal entry or view your mood trend',
  usage: '.journal <thought> | .journal mood',

  async execute(sock, msg, args, extra) {
    const text = args.join(' ').trim();
    if (!text) return extra.reply('Write something after `.journal`, or use `.journal mood` to see your recent mood log.');
    if (text.toLowerCase() === 'mood') {
      const entries = getUser(extra.sender).journal.slice(-7);
      if (!entries.length) return extra.reply('No journal entries yet.');
      return extra.reply(`📓 *Recent mood*\n\n${entries.map((entry) => `${entry.mood} ${new Date(entry.at).toLocaleDateString()}`).join('\n')}`);
    }
    const mood = /\b(happy|great|good|excited|proud|calm)\b/i.test(text) ? '🙂' : /\b(sad|angry|stressed|anxious|tired|bad|upset)\b/i.test(text) ? '😟' : '•';
    addJournal(extra.sender, { text, mood, at: Date.now() });
    return extra.reply('Saved privately. Thanks for checking in with yourself.');
  },
};
