const { nativeImage } = require('electron');
const palette = require('./palette');
const { inSparkle, inDot } = require('./glyph');
const { encodePNG } = require('./png');

// Menu bar icon. The glyph is solid-filled with the semaphore color for the
// worst of five_hour/seven_day — the icon signals *alert level* via color, the
// exact percentages live in the popover bars. The colors come from macOS
// itself (see palette.js), so the icon matches the rest of the system.
//
// The shape is sampled from a formula (see glyph.js) and supersampled here, so
// it renders as a smooth mark at any size.
const SIZE = 18;    // points; matches the ~18pt macOS menu bar icon slot
const SS = 4;       // supersampling factor for antialiasing
const INSET = 0.82; // shrink the mark inside its box so it does not crowd the
                    // neighbouring menu bar items

function renderRGBA(size, pctWorst, available, inside) {
  const S = size * SS;
  const px = Buffer.alloc(S * S * 4); // starts fully transparent
  const [r, g, b] = palette.colorForPct(available ? pctWorst : null).rgb;

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      // Normalize to [-1, 1], sampling at pixel centers.
      const nx = (((x + 0.5) / S) * 2 - 1) / INSET;
      const ny = (((y + 0.5) / S) * 2 - 1) / INSET;
      if (!inside(nx, ny)) continue;

      const i = (y * S + x) * 4;
      px[i] = r;
      px[i + 1] = g;
      px[i + 2] = b;
      px[i + 3] = 255;
    }
  }
  return downsample(px, S, size);
}

// Box-filter back down to `size`. Colors are averaged weighted by alpha so the
// transparent surround never bleeds toward black along the antialiased edge.
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

function dataURL(rgba, size) {
  return `data:image/png;base64,${encodePNG(rgba, size, size).toString('base64')}`;
}

// pctWorst: 0-100 (worst of five_hour/seven_day), or null when unavailable.
// useGlyph: false swaps the sparkle for a plain dot (tray display modes where
// the title text already carries the percentages).
function buildTrayIcon(pctWorst, available, useGlyph = true) {
  const inside = useGlyph ? inSparkle : inDot;
  const pct = pctWorst ?? 0;

  const img = nativeImage.createFromDataURL(dataURL(renderRGBA(SIZE, pct, available, inside), SIZE));
  img.addRepresentation({
    scaleFactor: 2,
    dataURL: dataURL(renderRGBA(SIZE * 2, pct, available, inside), SIZE * 2)
  });
  // Not a template image: the whole point is to show the semaphore color,
  // which macOS would flatten to monochrome if this were templated.
  img.setTemplateImage(false);
  return img;
}

module.exports = { buildTrayIcon };
