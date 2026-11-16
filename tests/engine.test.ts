import test from 'node:test';
import assert from 'node:assert/strict';
import { BattleEngine, MAX_CONTROL_CHAIN } from '../src/game/engine';
import { CHIP_CATALOG, WEAPONS } from '../src/game/catalog';
import { cellIndex, compileProgram, createEmptyProgram, makeChip, resolveNext, validateProgram } from '../src/game/program';
import { PRESETS, cloneRobot, createStarterRobots } from '../src/data/presets';
import type { ArenaDefinition, Chip, ChipKind, Program, RobotDesign } from '../src/game/types';
const clearArena: ArenaDefinition = { width: 960, height: 640, obstacles: [] };
function linear(chips: Chip[]): Program {
  const program = createEmptyProgram();
  [makeChip('Start'), ...chips, makeChip('End')].forEach((chip, index) => { program.cells[index] = { ...chip }; });
  return program;
}
function robot(program = linear([makeChip('Wait', { param: 0.5 })]), overrides: Partial<RobotDesign> = {}): RobotDesign {
  return { id: 'test', name: 'Test', frame: 'balanced', leftWeapon: 'pulse', rightWeapon: 'pulse', program, ...overrides };
}
function duel(left: RobotDesign, right = robot(), options: Partial<ConstructorParameters<typeof BattleEngine>[0]> = {}): BattleEngine {
  return new BattleEngine({ robots: [left, right], arena: clearArena, seed: 42, spawns: [{ x: 250, y: 320, angle: 0 }, { x: 700, y: 320, angle: Math.PI }], ...options });
}
function branchProgram(kind: ChipKind, param?: number): Program {
  const program = createEmptyProgram();
  program.cells[0] = makeChip('Start');
  program.cells[1] = makeChip(kind, { ...(param !== undefined ? { param } : {}), yes: 'E', no: 'S' });
  program.cells[2] = makeChip('Wait', { param: 1, next: 'W' });
  program.cells[17] = makeChip('Wait', { param: 1, next: 'N' });
  return program;
}
function sensed(kind: ChipKind, param?: number, options: Partial<ConstructorParameters<typeof BattleEngine>[0]> = {}): 'yes' | 'no' {
  const snapshot = duel(robot(branchProgram(kind, param)), robot(), options).step(4);
  return snapshot.robots[0].history.find(item => item.kind === kind)!.branch as 'yes' | 'no';
}

test('conditional YES/NO are distinct orthogonal links; empty and off-grid links restart', () => {
  const program = branchProgram('EnemyNear', 300), compiled = compileProgram(program);
  assert.equal(compiled.diagnostics.filter(item => item.severity === 'error').length, 0);
  assert.deepEqual(resolveNext(program, compiled, 1, true), { target: 2, branch: 'yes' });
  assert.deepEqual(resolveNext(program, compiled, 1, false), { target: 17, branch: 'no' });
  program.cells[1]!.yes = 'N';
  assert.deepEqual(resolveNext(program, compiled, 1, true), { target: 0, branch: 'restart' });
  assert.ok(validateProgram(program).some(item => item.code === 'broken-link'));
});

test('Label/Jump A–E and End execute through the real interpreter', () => {
  const program = createEmptyProgram();
  program.cells[0] = makeChip('Start'); program.cells[1] = makeChip('Jump', { param: 'E' });
  program.cells[cellIndex(5, 5)] = makeChip('Label', { param: 'E' });
  program.cells[cellIndex(6, 5)] = makeChip('FireLeft'); program.cells[cellIndex(7, 5)] = makeChip('End');
  const snapshot = duel(robot(program)).step(18);
  const history = snapshot.robots[0].history;
  assert.deepEqual(history.slice(0, 5).map(item => item.kind), ['Start', 'Jump', 'Label', 'FireLeft', 'End']);
  assert.equal(history[1].target, cellIndex(5, 5));
  assert.equal(snapshot.robots[0].stats.shots, 1);
});

test('missing/duplicate starts and labels are diagnosed and safely halted', () => {
  const empty = createEmptyProgram();
  assert.ok(validateProgram(empty).some(item => item.code === 'missing-start'));
  assert.equal(duel(robot(empty)).step(200).robots[0].stats.instructions, 0);
  const bad = linear([makeChip('Start'), makeChip('Label', { param: 'A' }), makeChip('Label', { param: 'A' }), makeChip('Jump', { param: 'E' })]);
  const codes = validateProgram(bad).map(item => item.code);
  assert.ok(codes.includes('duplicate-start') && codes.includes('duplicate-label') && codes.includes('missing-label'));
  assert.ok(duel(robot(bad)).step(100).robots[0].halted);
});

test('infinite control graph consumes bounded instructions, halts, and cannot block simulation', () => {
  const program = linear([makeChip('Label', { param: 'A' }), makeChip('Jump', { param: 'A' })]);
  const snapshot = duel(robot(program), robot(), { timeLimit: 20 }).step(600);
  assert.equal(snapshot.tick, 600);
  assert.equal(snapshot.robots[0].stats.instructions, MAX_CONTROL_CHAIN);
  assert.equal(snapshot.robots[0].halted, true);
  assert.ok(snapshot.robots[0].diagnostics.some(item => item.code === 'control-loop'));
});

