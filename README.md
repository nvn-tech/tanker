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
  6. Super Shot — needs a full RAGE bar (filled by dealing/taking damage): bigger blast, 2× damage
- **Direct hits** do +20% (critical).
- **Modes:** 1v1 vs bot, 2v2 with a bot ally, 2 players on the same PC, or online rooms (up to 3v3, bots can fill seats). Bots come in Easy / Normal / Hard.

## Code layout

```
index.html        page + menus
css/style.css     menu styling
js/util.js        helpers, physics constants
js/audio.js       synthesized sound effects (WebAudio)
js/terrain.js     island generation, destructible mask, themes
js/art.js         sky, chibi characters, hats, bombs
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
