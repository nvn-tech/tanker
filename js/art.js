// All the hand-drawn (canvas) art: sky, clouds, chibi characters, bombs.
TK.Art = {};

TK.HATS = ['cap', 'wizard', 'crown', 'bunny', 'helmet', 'sprout'];
TK.HAT_NAMES = { cap: 'Cap', wizard: 'Wizard', crown: 'Crown', bunny: 'Bunny', helmet: 'Pilot', sprout: 'Sprout' };
TK.COLORS = ['#ff5a5f', '#3fa7ff', '#ffb627', '#7bd64a', '#b77bff', '#ff7ac8'];
TK.HAIR = ['#5a3418', '#f2c14e', '#2b2b3a', '#d9572b', '#8b5cf6', '#ffffff'];

// ---------- Background ----------
TK.Art.makeSky = (theme, seed) => {
  const rng = TK.mulberry32(seed);
  const clouds = [];
  for (let i = 0; i < 14; i++) {
    clouds.push({ x: rng() * 3000, y: 40 + rng() * 420, s: 0.6 + rng() * 1.2, layer: rng() < 0.5 ? 0.15 : 0.35, speed: 4 + rng() * 10 });
  }
  const hills = [[], []];
  for (let l = 0; l < 2; l++) {
    const p1 = rng() * 10, p2 = rng() * 10;
    for (let x = 0; x <= 3200; x += 40) {
      hills[l].push(Math.sin(x * 0.003 + p1) * 60 + Math.sin(x * 0.009 + p2) * 25 + (l === 0 ? 0 : 60));
    }
  }
  return { theme, clouds, hills };
};

TK.Art.drawCloud = (ctx, x, y, s, color) => {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, 26 * s, 0, Math.PI * 2);
  ctx.arc(x + 30 * s, y - 14 * s, 32 * s, 0, Math.PI * 2);
  ctx.arc(x + 64 * s, y, 26 * s, 0, Math.PI * 2);
  ctx.arc(x + 32 * s, y + 8 * s, 28 * s, 0, Math.PI * 2);
  ctx.fill();
};

// Screen-space background with parallax against the camera.
TK.Art.drawSky = (ctx, sky, cam, vw, vh, time) => {
  const t = sky.theme;
  const g = ctx.createLinearGradient(0, 0, 0, vh);
  g.addColorStop(0, t.sky[0]);
  g.addColorStop(0.6, t.sky[1]);
  g.addColorStop(1, t.sky[2]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, vw, vh);

  // sun
  const sx = vw * 0.78 - cam.x * 0.05, sy = vh * 0.2 - cam.y * 0.05;
  const sg = ctx.createRadialGradient(sx, sy, 10, sx, sy, 140);
  sg.addColorStop(0, t.sun);
  sg.addColorStop(0.35, t.sun + 'aa');
  sg.addColorStop(1, t.sun + '00');
  ctx.fillStyle = sg;
  ctx.beginPath(); ctx.arc(sx, sy, 140, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = t.sun;
  ctx.beginPath(); ctx.arc(sx, sy, 42, 0, Math.PI * 2); ctx.fill();

  // far clouds
  for (const c of sky.clouds) {
    if (c.layer !== 0.15) continue;
    const x = ((c.x + time * c.speed - cam.x * c.layer) % 3200 + 3200) % 3200 - 200;
    ctx.globalAlpha = 0.55;
    TK.Art.drawCloud(ctx, x, c.y - cam.y * c.layer, c.s * 0.8, t.cloud);
  }
  ctx.globalAlpha = 1;

  // hills
  for (let l = 0; l < 2; l++) {
    const par = l === 0 ? 0.12 : 0.22;
    const base = vh * (l === 0 ? 0.62 : 0.74) - cam.y * par * 0.5;
    ctx.fillStyle = t.hills[l];
    ctx.beginPath();
    ctx.moveTo(0, vh);
    const off = cam.x * par;
    for (let x = 0; x <= vw + 40; x += 20) {
      const wx = ((x + off) % 3200 + 3200) % 3200;
      const i = Math.floor(wx / 40);
      const f = (wx % 40) / 40;
      const h = TK.lerp(sky.hills[l][i], sky.hills[l][Math.min(i + 1, sky.hills[l].length - 1)], f);
      ctx.lineTo(x, base + h);
    }
    ctx.lineTo(vw, vh);
    ctx.closePath();
    ctx.fill();
  }

  // near clouds
  for (const c of sky.clouds) {
    if (c.layer !== 0.35) continue;
    const x = ((c.x + time * c.speed - cam.x * c.layer) % 3200 + 3200) % 3200 - 200;
    ctx.globalAlpha = 0.85;
    TK.Art.drawCloud(ctx, x, c.y + 120 - cam.y * c.layer, c.s, t.cloud);
  }
  ctx.globalAlpha = 1;
};

// ---------- Characters ----------
function outlineFill(ctx, fill, lw = 2.2) {
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = lw;
  ctx.strokeStyle = '#2b1a12';
  ctx.stroke();
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) + amt, g = ((n >> 8) & 255) + amt, b = (n & 255) + amt;
  r = TK.clamp(r, 0, 255); g = TK.clamp(g, 0, 255); b = TK.clamp(b, 0, 255);
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}
TK.shade = shade;

