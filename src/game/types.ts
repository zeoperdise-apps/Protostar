import type { Locale } from '../i18n';
export const GRID_SIZE = 16;
export const CELL_COUNT = GRID_SIZE * GRID_SIZE;
export const TICK_RATE = 60;
export const FIXED_DT = 1 / TICK_RATE;
export type Direction = 'N' | 'E' | 'S' | 'W';
export type LabelName = 'A' | 'B' | 'C' | 'D' | 'E';
export type ChipKind =
  | 'Start' | 'End' | 'Wait' | 'Label' | 'Jump'
  | 'Forward' | 'Backward' | 'TurnLeft' | 'TurnRight'
  | 'EnemyAhead' | 'EnemyNear' | 'EnemyLeft' | 'ObstacleAhead'
  | 'HpLow' | 'EnergyLow' | 'LeftReady' | 'RightReady' | 'FireLeft' | 'FireRight';
export type ChipParam = number | string | null;
export interface Chip {
  kind: ChipKind;
  param?: ChipParam;
  next?: Direction;
  yes?: Direction;
  no?: Direction;
}
export interface Program { size: 16; cells: (Chip | null)[] }
export type FrameId = 'scout' | 'balanced' | 'fortress';
export type WeaponId = 'pulse' | 'rail' | 'scatter';
export interface RobotDesign {
  id: string;
  name: string;
  frame: FrameId;
  leftWeapon: WeaponId;
  rightWeapon: WeaponId;
  program: Program;
}
export type ChipCategory = 'flow' | 'movement' | 'sensor' | 'diagnostic' | 'weapon';
export interface ChipDefinition {
  kind: ChipKind;
  name: string;
  short: string;
  description: string;
  category: ChipCategory;
  conditional: boolean;
  defaultParam?: ChipParam;
  params?: readonly { value: string | number; label: string }[];
}
export interface FrameDefinition {
  id: FrameId; name: string; description: string; hp: number; speed: number; turnSpeed: number; radius: number; energyRegen: number;
}
export interface WeaponDefinition {
  id: WeaponId; name: string; description: string; damage: number; cooldown: number; range: number; speed: number;
  energy: number; projectiles: number; spread: number; radius: number;
}
export interface Diagnostic { severity: 'error' | 'warning'; code: string; message: string; params?: Record<string,string|number>; kind?: ChipKind; branch?: 'next'|'yes'|'no'; cell?: number; x?: number; y?: number }
export type Branch = 'next' | 'yes' | 'no' | 'jump' | 'restart' | 'halt';
export interface InstructionTrace { tick: number; cell: number; kind: ChipKind; branch: Branch; target: number | null; success: boolean }
export interface Vec2 { x: number; y: number }
export interface Obstacle extends Vec2 { id: string; radius: number }
export interface ArenaDefinition { width: number; height: number; obstacles: Obstacle[] }
export interface RobotStats { damage: number; shots: number; hits: number; instructions: number; blockedMoves: number }
export interface RobotSnapshot extends Vec2 {
  slot: 0 | 1; designId: string; name: string; frame: FrameId; leftWeapon: WeaponId; rightWeapon: WeaponId; color: string;
  angle: number; radius: number; hp: number; maxHp: number; energy: number; maxEnergy: number;
  cooldownLeft: number; cooldownRight: number; cell: number | null; currentCell: number | null; nextCell: number | null; lastBranch: Branch | null;
  action: string | null; halted: boolean; diagnostics: Diagnostic[]; history: InstructionTrace[]; stats: RobotStats;
}
export interface ProjectileSnapshot extends Vec2 {
  id: number; owner: 0 | 1; weapon: WeaponId; vx: number; vy: number; radius: number; remaining: number;
}
export type BattleEvent =
  | { id: number; tick: number; type: 'shot'; slot: 0 | 1; weapon: WeaponId; x: number; y: number }
  | { id: number; tick: number; type: 'hit'; slot: 0 | 1; target: 0 | 1; damage: number; x: number; y: number }
  | { id: number; tick: number; type: 'impact'; x: number; y: number }
  | { id: number; tick: number; type: 'end'; winner: 0 | 1 | null };
export interface BattleResult {
  winner: 0 | 1 | null; reason: 'destroyed' | 'timeout' | 'double-ko'; duration: number; seed: number;
  robots: [RobotStats & { hp: number; maxHp: number; accuracy: number }, RobotStats & { hp: number; maxHp: number; accuracy: number }];
}
export interface BattleSnapshot {
  tick: number; elapsed: number; timeLimit: number; seed: number; arena: ArenaDefinition;
  robots: [RobotSnapshot, RobotSnapshot]; projectiles: ProjectileSnapshot[]; events: BattleEvent[]; result: BattleResult | null;
}
export interface BattleConfig {
  robots: [RobotDesign, RobotDesign]; seed?: number; timeLimit?: number; arena?: ArenaDefinition;
  spawns?: [{ x: number; y: number; angle: number }, { x: number; y: number; angle: number }];
}
export interface Preset { id: string; level: number; name: string; description: string; robot: RobotDesign }
export interface Settings { locale: Locale; sound: boolean; volume: number; speed: 1 | 2 | 4; showSensors: boolean; showTrails: boolean }
export interface SavedMatchConfig { leftRobotId: string; opponentType: 'preset' | 'custom'; opponentId: string; seed: number }
export interface SaveData { version: 1; robots: RobotDesign[]; clearedPresets: string[]; settings: Settings; config: SavedMatchConfig }
