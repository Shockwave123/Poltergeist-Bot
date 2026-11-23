const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const webDirectory = path.join(__dirname, '..', 'web');
const html = fs.readFileSync(path.join(webDirectory, 'admin.html'), 'utf8');
const css = fs.readFileSync(path.join(webDirectory, 'admin.css'), 'utf8');
const javascript = fs.readFileSync(path.join(webDirectory, 'admin.js'), 'utf8');

assert.match(html, /href="\/assets\/admin\.css"/);
assert.match(html, /src="\/assets\/admin\.js"/);
assert.match(html, /src="\/assets\/bot_image\.jpg"/);
for (const id of [
  'login-form',
  'dashboard',
  'connection-banner',
  'qr-image',
  'pair-form',
  'pair-code-card',
  'memory-fill',
  'logout-button'
]) {
  assert.ok(html.includes(`id="${id}"`), `Admin page is missing ${id}.`);
}

assert.match(css, /--cyan:\s*#4df4e0/i);
assert.match(css, /--violet:\s*#bd68ff/i);
assert.match(css, /prefers-reduced-motion/);
for (const endpoint of ['/api/session', '/api/login', '/api/status', '/api/pair', '/api/refresh', '/api/logout']) {
  assert.ok(javascript.includes(endpoint), `Admin page does not use ${endpoint}.`);
}

console.log('Admin page asset and API wiring tests passed.');
