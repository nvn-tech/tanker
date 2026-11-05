# Tanker

A free, turn-based artillery brawler that runs in the browser — inspired by the classic
angle + power + wind games of the 2000s. No accounts, no shop, no pay-to-win.

Plain HTML5 canvas + vanilla JavaScript. No build step, no dependencies.

## Play

**Offline (vs bots / same PC):** open `index.html` in a browser. No server needed.

**Online multiplayer:** run the Node server. It serves the game and the rooms:

```bash
npm install
npm start          # http://localhost:8080
```

Open the page, pick **Online**, **Create room**, and send friends the 4-letter code
(or the invite link). Everyone picks a team, the host can add bots, then **Start**.
Up to 6 per room (3 vs 3). Press **Enter** in game to chat.

### Hosting it for friends

- **Render (free):** New → Blueprint → select this repo. `render.yaml` sets everything up.
  Share the `https://<your-app>.onrender.com` URL.
- **Any Node host** (Fly.io, Railway, a VPS): `npm install && npm start`, `PORT` env var is respected.
- **GitHub Pages** can host the page too (Settings → Pages → Source: *GitHub Actions*), but Pages
  can't run the server. Set `TK.DEFAULT_SERVER` in `js/net.js` to your server's `wss://…/ws`
  address, or players can paste it under *Online → Server* in the menu.

## Controls

| Key | Action |
| --- | --- |
| ← → / A D | Walk (limited by the MOVE bar each turn) |
| ↑ ↓ / W S | Aim angle (0–90°) |
| Hold Space | Charge power, release to shoot |
| 1 – 6 | Items |
| P | Pass turn |
| M | Mute |
| Esc | Pause |
| Mouse drag / minimap click | Look around |

On touch devices, on-screen buttons appear during your turn.

## Stats

Like the classic games, your final stats are your **hero's base points + your weapon's points**:

| Stat | What it does | Formula (250 = neutral) |
| --- | --- | --- |
| **Attack** (ATK) | More damage dealt | ±1% damage per 8 points (500 ATK = +31%) |
| **Defense** (DEF) | Less damage taken | ±1% damage taken per 10 points (500 DEF = −25%) |
| **Agility** (AGI) | Walk farther, turns come sooner | ±1% per 7 points (500 AGI = +36%) |
| **Luck** (LUCK) | Critical hits (×1.5) and ignores part of the target's Defense | crit = LUCK/2000 (500 = 25%), ignores LUCK/25 % of DEF |
| **Harm** | The weapon's fixed base damage | |

Every hero has 600 base points, every weapon 400, so an average stat lands near 250.

## Heroes

| Hero | Class | HP | ATK | DEF | AGI | LUCK | Perk |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Bo | Rookie | 1400 | 150 | 150 | 150 | 150 | Fills the rage bar 35% faster |
| Gwen | Knight | 1500 | 120 | 260 | 100 | 120 | Can never be frozen |
| Kaze | Ninja | 1250 | 140 | 90 | 270 | 100 | Walks 50% farther |
| Luna | Witch | 1300 | 130 | 120 | 110 | 240 | Crits deal ×2 instead of ×1.5 |
| Grog | Brute | 1800 | 260 | 150 | 70 | 120 | Most HP of any hero |
| Pixie | Tinker | 1350 | 140 | 150 | 160 | 150 | 130 energy per turn |

## Weapons

Weapons have a **focus**: one stat at 250 and the rest spread out, or balanced across all four.
Each has its own shot and its own **Super** (item 6, needs a full rage bar).

| Weapon | Focus | Harm | ATK | DEF | AGI | LUCK | Shot | Super |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Boom Bomb | Defense | 280 | 50 | 250 | 50 | 50 | Solid damage and crater | Mega Bomb: giant blast, 2× damage |
| Splitter | Attack | 165 | 250 | 50 | 60 | 40 | 3 bomblets at the top of its arc | Fireworks: 6 bomblets |
| Drill Rocket | Attack | 250 | 250 | 70 | 40 | 40 | Bores through ground first | Earth Breaker: 2× depth, 1.8× damage |
| Frost Cannon | Agility | 160 | 40 | 60 | 250 | 50 | Target skips its next turn | Blizzard: huge freezing blast |
| Medic Mortar | Agility | 220 | 50 | 60 | 250 | 40 | Heals allies in the blast | Field Hospital: heals all allies 25% |
| Thunder Rod | Luck | 320 | 70 | 30 | 50 | 250 | Lightning, tiny crater, half wind | Chain Storm: jumps to 2 more enemies |
| Toxic Flask | Luck | 160 | 60 | 40 | 50 | 250 | Poisons for 3 turns | Plague Cloud: bigger, double poison |
| Bouncy Ball | Balanced | 265 | 100 | 100 | 100 | 100 | Bounces once, then explodes | Pinball: 3 bounces, explodes on each |

All of this is data in `js/content.js` (stats, formulas, perks), so tuning is a one-file change.

## Mechanics

- **Angle + power + wind.** Every shot is a ballistic arc; wind pushes it sideways. The white ▼ on the power bar marks your last shot's power.
- **Destructible floating islands.** Blasts carve the terrain. Fall off the map and you're out.
- **Delay-based turn order.** Each turn adds delay (base + distance walked + items used). Lowest delay plays next, so heavy turns cost tempo.
- **Items** (cost ENERGY, 100 per turn):
  1. Triple Shot — 3 bombs in a spread, 60% damage each
  2. Double Shot — fire twice, 75% damage each
  3. Power Up — +50% damage
  4. Heal — restore 30% HP
  5. Teleport — you fly to where the shot lands
  6. Super — needs a full RAGE bar (filled by dealing/taking damage): your weapon's special attack
- **Direct hits** do +20% (critical).
- **Modes:** 1v1 vs bot, 2v2 with a bot ally, 2 players on the same PC, or online rooms (up to 3v3, bots can fill seats). Bots come in Easy / Normal / Hard.

## Code layout

```
index.html        page + menus
css/style.css     menu styling
js/util.js        helpers, physics constants
js/content.js     heroes + weapons (stats, perks, supers)
js/audio.js       synthesized sound effects (WebAudio)
js/terrain.js     island generation, destructible mask, themes
js/art.js         sky, chibi characters, hero gear, weapons, projectiles
js/game.js        game loop, physics, turns, items, bot AI, HUD
js/net.js         WebSocket client + server address setting
js/main.js        menu, lobby and chat wiring
server/server.js  Node server: static files + rooms + message relay
```

### How online play works

The room's host runs the real game in their browser (same code as offline). Other players
send only their inputs (walk, aim, fire with exact power, items, pass); the host streams the game
state ~20×/s plus effect events (explosions, terrain cuts, damage numbers), and the other players'
screens mirror it with smoothing. The server only manages rooms and relays messages. If a
player drops, a bot takes over their character; if the host leaves, the room closes. Keep the host's
tab open: a background ticker keeps the game running when the tab is hidden, but at reduced smoothness.

The world runs at a fixed 120 Hz step; the bot aims by simulating shots with the exact same
step function (`TK.stepShot`), then adds difficulty-based error.

## Ideas for next steps

- Server-authoritative simulation (no host advantage, survives host leaving)
- Public room list / quick match
- More weapons/characters with distinct projectiles
- Map editor, more themes
- Progression that stays cosmetic-only
