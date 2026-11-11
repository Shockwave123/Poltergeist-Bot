const assert = require('node:assert/strict');
const { containsBadWord, normalizeBadWord } = require('../utils/badwords');

assert.equal(containsBadWord('THIS IS FUCK BAD'), true);
assert.equal(containsBadWord('The new custom phrase is forbidden.', ['Custom Phrase']), true);
assert.equal(containsBadWord('A CUSTOM-PHRASE should be blocked.', ['custom phrase']), true);
assert.equal(containsBadWord('The word scunthorpe is allowed.', [' cunt ']), false);
assert.equal(containsBadWord('a'), false);
assert.equal(containsBadWord('This is a normal sentence.'), false);
assert.equal(containsBadWord('a', ['a']), false);
assert.equal(containsBadWord('a phrase', ['a phrase']), true);
assert.equal(normalizeBadWord('  Custom-PHRASE!  '), 'custom phrase');

console.log('Antibadword matching tests passed.');
