// Menu, lobby and chat wiring + game bootstrap.
(() => {
  const $ = (id) => document.getElementById(id);
  const game = new TK.Game($('game'));
  const show = (id, on) => $(id).classList.toggle('hidden', !on);

  const load = () => {
    try { return JSON.parse(localStorage.getItem('tanker.profile') || '{}'); } catch (e) { return {}; }
  };
  const save = (p) => {
    try { localStorage.setItem('tanker.profile', JSON.stringify(p)); } catch (e) { /* private mode */ }
  };
  const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const saved = load();
  const sel = {
    hat: TK.HATS.includes(saved.hat) ? saved.hat : 'cap',
    color: TK.COLORS.includes(saved.color) ? saved.color : TK.COLORS[1],
    hair: TK.HAIR.includes(saved.hair) ? saved.hair : TK.HAIR[0],
    mode: saved.mode || '1v1',
    difficulty: saved.difficulty || 'normal',
    theme: saved.theme || 'random',
    hero: TK.HEROES[saved.hero] ? saved.hero : 'rookie',
    weapon: TK.WEAPONS[saved.weapon] ? saved.weapon : 'bomb',
  };
  if (saved.name) $('name').value = saved.name;

  function chipGroup(el, items, current, onPick) {
    el.innerHTML = '';
    for (const [value, label] of items) {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.v = value;
      b.textContent = label;
      if (current === value) b.classList.add('on');
      b.onclick = () => {
        el.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
        onPick(value);
      };
      el.appendChild(b);
    }
  }
  const setChip = (el, value) => el.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x.dataset.v === value));

  function swatchGroup(el, colors, key) {
    el.innerHTML = '';
    for (const c of colors) {
      const b = document.createElement('button');
      b.type = 'button';
      b.style.background = c;
      b.title = c;
      if (sel[key] === c) b.classList.add('on');
      b.onclick = () => {
        sel[key] = c;
        el.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
      };
      el.appendChild(b);
    }
  }

  // ---------- tabs + hero/weapon cards ----------
  document.querySelectorAll('.tab').forEach((t) => {
    t.onclick = () => {
      document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('on', x === t));
      document.querySelectorAll('.tabpane').forEach((p) => p.classList.toggle('hidden', p.dataset.pane !== t.dataset.tab));
    };
  });

  const pips = (n) => '<span class="pips">' + [1, 2, 3, 4, 5].map((i) => `<i class="${i <= n ? 'on' : ''}"></i>`).join('') + '</span>';
  function miniCanvas(draw) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    draw(g);
    return c;
  }
  function pickCards(el, ids, key, render) {
    el.innerHTML = '';
    for (const id of ids) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'pick' + (sel[key] === id ? ' on' : '');
      b.dataset.v = id;
      render(b, id);
      b.onclick = () => {
        sel[key] = id;
        el.querySelectorAll('.pick').forEach((x) => x.classList.toggle('on', x === b));
        updateLoadout();
      };
      el.appendChild(b);
    }
  }
  pickCards($('heroes'), TK.HERO_IDS, 'hero', (b, id) => {
    const h = TK.HEROES[id];
    const r = TK.heroRatings(h);
    b.appendChild(miniCanvas((g) => {
      g.setTransform(2.2, 0, 0, 2.2, 60, 118);
      TK.Art.drawChibi(g, { color: sel.color, hair: sel.hair, hat: 'none', hero: id, weapon: 'bomb', angle: 20, time: 0.5, mood: 'normal' });
    }));
    b.insertAdjacentHTML('beforeend', `
      <div class="t">${h.name}<small>${h.title}</small></div>
      <div class="stats">${Object.entries(r).map(([k, v]) => `<span>${k}</span>${pips(v)}`).join('')}</div>
      <div class="d"><b>Perk:</b> ${h.perk}</div>`);
  });
  pickCards($('weapons'), TK.WEAPON_IDS, 'weapon', (b, id) => {
    const w = TK.WEAPONS[id];
    b.appendChild(miniCanvas((g) => {
      g.setTransform(2.6, 0, 0, 2.6, 30, 74);
      g.rotate(-0.35);
      TK.Art.drawWeapon(g, id, sel.color, 0, 0.3);
    }));
    const dmg = TK.clamp(Math.round(w.dmg / 70), 1, 5);
    const blast = TK.clamp(Math.round((w.radius - 22) / 7), 1, 5);
    b.insertAdjacentHTML('beforeend', `
      <div class="t">${w.name}</div>
      <div class="stats"><span>DMG</span>${pips(dmg)}<span>BLAST</span>${pips(blast)}</div>
      <div class="d">${w.desc}<br><b>Super · ${w.superName}:</b> ${w.superDesc}</div>`);
  });
  function updateLoadout() {
    const h = TK.HEROES[sel.hero], w = TK.WEAPONS[sel.weapon];
    $('loadout').innerHTML = `<b>${h.name}</b> the ${h.title}<br>with the <b>${w.name}</b>`;
  }
  updateLoadout();

  const MAPS = [['random', 'Random'], ...Object.entries(TK.THEMES).map(([k, t]) => [k, t.name])];
  const DIFFS = [['easy', 'Easy'], ['normal', 'Normal'], ['hard', 'Hard']];

  chipGroup($('hats'), TK.HATS.map((h) => [h, TK.HAT_NAMES[h]]), sel.hat, (v) => { sel.hat = v; });
  swatchGroup($('colors'), TK.COLORS, 'color');
  swatchGroup($('hairs'), TK.HAIR, 'hair');
  const syncMode = (m) => {
    sel.mode = m;
    show('p2field', m === 'hotseat');
    show('difffield', m !== 'hotseat' && m !== 'online');
    show('play', m !== 'online');
    show('onlinePanel', m === 'online');
    $('maps').parentElement.classList.toggle('hidden', m === 'online');
  };
  chipGroup($('modes'), [['1v1', '1 vs 1 Bot'], ['2v2', '2 vs 2 (Bot ally)'], ['hotseat', '2 Players (same PC)'], ['online', 'Online']], sel.mode, syncMode);
  chipGroup($('diffs'), DIFFS, sel.difficulty, (v) => { sel.difficulty = v; });
  chipGroup($('maps'), MAPS, sel.theme, (v) => { sel.theme = v; });

  // invite links: ?room=ABCD
  const urlRoom = new URLSearchParams(location.search).get('room');
  if (urlRoom) { sel.mode = 'online'; setChip($('modes'), 'online'); $('joinCode').value = urlRoom.toUpperCase().slice(0, 4); }
  syncMode(sel.mode);
  $('serverUrl').value = TK.serverUrl();

  // animated character preview
  const pv = $('preview');
  const pctx = pv.getContext('2d');
  let pt = 0;
  let previewOn = false;
  function drawPreview() {
    pt += 1 / 60;
    pctx.setTransform(1, 0, 0, 1, 0, 0);
    pctx.clearRect(0, 0, pv.width, pv.height);
    pctx.setTransform(2.4, 0, 0, 2.4, 92, 162);
    TK.Art.drawChibi(pctx, { color: sel.color, hair: sel.hair, hat: sel.hat, hero: sel.hero, weapon: sel.weapon, angle: 30 + Math.sin(pt * 1.3) * 15, time: pt, mood: 'normal' });
    if (!$('menu').classList.contains('hidden')) requestAnimationFrame(drawPreview);
    else previewOn = false;
  }
  const startPreview = () => { if (!previewOn) { previewOn = true; drawPreview(); } };
  startPreview();

  const profile = () => {
    const name = ($('name').value || 'Player').trim().slice(0, 12) || 'Player';
    const p = { name, hat: sel.hat, color: sel.color, hair: sel.hair, hero: sel.hero, weapon: sel.weapon };
    save({ ...p, mode: sel.mode, difficulty: sel.difficulty, theme: sel.theme });
    return p;
  };

  // ---------- offline ----------
  let lastCfg = null;
  function play(cfg) {
    lastCfg = cfg;
    ['menu', 'over', 'pause', 'lobby'].forEach((id) => show(id, false));
    $('quit').textContent = 'Quit to menu';
    game.start(cfg);
  }

  $('play').onclick = () => {
    TK.Sfx.unlock();
    const me = profile();
    const p2color = TK.COLORS.filter((c) => c !== sel.color);
    play({
      mode: sel.mode, difficulty: sel.difficulty, theme: sel.theme, player: me,
      player2: {
        name: ($('name2').value || 'Player 2').trim().slice(0, 12) || 'Player 2',
        hat: TK.pick(TK.HATS.filter((h) => h !== sel.hat)), color: TK.pick(p2color), hair: TK.pick(TK.HAIR),
        hero: TK.pick(TK.HERO_IDS), weapon: TK.pick(TK.WEAPON_IDS),
      },
    });
  };

  function toMenu() {
    ['over', 'pause', 'lobby'].forEach((id) => show(id, false));
    show('menu', true);
    game.state = 'menu';
    game.role = 'local';
    game.net = null;
    game.makeBackdrop();
    startPreview();
  }

  // ---------- online ----------
  let net = null;
  let myId = null;
  let room = null;
  let inGame = false;

  const menuMsg = (t) => { $('menuMsg').textContent = t || ''; };

  async function connect() {
    if (net && net.open) return net;
    const url = ($('serverUrl').value || '').trim() || TK.serverUrl();
    try { if (url !== TK.serverUrl() || localStorage.getItem('tanker.server')) localStorage.setItem('tanker.server', url); } catch (e) { /* ignore */ }
    menuMsg('Connecting…');
    const n = new TK.Net(url);
    try {
      await n.connect();
    } catch (e) {
      menuMsg(`Couldn't reach the multiplayer server at ${url}. Check the address under "Server", or start one with "npm start".`);
      throw e;
    }
    menuMsg('');
    net = n;
    bindNet(n);
    return n;
  }

  function bindNet(n) {
    n.on('joined', (m) => {
      myId = m.you;
      show('menu', false);
      show('lobby', true);
      $('lobbyChat').innerHTML = '';
      $('roomCode').textContent = m.code;
      try { history.replaceState(null, '', location.pathname + '?room=' + m.code); } catch (e) { /* sandboxed */ }
    });
    n.on('room', (m) => { room = m; renderLobby(); });
    n.on('error', (m) => {
      if ($('lobby').classList.contains('hidden')) menuMsg(m.text);
      else $('lobbyInfo').textContent = m.text;
    });
    n.on('chat', (m) => addChat(m));
    n.on('start', (m) => {
      inGame = true;
      ['menu', 'over', 'pause', 'lobby'].forEach((id) => show(id, false));
      $('quit').textContent = 'Leave game';
      game.net = n;
      game.start({
        mode: 'online', role: m.host === myId ? 'host' : 'client', myId,
        seed: m.seed, theme: m.theme, difficulty: m.difficulty, roster: m.roster,
      });
    });
    n.on('state', (m) => game.netState(m));
    n.on('input', (m) => game.netInput(m.from, m.d));
    n.on('left', (m) => game.netLeft(m.id, m.name));
    n.on('closed', (m) => { leaveOnline(); menuMsg(m.reason); });
    n.on('close', () => { leaveOnline(); menuMsg('Lost connection to the server.'); });
  }

  function leaveOnline() {
    if (net) { net.send({ t: 'leave' }); net.close(); }
    net = null;
    room = null;
    inGame = false;
    try { history.replaceState(null, '', location.pathname); } catch (e) { /* sandboxed */ }
    toMenu();
  }

  $('createRoom').onclick = async () => {
    TK.Sfx.unlock();
    try { const n = await connect(); n.send({ t: 'create', profile: profile() }); } catch (e) { /* message shown */ }
  };
  const join = async () => {
    TK.Sfx.unlock();
    const code = $('joinCode').value.trim().toUpperCase();
    if (code.length !== 4) { menuMsg('Enter the 4-letter room code.'); return; }
    try { const n = await connect(); n.send({ t: 'join', code, profile: profile() }); } catch (e) { /* message shown */ }
  };
  $('joinRoom').onclick = join;
  $('joinCode').addEventListener('keydown', (e) => { if (e.key === 'Enter') join(); });
  $('leaveRoom').onclick = leaveOnline;

  $('copyLink').onclick = () => {
    if (!room) return;
    const link = location.origin + location.pathname + '?room=' + room.code;
    const done = () => { $('copyLink').textContent = 'Copied!'; setTimeout(() => { $('copyLink').textContent = 'Copy invite link'; }, 1500); };
    if (navigator.clipboard) navigator.clipboard.writeText(link).then(done, () => { $('lobbyInfo').textContent = link; });
    else $('lobbyInfo').textContent = link;
  };

  document.querySelectorAll('.join-team').forEach((b) => { b.onclick = () => net && net.send({ t: 'team', team: Number(b.dataset.team) }); });
  document.querySelectorAll('.add-bot').forEach((b) => { b.onclick = () => net && net.send({ t: 'addbot', team: Number(b.dataset.team) }); });
  chipGroup($('lobbyMaps'), MAPS, 'random', (v) => net && net.send({ t: 'settings', theme: v }));
  chipGroup($('lobbyDiffs'), DIFFS, 'normal', (v) => net && net.send({ t: 'settings', difficulty: v }));
  $('startOnline').onclick = () => net && net.send({ t: 'start' });

  const loadoutText = (p) => {
    const h = TK.HEROES[p.hero], w = TK.WEAPONS[p.weapon];
    return h && w ? `${h.title} · ${w.name}` : '';
  };

  function renderLobby() {
    if (!room) return;
    const isHost = room.host === myId;
    $('roomCode').textContent = room.code;
    for (const team of [0, 1]) {
      const ul = $('team' + team);
      const items = [
        ...room.players.filter((p) => p.team === team).map((p) => `
          <li><span class="dot" style="background:${escapeHtml(p.color)}"></span>
          <span class="nm">${escapeHtml(p.name)} <span class="sub">${loadoutText(p)}</span></span>
          ${p.id === room.host ? '<span class="tag">host</span>' : ''}${p.id === myId ? '<span class="tag">you</span>' : ''}</li>`),
        ...room.bots.filter((b) => b.team === team).map((b) => `
          <li><span class="dot" style="background:${escapeHtml(b.color)}"></span>
          <span class="nm">${escapeHtml(b.name)} <span class="sub">${loadoutText(b)}</span></span><span class="tag">bot</span>
          ${isHost && !room.started ? `<button class="x" data-bot="${escapeHtml(b.id)}" title="Remove bot">✕</button>` : ''}</li>`),
      ];
      ul.innerHTML = items.join('') || '<li class="sys" style="opacity:.6">Empty</li>';
    }
    document.querySelectorAll('[data-bot]').forEach((b) => { b.onclick = () => net.send({ t: 'removebot', id: b.dataset.bot }); });
    const me = room.players.find((p) => p.id === myId);
    const count = (t) => room.players.filter((p) => p.team === t).length + room.bots.filter((b) => b.team === t).length;
    const totalN = room.players.length + room.bots.length;
    document.querySelectorAll('.join-team').forEach((b) => {
      const t = Number(b.dataset.team);
      b.classList.toggle('hidden', !me || me.team === t || room.started);
      b.disabled = count(t) >= 3;
    });
    document.querySelectorAll('.add-bot').forEach((b) => {
      b.classList.toggle('hidden', !isHost || room.started);
      b.disabled = count(Number(b.dataset.team)) >= 3 || totalN >= 6;
    });
    show('hostSettings', isHost);
    setChip($('lobbyMaps'), room.theme);
    setChip($('lobbyDiffs'), room.difficulty);
    const ready = count(0) > 0 && count(1) > 0;
    show('startOnline', isHost);
    $('startOnline').disabled = !ready || room.started;
    let info;
    if (room.started) info = 'A match is in progress…';
    else if (isHost) info = ready ? 'Ready when you are. Teams can be uneven; add bots to fill.' : 'Each team needs at least one player or bot.';
    else info = 'Waiting for the host to start the match…';
    $('lobbyInfo').textContent = info;
  }

  // ---------- chat ----------
  function chatLine(m) {
    const div = document.createElement('div');
    if (!m.name) { div.className = 'sys'; div.textContent = m.text; }
    else div.innerHTML = `<b class="c${m.team === 1 ? 1 : 0}">${escapeHtml(m.name)}:</b> ${escapeHtml(m.text)}`;
    return div;
  }
  function addChat(m) {
    const log = $('lobbyChat');
    log.appendChild(chatLine(m));
    while (log.children.length > 80) log.removeChild(log.firstChild);
    log.scrollTop = log.scrollHeight;
    if (inGame) {
      const box = $('chatLog');
      const line = chatLine(m);
      box.appendChild(line);
      while (box.children.length > 6) box.removeChild(box.firstChild);
      setTimeout(() => line.classList.add('fade'), 8000);
      setTimeout(() => line.remove(), 9200);
    }
  }
  const sendChat = (input) => {
    const text = input.value.trim();
    if (text && net) net.send({ t: 'chat', text });
    input.value = '';
  };
  $('lobbyChatInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') sendChat(e.target); });
  const ci = $('chatInput');
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || !inGame || !net || e.target === ci) return;
    if (e.target && e.target.tagName === 'INPUT') return;
    show('chatInput', true);
    game.keys.clear();
    ci.focus();
    e.preventDefault();
  });
  ci.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') { sendChat(ci); ci.blur(); }
    if (e.key === 'Escape') { ci.value = ''; ci.blur(); }
  });
  ci.addEventListener('blur', () => show('chatInput', false));

  // ---------- pause / game over ----------
  game.onPause = (paused) => show('pause', paused);
  $('resume').onclick = () => game.togglePause();
  $('quit').onclick = () => { if (game.role !== 'local') leaveOnline(); else toMenu(); };

  $('again').onclick = () => lastCfg && play(lastCfg);
  $('tomenu').onclick = () => { if (net) leaveOnline(); else toMenu(); };
  $('toLobby').onclick = () => {
    show('over', false);
    game.state = 'menu';
    game.makeBackdrop();
    show('lobby', true);
    renderLobby();
  };

  game.onGameOver = (winner, chars, cfg) => {
    const online = cfg.mode === 'online';
    if (online) {
      inGame = false;
      if (game.role === 'host' && net) net.send({ t: 'end' });
    }
    const myTeam = online ? (chars.find((c) => c.pid === myId) || {}).team : cfg.mode === 'hotseat' ? null : 0;
    let title;
    if (winner < 0) title = 'Draw!';
    else if (myTeam == null) title = (chars.find((c) => c.team === winner) || {}).name + ' wins!';
    else title = winner === myTeam ? 'Victory!' : 'Defeat...';
    $('overTitle').textContent = title;
    const rows = chars.map((c) => `
      <tr class="${c.team === winner ? 'win' : ''}">
        <td><span class="dot" style="background:${TK.TEAM_COLORS[c.team]}"></span>${escapeHtml(c.name)}</td>
        <td>${c.stats.dmg}</td><td>${c.stats.hits}</td><td>${c.alive ? c.hp : 'KO'}</td>
      </tr>`).join('');
    $('stats').innerHTML = `<tr><th style="text-align:left">Player</th><th>Damage</th><th>Hits</th><th>HP</th></tr>${rows}`;
    show('again', !online);
    show('toLobby', online);
    show('over', true);
  };

  window.tankerGame = game;
})();
