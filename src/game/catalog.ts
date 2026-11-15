import type { ChipDefinition, ChipKind, FrameDefinition, FrameId, WeaponDefinition, WeaponId } from './types';
const labels = ['A', 'B', 'C', 'D', 'E'].map(value => ({ value, label: value }));
const distances = [{ value: 'short', label: '短距離 / 34' }, { value: 'medium', label: '中距離 / 72' }];
const turns = [30, 45, 90].map(value => ({ value, label: `${value}°` }));
export const CHIPS: readonly ChipDefinition[] = [
  { kind: 'Start', name: '開始', short: 'START', description: 'プログラムの開始地点。必ず1個配置します。', category: 'flow', conditional: false },
  { kind: 'End', name: '終了 / 再開', short: 'END', description: '開始チップへ戻ります。', category: 'flow', conditional: false },
  { kind: 'Wait', name: '待機', short: 'WAIT', description: '指定秒数待機。待機中もエネルギーと武器が回復します。', category: 'flow', conditional: false, defaultParam: 0.2, params: [0.1, 0.2, 0.5, 1].map(value => ({ value, label: `${value}秒` })) },
  { kind: 'Label', name: 'ラベル', short: 'LABEL', description: 'ジャンプ先 A〜E。各文字は1個まで。', category: 'flow', conditional: false, defaultParam: 'A', params: labels },
  { kind: 'Jump', name: 'ジャンプ', short: 'JUMP', description: '指定したラベルへ移動します。', category: 'flow', conditional: false, defaultParam: 'A', params: labels },
  { kind: 'Forward', name: '前進', short: 'FWD', description: '現在の向きへ移動。壁・障害物・敵機は通り抜けられません。', category: 'movement', conditional: false, defaultParam: 'short', params: distances },
  { kind: 'Backward', name: '後退', short: 'BACK', description: '向きを変えず後ろへ移動します。', category: 'movement', conditional: false, defaultParam: 'short', params: distances },
  { kind: 'TurnLeft', name: '左旋回', short: '↶', description: '指定角度だけ左に旋回します。', category: 'movement', conditional: false, defaultParam: 30, params: turns },
  { kind: 'TurnRight', name: '右旋回', short: '↷', description: '指定角度だけ右に旋回します。', category: 'movement', conditional: false, defaultParam: 30, params: turns },
  { kind: 'EnemyAhead', name: '前方に敵?', short: 'FRONT?', description: '前方の指定角度以内・600以内に敵がいて射線が通るとYES。', category: 'sensor', conditional: true, defaultParam: 18, params: [12, 18, 30, 60, 90].map(value => ({ value, label: `左右 ${value}°` })) },
  { kind: 'EnemyNear', name: '敵が近い?', short: 'NEAR?', description: '指定距離以内に敵がいて射線が通るとYES。', category: 'sensor', conditional: true, defaultParam: 260, params: [160, 220, 300, 420, 520].map(value => ({ value, label: `${value}` })) },
  { kind: 'EnemyLeft', name: '敵が左?', short: 'LEFT?', description: '600以内、左半面に敵がいて射線が通るとYES。', category: 'sensor', conditional: true },
  { kind: 'ObstacleAhead', name: '前方に障害物?', short: 'WALL?', description: '前方約88以内の壁・障害物・敵機を検知します。', category: 'sensor', conditional: true },
  { kind: 'HpLow', name: 'HPが少ない?', short: 'HP?', description: 'HPが指定割合以下ならYES。', category: 'diagnostic', conditional: true, defaultParam: 0.35, params: [0.25, 0.35, 0.5, 0.75].map(value => ({ value, label: `${value * 100}% 以下` })) },
  { kind: 'EnergyLow', name: 'エネルギー不足?', short: 'EN?', description: 'エネルギーが指定割合以下ならYES。', category: 'diagnostic', conditional: true, defaultParam: 0.25, params: [0.2, 0.3, 0.5].map(value => ({ value, label: `${value * 100}% 以下` })) },
  { kind: 'LeftReady', name: '左武器準備完了?', short: 'L RDY?', description: '左武器の冷却完了かつ必要エネルギーがあればYES。', category: 'diagnostic', conditional: true },
  { kind: 'RightReady', name: '右武器準備完了?', short: 'R RDY?', description: '右武器の冷却完了かつ必要エネルギーがあればYES。', category: 'diagnostic', conditional: true },
  { kind: 'FireLeft', name: '左武器発射', short: 'FIRE L', description: '左装備を発射。冷却中・エネルギー不足なら発射せず進みます。前方18°以内の敵へ照準補正。', category: 'weapon', conditional: false },
  { kind: 'FireRight', name: '右武器発射', short: 'FIRE R', description: '右装備を発射。左右の冷却は独立。前方18°以内の敵へ照準補正。', category: 'weapon', conditional: false },
];
export const CHIP_CATALOG = Object.fromEntries(CHIPS.map(chip => [chip.kind, chip])) as Record<ChipKind, ChipDefinition>;
export const FRAMES: Record<FrameId, FrameDefinition> = {
  scout: { id: 'scout', name: 'スカウト', description: '高速な軽量フレーム。移動で射線を作る。', hp: 85, speed: 142, turnSpeed: 230, radius: 16, energyRegen: 18 },
  balanced: { id: 'balanced', name: 'バランス', description: '耐久・機動・回復のバランス型。', hp: 100, speed: 112, turnSpeed: 200, radius: 18, energyRegen: 20 },
  fortress: { id: 'fortress', name: 'フォートレス', description: '重装甲と高い発電量。移動は低速。', hp: 130, speed: 83, turnSpeed: 165, radius: 21, energyRegen: 23 },
};
export const WEAPONS: Record<WeaponId, WeaponDefinition> = {
  pulse: { id: 'pulse', name: 'パルス', description: '低消費で安定した速射砲。', damage: 8, cooldown: 0.65, range: 360, speed: 620, energy: 9, projectiles: 1, spread: 0.012, radius: 3 },
  rail: { id: 'rail', name: 'レール', description: '長射程・高威力。再装填と消費が大きい。', damage: 22, cooldown: 1.8, range: 520, speed: 1040, energy: 22, projectiles: 1, spread: 0.005, radius: 3.5 },
  scatter: { id: 'scatter', name: 'スキャッター', description: '3発を扇状に発射する近距離砲。', damage: 6, cooldown: 1.2, range: 240, speed: 480, energy: 15, projectiles: 3, spread: 0.13, radius: 4 },
};