function drawHat(ctx, hat, color, hy) {
  switch (hat) {
    case 'cap':
      ctx.beginPath();
      ctx.arc(0, hy - 4, 15, Math.PI, 0);
      ctx.closePath();
      outlineFill(ctx, color);
      ctx.beginPath();
      ctx.ellipse(10, hy - 4, 12, 3.5, 0, 0, Math.PI * 2);
      outlineFill(ctx, shade(color, -40));
      ctx.beginPath(); ctx.arc(0, hy - 19, 2.5, 0, Math.PI * 2); outlineFill(ctx, '#fff', 1.5);
      break;
    case 'wizard':
      ctx.beginPath();
      ctx.moveTo(-17, hy - 2);
      ctx.quadraticCurveTo(-4, hy - 18, -6, hy - 40);
      ctx.quadraticCurveTo(8, hy - 18, 17, hy - 2);
      ctx.closePath();
      outlineFill(ctx, color);
      ctx.beginPath(); ctx.ellipse(0, hy - 2, 20, 4.5, 0, 0, Math.PI * 2); outlineFill(ctx, shade(color, -40));
      ctx.fillStyle = '#ffe45c';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('★', -2, hy - 12);
      break;
    case 'crown':
      ctx.beginPath();
      ctx.moveTo(-11, hy - 6);
      ctx.lineTo(-13, hy - 22); ctx.lineTo(-6, hy - 14); ctx.lineTo(0, hy - 26);
      ctx.lineTo(6, hy - 14); ctx.lineTo(13, hy - 22); ctx.lineTo(11, hy - 6);
      ctx.closePath();
      outlineFill(ctx, '#ffd23f');
      ctx.beginPath(); ctx.arc(0, hy - 11, 2.6, 0, Math.PI * 2); outlineFill(ctx, color, 1.2);
      break;
    case 'bunny':
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(s * 7, hy - 22, 5.5, 15, s * 0.2, 0, Math.PI * 2);
        outlineFill(ctx, '#ffffff');
        ctx.beginPath();
        ctx.ellipse(s * 7, hy - 21, 2.5, 10, s * 0.2, 0, Math.PI * 2);
        ctx.fillStyle = shade(color, 40);
        ctx.fill();
      }
      ctx.beginPath(); ctx.arc(0, hy - 5, 15, Math.PI * 1.05, Math.PI * 1.95); ctx.lineWidth = 4; ctx.strokeStyle = color; ctx.stroke();
      break;
    case 'helmet':
      ctx.beginPath();
      ctx.arc(0, hy - 2, 16.5, Math.PI, 0);
      ctx.closePath();
      outlineFill(ctx, shade(color, -20));
      ctx.beginPath(); ctx.ellipse(-5, hy - 10, 6, 5, 0, 0, Math.PI * 2); outlineFill(ctx, '#bfe9ff', 1.6);
      ctx.beginPath(); ctx.ellipse(6, hy - 10, 6, 5, 0, 0, Math.PI * 2); outlineFill(ctx, '#bfe9ff', 1.6);
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(-6.5, hy - 11.5, 1.6, 0, Math.PI * 2); ctx.arc(4.5, hy - 11.5, 1.6, 0, Math.PI * 2); ctx.fill();
      break;
    case 'sprout':
      ctx.strokeStyle = '#2b1a12'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, hy - 12); ctx.quadraticCurveTo(2, hy - 20, 0, hy - 26); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(-7, hy - 27, 8, 4.5, -0.5, 0, Math.PI * 2); outlineFill(ctx, '#6fd04a', 1.6);
      ctx.beginPath(); ctx.ellipse(7, hy - 29, 8, 4.5, 0.5, 0, Math.PI * 2); outlineFill(ctx, '#8fe36a', 1.6);
      break;
  }
}

