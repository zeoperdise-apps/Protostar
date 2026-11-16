# PROTOSTAR — AUTONOMOUS COMBAT LAB

[日本語](README.md) · English

A Japanese/English browser game where you program a 16×16 grid of chips and branch arrows, then watch robots fight autonomously. Inspired by a 2010 Java ME prototype, it includes backward movement, diagnostics, independent left/right weapons, a robot library, six opponents, battle results, editing, and local saves. There is no story or online multiplayer.

## Run

Requires Node.js 22.12 or later (verified with Node.js 24).

```sh
npm ci
npm run dev
```

Open the displayed URL. The development server listens on `0.0.0.0:5173`. Build with `npm run build`, then serve `dist/` over HTTP. For a local production preview:

```sh
npm run build
npm run preview -- --port 4173
```

Open `http://localhost:4173`. Relative asset URLs support deployment under a subpath. The game needs no external images, fonts, or network services. Use HTTP rather than opening `index.html` directly.

## Language

Use **JA / EN** in the header or an open dialog. New saves follow the browser language: Japanese for `ja*`, English otherwise. Your explicit choice is saved and included in JSON exports. Older saves default to Japanese. Switching language preserves the current match, robot design, selected cell, and undo history. Robot names are your data: saved or imported Japanese names remain unchanged in English. New starter robots and newly copied preset templates receive names in the current language.

## Play

1. **Choose a robot.** The three starters are ready to fight. In Robot Library, pick one of three frames and a weapon for each side, using their descriptions and stats.
2. **Test your tactics.** Choose one of six presets in Battle and press Start match. Custom AI vs custom AI and self matches also work. Destruction ends combat; at 90 seconds, remaining HP ratio decides, then damage dealt. Preset victories are recorded locally.
3. **Refine the AI.** In AI Workbench, select a cell and place a chip from the palette. Set its parameter and normal or YES/NO arrows in the inspector. Changes save automatically and apply to the next match.

Pause, step 0.1 seconds (6 ticks), change speed to 1×/2×/4×, or reset with the same conditions. The execution trace shows current cells, branches, instructions, and misfires. Sensor overlays show the active sensor's actual parameters and YES/NO result. A broken link may report that no result was recorded. Enemy sensors account for cover, although their range diagrams are not clipped by it. Front detection uses the configured half-angle and range 600; near uses the configured distance; left uses the left half-plane within 600. The obstacle overlay shows the 88-unit probe and collision boundaries expanded by the robot radius plus 3; wall limits use the robot radius.

Press Space to pause/resume outside form fields. Changing screens or hiding the browser tab pauses combat. Focus a grid cell and press Delete to remove its chip. Ctrl/Cmd+Z or Undo restores up to 100 edits. Scroll, zoom, or fit the board. Guide explains all 19 chips. Design changes during a match take effect in the next match, including sensor geometry.

## AI connections

- Place exactly one START. Normal arrows lead to an adjacent cell.
- Conditions have separate YES and NO arrows.
- END returns to START. JUMP A–E goes to the matching LABEL A–E.
- Empty or off-grid links return to START. Warnings permit execution.
- Errors such as missing/duplicate START or missing LABEL block a match. A control-only infinite loop halts safely.
- Left and right weapons cool independently. A shot requested while cooling or without enough energy misfires, then follows its arrow.

Preset objects are never edited directly. Copying a template creates a new robot rather than replacing your AI.

## Saves and JSON

Robots, AI, settings, and victories are saved in this browser's localStorage under `protostar.save.v1`. No account or server is involved. If storage is unavailable, the UI reports memory-only storage. Export all data from Robot Library to keep a backup.

Importing one robot assigns a new ID and adds it to the library (up to 24 robots). A full-save import is validated before asking you to replace the current data. Invalid files preserve your current save. Imports are limited to 1 MB. The last robot cannot be deleted. Both languages use the same version 1 schema; missing locale in older saves becomes Japanese, and invalid explicit locales are rejected.

## Implementation and verification

Vite + TypeScript + Three.js with an **orthographic, entirely 2D** renderer. Robots and floor use generated canvas textures; projectiles, trails, and sensors use flat shapes and lines. No 3D models, boxes, lights, or perspective camera are used. WebGL failure leaves AI editing and saving available. Optional WebAudio effects start after a user gesture.

```sh
npm run typecheck
npm test
npm run balance
npm run build
```

The unit suite covers engine, persistence, sensors, and localization. Balance runs 63 matches. `node scripts/i18n-playtest.cjs` followed by `node scripts/i18n-edge-playtest.cjs` runs Japanese/English Chromium checks without recording, saving screenshots and a report under `artifacts/i18n-*`. It uses Playwright core and Chromium at the paths listed in the script. The historical Japanese browser suites explicitly request a Japanese browser locale.

See [design](docs/game-design.md), [engine/save API](docs/api.md), [original production QA](docs/qa-final.md), and [localization QA](docs/qa-i18n.md).
