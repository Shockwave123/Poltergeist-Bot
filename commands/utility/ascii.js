/**
 * ASCII Command - Generate ASCII art from text
 * Usage: .ascii <text> [font]
 * Example: .ascii Hello World
 * Fonts: standard, slant, big, block, bubble
 */

const FIGLET_FONTS = {
  standard: [
    // Very simple block-style font (5x5-ish per char)
    { a: ['  ###  ', '#   # ', '#   # ', '#   # ', '  ###  '], b: ['  ###  ', '#   # ', '#   # ', '#   # ', '  ###  '] },
  ],
};

const SIMPLE_FONT = {
  ' ': ['     ', '     ', '     ', '     ', '     '],
  'A': ['  #  ', ' # # ', '#   #', '#####', '#   #'],
  'B': ['###  ', '#   #', '###  ', '#   #', '###  '],
  'C': [' ### ', '#    ', '#    ', '#    ', ' ### '],
  'D': ['###  ', '#   #', '#   #', '#   #', '###  '],
  'E': ['#####', '#    ', '###  ', '#    ', '#####'],
  'F': ['#####', '#    ', '###  ', '#    ', '#    '],
  'G': [' ### ', '#    ', '# ## ', '#   #', ' ### '],
  'H': ['#   #', '#   #', '#####', '#   #', '#   #'],
  'I': ['#####', '  #  ', '  #  ', '  #  ', '#####'],
  'J': ['#### ', '   # ', '   # ', '#   #', ' ### '],
  'K': ['#   #', '#  # ', '# #  ', '#  # ', '#   #'],
  'L': ['#    ', '#    ', '#    ', '#    ', '#####'],
  'M': ['#   #', '## ##', '# # #', '#   #', '#   #'],
  'N': ['#   #', '##  #', '# # #', '#  ##', '#   #'],
  'O': [' ### ', '#   #', '#   #', '#   #', ' ### '],
  'P': ['###  ', '#   #', '###  ', '#    ', '#    '],
  'Q': [' ### ', '#   #', '# # #', '#  # ', ' ### '],
  'R': ['###  ', '#   #', '###  ', '#  # ', '#   #'],
  'S': [' ### ', '#    ', ' ### ', '    #', ' ### '],
  'T': ['#####', '  #  ', '  #  ', '  #  ', '  #  '],
  'U': ['#   #', '#   #', '#   #', '#   #', ' ### '],
  'V': ['#   #', '#   #', '#   #', ' # # ', '  #  '],
  'W': ['#   #', '#   #', '# # #', '# # #', '# # #'],
  'X': ['#   #', ' # # ', '  #  ', ' # # ', '#   #'],
  'Y': ['#   #', ' # # ', '  #  ', '  #  ', '  #  '],
  'Z': ['#####', '   # ', '  #  ', ' #   ', '#####'],
  '0': [' ### ', '#   #', '#   #', '#   #', ' ### '],
  '1': ['  #  ', ' ##  ', '  #  ', '  #  ', ' ### '],
  '2': [' ### ', '    #', ' ### ', '#    ', ' ### '],
  '3': [' ### ', '    #', ' ### ', '    #', ' ### '],
  '4': ['#   #', '#   #', '#####', '    #', '    #'],
  '5': ['#####', '#    ', ' ### ', '    #', ' ### '],
  '6': [' ### ', '#    ', ' ### ', '#   #', ' ### '],
  '7': ['#####', '    #', '   # ', '  #  ', ' #   '],
  '8': [' ### ', '#   #', ' ### ', '#   #', ' ### '],
  '9': [' ### ', '#   #', ' ### ', '    #', ' ### '],
  '!': ['  #  ', '  #  ', '  #  ', '     ', '  #  '],
  '?': [' ### ', '#   #', '    #', '  #  ', '  #  '],
  '.': ['     ', '     ', '     ', '     ', '##   '],
  ',': ['     ', '     ', '     ', '##   ', ' #   '],
  '-': ['     ', '     ', ' ### ', '     ', '     '],
  ':': ['     ', '  #  ', '     ', '  #  ', '     '],
  ';': ['     ', '  #  ', '     ', '  #  ', ' #   '],
  "'": [' #   ', '     ', '     ', '     ', '     '],
  '"': [' # # ', '     ', '     ', '     ', '     '],
};

module.exports = {
  name: 'ascii',
  aliases: ['asciiart', 'figlet'],
  category: 'utility',
  description: 'Generate ASCII art from text',
  usage: '.ascii <text>\nExample: .ascii Hello World',
  async execute(sock, msg, args, extra) {
    try {
      const chatId = extra.from;
      const text = args.join(' ').trim();

      if (!text) {
        return extra.reply(
          '📝 *ASCII Art Generator*\n\n' +
          'Usage: `.ascii <text>`\n' +
          'Example: `.ascii Hello World`\n' +
          'Max 20 characters recommended.'
        );
      }

      if (text.length > 30) {
        return extra.reply('❌ Text too long. Max 30 characters for ASCII art.');
      }

      const lines = ['', '', '', '', ''];
      for (const char of text) {
        const upper = char.toUpperCase();
        const pattern = SIMPLE_FONT[upper] || SIMPLE_FONT['?'];
        for (let i = 0; i < 5; i += 1) {
          lines[i] += pattern[i] + ' ';
        }
      }

      const art = lines.join('\n');

      await extra.reply(
        `📝 *ASCII Art*\n\n\`\`\`\n${art}\n\`\`\``
      );
    } catch (error) {
      console.error('[ascii] error:', error);
      await extra.reply(`❌ ASCII generation failed: ${error.message}`);
    }
  }
};
