import { t } from '../i18n';
import type { Program, RobotSnapshot } from '../game/types';

/** Geometry in engine coordinates (+Y down). Only the current executed sensor is shown. */
export function sensorOverlay(robot: RobotSnapshot, program: Program) {
  const trace = robot.history.at(-1);
  if (robot.hp <= 0 || !trace || trace.cell !== robot.currentCell) return null;
  const chip = program.cells[trace.cell];
  if (!chip || chip.kind !== trace.kind) return null;
  const param = typeof chip.param === 'number' ? chip.param : undefined;
  // Broken arrows restart execution; the engine intentionally does not retain their boolean.
  const result = trace.branch === 'yes' ? 'YES' : trace.branch === 'no' ? 'NO' : t("結果未記録（空リンク）");
  switch (chip.kind) {
    case 'EnemyAhead': return { kind: chip.kind, range: 600, from: -(param ?? 18) * Math.PI / 180, to: (param ?? 18) * Math.PI / 180, result, label: `${t("前方 左右")}${param ?? 18}° / 600` };
    case 'EnemyNear': return { kind: chip.kind, range: param ?? 260, from: -Math.PI, to: Math.PI, result, label: `${t("近距離")} ${param ?? 260}` };
    case 'EnemyLeft': return { kind: chip.kind, range: 600, from: -Math.PI, to: -.001, result, label: t("左半面 / 600") };
    case 'ObstacleAhead': return { kind: chip.kind, range: 88, from: 0, to: 0, result, label: t("障害物 前方88・接触余白込み") };
    default: return null;
  }
}
