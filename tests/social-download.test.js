const assert = require('node:assert/strict');
const fs = require('node:fs');
const mediaResolver = require('../utils/mediaResolver');
const ytDlp = require('yt-dlp-exec');

async function run() {
  const originalGet = mediaResolver.HTTP.get;
  const originalExec = ytDlp.exec;

  try {
    assert.equal(mediaResolver.detectPlatform('https://www.facebook.com/watch/?v=12345'), 'facebook');
    assert.equal(mediaResolver.detectPlatform('https://www.facebook.com/photo/?fbid=12345'), 'facebook');
    assert.equal(mediaResolver.detectPlatform('https://www.instagram.com/share/p/ABC123/'), 'instagram');
    assert.equal(mediaResolver.detectPlatform('https://example.com/?next=instagram.com/p/ABC123/'), null);

    const facebookUrl = 'https://www.facebook.com/watch/?v=12345&mibextid=share';
    const facebookRequests = [];
    mediaResolver.HTTP.get = async (url) => {
      facebookRequests.push(url);
      if (url === facebookUrl) return { data: '<html></html>' };
      if (String(url).includes('/plugins/video.php')) {
        return { data: 'https://video.xx.fbcdn.net/v/t42.1790-2/12345.mp4?token=abc' };
      }
      if (String(url).startsWith('https://video.xx.fbcdn.net/')) {
        return { status: 206, headers: { 'content-type': 'video/mp4' } };
      }
      throw new Error(`Unexpected request: ${url}`);
    };
    const facebookVideo = await mediaResolver.facebookDownload(facebookUrl);
    assert.equal(facebookVideo.videoUrl, 'https://video.xx.fbcdn.net/v/t42.1790-2/12345.mp4?token=abc');
    assert.ok(facebookRequests.some((url) => String(url).includes(encodeURIComponent(facebookUrl))));

    mediaResolver.HTTP.get = async (url) => {
      if (url === 'https://www.facebook.com/photo/?fbid=12345') {
        return { data: '<meta property="og:image" content="https://scontent.xx.fbcdn.net/photo.jpg">' };
      }
      if (String(url).includes('/plugins/video.php')) return { data: '<html></html>' };
      throw new Error(`Unexpected request: ${url}`);
    };
    const facebookImage = await mediaResolver.facebookDownload('https://www.facebook.com/photo/?fbid=12345');
    assert.equal(facebookImage.imageUrl, 'https://scontent.xx.fbcdn.net/photo.jpg');

    mediaResolver.HTTP.get = async (url) => {
      if (String(url).includes('/oembed/')) return { status: 404, data: {} };
      if (url === 'https://www.instagram.com/p/ABC123/') {
        return { data: '<meta property="og:image" content="https://scontent.cdninstagram.com/photo.jpg">' };
      }
      if (String(url).includes('/embed/captioned/')) return { data: '' };
      throw new Error(`Unexpected request: ${url}`);
    };
    const instagramImage = await mediaResolver.instagramDownload('https://www.instagram.com/p/ABC123/');
    assert.equal(instagramImage.imageUrl, 'https://scontent.cdninstagram.com/photo.jpg');

    ytDlp.exec = async (url, flags) => {
      assert.equal(url, 'https://www.instagram.com/p/ABC123/');
      assert.equal(flags['no-playlist'], true);
      fs.writeFileSync(flags.output.replace('%(ext)s', 'jpg'), Buffer.from('mock-image'));
      return { stdout: '' };
    };
    const downloaded = await mediaResolver.ytDlpSocialDownload('https://www.instagram.com/p/ABC123/');
    assert.equal(downloaded.mimeType, 'image/jpeg');
    assert.deepEqual(downloaded.buffer, Buffer.from('mock-image'));
    await assert.rejects(
      mediaResolver.ytDlpSocialDownload('https://example.com/file.mp4'),
      /Only public Instagram or Facebook links/
    );
  } finally {
    mediaResolver.HTTP.get = originalGet;
    ytDlp.exec = originalExec;
  }

  console.log('Social download tests passed.');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
