const assert = require('node:assert/strict');
const { containsBadWord, normalizeBadWord } = require('../utils/badwords');
const database = require('../database');
const antibadwordCommand = require('../commands/admin/antibadword');

assert.equal(containsBadWord('THIS IS FUCK BAD'), true);
assert.equal(containsBadWord('The new custom phrase is forbidden.', ['Custom Phrase']), true);
assert.equal(containsBadWord('A CUSTOM-PHRASE should be blocked.', ['custom phrase']), true);
assert.equal(containsBadWord('The word scunthorpe is allowed.', [' cunt ']), false);
assert.equal(containsBadWord('a'), false);
assert.equal(containsBadWord('This is a normal sentence.'), false);
assert.equal(containsBadWord('a', ['a']), false);
assert.equal(containsBadWord('a phrase', ['a phrase']), true);
assert.equal(normalizeBadWord('  Custom-PHRASE!  '), 'custom phrase');

async function testCustomStickerConfiguration() {
  const originalGetGroupSettings = database.getGroupSettings;
  const originalUpdateGroupSettings = database.updateGroupSettings;
  let settings = {};
  database.getGroupSettings = () => settings;
  database.updateGroupSettings = (_groupId, updates) => {
    settings = { ...settings, ...updates };
    return true;
  };
  try {
    const repliedSticker = { stickerMessage: { mimetype: 'image/webp' } };
    const msg = {
      message: {
        extendedTextMessage: {
          contextInfo: {
            stanzaId: 'sticker-message-id',
            quotedMessage: repliedSticker
          }
        }
      }
    };
    const replies = [];
    const extra = { from: 'test-group@g.us', reply: async (text) => replies.push(text) };
    await antibadwordCommand.configureSticker(
      { updateMediaMessage: async () => {} },
      msg,
      ['sticker'],
      extra,
      async () => Buffer.from('custom-webp')
    );
    assert.equal(Buffer.from(settings.antibadwordSticker, 'base64').toString(), 'custom-webp');
    assert.ok(replies.at(-1).includes('saved for this group'));

    await antibadwordCommand.configureSticker({}, msg, ['sticker', 'reset'], extra);
    assert.equal(settings.antibadwordSticker, null);
  } finally {
    database.getGroupSettings = originalGetGroupSettings;
    database.updateGroupSettings = originalUpdateGroupSettings;
  }
}

testCustomStickerConfiguration()
  .then(() => console.log('Antibadword matching and custom sticker tests passed.'))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
