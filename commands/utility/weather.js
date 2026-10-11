/**
 * Weather Command - Get weather information using OpenWeather API
 */

const axios = require('axios');

module.exports = {
  name: 'weather',
  aliases: ['w', 'clima'],
  category: 'utility',
  description: 'Get weather for a city',
  usage: '.weather <city>',
  
  async execute(sock, msg, args) {
    try {
      if (args.length === 0) {
        return await sock.sendMessage(msg.key.remoteJid, { 
          text: '❌ Usage: .weather <city>\n\nExample: .weather London' 
        }, { quoted: msg });
      }
      
      const city = args.join(' ');
      const apiKey = process.env.OPENWEATHER_API_KEY;
      if (!apiKey) {
        return sock.sendMessage(msg.key.remoteJid, {
          text: 'Weather is not configured yet. Add `OPENWEATHER_API_KEY` in the Render environment settings.'
        }, { quoted: msg });
      }
      
      const response = await axios.get('https://api.openweathermap.org/data/2.5/weather', {
        params: { q: city, appid: apiKey, units: 'metric' },
        timeout: 12000
      });
      const weather = response.data;
      
      const weatherText = `Weather in ${weather.name}: ${weather.weather[0].description}. Temperature: ${weather.main.temp}°C.`;
      
      await sock.sendMessage(msg.key.remoteJid, { text: weatherText }, { quoted: msg });
      
    } catch (error) {
      console.error('Error fetching weather:', error);
      await sock.sendMessage(msg.key.remoteJid, { text: 'Sorry, I could not fetch the weather right now.' }, { quoted: msg });
    }
  }
};
