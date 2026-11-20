const assert = require('node:assert/strict');
const viewOnce = require('../commands/general/viewonce');

const image = {
  imageMessage: {
    viewOnce: true,
    mediaKey: Buffer.from('media-key'),
    directPath: '/media/path'
  }
};

assert.ok(viewOnce.aliases.includes('wow'));
assert.deepEqual(
  viewOnce.getViewOnceMedia({
    ephemeralMessage: {
      message: {
        viewOnceMessageV2Extension: {
          message: image
        }
      }
    }
  }),
  { messageType: 'imageMessage', message: image }
);
assert.deepEqual(
  viewOnce.getViewOnceMedia({
    videoMessage: { viewOnce: true, mediaKey: Buffer.from('video-key') }
  }),
  {
    messageType: 'videoMessage',
    message: {
      videoMessage: { viewOnce: true, mediaKey: Buffer.from('video-key') }
    }
  }
);
assert.equal(viewOnce.getViewOnceMedia({ imageMessage: { viewOnce: false } }), null);

console.log('View-once message parsing and alias tests passed.');
