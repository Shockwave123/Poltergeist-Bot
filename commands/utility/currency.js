/**
 * Currency Command - Convert between currencies using open.er-api.com
 * Usage: .currency <amount> <from> <to>
 * Example: .currency 100 USD EUR
 */

const axios = require('axios');

module.exports = {
  name: 'currency',
  aliases: ['curr', 'money'],
  category: 'utility',
  description: 'Convert between currency pairs using live exchange rates',
  usage: '.currency <amount> <from> <to>  |  .currency (list common rates)',
  async execute(sock, msg, args, extra) {
    try {
      const chatId = extra.from;

      if (args.length === 0) {
        // Show common rates relative to USD
        const response = await axios.get('https://open.er-api.com/v6/latest/USD', {
          timeout: 15000
        });
        const rates = response.data.rates || {};
        const common = ['EUR', 'GBP', 'JPY', 'INR', 'CAD', 'AUD', 'CNY', 'SAR', 'AED', 'PKR'];
        const lines = ['💱 *Common Exchange Rates (vs 1 USD)*', ''];
        for (const code of common) {
          if (rates[code]) lines.push(`• 1 USD = ${rates[code].toFixed(4)} ${code}`);
        }
        lines.push('', 'Usage: `.currency 100 USD EUR`');
        return await sock.sendMessage(chatId, { text: lines.join('\n') }, { quoted: msg });
      }

      if (args.length < 3) {
        return await sock.sendMessage(chatId, {
          text: '❌ Usage: `.currency <amount> <from> <to>`\nExample: `.currency 100 USD EUR`'
        }, { quoted: msg });
      }

      const amount = parseFloat(args[0]);
      const from = args[1].toUpperCase();
      const to = args[2].toUpperCase();

      if (!amount || amount <= 0) {
        return await sock.sendMessage(chatId, { text: '❌ Invalid amount.', }, { quoted: msg });
      }

      const response = await axios.get(`https://open.er-api.com/v6/latest/${from}`, {
        timeout: 15000
      });

      if (response.data.result !== 'success') {
        throw new Error('Failed to fetch exchange rates.');
      }

      const rates = response.data.rates || {};
      const rate = rates[to];

      if (!rate) {
        return await sock.sendMessage(chatId, {
          text: `❌ Currency "${to}" not found.`
        }, { quoted: msg });
      }

      const converted = (amount * rate).toFixed(4);

      await sock.sendMessage(chatId, {
        text: `💱 *Currency Conversion*\n\n${amount} ${from} = ${converted} ${to}\n\nRate: 1 ${from} = ${rate} ${to}`
      }, { quoted: msg });

    } catch (error) {
      console.error('[currency] error:', error);
      await sock.sendMessage(msg.key.remoteJid, {
        text: '❌ Currency conversion failed. Try again later.\n\nUsage: `.currency 100 USD EUR`'
      }, { quoted: msg });
    }
  }
};
