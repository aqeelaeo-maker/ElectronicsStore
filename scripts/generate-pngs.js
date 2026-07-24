import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, '../public');

// Helper to create a valid PNG buffer of size width x height with background color and icon shape
function createPngBuffer(width, height, rBg = 15, gBg = 23, bBg = 42) {
  // CRC32 table
  const crcTable = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      if (c & 1) c = 0xedb88320 ^ (c >>> 1);
      else c = c >>> 1;
    }
    crcTable[n] = c;
  }

  function crc32(buf) {
    let crc = -1;
    for (let i = 0; i < buf.length; i++) {
      crc = (crc >>> 8) ^ crcTable[(crc ^ buf[i]) & 0xff];
    }
    return (crc ^ -1) >>> 0;
  }

  function writeChunk(type, data) {
    const len = data.length;
    const buf = Buffer.alloc(8 + len + 4);
    buf.writeUInt32BE(len, 0);
    buf.write(type, 4, 4, 'ascii');
    data.copy(buf, 8);
    const crcVal = crc32(buf.subarray(4, 8 + len));
    buf.writeUInt32BE(crcVal, 8 + len);
    return buf;
  }

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const ihdrChunk = writeChunk('IHDR', ihdr);

  // Raw image data
  const rawData = Buffer.alloc(height * (1 + width * 4));
  let offset = 0;

  const cx = width / 2;
  const cy = height / 2;
  const outerR = width * 0.45;
  const innerR = width * 0.32;

  for (let y = 0; y < height; y++) {
    rawData[offset++] = 0; // Filter type 0 (None)
    for (let x = 0; x < width; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      let r = rBg, g = gBg, b = bBg, a = 255;

      // Draw rounded container or inner design
      if (dist < outerR) {
        // Gradient background fill
        const factor = y / height;
        r = Math.floor(30 + factor * 20);
        g = Math.floor(58 + factor * 40);
        b = Math.floor(138 + factor * 80);

        if (dist < innerR) {
          // Inner icon circle / accent
          r = 59;
          g = 130;
          b = 246;

          // Inner checkmark or POS box simulation
          if (Math.abs(dx) < innerR * 0.5 && Math.abs(dy) < innerR * 0.5) {
            r = 255;
            g = 255;
            b = 255;
          }
        }
      }

      rawData[offset++] = r;
      rawData[offset++] = g;
      rawData[offset++] = b;
      rawData[offset++] = a;
    }
  }

  const compressedData = zlib.deflateSync(rawData);
  const idatChunk = writeChunk('IDAT', compressedData);
  const iendChunk = writeChunk('IEND', Buffer.alloc(0));

  const pngHeader = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([pngHeader, ihdrChunk, idatChunk, iendChunk]);
}

const p192 = createPngBuffer(192, 192);
const p512 = createPngBuffer(512, 512);

fs.writeFileSync(path.join(publicDir, 'icon-192.png'), p192);
fs.writeFileSync(path.join(publicDir, 'icon-512.png'), p512);
fs.writeFileSync(path.join(publicDir, 'icon-maskable-192.png'), p192);
fs.writeFileSync(path.join(publicDir, 'icon-maskable-512.png'), p512);
fs.writeFileSync(path.join(publicDir, 'apple-touch-icon.png'), p192);

console.log('PNG icons created successfully');
