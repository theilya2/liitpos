/**
 * Rasterize the Liitpos mark (public/favicon.svg) into the icon and splash
 * sources Capacitor's asset generator expects.
 *
 * The mark is a handful of rectangles, so this writes PNGs with Node's zlib
 * and does not need a browser or an image library.
 */
import { deflateSync, crc32 } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const GREEN = [0x0e, 0x6b, 0x56];
const CREAM = [0xf3, 0xee, 0xe6];

/** Rectangles from public/favicon.svg, in a 32×32 viewBox. */
const MARK = [
  [6, 6, 4, 20],
  [6, 6, 12, 4],
  [14, 6, 4, 8],
  [22, 6, 4, 20],
  [14, 22, 12, 4],
  [14, 18, 4, 8],
];

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = join(root, "mobile", "assets");

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const name = Buffer.from(type);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([name, data])) >>> 0);
  return Buffer.concat([length, name, data, crc]);
}

function encodePng(width, height, pixels, channels = 3) {
  const stride = width * channels;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const dest = y * (stride + 1);
    raw[dest] = 0;
    pixels.copy(raw, dest + 1, y * stride, y * stride + stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = channels === 4 ? 6 : 2;
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function paintForeground(size, markScale) {
  const rgba = Buffer.alloc(size * size * 4);
  const unit = (size * markScale) / 32;
  const origin = (size - 32 * unit) / 2;
  for (const [x, y, w, h] of MARK) {
    const x0 = Math.max(0, Math.round(origin + x * unit));
    const y0 = Math.max(0, Math.round(origin + y * unit));
    const x1 = Math.min(size, Math.round(origin + (x + w) * unit));
    const y1 = Math.min(size, Math.round(origin + (y + h) * unit));
    for (let py = y0; py < y1; py++) {
      for (let px = x0; px < x1; px++) {
        const offset = (py * size + px) * 4;
        rgba[offset] = CREAM[0];
        rgba[offset + 1] = CREAM[1];
        rgba[offset + 2] = CREAM[2];
        rgba[offset + 3] = 255;
      }
    }
  }
  return rgba;
}

function paint(size, markScale) {
  const rgb = Buffer.alloc(size * size * 3);
  const row = Buffer.alloc(size * 3);
  for (let x = 0; x < size; x++) {
    row[x * 3] = GREEN[0];
    row[x * 3 + 1] = GREEN[1];
    row[x * 3 + 2] = GREEN[2];
  }
  for (let y = 0; y < size; y++) row.copy(rgb, y * size * 3);

  const unit = (size * markScale) / 32;
  const origin = (size - 32 * unit) / 2;
  for (const [x, y, w, h] of MARK) {
    const x0 = Math.max(0, Math.round(origin + x * unit));
    const y0 = Math.max(0, Math.round(origin + y * unit));
    const x1 = Math.min(size, Math.round(origin + (x + w) * unit));
    const y1 = Math.min(size, Math.round(origin + (y + h) * unit));
    for (let py = y0; py < y1; py++) {
      for (let px = x0; px < x1; px++) {
        const offset = (py * size + px) * 3;
        rgb[offset] = CREAM[0];
        rgb[offset + 1] = CREAM[1];
        rgb[offset + 2] = CREAM[2];
      }
    }
  }
  return rgb;
}

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "icon-only.png"), encodePng(1024, 1024, paint(1024, 0.72)));
writeFileSync(join(outDir, "icon-background.png"), encodePng(1024, 1024, paint(1024, 0)));
writeFileSync(
  join(outDir, "icon-foreground.png"),
  encodePng(1024, 1024, paintForeground(1024, 1), 4),
);
writeFileSync(join(outDir, "splash.png"), encodePng(2732, 2732, paint(2732, 0.22)));
console.log(
  "[mobile-icons] wrote icon-only.png, icon-foreground.png, icon-background.png, and splash.png",
);
