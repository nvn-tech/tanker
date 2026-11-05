// Expressive chibi hero renderer (concept). Feet at (0,0), facing +x.
// drawHero(g, id, pose, opts) where pose = 'idle' | 'aim' | 'hit' | 'win'
(function () {
  const D = (hex, k) => { // darken (k<0) / lighten (k>0) by fraction
    const n = parseInt(hex.slice(1), 16);
    let r = n >> 16, gg = (n >> 8) & 255, b = n & 255;
    const f = (c) => Math.round(k < 0 ? c * (1 + k) : c + (255 - c) * k);
    return '#' + ((1 << 24) | (f(r) << 16) | (f(gg) << 8) | f(b)).toString(16).slice(1);
  };

  // filled shape with cel shadow (light from upper right) and coloured line art
  // paper texture for papercraft mode
  let fiberPat = null;
  function fibers(g) {
    if (fiberPat) return fiberPat;
    const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
    let seed = 7; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 90; i++) { x.strokeStyle = r() < 0.5 ? 'rgba(255,255,255,0.28)' : 'rgba(60,40,20,0.10)'; x.lineWidth = 1; const a = r() * 6, px = r() * 64, py = r() * 64, l = 2 + r() * 6; x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l); x.stroke(); }
    fiberPat = g.createPattern(c, 'repeat');
    return fiberPat;
  }
  // Papercraft: every shape is a piece of coloured card. No ink lines; depth
  // comes from the shadow each layer casts on the one below, plus a pale cut edge.
  function paperPiece(g, path, fill, opt) {
    g.save();
    g.shadowColor = 'rgba(45,28,14,0.38)'; g.shadowOffsetX = -1.2; g.shadowOffsetY = 2.4; g.shadowBlur = 2.2;
    path(); g.fillStyle = fill; g.fill();
    g.restore();
    g.save(); path(); g.clip();
    g.fillStyle = fibers(g); g.fillRect(-300, -300, 600, 600);
    if (opt.shade !== false) { // gentle fold shade on the lower-left
      g.translate(3, -3); g.beginPath(); g.rect(-400, -400, 800, 800); path(); g.fillStyle = 'rgba(60,35,15,0.10)'; g.fill('evenodd');
    }
    g.restore();
    g.save(); path(); g.clip(); path(); g.lineWidth = 2.2; g.strokeStyle = 'rgba(255,255,255,0.35)'; g.translate(0.8, -0.8); path(); g.stroke(); g.restore();
  }
  function cel(g, path, fill, opt = {}) {
    if (window.HERO_STYLE === 'paper') return paperPiece(g, path, fill, opt);
    const lw = opt.lw == null ? 2.6 : opt.lw;
    g.save();
    path(); g.fillStyle = fill; g.fill();
    if (opt.shade !== false) {
      g.save(); path(); g.clip();
      g.translate(opt.sx == null ? 4 : opt.sx, opt.sy == null ? -4 : opt.sy);
      g.globalCompositeOperation = 'source-atop';
      g.beginPath(); g.rect(-400, -400, 800, 800); path(); g.fillStyle = opt.shadeColor || D(fill, -0.22);
      g.fill('evenodd');
      g.restore();
      if (opt.hi) { g.save(); path(); g.clip(); g.translate(-2.5, 2.5); g.beginPath(); g.rect(-400, -400, 800, 800); path(); g.fillStyle = 'rgba(255,255,255,0.28)'; g.fill('evenodd'); g.restore(); }
    }
    if (lw) { path(); g.lineWidth = lw; g.lineJoin = 'round'; g.strokeStyle = opt.line || D(fill, -0.6); g.stroke(); }
    g.restore();
  }
  const P = (g, fn) => () => { g.beginPath(); fn(); };
  function limb(g, ax, ay, bx, by, w, sleeve, skin, sleeveFrac = 0.6, handR = 5.6) {
    const mx = ax + (bx - ax) * sleeveFrac, my = ay + (by - ay) * sleeveFrac;
    const cap = (x1, y1, x2, y2, ww, col) => cel(g, P(g, () => {
      const a = Math.atan2(y2 - y1, x2 - x1), nx = Math.cos(a + Math.PI / 2) * ww / 2, ny = Math.sin(a + Math.PI / 2) * ww / 2;
      g.moveTo(x1 + nx, y1 + ny); g.lineTo(x2 + nx, y2 + ny); g.arc(x2, y2, ww / 2, a + Math.PI / 2, a - Math.PI / 2, true);
      g.lineTo(x1 - nx, y1 - ny); g.arc(x1, y1, ww / 2, a - Math.PI / 2, a + Math.PI / 2, true); g.closePath();
    }), col, { lw: 2.2 });
    cap(mx, my, bx, by, w * 0.82, skin);
    cap(ax, ay, mx, my, w, sleeve);
    if (handR) cel(g, P(g, () => g.arc(bx, by, handR, 0, 7)), skin, { lw: 2.2 });
  }

  const SKIN = { light: '#ffe2c8', tan: '#f2c39b', warm: '#e9b38a', deep: '#b97a55' };

  // -------- hero definitions --------
  const HEROES = {
    rookie: {
      skin: SKIN.light, eye: '#7a4a24', hair: '#7a4724', outfit: '#3f8fe0', accent: '#ff8a3c', pants: '#2e3f5c', shoes: '#c94b2f',
      weapon: 'bomb', idleFace: { eyes: 'open', brows: 'up', mouth: 'grin' },
      back(g, s) { // scarf tails flapping
        const w = Math.sin(s.t * 7) * 4;
        cel(g, P(g, () => { g.moveTo(-6, -50); g.quadraticCurveTo(-22, -52 + w, -34, -42 + w * 1.5); g.lineTo(-33, -34 + w * 1.5); g.quadraticCurveTo(-20, -42 + w, -4, -43); g.closePath(); }), this.accent);
      },
      torso(g) { // jacket zip + scarf wrap
        g.strokeStyle = D(this.outfit, -0.45); g.lineWidth = 2; g.beginPath(); g.moveTo(3, -46); g.lineTo(3, -22); g.stroke();
        cel(g, P(g, () => { g.ellipse(1, -49, 15, 6, 0, 0, 7); }), this.accent);
      },
      hairBack(g, h) { cel(g, P(g, () => g.arc(h.x - 3, h.y - 2, h.r + 2, 0, 7)), this.hair); },
      hairFront(g, h) { // spiky crown + fringe
        cel(g, P(g, () => {
          g.moveTo(h.x - h.r - 2, h.y);
          const spikes = [[-24, -22], [-14, -38], [-6, -24], [4, -40], [10, -24], [22, -34], [20, -16], [27, -6]];
          g.quadraticCurveTo(h.x - h.r, h.y - 20, h.x - 18, h.y - 26);
          for (const [dx, dy] of spikes) g.lineTo(h.x + dx, h.y + dy);
          g.quadraticCurveTo(h.x + 14, h.y - 8, h.x + 6, h.y - 12);
          g.lineTo(h.x + 2, h.y - 4); g.lineTo(h.x - 4, h.y - 13); g.lineTo(h.x - 10, h.y - 6); g.lineTo(h.x - 16, h.y - 14);
          g.quadraticCurveTo(h.x - 22, h.y - 4, h.x - h.r - 2, h.y);
          g.closePath();
        }), this.hair, { hi: true });
      },
      faceExtra(g, h) { // band-aid on cheek
        g.save(); g.translate(h.x - 9, h.y + 12); g.rotate(-0.4);
        cel(g, P(g, () => g.roundRect(-6, -2.5, 12, 5, 2)), '#f6d6a8', { lw: 1.4, shade: false }); g.restore();
      },
      quote: 'Never reads the manual. Fires first, asks later.',
    },
    knight: {
      skin: SKIN.light, eye: '#2f6fb8', hair: '#f2c14e', outfit: '#c9d3df', accent: '#2a63b8', pants: '#4a556b', shoes: '#6b4a2e',
      weapon: 'bomb', idleFace: { eyes: 'open', brows: 'stern', mouth: 'smirk' },
      back(g, s) { // red cape
        const w = Math.sin(s.t * 3) * 3;
        cel(g, P(g, () => { g.moveTo(-10, -50); g.quadraticCurveTo(-26 + w, -30, -22 + w, -6); g.lineTo(-4, -10); g.lineTo(6, -48); g.closePath(); }), '#c8383a');
      },
      torso(g) { // breastplate + tabard
        cel(g, P(g, () => g.roundRect(-11, -48, 24, 18, 7)), '#dfe6ee', { hi: true });
        cel(g, P(g, () => { g.moveTo(-3, -32); g.lineTo(9, -32); g.lineTo(8, -16); g.lineTo(3, -12); g.lineTo(-2, -16); g.closePath(); }), this.accent);
        cel(g, P(g, () => g.ellipse(11, -47, 8, 5.5, 0.2, 0, 7)), '#aebbc9');
      },
      hairBack(g, h, s) { // long braid swinging
        cel(g, P(g, () => g.arc(h.x - 2, h.y - 1, h.r + 1, 0, 7)), this.hair);
        const sw = Math.sin(s.t * 3) * 3;
        for (let i = 0; i < 4; i++) cel(g, P(g, () => g.ellipse(h.x - 20 - i * 3 + sw * i * 0.3, h.y + 12 + i * 9, 5.5, 6, 0.3, 0, 7)), this.hair);
        cel(g, P(g, () => g.arc(h.x - 31 + sw, h.y + 50, 3, 0, 7)), this.accent, { lw: 1.6 });
      },
      hairFront(g, h) { // side-swept fringe + silver circlet
        cel(g, P(g, () => {
          g.moveTo(h.x - h.r - 1, h.y + 4); g.quadraticCurveTo(h.x - h.r, h.y - h.r, h.x + 2, h.y - h.r - 2);
          g.quadraticCurveTo(h.x + h.r, h.y - h.r + 2, h.x + h.r + 1, h.y - 2);
          g.quadraticCurveTo(h.x + 12, h.y - 14, h.x - 4, h.y - 10); g.quadraticCurveTo(h.x - 14, h.y - 8, h.x - h.r - 1, h.y + 4); g.closePath();
        }), this.hair, { hi: true });
        g.strokeStyle = '#8a97a8'; g.lineWidth = 3; g.beginPath(); g.arc(h.x, h.y + 2, h.r - 1, Math.PI * 1.15, Math.PI * 1.85); g.stroke();
        cel(g, P(g, () => g.arc(h.x + 1, h.y - h.r + 3, 3.4, 0, 7)), '#4fc3f7', { lw: 1.5 });
      },
      quote: 'Takes every hit personally, and keeps standing.',
    },
    ninja: {
      skin: SKIN.tan, eye: '#2f9e6a', hair: '#23202b', outfit: '#2c3550', accent: '#e0443e', pants: '#232a40', shoes: '#1b1f2c',
      weapon: 'splitter', idleFace: { eyes: 'half', brows: 'smug', mouth: 'mask' },
      back(g, s) { // long scarf + headband tails
        const w = Math.sin(s.t * 8) * 5;
        cel(g, P(g, () => { g.moveTo(-4, -52); g.bezierCurveTo(-22, -56 + w, -36, -40 - w, -52, -46 + w); g.lineTo(-50, -38 + w); g.bezierCurveTo(-34, -32 - w, -22, -44 + w, -4, -44); g.closePath(); }), this.accent);
      },
      torso(g) { // wrap sash
        cel(g, P(g, () => { g.moveTo(-12, -46); g.lineTo(-6, -48); g.lineTo(14, -24); g.lineTo(8, -22); g.closePath(); }), D(this.outfit, 0.25));
        cel(g, P(g, () => g.roundRect(-13, -26, 28, 6, 2)), this.accent);
      },
      hairBack(g, h) { cel(g, P(g, () => g.arc(h.x - 2, h.y - 2, h.r + 1, 0, 7)), this.hair);
        cel(g, P(g, () => { g.moveTo(h.x - 8, h.y - h.r - 2); g.lineTo(h.x - 12, h.y - h.r - 16); g.lineTo(h.x - 2, h.y - h.r - 8); g.lineTo(h.x + 2, h.y - h.r - 18); g.lineTo(h.x + 6, h.y - h.r - 2); g.closePath(); }), this.hair); },
      hairFront(g, h, s) {
        cel(g, P(g, () => { g.moveTo(h.x - h.r - 1, h.y - 2); g.quadraticCurveTo(h.x - h.r, h.y - h.r - 2, h.x + 2, h.y - h.r - 2); g.quadraticCurveTo(h.x + h.r + 1, h.y - h.r, h.x + h.r + 1, h.y - 8); g.lineTo(h.x + 14, h.y - 10); g.lineTo(h.x + 10, h.y - 3); g.lineTo(h.x + 4, h.y - 10); g.lineTo(h.x - 4, h.y - 4); g.lineTo(h.x - 8, h.y - 11); g.lineTo(h.x - 16, h.y - 6); g.closePath(); }), this.hair, { hi: true });
        // headband with plate + tails
        cel(g, P(g, () => { g.moveTo(h.x - h.r, h.y - 8); g.quadraticCurveTo(h.x, h.y - 16, h.x + h.r, h.y - 10); g.lineTo(h.x + h.r, h.y - 4); g.quadraticCurveTo(h.x, h.y - 10, h.x - h.r, h.y - 2); g.closePath(); }), this.accent, { lw: 2 });
        cel(g, P(g, () => g.roundRect(h.x + 4, h.y - 13, 12, 7, 2)), '#b8c2cf', { lw: 1.6 });
        const w = Math.sin(s.t * 9) * 4;
        cel(g, P(g, () => { g.moveTo(h.x - h.r + 2, h.y - 6); g.quadraticCurveTo(h.x - h.r - 14, h.y - 8 + w, h.x - h.r - 22, h.y + 2 + w); g.lineTo(h.x - h.r - 18, h.y + 6 + w); g.quadraticCurveTo(h.x - h.r - 10, h.y - 2, h.x - h.r + 2, h.y - 2); g.closePath(); }), this.accent, { lw: 2 });
      },
      faceExtra(g, h, face) { // face mask over the mouth
        if (face.mouth === 'mask' || face.mask) cel(g, P(g, () => { g.moveTo(h.x - h.r + 3, h.y + 11); g.quadraticCurveTo(h.x + 6, h.y + 9, h.x + h.r - 1, h.y + 11); g.quadraticCurveTo(h.x + h.r - 4, h.y + h.r - 2, h.x + 4, h.y + h.r + 1); g.quadraticCurveTo(h.x - h.r + 6, h.y + h.r - 4, h.x - h.r + 3, h.y + 11); g.closePath(); }), this.accent, { lw: 2 });
      },
      quote: 'Gone before the smoke clears. Hates being seen trying.',
    },
    witch: {
      skin: SKIN.light, eye: '#d0499a', hair: '#9b7be8', outfit: '#4b2c7a', accent: '#ffd23f', pants: '#3a2160', shoes: '#2b1840',
      weapon: 'thunder', idleFace: { eyes: 'sleepy', brows: 'relaxed', mouth: 'cat' },
      back(g, s) { // flowing hair mass + floating star familiar
        const y = Math.sin(s.t * 2) * 4;
        g.save(); g.translate(-30, -96 + y); g.rotate(s.t);
        cel(g, P(g, () => { for (let i = 0; i < 10; i++) { const r = i % 2 ? 3.5 : 8, a = (i * Math.PI) / 5; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); }), this.accent, { lw: 1.8 });
        g.restore();
      },
      torso(g) { // dress with stars + collar
        cel(g, P(g, () => { g.moveTo(-14, -30); g.lineTo(15, -30); g.lineTo(19, -12); g.lineTo(-18, -12); g.closePath(); }), D(this.outfit, 0.1));
        g.fillStyle = this.accent; for (const [x, y] of [[-8, -20], [6, -24], [12, -16]]) { g.beginPath(); g.arc(x, y, 1.6, 0, 7); g.fill(); }
        cel(g, P(g, () => { g.moveTo(-8, -50); g.lineTo(2, -42); g.lineTo(12, -50); g.lineTo(10, -46); g.lineTo(2, -38); g.lineTo(-6, -46); g.closePath(); }), '#ffffff', { lw: 1.6 });
      },
      hairBack(g, h, s) {
        const w = Math.sin(s.t * 2.5) * 2;
        cel(g, P(g, () => { g.moveTo(h.x - h.r, h.y - 6); g.quadraticCurveTo(h.x - h.r - 12 + w, h.y + 26, h.x - h.r - 4 + w, h.y + 46); g.quadraticCurveTo(h.x - 8, h.y + 40, h.x - 2, h.y + 30); g.lineTo(h.x + h.r - 2, h.y + 8); g.arc(h.x, h.y, h.r + 1, 0.3, Math.PI * 1.3, true); g.closePath(); }), this.hair);
      },
      hairFront(g, h) {
        cel(g, P(g, () => { g.moveTo(h.x - h.r, h.y + 8); g.quadraticCurveTo(h.x - h.r - 2, h.y - h.r, h.x + 4, h.y - h.r + 2); g.quadraticCurveTo(h.x + h.r + 2, h.y - h.r + 6, h.x + h.r + 2, h.y + 10); g.quadraticCurveTo(h.x + 16, h.y - 6, h.x + 6, h.y - 8); g.quadraticCurveTo(h.x - 4, h.y - 2, h.x - 10, h.y - 10); g.quadraticCurveTo(h.x - 16, h.y + 2, h.x - h.r, h.y + 8); g.closePath(); }), this.hair, { hi: true });
        // floppy witch hat
        cel(g, P(g, () => g.ellipse(h.x + 2, h.y - h.r + 6, h.r + 16, 7, -0.08, 0, 7)), this.outfit);
        cel(g, P(g, () => { g.moveTo(h.x - 16, h.y - h.r + 4); g.quadraticCurveTo(h.x - 6, h.y - h.r - 40, h.x - 30, h.y - h.r - 44); g.quadraticCurveTo(h.x + 10, h.y - h.r - 40, h.x + 20, h.y - h.r + 2); g.closePath(); }), this.outfit);
        cel(g, P(g, () => g.roundRect(h.x - 16, h.y - h.r - 4, 36, 7, 2)), this.accent, { lw: 2 });
        cel(g, P(g, () => g.arc(h.x - 30, h.y - h.r - 44, 4, 0, 7)), this.accent, { lw: 1.6 });
      },
      quote: 'Half asleep, fully dangerous. Talks to her star.',
    },
    brute: {
      skin: SKIN.warm, eye: '#4a3020', hair: '#d9672b', outfit: '#8a5a34', accent: '#e8e2d4', pants: '#4b3a2c', shoes: '#3a2a1e', big: true,
      weapon: 'drill', idleFace: { eyes: 'small', brows: 'heavy', mouth: 'toothy' },
      back(g) {},
      torso(g) { // fur vest + belly + belt
        cel(g, P(g, () => g.ellipse(4, -28, 13, 12, 0, 0, 7)), this.skin);
        cel(g, P(g, () => { g.moveTo(-16, -52); g.lineTo(-4, -50); g.lineTo(-6, -22); g.lineTo(-18, -22); g.closePath(); }), '#c9a77a');
        cel(g, P(g, () => g.roundRect(-17, -20, 36, 7, 2)), '#4b2f1c');
        cel(g, P(g, () => g.roundRect(-1, -21, 9, 9, 2)), '#ffd23f', { lw: 1.8 });
      },
      hairBack(g) {},
      hairFront(g, h) { // horned helmet + big beard
        cel(g, P(g, () => { g.moveTo(h.x - h.r + 2, h.y + 4); g.quadraticCurveTo(h.x - 8, h.y + h.r + 26, h.x + h.r - 1, h.y + 8); g.lineTo(h.x + h.r - 4, h.y + 14); g.quadraticCurveTo(h.x + 10, h.y + 34, h.x - 6, h.y + 20); g.quadraticCurveTo(h.x - 14, h.y + 12, h.x - h.r + 2, h.y + 4); g.closePath(); }), this.hair, { hi: true });
        cel(g, P(g, () => { g.moveTo(h.x - 2, h.y + 12); g.quadraticCurveTo(h.x + 8, h.y + 6, h.x + 18, h.y + 12); g.quadraticCurveTo(h.x + 8, h.y + 14, h.x - 2, h.y + 12); g.closePath(); }), this.hair, { lw: 2 });
        for (const s of [-1, 1]) cel(g, P(g, () => { g.moveTo(h.x + s * 14, h.y - h.r + 6); g.quadraticCurveTo(h.x + s * 34, h.y - h.r - 2, h.x + s * 30, h.y - h.r - 22); g.quadraticCurveTo(h.x + s * 28, h.y - h.r - 4, h.x + s * 8, h.y - h.r + 12); g.closePath(); }), this.accent);
        cel(g, P(g, () => { g.arc(h.x, h.y - 2, h.r + 1, Math.PI * 1.04, Math.PI * 1.96); g.closePath(); }), '#9aa6b4', { hi: true });
        cel(g, P(g, () => g.roundRect(h.x - h.r, h.y - 6, h.r * 2, 6, 2)), '#7d8794', { lw: 2 });
      },
      quote: 'Hits like a landslide. Hugs like one too.',
    },
    tinker: {
      skin: SKIN.light, eye: '#d98a1c', hair: '#ff6fa8', outfit: '#ffc93d', accent: '#3fb7c9', pants: '#3a6fb8', shoes: '#5a3a2a',
      weapon: 'bouncer', idleFace: { eyes: 'wide', brows: 'up', mouth: 'open' },
      back(g, s) { // backpack with antenna + blinking bulb
        cel(g, P(g, () => g.roundRect(-26, -54, 16, 26, 4)), '#a5763f');
        g.strokeStyle = '#3a2a1e'; g.lineWidth = 2; g.beginPath(); g.moveTo(-20, -54); g.lineTo(-26, -72); g.stroke();
        cel(g, P(g, () => g.arc(-26, -74, 3.4, 0, 7)), Math.sin(s.t * 6) > 0 ? '#7bff6a' : '#2e7a2a', { lw: 1.4, shade: false });
      },
      torso(g) { // overalls bib + wrench
        cel(g, P(g, () => g.roundRect(-8, -46, 18, 16, 3)), this.pants);
        g.strokeStyle = D(this.pants, -0.5); g.lineWidth = 3; g.beginPath(); g.moveTo(-8, -46); g.lineTo(-11, -52); g.moveTo(10, -46); g.lineTo(12, -52); g.stroke();
        cel(g, P(g, () => g.arc(1, -40, 2.4, 0, 7)), '#ffd23f', { lw: 1.4 });
      },
      hairBack(g, h, s) { // twin tails bouncing
        const b = Math.sin(s.t * 6) * 3;
        cel(g, P(g, () => g.arc(h.x - 2, h.y - 2, h.r + 1, 0, 7)), this.hair);
        cel(g, P(g, () => { g.ellipse(h.x - h.r - 8, h.y + 8 + b, 9, 16, 0.4, 0, 7); }), this.hair);
        cel(g, P(g, () => { g.ellipse(h.x + h.r + 4, h.y + 6 - b, 8, 14, -0.4, 0, 7); }), this.hair);
      },
      hairFront(g, h) {
        cel(g, P(g, () => { g.moveTo(h.x - h.r - 1, h.y + 4); g.quadraticCurveTo(h.x - h.r, h.y - h.r, h.x, h.y - h.r - 1); g.quadraticCurveTo(h.x + h.r + 1, h.y - h.r, h.x + h.r + 1, h.y + 2); g.lineTo(h.x + 14, h.y - 10); g.lineTo(h.x + 8, h.y - 4); g.lineTo(h.x + 2, h.y - 12); g.lineTo(h.x - 6, h.y - 4); g.lineTo(h.x - 12, h.y - 10); g.closePath(); }), this.hair, { hi: true });
        // goggles on forehead
        g.strokeStyle = '#4a3020'; g.lineWidth = 4; g.beginPath(); g.arc(h.x, h.y + 4, h.r - 2, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
        for (const x of [-6, 9]) cel(g, P(g, () => g.arc(h.x + x, h.y - 15, 7, 0, 7)), '#9fe3ff', { lw: 2.4, hi: true });
      },
      faceExtra(g, h) { g.fillStyle = 'rgba(200,110,60,0.55)'; for (const [x, y] of [[-12, 8], [-9, 11], [-14, 12], [16, 9], [19, 12]]) { g.beginPath(); g.arc(h.x + x, h.y + y, 1.1, 0, 7); g.fill(); } },
      quote: 'Builds it first, reads the warning label later.',
    },
  };

  // -------- face --------
  function drawFace(g, hero, h, face) {
    if (window.HERO_STYLE === 'paper') { g.shadowColor = 'rgba(45,28,14,0.35)'; g.shadowOffsetY = 1.4; g.shadowBlur = 1; }
    const ex = [h.x + 1, h.x + 15]; const ey = h.y + 3;
    const iris = hero.eye;
    for (let i = 0; i < 2; i++) {
      const x = ex[i], far = i === 1, sx = far ? 0.85 : 1;
      g.save(); g.translate(x, ey); g.scale(sx, 1);
      switch (face.eyes) {
        case 'closed': // ^ ^
          g.strokeStyle = '#2a1a14'; g.lineWidth = 3; g.lineCap = 'round'; g.beginPath(); g.arc(0, 3, 5.5, Math.PI * 1.15, Math.PI * 1.85); g.stroke(); break;
        case 'hurt': // > <
          g.strokeStyle = '#2a1a14'; g.lineWidth = 3; g.lineCap = 'round'; g.beginPath();
          if (!far) { g.moveTo(-5, -5); g.lineTo(4, 0); g.lineTo(-5, 5); } else { g.moveTo(5, -5); g.lineTo(-4, 0); g.lineTo(5, 5); } g.stroke(); break;
        case 'wink':
          if (far) { g.strokeStyle = '#2a1a14'; g.lineWidth = 3; g.lineCap = 'round'; g.beginPath(); g.arc(0, -1, 5.5, Math.PI * 0.15, Math.PI * 0.85); g.stroke(); break; }
        // fallthrough
        default: {
          const ry = face.eyes === 'small' ? 4.2 : face.eyes === 'wide' ? 8.2 : face.eyes === 'focus' ? 5.2 : 7.2;
          const rx = face.eyes === 'small' ? 3.4 : face.eyes === 'wide' ? 6 : 5;
          if (face.eyes === 'wide' || face.eyes === 'shock') { g.fillStyle = '#fff'; g.beginPath(); g.ellipse(0, 0, rx + 1, ry + 1, 0, 0, 7); g.fill(); g.strokeStyle = '#2a1a14'; g.lineWidth = 1.6; g.stroke(); }
          const pr = face.eyes === 'shock' ? 0.45 : 1;
          const grd = g.createLinearGradient(0, -ry, 0, ry);
          grd.addColorStop(0, '#1d1210'); grd.addColorStop(0.55, iris); grd.addColorStop(1, D(iris, 0.45));
          g.fillStyle = grd; g.beginPath(); g.ellipse(face.eyes === 'wide' ? 1 : 0, 0, rx * pr, ry * pr, 0, 0, 7); g.fill();
          g.fillStyle = '#1d1210'; g.beginPath(); g.ellipse(0.5, 0.5, rx * 0.45 * pr, ry * 0.45 * pr, 0, 0, 7); g.fill();
          g.fillStyle = '#fff'; g.beginPath(); g.ellipse(1.8, -ry * 0.42, rx * 0.42, ry * 0.3, 0, 0, 7); g.fill();
          g.beginPath(); g.arc(-1.8, ry * 0.4, 1.1, 0, 7); g.fill();
          // lids
          if (face.eyes === 'half' || face.eyes === 'sleepy' || face.eyes === 'focus') {
            const cut = face.eyes === 'sleepy' ? 0.15 : face.eyes === 'focus' ? -0.25 : -0.05;
            g.fillStyle = hero.skin; g.beginPath(); g.rect(-rx - 2, -ry - 3, rx * 2 + 4, ry * (1 + cut) + 3); g.fill();
            g.strokeStyle = '#2a1a14'; g.lineWidth = 2.6; g.beginPath(); g.moveTo(-rx - 1, ry * cut); g.lineTo(rx + 1, ry * cut - (face.eyes === 'focus' ? 1.5 : 0)); g.stroke();
          } else if (face.eyes !== 'small') {
            g.strokeStyle = '#2a1a14'; g.lineWidth = 2.6; g.lineCap = 'round'; g.beginPath(); g.ellipse(0, 0, rx + 0.6, ry + 0.6, 0, Math.PI * 1.08, Math.PI * 1.92); g.stroke();
            if (!far) { g.beginPath(); g.moveTo(-rx - 0.5, -ry * 0.55); g.lineTo(-rx - 3, -ry * 0.75); g.stroke(); }
          }
        }
      }
      g.restore();
    }
    // brows
    const bl = { up: [-0.15, 0.15, -4], stern: [0.25, -0.25, 1], smug: [-0.05, -0.3, -1], relaxed: [-0.05, 0.05, -2], heavy: [0.35, -0.35, 3], worried: [-0.45, 0.45, -1], angry: [0.5, -0.5, 2] }[face.brows || 'up'];
    g.strokeStyle = face.browColor || D(hero.hair, -0.45); g.lineWidth = face.brows === 'heavy' ? 5 : 3; g.lineCap = 'round';
    for (let i = 0; i < 2; i++) {
      const x = ex[i], y = ey - 12 + bl[2] - (face.eyes === 'wide' ? 2 : 0);
      const a = i === 0 ? bl[0] : bl[1];
      g.beginPath(); g.moveTo(x - 5 * Math.cos(a), y + 5 * Math.sin(a) * (i === 0 ? 1 : -1)); g.lineTo(x + 5 * Math.cos(a), y - 5 * Math.sin(a) * (i === 0 ? 1 : -1)); g.stroke();
    }
    // blush
    g.fillStyle = 'rgba(255,110,130,0.38)';
    g.beginPath(); g.ellipse(h.x - 6, h.y + 13, 5, 3, 0, 0, 7); g.ellipse(h.x + 20, h.y + 13, 4, 2.6, 0, 0, 7); g.fill();
    // mouth
    const mx = h.x + 8, my = h.y + 16;
    g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = '#5a2418'; g.lineWidth = 2.4;
    switch (face.mouth) {
      case 'grin': g.fillStyle = '#7a2a22'; g.beginPath(); g.moveTo(mx - 6, my - 2); g.quadraticCurveTo(mx, my - 3, mx + 6, my - 2); g.quadraticCurveTo(mx + 5, my + 7, mx, my + 7); g.quadraticCurveTo(mx - 5, my + 7, mx - 6, my - 2); g.closePath(); g.fill(); g.stroke();
        g.fillStyle = '#fff'; g.fillRect(mx - 4.5, my - 2, 9, 2.6); g.fillStyle = '#ff8b8b'; g.beginPath(); g.ellipse(mx, my + 5, 3, 1.8, 0, 0, 7); g.fill(); break;
      case 'open': g.fillStyle = '#7a2a22'; g.beginPath(); g.ellipse(mx, my + 1.5, 4.5, 5, 0, 0, 7); g.fill(); g.stroke(); g.fillStyle = '#ff8b8b'; g.beginPath(); g.ellipse(mx, my + 4, 2.8, 1.8, 0, 0, 7); g.fill(); break;
      case 'smirk': g.beginPath(); g.moveTo(mx - 5, my + 1); g.quadraticCurveTo(mx + 1, my + 3, mx + 6, my - 2); g.stroke(); break;
      case 'cat': g.beginPath(); g.moveTo(mx - 5, my); g.quadraticCurveTo(mx - 2.5, my + 3, mx, my); g.quadraticCurveTo(mx + 2.5, my + 3, mx + 5, my); g.stroke(); break;
      case 'toothy': g.fillStyle = '#7a2a22'; g.beginPath(); g.moveTo(mx - 9, my - 2); g.quadraticCurveTo(mx, my + 10, mx + 9, my - 2); g.closePath(); g.fill(); g.stroke(); g.fillStyle = '#fff'; g.fillRect(mx - 7, my - 2, 5, 3); g.fillRect(mx + 1, my - 2, 5, 3); break;
      case 'gritted': g.fillStyle = '#fff'; g.beginPath(); g.roundRect(mx - 6, my - 2, 12, 6, 2); g.fill(); g.stroke(); g.beginPath(); g.moveTo(mx - 6, my + 1); g.lineTo(mx + 6, my + 1); for (const x of [-2, 2]) { g.moveTo(mx + x, my - 2); g.lineTo(mx + x, my + 4); } g.lineWidth = 1.4; g.stroke(); break;
      case 'wobble': g.fillStyle = '#7a2a22'; g.beginPath(); g.moveTo(mx - 6, my + 2); for (let i = 0; i <= 6; i++) g.lineTo(mx - 6 + i * 2, my + (i % 2 ? -1 : 2)); g.lineTo(mx + 5, my + 6); g.quadraticCurveTo(mx, my + 8, mx - 6, my + 6); g.closePath(); g.fill(); g.stroke(); break;
      case 'mask': break;
      default: g.beginPath(); g.arc(mx, my - 1, 4, 0.2, Math.PI - 0.2); g.stroke();
    }
  }

  // -------- poses --------
  const POSES = {
    idle: { tilt: 0, bob: 0, aim: 18, back: 'hip', feet: [[-8, 0], [9, 0]], headTilt: 0.03 },
    aim: { tilt: 0.1, bob: 2, aim: 38, back: 'support', feet: [[-13, 0], [13, 0]], headTilt: 0.08, face: { eyes: 'focus', brows: 'angry', mouth: 'gritted' } },
    hit: { tilt: -0.32, bob: -6, aim: -25, back: 'flail', feet: [[-14, -4], [10, -10]], headTilt: -0.25, squash: 1, face: { eyes: 'hurt', brows: 'worried', mouth: 'wobble' }, fx: 'hit' },
    win: { tilt: 0, bob: -18, aim: 48, back: 'fist', feet: [[-9, -4], [11, -12]], headTilt: -0.06, face: { eyes: 'closed', brows: 'up', mouth: 'grin' }, fx: 'win' },
  };
  // a couple of personality overrides per hero
  const OVERRIDE = {
    ninja: { aim: { eyes: 'half', brows: 'stern', mouth: 'mask' }, win: { eyes: 'wink', brows: 'smug', mouth: 'mask' }, hit: { mask: true } },
    witch: { aim: { eyes: 'half', brows: 'smug', mouth: 'smirk' }, win: { eyes: 'wink', brows: 'up', mouth: 'cat' } },
    knight: { aim: { eyes: 'focus', brows: 'stern', mouth: 'smirk' } },
    brute: { aim: { eyes: 'small', brows: 'heavy', mouth: 'toothy' }, win: { eyes: 'closed', brows: 'heavy', mouth: 'toothy' } },
    tinker: { aim: { eyes: 'wide', brows: 'up', mouth: 'grin' }, hit: { eyes: 'shock', brows: 'worried', mouth: 'open' } },
  };

  window.drawHero = (g, id, poseName, opts = {}) => {
    const hero = HEROES[id];
    const pose = POSES[poseName];
    const s = { t: opts.t || 0.4 };
    let face = { ...hero.idleFace, ...(pose.face || {}), ...((OVERRIDE[id] || {})[poseName] || {}) };
    const big = hero.big;
    g.save();
    // ground shadow
    g.fillStyle = 'rgba(40,25,15,0.22)'; g.beginPath(); g.ellipse(0, 2, big ? 26 : 20, 5, 0, 0, 7); g.fill();
    g.translate(0, pose.bob);
    if (pose.squash) g.scale(1.06, 0.95);
    if (big) g.scale(1.18, 1.18);
    g.translate(0, -10); g.rotate(pose.tilt); g.translate(0, 10);

    const shF = [7, -46], shB = [-8, -46];
    const aim = (pose.aim * Math.PI) / 180;
    const piv = [shF[0] + 4, shF[1] + 10];
    const dir = [Math.cos(-aim), Math.sin(-aim)];
    const grip = [piv[0] + dir[0] * 4 - dir[1] * 3, piv[1] + dir[1] * 4 + dir[0] * 3];

    hero.back.call(hero, g, s);
    // back arm
    let bh;
    if (pose.back === 'support') bh = [piv[0] + dir[0] * 20, piv[1] + dir[1] * 20 + 4];
    else if (pose.back === 'hip') bh = [-14, -28];
    else if (pose.back === 'flail') bh = [-26, -70];
    else bh = [-10, -86];
    limb(g, shB[0], shB[1], bh[0], bh[1], 9, D(hero.outfit, -0.12), D(hero.skin, -0.06));
    if (pose.back === 'fist') cel(g, P(g, () => g.arc(bh[0], bh[1], 7, 0, 7)), D(hero.skin, -0.06), { lw: 2.2 });
    // legs
    for (const [i, f] of pose.feet.entries()) {
      const hip = [i ? 5 : -5, -20];
      limb(g, hip[0], hip[1], f[0], f[1] - 4, 9.5, hero.pants, hero.pants, 1, 0);
      cel(g, P(g, () => g.ellipse(f[0] + 3, f[1] - 3, 8.5, 5, 0, 0, 7)), hero.shoes, { hi: true });
    }
    // torso
    const bw = big ? 17 : 14;
    cel(g, P(g, () => { g.moveTo(-bw + 2, -52); g.quadraticCurveTo(0, -56, bw - 1, -52); g.quadraticCurveTo(bw + 3, -34, bw + 2, -18); g.quadraticCurveTo(0, -14, -bw - 2, -18); g.quadraticCurveTo(-bw - 3, -34, -bw + 2, -52); g.closePath(); }), hero.outfit, { hi: true });
    hero.torso.call(hero, g, s);
    // head
    const R = big ? 23 : 26;
    const h = { x: 3, y: -78, r: R };
    g.save(); g.translate(2, -54); g.rotate(pose.headTilt); g.translate(-2, 54);
    hero.hairBack.call(hero, g, h, s);
    cel(g, P(g, () => g.arc(h.x, h.y, h.r, 0, 7)), hero.skin, { sx: 5, sy: -3, shadeColor: D(hero.skin, -0.1) });
    cel(g, P(g, () => g.ellipse(h.x - h.r + 4, h.y + 5, 3.6, 5, 0, 0, 7)), D(hero.skin, -0.08), { lw: 2, shade: false });
    drawFace(g, hero, h, face);
    if (hero.faceExtra) hero.faceExtra.call(hero, g, h, face);
    hero.hairFront.call(hero, g, h, s);
    if (pose.fx === 'hit') { // sweat + dizzy stars
      cel(g, P(g, () => { g.moveTo(h.x + h.r - 2, h.y - 14); g.quadraticCurveTo(h.x + h.r + 7, h.y - 2, h.x + h.r + 2, h.y + 2); g.quadraticCurveTo(h.x + h.r - 4, h.y - 2, h.x + h.r - 2, h.y - 14); }), '#9fe3ff', { lw: 1.8, shade: false });
    }
    g.restore();
    // weapon + front arm
    g.save(); g.translate(piv[0], piv[1]); g.rotate(-aim); g.scale(1.3, 1.3);
    if (window.HERO_STYLE === 'paper') { g.stroke = function (...a) { if (this.strokeStyle === '#2b1a12') return; return CanvasRenderingContext2D.prototype.stroke.apply(this, a); }; g.shadowColor = 'rgba(45,28,14,0.38)'; g.shadowOffsetY = 2.4; g.shadowBlur = 2.2; }
    if (window.TK && TK.Art && TK.Art.drawWeapon) TK.Art.drawWeapon(g, opts.weapon || hero.weapon, hero.accent, 0, s.t);
    delete g.stroke;
    g.restore();
    limb(g, shF[0], shF[1], grip[0], grip[1], 9, hero.outfit, hero.skin);
    if (window.HERO_STYLE === 'paper') {
      for (const [x, y] of [shF, [-5, -20], [5, -20]]) { g.save(); g.shadowColor = 'rgba(45,28,14,0.4)'; g.shadowOffsetY = 1.2; g.shadowBlur = 1; const gr = g.createRadialGradient(x - 1, y - 1, 0.5, x, y, 3.4); gr.addColorStop(0, '#fff3c0'); gr.addColorStop(1, '#c49a2c'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, 3, 0, 7); g.fill(); g.restore(); }
    }
    g.restore();

    // effects outside body transform
    if (pose.fx === 'win') {
      g.fillStyle = '#ffd23f';
      for (const [x, y, r] of [[-34, -110, 6], [36, -118, 5], [44, -70, 4]]) { g.beginPath(); for (let i = 0; i < 8; i++) { const rr = i % 2 ? r * 0.35 : r, a = (i * Math.PI) / 4; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } g.closePath(); g.fill(); }
    }
    if (pose.fx === 'hit') {
      g.fillStyle = '#ffd23f'; g.strokeStyle = '#7a4a10'; g.lineWidth = 1.4;
      for (const [x, y] of [[-30, -118], [-6, -128], [20, -120]]) { g.beginPath(); for (let i = 0; i < 10; i++) { const rr = i % 2 ? 2.4 : 6, a = -Math.PI / 2 + (i * Math.PI) / 5; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } g.closePath(); g.fill(); g.stroke(); }
    }
  };
  window.HERO_DEFS = HEROES;
  window.HERO_CEL = cel;
  window.HERO_SHADE = D;
})();
