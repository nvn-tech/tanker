// Core game: entities, fixed-step physics, turn order by delay, items, bots, camera, HUD.

TK.ITEMS = [
  { id: 'triple', key: '1', name: 'Triple Shot', desc: '3 bombs in a spread (60% dmg each)', cost: 45, delay: 40, excl: ['double', 'teleport'] },
  { id: 'double', key: '2', name: 'Double Shot', desc: 'Fire twice (75% dmg each)', cost: 65, delay: 70, excl: ['triple', 'teleport'] },
  { id: 'power', key: '3', name: 'Power Up', desc: '+50% damage', cost: 35, delay: 30, excl: ['teleport'] },
  { id: 'heal', key: '4', name: 'Heal', desc: 'Restore 30% HP now', cost: 50, delay: 30, instant: true },
  { id: 'teleport', key: '5', name: 'Teleport', desc: 'Fly to where the shot lands', cost: 40, delay: 40, excl: ['triple', 'double', 'power', 'super'] },
  { id: 'super', key: '6', name: 'Super Shot', desc: 'Needs full rage: huge blast, 2x dmg', cost: 0, delay: 50, rage: true, excl: ['teleport'] },
];

TK.TEAM_COLORS = ['#3fa7ff', '#ff5a5f'];
TK.BASE_DMG = 280;
TK.BLAST_R = 44;
TK.TURN_TIME = 20;
TK.MOVE_SPEED = 70;
TK.STAMINA_PER_PX = 0.5; // 100 stamina = 200px of walking per turn

// Advance one projectile by one fixed step. Shared by the real game and the bot's
// shot simulation so a bot with zero aim error lands exactly where it predicted.
TK.stepShot = (p, wind, terrain, chars, dt) => {
  p.vx += wind * (p.wm == null ? 1 : p.wm) * TK.WIND_ACC * dt;
  p.vy += TK.G * dt;
  const nx = p.x + p.vx * dt, ny = p.y + p.vy * dt;
  const n = Math.max(1, Math.ceil(Math.hypot(nx - p.x, ny - p.y) / 3));
  for (let i = 1; i <= n; i++) {
    const sx = p.x + ((nx - p.x) * i) / n;
    const sy = p.y + ((ny - p.y) * i) / n;
    if (sx < -400 || sx > terrain.w + 400 || sy > terrain.h + 150) return { out: true, x: sx, y: sy };
    if (!p.ghost && terrain.isSolid(sx, sy)) return { x: sx, y: sy, hit: null };
    for (const c of chars) {
      if (!c.alive) continue;
      if (c === p.owner && p.t < 0.35) continue;
      const dx = sx - c.x, dy = sy - (c.y - TK.BODY_OFFSET);
      if (dx * dx + dy * dy < TK.BODY_R * TK.BODY_R) return { x: sx, y: sy, hit: c };
    }
  }
  p.x = nx;
  p.y = ny;
  p.t += dt;
  if (p.t > 14) return { out: true, x: p.x, y: p.y };
  return null;
};

// Bounce a projectile off the terrain at its last free position. Uses the
// local solid-pixel gradient as the surface normal.
TK.bounceShot = (p, res, terrain) => {
  let nx = 0, ny = 0;
  for (let dy = -6; dy <= 6; dy += 2) {
    for (let dx = -6; dx <= 6; dx += 2) {
      if (terrain.isSolid(res.x + dx, res.y + dy)) { nx -= dx; ny -= dy; }
    }
  }
  const len = Math.hypot(nx, ny) || 1;
  nx /= len; ny /= len;
  if (nx === 0 && ny === 0) ny = -1;
  const dot = p.vx * nx + p.vy * ny;
  p.vx = (p.vx - 2 * dot * nx) * 0.62;
  p.vy = (p.vy - 2 * dot * ny) * 0.62;
  // p.x/p.y is still the last free position; nudge out along the normal
  p.x += nx * 2;
  p.y += ny * 2;
};

// Run a shot to its final resting point (with bounces), for bot aiming.
TK.simulateShot = (p, wind, terrain, chars) => {
  for (let i = 0; i < 2400; i++) {
    const r = TK.stepShot(p, wind, terrain, chars, TK.DT);
    if (!r) continue;
    if (!r.out && !r.hit && p.bounces > 0) { p.bounces--; TK.bounceShot(p, r, terrain); continue; }
    return r;
  }
  return { out: true, x: p.x, y: p.y };
};

