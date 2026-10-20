/** PWA용 PNG 아이콘 생성 (외부 의존성 없음 — 단색+막대 패턴) */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'public', 'icons');
fs.mkdirSync(dir, { recursive: true });

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : c >>> 1;
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeB = Buffer.from(type);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeB, data])));
  return Buffer.concat([len, typeB, data, crc]);
}

function png(size) {
  const brand = [0x01, 0x76, 0xd3];
  const white = [0xff, 0xff, 0xff];
  const light = [0xea, 0xf5, 0xfe];
  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 3);
    row[0] = 0;
    for (let x = 0; x < size; x++) {
      const nx = x / size;
      const ny = y / size;
      let c = brand;
      // bars
      if (nx > 0.19 && nx < 0.34 && ny > 0.62 && ny < 0.84) c = white;
      if (nx > 0.42 && nx < 0.58 && ny > 0.47 && ny < 0.84) c = white;
      if (nx > 0.66 && nx < 0.81 && ny > 0.31 && ny < 0.84) c = white;
      if (nx > 0.16 && nx < 0.84 && ny > 0.84 && ny < 0.9) c = light;
      const i = 1 + x * 3;
      row[i] = c[0];
      row[i + 1] = c[1];
      row[i + 2] = c[2];
    }
    rows.push(row);
  }
  const raw = Buffer.concat(rows);
  const compressed = zlib.deflateSync(raw, { level: 9 });
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const size of [192, 512]) {
  const file = path.join(dir, `icon-${size}.png`);
  fs.writeFileSync(file, png(size));
  console.log('wrote', file);
}
