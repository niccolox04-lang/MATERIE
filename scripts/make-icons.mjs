/**
 * Genera le icone PNG della PWA (192 e 512) senza alcuna dipendenza:
 * stesso motivo grafico dell'SVG (nodi collegati su sfondo blu arrotondato),
 * rasterizzato a mano e scritto come PNG RGBA via node:zlib.
 *
 * Uso: node scripts/make-icons.mjs   (oppure npm run icons)
 * @module scripts/make-icons
 */
import { deflateSync } from "node:zlib";
import { writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "public");

// CRC32 (tabella, ISO 3309) — necessario per i chunk PNG.
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function writePng(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  // scanline: filtro 0 + riga di pixel
  const stride = width * 4 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0;
    rgba.copy(raw, y * stride + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// Motivo (coordinati in unità SVG 64×64): catena di nodi come nell'icona vettoriale.
const NODES = [[16, 44], [28, 30], [40, 36], [50, 20]];
const EDGES = [[0, 1], [1, 2], [2, 3]];
const LINE_W = 3;
const NODE_R = 5;
const BG = [29, 78, 216]; // #1d4ed8

function distToSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
  const cx = ax + t * dx, cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

function renderIcon(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const s = size / 64;
  const corner = 14 * s * 0.5 + size * 0.04; // raggio arrotondamento
  const half = (size - 1) / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      // angoli arrotondati → trasparenti
      const dx = Math.max(corner - x, x - (size - 1 - corner), 0);
      const dy = Math.max(corner - y, y - (size - 1 - corner), 0);
      if (dx * dx + dy * dy > corner * corner) continue; // alpha resta 0
      rgba[i] = BG[0];
      rgba[i + 1] = BG[1];
      rgba[i + 2] = BG[2];
      rgba[i + 3] = 255;
      const ux = x / s, uy = y / s; // coordinate "SVG"
      // bordo antialias minimale: se il punto è vicino al bordo di un elemento bianco, alpha parziale
      let white = 0;
      for (const [a, b] of EDGES) {
        const d = distToSeg(ux, uy, NODES[a][0], NODES[a][1], NODES[b][0], NODES[b][1]);
        white = Math.max(white, Math.min(1, (LINE_W / 2 + 0.7 - d) / 0.7));
      }
      for (const [nx, ny] of NODES) {
        const d = Math.hypot(ux - nx, uy - ny);
        white = Math.max(white, Math.min(1, (NODE_R + 0.7 - d) / 0.7));
      }
      if (white > 0) {
        rgba[i] = Math.round(255 * white + BG[0] * (1 - white));
        rgba[i + 1] = Math.round(255 * white + BG[1] * (1 - white));
        rgba[i + 2] = Math.round(255 * white + BG[2] * (1 - white));
      }
      void half;
    }
  }
  return writePng(size, size, rgba);
}

for (const size of [192, 512]) {
  const file = join(OUT_DIR, `icon-${size}.png`);
  await writeFile(file, renderIcon(size));
  console.log(`scritto ${file}`);
}
