import { CHIP_CATALOG, FRAMES, WEAPONS } from './catalog';
import { angleDelta, clamp, distance, SeededRandom, segmentCircle } from './math';
import { compileProgram, resolveNext, type CompiledProgram } from './program';
import {
  FIXED_DT, TICK_RATE, type ArenaDefinition, type BattleConfig, type BattleEvent, type BattleResult, type BattleSnapshot,
  type Chip, type InstructionTrace, type ProjectileSnapshot, type RobotDesign, type RobotSnapshot, type Vec2, type WeaponId,
} from './types';
export const DEFAULT_ARENA: ArenaDefinition = {
  width: 960, height: 640,
  obstacles: [
    { id: 'rock-nw', x: 340, y: 210, radius: 40 }, { id: 'rock-se', x: 620, y: 430, radius: 40 },
    { id: 'rock-ne', x: 625, y: 175, radius: 30 }, { id: 'rock-sw', x: 335, y: 465, radius: 30 },
  ],
};
export const MAX_CONTROL_CHAIN = 128;
export const INSTRUCTION_TICKS = 3; // Every chip consumes at least 50 ms at 60 Hz.
interface Action { kind: 'move' | 'turn' | 'wait'; remaining: number; speed: number; label: string }
interface RobotRuntime {
  design: RobotDesign; state: RobotSnapshot; compiled: CompiledProgram; pc: number | null;
  readyTick: number; action: Action | null; controlChain: number;
}
interface Projectile extends ProjectileSnapshot { damage: number }
function cloneDesign(design: RobotDesign): RobotDesign {
  return { ...design, program: { size: 16, cells: design.program.cells.map(chip => chip ? { ...chip } : null) } };
}
function cloneArena(arena: ArenaDefinition): ArenaDefinition { return { ...arena, obstacles: arena.obstacles.map(obstacle => ({ ...obstacle })) }; }
/** Rendering-independent, seeded, fixed-60-Hz two-robot combat. Angles are radians; +Y points down. */
export class BattleEngine {
  private initialConfig: BattleConfig;
  private random!: SeededRandom;
  private robots!: [RobotRuntime, RobotRuntime];
  private projectiles: Projectile[] = [];
  private events: BattleEvent[] = [];
  private eventId = 0;
  private projectileId = 0;
  private tickNumber = 0;
  private arena!: ArenaDefinition;
  private seed!: number;
  private timeLimit!: number;
  private result: BattleResult | null = null;
  constructor(config: BattleConfig) {
    this.initialConfig = {
      ...config, robots: [cloneDesign(config.robots[0]), cloneDesign(config.robots[1])],
      ...(config.arena ? { arena: cloneArena(config.arena) } : {}),
      ...(config.spawns ? { spawns: [{ ...config.spawns[0] }, { ...config.spawns[1] }] } : {}),
    };
    this.reset();
  }
  reset(): BattleSnapshot {
    const config = this.initialConfig;
    this.seed = (Number.isFinite(config.seed) ? config.seed! : 1) >>> 0;
    this.timeLimit = clamp(Number.isFinite(config.timeLimit) ? config.timeLimit! : 90, FIXED_DT, 600);
    this.random = new SeededRandom(this.seed);
    this.arena = cloneArena(config.arena ?? DEFAULT_ARENA);
    this.tickNumber = 0; this.result = null; this.eventId = 0; this.projectileId = 0; this.events = []; this.projectiles = [];
    const spawns = config.spawns ?? [
      { x: 180, y: this.arena.height / 2, angle: 0 },
      { x: this.arena.width - 180, y: this.arena.height / 2, angle: Math.PI },
    ];
    this.robots = config.robots.map((source, slot) => {
      const design = cloneDesign(source), frame = FRAMES[design.frame], compiled = compileProgram(design.program);
      const spawn = spawns[slot];
      const state: RobotSnapshot = {
        slot: slot as 0 | 1, designId: design.id, name: design.name, frame: design.frame, leftWeapon: design.leftWeapon,
        rightWeapon: design.rightWeapon, color: slot === 0 ? '#58e4e6' : '#ff8279',
        x: clamp(spawn.x, frame.radius, this.arena.width - frame.radius), y: clamp(spawn.y, frame.radius, this.arena.height - frame.radius),
        angle: spawn.angle, radius: frame.radius, hp: frame.hp, maxHp: frame.hp, energy: 100, maxEnergy: 100,
        cooldownLeft: 0, cooldownRight: 0, cell: compiled.start, currentCell: compiled.start, nextCell: compiled.start, lastBranch: null,
        action: null, halted: compiled.diagnostics.some(item => item.severity === 'error'),
        diagnostics: compiled.diagnostics, history: [], stats: { damage: 0, shots: 0, hits: 0, instructions: 0, blockedMoves: 0 },
      };
      return { design, state, compiled, pc: compiled.start, readyTick: 0, action: null, controlChain: 0 };
    }) as [RobotRuntime, RobotRuntime];
    return this.snapshot();
  }
  get finished(): boolean { return this.result !== null; }
  get tick(): number { return this.tickNumber; }
  /** Runs a bounded integer number of ticks, stopping at the result. Returns a detached snapshot. */
  step(ticks = 1): BattleSnapshot {
    if (!Number.isFinite(ticks)) throw new Error('step count must be finite');
    const count = clamp(Math.floor(ticks), 0, 36000);
    for (let i = 0; i < count && !this.result; i++) this.fixedTick();
    return this.snapshot();
  }
  snapshot(): BattleSnapshot {
    // Programs and compiled graphs never enter a frame snapshot. Only small mutable records are copied.
    const robots = this.robots.map(({ state }) => ({
      ...state, stats: { ...state.stats }, history: state.history.map(item => ({ ...item })), diagnostics: state.diagnostics.map(item => ({ ...item })),
    })) as [RobotSnapshot, RobotSnapshot];
    return {
      tick: this.tickNumber, elapsed: this.tickNumber / TICK_RATE, timeLimit: this.timeLimit, seed: this.seed,
      arena: cloneArena(this.arena), robots, projectiles: this.projectiles.map(({ damage: _damage, ...projectile }) => ({ ...projectile })),
      events: this.events.map(event => ({ ...event })), result: this.result ? { ...this.result, robots: this.result.robots.map(stats => ({ ...stats })) as BattleResult['robots'] } : null,
    };
  }
  private fixedTick(): void {
    this.tickNumber++;
    for (const robot of this.robots) {
      const state = robot.state;
      state.cooldownLeft = Math.max(0, state.cooldownLeft - FIXED_DT);
      state.cooldownRight = Math.max(0, state.cooldownRight - FIXED_DT);
      state.energy = Math.min(100, state.energy + FRAMES[state.frame].energyRegen * FIXED_DT);
    }
    this.updateActions();
    for (const robot of this.robots) if (robot.state.hp > 0 && !robot.state.halted && !robot.action && robot.readyTick <= this.tickNumber) this.execute(robot);
    this.updateProjectiles();
    const [a, b] = this.robots.map(robot => robot.state);
    if (a.hp <= 0 || b.hp <= 0) this.finish(a.hp <= 0 && b.hp <= 0 ? null : a.hp > 0 ? 0 : 1, a.hp <= 0 && b.hp <= 0 ? 'double-ko' : 'destroyed');
    else if (this.tickNumber >= Math.ceil(this.timeLimit * TICK_RATE)) {
      const hpDiff = a.hp / a.maxHp - b.hp / b.maxHp;
      const damageDiff = a.stats.damage - b.stats.damage;
      const diff = Math.abs(hpDiff) > 1e-8 ? hpDiff : damageDiff;
      this.finish(Math.abs(diff) < 1e-8 ? null : diff > 0 ? 0 : 1, 'timeout');
    }
    this.events = this.events.filter(event => event.tick >= this.tickNumber - 120).slice(-160);
  }
  private updateActions(): void {
    const proposals = this.robots.map(robot => {
      const state = robot.state, action = robot.action;
      if (!action || state.hp <= 0) return { x: state.x, y: state.y };
      const dt = Math.min(FIXED_DT, action.remaining);
      action.remaining -= dt;
      if (action.kind === 'turn') state.angle = angleDelta(state.angle + action.speed * dt, 0);
      const desired = action.kind === 'move' ? { x: state.x + Math.cos(state.angle) * action.speed * dt, y: state.y + Math.sin(state.angle) * action.speed * dt } : { x: state.x, y: state.y };
      const candidate = this.resolveStatic(desired, state.radius);
      if (distance(candidate, desired) > 0.001 && action.kind === 'move') {
        state.stats.blockedMoves++; action.remaining = 0;
      }
      return candidate;
    });
    const minDistance = this.robots[0].state.radius + this.robots[1].state.radius;
    const separation = distance(proposals[0], proposals[1]);
    if (separation < minDistance) {
      const dx = separation > 0.001 ? (proposals[1].x - proposals[0].x) / separation : 1;
      const dy = separation > 0.001 ? (proposals[1].y - proposals[0].y) / separation : 0;
      const push = (minDistance - separation) / 2 + 0.001;
      proposals[0] = this.resolveStatic({ x: proposals[0].x - dx * push, y: proposals[0].y - dy * push }, this.robots[0].state.radius);
      proposals[1] = this.resolveStatic({ x: proposals[1].x + dx * push, y: proposals[1].y + dy * push }, this.robots[1].state.radius);
      for (const robot of this.robots) if (robot.action?.kind === 'move') { robot.action.remaining = 0; robot.state.stats.blockedMoves++; }
    }
    this.robots.forEach((robot, index) => {
      robot.state.x = proposals[index].x; robot.state.y = proposals[index].y;
      if (robot.action && robot.action.remaining < 1e-8) { robot.action = null; robot.state.action = null; }
    });
  }
  private resolveStatic(position: Vec2, radius: number): Vec2 {
    const result = { ...position };
    // Two projection passes handle the uncommon case of adjacent rocks and walls.
    for (let pass = 0; pass < 2; pass++) {
      result.x = clamp(result.x, radius, this.arena.width - radius);
      result.y = clamp(result.y, radius, this.arena.height - radius);
      for (const obstacle of this.arena.obstacles) {
        const d = distance(result, obstacle), min = radius + obstacle.radius;
        if (d < min) {
          const nx = d > 0.001 ? (result.x - obstacle.x) / d : 1;
          const ny = d > 0.001 ? (result.y - obstacle.y) / d : 0;
          result.x = obstacle.x + nx * min; result.y = obstacle.y + ny * min;
        }
      }
    }
    return result;
  }
  private execute(robot: RobotRuntime): void {
    const { state, design, compiled } = robot;
    if (robot.pc === null) { state.halted = true; return; }
    const cell = robot.pc, chip = design.program.cells[cell];
    if (!chip || !CHIP_CATALOG[chip.kind]) { robot.pc = compiled.start; robot.readyTick = this.tickNumber + INSTRUCTION_TICKS; return; }
    state.cell = cell; state.currentCell = cell;
    state.stats.instructions++;
    robot.readyTick = this.tickNumber + INSTRUCTION_TICKS;
    let condition: boolean | undefined, success = true;
    const definition = CHIP_CATALOG[chip.kind];
    if (definition.conditional) condition = this.sense(robot, chip);
    switch (chip.kind) {
      case 'Forward': case 'Backward': {
        const medium = chip.param === 'medium', cost = medium ? 4 : 2;
        if (state.energy < cost) { success = false; break; }
        state.energy -= cost;
        const speed = FRAMES[state.frame].speed * (chip.kind === 'Backward' ? -0.8 : 1);
        this.setAction(robot, { kind: 'move', remaining: (medium ? 72 : 34) / Math.abs(speed), speed, label: chip.kind });
        break;
      }
      case 'TurnLeft': case 'TurnRight': {
        const degrees = typeof chip.param === 'number' ? clamp(chip.param, 1, 180) : 30;
        const cost = degrees >= 90 ? 2 : 1;
        if (state.energy < cost) { success = false; break; }
        state.energy -= cost;
        const speed = FRAMES[state.frame].turnSpeed * Math.PI / 180;
        this.setAction(robot, { kind: 'turn', remaining: degrees * Math.PI / 180 / speed, speed: speed * (chip.kind === 'TurnLeft' ? -1 : 1), label: chip.kind });
        break;
      }
      case 'Wait': this.setAction(robot, { kind: 'wait', remaining: clamp(typeof chip.param === 'number' ? chip.param : 0.2, 0.05, 5), speed: 0, label: 'Wait' }); break;
      case 'FireLeft': success = this.fire(robot, 'left'); break;
      case 'FireRight': success = this.fire(robot, 'right'); break;
    }
    const next = resolveNext(design.program, compiled, cell, condition);
    robot.pc = next.target; state.nextCell = next.target; state.lastBranch = next.branch;
    const trace: InstructionTrace = { tick: this.tickNumber, cell, kind: chip.kind, branch: next.branch, target: next.target, success };
    state.history.push(trace); if (state.history.length > 32) state.history.shift();
    if (definition.category === 'flow' && chip.kind !== 'Wait' || definition.conditional) robot.controlChain++;
    else robot.controlChain = 0;
    if (robot.controlChain >= MAX_CONTROL_CHAIN) {
      state.halted = true; state.lastBranch = 'halt';
      state.diagnostics.push({ severity: 'error', code: 'control-loop', message: '128命令連続で行動がありません。AIを安全停止しました。', cell, x: cell % 16, y: Math.floor(cell / 16) });
    }
  }
  private setAction(robot: RobotRuntime, action: Action): void { robot.action = action; robot.state.action = action.label; }
  private hasLineOfSight(a: Vec2, b: Vec2): boolean {
    return !this.arena.obstacles.some(obstacle => segmentCircle(a, b, obstacle, obstacle.radius) !== null);
  }
  private sense(robot: RobotRuntime, chip: Chip): boolean {
    const state = robot.state, enemy = this.robots[1 - state.slot].state;
    const d = distance(state, enemy), angle = angleDelta(Math.atan2(enemy.y - state.y, enemy.x - state.x), state.angle);
    const numeric = typeof chip.param === 'number' ? chip.param : undefined;
    switch (chip.kind) {
      case 'EnemyAhead': return d <= 600 && Math.abs(angle) <= (numeric ?? 18) * Math.PI / 180 && this.hasLineOfSight(state, enemy);
      case 'EnemyNear': return d <= (numeric ?? 260) && this.hasLineOfSight(state, enemy);
      case 'EnemyLeft': return d <= 600 && angle < -0.001 && this.hasLineOfSight(state, enemy);
      case 'HpLow': return state.hp / state.maxHp <= (numeric ?? 0.35);
      case 'EnergyLow': return state.energy / state.maxEnergy <= (numeric ?? 0.25);
      case 'LeftReady': return state.cooldownLeft <= 1e-8 && state.energy >= WEAPONS[state.leftWeapon].energy;
      case 'RightReady': return state.cooldownRight <= 1e-8 && state.energy >= WEAPONS[state.rightWeapon].energy;
      case 'ObstacleAhead': {
        const end = { x: state.x + Math.cos(state.angle) * 88, y: state.y + Math.sin(state.angle) * 88 };
        if (end.x < state.radius || end.x > this.arena.width - state.radius || end.y < state.radius || end.y > this.arena.height - state.radius) return true;
        return this.arena.obstacles.some(obstacle => segmentCircle(state, end, obstacle, obstacle.radius + state.radius + 3) !== null)
          || segmentCircle(state, end, enemy, enemy.radius + state.radius + 3) !== null;
      }
      default: return false;
    }
  }
  private fire(robot: RobotRuntime, side: 'left' | 'right'): boolean {
    const state = robot.state, weaponId: WeaponId = side === 'left' ? state.leftWeapon : state.rightWeapon, weapon = WEAPONS[weaponId];
    const cooldownKey = side === 'left' ? 'cooldownLeft' : 'cooldownRight';
    if (state[cooldownKey] > 1e-8 || state.energy < weapon.energy) return false;
    state.energy -= weapon.energy; state[cooldownKey] = weapon.cooldown;
    const enemy = this.robots[1 - state.slot].state;
    const enemyAngle = Math.atan2(enemy.y - state.y, enemy.x - state.x);
    const aim = Math.abs(angleDelta(enemyAngle, state.angle)) <= Math.PI / 10 && this.hasLineOfSight(state, enemy) ? enemyAngle : state.angle;
    for (let i = 0; i < weapon.projectiles; i++) {
      const spread = weapon.projectiles > 1 ? (i - (weapon.projectiles - 1) / 2) * weapon.spread : (this.random.next() - 0.5) * weapon.spread;
      const angle = aim + spread;
      const x = state.x + Math.cos(angle) * (state.radius + 5), y = state.y + Math.sin(angle) * (state.radius + 5);
      this.projectiles.push({ id: ++this.projectileId, owner: state.slot, weapon: weaponId, x, y, vx: Math.cos(angle) * weapon.speed, vy: Math.sin(angle) * weapon.speed, radius: weapon.radius, remaining: weapon.range, damage: weapon.damage });
      state.stats.shots++;
    }
    this.emit({ type: 'shot', tick: this.tickNumber, slot: state.slot, weapon: weaponId, x: state.x, y: state.y });
    return true;
  }
  private updateProjectiles(): void {
    const survivors: Projectile[] = [], damage = [0, 0];
    for (const projectile of this.projectiles) {
      const speed = Math.hypot(projectile.vx, projectile.vy), travel = Math.min(projectile.remaining, speed * FIXED_DT), ratio = travel / speed;
      const start = { x: projectile.x, y: projectile.y }, end = { x: start.x + projectile.vx * ratio, y: start.y + projectile.vy * ratio };
      const target = this.robots[1 - projectile.owner].state;
      let t = segmentCircle(start, end, target, target.radius + projectile.radius), hitRobot = t !== null;
      for (const obstacle of this.arena.obstacles) {
        const obstacleT = segmentCircle(start, end, obstacle, obstacle.radius + projectile.radius);
        if (obstacleT !== null && (t === null || obstacleT <= t)) { t = obstacleT; hitRobot = false; }
      }
      if (t !== null) {
        const x = start.x + (end.x - start.x) * t, y = start.y + (end.y - start.y) * t;
        if (hitRobot) {
          damage[target.slot] += projectile.damage;
          const attacker = this.robots[projectile.owner].state;
          attacker.stats.hits++; attacker.stats.damage += projectile.damage;
          this.emit({ type: 'hit', tick: this.tickNumber, slot: projectile.owner, target: target.slot, damage: projectile.damage, x, y });
        } else this.emit({ type: 'impact', tick: this.tickNumber, x, y });
        continue;
      }
      projectile.x = end.x; projectile.y = end.y; projectile.remaining -= travel;
      if (projectile.remaining > 0 && end.x >= 0 && end.y >= 0 && end.x <= this.arena.width && end.y <= this.arena.height) survivors.push(projectile);
      else this.emit({ type: 'impact', tick: this.tickNumber, x: end.x, y: end.y });
    }
    this.projectiles = survivors;
    this.robots.forEach((robot, slot) => { robot.state.hp = Math.max(0, robot.state.hp - damage[slot]); });
  }
  private emit(event: Omit<Extract<BattleEvent, { type: 'shot' }>, 'id'> | Omit<Extract<BattleEvent, { type: 'hit' }>, 'id'> | Omit<Extract<BattleEvent, { type: 'impact' }>, 'id'> | Omit<Extract<BattleEvent, { type: 'end' }>, 'id'>): void {
    this.events.push({ ...event, id: ++this.eventId } as BattleEvent);
  }
  private finish(winner: 0 | 1 | null, reason: BattleResult['reason']): void {
    this.result = {
      winner, reason, duration: this.tickNumber / TICK_RATE, seed: this.seed,
      robots: this.robots.map(({ state }) => ({ ...state.stats, hp: state.hp, maxHp: state.maxHp, accuracy: state.stats.shots ? state.stats.hits / state.stats.shots : 0 })) as BattleResult['robots'],
    };
    this.emit({ type: 'end', tick: this.tickNumber, winner });
  }
}
