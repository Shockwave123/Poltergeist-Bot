/**
 * Lewd Command - Get a random lewd anime image
 */

const fs = require('fs');
const path = require('path');
const { getTempDir, deleteTempFile } = require('../../utils/tempManager');
const { getAnimeImage } = require('../../utils/animeApi');

module.exports = {
  name: 'lewd',
  aliases: ['lewdanime'],
  category: 'anime',
  desc: 'Get a random lewd anime image',
  usage: 'lewd',
  execute: async (sock, msg, args, extra) => {
    try {
      const { imageResponse, imageBuffer } = await getAnimeImage('lewd');
      const contentType = imageResponse.headers['content-type'] || '';
      const extension = contentType.includes('png') ? 'png' : 'jpg';
      const tempImagePath = path.join(getTempDir(), `lewd_${Date.now()}.${extension}`);

      try {
        fs.writeFileSync(tempImagePath, imageBuffer);
        const finalBuffer = fs.readFileSync(tempImagePath);
        await sock.sendMessage(extra.from, {
          image: finalBuffer,
          caption: '🔞 Lewd anime image',
        }, { quoted: msg });
      } finally {
        deleteTempFile(tempImagePath);
      }
    } catch (error) {
      console.error('Error in lewd command:', error);
      if (error.response?.status === 429) {
        await extra.reply('❌ Rate limit exceeded. Please try again later.');
      } else if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
        await extra.reply('❌ Request timed out. Please try again.');
      } else {
        await extra.reply(`❌ Failed to fetch lewd anime image: ${error.message}`);
      }
    }
  },
};
