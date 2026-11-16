import test from 'node:test';
import assert from 'node:assert/strict';
import { BattleEngine } from '../src/game/engine';
import { createEmptyProgram, makeChip } from '../src/game/program';
import { createStarterRobots } from '../src/data/presets';
import type { ChipKind } from '../src/game/types';
import { sensorOverlay } from '../src/render/sensors';

function battle(kind: ChipKind, param?: number) {
  const robots = createStarterRobots();
  const program = createEmptyProgram();
  program.cells[0] = makeChip('Start');
  program.cells[1] = makeChip(kind, { ...(param === undefined ? {} : { param }), yes: 'E', no: 'S' });
  program.cells[2] = makeChip('Wait', { param: 1 });
  program.cells[17] = makeChip('Wait', { param: 1 });
  robots[0].program = program;
  const engine = new BattleEngine({ robots: [robots[0], robots[1]], arena: { width: 960, height: 640, obstacles: [] } });
  return { engine, program };
}

test('renderer sensor cone reads the active program parameter and real branch result', () => {
  for (const angle of [12, 18, 60, 90]) {
    const { engine, program } = battle('EnemyAhead', angle);
    const overlay = sensorOverlay(engine.step(4).robots[0], program)!;
    assert.equal(overlay.range, 600);
    assert.ok(Math.abs(overlay.to - angle * Math.PI / 180) < 1e-12);
    assert.equal(overlay.result, 'YES');
  }
});

test('renderer distance sensor follows custom ranges including NO outcomes', () => {
  for (const range of [160, 420, 800]) {
    const { engine, program } = battle('EnemyNear', range);
    const state = engine.step(4).robots[0];
    const overlay = sensorOverlay(state, program)!;
    assert.equal(overlay.range, range);
    assert.equal(overlay.result, range < 600 ? 'NO' : 'YES');
    assert.equal(overlay.to - overlay.from, Math.PI * 2);
  }
});

test('renderer left and obstacle geometry match engine half-plane and probe length', () => {
  const left = battle('EnemyLeft');
  const half = sensorOverlay(left.engine.step(4).robots[0], left.program)!;
  assert.equal(half.from, -Math.PI); assert.equal(half.to, -.001); assert.equal(half.range, 600);
  const obstacle = battle('ObstacleAhead');
  assert.equal(sensorOverlay(obstacle.engine.step(4).robots[0], obstacle.program)!.range, 88);
});

test('renderer hides sensors before execution and when the current instruction changes', () => {
  const { engine, program } = battle('EnemyNear', 800);
  assert.equal(sensorOverlay(engine.snapshot().robots[0], program), null);
  assert.ok(sensorOverlay(engine.step(4).robots[0], program));
  assert.equal(sensorOverlay(engine.step(3).robots[0], program), null);
});

test('renderer never invents a NO result when an empty sensor arrow restarts the program', () => {
  const { program } = battle('EnemyNear', 800);
  program.cells[2] = null;
  const robots = createStarterRobots(); robots[0].program = program;
  const state = new BattleEngine({ robots: [robots[0], robots[1]] }).step(4).robots[0];
  assert.equal(state.lastBranch, 'restart');
  assert.equal(sensorOverlay(state, program)!.result, '結果未記録（空リンク）');
});