test('backward changes position opposite heading without changing heading', () => {
  const snapshot = duel(robot(linear([makeChip('Backward', { param: 'medium' }), makeChip('Wait', { param: 5 })]))).step(60);
  assert.ok(snapshot.robots[0].x < 190);
  assert.equal(snapshot.robots[0].angle, 0);
  assert.ok(snapshot.robots[0].energy < 100 || snapshot.robots[0].stats.instructions > 1);
});

test('HP, energy, weapon readiness diagnostics really branch', () => {
  assert.equal(sensed('HpLow', 0.5), 'no'); assert.equal(sensed('HpLow', 1), 'yes');
  assert.equal(sensed('EnergyLow', 0.3), 'no'); assert.equal(sensed('EnergyLow', 1), 'yes');
  assert.equal(sensed('LeftReady'), 'yes'); assert.equal(sensed('RightReady'), 'yes');
  const program = linear([makeChip('FireLeft'), makeChip('LeftReady', { yes: 'E', no: 'S' }), makeChip('Wait')]);
  program.cells[18] = makeChip('Wait', { next: 'N' });
  const state = duel(robot(program)).step(7).robots[0];
  assert.equal(state.history.find(item => item.kind === 'LeftReady')!.branch, 'no');
  assert.ok(state.cooldownLeft > 0 && state.cooldownRight === 0);
});

test('enemy cone, distance, left-side and obstacle sensors honor geometry and line of sight', () => {
  assert.equal(sensed('EnemyAhead'), 'yes');
  assert.equal(sensed('EnemyNear', 300), 'no'); assert.equal(sensed('EnemyNear', 500), 'yes');
  const leftSpawns: ConstructorParameters<typeof BattleEngine>[0]['spawns'] = [{ x: 250, y: 320, angle: 0 }, { x: 400, y: 180, angle: 0 }];
  assert.equal(sensed('EnemyLeft', undefined, { spawns: leftSpawns }), 'yes');
  assert.equal(sensed('EnemyAhead', 18, { spawns: leftSpawns }), 'no');
  const blocked: ArenaDefinition = { ...clearArena, obstacles: [{ id: 'shield', x: 330, y: 320, radius: 25 }] };
  assert.equal(sensed('EnemyAhead', 18, { arena: blocked }), 'no');
  assert.equal(sensed('EnemyNear', 600, { arena: blocked }), 'no');
  assert.equal(sensed('EnemyLeft', undefined, { arena: blocked }), 'no');
  assert.equal(sensed('ObstacleAhead', undefined, { arena: blocked }), 'yes');
  assert.equal(sensed('ObstacleAhead'), 'no');
  assert.equal(sensed('ObstacleAhead', undefined, { spawns: [{ x: 930, y: 320, angle: 0 }, { x: 500, y: 320, angle: 0 }] }), 'yes');
});

test('left/right equipment, cooldown and energy are independent; no shot while cooling', () => {
  const program = linear([makeChip('FireLeft'), makeChip('FireRight'), makeChip('FireLeft'), makeChip('FireRight')]);
  const snapshot = duel(robot(program, { leftWeapon: 'rail', rightWeapon: 'scatter' })).step(14);
  assert.deepEqual(snapshot.events.filter(event => event.type === 'shot').map(event => event.weapon), ['rail', 'scatter']);
  assert.equal(snapshot.robots[0].stats.shots, 4);
  assert.ok(snapshot.robots[0].cooldownLeft > snapshot.robots[0].cooldownRight);
  assert.ok(snapshot.robots[0].energy < 70);
  assert.equal(snapshot.robots[0].history.filter(item => !item.success).length, 2);
  assert.ok(snapshot.projectiles.some(projectile => projectile.weapon === 'rail' && projectile.remaining > WEAPONS.scatter.range));
});

test('sustained expensive fire is gated by energy and recovers during waits', () => {
  const spam = linear([makeChip('FireLeft'), makeChip('FireRight')]);
  const engine = duel(robot(spam, { leftWeapon: 'rail', rightWeapon: 'rail' }), robot(), { timeLimit: 30, spawns: [{ x: 250, y: 320, angle: Math.PI }, { x: 700, y: 320, angle: 0 }] });
  const snapshot = engine.step(1800), left = snapshot.robots[0];
  assert.ok(left.energy >= 0 && left.energy <= 100);
  // Maximum firing is bounded by initial reserve plus generated energy, even when every loop requests both weapons.
  assert.ok(left.stats.shots * WEAPONS.rail.energy <= 100 + 20 * snapshot.elapsed + 1e-6);
  assert.ok(left.stats.shots < Math.ceil(snapshot.elapsed / WEAPONS.rail.cooldown) * 2, 'energy limits firing below the cooldown-only rate');
  assert.ok(left.history.some(item => (item.kind === 'FireLeft' || item.kind === 'FireRight') && !item.success));
  const waiting = duel(robot(linear([makeChip('FireLeft'), makeChip('FireRight'), makeChip('Wait', { param: 5 })]), { leftWeapon: 'rail', rightWeapon: 'rail' }));
  assert.ok(waiting.step(280).robots[0].energy > 95);
});

