/**
 * Simple active-recall flashcard coach.
 */

const { addCard, getCards } = require('../../utils/personalAi');

module.exports = {
  name: 'learn',
  aliases: ['flashcard', 'study'],
  category: 'general',
  description: 'Add and quiz yourself with flashcards',
  usage: '.learn add question | answer | .learn quiz',

  async execute(sock, msg, args, extra) {
    const input = args.join(' ').trim();
    if (!input) return extra.reply('Use `.learn add question | answer` or `.learn quiz`.');
    const cards = getCards(extra.sender);
    if (input.toLowerCase() === 'quiz') {
      if (!cards.length) return extra.reply('Add a card first with `.learn add question | answer`.');
      const card = cards[Math.floor(Math.random() * cards.length)];
      return extra.reply(`🧠 Quiz: ${card.question}\n\nReply with your answer, then check: ${card.answer}`);
    }
    const match = input.match(/^add\s+(.+?)\s*\|\s*(.+)$/i);
    if (!match) return extra.reply('Format: `.learn add question | answer`.');
    addCard(extra.sender, { question: match[1].trim(), answer: match[2].trim(), at: Date.now() });
    return extra.reply(`Card saved. You now have ${cards.length + 1} cards.`);
  },
};
