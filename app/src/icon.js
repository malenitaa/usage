const { nativeImage } = require('electron');
const palette = require('./palette');

// Original pixel-art "spark" glyph (not Anthropic's logo/mascot — a simple
// 4-point sparkle drawn from scratch) so the tray icon reads as "Claude
// related" without reproducing any trademarked asset. Solid-filled with the
// semaphore color for the worst of five_hour/seven_day — the icon signals
// *alert level* via color, the exact percentages live in the popover bars.
const SHAPE = [
  '.........',
  '....#....',
  '....#....',
  '...###...',
  '.#######.',
  '...###...',
  '....#....',
  '....#....',
  '.........'
];

// Small filled dot, used instead of SHAPE when the tray title text is
// already carrying the percentages (mode 'numbers') so the icon doesn't
// compete with the text for attention.
const DOT_SHAPE = [
  '.........',
  '.........',
  '...###...',
  '..#####..',
  '..#####..',
  '..#####..',
  '...###...',
  '.........',
  '.........'
];

function shapeAt(shape, x, y) {
  if (x < 0 || y < 0 || y >= shape.length || x >= shape[0].length) return false;
  return shape[y][x] === '#';
}

function renderBuffer(pxSize, pctWorst, available, shape) {
  const GRID_H = shape.length;
  const GRID_W = shape[0].length;
  const isOn = (x, y) => shapeAt(shape, x, y);
  const isOutline = (x, y) => !isOn(x, y) && (isOn(x - 1, y) || isOn(x + 1, y) || isOn(x, y - 1) || isOn(x, y + 1));

  const w = GRID_W * pxSize;
  const h = GRID_H * pxSize;
  const buf = Buffer.alloc(w * h * 4); // starts fully transparent (all zero)

  const fillColor = palette.colorForPct(available ? pctWorst : null);

  for (let gy = 0; gy < GRID_H; gy++) {
    for (let gx = 0; gx < GRID_W; gx++) {
      let rgba = null;
      if (isOn(gx, gy)) rgba = [...fillColor.rgb, 255];
      else if (isOutline(gx, gy)) rgba = [...palette.outline.rgb, 200];

      if (!rgba) continue; // leave transparent

      const [r, g, b, a] = rgba;
      for (let py = 0; py < pxSize; py++) {
        for (let px = 0; px < pxSize; px++) {
          const x = gx * pxSize + px;
          const y = gy * pxSize + py;
          const i = (y * w + x) * 4;
          // Electron's raw createFromBuffer format is BGRA, not RGBA
          // (verified empirically by round-tripping a known pure-red PNG).
          buf[i] = b;
          buf[i + 1] = g;
          buf[i + 2] = r;
          buf[i + 3] = a;
        }
      }
    }
  }
  return { buffer: buf, width: w, height: h };
}

// pctWorst: 0-100 (worst of five_hour/seven_day), or null when unavailable.
// useGlyph: false swaps the sparkle for a plain dot (mode 'numbers', where
// the tray title text already carries the percentages).
function buildTrayIcon(pctWorst, available, useGlyph = true) {
  const shape = useGlyph ? SHAPE : DOT_SHAPE;
  const at1x = renderBuffer(2, pctWorst ?? 0, available, shape);
  const at2x = renderBuffer(4, pctWorst ?? 0, available, shape);

  const img = nativeImage.createFromBuffer(at1x.buffer, { width: at1x.width, height: at1x.height });
  img.addRepresentation({
    scaleFactor: 2,
    width: at1x.width,
    height: at1x.height,
    buffer: at2x.buffer
  });
  img.setTemplateImage(false); // we want the pastel colors, not a monochrome template
  return img;
}

module.exports = { buildTrayIcon };
