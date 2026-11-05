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

// Held weapon, drawn in the arm's local space (x = forward along the aim).
TK.Art.drawWeapon = (ctx, id, color, kick, t) => {
  const k = kick;
  switch (id) {
    case 'splitter':
      TK.roundRect(ctx, -7 + k, -9, 14, 18, 4); outlineFill(ctx, '#7a5a3a');
      for (const y of [-8, -2.5, 3]) {
        TK.roundRect(ctx, 4 + k, y, 26, 5.5, 2.5); outlineFill(ctx, '#ff9f43', 1.6);
      }
      ctx.fillStyle = color; ctx.fillRect(-5 + k, -2, 9, 4);
      break;
    case 'frost':
      TK.roundRect(ctx, -6 + k, -6, 28, 12, 6); outlineFill(ctx, '#bfe9ff');
      ctx.fillStyle = '#ffffff'; ctx.fillRect(-2 + k, -4, 18, 2.5);
      ctx.beginPath();
      ctx.moveTo(20 + k, 0); ctx.lineTo(27 + k, -8); ctx.lineTo(36 + k, 0); ctx.lineTo(27 + k, 8); ctx.closePath();
      outlineFill(ctx, '#6fd3ff');
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.beginPath(); ctx.moveTo(25 + k, -3); ctx.lineTo(28 + k, -6); ctx.lineTo(30 + k, -2); ctx.closePath(); ctx.fill();
      TK.roundRect(ctx, 2 + k, -9, 6, 18, 2); outlineFill(ctx, color, 1.6);
      break;
    case 'toxic':
      TK.roundRect(ctx, -6 + k, -5, 34, 10, 4); outlineFill(ctx, '#3d5a3a');
      TK.roundRect(ctx, 26 + k, -7, 6, 14, 2); outlineFill(ctx, '#2b3f29', 1.6);
      ctx.beginPath(); ctx.arc(6 + k, -11, 8, 0, Math.PI * 2); outlineFill(ctx, 'rgba(200,255,200,0.6)');
      ctx.save(); ctx.beginPath(); ctx.arc(6 + k, -11, 7, 0, Math.PI * 2); ctx.clip();
      ctx.fillStyle = '#7cff4f'; ctx.fillRect(-2 + k, -11 + Math.sin(t * 4) * 1.2, 16, 10);
      ctx.restore();
      ctx.fillStyle = '#d9ffb3';
      ctx.beginPath(); ctx.arc(4 + k, -8 - ((t * 8) % 6), 1.4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = color; ctx.fillRect(14 + k, -5, 4, 10);
      break;
    case 'thunder': {
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#2b1a12'; ctx.lineWidth = 7;
      ctx.beginPath(); ctx.moveTo(-8 + k, 0); ctx.lineTo(24 + k, 0); ctx.stroke();
      ctx.strokeStyle = '#8a5a2b'; ctx.lineWidth = 4.5; ctx.stroke();
      ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 4.5;
      ctx.beginPath(); ctx.moveTo(18 + k, 0); ctx.lineTo(23 + k, 0); ctx.stroke();
      ctx.lineCap = 'butt';
      const g = ctx.createRadialGradient(29 + k, 0, 1, 29 + k, 0, 12);
      g.addColorStop(0, '#ffffff'); g.addColorStop(0.4, '#fff07a'); g.addColorStop(1, 'rgba(255,230,80,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(29 + k, 0, 12, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(29 + k, 0, 5.5, 0, Math.PI * 2); outlineFill(ctx, '#ffe45c', 1.6);
      ctx.strokeStyle = '#fffbd0'; ctx.lineWidth = 1.5;
      const a = t * 9;
      for (let i = 0; i < 2; i++) {
        const r = a + i * Math.PI;
        ctx.beginPath();
        ctx.moveTo(29 + k + Math.cos(r) * 6, Math.sin(r) * 6);
        ctx.lineTo(29 + k + Math.cos(r + 0.4) * 10, Math.sin(r + 0.4) * 10 + 2);
        ctx.lineTo(29 + k + Math.cos(r + 0.2) * 14, Math.sin(r + 0.2) * 14);
        ctx.stroke();
      }
      ctx.fillStyle = color; ctx.fillRect(2 + k, -3.5, 5, 7);
      break;
    }
    case 'drill':
      TK.roundRect(ctx, -8 + k, -7, 30, 14, 4); outlineFill(ctx, '#6f7d4a');
      ctx.beginPath(); ctx.moveTo(22 + k, -7); ctx.lineTo(36 + k, 0); ctx.lineTo(22 + k, 7); ctx.closePath();
      outlineFill(ctx, '#c9d1da');
      ctx.strokeStyle = '#7d8794'; ctx.lineWidth = 1.5;
      for (let i = 0; i < 3; i++) {
        const x = 24 + k + ((t * 30 + i * 4) % 12);
        const h = 7 * (1 - (x - 22 - k) / 14);
        ctx.beginPath(); ctx.moveTo(x, -h); ctx.lineTo(x + 2, h); ctx.stroke();
      }
      ctx.fillStyle = color; ctx.fillRect(2 + k, -7, 6, 14);
      ctx.strokeStyle = '#2b1a12'; ctx.lineWidth = 1.5; ctx.strokeRect(2 + k, -7, 6, 14);
      break;
    case 'bouncer':
      TK.roundRect(ctx, -6 + k, -7, 24, 14, 6); outlineFill(ctx, '#ff7ac8');
      ctx.beginPath(); ctx.ellipse(24 + k, 0, 6, 11, 0, 0, Math.PI * 2); outlineFill(ctx, '#ffd0ea');
      ctx.beginPath(); ctx.ellipse(24 + k, 0, 3, 7, 0, 0, Math.PI * 2); ctx.fillStyle = '#3a2030'; ctx.fill();
      ctx.fillStyle = '#ffffff';
      for (const [x, y] of [[2, -3], [9, 2], [14, -3]]) { ctx.beginPath(); ctx.arc(x + k, y, 1.8, 0, Math.PI * 2); ctx.fill(); }
      TK.roundRect(ctx, 4 + k, -8, 5, 16, 2); outlineFill(ctx, color, 1.6);
      break;
    case 'medic':
      TK.roundRect(ctx, -6 + k, -6.5, 32, 13, 6); outlineFill(ctx, '#ffffff');
      TK.roundRect(ctx, 23 + k, -8, 8, 16, 3); outlineFill(ctx, '#ff5a6e');
      ctx.fillStyle = '#ff5a6e';
      ctx.fillRect(7 + k, -4.5, 3, 9); ctx.fillRect(4 + k, -1.5, 9, 3);
      ctx.fillStyle = color; ctx.fillRect(-4 + k, -2, 6, 4);
      break;
    default: // bomb cannon
      TK.roundRect(ctx, -6 + k, -6, 32, 12, 5); outlineFill(ctx, '#6b7a8f');
      ctx.fillStyle = '#9fb0c6'; ctx.fillRect(-2 + k, -4, 24, 3);
      TK.roundRect(ctx, 22 + k, -7.5, 8, 15, 3); outlineFill(ctx, color);
      TK.roundRect(ctx, 4 + k, -7, 6, 14, 2); outlineFill(ctx, shade(color, -30), 1.6);
  }
};

// Hero gear behind the body (we face +x, so "behind" is -x).
function heroBack(ctx, hero, color, t, by) {
  switch (hero) {
    case 'knight':
      ctx.beginPath(); ctx.ellipse(-13, -16 + by, 8, 11, -0.15, 0, Math.PI * 2); outlineFill(ctx, '#aeb8c4');
      ctx.beginPath(); ctx.ellipse(-13, -16 + by, 4, 6, -0.15, 0, Math.PI * 2); outlineFill(ctx, color, 1.4);
      break;
    case 'ninja': {
      const w = Math.sin(t * 6) * 3;
      ctx.beginPath();
      ctx.moveTo(-6, -25 + by);
      ctx.quadraticCurveTo(-16, -26 + w + by, -26, -20 + w * 1.6 + by);
      ctx.lineTo(-25, -15 + w * 1.6 + by);
      ctx.quadraticCurveTo(-15, -20 + w + by, -5, -20 + by);
      ctx.closePath();
      outlineFill(ctx, '#e0443e', 1.8);
      break;
    }
    case 'witch': {
      const w = Math.sin(t * 2.5) * 2;
      ctx.beginPath();
      ctx.moveTo(-9, -25 + by);
      ctx.quadraticCurveTo(-20 + w, -14 + by, -17 + w, -2);
      ctx.lineTo(-4, -2);
      ctx.closePath();
      outlineFill(ctx, '#4b2a7a');
      break;
    }
    case 'tinker':
      TK.roundRect(ctx, -20, -27 + by, 12, 17, 3); outlineFill(ctx, '#a5763f');
      ctx.strokeStyle = '#2b1a12'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(-15, -27 + by); ctx.lineTo(-18, -38 + by); ctx.stroke();
      ctx.fillStyle = Math.sin(t * 5) > 0 ? '#7bff6a' : '#2e7a2a';
      ctx.beginPath(); ctx.arc(-18, -39 + by, 2.2, 0, Math.PI * 2); ctx.fill();
      break;
  }
}

// Hero gear on top of the body.
function heroFront(ctx, hero, color, by) {
  switch (hero) {
    case 'rookie':
      ctx.fillStyle = '#ffe45c';
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const r = i % 2 ? 1.6 : 3.8;
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        ctx.lineTo(4 + Math.cos(a) * r, -18 + by + Math.sin(a) * r);
      }
      ctx.closePath(); ctx.fill();
      break;
    case 'knight':
      TK.roundRect(ctx, -9, -23 + by, 18, 13, 5); outlineFill(ctx, '#c9d1da', 1.8);
      ctx.fillStyle = color; ctx.fillRect(-1.5, -22 + by, 3, 11);
      ctx.beginPath(); ctx.ellipse(-8, -22 + by, 6, 4, 0, 0, Math.PI * 2); outlineFill(ctx, '#aeb8c4', 1.6);
      break;
    case 'ninja':
      ctx.fillStyle = 'rgba(30,25,40,0.55)';
      TK.roundRect(ctx, -11, -24 + by, 22, 20, 8); ctx.fill();
      ctx.fillStyle = color; ctx.fillRect(-11, -11 + by, 22, 4);
      break;
    case 'witch':
      ctx.beginPath(); ctx.arc(0, -22 + by, 3, 0, Math.PI * 2); outlineFill(ctx, '#ffd23f', 1.4);
      break;
    case 'brute':
      ctx.fillStyle = '#5a3a22'; ctx.fillRect(-11, -11 + by, 22, 5);
      ctx.beginPath(); ctx.arc(0, -8.5 + by, 3.5, 0, Math.PI * 2); outlineFill(ctx, '#ffd23f', 1.4);
      break;
    case 'tinker':
      ctx.fillStyle = '#7a5a3a'; ctx.fillRect(-11, -11 + by, 22, 4);
      ctx.fillStyle = '#c9d1da'; ctx.fillRect(-7, -13 + by, 3, 7);
      ctx.beginPath(); ctx.arc(-5.5, -14 + by, 2.5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#2b1a12'; ctx.lineWidth = 1.6; ctx.strokeRect(-11, -11 + by, 22, 4);
      break;
  }
}

// Things worn on the head under the hat.
function heroHead(ctx, hero, hy) {
  switch (hero) {
    case 'ninja':
      ctx.fillStyle = '#e0443e';
      ctx.fillRect(-16, hy - 7, 32, 5);
      ctx.strokeStyle = '#2b1a12'; ctx.lineWidth = 1.6; ctx.strokeRect(-16, hy - 7, 32, 5);
      ctx.fillStyle = '#c9d1da'; ctx.fillRect(4, hy - 6.5, 7, 4);
      break;
    case 'tinker':
      for (const x of [-4, 7]) { ctx.beginPath(); ctx.arc(x, hy - 9, 5, 0, Math.PI * 2); outlineFill(ctx, '#9fe3ff', 1.8); }
      ctx.fillStyle = '#5a3a22'; ctx.fillRect(-16, hy - 10, 7, 3); ctx.fillRect(12, hy - 10, 4, 3);
      break;
    case 'brute':
      ctx.strokeStyle = '#2b1a12'; ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-4, hy - 4); ctx.lineTo(3, hy - 2); ctx.moveTo(9, hy - 2); ctx.lineTo(15, hy - 4); ctx.stroke();
      ctx.lineCap = 'butt';
      ctx.fillStyle = 'rgba(80,50,30,0.25)';
      ctx.beginPath(); ctx.ellipse(5, hy + 9, 9, 4.5, 0, 0, Math.PI * 2); ctx.fill();
      break;
  }
}

// Draws a chibi character standing with feet at (0,0), facing +x.
// opts: { color, hair, hat, hero, weapon, angle (deg), mood, time, charging, recoil }
TK.Art.drawChibi = (ctx, o) => {
  const t = o.time || 0;
  const bob = Math.sin(t * 3.2 + (o.seed || 0)) * 1.2;
  const blink = ((t + (o.seed || 0)) % 3.6) < 0.12;
  const hero = o.hero || 'rookie';
  const sc = (TK.HEROES[hero] && TK.HEROES[hero].scale) || 1;
  const by = bob * 0.4;
  ctx.save();
  ctx.scale(sc, sc);

  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath(); ctx.ellipse(0, 1, 15, 4, 0, 0, Math.PI * 2); ctx.fill();

  heroBack(ctx, hero, o.color, t, by);

  // feet
  ctx.beginPath(); ctx.ellipse(-6, -3, 6, 4, 0, 0, Math.PI * 2); outlineFill(ctx, '#4a3328');
  ctx.beginPath(); ctx.ellipse(7, -3, 6, 4, 0, 0, Math.PI * 2); outlineFill(ctx, '#4a3328');

  // body
  const bw = hero === 'brute' ? 13 : 11;
  TK.roundRect(ctx, -bw, -24 + by, bw * 2, 20, 8);
  outlineFill(ctx, o.color);
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  TK.roundRect(ctx, -7, -21 + by, 6, 12, 3); ctx.fill();
  ctx.fillStyle = shade(o.color, -60);
  ctx.fillRect(-bw, -10 + by, bw * 2, 3);
  heroFront(ctx, hero, o.color, by);

  // weapon, rotated by aim angle around the shoulder
  ctx.save();
  ctx.translate(2, -16 + by);
  ctx.rotate(-TK.rad(o.angle || 0));
  const kick = o.recoil ? -o.recoil * 6 : 0;
  TK.Art.drawWeapon(ctx, o.weapon || 'bomb', o.color, kick, t);
  if (o.charging) {
    ctx.fillStyle = `rgba(255,${200 - o.charging * 120},60,${0.4 + 0.4 * Math.sin(t * 30)})`;
    ctx.beginPath(); ctx.arc(33 + kick, 0, 5 + o.charging * 5, 0, Math.PI * 2); ctx.fill();
  }
  ctx.beginPath(); ctx.arc(8 + kick, 6, 4, 0, Math.PI * 2); outlineFill(ctx, '#ffe0c4', 1.6);
  ctx.restore();

  // head
  const hy = -38 + bob;
  ctx.beginPath(); ctx.arc(0, hy, 16, 0, Math.PI * 2); outlineFill(ctx, '#ffe0c4');
  ctx.beginPath();
  ctx.arc(0, hy - 2, 16, Math.PI * 1.02, Math.PI * 1.98);
  ctx.quadraticCurveTo(10, hy - 4, 4, hy - 8);
  ctx.quadraticCurveTo(0, hy - 2, -6, hy - 7);
  ctx.quadraticCurveTo(-12, hy - 2, -16, hy - 2);
  ctx.closePath();
  outlineFill(ctx, o.hair || '#5a3418');
  if (hero === 'witch') {
    // long hair down the back
    ctx.beginPath(); ctx.ellipse(-12, hy + 6, 6, 12, 0.2, 0, Math.PI * 2); outlineFill(ctx, o.hair || '#5a3418');
  }

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

  heroHead(ctx, hero, hy);
  drawHat(ctx, o.hat, o.color, hy - 6);
  ctx.restore();
};

// Status overlays drawn over a character (feet at 0,0).
TK.Art.drawStatus = (ctx, c, t) => {
  if (c.frozen) {
    ctx.fillStyle = 'rgba(170,225,255,0.45)';
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 2;
    TK.roundRect(ctx, -22, -62, 44, 64, 8); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath(); ctx.moveTo(-16, -56); ctx.lineTo(-10, -56); ctx.lineTo(-18, -30); ctx.closePath(); ctx.fill();
  }
  if (c.poison > 0) {
    for (let i = 0; i < 3; i++) {
      const ph = (t * 0.8 + i / 3) % 1;
      ctx.globalAlpha = 1 - ph;
      ctx.fillStyle = '#8cff5a';
      ctx.beginPath(); ctx.arc(-10 + i * 10, -30 - ph * 40, 3 + i, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
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

// Projectile art per weapon.
TK.Art.drawBomb = (ctx, p, time) => {
  ctx.save();
  ctx.translate(p.x, p.y);
  const s = (p.super ? 1.45 : 1) * (p.mini ? 0.65 : 1);
  ctx.scale(s, s);
  if (p.super) {
    const g = ctx.createRadialGradient(0, 0, 4, 0, 0, 20);
    g.addColorStop(0, 'rgba(255,90,60,0.6)'); g.addColorStop(1, 'rgba(255,90,60,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 20, 0, Math.PI * 2); ctx.fill();
  }
  const heading = Math.atan2(p.vy || 0, p.vx || 1);
  if (p.teleport) {
    ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2);
    const g = ctx.createRadialGradient(0, 0, 1, 0, 0, 9);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.5, '#a98bff'); g.addColorStop(1, '#5b3cc4');
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = '#2b1a12'; ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();
    return;
  }
  switch (p.weapon) {
    case 'splitter':
      ctx.rotate(time * 8);
      ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); outlineFill(ctx, '#ff9f43');
      ctx.fillStyle = '#ffe45c';
      ctx.fillRect(-8, -1.5, 16, 3);
      break;
    case 'frost':
      ctx.rotate(time * 6);
      ctx.beginPath();
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; ctx.lineTo(Math.cos(a) * 9, Math.sin(a) * 9); }
      ctx.closePath(); outlineFill(ctx, '#9fe3ff');
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(6, 0); ctx.moveTo(-3, -5); ctx.lineTo(3, 5); ctx.moveTo(3, -5); ctx.lineTo(-3, 5); ctx.stroke();
      break;
    case 'toxic':
      ctx.rotate(time * 9);
      ctx.beginPath(); ctx.arc(0, 2, 7, 0, Math.PI * 2); outlineFill(ctx, '#7cff4f');
      TK.roundRect(ctx, -2.5, -9, 5, 6, 1); outlineFill(ctx, '#d9ffb3', 1.4);
      ctx.fillStyle = '#a5763f'; ctx.fillRect(-3, -11, 6, 3);
      break;
    case 'thunder': {
      const g = ctx.createRadialGradient(0, 0, 1, 0, 0, 14);
      g.addColorStop(0, '#ffffff'); g.addColorStop(0.35, '#fff07a'); g.addColorStop(1, 'rgba(255,220,60,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#fffbd0'; ctx.lineWidth = 1.5;
      const a = time * 20;
      ctx.beginPath(); ctx.moveTo(Math.cos(a) * 5, Math.sin(a) * 5); ctx.lineTo(Math.cos(a + 0.5) * 12, Math.sin(a + 0.5) * 12); ctx.stroke();
      break;
    }
    case 'drill':
      ctx.rotate(heading);
      ctx.fillStyle = p.ghost ? '#ffd23f' : '#ff8a3c';
      ctx.beginPath(); ctx.moveTo(-10, -3); ctx.lineTo(-17 - Math.random() * 5, 0); ctx.lineTo(-10, 3); ctx.closePath(); ctx.fill();
      TK.roundRect(ctx, -11, -5, 14, 10, 3); outlineFill(ctx, '#6f7d4a');
      ctx.beginPath(); ctx.moveTo(3, -5); ctx.lineTo(13, 0); ctx.lineTo(3, 5); ctx.closePath(); outlineFill(ctx, '#c9d1da');
      ctx.beginPath(); ctx.moveTo(-11, -5); ctx.lineTo(-14, -8); ctx.lineTo(-7, -5); ctx.closePath(); outlineFill(ctx, '#e0443e', 1.2);
      ctx.beginPath(); ctx.moveTo(-11, 5); ctx.lineTo(-14, 8); ctx.lineTo(-7, 5); ctx.closePath(); outlineFill(ctx, '#e0443e', 1.2);
      break;
    case 'bouncer':
      ctx.rotate(time * 12);
      ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); outlineFill(ctx, '#ff7ac8');
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(0, 0, 9, -0.4, 0.4); ctx.arc(0, 0, 9, Math.PI - 0.4, Math.PI + 0.4); ctx.fill();
      ctx.strokeStyle = '#2b1a12'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.stroke();
      break;
    case 'medic':
      ctx.rotate(heading);
      TK.roundRect(ctx, -10, -6, 20, 12, 6); outlineFill(ctx, '#ffffff');
      ctx.fillStyle = '#ff5a6e'; ctx.fillRect(-1.5, -4, 3, 8); ctx.fillRect(-4, -1.5, 8, 3);
      break;
    default:
      ctx.rotate(time * 10);
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

// Jagged lightning bolt.
TK.Art.drawBolt = (ctx, b) => {
  const k = b.t / b.life;
  ctx.globalAlpha = 1 - k;
  ctx.strokeStyle = '#fff7a0';
  ctx.shadowColor = '#ffe45c';
  ctx.shadowBlur = 16;
  for (const [w, col] of [[7, 'rgba(255,230,90,0.6)'], [3, '#ffffff']]) {
    ctx.lineWidth = w;
    ctx.strokeStyle = col;
    ctx.beginPath();
    ctx.moveTo(b.x1, b.y1);
    const n = 9;
    for (let i = 1; i < n; i++) {
      const f = i / n;
      ctx.lineTo(TK.lerp(b.x1, b.x2, f) + b.jit[i] * 18, TK.lerp(b.y1, b.y2, f) + b.jit[n + i] * 8);
    }
    ctx.lineTo(b.x2, b.y2);
    ctx.stroke();
  }
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
};
