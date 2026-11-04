// Menu wiring and game bootstrap.
(() => {
  const $ = (id) => document.getElementById(id);
  const game = new TK.Game($('game'));

  const load = () => {
    try { return JSON.parse(localStorage.getItem('tanker.profile') || '{}'); } catch (e) { return {}; }
  };
  const save = (p) => {
    try { localStorage.setItem('tanker.profile', JSON.stringify(p)); } catch (e) { /* private mode */ }
  };

  const saved = load();
  const sel = {
    hat: TK.HATS.includes(saved.hat) ? saved.hat : 'cap',
    color: TK.COLORS.includes(saved.color) ? saved.color : TK.COLORS[1],
    hair: TK.HAIR.includes(saved.hair) ? saved.hair : TK.HAIR[0],
    mode: saved.mode || '1v1',
    difficulty: saved.difficulty || 'normal',
    theme: saved.theme || 'random',
  };
  if (saved.name) $('name').value = saved.name;

  function chipGroup(el, items, key, onPick) {
    el.innerHTML = '';
    for (const [value, label] of items) {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.v = value;
      b.textContent = label;
      if (sel[key] === value) b.classList.add('on');
      b.onclick = () => {
        sel[key] = value;
        el.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
        onPick && onPick(value);
      };
      el.appendChild(b);
    }
  }
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

  chipGroup($('hats'), TK.HATS.map((h) => [h, TK.HAT_NAMES[h]]), 'hat');
  swatchGroup($('colors'), TK.COLORS, 'color');
  swatchGroup($('hairs'), TK.HAIR, 'hair');
  const syncMode = (m) => {
    $('p2field').classList.toggle('hidden', m !== 'hotseat');
    $('difffield').classList.toggle('hidden', m === 'hotseat');
  };
  chipGroup($('modes'), [['1v1', '1 vs 1 Bot'], ['2v2', '2 vs 2 (Bot ally)'], ['hotseat', '2 Players (same PC)']], 'mode', syncMode);
  chipGroup($('diffs'), [['easy', 'Easy'], ['normal', 'Normal'], ['hard', 'Hard']], 'difficulty');
  chipGroup($('maps'), [['random', 'Random'], ...Object.entries(TK.THEMES).map(([k, t]) => [k, t.name])], 'theme');
  syncMode(sel.mode);

  // animated character preview
  const pv = $('preview');
  const pctx = pv.getContext('2d');
  let pt = 0;
  function drawPreview() {
    pt += 1 / 60;
    pctx.setTransform(1, 0, 0, 1, 0, 0);
    pctx.clearRect(0, 0, pv.width, pv.height);
    pctx.setTransform(2.4, 0, 0, 2.4, 92, 162);
    TK.Art.drawChibi(pctx, {
      color: sel.color, hair: sel.hair, hat: sel.hat,
      angle: 30 + Math.sin(pt * 1.3) * 15, time: pt, mood: 'normal',
    });
    if (!$('menu').classList.contains('hidden')) requestAnimationFrame(drawPreview);
  }
  drawPreview();

  let lastCfg = null;
  function play(cfg) {
    lastCfg = cfg;
    $('menu').classList.add('hidden');
    $('over').classList.add('hidden');
    $('pause').classList.add('hidden');
    game.start(cfg);
  }

  $('play').onclick = () => {
    TK.Sfx.unlock();
    const name = ($('name').value || 'Player').trim().slice(0, 12) || 'Player';
    const profile = { name, hat: sel.hat, color: sel.color, hair: sel.hair, mode: sel.mode, difficulty: sel.difficulty, theme: sel.theme };
    save(profile);
    const p2color = TK.COLORS.filter((c) => c !== sel.color);
    play({
      mode: sel.mode,
      difficulty: sel.difficulty,
      theme: sel.theme,
      player: { name, hat: sel.hat, color: sel.color, hair: sel.hair },
      player2: {
        name: ($('name2').value || 'Player 2').trim().slice(0, 12) || 'Player 2',
        hat: TK.pick(TK.HATS.filter((h) => h !== sel.hat)),
        color: TK.pick(p2color),
        hair: TK.pick(TK.HAIR),
      },
    });
  };

  const toMenu = () => {
    $('over').classList.add('hidden');
    $('pause').classList.add('hidden');
    $('menu').classList.remove('hidden');
    game.state = 'menu';
    game.makeBackdrop();
    drawPreview();
  };

  game.onPause = (paused) => $('pause').classList.toggle('hidden', !paused);
  $('resume').onclick = () => game.togglePause();
  $('quit').onclick = toMenu;
  $('again').onclick = () => lastCfg && play(lastCfg);
  $('tomenu').onclick = toMenu;

  game.onGameOver = (winner, chars, cfg) => {
    const humanTeam = cfg.mode === 'hotseat' ? null : 0;
    let title;
    if (winner < 0) title = 'Draw!';
    else if (humanTeam === null) title = (chars.find((c) => c.team === winner) || {}).name + ' wins!';
    else title = winner === humanTeam ? 'Victory!' : 'Defeat...';
    $('overTitle').textContent = title;
    const rows = chars.map((c) => `
      <tr class="${c.team === winner ? 'win' : ''}">
        <td><span class="dot" style="background:${TK.TEAM_COLORS[c.team]}"></span>${escapeHtml(c.name)}</td>
        <td>${c.stats.dmg}</td><td>${c.stats.hits}</td><td>${c.alive ? c.hp : 'KO'}</td>
      </tr>`).join('');
    $('stats').innerHTML = `<tr><th style="text-align:left">Player</th><th>Damage</th><th>Hits</th><th>HP</th></tr>${rows}`;
    $('over').classList.remove('hidden');
  };

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // expose for debugging in the console
  window.tankerGame = game;
})();
