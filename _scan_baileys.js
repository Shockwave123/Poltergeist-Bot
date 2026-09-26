const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, 'node_modules', '@whiskeysockets', 'baileys', 'lib');
const patterns = [
  'CB:notification',
  'advSecretKey',
  'companion_reg_refresh',
  'buildPairingQRData',
  'processNotification',
  'link_code_companion_reg',
  'webSubPlatform',
  'handleNotification'
];

const hits = {};
for (const p of patterns) hits[p] = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { walk(full); continue; }
    if (!entry.name.endsWith('.js')) continue;
    let text;
    try { text = fs.readFileSync(full, 'utf8'); } catch { continue; }
    const lines = text.split(/\r?\n/);
    lines.forEach((line, i) => {
      for (const p of patterns) {
        if (line.includes(p) && hits[p].length < 12) {
          hits[p].push(`${path.relative(root, full)}:${i + 1}: ${line.trim().slice(0, 220)}`);
        }
      }
    });
  }
}

walk(root);
for (const p of patterns) {
  console.log(`\n=== ${p} (${hits[p].length} shown) ===`);
  hits[p].forEach((h) => console.log(h));
}
