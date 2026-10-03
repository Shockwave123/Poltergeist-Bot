const path = require('node:path');
const cheerio = require('cheerio');

const MAX_DOCUMENT_BYTES = 12 * 1024 * 1024;
const MAX_DOCUMENT_CHARACTERS = 24000;
const TEXT_EXTENSIONS = new Set([
  '.txt', '.md', '.markdown', '.csv', '.json', '.xml', '.html', '.htm', '.js', '.cjs', '.mjs',
  '.ts', '.jsx', '.tsx', '.css', '.scss', '.py', '.java', '.c', '.h', '.cpp', '.hpp', '.cs',
  '.go', '.rs', '.php', '.rb', '.sh', '.bash', '.yml', '.yaml', '.toml', '.sql', '.log', '.ini'
]);

function cleanText(value) {
  return String(value || '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').replace(/\0/g, '').trim();
}

async function extractDocumentText(buffer, { filename = 'document', mimeType = '' } = {}) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw new Error('The document is empty.');
  if (buffer.length > MAX_DOCUMENT_BYTES) throw new Error('Documents must be 12 MB or smaller.');

  const extension = path.extname(filename).toLowerCase();
  const type = String(mimeType).toLowerCase();
  let text;

  if (type === 'application/pdf' || extension === '.pdf') {
    let pdf;
    try {
      pdf = require('pdf-parse');
    } catch (error) {
      throw new Error('PDF reading is unavailable until the service finishes installing its PDF reader.');
    }
    const result = await pdf(buffer, { max: 30 });
    text = result.text;
  } else if (type.startsWith('text/') || TEXT_EXTENSIONS.has(extension) || /json|xml/.test(type)) {
    text = buffer.toString('utf8');
    if (type.includes('html') || ['.html', '.htm'].includes(extension)) {
      text = cheerio.load(text).text();
    }
  } else {
    throw new Error('Supported files are PDF, TXT, Markdown, and common source-code or text files.');
  }

  text = cleanText(text);
  if (!text) throw new Error('No readable text was found in that file. Scanned PDFs need OCR first.');
  return {
    text: text.slice(0, MAX_DOCUMENT_CHARACTERS),
    truncated: text.length > MAX_DOCUMENT_CHARACTERS
  };
}

module.exports = { extractDocumentText, MAX_DOCUMENT_BYTES, MAX_DOCUMENT_CHARACTERS };