import { localizeText, type Locale } from '../i18n';
import { createEmptyProgram, makeChip, cellIndex } from '../game/program';
import type { Chip, FrameId, Preset, Program, RobotDesign, WeaponId } from '../game/types';
interface StrategyOptions {
  range: number; cone?: number; dual?: boolean; evade?: boolean; careful?: boolean; singleWait?: number;
}
/** All tactics below are actual editable grid programs; the engine has no preset-specific behavior. */
export function createTacticalProgram(options: StrategyOptions): Program {
  const program = createEmptyProgram();
  const put = (x: number, y: number, kind: Chip['kind'], overrides: Partial<Chip> = {}) => {
    program.cells[cellIndex(x, y)] = makeChip(kind, overrides);
  };
  put(0, 1, 'Start');
  for (const [label, y] of [['A', 1], ['B', 4], ['C', 7], ['D', 10], ['E', 13]] as const) put(1, y, 'Label', { param: label });
  // A: acquire a clear firing direction; B: steer and advance while searching.
  put(2, 1, 'EnemyAhead', { param: options.cone ?? 18, yes: 'E', no: 'S' });
  put(3, 1, 'Jump', { param: 'C' }); put(2, 2, 'Jump', { param: 'B' });
  put(2, 4, 'EnemyLeft', { yes: 'S', no: 'E' });
  put(2, 5, 'TurnLeft', { param: 30 }); put(3, 5, 'Forward', { param: 'short' }); put(4, 5, 'Jump', { param: 'A' });
  put(3, 4, 'TurnRight', { param: 30 }); put(4, 4, 'Forward', { param: 'short' }); put(5, 4, 'Jump', { param: 'A' });
  // C: choose engage or close distance.
  put(2, 7, 'EnemyNear', { param: options.range, yes: 'E', no: 'S' });
  put(3, 7, 'Jump', { param: 'D' }); put(2, 8, 'Jump', { param: 'E' });
  // D: independent left/right attacks, with optional energy-management or kiting.
  let x = 2;
  if (options.careful) {
    put(x++, 10, 'EnergyLow', { param: 0.3, yes: 'S', no: 'E' });
    put(2, 11, 'Wait', { param: 0.5 }); put(3, 11, 'Jump', { param: 'A' });
  }
  put(x++, 10, 'FireLeft');
  if (options.dual !== false) put(x++, 10, 'FireRight');
  if (options.evade) { put(x++, 10, 'Backward', { param: 'short' }); put(x++, 10, 'TurnRight', { param: 30 }); }
  else put(x++, 10, 'Wait', { param: options.singleWait ?? 0.1 });
  put(x, 10, 'Jump', { param: 'A' });
  // E: collision-aware approach. A blocked route causes a 90-degree detour.
  put(2, 13, 'ObstacleAhead', { yes: 'S', no: 'E' });
  put(3, 13, 'Forward', { param: 'medium' }); put(4, 13, 'Jump', { param: 'A' });
  put(2, 14, 'TurnRight', { param: 90 }); put(3, 14, 'Forward', { param: 'short' }); put(4, 14, 'Jump', { param: 'A' });
  return program;
}
function design(id: string, name: string, frame: FrameId, leftWeapon: WeaponId, rightWeapon: WeaponId, strategy: StrategyOptions): RobotDesign {
  return { id, name, frame, leftWeapon, rightWeapon, program: createTacticalProgram(strategy) };
}
export const PRESETS: readonly Preset[] = [
  { id: 'training', level: 1, name: '射撃訓練機', description: '単砲で射撃。敵を捉えて近づく基本を確認。', robot: design('preset-training', 'P01 / 射撃訓練機', 'scout', 'pulse', 'pulse', { range: 280, dual: false, singleWait: 0.5 }) },
  { id: 'hunter', level: 2, name: '追跡機', description: '障害物を避け、射程へ積極的に追い込む。', robot: design('preset-hunter', 'P02 / 追跡機', 'balanced', 'pulse', 'scatter', { range: 280, dual: false }) },
  { id: 'twin', level: 3, name: '双砲機', description: '独立した左右の砲を使い、手数で押す。', robot: design('preset-twin', 'P03 / 双砲機', 'balanced', 'pulse', 'pulse', { range: 300 }) },
  { id: 'evader', level: 4, name: '回避機', description: '接近射撃から後退・旋回。射線と距離を変える。', robot: design('preset-evader', 'P04 / 回避機', 'scout', 'pulse', 'scatter', { range: 205, evade: true }) },
  { id: 'sniper', level: 5, name: '狙撃機', description: '長射程の双レールで接近前に狙い撃つ。', robot: design('preset-sniper', 'P05 / 狙撃機', 'balanced', 'rail', 'rail', { range: 465 }) },
  { id: 'adaptive', level: 6, name: '最終適応機', description: '重装甲、双レール、エネルギー診断を組み合わせる最終試験。', robot: design('preset-adaptive', 'P06 / 最終適応機', 'fortress', 'rail', 'rail', { range: 465, careful: true }) },
];
export function cloneRobot(robot: RobotDesign, id = robot.id, name = robot.name): RobotDesign {
  return { ...robot, id, name, program: { size: 16, cells: robot.program.cells.map(chip => chip ? { ...chip } : null) } };
}
export function createStarterRobots(locale: Locale = 'ja'): RobotDesign[] {
  return [
    design('custom-chaser', '01 / 追撃カスタム', 'balanced', 'pulse', 'pulse', { range: 300 }),
    design('custom-twin', '02 / 双砲カスタム', 'fortress', 'pulse', 'rail', { range: 320, careful: true }),
    design('custom-evader', '03 / 回避カスタム', 'scout', 'pulse', 'scatter', { range: 205, evade: true }),
  ].map(robot=>({...robot,name:localizeText(robot.name,locale)}));
}
