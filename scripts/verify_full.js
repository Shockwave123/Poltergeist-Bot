/**
 * Full command-load verification:
 * - requires every file under commands/
 * - reports load errors / missing name / missing execute
 * - detects name & alias collisions across different files
 * - verifies expected commands exist
 * - verifies commandLoader cache returns the same registry
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const claims = new Map(); // key -> [relative file paths]
const errors = [];
let moduleCount = 0;

function addClaim(key, rel) {
  if (!claims.has(key)) claims.set(key, []);
  claims.get(key).push(rel);
}

function walk(dir) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    const st = fs.statSync(p);
    if (st.isDirectory()) {
      walk(p);
    } else if (f.endsWith('.js')) {
      const rel = path.relative(root, p);
      try {
        const cmd = require(p);
        moduleCount += 1;
        if (!cmd || typeof cmd !== 'object') {
          errors.push(`NOT AN OBJECT: ${rel}`);
          continue;
        }
        if (!cmd.name) errors.push(`MISSING name: ${rel}`);
        if (typeof cmd.execute !== 'function') errors.push(`MISSING execute: ${rel}`);
        if (cmd.name) addClaim(cmd.name, rel);
        for (const alias of cmd.aliases || []) addClaim(alias, rel);
      } catch (e) {
        errors.push(`LOAD FAIL: ${rel} -> ${e.message}`);
      }
    }
  }
}

walk(path.join(root, 'commands'));

// Collisions: same key claimed by different files
const collisions = [...claims.entries()]
  .filter(([, files]) => new Set(files).size > 1)
  .map(([key, files]) => `${key} <= ${[...new Set(files)].join(' , ')}`);

// Expected new + fixed commands must exist and resolve
const expected = [
  'rephrase', 'email', 'tweet', 'sentiment', 'bio', 'studyplan',
  'lock', 'unlock', 'revoke', 'tagadmins',
  'anime', 'translate',
  // merged-away legacy anime commands must still resolve through aliases
  'neko', 'nekosfw', 'waifu', 'konachan', 'hneko', 'hwaifu', 'lewd',
  'loli', 'megumin', 'milf', 'random',
];
const missing = expected.filter((n) => !claims.has(n));

// commandLoader cache check
const { loadCommands } = require(path.join(root, 'utils', 'commandLoader'));
const a = loadCommands();
const b = loadCommands();
const cacheOk = a === b && a.size > 0;

console.log('='.repeat(60));
console.log(`Modules loaded:   ${moduleCount}`);
console.log(`Unique keys:      ${claims.size}`);
console.log(`Loader size:      ${a.size}  | cache same ref: ${cacheOk ? 'YES' : 'NO'}`);
console.log(`Load errors:      ${errors.length}`);
errors.forEach((e) => console.log('  ✗ ' + e));
console.log(`Missing expected: ${missing.length ? missing.join(', ') : 'none'}`);
console.log(`Collisions:       ${collisions.length}`);
collisions.forEach((c) => console.log('  ⚠ ' + c));

const ok = errors.length === 0 && missing.length === 0 && cacheOk;
console.log(ok ? '\n✅ VERIFY PASS' : '\n❌ VERIFY FAIL');
process.exit(ok ? 0 : 1);
