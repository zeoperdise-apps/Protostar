# PROTOSTAR simulation / UI integration API

This implementation is plain TypeScript; the completed Three.js renderer, DOM menus, audio and editor consume this API. Import engine/types/catalog helpers from `src/game/index.ts`; presets from `src/data/presets.ts`; persistence from `src/storage/save.ts`.

## Battle lifecycle

```ts
import { BattleEngine } from '../game/engine';
import { PRESETS, createStarterRobots } from '../data/presets';
const engine = new BattleEngine({
  robots: [createStarterRobots()[0], PRESETS[0].robot],
  seed: 2026,
  timeLimit: 90,
});
let frame = engine.snapshot();
frame = engine.step(1);  // one fixed 1/60 second tick
frame = engine.step(30); // many ticks, one returned snapshot
frame = engine.reset(); // original config and seed, byte-equivalent reproducible outcome
```

`BattleConfig.robots` is always `[left/player, right/opponent]`. Each participant is cloned independently, even when both inputs are the same object. No preset logic exists inside the engine. Recreate the engine when designs, equipment, arena or seed change. `reset()` restores the initial copies, ignoring subsequent caller mutations. `step(n)` accepts a finite number, floors it and bounds it to 0–36000 ticks, stops at a result, and returns a detached snapshot. `finished` and `tick` are cheap getters. Pause, speed, frame accumulation and single-step are controller responsibilities. Use a 60 Hz accumulator, bounded catch-up (e.g. 8 ticks per render), and call `step(n)` once per render; never advance the engine based on variable delta time. On a paused frame reuse the last snapshot.

`BattleSnapshot`: `tick`, `elapsed` (seconds), `timeLimit`, `seed`, `arena`, `robots`, `projectiles`, recent `events`, nullable `result`. The snapshot copies small mutable records; it never copies entire AI programs per frame. Coordinates are pixels in a 960×640 default arena, +X right, +Y down. Radian angle 0 points right, positive rotates clockwise. Use an orthographic camera with matching coordinates. Default spawns face one another at (180,320) and (780,320); obstacle geometry is seed independent and symmetrical. Optional `arena` and `spawns` in config are useful for tests or future arena selection.

Each `RobotSnapshot` includes `slot`, `designId`, `name`, `frame`, equipment IDs, `color`, `x/y/angle/radius`, `hp/maxHp`, `energy/maxEnergy`, cooldown seconds for each side, `action` (`Forward`, `Backward`, `TurnLeft`, `TurnRight`, `Wait`, or null), `halted`, diagnostics, stats and recent history. `currentCell` and alias `cell` identify the most recently executed chip; `nextCell` identifies the instruction to be executed after the current action. `lastBranch` is `next`, `yes`, `no`, `jump`, `restart` or `halt`. `history` has the latest 32 `InstructionTrace` entries with `tick/cell/kind/branch/target/success`. A weapon requested while cooling or without energy has `success: false`; its program arrow still advances.

`ProjectileSnapshot` exposes `id/owner/weapon/x/y/vx/vy/radius/remaining`. Projectile IDs restart on reset. `events` retains at most 160 shot/hit/impact/end events from the last 2 simulated seconds; use monotonically increasing event IDs to consume each sound/effect once. Clear consumed-ID bookkeeping on a new match/reset. Hits carry attacker `slot`, `target`, damage, contact point. Battle results carry winner slot (`null` for a draw), reason (`destroyed`, `double-ko`, `timeout`), duration seconds, seed, and each robot's `damage/shots/hits/accuracy/instructions/blockedMoves/hp/maxHp`. Accuracy is a 0–1 ratio; each scatter pellet counts as one shot/hit. Damage includes projectile overkill, and is applied to both sides together at the end of the tick. A timeout compares remaining HP ratio, then damage, then draws.

Movement and turning spend time and energy; collisions block movement without teleporting through obstacles, walls or opponents. Weapon cooldowns are independent; recharge continues during actions and waits. All chips take at least 3 ticks (50 ms). A control/sensor-only loop halts after 128 consecutive instructions and reports an error; action programs remain bounded to one dispatch per tick. There is no `Math.random()` in combat: only seeded projectile spread uses RNG. Small firing correction targets a visible enemy within +/-18° of the facing direction; otherwise projectiles fire straight. Sensors obey obstacle line of sight. There is no automatic tracking outside this correction cone.

## Robot library and editor