test('swept bullets hit at high speed; rocks completely shield enemies', () => {
  const shooter = robot(linear([makeChip('FireLeft'), makeChip('Wait', { param: 0.5 })]), { leftWeapon: 'rail' });
  const closeSpawns: ConstructorParameters<typeof BattleEngine>[0]['spawns'] = [{ x: 250, y: 320, angle: 0 }, { x: 350, y: 320, angle: Math.PI }];
  assert.ok(duel(shooter, robot(), { spawns: closeSpawns }).step(30).robots[1].hp < 100);
  const blocked: ArenaDefinition = { ...clearArena, obstacles: [{ id: 'cover', x: 300, y: 320, radius: 18 }] };
  const snapshot = duel(shooter, robot(), { spawns: closeSpawns, arena: blocked }).step(240);
  assert.equal(snapshot.robots[1].hp, 100); assert.equal(snapshot.robots[0].stats.hits, 0);
  assert.ok(snapshot.events.some(event => event.type === 'impact'));
});

test('movement cannot penetrate rocks, walls or the opponent', () => {
  const mover = robot(linear([makeChip('Forward', { param: 'medium' })]));
  const blocked: ArenaDefinition = { ...clearArena, obstacles: [{ id: 'rock', x: 330, y: 320, radius: 30 }] };
  const state = duel(mover, robot(), { arena: blocked }).step(240).robots[0];
  assert.ok(state.x <= 282.001); assert.ok(state.stats.blockedMoves > 0);
  const colliding = duel(mover, mover, { spawns: [{ x: 400, y: 320, angle: 0 }, { x: 500, y: 320, angle: Math.PI }] }).step(240);
  assert.ok(colliding.robots[1].x - colliding.robots[0].x >= 35.999);
  const wall = duel(mover, robot(), { spawns: [{ x: 930, y: 320, angle: 0 }, { x: 500, y: 320, angle: 0 }] }).step(240).robots[0];
  assert.ok(wall.x <= 942);
});

test('death, simultaneous KO, timeout and HP-ratio tie breaking produce complete results', () => {
  const shooter = robot(linear([makeChip('FireLeft'), makeChip('FireRight')]), { leftWeapon: 'rail', rightWeapon: 'rail' });
  const spawns: ConstructorParameters<typeof BattleEngine>[0]['spawns'] = [{ x: 250, y: 320, angle: 0 }, { x: 450, y: 320, angle: Math.PI }];
  const ko = duel(shooter, robot(), { spawns }).step(5400).result!;
  assert.equal(ko.winner, 0); assert.equal(ko.reason, 'destroyed'); assert.ok(ko.robots[0].accuracy > 0);
  const draw = duel(shooter, shooter, { spawns }).step(5400).result!;
  assert.equal(draw.winner, null); assert.equal(draw.reason, 'double-ko');
  const timeout = duel(robot(), robot(), { timeLimit: 1 }).step(120).result!;
  assert.equal(timeout.reason, 'timeout'); assert.equal(timeout.winner, null); assert.equal(timeout.duration, 1);
  const partial = duel(shooter, robot(), { spawns, timeLimit: 1 }).step(120).result!;
  assert.equal(partial.reason, 'timeout'); assert.equal(partial.winner, 0);
});

test('same seed and reset reproduce every stat, projectile, event and instruction; snapshots are detached', () => {
  const [left, right] = createStarterRobots();
  const a = new BattleEngine({ robots: [left, right], seed: 123 }), b = new BattleEngine({ robots: [left, right], seed: 123 });
  const first = a.step(5400); assert.deepEqual(first, b.step(5400));
  a.reset(); assert.deepEqual(a.step(5400), first);
  first.robots[0].hp = 999; first.arena.obstacles[0].radius = 999; first.robots[0].stats.shots = 999;
  assert.notEqual(a.snapshot().robots[0].hp, 999); assert.notEqual(a.snapshot().arena.obstacles[0].radius, 999);
  const same = duel(left, left).step(100);
  assert.notEqual(same.robots[0].history, same.robots[1].history);
  assert.equal(left.program.cells[0], null); // source program was never advanced or changed
});

test('all starter/preset AI graphs are valid, every required chip has UI metadata, presets are distinct clones', () => {
  assert.equal(PRESETS.length, 6); assert.equal(createStarterRobots().length, 3);
  for (const design of [...createStarterRobots(), ...PRESETS.map(preset => preset.robot)]) {
    assert.deepEqual(validateProgram(design.program), [], design.name);
  }
  for (const kind of ['Backward', 'HpLow', 'EnergyLow', 'LeftReady', 'RightReady', 'EnemyLeft', 'ObstacleAhead'] as const) {
    assert.ok(CHIP_CATALOG[kind].name && CHIP_CATALOG[kind].short && CHIP_CATALOG[kind].description);
  }
  const copy = cloneRobot(PRESETS[0].robot);
  copy.program.cells[16]!.kind = 'End';
  assert.equal(PRESETS[0].robot.program.cells[16]!.kind, 'Start');
});
