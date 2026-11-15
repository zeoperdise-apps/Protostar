import { CHIP_CATALOG } from './catalog';
import { CELL_COUNT, GRID_SIZE, type Branch, type Chip, type Diagnostic, type Direction, type LabelName, type Program } from './types';
export const DIRECTIONS: readonly Direction[] = ['N', 'E', 'S', 'W'];
export const LABELS: readonly LabelName[] = ['A', 'B', 'C', 'D', 'E'];
export const createEmptyProgram = (): Program => ({ size: 16, cells: Array.from({ length: CELL_COUNT }, () => null) });
export function cellIndex(x: number, y: number): number { return y * GRID_SIZE + x; }
export function cellCoordinates(index: number): { x: number; y: number } { return { x: index % GRID_SIZE, y: Math.floor(index / GRID_SIZE) }; }
export function adjacentCell(index: number, direction?: Direction): number | null {
  const { x, y } = cellCoordinates(index);
  const dx = direction === 'E' ? 1 : direction === 'W' ? -1 : 0;
  const dy = direction === 'S' ? 1 : direction === 'N' ? -1 : 0;
  if (!direction || x + dx < 0 || x + dx >= GRID_SIZE || y + dy < 0 || y + dy >= GRID_SIZE) return null;
  return cellIndex(x + dx, y + dy);
}
export interface CompiledProgram { start: number | null; labels: Partial<Record<LabelName, number>>; diagnostics: Diagnostic[] }
export function compileProgram(program: Program): CompiledProgram {
  const diagnostics: Diagnostic[] = [];
  let start: number | null = null;
  const labels: Partial<Record<LabelName, number>> = {};
  if (program.size !== 16 || program.cells.length !== CELL_COUNT) {
    return { start, labels, diagnostics: [{ severity: 'error', code: 'grid-size', message: 'AI盤は16×16（256セル）である必要があります。' }] };
  }
  for (let i = 0; i < CELL_COUNT; i++) {
    const chip = program.cells[i];
    if (!chip) continue;
    const definition = CHIP_CATALOG[chip.kind];
    if (!definition) { diagnostics.push({ severity: 'error', code: 'unknown-chip', message: '不明なチップです。', cell: i }); continue; }
    if (chip.kind === 'Start') {
      if (start !== null) diagnostics.push({ severity: 'error', code: 'duplicate-start', message: '開始チップは1個だけ配置してください。', cell: i });
      else start = i;
    }
    if (chip.kind === 'Label') {
      const label = chip.param as LabelName;
      if (!LABELS.includes(label)) diagnostics.push({ severity: 'error', code: 'invalid-label', message: 'ラベルにはA〜Eを指定してください。', cell: i });
      else if (labels[label] !== undefined) diagnostics.push({ severity: 'error', code: 'duplicate-label', message: `ラベル${label}が重複しています。`, params: {label}, cell: i });
      else labels[label] = i;
    }
    if (definition.params && chip.param !== undefined && !definition.params.some(item => item.value === chip.param)) {
      // Numeric sensor thresholds may be freely set in valid bounds by JSON imports.
      if (!(typeof chip.param === 'number' && Number.isFinite(chip.param) && ['EnemyAhead', 'EnemyNear', 'HpLow', 'EnergyLow', 'Wait'].includes(chip.kind))) {
        diagnostics.push({ severity: 'error', code: 'invalid-param', message: `${definition.name}の設定値が不正です。`, kind: chip.kind, cell: i });
      }
    }
    if (chip.kind !== 'End' && chip.kind !== 'Jump') {
      const branches: ('next' | 'yes' | 'no')[] = definition.conditional ? ['yes', 'no'] : ['next'];
      for (const branch of branches) {
        const target = adjacentCell(i, chip[branch]);
        if (target === null || !program.cells[target]) diagnostics.push({ severity: 'warning', code: 'broken-link', message: `${branch === 'yes' ? 'YES' : branch === 'no' ? 'NO' : '通常'}リンクが空です。開始へ戻ります。`, branch, cell: i });
      }
    }
  }
  if (start === null) diagnostics.push({ severity: 'error', code: 'missing-start', message: '開始チップを1個配置してください。' });
  for (let i = 0; i < CELL_COUNT; i++) {
    const chip = program.cells[i];
    if (chip?.kind === 'Jump' && labels[chip.param as LabelName] === undefined) diagnostics.push({ severity: 'error', code: 'missing-label', message: `ジャンプ先${String(chip.param ?? 'A')}がありません。`, params: {label:String(chip.param ?? 'A')}, cell: i });
  }
  if (start !== null) {
    const visited = new Set<number>();
    const queue = [start];
    while (queue.length) {
      const index = queue.pop()!;
      if (visited.has(index)) continue;
      visited.add(index);
      const chip = program.cells[index];
      if (!chip || !CHIP_CATALOG[chip.kind]) continue;
      if (chip.kind === 'End') queue.push(start);
      else if (chip.kind === 'Jump') { const target = labels[chip.param as LabelName]; if (target !== undefined) queue.push(target); }
      else for (const branch of CHIP_CATALOG[chip.kind].conditional ? ['yes', 'no'] as const : ['next'] as const) {
        const target = adjacentCell(index, chip[branch]);
        queue.push(target !== null && program.cells[target] ? target : start);
      }
    }
    program.cells.forEach((chip, cell) => { if (chip && !visited.has(cell)) diagnostics.push({ severity: 'warning', code: 'unreachable', message: '開始地点から到達できないチップです。', cell }); });
  }
  return { start, labels, diagnostics: diagnostics.map(item => item.cell === undefined ? item : { ...item, ...cellCoordinates(item.cell) }) };
}
export const validateProgram = (program: Program): Diagnostic[] => compileProgram(program).diagnostics;
export function resolveNext(program: Program, compiled: CompiledProgram, cell: number, condition?: boolean): { target: number | null; branch: Branch } {
  const chip = program.cells[cell];
  if (!chip || !CHIP_CATALOG[chip.kind]) return { target: compiled.start, branch: 'restart' };
  if (chip.kind === 'End') return { target: compiled.start, branch: 'restart' };
  if (chip.kind === 'Jump') return { target: compiled.labels[(chip.param ?? 'A') as LabelName] ?? compiled.start, branch: 'jump' };
  const branch = CHIP_CATALOG[chip.kind].conditional ? condition ? 'yes' : 'no' : 'next';
  const target = adjacentCell(cell, chip[branch]);
  return target !== null && program.cells[target] ? { target, branch } : { target: compiled.start, branch: 'restart' };
}
export function makeChip(kind: Chip['kind'], overrides: Partial<Chip> = {}): Chip {
  const definition = CHIP_CATALOG[kind];
  return { kind, ...(definition.defaultParam !== undefined ? { param: definition.defaultParam } : {}), ...(definition.conditional ? { yes: 'E', no: 'S' } : { next: 'E' }), ...overrides };
}
