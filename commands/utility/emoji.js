/**
 * Emoji Command - Emoji search and info
 * Usage: .emoji <search term>
 * Example: .emoji smile
 * Example: .emoji cat
 */

const EMOJI_DB = {
  smile: ['😊', '😄', '😃', '😁', '😀'],
  laugh: ['😂', '🤣', '😆'],
  love: ['❤️', '😍', '🥰', '😘', '💕'],
  heart: ['❤️', '💙', '💚', '💛', '💜', '🖤', '🤍', '🤎'],
  sad: ['😢', '😭', '😔', '😞', '💔'],
  angry: ['😠', '😡', '🤬', '😤'],
  cry: ['😭', '😢', '😱'],
  cat: ['🐱', '🐈', '🐾', '😺', '😸', '😹'],
  dog: ['🐶', '🐕', '🐩', '🦮', '🐕‍🦺'],
  fire: ['🔥', '🧨', '💥'],
  star: ['⭐', '🌟', '✨', '🌠'],
  moon: ['🌙', '🌚', '🌛', '🌜', '🌝'],
  sun: ['☀️', '🌞', '🌅', '🌄'],
  food: ['🍕', '🍔', '🍟', '🌭', '🌮', '🌯', '🍝', '🍣'],
  pizza: ['🍕'],
  burger: ['🍔'],
  music: ['🎵', '🎶', '🎧', '🎸', '🎹', '🎤'],
  party: ['🎉', '🎊', '🎈', '🥳', '🍾'],
  clap: ['👏', '🙌', '👍'],
  thumbsup: ['👍'],
  thumbsdown: ['👎'],
  wave: ['👋'],
  hello: ['👋', '👋🏻', '👋🏼'],
  bye: ['👋', '👋🏻'],
  money: ['💰', '💵', '💸', '💳', '💎'],
  coffee: ['☕', '🍵', '🧋'],
  tea: ['🍵'],
  beer: ['🍺', '🍻'],
  wine: ['🍷'],
  book: ['📚', '📖', '📓', '📔'],
  phone: ['📱', '📞', '📞'],
  computer: ['💻', '🖥️', '⌨️', '🖱️'],
  rocket: ['🚀', '🛰️', '🌌'],
  car: ['🚗', '🚕', '🚌', '🚲'],
  plane: ['✈️', '🛫', '🛬'],
  clock: ['🕐', '🕒', '🕕', '🕛'],
  time: ['🕐', '⏰', '⏳', '⌛'],
  fire: ['🔥'],
  water: ['💧', '🌊', '🚿'],
  earth: ['🌍', '🌎', '🌏', '🌱', '🌳'],
  flower: ['🌸', '🌹', '🌺', '🌻', '🌼'],
  rose: ['🌹'],
  gift: ['🎁', '🎀'],
  crown: ['👑', '🤴', '👸'],
  king: ['👑'],
  queen: ['👑'],
};

module.exports = {
  name: 'emoji',
  aliases: ['emojis'],
  category: 'utility',
  description: 'Search for emojis by keyword',
  usage: '.emoji <search term>\nExample: .emoji cat\nExample: .emoji love\nCategories: smile, laugh, love, heart, sad, angry, cat, dog, fire, star, moon, sun, food, music, party, phone, computer, rocket, car, plane, clock, water, earth, flower, gift, crown',
  async execute(sock, msg, args, extra) {
    try {
      const chatId = extra.from;
      const query = args.join(' ').toLowerCase().trim();

      if (!query) {
        const categories = Object.keys(EMOJI_DB).join(', ');
        return extra.reply(
          '😀 *Emoji Search*\n\n' +
          'Usage: `.emoji <keyword>`\n' +
          'Example: `.emoji cat`\n' +
          `Categories: ${categories}`
        );
      }

      const found = [];
      for (const [key, emojis] of Object.entries(EMOJI_DB)) {
        if (key.includes(query) || query === 'all') {
          found.push(`• ${key}: ${emojis.join(' ')}`);
        }
      }

      if (found.length === 0) {
        return extra.reply(`❌ No emojis found for "${query}". Try: smile, love, cat, fire, party...`);
      }

      const text = `😀 *Emoji: ${query}*\n\n${found.slice(0, 10).join('\n')}`;
      await extra.reply(text);
    } catch (error) {
      console.error('[emoji] error:', error);
      await extra.reply(`❌ Emoji search failed: ${error.message}`);
    }
  }
};
