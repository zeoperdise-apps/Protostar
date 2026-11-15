import { t, type Locale, type MessageKey, type MessageParams } from '../i18n';
import { CHIP_CATALOG, FRAMES, WEAPONS } from '../game/catalog';
import { DIRECTIONS, LABELS } from '../game/program';
import { CELL_COUNT, type Chip, type ChipKind, type RobotDesign, type SaveData, type Settings } from '../game/types';
import { createStarterRobots, PRESETS } from '../data/presets';
export const SAVE_KEY = 'protostar.save.v1';
export const SAVE_VERSION = 1;
export const MAX_IMPORT_BYTES = 1_000_000;
export const MAX_ROBOTS = 24;
export const DEFAULT_SETTINGS: Settings = { sound: true, volume: 0.35, speed: 1, showSensors: false, showTrails: true, locale: 'ja' };
export interface StorageLike { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem?(key: string): void }
export interface StorageStatus { persistent: boolean; recovered: boolean; message: string | null; code?: MessageKey }
export interface ImportResult { ok: boolean; data?: SaveData; error?: string }
export class ValidationError extends Error {
  constructor(readonly code: MessageKey, readonly params: MessageParams = {}) { super(t(code, params, 'ja')); }
}
export function errorMessage(error: unknown, locale: Locale = 'ja'): string {
  if (error instanceof ValidationError) { const params={...error.params}; if(params.label)params.label=t(params.label as MessageKey,{},locale); return t(error.code,params,locale); }
  return t('保存できませんでした。',{},locale);
}
const object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
function fail(code: MessageKey, params: MessageParams = {}): never { throw new ValidationError(code, params); }
function finite(value: unknown, min: number, max: number, label: MessageKey): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) fail('validation.number', {label});
  return value;
}
function text(value: unknown, max: number, label: MessageKey): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u001f]/.test(value)) fail('validation.text', {label,max});
  return value.trim();
}
export function validateRobot(value: unknown): RobotDesign {
  if (!object(value)) fail('validation.1');
  const id = text(value.id, 64, '機体ID'), name = text(value.name, 40, '機体名');
  if (typeof value.frame !== 'string' || !Object.hasOwn(FRAMES, value.frame)) fail('validation.2');
  if (typeof value.leftWeapon !== 'string' || !Object.hasOwn(WEAPONS, value.leftWeapon) || typeof value.rightWeapon !== 'string' || !Object.hasOwn(WEAPONS, value.rightWeapon)) fail('validation.3');
  const program = value.program;
  if (!object(program) || program.size !== 16 || !Array.isArray(program.cells) || program.cells.length !== CELL_COUNT) fail('validation.4');
  const cells: (Chip | null)[] = program.cells.map((cell: unknown) => {
    if (cell === null) return null;
    if (!object(cell) || typeof cell.kind !== 'string' || !Object.hasOwn(CHIP_CATALOG, cell.kind)) fail('validation.5');
    const kind = cell.kind as ChipKind, clean: Chip = { kind };
    for (const key of ['next', 'yes', 'no'] as const) {
      if (cell[key] !== undefined) {
        if (typeof cell[key] !== 'string' || !DIRECTIONS.includes(cell[key] as typeof DIRECTIONS[number])) fail('validation.6');
        clean[key] = cell[key] as typeof DIRECTIONS[number];
      }
    }
    if (cell.param !== undefined && cell.param !== null) {
      const param = cell.param;
      if (kind === 'Label' || kind === 'Jump') {
        if (typeof param !== 'string' || !LABELS.includes(param as typeof LABELS[number])) fail('validation.7');
      } else if (kind === 'Forward' || kind === 'Backward') {
        if (param !== 'short' && param !== 'medium') fail('validation.8');
      } else if (kind === 'TurnLeft' || kind === 'TurnRight') {
        if (![30, 45, 90].includes(param as number)) fail('validation.9');
      } else if (kind === 'Wait') finite(param, 0.05, 5, '待機時間');
      else if (kind === 'EnemyAhead') finite(param, 1, 180, 'センサー角度');
      else if (kind === 'EnemyNear') finite(param, 1, 1000, 'センサー距離');
      else if (kind === 'HpLow' || kind === 'EnergyLow') finite(param, 0, 1, '診断しきい値');
      else if (typeof param !== 'string' && typeof param !== 'number') fail('validation.10');
      if (typeof param === 'number' && !Number.isFinite(param) || typeof param === 'string' && param.length > 16) fail('validation.10');
      clean.param = param as string | number;
    }
    return clean;
  });
  return { id, name, frame: value.frame as RobotDesign['frame'], leftWeapon: value.leftWeapon as RobotDesign['leftWeapon'], rightWeapon: value.rightWeapon as RobotDesign['rightWeapon'], program: { size: 16, cells } };
}
export function createDefaultSave(locale: Locale = 'ja'): SaveData {
  const robots = createStarterRobots(locale);
  return { version: 1, robots, clearedPresets: [], settings: { ...DEFAULT_SETTINGS, locale }, config: { leftRobotId: robots[0].id, opponentType: 'preset', opponentId: PRESETS[0].id, seed: 2026 } };
}
/** Shape validation deliberately permits unfinished AI graphs; editor diagnostics handle those. */
export function validateSave(value: unknown): SaveData {
  if (!object(value) || value.version !== SAVE_VERSION) fail('validation.11');
  if (!Array.isArray(value.robots) || value.robots.length < 1 || value.robots.length > MAX_ROBOTS) fail('validation.robots', {max:MAX_ROBOTS});
  const robots = value.robots.map(validateRobot);
  if (new Set(robots.map(robot => robot.id)).size !== robots.length) fail('validation.12');
  if (!Array.isArray(value.clearedPresets) || value.clearedPresets.length > PRESETS.length || value.clearedPresets.some(id => typeof id !== 'string' || !PRESETS.some(preset => preset.id === id))) fail('validation.13');
  const settings = value.settings;
  if (!object(settings) || typeof settings.sound !== 'boolean' || typeof settings.showSensors !== 'boolean' || typeof settings.showTrails !== 'boolean' || ![1, 2, 4].includes(settings.speed as number)) fail('validation.14');
  if (settings.locale !== undefined && settings.locale !== 'ja' && settings.locale !== 'en') fail('validation.14');
  const volume = finite(settings.volume, 0, 1, '音量');
  const config = value.config;
  if (!object(config) || typeof config.leftRobotId !== 'string' || !robots.some(robot => robot.id === config.leftRobotId)) fail('validation.15');
  if (config.opponentType !== 'preset' && config.opponentType !== 'custom') fail('validation.16');
  if (typeof config.opponentId !== 'string' || !(config.opponentType === 'preset' ? PRESETS.some(preset => preset.id === config.opponentId) : robots.some(robot => robot.id === config.opponentId))) fail('validation.17');
  const seed = finite(config.seed, 0, 0xffffffff, '乱数シード');
  if (!Number.isInteger(seed)) fail('validation.18');
  return {
    version: 1, robots, clearedPresets: [...new Set(value.clearedPresets as string[])],
    settings: { locale: settings.locale === undefined ? 'ja' : settings.locale as Locale, sound: settings.sound, volume, speed: settings.speed as Settings['speed'], showSensors: settings.showSensors, showTrails: settings.showTrails },
    config: { leftRobotId: config.leftRobotId, opponentType: config.opponentType, opponentId: config.opponentId, seed },
  };
}
export function importSave(json: string, locale: Locale = 'ja'): ImportResult {
  try {
    if (typeof json !== 'string' || json.length > MAX_IMPORT_BYTES || new TextEncoder().encode(json).byteLength > MAX_IMPORT_BYTES) fail('validation.19');
    return { ok: true, data: validateSave(JSON.parse(json)) };
  } catch (error) { return { ok: false, error: error instanceof ValidationError ? errorMessage(error,locale) : t('JSONを読み取れませんでした。',{},locale) }; }
}
export function exportSave(data: SaveData): string { return JSON.stringify(validateSave(data), null, 2); }
export function importRobot(json: string, locale: Locale = 'ja'): { ok: boolean; robot?: RobotDesign; error?: string } {
  try {
    if (json.length > MAX_IMPORT_BYTES || new TextEncoder().encode(json).byteLength > MAX_IMPORT_BYTES) fail('validation.19');
    return { ok: true, robot: validateRobot(JSON.parse(json)) };
  } catch (error) { return { ok: false, error: error instanceof ValidationError ? errorMessage(error,locale) : t('機体JSONを読み取れませんでした。',{},locale) }; }
}
export function exportRobot(robot: RobotDesign): string { return JSON.stringify(validateRobot(robot), null, 2); }
function browserStorage(): StorageLike | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}
export class SaveStore {
  private storage: StorageLike | null;
  private memory: SaveData;
  readonly status: StorageStatus;
  constructor(storage: StorageLike | null = browserStorage(), locale: Locale = 'ja') {
    this.storage = storage; this.memory = createDefaultSave(locale);
    this.status = { persistent: storage !== null, recovered: false, message: storage ? null : t('保存領域を利用できないため、この画面を開いている間だけ保存します。',{},locale), code:storage ? undefined : '保存領域を利用できないため、この画面を開いている間だけ保存します。' };
    try {
      const json = storage?.getItem(SAVE_KEY);
      if (json) {
        const imported = importSave(json);
        if (imported.ok) this.memory = imported.data!;
        else { this.status.recovered = true; this.status.code = '保存データの破損を検出し、初期サンプルへ復旧しました。'; this.status.message = t(this.status.code,{},this.memory.settings.locale); this.persist(); }
      }
    } catch { this.useMemory(); }
  }
  load(): SaveData { return structuredClone(this.memory); }
  save(data: SaveData): SaveData { this.memory = validateSave(data); this.persist(); return this.load(); }
  import(json: string): ImportResult {
    const imported = importSave(json,this.memory.settings.locale);
    if (imported.ok) this.save(imported.data!);
    return imported;
  }
  export(): string { return exportSave(this.memory); }
  recordVictory(presetId: string): SaveData {
    if (PRESETS.some(preset => preset.id === presetId) && !this.memory.clearedPresets.includes(presetId)) {
      this.memory.clearedPresets.push(presetId); this.persist();
    }
    return this.load();
  }
  private persist(): void {
    try { this.storage?.setItem(SAVE_KEY, JSON.stringify(this.memory)); } catch { this.useMemory(); }
  }
  private useMemory(): void { this.storage = null; this.status.persistent = false; this.status.code = '保存領域を利用できないため、この画面を開いている間だけ保存します。'; this.status.message = t(this.status.code,{},this.memory.settings.locale); }
}
