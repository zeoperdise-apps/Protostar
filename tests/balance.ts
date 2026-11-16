import assert from 'node:assert/strict';
import { BattleEngine } from '../src/game/engine';
import { PRESETS, createStarterRobots } from '../src/data/presets';
const rows: Record<string, string | number>[] = [];
for (const robot of createStarterRobots()) for (const preset of PRESETS) {
  let wins = 0, losses = 0, draws = 0, damage = 0, duration = 0;
  for (const seed of [1, 42, 2026]) {
    const result = new BattleEngine({ robots: [robot, preset.robot], seed }).step(5400).result!;
    assert.ok(result, 'every match must finish within 90 seconds');
    assert.ok(result.robots[0].damage + result.robots[1].damage > 0, `zero-damage match: ${robot.id} vs ${preset.id}, seed ${seed}`);
    assert.ok(result.robots.every(stats => stats.instructions > 0));
    wins += Number(result.winner === 0); losses += Number(result.winner === 1); draws += Number(result.winner === null);
    damage += result.robots[0].damage + result.robots[1].damage; duration += result.duration;
  }
  rows.push({ robot: robot.name, enemy: preset.name, W: wins, L: losses, D: draws, avgDamage: Math.round(damage / 3), avgSeconds: Number((duration / 3).toFixed(1)) });
}
for (const left of createStarterRobots()) for (const right of createStarterRobots()) {
  const result = new BattleEngine({ robots: [left, right], seed: 7 }).step(5400).result!;
  assert.ok(result && result.robots[0].damage + result.robots[1].damage > 0, `${left.id} vs ${right.id} must fight`);
}
console.table(rows);
console.log('63 complete seeded matches: all finished, all inflicted damage.');
