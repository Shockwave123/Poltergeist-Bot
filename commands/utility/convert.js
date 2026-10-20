/**
 * Convert Command - Convert units (length, weight, temperature)
 * Usage: .convert <value> <from> <to>
 * Examples: .convert 100 cm m | .convert 100 C F | .convert 1 kg lb
 */

const LENGTH = {
  m: 1, km: 1000, cm: 0.01, mm: 0.001,
  inch: 0.0254, ft: 0.3048, yd: 0.9144, mile: 1609.34
};

const WEIGHT = {
  kg: 1, g: 0.001, mg: 1e-6,
  lb: 0.453592, oz: 0.0283495, stone: 6.35029
};

function toBase(value, unit, table) {
  const multiplier = table[unit.toLowerCase()];
  if (!multiplier) throw new Error(`Unknown unit: ${unit}`);
  return value * multiplier;
}

function fromBase(base, unit, table) {
  const multiplier = table[unit.toLowerCase()];
  if (!multiplier) throw new Error(`Unknown unit: ${unit}`);
  return base / multiplier;
}

function convertTemp(value, from, to) {
  const f = from.toLowerCase();
  const t = to.toLowerCase();
  let c;
  if (f === 'c') c = value;
  else if (f === 'f') c = (value - 32) * 5 / 9;
  else if (f === 'k') c = value - 273.15;
  else throw new Error(`Unknown temperature unit: ${from}`);

  if (t === 'c') return c;
  if (t === 'f') return c * 9 / 5 + 32;
  if (t === 'k') return c + 273.15;
  throw new Error(`Unknown temperature unit: ${to}`);
}

module.exports = {
  name: 'convert',
  aliases: ['conversion', 'units'],
  category: 'utility',
  description: 'Convert units: length, weight, temperature',
  usage: '.convert <value> <from> <to>\nExamples: .convert 100 cm m | .convert 100 C F | .convert 1 kg lb',
  async execute(sock, msg, args, extra) {
    try {
      const chatId = extra.from;

      if (args.length < 3) {
        return await sock.sendMessage(chatId, {
          text: '❌ Usage: `.convert <value> <from> <to>`\n' +
            'Examples:\n• `.convert 100 cm m` (length)\n• `.convert 100 C F` (temperature)\n• `.convert 1 kg lb` (weight)'
        }, { quoted: msg });
      }

      const value = parseFloat(args[0]);
      const from = args[1];
      const to = args[2];

      if (!value && value !== 0) {
        return await sock.sendMessage(chatId, { text: '❌ Invalid value.' }, { quoted: msg });
      }

      const tempUnits = ['c', 'f', 'k'];
      let result, unitLabel;

      if (tempUnits.includes(from.toLowerCase()) && tempUnits.includes(to.toLowerCase())) {
        result = convertTemp(value, from, to);
        unitLabel = `${from.toUpperCase()} → ${to.toUpperCase()}`;
      } else if (LENGTH[from.toLowerCase()] && LENGTH[to.toLowerCase()]) {
        const base = toBase(value, from, LENGTH);
        result = fromBase(base, to, LENGTH);
        unitLabel = `${from} → ${to}`;
      } else if (WEIGHT[from.toLowerCase()] && WEIGHT[to.toLowerCase()]) {
        const base = toBase(value, from, WEIGHT);
        result = fromBase(base, to, WEIGHT);
        unitLabel = `${from} → ${to}`;
      } else {
        return await sock.sendMessage(chatId, {
          text: '❌ Unsupported unit combination.\n' +
            'Length: m, km, cm, mm, inch, ft, yd, mile\n' +
            'Weight: kg, g, mg, lb, oz, stone\n' +
            'Temperature: C, F, K'
        }, { quoted: msg });
      }

      await sock.sendMessage(chatId, {
        text: `📏 *Conversion*\n\n${value} ${unitLabel}\n= ${result.toFixed(4)} ${to}`
      }, { quoted: msg });

    } catch (error) {
      console.error('[convert] error:', error);
      await sock.sendMessage(msg.key.remoteJid, {
        text: '❌ Conversion failed: ' + (error.message || 'Unknown error')
      }, { quoted: msg });
    }
  }
};
