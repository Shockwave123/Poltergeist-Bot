/**
 * BMI Command - Body Mass Index calculator
 * Usage: .bmi <weight_kg> <height_cm>
 * Example: .bmi 70 175
 */

module.exports = {
  name: 'bmi',
  aliases: ['bodymass'],
  category: 'utility',
  description: 'Calculate Body Mass Index (BMI)',
  usage: '.bmi <weight_kg> <height_cm>\nExample: .bmi 70 175',
  async execute(sock, msg, args, extra) {
    try {
      const chatId = extra.from;

      if (args.length < 2) {
        return extra.reply(
          '⚖️ *BMI Calculator*\n\n' +
          'Usage: `.bmi <weight_kg> <height_cm>`\n' +
          'Example: `.bmi 70 175`\n\n' +
          'Categories:\n• Under 18.5: Underweight\n• 18.5–24.9: Normal\n• 25–29.9: Overweight\n• 30+: Obese'
        );
      }

      const weight = parseFloat(args[0]);
      const heightCm = parseFloat(args[1]);

      if (!weight || weight <= 0 || !heightCm || heightCm <= 0) {
        return extra.reply('❌ Please provide valid positive numbers for weight and height.');
      }

      const heightM = heightCm / 100;
      const bmi = weight / (heightM * heightM);
      const bmiRounded = bmi.toFixed(1);

      let category;
      if (bmi < 18.5) category = 'Underweight';
      else if (bmi < 25) category = 'Normal weight';
      else if (bmi < 30) category = 'Overweight';
      else category = 'Obese';

      await extra.reply(
        `⚖️ *BMI Result*\n\n` +
        `Weight: ${weight} kg\n` +
        `Height: ${heightCm} cm\n` +
        `BMI: *${bmiRounded}*\n` +
        `Category: *${category}*`
      );
    } catch (error) {
      console.error('[bmi] error:', error);
      await extra.reply(`❌ BMI calculation failed: ${error.message}`);
    }
  }
};
