/**
 * Anime Command - Random anime images by category
 */

const fs = require('fs');
const path = require('path');
const { getTempDir, deleteTempFile } = require('../../utils/tempManager');
const { getAnimeImage } = require('../../utils/animeApi');

const CATEGORIES = {
  neko: 'neko', waifu: 'waifu', konachan: 'konachan',
  hneko: 'hneko', hwaifu: 'hwaifu', lewd: 'lewd',
  loli: 'loli', megumin: 'megumin', milf: 'milf'
};

const CATEGORY_LABELS = {
  neko: 'Neko', waifu: 'Waifu', konachan: 'Konachan',
  hneko: 'H-neko (lewd)', hwaifu: 'H-waifu (lewd)', lewd: 'Lewd',
  loli: 'Loli', megumin: 'Megumin', milf: 'Milf'
};

// Legacy per-category commands (.neko, .waifu, .konachan, ...) were merged
// into this command. When invoked through one of these keys, the matching
// category is used even without an argument, so `.neko` still instantly
// sends a neko image exactly like before.
const INVOKED_CATEGORY = {
  neko: 'neko', nekosfw: 'neko',
  waifu: 'waifu', waifusfw: 'waifu',
  konachan: 'konachan', konachansfw: 'konachan',
  hneko: 'hneko', hnekonsfw: 'hneko',
  hwaifu: 'hwaifu', hwaifunsfw: 'hwaifu',
  lewd: 'lewd', lewdanime: 'lewd',
  loli: 'loli', lolinsfw: 'loli',
  megumin: 'megumin', meguminnsfw: 'megumin',
  milf: 'milf', milfnsfw: 'milf'
};

module.exports = {
  name: 'anime',
  aliases: ['animg', 'animimage', ...Object.keys(INVOKED_CATEGORY)],
  category: 'anime',
  description: 'Get random anime images by category',
  usage: '.anime <category> (neko, waifu, konachan, hneko, hwaifu, lewd, loli, megumin, milf)\nLegacy aliases still work: .neko, .waifu, .konachan ...',
  async execute(sock, msg, args, extra) {
    try {
      let category = (args[0] || '').toLowerCase();
      if (!CATEGORIES[category]) {
        const invoked = (extra.commandName || '').toLowerCase();
        category = INVOKED_CATEGORY[invoked] || category;
      }
      if (!category) {
        const list = Object.entries(CATEGORY_LABELS)
          .map(([k, v]) => '• ' + k + ': ' + v)
          .join('\n');
        return extra.reply(
          '🎌 *Anime Images*\n\n' +
          'Usage: .anime <category>\n\n' +
          list + '\n\n' +
          'Example: .anime neko'
        );
      }
      const sourceCategory = CATEGORIES[category] || 'waifu';
      await extra.react('🎌');
      const { imageUrl, imageResponse, imageBuffer } =
        await getAnimeImage(sourceCategory);
      if (!imageBuffer || imageBuffer.length === 0) {
        throw new Error('Empty image response');
      }
      const maxImageSize = 12 * 1024 * 1024;
      if (imageBuffer.length > maxImageSize) {
        throw new Error(
          'Image too large: ' +
          (imageBuffer.length / 1024 / 1024).toFixed(2) + 'MB'
        );
      }
      const contentType = imageResponse.headers['content-type'] || '';
      let extension = 'jpg';
      if (contentType.includes('png')) extension = 'png';
      else if (contentType.includes('jpeg')) extension = 'jpg';
      else if (imageUrl.match(/\.(png|jpg|jpeg)$/i)) {
        const match = imageUrl.match(/\.(png|jpg|jpeg)$/i);
        extension = match[1].toLowerCase();
      }
      const tempDir = getTempDir();
      const timestamp = Date.now();
      const tempImagePath = path.join(tempDir, 'anime_' + timestamp + '.' + extension);
      try {
        fs.writeFileSync(tempImagePath, imageBuffer);
        const finalBuffer = fs.readFileSync(tempImagePath);
        await sock.sendMessage(extra.from, {
          image: finalBuffer
        }, { quoted: msg });
      } finally {
        try { deleteTempFile(tempImagePath); } catch {}
      }
      await extra.react('✅');
    } catch (error) {
      console.error('[anime] error:', error);
      try { await extra.react('❌'); } catch {}
      if (error.response?.status === 404) {
        await extra.reply('❌ Image not found. Please try again.');
      } else if (error.response?.status === 429) {
        await extra.reply('❌ Rate limit exceeded. Please try again later.');
      } else {
        await extra.reply('❌ Failed to fetch anime image: ' + error.message);
      }
    }
  }
};
