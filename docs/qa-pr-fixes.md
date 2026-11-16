# PR #1 review fixes

2026-11-16 UTC. Addresses the two P2 findings in `artifacts/pr-review-1.md`.

- F1: successful full-save replacement clears every Workbench Undo stack. Cancelled/invalid imports, single-robot imports, language changes and ordinary robot selection keep their histories. New edits after replacement create a fresh history.
- F2: omitted `next`, `yes` and `no` links display `↺` and an explicit localized “Unset → return to START” selection. Selecting Unset deletes the property rather than saving an empty string. Board titles, accessible names, legend and mini-guide explain the state. YES/NO remain independent; their controls are stacked so the full Unset explanation fits. End and Jump have no direction controls. Interpreter semantics, chip creation defaults and save format are unchanged.

Validation uses the production build in Chromium/SwiftShader at `http://127.0.0.1:4175`, without video recording or engine-state mutation:

```sh
npm test
npm run typecheck
npm run build
npm run preview -- --port 4175
# In a separate terminal:
node scripts/pr-fixes-playtest.cjs
```

The UI script verifies the exact 30→45→import 90 reproduction, disabled Undo after replacement for all robot IDs, fresh 90→45→Undo 90, reload persistence, and history preservation for cancelled/invalid imports, JA↔EN, robot changes and single-robot additions. It also imports omitted next/YES/NO links, checks the real START-recovery trace, connects each branch to an adjacent FIRE L and observes its real execution, then unsets the link and checks key omission and START recovery. It covers all four direction choices, one-sided conditional links, JA/EN, full-save download/import/reload, and editing/Fit at 390px.

All 29 unit tests, typecheck, build and the UI regression passed. The only build warning was Vite’s existing bundle-size advisory. The final layout check passed in JA/EN at 1440px and 390px, including measured space for the full selected text; screenshots were opened and visually inspected. Both UI reports contain zero page exceptions.

Results and still images: `artifacts/pr-fix-report.json`, `artifacts/pr-fix-layout-report.json`, `artifacts/pr-fix-*.png`, and the UI-exported `artifacts/pr-fix-roundtrip.json`. These generated files are not committed. The first harness attempt's failure is preserved in `artifacts/pr-fix-attempt-1-report.json`: starting and pausing at an arbitrary tick sampled START's NEXT after an actual restart. The harness now uses the UI reset and two 0.1-second steps, so current-branch observations begin at tick zero. This was a harness timing assertion, with no page exception.

The existing first-playthrough video and original review artifacts remain intact. No re-recording, balance-suite rerun, merge or combat-engine changes are part of this fix.
