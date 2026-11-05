# Visual identity concepts

Exploration for Tanker's look. Nothing here is used by the game yet.

Each scene is drawn procedurally on a canvas (no image assets) and saved as a PNG.

| File | Direction |
| --- | --- |
| `renders/a-paper-skies.png` | **A · Paper Skies**: cut-paper diorama world |
| `renders/b-ink-and-thunder.png` | **B · Ink & Thunder**: woodblock print |
| `renders/c-pulp-sky-comics.png` | **C · Pulp Sky Comics**: 1960s halftone comic |
| `renders/d-graph-paper-wars.png` | **D · Graph Paper Wars**: notebook doodles, protractor + ruler HUD |
| `renders/e-paper-world-ink-heroes.png` | Paper world with inked heroes (rejected: the two styles clash) |
| `renders/pose-sheet.png` | The 6 heroes x 4 states (idle, aim, hit, win), inked style |
| `renders/f-papercraft-puppets*.png` | **Unified option 1**: paper world + papercraft puppet heroes |
| `renders/g-storybook-ink*.png` | **Unified option 2**: inked world + inked heroes |

## Files

- `heroes.js`: expressive hero renderer (6 heroes, 4 poses, ink or paper style via `window.HERO_STYLE`)
- `render.html`: all the scene renderers
- `sheet.html`: the pose sheet
- `render-scenes.js`, `render-sheet.js`: Playwright scripts that save the PNGs into `renders/`

```bash
node concepts/render-scenes.js paper,ink,pulp,doodle,paperpup,paperpupcast,inkworld,inkcast
node concepts/render-sheet.js
```
