// Geometry of the app's mark, shared by the menu bar icon (icon.js) and the
// macOS app icon (build/make-icon.mjs) so the two can never drift apart.
//
// The mark is an original 4-point sparkle — not Anthropic's logo or mascot —
// drawn as a concave superellipse: |x|^k + |y|^k = 1 with k < 1 pinches the
// sides inward, which is exactly the classic sparkle silhouette. Sampling it
// as a formula (rather than a fixed grid of blocks) is what lets it render
// smooth at any size.
//
// There is deliberately no outline: the fill comes from macOS's own system
// colors, which Apple already tunes to stay legible against both the light
// and the dark menu bar.
const SPARKLE_K = 0.62; // lower = thinner, spikier points; 0.62 survives 18px
const DOT_RADIUS = 0.42;

// nx, ny are normalized to [-1, 1] over the glyph's box. True = inside.
function inSparkle(nx, ny) {
  return Math.pow(Math.abs(nx), SPARKLE_K) + Math.pow(Math.abs(ny), SPARKLE_K) <= 1;
}

function inDot(nx, ny) {
  return Math.sqrt(nx * nx + ny * ny) <= DOT_RADIUS;
}

module.exports = { inSparkle, inDot, SPARKLE_K };
