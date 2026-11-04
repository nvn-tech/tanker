// Destructible terrain: floating islands drawn into an offscreen canvas,
// with a 1-byte-per-pixel solidity mask kept in sync for fast collision.

TK.THEMES = {
  meadow: {
    name: 'Sunny Meadow',
    sky: ['#5fb8f0', '#bfe9ff', '#fff6d8'],
    sun: '#fff3a0',
    hills: ['#a8dcb6', '#86c79a'],
    cloud: '#ffffff',
    top: '#4fb83f', topLight: '#a6ec6c',
    dirt: '#a8723f', speck: ['#c58f55', '#7d5028', '#d9b07a', '#8c5f34'],
    rim: '#4b2c14',
    deco: ['#ff6b8b', '#ffd23f', '#ffffff', '#b78cff'],
    abyss: '#7fb3d9',
  },
  candy: {
    name: 'Candy Clouds',
    sky: ['#ff9ccf', '#ffd1ea', '#fff0f7'],
    sun: '#fffbe0',
    hills: ['#f7b8e0', '#e79ccc'],
    cloud: '#fff4fb',
    top: '#ff7eb9', topLight: '#ffd0e8',
    dirt: '#7a4a2e', speck: ['#9b6342', '#5c341f', '#ff9ec9', '#7fd6ff', '#ffe066'],
    rim: '#3d1f10',
    deco: ['#ff4f9a', '#7fd6ff', '#ffe066', '#9dff9d'],
    abyss: '#e7a0cf',
  },
  snow: {
    name: 'Frosty Peaks',
    sky: ['#4a78c8', '#9cc4ef', '#e8f4ff'],
    sun: '#ffffff',
    hills: ['#c9dcf2', '#a9c3e4'],
    cloud: '#f4f9ff',
    top: '#f4fbff', topLight: '#ffffff',
    dirt: '#5d7fa8', speck: ['#7d9ec6', '#47678d', '#b3d0ee', '#3a5577'],
    rim: '#24384f',
    deco: ['#9fe3ff', '#ffffff', '#c7b5ff'],
    abyss: '#86a8d6',
  },
  desert: {
    name: 'Sunset Dunes',
    sky: ['#ff8a5c', '#ffc27a', '#ffe8b0'],
    sun: '#fff1b8',
    hills: ['#e9a96b', '#d48a52'],
    cloud: '#ffe9d1',
    top: '#f2c46b', topLight: '#ffe39e',
    dirt: '#c0793f', speck: ['#d9944f', '#9c5a2b', '#e8b072', '#a8693a'],
    rim: '#5a2e12',
    deco: ['#5fbf5a', '#ff6b6b', '#ffd23f'],
    abyss: '#e0915e',
  },
};

