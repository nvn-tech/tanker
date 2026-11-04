// Shared helpers and physics constants. Everything hangs off the global TK object
// so the game runs from plain <script> tags (works from file:// and any static host).
window.TK = window.TK || {};

TK.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
TK.lerp = (a, b, t) => a + (b - a) * t;
TK.rand = (a, b) => a + Math.random() * (b - a);
TK.randi = (a, b) => Math.floor(TK.rand(a, b + 1));
TK.pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
TK.dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
TK.deg = (r) => (r * 180) / Math.PI;
TK.rad = (d) => (d * Math.PI) / 180;

// Small seeded RNG so a map seed always produces the same islands.
TK.mulberry32 = (seed) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// Physics. The world runs at a fixed step so the bots can simulate shots exactly.
TK.DT = 1 / 120;
TK.G = 520; // gravity, px/s²
TK.WIND_ACC = 15; // px/s² per wind point
TK.POWER_K = 11; // launch speed per power point
TK.WORLD_W = 2400;
TK.WORLD_H = 1200;

// Character hitbox: circle around the body centre.
TK.BODY_OFFSET = 22;
TK.BODY_R = 17;

TK.roundRect = (ctx, x, y, w, h, r) => {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
};

// Text with a thick outline, the classic cartoon-game look.
TK.outlineText = (ctx, text, x, y, fill, stroke = '#2a1a10', width = 4) => {
  ctx.lineJoin = 'round';
  ctx.lineWidth = width;
  ctx.strokeStyle = stroke;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
};

TK.FONT = '"Fredoka", "Baloo 2", "Trebuchet MS", sans-serif';