`createStarterRobots(locale?: 'ja' | 'en')` returns three fresh playable designs. `PRESETS` contains six `{id, level, name, description, robot}` entries. All can be chosen immediately; `clearedPresets` is only a local victory badge. Never mutate exported preset objects: `cloneRobot(preset.robot, newId?, newName?)` deep-copies editable cells. Custom-v-custom uses the same engine path, including self matches.

A `RobotDesign` is `{id, name, frame, leftWeapon, rightWeapon, program}`. Equipment catalogues `FRAMES` and `WEAPONS` are keyed records containing source Japanese names/descriptions (use the localized presentation adapters for UI) and actual stats. Frame IDs: `scout`, `balanced`, `fortress`. Weapon IDs: `pulse`, `rail`, `scatter`. `CHIPS` is an ordered palette of 19 definitions; `CHIP_CATALOG[kind]` offers `name`, `short`, `description`, `category`, `conditional`, optional `defaultParam`, optional `params: {value,label}[]`. Category IDs: `flow`, `movement`, `sensor`, `diagnostic`, `weapon`. `makeChip(kind, overrides?)` sets default parameter and arrows.

A `Program` is `{size:16, cells:[...256 entries...]}`. Each entry is null or `{kind,param?,next?,yes?,no?}`. `cellIndex(x,y)=y*16+x`; coordinates and indices are zero based. `cellCoordinates(index)` is the inverse. `Direction` is `N|E|S|W`, always an adjacent cell. Normal chips follow `next`; conditional chips follow `yes/no`. `End` restarts at Start; `Jump` resolves a `Label` named A–E. Missing/empty/outside arrows restart at Start. `Label` then follows its normal arrow. `createEmptyProgram()` returns fresh null cells.

Chip parameters:

| Kind | Parameter |
|---|---|
| Label / Jump | `A`…`E` |
| Forward / Backward | `short` (34 px), `medium` (72 px) |
| TurnLeft / TurnRight | 30, 45, 90 degrees |
| Wait | 0.05–5 seconds |
| EnemyAhead | half-angle degrees (default 18; sensor distance 600) |
| EnemyNear | range in pixels (default 260) |
| HpLow / EnergyLow | fraction 0–1 (default .35 / .25) |
| other kinds | none |

`validateProgram(program)` returns `Diagnostic[]`; `compileProgram(program)` also returns `start` and label lookup. Each diagnostic has `severity`, `code`, Japanese `message` and, for local problems, `cell/x/y`. A missing Start is a global error with no cell. Errors (duplicate/missing Start/labels, unknown chips/invalid parameters) halt that participant safely; the UI should surface errors before starting and let the editor jump to the cell. Warnings (broken link, unreachable chip) permit running and do not prevent storing unfinished work. Engine `control-loop` diagnostics arise during execution. The UI can mark both warnings and errors and distinguish them visually.

## Persistence and JSON

```ts
const store = new SaveStore(); // localStorage by default; pass null for memory only
const save = store.load();     // detached mutable data for UI
store.save(save);             // validates, updates memory, attempts persistence
store.recordVictory('training');
const fileText = store.export();
const result = store.import(fileText); // {ok,data? ,error?}; failure preserves old state
```

`store.status` exposes `persistent`, `recovered`, `message`, and optional stable `code` for live localized UI display. Storage denial or quota errors switch to memory automatically. Corrupt/unsupported saved data recovers to three valid starter samples and attempts to persist the repair. Show the status message unobtrusively. No access to storage is required for play.

Storage key: `protostar.save.v1`. Version 1 schema (`SaveData`):

```json
{
  "version": 1,
  "robots": [{"id":"custom-chaser","name":"01 / 追撃カスタム","frame":"balanced","leftWeapon":"pulse","rightWeapon":"pulse","program":{"size":16,"cells":["...256 null/chip entries..."]}}],
  "clearedPresets": ["training"],
  "settings": {"locale":"ja","sound":true,"volume":0.35,"speed":1,"showSensors":false,"showTrails":true},
  "config": {"leftRobotId":"custom-chaser","opponentType":"preset","opponentId":"training","seed":2026}
}
```

