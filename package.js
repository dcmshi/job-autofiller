// Packages the extension into a distributable zip for the Chrome Web Store.
// Usage: node package.js
// Output: job-autofiller.zip

const fs   = require('fs');
const path = require('path');
const zlib = require('zlib');

const INCLUDE = [
  'manifest.json',
  'background.js',
  'content.js',
  'core.js',
  'options.html',
  'options.js',
  'icons/icon16.png',
  'icons/icon32.png',
  'icons/icon48.png',
  'icons/icon128.png',
];

const OUTPUT = 'job-autofiller.zip';

// --- Minimal ZIP writer -------------------------------------------------------

function u16(n) { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b; }
function u32(n) { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; }

function crc32(buf) {
  const table = crc32.table || (crc32.table = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      t[i] = c;
    }
    return t;
  })());
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function buildZip(entries) {
  // entries: [{ name, data }]
  const localHeaders = [];
  const centralHeaders = [];
  let offset = 0;

  for (const { name, data } of entries) {
    const compressed = zlib.deflateRawSync(data, { level: 6 });
    const crc        = crc32(data);
    const nameBytes  = Buffer.from(name, 'utf8');

    // Local file header
    const local = Buffer.concat([
      Buffer.from([0x50, 0x4B, 0x03, 0x04]), // signature
      u16(20),           // version needed
      u16(0),            // flags
      u16(8),            // compression method: deflate
      u16(0), u16(0),    // mod time/date
      u32(crc),
      u32(compressed.length),
      u32(data.length),
      u16(nameBytes.length),
      u16(0),            // extra field length
      nameBytes,
      compressed,
    ]);

    localHeaders.push(local);

    // Central directory header
    centralHeaders.push(Buffer.concat([
      Buffer.from([0x50, 0x4B, 0x01, 0x02]), // signature
      u16(20), u16(20),  // version made by / needed
      u16(0),            // flags
      u16(8),            // deflate
      u16(0), u16(0),    // mod time/date
      u32(crc),
      u32(compressed.length),
      u32(data.length),
      u16(nameBytes.length),
      u16(0), u16(0),    // extra / comment length
      u16(0), u16(0),    // disk start / internal attrs
      u32(0),            // external attrs
      u32(offset),       // local header offset
      nameBytes,
    ]));

    offset += local.length;
  }

  const centralDir   = Buffer.concat(centralHeaders);
  const centralStart = offset;

  // End of central directory record
  const eocd = Buffer.concat([
    Buffer.from([0x50, 0x4B, 0x05, 0x06]),
    u16(0), u16(0),                  // disk numbers
    u16(entries.length),
    u16(entries.length),
    u32(centralDir.length),
    u32(centralStart),
    u16(0),                          // comment length
  ]);

  return Buffer.concat([...localHeaders, centralDir, eocd]);
}

// --- Build -------------------------------------------------------------------

const entries = INCLUDE.map(file => {
  console.log(`  + ${file}`);
  return { name: file, data: fs.readFileSync(path.resolve(file)) };
});

const zip = buildZip(entries);
fs.writeFileSync(OUTPUT, zip);
console.log(`\nCreated ${OUTPUT} (${INCLUDE.length} files, ${(zip.length / 1024).toFixed(1)} KB)`);