TK.Terrain = class Terrain {
  constructor(w, h, themeKey, seed) {
    this.w = w;
    this.h = h;
    this.theme = TK.THEMES[themeKey];
    this.canvas = document.createElement('canvas');
    this.canvas.width = w;
    this.canvas.height = h;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    this.mask = new Uint8Array(w * h);
    this.rng = TK.mulberry32(seed);
    this.islands = [];
    this.generate();
  }

  makePattern() {
    const r = this.rng;
    const t = this.theme;
    const c = document.createElement('canvas');
    c.width = c.height = 96;
    const g = c.getContext('2d');
    g.fillStyle = t.dirt;
    g.fillRect(0, 0, 96, 96);
    for (let i = 0; i < 70; i++) {
      g.fillStyle = t.speck[Math.floor(r() * t.speck.length)];
      g.globalAlpha = 0.35 + r() * 0.5;
      const x = r() * 96, y = r() * 96, s = 1 + r() * 4;
      g.beginPath();
      g.ellipse(x, y, s * 1.4, s, r() * Math.PI, 0, Math.PI * 2);
      g.fill();
    }
    // a few pebbles with highlights
    g.globalAlpha = 1;
    for (let i = 0; i < 5; i++) {
      const x = r() * 96, y = r() * 96, s = 3 + r() * 4;
      g.fillStyle = t.rim;
      g.globalAlpha = 0.35;
      g.beginPath(); g.ellipse(x + 1, y + 1, s * 1.3, s, 0, 0, Math.PI * 2); g.fill();
      g.globalAlpha = 0.6;
      g.fillStyle = t.speck[2 % t.speck.length];
      g.beginPath(); g.ellipse(x, y, s * 1.3, s, 0, 0, Math.PI * 2); g.fill();
    }
    g.globalAlpha = 1;
    return this.ctx.createPattern(c, 'repeat');
  }

  generate() {
    const r = this.rng;
    const W = this.w, H = this.h;
    const ctx = this.ctx;
    const pattern = this.makePattern();

    // Lay out 2-4 main islands with gaps between them.
    const count = 2 + Math.floor(r() * 3);
    const margin = 70;
    const gaps = [];
    let gapTotal = 0;
    for (let i = 0; i < count - 1; i++) {
      const g = 70 + r() * 110;
      gaps.push(g);
      gapTotal += g;
    }
    const usable = W - margin * 2 - gapTotal;
    const weights = [];
    let wsum = 0;
    for (let i = 0; i < count; i++) { const wv = 0.7 + r() * 0.6; weights.push(wv); wsum += wv; }
    let x = margin;
    for (let i = 0; i < count; i++) {
      const iw = (usable * weights[i]) / wsum;
      this.islands.push({ x0: x, x1: x + iw, baseY: H * (0.52 + (r() - 0.5) * 0.22), thick: 150 + r() * 140, small: false });
      x += iw + (gaps[i] || 0);
    }
    // A couple of small floating ledges higher up.
    const ledges = 1 + Math.floor(r() * 2);
    for (let i = 0; i < ledges; i++) {
      const lw = 140 + r() * 120;
      const lx = margin + r() * (W - margin * 2 - lw);
      this.islands.push({ x0: lx, x1: lx + lw, baseY: H * (0.25 + r() * 0.12), thick: 50 + r() * 30, small: true });
    }

    for (const isl of this.islands) {
      const p1 = r() * 10, p2 = r() * 10, p3 = r() * 10;
      const a1 = isl.small ? 8 : 40 + r() * 50;
      const a2 = isl.small ? 4 : 15 + r() * 20;
      const top = [];
      const bottom = [];
      const step = 6;
      const span = isl.x1 - isl.x0;
      for (let px = isl.x0; px <= isl.x1 + 0.1; px += step) {
        const t = (px - isl.x0) / span;
        const edge = (1 - Math.pow(Math.sin(Math.PI * t), 0.3)) * (isl.small ? 20 : 70);
        const y = isl.baseY + edge +
          Math.sin(px * 0.004 + p1) * a1 +
          Math.sin(px * 0.011 + p2) * a2 +
          Math.sin(px * 0.031 + p3) * 4;
        top.push([px, y]);
        const by = isl.baseY + 30 + isl.thick * Math.pow(Math.sin(Math.PI * t), 0.75) +
          Math.sin(px * 0.02 + p2) * 12 + Math.sin(px * 0.07 + p1) * 5;
        bottom.push([px, Math.max(by, y + 18)]);
      }
      isl.top = top;
      const path = new Path2D();
      path.moveTo(top[0][0], top[0][1]);
      for (const [tx, ty] of top) path.lineTo(tx, ty);
      for (let i = bottom.length - 1; i >= 0; i--) path.lineTo(bottom[i][0], bottom[i][1]);
      path.closePath();
      isl.path = path;

      ctx.fillStyle = pattern;
      ctx.fill(path);

      // Shading + outline + grass, painted only onto existing terrain pixels.
      ctx.save();
      ctx.globalCompositeOperation = 'source-atop';
      const shade = ctx.createLinearGradient(0, isl.baseY, 0, isl.baseY + isl.thick + 60);
      shade.addColorStop(0, 'rgba(0,0,0,0)');
      shade.addColorStop(1, 'rgba(30,10,0,0.45)');
      ctx.fillStyle = shade;
      ctx.fill(path);
      ctx.lineWidth = 6;
      ctx.strokeStyle = this.theme.rim;
      ctx.stroke(path);
      const topLine = new Path2D();
      topLine.moveTo(top[0][0], top[0][1]);
      for (const [tx, ty] of top) topLine.lineTo(tx, ty);
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.lineWidth = 30;
      ctx.strokeStyle = this.theme.rim;
      ctx.stroke(topLine);
      ctx.lineWidth = 24;
      ctx.strokeStyle = this.theme.top;
      ctx.stroke(topLine);
      ctx.lineWidth = 7;
      ctx.strokeStyle = this.theme.topLight;
      ctx.stroke(topLine);
      // drips of grass/frosting hanging down the dirt
      for (let i = 0; i < top.length; i += 3 + Math.floor(r() * 4)) {
        const [tx, ty] = top[i];
        const len = 8 + r() * 16;
        ctx.fillStyle = this.theme.top;
        ctx.beginPath();
        ctx.ellipse(tx, ty + 10 + len / 2, 5 + r() * 3, len / 2 + 4, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    this.computeMask();
    this.decorate();
  }

  computeMask() {
    const d = this.ctx.getImageData(0, 0, this.w, this.h).data;
    const m = this.mask;
    for (let i = 0, j = 3; i < m.length; i++, j += 4) m[i] = d[j] > 110 ? 1 : 0;
  }

  // Non-solid decorations (tufts, flowers) drawn after the mask is built.
  decorate() {
    const r = this.rng;
    const ctx = this.ctx;
    const t = this.theme;
    for (const isl of this.islands) {
      for (let i = 2; i < isl.top.length - 2; i += 2 + Math.floor(r() * 4)) {
        const [x, y] = isl.top[i];
        const sy = this.surfaceY(x, y - 30);
        if (sy == null) continue;
        const kind = r();
        if (kind < 0.55) {
          ctx.strokeStyle = t.top;
          ctx.lineWidth = 2.5;
          ctx.lineCap = 'round';
          for (let b = -2; b <= 2; b++) {
            ctx.beginPath();
            ctx.moveTo(x + b * 2, sy + 2);
            ctx.quadraticCurveTo(x + b * 3, sy - 6, x + b * 4.5, sy - 8 - r() * 5);
            ctx.stroke();
          }
        } else if (kind < 0.8) {
          const c = t.deco[Math.floor(r() * t.deco.length)];
          ctx.strokeStyle = '#3f8a35';
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(x, sy + 2); ctx.lineTo(x, sy - 10); ctx.stroke();
          ctx.fillStyle = c;
          for (let p = 0; p < 5; p++) {
            const a = (p / 5) * Math.PI * 2;
            ctx.beginPath(); ctx.arc(x + Math.cos(a) * 3.5, sy - 12 + Math.sin(a) * 3.5, 2.8, 0, Math.PI * 2); ctx.fill();
          }
          ctx.fillStyle = '#fff6a0';
          ctx.beginPath(); ctx.arc(x, sy - 12, 2.2, 0, Math.PI * 2); ctx.fill();
        } else if (kind < 0.9) {
          ctx.fillStyle = t.rim;
          ctx.beginPath(); ctx.ellipse(x, sy + 1, 8, 5, 0, Math.PI, 0); ctx.fill();
          ctx.fillStyle = t.speck[2 % t.speck.length];
          ctx.beginPath(); ctx.ellipse(x - 1, sy, 6, 3.5, 0, Math.PI, 0); ctx.fill();
        }
      }
    }
  }

  isSolid(x, y) {
    x |= 0; y |= 0;
    if (x < 0 || x >= this.w || y < 0 || y >= this.h) return false;
    return this.mask[y * this.w + x] === 1;
  }

  // First solid pixel scanning down from fromY.
  surfaceY(x, fromY = 0) {
    x |= 0;
    if (x < 0 || x >= this.w) return null;
    for (let y = Math.max(0, fromY | 0); y < this.h; y++) {
      if (this.mask[y * this.w + x]) return y;
    }
    return null;
  }

  carve(cx, cy, r) {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    // scorched rim on what's left
    ctx.globalCompositeOperation = 'source-atop';
    ctx.strokeStyle = 'rgba(40,18,6,0.55)';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(cx, cy, r + 3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(this.w - 1, Math.ceil(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(this.h - 1, Math.ceil(cy + r));
    const r2 = r * r;
    for (let y = y0; y <= y1; y++) {
      const dy = y - cy;
      for (let x = x0; x <= x1; x++) {
        const dx = x - cx;
        if (dx * dx + dy * dy <= r2) this.mask[y * this.w + x] = 0;
      }
    }
  }

  // Pick spawn x positions spread across the solid islands.
  spawnPoints(n) {
    const pts = [];
    const main = this.islands.filter((i) => !i.small);
    const totalW = main.reduce((s, i) => s + (i.x1 - i.x0 - 120), 0);
    for (let k = 0; k < n; k++) {
      let target = ((k + 0.5) / n) * totalW;
      for (const isl of main) {
        const span = isl.x1 - isl.x0 - 120;
        if (target <= span) { pts.push({ x: isl.x0 + 60 + target, isl }); break; }
        target -= span;
      }
    }
    return pts.map(({ x, isl }) => {
      x += (this.rng() - 0.5) * 60;
      // start scanning just above this island's own surface (skips ledges overhead)
      const i = TK.clamp(Math.round((x - isl.x0) / 6), 0, isl.top.length - 1);
      const y = this.surfaceY(x, isl.top[i][1] - 40);
      return { x, y: y == null ? this.h * 0.4 : y };
    });
  }
};