Full-save `importSave/exportSave` and single-robot `importRobot/exportRobot` are available independently. `validateSave/validateRobot` throw on invalid input and return sanitized detached copies; importing returns friendly errors instead. Imports are limited to 1 MB of UTF-8, 1–24 robots, exactly 16×16 cells, names ≤40 characters, IDs ≤64, known equipment/chip/direction/parameter values, finite numeric bounds, unique IDs and existing selected-opponent references. Object fields are picked explicitly; unexpected properties are discarded. Unfinished AI graphs are allowed to save/import and remain the workbench's responsibility. Imported robot IDs may collide with an existing library: the UI should assign a new ID before appending or explicitly replace the chosen design, then call `store.save`. UI-generated names/IDs must respect these bounds. After deleting a robot, repair current selections before saving.

Preset IDs in order: `training`, `hunter`, `twin`, `evader`, `sniper`, `adaptive`. Settings speed is exactly 1, 2 or 4; seed is an unsigned 32-bit integer. No server, account, story state, network opponent or monetization exists.

## Verification

`npm run typecheck`, `npm test`, `npm run balance`, `npm run build`. The balance script runs 54 starter-v-preset matches across seeds 1/42/2026, plus all 9 starter-v-starter combinations. Every match must finish in 90 seconds and inflict some damage. Tests cover interpreter branches/jumps and bounded bad graphs, backwards/diagnostics, geometry/sensors/collisions, equipment/cooldowns/energy, swept projectile cover, KO/draw/timeout/determinism, isolated source/snapshot objects, and storage corruption/import recovery. Browser renderer/UI checks are in `scripts/playtest.cjs` and `scripts/final-playtest.cjs`; final verification is documented in `docs/qa-final.md`.

## Renderer sensor adapter

`src/render/sensors.ts` reads the current executed sensor and its result from the snapshot, using a detached program copied when the match starts. It never changes the engine. Enemy cones/circles honor chip parameters; left detection excludes the front 0.001 rad boundary. The obstacle overlay shows the 88px probe, obstacle/enemy circles expanded by self radius + 3, and wall center limits inset by self radius. Enemy range shapes are not clipped to line-of-sight cover: the separately displayed YES/NO comes from the engine. When a broken arrow discards the boolean and restarts, the UI reports that the result was not recorded.

## Localization boundary

`Locale` is `'ja' | 'en'`. `src/i18n/messages.ts` gives both dictionaries the same compile-time key set. `t(key, params?, locale?)` handles explicit message keys and structured interpolation; source catalog labels use exact dictionary lookup. `setLocale()` updates `html.lang`, title, and the meta description. `catalog()` and `presets()` in `src/i18n/display.ts` return localized display records without mutating the exported game definitions. Engine IDs, parameters, geometry, balance, and execution are language independent.

`Diagnostic` retains the existing Japanese `message` API and stable `code`, adding optional `params`, `kind`, and `branch` metadata. UI uses `diagnosticMessage()` to format the code and metadata in the selected language. It never pattern-translates Japanese engine messages. Storage `ValidationError` similarly carries `code` and `params`; `errorMessage(error, locale)` formats it at the UI boundary. `importSave(json, locale = 'ja')` and `importRobot(json, locale = 'ja')` return errors in the requested language. `StorageStatus.code` allows storage/failure messages to follow live language changes.

`Settings.locale` is persisted under the existing version **1** and key **`protostar.save.v1`**. `validateSave` fills an omitted locale with `'ja'` for old-save compatibility, rejects an explicit value other than `'ja'`/`'en'`, and includes locale in its sanitized return. Robots, AI, IDs, names, equipment, selected opponents, and victory records are preserved. Export/import round trips include locale. New stores can request a locale with `new SaveStore(storage?, locale = 'ja')`; `createDefaultSave(locale = 'ja')` and `createStarterRobots(locale = 'ja')` keep pure TypeScript defaults compatible. The browser controller passes `browserLocale(navigator.language)` only for newly created/recovered data; a valid saved locale always wins, and missing locale in an old save remains Japanese.

`RobotDesign.name` is editable user data and is never translated on load, language selection, or import. New starter designs and copied preset templates receive localized names only at creation. Preset card/selector names use preset IDs for presentation. Battle HUD/result names resolve preset participants against the preset IDs captured when the match was created, while custom names remain the engine snapshot's user data even if setup changes during a paused battle.

The controller changes language without recreating the engine, renderer, animation loop, or workbench instance. Bound static DOM messages update in place; localized lists and inspector content rerender while retaining selection, undo history, search, zoom, board scroll, field drafts, and window scroll. Open dialogs and renderer fallbacks follow language changes. Language selection is saved immediately, including memory-only storage behavior.
