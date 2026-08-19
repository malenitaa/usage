// Geometry of the app's mark, shared by the menu bar icon (icon.js) and the
// macOS app icon (build/make-icon.mjs) so the two can never drift apart.
//
// The mark is a ring gauge: an arc that starts at 12 o'clock and sweeps
// clockwise in proportion to how much quota is used, over a faint full-circle
// track. Chosen over pictorial marks for two reasons. It says MORE — the arc
// carries the level, the color carries the alert tier, where a solid glyph
// could only ever change color. And it is original: the previous 4-point
// concave sparkle read as Google Gemini's mark, and a Claude-style ray burst
// would be Anthropic's trademark; a gauge is the visual language macOS itself
// uses for levels (battery, Activity Monitor) and belongs to nobody.
//
// There is deliberately no outline: the fill comes from macOS's own system
// colors, which Apple already tunes to stay legible against both the light
// and the dark menu bar.
const RING_OUTER = 1.0;  // the box is already inset by the caller
const RING_INNER = 0.62; // thickness ~0.19 of the box: ~3px of an 18px slot
const DOT_RADIUS = 0.42;

// nx, ny are normalized to [-1, 1] over the glyph's box; frac is the swept
// fraction (0..1). Returns 'fill' on the swept arc, 'track' on the remainder
// of the ring, null outside the ring entirely.
function inRing(nx, ny, frac) {
  const r = Math.hypot(nx, ny);
  if (r < RING_INNER || r > RING_OUTER) return null;
  let th = Math.atan2(nx, -ny); // 0 at 12 o'clock, clockwise positive
  if (th < 0) th += 2 * Math.PI;
  return th <= frac * 2 * Math.PI ? 'fill' : 'track';
}

function inDot(nx, ny) {
  return Math.sqrt(nx * nx + ny * ny) <= DOT_RADIUS;
}

module.exports = { inRing, inDot };
