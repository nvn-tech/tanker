# Tanker

A free, turn-based artillery brawler that runs in the browser — inspired by the classic
angle + power + wind games of the 2000s. No accounts, no shop, no pay-to-win.

Plain HTML5 canvas + vanilla JavaScript. No build step, no dependencies.

## Play

- Open `index.html` directly in a browser, **or**
- serve the folder: `python3 -m http.server` and open http://localhost:8000, **or**
- enable GitHub Pages (Settings → Pages → Source: *GitHub Actions*); the included workflow deploys every push to `main`.

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
- **Modes:** 1v1 vs bot, 2v2 with a bot ally, or 2 players on the same PC. Bots come in Easy / Normal / Hard.

## Code layout

```
index.html        page + menus
css/style.css     menu styling
js/util.js        helpers, physics constants
js/audio.js       synthesized sound effects (WebAudio)
js/terrain.js     island generation, destructible mask, themes
js/art.js         sky, chibi characters, hats, bombs
js/game.js        game loop, physics, turns, items, bot AI, HUD
js/main.js        menu wiring
```

The world runs at a fixed 120 Hz step; the bot aims by simulating shots with the exact same
step function (`TK.stepShot`), then adds difficulty-based error.

## Ideas for next steps

- Online multiplayer (WebSocket room server)
- More weapons/characters with distinct projectiles
- Map editor, more themes
- Progression that stays cosmetic-only
