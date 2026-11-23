/**
 * Verify the command registry the bot actually uses.
 * Legacy modules intentionally skipped by commandLoader are not active commands
 * and should not be required directly by this check.
 */
const { loadCommands } = require('../utils/commandLoader');

const errors = [];
const commands = loadCommands(true);
const cachedCommands = loadCommands();
const uniqueCommands = new Set(commands.values());

for (const [name, command] of commands) {
  if (typeof command.name !== 'string') {
    errors.push(`MISSING name: ${name}`);
  }
  if (typeof command.execute !== 'function') {
    errors.push(`MISSING execute: ${name}`);
  }
  if (name !== command.name && !command.aliases?.includes(name)) {
    errors.push(`INVALID alias: ${name} is not declared by ${command.name}`);
  }
}

const expected = [
  'rephrase', 'email', 'tweet', 'sentiment', 'bio', 'studyplan',
  'lock', 'revoke', 'tagadmins', 'anime', 'translate',
  'neko', 'nekosfw', 'waifu', 'konachan', 'hneko', 'hwaifu',
  'lewd', 'loli', 'megumin', 'milf', 'random'
];
const missing = expected.filter((name) => !commands.has(name));
if (uniqueCommands.size <= 200) {
  errors.push(`Expected over 200 registered commands; found ${uniqueCommands.size}.`);
}
if (commands !== cachedCommands) {
  errors.push('Command loader cache did not return the same registry.');
}

console.log(`Registered commands: ${uniqueCommands.size}`);
console.log(`Registered names/aliases: ${commands.size}`);
console.log(`Missing expected: ${missing.length ? missing.join(', ') : 'none'}`);
console.log(`Verification errors: ${errors.length}`);
errors.forEach((error) => console.error(`  ✗ ${error}`));

if (errors.length || missing.length) {
  console.log('\n❌ VERIFY FAIL');
  process.exitCode = 1;
} else {
  console.log('\n✅ VERIFY PASS');
}