TK.Game = class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.keys = new Set();
    this.hold = { up: 0, down: 0 };
    this.time = 0;
    this.acc = 0;
    this.state = 'menu'; // menu | play | paused | over
    this.particles = [];
    this.texts = [];
    this.rings = [];
    this.bolts = [];
    this.projectiles = [];
    this.chars = [];
    this.cam = { x: 0, y: 0, shake: 0, free: false };
    this.buttons = [];
    this.touch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    this.onGameOver = null;
    // online play: 'local' (offline), 'host' (runs the real game) or 'client' (mirrors the host)
    this.role = 'local';
    this.myId = null;
    this.net = null;
    this.outbox = [];
    this.sendT = 0;
    this.projSeq = 0;
    this.remoteMove = 0;
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.bindInput();
    this.makeBackdrop();
    this.last = performance.now();
    requestAnimationFrame((t) => this.loop(t));
    this.startBackgroundTicker();
  }

  // Browsers pause requestAnimationFrame in hidden tabs. A host must keep the
  // game running for everyone, so a tiny worker keeps ticking the simulation.
  startBackgroundTicker() {
    try {
      const src = 'setInterval(function(){postMessage(0)},50)';
      const w = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
      w.onmessage = () => {
        if (document.hidden && this.role === 'host') this.advance(performance.now(), 1.0);
      };
    } catch (e) { /* workers unavailable: the host just needs to keep the tab visible */ }
  }

  netSend(obj) {
    if (this.net) this.net.send(obj);
  }

  // Whether this browser controls character c right now.
  isMine(c) {
    if (!c || !c.human) return false;
    return this.role === 'local' ? true : c.pid === this.myId;
  }

  // ---------- setup ----------
  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.dpr = dpr;
    this.cssW = window.innerWidth;
    this.cssH = window.innerHeight;
    this.canvas.width = Math.floor(this.cssW * dpr);
    this.canvas.height = Math.floor(this.cssH * dpr);
    this.canvas.style.width = this.cssW + 'px';
    this.canvas.style.height = this.cssH + 'px';
    this.zoom = TK.clamp(Math.min(this.cssH / 640, this.cssW / 1000), 0.45, 1.6);
    this.ui = TK.clamp(Math.min(this.cssW / 1180, this.cssH / 640), 0.55, 1.25);
    this.miniDirty = true;
  }

  makeBackdrop() {
    const themes = Object.keys(TK.THEMES);
    const theme = TK.pick(themes);
    const seed = (Math.random() * 1e9) | 0;
    this.themeKey = theme;
    this.terrain = new TK.Terrain(TK.WORLD_W, TK.WORLD_H, theme, seed);
    this.sky = TK.Art.makeSky(TK.THEMES[theme], seed);
    this.chars = [];
    this.cam.x = TK.WORLD_W / 2 - this.viewW() / 2;
    this.cam.y = TK.WORLD_H * 0.45 - this.viewH() / 2;
    this.miniDirty = true;
  }

  viewW() { return this.cssW / this.zoom; }
  viewH() { return this.cssH / this.zoom; }

  start(cfg) {
    this.cfg = cfg;
    this.role = cfg.role || 'local';
    this.myId = cfg.myId == null ? null : cfg.myId;
    this.outbox = [];
    this.projSeq = 0;
    this.remoteMove = 0;
    this.sentFire = false;
    this.menuOpen = false;
    let theme = cfg.theme;
    const seed = cfg.seed != null ? cfg.seed : (Math.random() * 1e9) | 0;
    if (theme === 'random' || !TK.THEMES[theme]) {
      const keys = Object.keys(TK.THEMES);
      theme = keys[Math.floor(TK.mulberry32(seed + 7)() * keys.length)];
    }
    this.themeKey = theme;
    this.terrain = new TK.Terrain(TK.WORLD_W, TK.WORLD_H, theme, seed);
    this.sky = TK.Art.makeSky(TK.THEMES[theme], seed);
    this.particles = [];
    this.texts = [];
    this.rings = [];
    this.bolts = [];
    this.projectiles = [];
    this.miniDirty = true;

    const p = cfg.player;
    const botNames = ['Pip', 'Momo', 'Rusty', 'Juno', 'Biscuit', 'Nova', 'Taro', 'Ziggy'].sort(() => Math.random() - 0.5);
    const bot = (team) => ({
      name: 'Bot ' + botNames.pop(), team, human: false,
      color: TK.pick(TK.COLORS), hair: TK.pick(TK.HAIR), hat: TK.pick(TK.HATS),
      hero: TK.pick(TK.HERO_IDS), weapon: TK.pick(TK.WEAPON_IDS),
    });
    let roster;
    if (cfg.roster) {
      // online: roster comes from the server, identical for everyone
      roster = cfg.roster.map((r) => ({ ...r, human: !r.bot }));
    } else if (cfg.mode === 'hotseat') {
      roster = [
        { ...p, team: 0, human: true },
        { ...cfg.player2, team: 1, human: true },
      ];
    } else if (cfg.mode === '2v2') {
      roster = [{ ...p, team: 0, human: true }, bot(0), bot(1), bot(1)];
    } else {
      roster = [{ ...p, team: 0, human: true }, bot(1)];
    }

    const spots = this.terrain.spawnPoints(roster.length);
    const order = this.spawnOrder(roster, TK.mulberry32(seed + 13));
    this.chars = roster.map((r, i) => {
      const s = spots[order[i]];
      const hero = TK.HEROES[r.hero] ? r.hero : 'rookie';
      const weapon = TK.WEAPONS[r.weapon] ? r.weapon : 'bomb';
      const hp = TK.HEROES[hero].hp;
      return {
        id: i, pid: r.pid == null ? null : r.pid, name: r.name || 'Player', team: r.team, human: r.human,
        color: r.color, hair: r.hair, hat: r.hat, hero, weapon,
        x: s.x, y: s.y, vy: 0, grounded: false,
        facing: s.x < TK.WORLD_W / 2 ? 1 : -1, angle: 45,
        hp, maxHp: hp, alive: true, gone: false, frozen: false, poison: 0, poisonDmg: 0, poisonSrc: null,
        delay: Math.random() * 20, rage: 0, lastPower: null,
        mood: 'normal', moodT: 0, recoil: 0,
        stats: { dmg: 0, hits: 0, taken: 0 },
      };
    });
    this.state = 'play';
    this.phase = 'between';
    this.phaseT = 1.0;
    this.active = null;
    this.wind = 0;
    this.turnNo = 0;
    this.cam.free = false;
    const c0 = this.chars.find((c) => this.isMine(c)) || this.chars[0];
    this.cam.x = c0.x - this.viewW() / 2;
    this.cam.y = c0.y - this.viewH() / 2;
  }

  // Which spawn slot (left to right) each roster entry gets: teams alternate
  // across the map so nobody starts next to only allies.
  spawnOrder(roster, rng) {
    const byTeam = [[], []];
    roster.forEach((r, i) => byTeam[r.team === 1 ? 1 : 0].push(i));
    for (const t of byTeam) t.sort(() => rng() - 0.5);
    const first = rng() < 0.5 ? 0 : 1;
    const seq = [];
    while (byTeam[0].length || byTeam[1].length) {
      for (const t of [first, 1 - first]) if (byTeam[t].length) seq.push(byTeam[t].shift());
    }
    // 1v1 / 2v2 with even teams: interleaving gives L-R alternation. seq[slot] = roster index.
    const order = new Array(roster.length);
    seq.forEach((ri, slot) => { order[ri] = slot; });
    return order;
  }

  // ---------- input ----------
  bindInput() {
    const gameKeys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'KeyA', 'KeyD', 'KeyW', 'KeyS'];
    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
      TK.Sfx.unlock();
      if (gameKeys.includes(e.code) && this.state === 'play') e.preventDefault();
      if (e.code === 'Escape') { this.togglePause(); return; }
      if (e.code === 'KeyM') { TK.Sfx.toggleMute(); return; }
      if (this.state !== 'play') return;
      if (e.repeat && (e.code === 'Space')) return;
      this.keys.add(e.code);
      if (!e.repeat) this.pressed(e.code);
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      if (e.code === 'Space') this.release();
    });
    window.addEventListener('blur', () => { this.keys.clear(); });

    const c = this.canvas;
    let drag = null;
    c.addEventListener('pointerdown', (e) => {
      TK.Sfx.unlock();
      const pt = { x: e.clientX, y: e.clientY };
      const b = this.hitButton(pt);
      if (b) {
        e.preventDefault();
        b.down && b.down(pt);
        if (b.up) this.heldButton = { b, id: e.pointerId };
        return;
      }
      drag = { x: e.clientX, y: e.clientY, id: e.pointerId };
      c.setPointerCapture(e.pointerId);
    });
    c.addEventListener('pointermove', (e) => {
      this.mouse = { x: e.clientX, y: e.clientY };
      if (drag && drag.id === e.pointerId) {
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 2) this.cam.free = true;
        this.cam.x -= dx / this.zoom;
        this.cam.y -= dy / this.zoom;
        drag.x = e.clientX; drag.y = e.clientY;
      }
    });
    const end = (e) => {
      if (drag && drag.id === e.pointerId) drag = null;
      if (this.heldButton && this.heldButton.id === e.pointerId) {
        this.heldButton.b.up();
        this.heldButton = null;
      }
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
    c.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  hitButton(pt) {
    for (let i = this.buttons.length - 1; i >= 0; i--) {
      const b = this.buttons[i];
      if (pt.x >= b.x && pt.x <= b.x + b.w && pt.y >= b.y && pt.y <= b.y + b.h) return b;
    }
    return null;
  }

  humanTurn() {
    return this.state === 'play' && this.phase === 'aim' && this.isMine(this.active) &&
      !(this.role === 'client' && this.sentFire);
  }

  pressed(code) {
    if (!this.humanTurn() || this.menuOpen) return;
    const c = this.active;
    if (code === 'ArrowUp' || code === 'KeyW') { c.angle = TK.clamp(Math.round(c.angle) + 1, 0, 90); this.hold.up = 0; }
    if (code === 'ArrowDown' || code === 'KeyS') { c.angle = TK.clamp(Math.round(c.angle) - 1, 0, 90); this.hold.down = 0; }
    if (code === 'Space') this.startCharge();
    if (code === 'KeyP') this.passTurn();
    const item = TK.ITEMS.find((it) => 'Digit' + it.key === code || 'Numpad' + it.key === code);
    if (item) this.useItem(item.id);
  }

  startCharge() {
    if (!this.humanTurn() || this.charging) return;
    this.charging = true;
    this.power = 0;
    this.cam.free = false;
  }

  release() {
    if (this.charging && this.humanTurn()) this.fire();
  }

  passTurn() {
    if (this.phase !== 'aim' || this.charging) return;
    if (this.role === 'client') { this.netSend({ t: 'input', d: { k: 'pass' } }); this.sentFire = true; return; }
    this.endTurn();
  }

  togglePause() {
    // Online games can't be paused for everyone: just show/hide the menu.
    if (this.role !== 'local' && (this.state === 'play' || this.state === 'over')) {
      this.menuOpen = !this.menuOpen;
      this.keys.clear();
      this.onPause && this.onPause(this.menuOpen);
      return;
    }
    if (this.state === 'play') { this.state = 'paused'; TK.Sfx.stopCharge(); this.keys.clear(); this.onPause && this.onPause(true); }
    else if (this.state === 'paused') { this.state = 'play'; this.onPause && this.onPause(false); }
  }

  // ---------- items ----------
  canUse(id) {
    const it = TK.ITEMS.find((i) => i.id === id);
    if (!it || this.phase !== 'aim' || this.charging) return false;
    if (this.items[id]) return false;
    if (it.cost > this.energy) return false;
    if (it.rage && this.active.rage < 100) return false;
    if (it.excl && it.excl.some((x) => this.items[x])) return false;
    if (id === 'heal' && this.active.hp >= this.active.maxHp) return false;
    return true;
  }

  useItem(id) {
    if (!this.canUse(id)) {
      if (this.isMine(this.active)) TK.Sfx.play('deny');
      return false;
    }
    if (this.role === 'client') {
      this.netSend({ t: 'input', d: { k: 'item', id } });
      return true;
    }
    const it = TK.ITEMS.find((i) => i.id === id);
    this.items[id] = true;
    this.energy -= it.cost;
    const c = this.active;
    if (id === 'heal') {
      const amt = Math.min(c.maxHp - c.hp, Math.round(c.maxHp * 0.3));
      c.hp += amt;
      this.floatText(c.x, c.y - 70, '+' + amt, '#5dff7a', 26);
      this.burst(c.x, c.y - 25, ['#7dff9a', '#ffffff'], 16, 120, 'spark');
      this.sfx('heal');
    } else {
      if (id === 'super') c.rage = 0;
      this.floatText(c.x, c.y - 74, (id === 'super' ? TK.weaponOf(c).superName : it.name) + '!', '#ffe45c', 18);
      this.sfx('item');
    }
    return true;
  }

  // ---------- turns ----------
  nextTurn() {
    const alive = this.chars.filter((c) => c.alive);
    alive.sort((a, b) => a.delay - b.delay || a.id - b.id);
    const c = alive[0];
    // keep delays small
    const base = c.delay;
    for (const ch of this.chars) ch.delay -= base;
    // status effects resolve at the start of the victim's turn
    if (c.poison > 0) {
      c.poison--;
      this.floatText(c.x, c.y - 100, 'Poison', '#8cff5a', 16);
      this.burst(c.x, c.y - 25, ['#8cff5a', '#4fbf2a'], 10, 90, 'smoke');
      this.damage(c, c.poisonDmg, c.poisonSrc, false, true);
      if (!c.alive) { this.lastBoom = { x: c.x, y: c.y }; this.phase = 'between'; this.phaseT = 1.0; this.checkWin(); return; }
    }
    if (c.frozen) {
      c.frozen = false;
      c.freezeImmune = true;
      c.delay += 100 / TK.agiMult(c);
      this.floatText(c.x, c.y - 90, 'Frozen! Turn skipped', '#bfe9ff', 18);
      this.burst(c.x, c.y - 30, ['#ffffff', '#bfe9ff', '#6fd3ff'], 18, 180, 'debris');
      this.sfx('freeze');
      this.lastBoom = { x: c.x, y: c.y - 40 };
      this.phase = 'between';
      this.phaseT = 1.1;
      return;
    }
    const hero = TK.heroOf(c);
    this.active = c;
    this.turnNo++;
    const calm = Math.random() < 0.15;
    this.wind = calm ? 0 : Math.round(TK.rand(-5, 5) * 10) / 10;
    this.timer = TK.TURN_TIME;
    this.stamina = Math.round(100 * TK.agiMult(c) * (hero.move || 1));
    this.energy = hero.energy || 100;
    this.items = {};
    this.moved = 0;
    this.charging = false;
    this.power = 0;
    this.phase = 'aim';
    this.remoteMove = 0;
    this.onTurnStart();
    if (!c.human) this.startAI();
  }

  startAI() {
    this.ai = { stage: 'walk', t: 0.5 + Math.random() * 0.4, walk: (Math.random() - 0.5) * 80 };
  }

  // Per-viewer turn intro (banner, sound, camera). Runs on every client.
  onTurnStart() {
    const c = this.active;
    this.cam.free = false;
    this.sentFire = false;
    this.charging = false;
    this.power = 0;
    this.hold.up = this.hold.down = 0;
    let text;
    if (this.isMine(c)) text = this.cfg.mode === 'hotseat' ? c.name + "'s turn!" : 'Your turn!';
    else text = c.name + "'s turn";
    this.banner = { text, t: 0, mine: this.isMine(c) };
    this.lastTick = 99;
    TK.Sfx.play('turn');
  }

  endTurn() {
    TK.Sfx.stopCharge();
    this.charging = false;
    const c = this.active;
    if (c) {
      let add = 100 + this.moved * 0.15 + (this.firedWeapon ? TK.weaponOf(c).delay : 0);
      for (const it of TK.ITEMS) if (this.items[it.id]) add += it.delay;
      c.delay += add / TK.agiMult(c);
      c.freezeImmune = false;
    }
    this.firedWeapon = false;
    this.phase = 'between';
    this.phaseT = 0.6;
    this.checkWin();
  }

  checkWin() {
    const teams = new Set(this.chars.filter((c) => c.alive).map((c) => c.team));
    if (teams.size <= 1 && this.state === 'play') {
      const winner = teams.size ? [...teams][0] : -1;
      this.state = 'over';
      this.phase = 'over';
      TK.Sfx.stopCharge();
      this.emit(['o', winner, this.chars.map((c) => [c.stats.dmg, c.stats.hits, c.stats.taken, c.hp])]);
      this.sendSnapshot();
      this.finishGame(winner);
    }
  }

  finishGame(winner) {
    const mine = this.chars.filter((c) => this.isMine(c));
    const won = mine.some((c) => c.team === winner);
    TK.Sfx.play(won || this.cfg.mode === 'hotseat' ? 'win' : 'lose');
    setTimeout(() => this.onGameOver && this.onGameOver(winner, this.chars, this.cfg), 1400);
  }

  // Client: the host announced the end of the match.
  netGameOver(winner, stats) {
    if (this.state === 'over') return;
    stats.forEach((s, i) => {
      const c = this.chars[i];
      if (!c) return;
      c.stats = { dmg: s[0], hits: s[1], taken: s[2] };
      c.hp = s[3];
    });
    this.state = 'over';
    this.phase = 'over';
    TK.Sfx.stopCharge();
    this.finishGame(winner);
  }

  // ---------- firing ----------
  fire() {
    const c = this.active;
    TK.Sfx.stopCharge();
    this.charging = false;
    if (this.role === 'client') {
      // the host fires for us; send exactly what we aimed
      this.netSend({ t: 'input', d: { k: 'fire', a: c.angle, f: c.facing, p: this.power } });
      this.sentFire = true;
      this.shotPower = this.power;
      c.lastPower = this.power;
      return;
    }
    c.lastPower = this.power;
    this.shotPower = this.power;
    this.volleys = this.items.double ? 2 : 1;
    this.phase = 'flying';
    this.phaseT = 0;
    this.cam.free = false;
    this.launchVolley();
  }

  muzzle(c, angleDeg) {
    const a = TK.rad(c.facing === 1 ? angleDeg : 180 - angleDeg);
    const dx = Math.cos(a), dy = -Math.sin(a);
    return { x: c.x + c.facing * 2 + dx * 30, y: c.y - 16 + dy * 30, dx, dy };
  }

  makeShot(c, angleDeg, power) {
    const m = this.muzzle(c, angleDeg);
    const v = power * TK.POWER_K;
    const w = TK.weaponOf(c);
    return {
      x: m.x, y: m.y, vx: m.dx * v, vy: m.dy * v, owner: c, t: 0,
      weapon: c.weapon || 'bomb', wm: w.wind == null ? 1 : w.wind, bounces: w.bounce || 0,
    };
  }

  launchVolley() {
    const c = this.active;
    const w = TK.weaponOf(c);
    const offs = this.items.triple ? [-4, 0, 4] : [0];
    let mult = 1;
    if (this.items.triple) mult *= 0.6;
    if (this.items.double) mult *= 0.75;
    if (this.items.power) mult *= 1.5;
    const sup = !!this.items.super;
    for (const o of offs) {
      const p = this.makeShot(c, TK.clamp(c.angle + o, -10, 100), this.shotPower);
      p.mult = mult;
      p.super = sup;
      p.teleport = !!this.items.teleport;
      if (p.teleport) { p.weapon = 'bomb'; p.bounces = 0; p.wm = 1; }
      if (sup && w.bounce) p.bounces = 3;
      p.split = !p.teleport && w.split ? (sup ? 6 : w.split) : 0;
      p.drillLeft = !p.teleport && w.drill ? w.drill * (sup ? 2 : 1) : 0;
      p.trailT = 0;
      p.id = ++this.projSeq;
      this.projectiles.push(p);
    }
    this.volleys--;
    this.firedWeapon = true;
    c.recoil = 1;
    const m = this.muzzle(c, c.angle);
    this.burst(m.x, m.y, ['#fff3b0', '#ffb347', '#ffffff'], 8, 140, 'spark');
    this.sfx('shoot');
  }

  explode(p, res) {
    const owner = p.owner;
    if (p.teleport) {
      if (res.out) { this.floatText(owner.x, owner.y - 70, 'Lost in the sky!', '#d0c4ff', 18); return; }
      this.burst(owner.x, owner.y - 20, ['#b9a1ff', '#ffffff'], 18, 160, 'spark');
      let ty = res.y;
      let k = 0;
      while (this.terrain.isSolid(res.x, ty) && k++ < 200) ty--;
      owner.x = TK.clamp(res.x, 8, TK.WORLD_W - 8);
      owner.y = ty;
      owner.vy = 0;
      this.burst(owner.x, owner.y - 20, ['#b9a1ff', '#ffffff'], 24, 200, 'spark');
      this.ring(owner.x, owner.y - 20, 6, 50, 0.4, '#c7b5ff');
      this.sfx('teleport');
      return;
    }
    if (res.out) return;
    const id = p.weapon || 'bomb';
    const w = TK.WEAPONS[id] || TK.WEAPONS.bomb;
    const sup = p.super && !p.mini;
    const ownerHero = TK.heroOf(owner);
    const atkM = TK.atkMult(owner);
    let R = w.radius;
    let base = w.harm;
    if (sup) {
      if (id === 'bomb') { R *= 1.55; base *= 2; }
      else if (id === 'frost') { R *= 1.6; base *= 1.5; }
      else if (id === 'toxic') { R *= 1.4; }
      else if (id === 'thunder') { base *= 1.3; }
      else if (id === 'drill') { R *= 1.2; base *= 1.8; }
      else if (id === 'medic') { R *= 1.3; base *= 1.5; }
    }
    if (id === 'thunder') this.bolt(res.x + TK.rand(-60, 60), res.y - 700, res.x, res.y);
    this.carve(res.x, res.y, R * (w.crater || 1));
    const reach = R + TK.BODY_R;
    const hitSet = new Set();
    for (const c of this.chars) {
      if (!c.alive) continue;
      const d = TK.dist(res.x, res.y, c.x, c.y - TK.BODY_OFFSET);
      if (d > reach) continue;
      hitSet.add(c);
      const f = 1 - 0.65 * (d / reach);
      let dmg = base * p.mult * atkM * f * TK.rand(0.94, 1.06);
      const crit = res.hit === c;
      if (crit) dmg *= 1.2;
      if (w.heal && c.team === owner.team) { this.heal(c, Math.round(dmg * 0.5)); continue; }
      const lucky = Math.random() < TK.critChance(owner);
      if (lucky) dmg *= ownerHero.critMult || 1.5;
      this.damage(c, Math.round(dmg), owner, crit, false, lucky);
      if (c.alive && w.freeze) {
        // no freeze-lock: someone who just thawed gets to act before they can be frozen again
        if (c.freezeImmune || TK.heroOf(c).noFreeze) this.floatText(c.x, c.y - 112, 'Freeze immune', '#bfe9ff', 16);
        else { c.frozen = true; this.floatText(c.x, c.y - 112, 'Frozen!', '#bfe9ff', 20); }
      }
      if (c.alive && w.poison) {
        c.poison = w.poisonTurns;
        c.poisonDmg = Math.round(w.poison * (sup ? 2 : 1) * atkM);
        c.poisonSrc = owner;
      }
      c.vy = Math.min(c.vy, -140);
      c.grounded = false;
    }
    if (sup && id === 'thunder') {
      // lightning jumps to up to 2 more enemies
      let from = { x: res.x, y: res.y };
      const targets = this.chars
        .filter((c) => c.alive && c.team !== owner.team && !hitSet.has(c))
        .sort((a, b) => TK.dist(res.x, res.y, a.x, a.y) - TK.dist(res.x, res.y, b.x, b.y))
        .slice(0, 2);
      for (const c of targets) {
        if (TK.dist(from.x, from.y, c.x, c.y) > 700) break;
        this.bolt(from.x, from.y, c.x, c.y - TK.BODY_OFFSET);
        this.damage(c, Math.round(base * 0.6 * p.mult * atkM), owner, false);
        from = { x: c.x, y: c.y - TK.BODY_OFFSET };
      }
    }
    if (sup && id === 'medic') {
      for (const c of this.chars) if (c.alive && c.team === owner.team) this.heal(c, Math.round(c.maxHp * 0.25));
    }
    this.boomFx(res.x, res.y, R, id, sup);
  }

  boomFx(x, y, R, id, sup) {
    const t = this.terrain.theme;
    const pal = {
      frost: ['#ffffff', '#bfe9ff', '#6fd3ff', '#9fe3ff'],
      toxic: ['#d9ffb3', '#8cff5a', '#4fbf2a', '#2e7a2a'],
      thunder: ['#ffffff', '#fff7a0', '#ffe45c', '#9fe3ff'],
      medic: ['#ffffff', '#ffd0dc', '#ff8fa8', '#7dff9a'],
    }[id] || ['#fff3b0', '#ffd23f', '#ff8a3c', '#ff5a3c'];
    const big = sup || R > 60;
    this.burst(x, y, pal, big ? 34 : 22, big ? 320 : 240, 'fire');
    this.burst(x, y, id === 'toxic' ? ['#6fbf4a', '#8cff5a', '#3d7a2a'] : ['#7d6d63', '#9a8c82', '#5e524b'], id === 'toxic' ? 22 : 12, 80, 'smoke');
    this.burst(x, y, [t.dirt, t.top, t.rim], 18, 300, 'debris');
    this.ring(x, y, 8, R * 1.4, 0.35, id === 'frost' ? '#bfe9ff' : id === 'toxic' ? '#b6ff8a' : '#fff7c0');
    this.shake(big ? 16 : 9);
    const snd = { frost: 'freeze', toxic: 'poison', thunder: 'zap' }[id];
    this.sfx(snd || (big ? 'bigboom' : 'boom'));
    if (snd && id !== 'thunder') this.sfx('boom');
  }

  heal(c, amt) {
    amt = Math.min(c.maxHp - c.hp, Math.max(0, amt));
    if (amt <= 0 || !c.alive) return;
    c.hp += amt;
    this.floatText(c.x + TK.rand(-8, 8), c.y - 70, '+' + amt, '#5dff7a', 26);
    this.burst(c.x, c.y - 25, ['#7dff9a', '#ffffff'], 10, 100, 'spark');
  }

  damage(c, dmg, src, crit, poison, lucky) {
    const vh = TK.heroOf(c);
    dmg = Math.max(1, Math.round(dmg * TK.defMult(c, src)));
    c.hp = Math.max(0, c.hp - dmg);
    c.mood = 'hurt';
    c.moodT = 1.0;
    c.stats.taken += dmg;
    c.rage = Math.min(100, c.rage + (dmg / 8) * (vh.rage || 1));
    if (src && src !== c) {
      src.stats.dmg += dmg;
      if (!poison) src.stats.hits++;
      src.rage = Math.min(100, src.rage + (dmg / 16) * (TK.heroOf(src).rage || 1));
      if (src.team !== c.team) { src.mood = 'happy'; src.moodT = 1.2; }
    }
    const col = poison ? '#8cff5a' : lucky ? '#d9a8ff' : crit ? '#ffdd33' : '#ff4a4a';
    this.floatText(c.x + TK.rand(-8, 8), c.y - 62, '-' + dmg, col, crit || lucky ? 34 : 28);
    if (lucky) this.floatText(c.x, c.y - 92, crit ? 'DIRECT CRITICAL!' : 'CRITICAL!', '#d9a8ff', 18);
    else if (crit) this.floatText(c.x, c.y - 92, 'DIRECT HIT!', '#ffdd33', 18);
    this.sfx('hit');
    if (c.hp <= 0) this.kill(c, 'KO!');
  }

  kill(c, msg) {
    if (!c.alive) return;
    c.alive = false;
    c.hp = 0;
    c.frozen = false;
    c.poison = 0;
    this.floatText(c.x, c.y - 90, msg, '#ffffff', 26);
    this.burst(c.x, c.y - 20, ['#ffffff', '#dddddd'], 20, 160, 'smoke');
  }

  // ---------- effects ----------
  // Visual/audio effects. When hosting an online game each one is also queued
  // as an event so the other players replay it on their screens.
  emit(ev) {
    if (this.role === 'host') this.outbox.push(ev);
  }

  sfx(name) {
    TK.Sfx.play(name);
    this.emit(['s', name]);
  }

  ring(x, y, r, max, life, color) {
    this.rings.push({ x, y, r, max, life, t: 0, color });
    this.emit(['r', Math.round(x), Math.round(y), r, Math.round(max), life, color]);
  }

  shake(amount) {
    this.cam.shake = Math.min(18, this.cam.shake + amount);
    this.emit(['k', amount]);
  }

  carve(x, y, r) {
    this.terrain.carve(x, y, r);
    this.miniDirty = true;
    this.emit(['c', Math.round(x * 10) / 10, Math.round(y * 10) / 10, r]);
  }

  burst(x, y, colors, n, speed, type) {
    this.emit(['b', Math.round(x), Math.round(y), colors, n, speed, type]);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.3 + Math.random() * 0.7);
      this.particles.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - (type === 'debris' ? 120 : 0),
        life: 0, max: type === 'smoke' ? 1.2 + Math.random() : type === 'fire' ? 0.35 + Math.random() * 0.3 : 0.6 + Math.random() * 0.6,
        color: TK.pick(colors), size: type === 'smoke' ? 10 + Math.random() * 12 : type === 'fire' ? 8 + Math.random() * 10 : 2 + Math.random() * 3.5,
        type,
      });
    }
    if (this.particles.length > 900) this.particles.splice(0, this.particles.length - 900);
  }

  floatText(x, y, text, color, size) {
    this.texts.push({ x, y, text, color, size, t: 0, vy: -60 });
    this.emit(['t', Math.round(x), Math.round(y), text, color, size]);
  }

  // Replay an effect event received from the host.
  applyEvent(e) {
    switch (e[0]) {
      case 's': TK.Sfx.play(e[1]); break;
      case 'r': this.ring(e[1], e[2], e[3], e[4], e[5], e[6]); break;
      case 'k': this.shake(e[1]); break;
      case 'c': this.carve(e[1], e[2], e[3]); break;
      case 'b': this.burst(e[1], e[2], e[3], e[4], e[5], e[6]); break;
      case 't': this.floatText(e[1], e[2], e[3], e[4], e[5]); break;
      case 'o': this.netGameOver(e[1], e[2]); break;
      case 'z': this.bolt(e[1], e[2], e[3], e[4]); break;
    }
  }

  // ---------- simulation step ----------
  loop(ts) {
    const dt = this.advance(ts, 0.05);
    this.updateCamera(dt);
    this.render();
    requestAnimationFrame((t) => this.loop(t));
  }

  advance(now, maxDt) {
    const dt = Math.max(0, Math.min(maxDt, (now - this.last) / 1000));
    this.last = now;
    if (this.state !== 'paused') {
      this.acc += dt;
      const cap = Math.ceil(maxDt / TK.DT) + 2;
      let steps = 0;
      while (this.acc >= TK.DT && steps < cap) {
        this.step(TK.DT);
        this.acc -= TK.DT;
        steps++;
      }
      if (steps >= cap) this.acc = 0;
    }
    if (this.role === 'host' && (this.state === 'play' || this.state === 'over')) {
      this.sendT += dt;
      if (this.sendT >= 0.05 || this.outbox.length > 40) { this.sendT = 0; this.sendSnapshot(); }
    }
    return dt;
  }

  step(dt) {
    this.time += dt;
    for (const p of this.particles) {
      p.life += dt;
      if (p.type === 'smoke') { p.vx *= 0.96; p.vy = p.vy * 0.96 - 20 * dt; p.vx += this.wind * 4 * dt; }
      else if (p.type === 'fire') { p.vx *= 0.9; p.vy *= 0.9; }
      else if (p.type === 'trail') { p.vy -= 10 * dt; }
      else p.vy += TK.G * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    this.particles = this.particles.filter((p) => p.life < p.max);
    for (const t of this.texts) { t.t += dt; t.y += t.vy * dt; t.vy *= 0.95; }
    this.texts = this.texts.filter((t) => t.t < 1.4);
    for (const r of this.rings) r.t += dt;
    this.rings = this.rings.filter((r) => r.t < r.life);
    for (const b of this.bolts) b.t += dt;
    this.bolts = this.bolts.filter((b) => b.t < b.life);
    if (this.banner) this.banner.t += dt;

    if (this.state !== 'play' && this.state !== 'over') return;
    if (this.role === 'client') { this.clientStep(dt); return; }
    for (const c of this.chars) {
      this.updateBody(c, dt);
      if (c.moodT > 0) { c.moodT -= dt; if (c.moodT <= 0) c.mood = 'normal'; }
      if (c.recoil > 0) c.recoil = Math.max(0, c.recoil - dt * 4);
    }
    if (this.state !== 'play') return;

    switch (this.phase) {
      case 'between':
        this.phaseT -= dt;
        if (this.phaseT <= 0 && this.allSettled()) this.nextTurn();
        break;
      case 'aim':
        this.stepAim(dt);
        break;
      case 'flying':
        this.stepFlying(dt);
        break;
      case 'settle':
        this.phaseT -= dt;
        if (this.phaseT <= 0 && this.allSettled()) this.endTurn();
        break;
    }
  }

  allSettled() {
    return this.chars.every((c) => c.gone || c.grounded);
  }

  updateBody(c, dt) {
    if (c.gone) return;
    const T = this.terrain;
    const solidBelow = (y) => T.isSolid(c.x, y) || T.isSolid(c.x - 5, y) || T.isSolid(c.x + 5, y);
    if (c.vy >= 0 && solidBelow(c.y + 1)) {
      c.vy = 0;
      let k = 0;
      while (T.isSolid(c.x, c.y) && k++ < 40) c.y--;
      c.grounded = true;
      return;
    }
    c.grounded = false;
    c.vy = Math.min(c.vy + TK.G * dt, 900);
    const ny = c.y + c.vy * dt;
    if (c.vy > 0) {
      for (let y = c.y; y <= ny; y++) {
        if (solidBelow(y + 1)) { c.y = y; c.vy = 0; c.grounded = true; return; }
      }
    }
    c.y = ny;
    if (c.y > T.h + 60) {
      if (c.alive) {
        this.floatText(c.x, T.h - 40, c.name + ' fell!', '#ffffff', 22);
        this.kill(c, 'Bye!');
        this.sfx('lose');
      }
      c.gone = true;
      c.grounded = true;
    }
  }

  walk(c, dir, dt) {
    if (dir !== c.facing) { c.facing = dir; }
    if (this.stamina <= 0 || !c.grounded) return;
    const T = this.terrain;
    const nx = TK.clamp(c.x + dir * TK.MOVE_SPEED * dt, 8, TK.WORLD_W - 8);
    let ny = null;
    for (let up = 0; up <= 7; up++) {
      if (!T.isSolid(nx, c.y - up)) { ny = c.y - up; break; }
    }
    if (ny === null || T.isSolid(nx, ny - 34)) return; // wall or low ceiling
    // follow the slope down
    for (let d = 1; d <= 7; d++) {
      if (T.isSolid(nx, ny + d)) { ny = ny + d - 1; break; }
    }
    const dx = Math.abs(nx - c.x);
    c.x = nx;
    c.y = ny;
    this.moved += dx;
    this.stamina = Math.max(0, this.stamina - dx * TK.STAMINA_PER_PX);
  }

  stepAim(dt) {
    const c = this.active;
    if (!c.alive) { this.endTurn(); return; }
    this.timer -= dt;
    this.tickSound();
    if (this.timer <= 0) {
      if (this.charging) this.fire();
      else { this.floatText(c.x, c.y - 80, 'Time up!', '#ffffff', 20); this.endTurn(); }
      return;
    }
    const remote = c.human && !this.isMine(c); // another player's character, on the host
    if (this.isMine(c)) {
      const dir = this.localControls(c, dt);
      if (dir) this.walk(c, dir, dt);
    } else if (remote) {
      if (this.remoteMove && !this.charging) this.walk(c, this.remoteMove, dt);
    } else {
      this.stepAI(dt);
    }
    if (this.charging && !remote) this.chargeStep(dt);
  }

  tickSound() {
    const sec = Math.ceil(this.timer);
    if (sec <= 5 && sec !== this.lastTick && sec > 0) {
      this.lastTick = sec;
      if (this.isMine(this.active)) TK.Sfx.play('tick');
    }
  }

  chargeStep(dt) {
    this.power = Math.min(100, this.power + 56 * dt);
    if (this.isMine(this.active)) TK.Sfx.charge(this.power);
    if (this.power >= 100) this.fire();
  }

  // Keyboard/touch: angle repeat while held; returns the walk direction.
  localControls(c, dt) {
    if (this.menuOpen) return 0;
    const k = this.keys;
    for (const [dir, codes, key] of [[1, ['ArrowUp', 'KeyW'], 'up'], [-1, ['ArrowDown', 'KeyS'], 'down']]) {
      if (codes.some((cd) => k.has(cd))) {
        this.hold[key] += dt;
        if (this.hold[key] > 0.3) {
          this.hold[key + 'Acc'] = (this.hold[key + 'Acc'] || 0) + 28 * dt;
          while (this.hold[key + 'Acc'] >= 1) { this.hold[key + 'Acc'] -= 1; c.angle = TK.clamp(Math.round(c.angle) + dir, 0, 90); }
        }
      } else this.hold[key] = 0;
    }
    if (this.charging) return 0;
    const left = k.has('ArrowLeft') || k.has('KeyA');
    const right = k.has('ArrowRight') || k.has('KeyD');
    return left && !right ? -1 : right && !left ? 1 : 0;
  }

  // ---------- online: host side ----------
  sendSnapshot() {
    const r1 = (v) => Math.round(v * 10) / 10;
    const msg = {
      t: 'state',
      ph: this.phase, a: this.active ? this.active.id : -1, tn: this.turnNo,
      tm: r1(this.timer || 0), w: this.wind, st: Math.round(this.stamina || 0), en: this.energy || 0,
      it: this.items || {}, ch: this.charging ? 1 : 0, pw: r1(this.power || 0), sp: r1(this.shotPower || 0),
      lb: this.lastBoom ? [Math.round(this.lastBoom.x), Math.round(this.lastBoom.y)] : null,
      c: this.chars.map((c) => [
        r1(c.x), r1(c.y), c.facing, r1(c.angle), c.hp,
        (c.alive ? 1 : 0) | (c.gone ? 2 : 0) | (c.grounded ? 4 : 0) | (c.human ? 8 : 0) | (c.frozen ? 16 : 0),
        Math.round(c.rage), Math.round(c.delay), c.mood, c.lastPower == null ? -1 : r1(c.lastPower), r1(c.recoil), c.poison || 0,
      ]),
      p: this.projectiles.map((p) => [p.id, r1(p.x), r1(p.y), r1(p.vx), r1(p.vy),
        (p.super ? 1 : 0) | (p.teleport ? 2 : 0) | (p.mini ? 4 : 0) | (p.ghost ? 8 : 0) | (Math.max(0, TK.WEAPON_IDS.indexOf(p.weapon)) << 4), p.wm == null ? 1 : p.wm]),
      ev: this.outbox,
    };
    this.outbox = [];
    this.netSend(msg);
  }

  // An input message from another player, relayed by the server.
  netInput(from, d) {
    if (this.role !== 'host' || !d) return;
    const c = this.active;
    if (this.state !== 'play' || this.phase !== 'aim' || !c || !c.human || c.pid !== from) return;
    const num = (v, a, b, def) => (typeof v === 'number' && isFinite(v) ? TK.clamp(v, a, b) : def);
    switch (d.k) {
      case 'move':
        this.remoteMove = d.dir === -1 ? -1 : d.dir === 1 ? 1 : 0;
        break;
      case 'aim':
        c.angle = num(d.a, 0, 90, c.angle);
        c.facing = d.f === -1 ? -1 : 1;
        this.charging = !!d.ch;
        this.power = num(d.pw, 0, 100, 0);
        break;
      case 'item':
        if (typeof d.id === 'string') this.useItem(d.id);
        break;
      case 'fire':
        c.angle = num(d.a, 0, 90, c.angle);
        c.facing = d.f === -1 ? -1 : 1;
        this.power = num(d.p, 0, 100, 50);
        this.remoteMove = 0;
        this.fire();
        break;
      case 'pass':
        this.passTurn();
        break;
    }
  }

  // A player disconnected: a bot takes over their character.
  netLeft(pid, name) {
    for (const c of this.chars) {
      if (c.pid !== pid || !c.human) continue;
      c.human = false;
      if (this.role === 'host') {
        this.floatText(c.x, c.y - 90, (name || c.name) + ' left (bot plays)', '#ffffff', 16);
        if (c === this.active && this.phase === 'aim') { this.charging = false; this.startAI(); }
      }
    }
  }

  // ---------- online: client side ----------
  netState(m) {
    if (this.role !== 'client' || !m || !Array.isArray(m.c)) return;
    this.phase = m.ph;
    this.active = this.chars[m.a] || null;
    if (m.tn !== this.turnNo) {
      this.turnNo = m.tn;
      if (this.active && m.ph === 'aim') this.onTurnStart();
      this.sentMove = 0;
    }
    if (Math.abs((this.timer || 0) - m.tm) > 0.25) this.timer = m.tm;
    this.wind = m.w;
    this.stamina = m.st;
    this.energy = m.en;
    this.items = m.it || {};
    this.lastBoom = m.lb ? { x: m.lb[0], y: m.lb[1] } : null;
    const myAim = this.phase === 'aim' && this.isMine(this.active);
    if (!myAim) { this.charging = !!m.ch; this.power = m.pw; this.shotPower = m.sp; }
    m.c.forEach((a, i) => {
      const c = this.chars[i];
      if (!c) return;
      if (c.tx == null || Math.hypot(a[0] - c.x, a[1] - c.y) > 250) { c.x = a[0]; c.y = a[1]; }
      c.tx = a[0];
      c.ty = a[1];
      if (!(myAim && c === this.active)) {
        c.facing = a[2];
        c.angle = a[3];
        if (a[9] >= 0) c.lastPower = a[9];
      }
      c.hp = a[4];
      c.alive = !!(a[5] & 1);
      c.gone = !!(a[5] & 2);
      c.grounded = !!(a[5] & 4);
      c.human = !!(a[5] & 8);
      c.frozen = !!(a[5] & 16);
      c.poison = a[11] || 0;
      c.rage = a[6];
      c.delay = a[7];
      c.mood = a[8];
      if (a[10] > c.recoil) c.recoil = a[10];
    });
    const seen = new Set();
    for (const q of m.p || []) {
      seen.add(q[0]);
      let p = this.projectiles.find((x) => x.id === q[0]);
      if (!p) { p = { id: q[0], t: 0, trailT: 0 }; this.projectiles.push(p); }
      p.x = q[1]; p.y = q[2]; p.vx = q[3]; p.vy = q[4];
      p.super = !!(q[5] & 1);
      p.teleport = !!(q[5] & 2);
      p.mini = !!(q[5] & 4);
      p.ghost = !!(q[5] & 8);
      p.weapon = TK.WEAPON_IDS[q[5] >> 4] || 'bomb';
      p.wm = q[6] == null ? 1 : q[6];
    }
    this.projectiles = this.projectiles.filter((p) => seen.has(p.id));
    for (const e of m.ev || []) this.applyEvent(e);
  }

  // Client: smooth movement between host snapshots + our own aiming.
  clientStep(dt) {
    for (const c of this.chars) {
      if (c.tx != null) {
        const k = Math.min(1, dt * 14);
        c.x += (c.tx - c.x) * k;
        c.y += (c.ty - c.y) * k;
      }
      if (c.recoil > 0) c.recoil = Math.max(0, c.recoil - dt * 4);
    }
    for (const p of this.projectiles) {
      p.vx += (this.wind || 0) * (p.wm == null ? 1 : p.wm) * TK.WIND_ACC * dt;
      p.vy += TK.G * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.trailT += dt;
      if (p.trailT > 0.03) {
        p.trailT = 0;
        this.particles.push({ x: p.x, y: p.y, vx: 0, vy: 0, life: 0, max: 0.6, color: p.teleport ? '#c7b5ff' : p.super ? '#ffb0a0' : '#ffffff', size: p.super ? 7 : 5, type: 'trail' });
      }
    }
    if (this.state !== 'play' || this.phase !== 'aim' || !this.active) return;
    this.timer = Math.max(0, this.timer - dt);
    this.tickSound();
    const c = this.active;
    if (!this.isMine(c) || this.sentFire) return;
    const dir = this.localControls(c, dt);
    if (dir) c.facing = dir;
    if (dir !== (this.sentMove || 0)) {
      this.sentMove = dir;
      this.netSend({ t: 'input', d: { k: 'move', dir } });
    }
    if (this.charging) this.chargeStep(dt);
    // stream our aim so everyone sees the cannon and power bar move
    this.aimT = (this.aimT || 0) + dt;
    const sig = `${Math.round(c.angle)}|${c.facing}|${this.charging ? 1 : 0}|${Math.round(this.power)}`;
    if (this.aimT > 0.07 && sig !== this.aimSig && !this.sentFire) {
      this.aimT = 0;
      this.aimSig = sig;
      this.netSend({ t: 'input', d: { k: 'aim', a: Math.round(c.angle), f: c.facing, ch: this.charging ? 1 : 0, pw: Math.round(this.power * 10) / 10 } });
    }
  }

  stepFlying(dt) {
    const spawned = [];
    for (const p of this.projectiles) {
      if (p.dead) continue;
      let res = TK.stepShot(p, this.wind, this.terrain, this.chars, dt);
      p.trailT += dt;
      if (p.trailT > 0.03) {
        p.trailT = 0;
        const col = p.teleport ? '#c7b5ff' : p.super ? '#ffb0a0' : { frost: '#dff4ff', toxic: '#b6ff8a', thunder: '#fff7a0', medic: '#ffd0dc' }[p.weapon] || '#ffffff';
        this.particles.push({ x: p.x, y: p.y, vx: 0, vy: 0, life: 0, max: 0.6, color: col, size: p.super ? 7 : p.mini ? 3.5 : 5, type: 'trail' });
      }
      // Splitter: burst into bomblets once it starts falling
      if (!res && p.split && p.vy > 0) {
        p.dead = true;
        const n = p.split;
        for (let i = 0; i < n; i++) {
          const off = (i - (n - 1) / 2) * (n > 3 ? 38 : 50);
          spawned.push({
            x: p.x, y: p.y, vx: p.vx + off, vy: p.vy - Math.abs(off) * 0.2, owner: p.owner, t: 1, weapon: 'splitter',
            wm: 1, bounces: 0, mult: p.mult, mini: true, super: false, trailT: 0, id: ++this.projSeq,
          });
        }
        this.burst(p.x, p.y, ['#ffe45c', '#ff9f43', '#ffffff'], 14, 160, 'spark');
        this.sfx('split');
        continue;
      }
      // Drill: tunnel through the ground, then blow up
      if (p.ghost) {
        const d = Math.hypot(p.vx, p.vy) * dt;
        p.vx *= 0.985; p.vy *= 0.985;
        p.drillLeft -= d;
        p.carveAcc = (p.carveAcc || 0) + d;
        if (p.carveAcc >= 9) { p.carveAcc = 0; this.carve(p.x, p.y, 11); }
        if (!res && p.drillLeft <= 0) res = { x: p.x, y: p.y, hit: null };
      } else if (res && !res.out && !res.hit && p.drillLeft > 0) {
        p.ghost = true;
        this.sfx('drill');
        this.burst(res.x, res.y, [this.terrain.theme.dirt, this.terrain.theme.top], 10, 160, 'debris');
        continue;
      }
      // Bouncer: rebound off terrain (Pinball super explodes on every bounce)
      if (res && !res.out && !res.hit && p.bounces > 0) {
        if (p.super) this.explode(p, res);
        p.bounces--;
        TK.bounceShot(p, res, this.terrain);
        this.sfx('bounce');
        this.burst(res.x, res.y, ['#ff7ac8', '#ffffff'], 8, 120, 'spark');
        continue;
      }
      if (res) { p.dead = true; this.explode(p, res); this.lastBoom = { x: res.x, y: res.y }; }
    }
    this.projectiles = this.projectiles.filter((p) => !p.dead).concat(spawned);
    if (this.projectiles.length === 0) {
      this.phaseT += dt;
      if (this.volleys > 0 && this.active.alive && this.phaseT > 0.5) {
        this.phaseT = 0;
        this.launchVolley();
      } else if (this.volleys <= 0 || !this.active.alive) {
        this.phase = 'settle';
        this.phaseT = 0.7;
      }
    }
  }

  bolt(x1, y1, x2, y2) {
    const jit = [];
    for (let i = 0; i < 20; i++) jit.push(Math.random() * 2 - 1);
    jit[0] = jit[9] = jit[10] = jit[19] = 0;
    this.bolts.push({ x1, y1, x2, y2, jit, t: 0, life: 0.4 });
    this.emit(['z', Math.round(x1), Math.round(y1), Math.round(x2), Math.round(y2)]);
  }

  // ---------- bot ----------
  stepAI(dt) {
    const ai = this.ai;
    const c = this.active;
    ai.t -= dt;
    switch (ai.stage) {
      case 'walk': {
        if (Math.abs(ai.walk) > 4 && this.stamina > 0) {
          const before = c.x;
          this.walk(c, Math.sign(ai.walk), dt);
          const moved = Math.abs(c.x - before);
          ai.walk -= Math.sign(ai.walk) * Math.max(moved, 0.5);
        } else ai.walk = 0;
        if (ai.t <= 0 && ai.walk === 0) { ai.stage = 'think'; ai.t = 0.4; }
        if (ai.t < -2) ai.walk = 0;
        break;
      }
      case 'think':
        if (ai.t <= 0 && c.grounded) {
          ai.plan = this.aiPlan(c);
          ai.items = this.aiItems(c, ai.plan);
          ai.stage = 'items';
          ai.t = 0.35;
          c.facing = ai.plan.facing;
        }
        break;
      case 'items':
        if (ai.t <= 0) {
          if (ai.items.length) { this.useItem(ai.items.shift()); ai.t = 0.4; }
          else ai.stage = 'aim';
        }
        break;
      case 'aim': {
        const diff = ai.plan.angle - c.angle;
        if (Math.abs(diff) < 1) {
          c.angle = ai.plan.angle;
          ai.stage = 'charge';
          this.charging = true;
          this.power = 0;
        } else c.angle += Math.sign(diff) * Math.min(Math.abs(diff), 50 * dt);
        break;
      }
      case 'charge':
        if (this.power >= ai.plan.power) { this.power = ai.plan.power; this.fire(); }
        break;
    }
  }

  simulate(c, facing, angle, power) {
    const saveF = c.facing;
    c.facing = facing;
    const p = this.makeShot(c, angle, power);
    c.facing = saveF;
    return TK.simulateShot(p, this.wind, this.terrain, this.chars);
  }

  scoreShot(c, target, r) {
    if (r.out) return 1e6;
    let s = r.hit === target ? 0 : TK.dist(r.x, r.y, target.x, target.y - TK.BODY_OFFSET);
    const w = TK.weaponOf(c);
    if (w.heal) return s; // medic blasts heal allies, no need to avoid them
    for (const o of this.chars) {
      if (!o.alive || o.team !== c.team) continue;
      const d = TK.dist(r.x, r.y, o.x, o.y - TK.BODY_OFFSET);
      if (d < w.radius + 40) s += o === c ? 3000 : 1500;
    }
    return s;
  }

  aiPlan(c) {
    const enemies = this.chars.filter((o) => o.alive && o.team !== c.team);
    // prefer weak / close targets
    enemies.sort((a, b) => (a.hp + Math.abs(a.x - c.x) * 0.8) - (b.hp + Math.abs(b.x - c.x) * 0.8));
    const targets = enemies.slice(0, 2);
    let best = { score: Infinity, facing: c.facing, angle: 45, power: 50 };
    for (const tgt of targets) {
      const facing = tgt.x >= c.x ? 1 : -1;
      for (let a = 14; a <= 86; a += 4) {
        for (let pw = 12; pw <= 100; pw += 2.5) {
          const s = this.scoreShot(c, tgt, this.simulate(c, facing, a, pw)) + (tgt === targets[0] ? 0 : 20);
          if (s < best.score) best = { score: s, facing, angle: a, power: pw, target: tgt };
        }
      }
    }
    // refine around the best coarse shot
    if (best.target) {
      const b0 = { ...best };
      for (let a = b0.angle - 3; a <= b0.angle + 3; a++) {
        for (let pw = b0.power - 3; pw <= b0.power + 3; pw += 0.25) {
          if (pw > 100 || pw < 1) continue;
          const s = this.scoreShot(c, b0.target, this.simulate(c, b0.facing, a, pw));
          if (s < best.score) best = { ...best, score: s, angle: a, power: pw };
        }
      }
    }
    const err = { easy: [2.4, 2], normal: [1.0, 0.6], hard: [0.35, 0] }[this.cfg.difficulty || 'normal'];
    const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) * 1.4;
    best.power = TK.clamp(best.power + gauss() * err[0], 5, 100);
    best.angle = TK.clamp(Math.round(best.angle + gauss() * err[1]), 0, 90);
    return best;
  }

  aiItems(c, plan) {
    const list = [];
    let energy = this.energy;
    const want = (id, cost) => { if (energy >= cost) { list.push(id); energy -= cost; } };
    if (c.hp < c.maxHp * 0.4 && Math.random() < 0.8) want('heal', 50);
    if (TK.weaponOf(c).split && list.length === 0 && Math.random() < 0.5) want('power', 35);
    if (c.rage >= 100) list.push('super');
    const goodShot = plan.score < 60;
    if (goodShot && Math.random() < 0.55) want('triple', 45);
    else if (goodShot && Math.random() < 0.3) want('double', 65);
    if (goodShot && Math.random() < 0.6) want('power', 35);
    return list;
  }

  // ---------- camera ----------
  updateCamera(dt) {
    const vw = this.viewW(), vh = this.viewH();
    let target = null;
    if (this.state === 'play' || this.state === 'over') {
      if (this.phase === 'flying' && this.projectiles.length) {
        const p = this.projectiles[Math.floor(this.projectiles.length / 2)];
        target = { x: p.x, y: Math.max(p.y, -200) };
      } else if ((this.phase === 'settle' || this.phase === 'flying') && this.lastBoom) target = this.lastBoom;
      else if (this.active) target = { x: this.active.x, y: this.active.y - 40 };
    }
    if (target && !this.cam.free) {
      const k = Math.min(1, dt * (this.phase === 'flying' ? 5 : 3));
      this.cam.x += (target.x - vw / 2 - this.cam.x) * k;
      this.cam.y += (target.y - vh / 2 - this.cam.y) * k;
    }
    const W = TK.WORLD_W, H = TK.WORLD_H;
    if (vw >= W + 200) this.cam.x = (W - vw) / 2;
    else this.cam.x = TK.clamp(this.cam.x, -100, W + 100 - vw);
    this.cam.y = TK.clamp(this.cam.y, -500, H + 60 - vh);
    this.cam.shake *= Math.pow(0.02, dt);
  }

  // ---------- rendering ----------
  render() {
    const ctx = this.ctx;
    const dpr = this.dpr;
    const vw = this.viewW(), vh = this.viewH();
    const sx = (Math.random() - 0.5) * this.cam.shake, sy = (Math.random() - 0.5) * this.cam.shake;
    const cx = this.cam.x + sx, cy = this.cam.y + sy;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    TK.Art.drawSky(ctx, this.sky, { x: cx * this.zoom, y: cy * this.zoom }, this.cssW, this.cssH, this.time);

    ctx.setTransform(dpr * this.zoom, 0, 0, dpr * this.zoom, -cx * dpr * this.zoom, -cy * dpr * this.zoom);
    // terrain (only the visible slice)
    const T = this.terrain;
    const x0 = Math.max(0, Math.floor(cx)), y0 = Math.max(0, Math.floor(cy));
    const x1 = Math.min(T.w, Math.ceil(cx + vw) + 1), y1 = Math.min(T.h, Math.ceil(cy + vh) + 1);
    if (x1 > x0 && y1 > y0) ctx.drawImage(T.canvas, x0, y0, x1 - x0, y1 - y0, x0, y0, x1 - x0, y1 - y0);

    // abyss mist at the bottom of the world
    const mist = ctx.createLinearGradient(0, T.h - 220, 0, T.h + 80);
    mist.addColorStop(0, T.theme.abyss + '00');
    mist.addColorStop(1, T.theme.abyss + 'ee');
    ctx.fillStyle = mist;
    ctx.fillRect(cx - 10, T.h - 220, vw + 20, Math.max(0, cy + vh - (T.h - 220)) + 10);

    this.drawWorldEntities(ctx);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.buttons = [];
    if (this.state === 'play' || this.state === 'over' || this.state === 'paused') this.drawHUD(ctx);
  }

  drawWorldEntities(ctx) {
    const time = this.time;
    // trail + smoke behind characters
    for (const p of this.particles) {
      if (p.type !== 'trail' && p.type !== 'smoke') continue;
      const k = p.life / p.max;
      ctx.globalAlpha = (1 - k) * (p.type === 'trail' ? 0.7 : 0.5);
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (p.type === 'smoke' ? 0.6 + k : 1 - k * 0.5), 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;

    for (const c of this.chars) {
      if (c.gone) continue;
      ctx.save();
      ctx.translate(c.x, c.y);
      if (!c.alive) {
        TK.Art.drawTomb(ctx, TK.TEAM_COLORS[c.team]);
        ctx.restore();
        continue;
      }
      ctx.scale(c.facing, 1);
      const isActive = c === this.active && (this.phase === 'aim');
      TK.Art.drawChibi(ctx, {
        color: c.color, hair: c.hair, hat: c.hat, hero: c.hero, weapon: c.weapon,
        angle: c.angle, mood: c.frozen ? 'hurt' : c.mood,
        time: c.frozen ? 0 : time, seed: c.id * 1.7, recoil: c.recoil,
        charging: isActive && this.charging ? this.power / 100 : 0,
      });
      ctx.scale(c.facing, 1);
      TK.Art.drawStatus(ctx, c, time);
      ctx.restore();

      // aim guide for the human whose turn it is
      if (isActive && this.isMine(c)) {
        const m = this.muzzle(c, c.angle);
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.setLineDash([4, 6]);
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(m.x, m.y); ctx.lineTo(m.x + m.dx * 70, m.y + m.dy * 70); ctx.stroke();
        ctx.setLineDash([]);
      }

      // name tag + hp bar
      const ty = c.y - 72;
      ctx.font = `600 13px ${TK.FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      TK.outlineText(ctx, c.name, c.x, ty, TK.TEAM_COLORS[c.team], '#1d1410', 3.5);
      const bw = 46, bh = 6;
      ctx.fillStyle = 'rgba(20,10,5,0.75)';
      TK.roundRect(ctx, c.x - bw / 2 - 1.5, ty + 8.5, bw + 3, bh + 3, 3); ctx.fill();
      const hpk = c.hp / c.maxHp;
      ctx.fillStyle = hpk > 0.5 ? '#5ee05a' : hpk > 0.25 ? '#ffc83d' : '#ff4a4a';
      TK.roundRect(ctx, c.x - bw / 2, ty + 10, bw * hpk, bh, 2); ctx.fill();

      if (isActive) {
        const by = ty - 20 + Math.sin(time * 6) * 4;
        ctx.fillStyle = '#ffe45c';
        ctx.strokeStyle = '#2b1a12';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(c.x - 7, by - 8); ctx.lineTo(c.x + 7, by - 8); ctx.lineTo(c.x, by); ctx.closePath();
        ctx.fill(); ctx.stroke();
      }
    }

    for (const p of this.projectiles) TK.Art.drawBomb(ctx, p, time);

    for (const p of this.particles) {
      if (p.type === 'trail' || p.type === 'smoke') continue;
      const k = p.life / p.max;
      ctx.globalAlpha = 1 - k;
      ctx.fillStyle = p.color;
      if (p.type === 'fire') {
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1 + k), 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
    }
    ctx.globalAlpha = 1;
    for (const b of this.bolts) TK.Art.drawBolt(ctx, b);
    for (const r of this.rings) {
      const k = r.t / r.life;
      ctx.globalAlpha = 1 - k;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = 6 * (1 - k) + 1;
      ctx.beginPath(); ctx.arc(r.x, r.y, TK.lerp(r.r, r.max, k), 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = 1;

    for (const t of this.texts) {
      const k = t.t / 1.4;
      const pop = t.t < 0.15 ? 0.6 + (t.t / 0.15) * 0.6 : 1.2 - Math.min(0.2, (t.t - 0.15));
      ctx.globalAlpha = k > 0.75 ? (1 - k) / 0.25 : 1;
      ctx.font = `700 ${Math.round(t.size * pop)}px ${TK.FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      TK.outlineText(ctx, t.text, t.x, t.y, t.color, '#2a1208', 5);
    }
    ctx.globalAlpha = 1;
  }

  // ---------- HUD ----------
  panel(ctx, x, y, w, h, r = 12) {
    ctx.fillStyle = 'rgba(38,24,16,0.82)';
    TK.roundRect(ctx, x, y, w, h, r); ctx.fill();
    ctx.strokeStyle = '#c9a26a';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  addButton(x, y, w, h, down, up) {
    const u = this.ui;
    this.buttons.push({ x: x * u, y: y * u, w: w * u, h: h * u, down, up });
  }

  drawHUD(ctx) {
    const u = this.ui;
    ctx.save();
    ctx.scale(u, u);
    const W = this.cssW / u, H = this.cssH / u;
    const c = this.active;
    const font = (s, wt = 600) => `${wt} ${s}px ${TK.FONT}`;
    ctx.textBaseline = 'middle';

    // --- top-left: roster + turn order
    const rows = this.chars;
    this.panel(ctx, 10, 10, 230, 30 + rows.length * 30);
    ctx.font = font(13, 700);
    ctx.textAlign = 'left';
    TK.outlineText(ctx, 'PLAYERS', 22, 26, '#ffe8b0', '#2a1208', 3);
    const order = this.chars.filter((ch) => ch.alive).sort((a, b) => a.delay - b.delay || a.id - b.id);
    rows.forEach((ch, i) => {
      const y = 50 + i * 30;
      if (ch === c && this.phase === 'aim') {
        ctx.fillStyle = 'rgba(255,228,92,0.18)';
        TK.roundRect(ctx, 16, y - 13, 218, 26, 6); ctx.fill();
      }
      ctx.fillStyle = TK.TEAM_COLORS[ch.team];
      ctx.beginPath(); ctx.arc(28, y, 7, 0, Math.PI * 2); ctx.fill();
      ctx.font = font(13);
      ctx.fillStyle = ch.alive ? '#fff' : '#8a7a70';
      ctx.fillText(ch.name.slice(0, 12), 42, y - 4);
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(42, y + 5, 110, 5);
      ctx.fillStyle = ch.hp / ch.maxHp > 0.5 ? '#5ee05a' : ch.hp / ch.maxHp > 0.25 ? '#ffc83d' : '#ff4a4a';
      ctx.fillRect(42, y + 5, 110 * (ch.hp / ch.maxHp), 5);
      ctx.font = font(11);
      ctx.fillStyle = '#ffe8b0';
      ctx.textAlign = 'right';
      const pos = order.indexOf(ch);
      ctx.fillText(ch.alive ? (pos === 0 && this.phase === 'aim' ? 'NOW' : '#' + (pos + 1)) + '  ' + Math.round(ch.delay) : 'KO', 228, y);
      ctx.textAlign = 'left';
    });

    // --- top centre: wind + timer
    const wx = W / 2;
    this.panel(ctx, wx - 110, 10, 220, 56, 14);
    ctx.textAlign = 'center';
    ctx.font = font(11, 700);
    ctx.fillStyle = '#ffe8b0';
    ctx.fillText('WIND', wx - 40, 22);
    const wind = this.wind || 0;
    ctx.font = font(22, 700);
    TK.outlineText(ctx, Math.abs(wind).toFixed(1), wx - 40, 44, wind === 0 ? '#ffffff' : '#9fe3ff', '#16222e', 4);
    if (wind !== 0) {
      const dir = Math.sign(wind);
      const len = 14 + Math.abs(wind) * 6;
      const ax = wx - 40 + dir * 26;
      ctx.save();
      ctx.translate(ax, 44);
      ctx.scale(dir, 1);
      ctx.fillStyle = '#9fe3ff';
      ctx.strokeStyle = '#16222e';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, -4); ctx.lineTo(len - 8, -4); ctx.lineTo(len - 8, -9); ctx.lineTo(len, 0);
      ctx.lineTo(len - 8, 9); ctx.lineTo(len - 8, 4); ctx.lineTo(0, 4); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.restore();
    }
    const tsec = this.phase === 'aim' ? Math.max(0, Math.ceil(this.timer)) : '-';
    ctx.beginPath(); ctx.arc(wx + 62, 38, 21, 0, Math.PI * 2);
    ctx.fillStyle = typeof tsec === 'number' && tsec <= 5 ? '#d8342c' : '#2f6fb3';
    ctx.fill();
    ctx.strokeStyle = '#ffe8b0'; ctx.lineWidth = 2.5; ctx.stroke();
    if (this.phase === 'aim') {
      ctx.beginPath();
      ctx.arc(wx + 62, 38, 21, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (this.timer / TK.TURN_TIME));
      ctx.strokeStyle = '#ffe45c'; ctx.lineWidth = 4; ctx.stroke();
    }
    ctx.font = font(20, 700);
    TK.outlineText(ctx, String(tsec), wx + 62, 39, '#ffffff', '#16222e', 3);

    // --- top right: minimap
    this.drawMinimap(ctx, W, H);

    // --- bottom panel
    const ph = 118;
    const py = H - ph;
    ctx.fillStyle = 'rgba(38,24,16,0.88)';
    TK.roundRect(ctx, 8, py, W - 16, ph - 8, 16); ctx.fill();
    ctx.strokeStyle = '#c9a26a'; ctx.lineWidth = 2.5; ctx.stroke();

    const showC = c && c.alive ? c : null;
    const myTurn = this.humanTurn();

    // angle dial
    const dx = 72, dy = py + 62, dr = 44;
    ctx.beginPath(); ctx.arc(dx, dy, dr, 0, Math.PI * 2);
    ctx.fillStyle = '#1b2a3a'; ctx.fill();
    ctx.strokeStyle = '#c9a26a'; ctx.lineWidth = 3; ctx.stroke();
    if (showC) {
      const f = showC.facing;
      ctx.beginPath(); ctx.moveTo(dx, dy);
      if (f === 1) ctx.arc(dx, dy, dr - 5, -Math.PI / 2, 0); else ctx.arc(dx, dy, dr - 5, Math.PI, Math.PI * 1.5);
      ctx.closePath();
      ctx.fillStyle = 'rgba(95,184,240,0.3)'; ctx.fill();
      for (let a = 0; a <= 90; a += 15) {
        const ra = TK.rad(f === 1 ? a : 180 - a);
        ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(dx + Math.cos(ra) * (dr - 10), dy - Math.sin(ra) * (dr - 10));
        ctx.lineTo(dx + Math.cos(ra) * (dr - 4), dy - Math.sin(ra) * (dr - 4));
        ctx.stroke();
      }
      const ra = TK.rad(f === 1 ? showC.angle : 180 - showC.angle);
      ctx.strokeStyle = '#ffe45c'; ctx.lineWidth = 3.5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(dx, dy); ctx.lineTo(dx + Math.cos(ra) * (dr - 6), dy - Math.sin(ra) * (dr - 6)); ctx.stroke();
      ctx.lineCap = 'butt';
      ctx.font = font(22, 700);
      TK.outlineText(ctx, Math.round(showC.angle) + '°', dx, dy + 18, '#ffffff', '#16222e', 4);
    }
    ctx.font = font(10, 700); ctx.fillStyle = '#ffe8b0';
    ctx.fillText('ANGLE', dx, py + 12);

    // stamina / energy / rage bars
    const bx = 130, bw = 150;
    const bar = (label, y, v, col) => {
      ctx.textAlign = 'left';
      ctx.font = font(10, 700); ctx.fillStyle = '#ffe8b0';
      ctx.fillText(label, bx, y - 7);
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      TK.roundRect(ctx, bx, y, bw, 9, 4); ctx.fill();
      ctx.fillStyle = col;
      TK.roundRect(ctx, bx, y, Math.max(0, bw * v), 9, 4); ctx.fill();
    };
    const hh = TK.heroOf(showC);
    bar('MOVE', py + 26, this.phase === 'aim' ? this.stamina / (100 * TK.agiMult(showC) * (hh.move || 1)) : 0, '#5fb8f0');
    bar('ENERGY', py + 56, this.phase === 'aim' ? this.energy / (hh.energy || 100) : 0, '#7bd64a');
    if (this.phase === 'aim') {
      ctx.textAlign = 'right'; ctx.font = font(10, 700); ctx.fillStyle = '#ffe8b0';
      ctx.fillText(String(Math.round(this.energy)), bx + bw, py + 49);
      ctx.textAlign = 'left';
    }
    const rage = showC ? showC.rage / 100 : 0;
    bar('RAGE', py + 86, rage, rage >= 1 ? (Math.sin(this.time * 10) > 0 ? '#ff4a4a' : '#ffb627') : '#ff7a45');

    // power bar
    const pbx = 300, pbw = Math.max(200, W - 300 - 6 * 58 - 40), pby = py + 46, pbh = 30;
    ctx.textAlign = 'left';
    ctx.font = font(10, 700); ctx.fillStyle = '#ffe8b0';
    ctx.fillText('POWER', pbx, py + 16);
    if (showC) {
      const w = TK.weaponOf(showC), h = TK.heroOf(showC);
      ctx.textAlign = 'right';
      ctx.font = font(12, 700);
      TK.outlineText(ctx, `${h.title} · ${w.name}`, pbx + pbw, py + 16, '#ffe45c', '#2a1208', 3);
      ctx.textAlign = 'left';
    }
    ctx.fillStyle = '#1b2a3a';
    TK.roundRect(ctx, pbx, pby, pbw, pbh, 8); ctx.fill();
    const pw = this.charging ? this.power : this.phase === 'flying' || this.phase === 'settle' ? this.shotPower : 0;
    if (pw > 0) {
      const g = ctx.createLinearGradient(pbx, 0, pbx + pbw, 0);
      g.addColorStop(0, '#5ee05a'); g.addColorStop(0.55, '#ffe45c'); g.addColorStop(1, '#ff4a3c');
      ctx.fillStyle = g;
      TK.roundRect(ctx, pbx + 2, pby + 2, (pbw - 4) * (pw / 100), pbh - 4, 6); ctx.fill();
    }
    ctx.strokeStyle = '#c9a26a'; ctx.lineWidth = 2.5;
    TK.roundRect(ctx, pbx, pby, pbw, pbh, 8); ctx.stroke();
    ctx.font = font(9, 600);
    ctx.textAlign = 'center';
    for (let i = 0; i <= 10; i++) {
      const x = pbx + (pbw * i) / 10;
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, pby + pbh); ctx.lineTo(x, pby + pbh + (i % 5 === 0 ? 8 : 5)); ctx.stroke();
      ctx.fillStyle = 'rgba(255,232,176,0.8)';
      if (i % 2 === 0) ctx.fillText(String(i * 10), x, pby + pbh + 16);
    }
    if (showC && showC.lastPower != null) {
      const lx = pbx + pbw * (showC.lastPower / 100);
      ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#16222e'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(lx - 6, pby - 9); ctx.lineTo(lx + 6, pby - 9); ctx.lineTo(lx, pby - 1); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    ctx.font = font(18, 700);
    if (pw > 0) TK.outlineText(ctx, Math.round(pw), pbx + pbw / 2, pby + pbh / 2 + 1, '#ffffff', '#16222e', 4);
    else if (myTurn) {
      ctx.font = font(12, 600);
      ctx.fillStyle = 'rgba(255,232,176,0.7)';
      ctx.fillText(this.touch ? 'Hold FIRE to charge, release to shoot' : 'Hold SPACE to shoot · ←→ move · ↑↓ angle · 1-6 items · P pass', pbx + pbw / 2, pby + pbh / 2 + 1);
    }
    ctx.textAlign = 'left';
    ctx.font = font(10, 600);
    ctx.fillStyle = 'rgba(255,232,176,0.6)';


    // item slots
    const sw = 50, gap = 8;
    let tip = null;
    const ix0 = W - 16 - TK.ITEMS.length * (sw + gap);
    TK.ITEMS.forEach((it, i) => {
      const x = ix0 + i * (sw + gap), y = py + 20;
      const used = this.phase === 'aim' && this.items && this.items[it.id];
      const avail = myTurn && this.canUse(it.id);
      ctx.fillStyle = used ? '#6b4a1e' : '#2a3b4f';
      TK.roundRect(ctx, x, y, sw, sw, 9); ctx.fill();
      ctx.lineWidth = used ? 3.5 : 2;
      ctx.strokeStyle = used ? '#ffe45c' : avail ? '#c9a26a' : '#5a4a3a';
      ctx.stroke();
      ctx.save();
      ctx.globalAlpha = avail || used ? 1 : 0.35;
      this.drawItemIcon(ctx, it.id, x + sw / 2, y + sw / 2);
      ctx.restore();
      ctx.font = font(10, 700);
      ctx.textAlign = 'left';
      TK.outlineText(ctx, it.key, x + 4, y + 8, '#ffffff', '#16222e', 3);
      ctx.textAlign = 'center';
      ctx.font = font(9, 600);
      ctx.fillStyle = '#ffe8b0';
      ctx.fillText(it.rage ? 'RAGE' : it.cost + ' EN', x + sw / 2, y + sw + 10);
      this.addButton(x, y, sw, sw, () => { if (this.humanTurn()) this.useItem(it.id); });
      const m = this.mouse;
      if (m && m.x / this.ui >= x && m.x / this.ui <= x + sw && m.y / this.ui >= y && m.y / this.ui <= y + sw) tip = { it, x: x + sw / 2, y };
    });
    if (tip) {
      const w = showC ? TK.weaponOf(showC) : TK.WEAPONS.bomb;
      const title = tip.it.rage ? w.superName : tip.it.name;
      const desc = tip.it.rage ? w.superDesc + ' Needs full rage.' : tip.it.desc;
      ctx.font = font(12, 600);
      const tw = Math.max(ctx.measureText(desc).width, 120) + 20;
      const tx = TK.clamp(tip.x - tw / 2, 8, W - tw - 8), ty = tip.y - 58;
      this.panel(ctx, tx, ty, tw, 48, 10);
      ctx.textAlign = 'left';
      ctx.font = font(14, 700); ctx.fillStyle = '#ffe45c'; ctx.fillText(title, tx + 10, ty + 15);
      ctx.font = font(12, 600); ctx.fillStyle = '#ffe8b0'; ctx.fillText(desc, tx + 10, ty + 34);
    }
    // item tooltip on the active slots row
    ctx.textAlign = 'left';

    // touch controls
    if (this.touch && myTurn) this.drawTouchControls(ctx, W, py);

    // pause / mute buttons
    this.panel(ctx, W - 92, 76 + 132, 80, 30, 10);
    ctx.font = font(12, 700); ctx.textAlign = 'center'; ctx.fillStyle = '#ffe8b0';
    ctx.fillText(TK.Sfx.muted ? '🔇' : '🔊', W - 72, 76 + 147);
    ctx.fillText('II', W - 32, 76 + 147);
    this.addButton(W - 92, 208, 40, 30, () => TK.Sfx.toggleMute());
    this.addButton(W - 52, 208, 40, 30, () => this.togglePause());

    // turn banner
    if (this.banner && this.banner.t < 1.6 && this.state === 'play') {
      const t = this.banner.t;
      const s = t < 0.2 ? t / 0.2 : 1;
      ctx.globalAlpha = t > 1.2 ? (1.6 - t) / 0.4 : 1;
      ctx.font = font(Math.round(44 * (0.6 + 0.4 * s)), 700);
      ctx.textAlign = 'center';
      TK.outlineText(ctx, this.banner.text, W / 2, H * 0.3, this.banner.mine ? '#ffe45c' : '#ffffff', '#2a1208', 8);
      ctx.globalAlpha = 1;
    }
    if (this.state === 'over') {
      ctx.font = font(52, 700);
      ctx.textAlign = 'center';
      TK.outlineText(ctx, 'K.O.!', W / 2, H * 0.32, '#ffe45c', '#2a1208', 9);
    }
    ctx.restore();
  }

  drawTouchControls(ctx, W, py) {
    const mk = (x, y, w, h, label, code) => {
      ctx.fillStyle = this.keys.has(code) ? 'rgba(255,228,92,0.5)' : 'rgba(38,24,16,0.7)';
      TK.roundRect(ctx, x, y, w, h, 12); ctx.fill();
      ctx.strokeStyle = '#c9a26a'; ctx.lineWidth = 2; ctx.stroke();
      ctx.font = `700 ${code === 'Space' ? 18 : 22}px ${TK.FONT}`;
      ctx.textAlign = 'center';
      TK.outlineText(ctx, label, x + w / 2, y + h / 2 + 1, '#ffffff', '#16222e', 3);
      this.addButton(x, y, w, h,
        () => { this.keys.add(code); this.pressed(code); },
        () => { this.keys.delete(code); if (code === 'Space') this.release(); });
    };
    const y = py - 76;
    mk(16, y, 60, 60, '◀', 'ArrowLeft');
    mk(84, y, 60, 60, '▶', 'ArrowRight');
    mk(W - 230, y, 60, 60, '▲', 'ArrowUp');
    mk(W - 162, y, 60, 60, '▼', 'ArrowDown');
    mk(W - 94, y - 10, 80, 70, 'FIRE', 'Space');
  }

  drawItemIcon(ctx, id, x, y) {
    const bomb = (bx, by, r, col = '#3a3f4a') => {
      ctx.beginPath(); ctx.arc(bx, by, r, 0, Math.PI * 2);
      ctx.fillStyle = col; ctx.fill();
      ctx.strokeStyle = '#111'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = '#ffb347';
      ctx.beginPath(); ctx.arc(bx + r * 0.5, by - r * 0.9, r * 0.35, 0, Math.PI * 2); ctx.fill();
    };
    ctx.textAlign = 'center';
    switch (id) {
      case 'triple': bomb(x - 11, y + 5, 6); bomb(x, y - 4, 6); bomb(x + 11, y + 5, 6); break;
      case 'double': bomb(x - 7, y + 2, 8); bomb(x + 8, y + 2, 8); break;
      case 'power':
        ctx.font = `700 15px ${TK.FONT}`;
        TK.outlineText(ctx, '+50%', x, y + 2, '#ff7a45', '#2a1208', 3);
        break;
      case 'heal':
        ctx.fillStyle = '#ff5a6e';
        ctx.beginPath();
        ctx.moveTo(x, y + 12);
        ctx.bezierCurveTo(x - 18, y, x - 10, y - 14, x, y - 5);
        ctx.bezierCurveTo(x + 10, y - 14, x + 18, y, x, y + 12);
        ctx.fill();
        ctx.fillStyle = '#fff'; ctx.fillRect(x - 1.5, y - 5, 3, 10); ctx.fillRect(x - 5, y - 1.5, 10, 3);
        break;
      case 'teleport':
        ctx.strokeStyle = '#b9a1ff'; ctx.lineWidth = 3;
        ctx.beginPath();
        for (let a = 0; a < 12; a += 0.2) {
          const r = a * 1.2;
          const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
          a === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
        ctx.stroke();
        break;
      case 'super': {
        ctx.fillStyle = '#ffd23f';
        ctx.strokeStyle = '#2a1208'; ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < 10; i++) {
          const r = i % 2 ? 7 : 16;
          const a = -Math.PI / 2 + (i * Math.PI) / 5;
          ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
        }
        ctx.closePath(); ctx.fill(); ctx.stroke();
        break;
      }
    }
  }

  drawMinimap(ctx, W) {
    const mw = 220, mh = 110;
    const mx = W - mw - 12, my = 10;
    if (!this.mini) {
      this.mini = document.createElement('canvas');
    }
    if (this.miniDirty) {
      this.mini.width = mw; this.mini.height = mh;
      const g = this.mini.getContext('2d');
      g.clearRect(0, 0, mw, mh);
      g.drawImage(this.terrain.canvas, 0, 0, mw, mh);
      this.miniDirty = false;
    }
    this.panel(ctx, mx - 4, my - 4 + 4, mw + 8, mh + 8 + 4 - 4, 10);
    ctx.fillStyle = 'rgba(120,180,230,0.35)';
    ctx.fillRect(mx, my + 4, mw, mh);
    ctx.drawImage(this.mini, mx, my + 4);
    const sx = mw / TK.WORLD_W, sy = mh / TK.WORLD_H;
    for (const ch of this.chars) {
      if (ch.gone) continue;
      ctx.fillStyle = ch.alive ? TK.TEAM_COLORS[ch.team] : '#888';
      ctx.strokeStyle = ch === this.active ? '#ffe45c' : '#111';
      ctx.lineWidth = ch === this.active ? 2 : 1;
      ctx.beginPath(); ctx.arc(mx + ch.x * sx, my + 4 + (ch.y - 20) * sy, 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    for (const p of this.projectiles) {
      ctx.fillStyle = '#fff';
      ctx.fillRect(mx + p.x * sx - 1.5, my + 4 + p.y * sy - 1.5, 3, 3);
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(mx + this.cam.x * sx, my + 4 + this.cam.y * sy, this.viewW() * sx, this.viewH() * sy);
    // click the minimap to look somewhere
    this.addButton(mx, my + 4, mw, mh, (pt) => {
      const u = this.ui;
      const wx = (pt.x / u - mx) / sx, wy = (pt.y / u - my - 4) / sy;
      this.cam.free = true;
      this.cam.x = wx - this.viewW() / 2;
      this.cam.y = wy - this.viewH() / 2;
    });
  }
};
