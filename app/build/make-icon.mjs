// Generates the macOS app icon (build/icon.icns) from scratch — no image
// editor, no dependencies. Draws the same sparkle the menu bar uses, from the
// same geometry module, so the Dock/Finder icon and the tray glyph are the
// same mark at two sizes.
//
// Run: node build/make-icon.mjs   (needs macOS `iconutil`, which ships with the OS)
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { inSparkle } = require('../src/glyph.js');
const { encodePNG } = require('../src/png.js');

const BUILD_DIR = dirname(fileURLToPath(import.meta.url));

const BG = [0x22, 0x22, 0x26];    // near-black squircle
// macOS systemGreen in light appearance — the same "plenty of quota left"
// color the tray shows, but pinned: this file runs in plain node during the
// build, with no Electron around to ask the OS.
const MARK = [0x34, 0xc7, 0x59];
const SS = 4;                     // supersampling factor, for antialiased edges

// Superellipse (|x/a|^n + |y/a|^n <= 1) with n=5 is a close stand-in for
// Apple's squircle and is trivial to evaluate per pixel.
function inSquircle(nx, ny, n = 5) {
  return Math.pow(Math.abs(nx), n) + Math.pow(Math.abs(ny), n) <= 1;
}

function renderRGBA(size) {
  const S = size * SS;
  const px = Buffer.alloc(S * S * 4); // transparent
  const body = 0.402 * 2;  // icon body spans ~80% of the canvas, per Apple's grid
  const mark = 0.46;       // sparkle's half-width as a fraction of the canvas

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const nx = ((x + 0.5) / S) * 2 - 1;
      const ny = ((y + 0.5) / S) * 2 - 1;
      if (!inSquircle(nx / body, ny / body)) continue;

      const rgb = inSparkle(nx / mark, ny / mark) ? MARK : BG;
      const i = (y * S + x) * 4;
      px[i] = rgb[0];
      px[i + 1] = rgb[1];
      px[i + 2] = rgb[2];
      px[i + 3] = 255;
    }
  }
  return downsample(px, S, size);
}

// Box-filter the supersampled buffer back to `size`, averaging colors weighted
// by alpha so the transparent surround does not fringe the squircle's edge.
function downsample(src, S, size) {
  const out = Buffer.alloc(size * size * 4);
  const n = SS * SS;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, aSum = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const i = (((y * SS + sy) * S) + (x * SS + sx)) * 4;
          const a = src[i + 3] / 255;
          r += src[i] * a;
          g += src[i + 1] * a;
          b += src[i + 2] * a;
          aSum += a;
        }
      }
      const o = (y * size + x) * 4;
      if (aSum > 0) {
        out[o] = Math.round(r / aSum);
        out[o + 1] = Math.round(g / aSum);
        out[o + 2] = Math.round(b / aSum);
      }
      out[o + 3] = Math.round((aSum / n) * 255);
    }
  }
  return out;
}

const iconset = join(BUILD_DIR, 'icon.iconset');
rmSync(iconset, { recursive: true, force: true });
mkdirSync(iconset, { recursive: true });

const cache = new Map();
const pngFor = (size) => {
  if (!cache.has(size)) cache.set(size, encodePNG(renderRGBA(size), size, size));
  return cache.get(size);
};

for (const base of [16, 32, 128, 256, 512]) {
  writeFileSync(join(iconset, `icon_${base}x${base}.png`), pngFor(base));
  writeFileSync(join(iconset, `icon_${base}x${base}@2x.png`), pngFor(base * 2));
}

execFileSync('iconutil', ['-c', 'icns', iconset, '-o', join(BUILD_DIR, 'icon.icns')]);
rmSync(iconset, { recursive: true, force: true });
console.log('wrote build/icon.icns');
