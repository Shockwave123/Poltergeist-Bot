const assert = require('node:assert/strict');

const originalSetInterval = global.setInterval;
global.setInterval = (...args) => {
  const timer = originalSetInterval(...args);
  timer.unref?.();
  return timer;
};

const { loadCommands } = require('../utils/commandLoader');
const commands = loadCommands(true);
global.setInterval = originalSetInterval;

const uniqueCommands = new Set(commands.values());
assert.ok(uniqueCommands.size > 200, `Expected over 200 live commands; found ${uniqueCommands.size}.`);

for (const [name, command] of commands) {
  assert.equal(typeof command.name, 'string', `${name} is missing its command name.`);
  assert.equal(typeof command.execute, 'function', `${name} is missing an executable handler.`);
  assert.ok(
    name === command.name || command.aliases?.includes(name),
    `${name} is not the command name or a declared alias of ${command.name}.`
  );
}

console.log(`Command registry tests passed (${uniqueCommands.size} commands, ${commands.size} names/aliases).`);
