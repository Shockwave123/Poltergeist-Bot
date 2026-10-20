/**
 * Color Command - Color information from hex code
 * Usage: .color <hex>
 * Example: .color #ff5733
 */

module.exports = {
  name: 'color',
  aliases: ['colour', 'hex'],
  category: 'utility',
  description: 'Get color information from a hex code',
  usage: '.color <hex>\nExample: .color #ff5733\nExample: .color ff5733',
  async execute(sock, msg, args, extra) {
    try {
      const chatId = extra.from;
      const hex = args.join(' ').replace('#', '').trim();

      if (!hex || !/^[0-9A-Fa-f]{3}([0-9A-Fa-f]{3})?$/.test(hex)) {
        return extra.reply(
          '🎨 *Color Info*\n\n' +
          'Usage: `.color <hex>`\n' +
          'Example: `.color #ff5733`\n' +
          'Example: `.color ff5733`'
        );
      }

      // Expand shorthand (e.g., f53 -> ff5533)
      const fullHex = hex.length === 3
        ? hex.split('').map((c) => c + c).join('')
        : hex;

      const r = parseInt(fullHex.substring(0, 2), 16);
      const g = parseInt(fullHex.substring(2, 4), 16);
      const b = parseInt(fullHex.substring(4, 6), 16);

      const hsl = rgbToHsl(r, g, b);
      const isLight = r * 0.299 + g * 0.587 + b * 0.114 > 186;
      const textColor = isLight ? '#000000' : '#ffffff';

      await extra.reply(
        `🎨 *Color: #${fullHex.toUpperCase()}*\n\n` +
        `RGB: rgb(${r}, ${g}, ${b})\n` +
        `HSL: hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)\n` +
        `Brightness: ${isLight ? 'Light' : 'Dark'}\n` +
        `Best text color: #${textColor}`
      );
    } catch (error) {
      console.error('[color] error:', error);
      await extra.reply(`❌ Color lookup failed: ${error.message}`);
    }
  }
};

function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0, s, l = (max + min) / 2;

  if (max === min) {
    h = s = 0;
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}