// Draws a chibi character standing with feet at (0,0), facing +x.
// opts: { color, hair, hat, angle (deg), mood: 'normal'|'hurt'|'happy', time, charging }
TK.Art.drawChibi = (ctx, o) => {
  const t = o.time || 0;
  const bob = Math.sin(t * 3.2 + (o.seed || 0)) * 1.2;
  const blink = ((t + (o.seed || 0)) % 3.6) < 0.12;

  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath(); ctx.ellipse(0, 1, 15, 4, 0, 0, Math.PI * 2); ctx.fill();

  // feet
  ctx.beginPath(); ctx.ellipse(-6, -3, 6, 4, 0, 0, Math.PI * 2); outlineFill(ctx, '#4a3328');
  ctx.beginPath(); ctx.ellipse(7, -3, 6, 4, 0, 0, Math.PI * 2); outlineFill(ctx, '#4a3328');

  // body
  TK.roundRect(ctx, -11, -24 + bob * 0.4, 22, 20, 8);
  outlineFill(ctx, o.color);
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  TK.roundRect(ctx, -7, -21 + bob * 0.4, 6, 12, 3); ctx.fill();
  // belt
  ctx.fillStyle = shade(o.color, -60);
  ctx.fillRect(-11, -10 + bob * 0.4, 22, 3);

  // cannon, rotated by aim angle around the shoulder
  ctx.save();
  ctx.translate(2, -16 + bob * 0.4);
  ctx.rotate(-TK.rad(o.angle || 0));
  const kick = o.recoil ? -o.recoil * 6 : 0;
  TK.roundRect(ctx, -6 + kick, -6, 32, 12, 5);
  outlineFill(ctx, '#6b7a8f');
  ctx.fillStyle = '#9fb0c6';
  ctx.fillRect(-2 + kick, -4, 24, 3);
  TK.roundRect(ctx, 22 + kick, -7.5, 8, 15, 3);
  outlineFill(ctx, o.color);
  TK.roundRect(ctx, 4 + kick, -7, 6, 14, 2);
  outlineFill(ctx, shade(o.color, -30), 1.6);
  if (o.charging) {
    ctx.fillStyle = `rgba(255,${200 - o.charging * 120},60,${0.4 + 0.4 * Math.sin(t * 30)})`;
    ctx.beginPath(); ctx.arc(32 + kick, 0, 5 + o.charging * 5, 0, Math.PI * 2); ctx.fill();
  }
  // little hand
  ctx.beginPath(); ctx.arc(8 + kick, 6, 4, 0, Math.PI * 2); outlineFill(ctx, '#ffe0c4', 1.6);
  ctx.restore();

  // head
  const hy = -38 + bob;
  ctx.beginPath(); ctx.arc(0, hy, 16, 0, Math.PI * 2); outlineFill(ctx, '#ffe0c4');
  // hair fringe
  ctx.beginPath();
  ctx.arc(0, hy - 2, 16, Math.PI * 1.02, Math.PI * 1.98);
  ctx.quadraticCurveTo(10, hy - 4, 4, hy - 8);
  ctx.quadraticCurveTo(0, hy - 2, -6, hy - 7);
  ctx.quadraticCurveTo(-12, hy - 2, -16, hy - 2);
  ctx.closePath();
  outlineFill(ctx, o.hair || '#5a3418');

  // face (looks towards facing direction a little)
  const ex = 4;
  if (o.mood === 'hurt') {
    ctx.strokeStyle = '#2b1a12'; ctx.lineWidth = 2;
    for (const dx of [-5, 8]) {
      ctx.beginPath();
      ctx.moveTo(ex + dx - 3, hy - 1); ctx.lineTo(ex + dx + 3, hy + 3);
      ctx.moveTo(ex + dx + 3, hy - 1); ctx.lineTo(ex + dx - 3, hy + 3);
      ctx.stroke();
    }
    ctx.beginPath(); ctx.ellipse(ex + 2, hy + 9, 3, 2.2, 0, 0, Math.PI * 2); ctx.fillStyle = '#7a2a2a'; ctx.fill();
  } else {
    for (const dx of [-5, 8]) {
      if (blink || o.mood === 'happy') {
        ctx.strokeStyle = '#2b1a12'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(ex + dx, hy + 2, 3, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
      } else {
        ctx.fillStyle = '#2b1a12';
        ctx.beginPath(); ctx.ellipse(ex + dx, hy + 1, 3, 4.2, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(ex + dx + 1, hy - 0.8, 1.4, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.strokeStyle = '#7a3a2a'; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.arc(ex + 2, hy + 7, 2.6, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
  }
  ctx.fillStyle = 'rgba(255,120,140,0.45)';
  ctx.beginPath(); ctx.ellipse(ex - 9, hy + 6, 3.5, 2, 0, 0, Math.PI * 2); ctx.ellipse(ex + 13, hy + 6, 3, 2, 0, 0, Math.PI * 2); ctx.fill();

  drawHat(ctx, o.hat, o.color, hy - 6);
};

TK.Art.drawTomb = (ctx, color) => {
  ctx.beginPath();
  ctx.moveTo(-12, 0); ctx.lineTo(-12, -22);
  ctx.arc(0, -22, 12, Math.PI, 0);
  ctx.lineTo(12, 0); ctx.closePath();
  outlineFill(ctx, '#b9c0c9');
  ctx.fillStyle = '#8a929c';
  ctx.fillRect(-2, -28, 4, 16); ctx.fillRect(-7, -23, 14, 4);
  ctx.fillStyle = color;
  ctx.fillRect(-12, -4, 24, 4);
};

TK.Art.drawBomb = (ctx, p, time) => {
  ctx.save();
  ctx.translate(p.x, p.y);
  const s = p.super ? 1.5 : 1;
  ctx.scale(s, s);
  ctx.rotate(time * 10);
  if (p.teleport) {
    ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2);
    const g = ctx.createRadialGradient(0, 0, 1, 0, 0, 9);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.5, '#a98bff'); g.addColorStop(1, '#5b3cc4');
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = '#2b1a12'; ctx.lineWidth = 2; ctx.stroke();
  } else {
    ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2);
    outlineFill(ctx, p.super ? '#ff4f4f' : '#3a3f4a');
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath(); ctx.arc(-3, -3, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#c9a26a';
    ctx.fillRect(-2, -12, 4, 5);
    ctx.fillStyle = Math.sin(time * 40) > 0 ? '#ffe45c' : '#ff8a3c';
    ctx.beginPath(); ctx.arc(0, -13, 3, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
};
