import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultSave, exportRobot, exportSave, importRobot, importSave, MAX_IMPORT_BYTES, SAVE_KEY, SaveStore, validateSave, type StorageLike } from '../src/storage/save';
class MemoryStorage implements StorageLike {
  values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}
test('versioned save and robot JSON round trip without sharing mutable state', () => {
  const data = createDefaultSave(), imported = importSave(exportSave(data));
  assert.ok(imported.ok); assert.deepEqual(imported.data, data);
  assert.deepEqual(importRobot(exportRobot(data.robots[0])).robot, data.robots[0]);
  const storage = new MemoryStorage(), store = new SaveStore(storage);
  store.save(data); store.recordVictory('training');
  assert.deepEqual(new SaveStore(storage).load().clearedPresets, ['training']);
  store.recordVictory('training'); assert.deepEqual(store.load().clearedPresets, ['training']);
  const snapshot = store.load(); snapshot.robots[0].name = 'Changed';
  assert.notEqual(store.load().robots[0].name, 'Changed');
});
test('corrupted JSON, missing fields and unknown versions recover to usable starter robots', () => {
  for (const json of ['{broken', '{}', '{"version":999}', 'null', '[]']) {
    const storage = new MemoryStorage(); storage.setItem(SAVE_KEY, json);
    const store = new SaveStore(storage);
    assert.equal(store.status.recovered, true); assert.equal(store.load().robots.length, 3);
    assert.equal(importSave(storage.getItem(SAVE_KEY)!).ok, true);
  }
});
test('unavailable or quota-exceeded storage continues in memory', () => {
  const throws: StorageLike = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('quota'); } };
  const store = new SaveStore(throws); assert.equal(store.status.persistent, false);
  const data = store.load(); data.robots[0].name = 'Session robot'; store.save(data);
  assert.equal(store.load().robots[0].name, 'Session robot');
  assert.equal(new SaveStore(null).status.persistent, false);
  const writeThrows: StorageLike = { getItem: () => null, setItem() { throw new Error('full'); } };
  const quota = new SaveStore(writeThrows); quota.recordVictory('training');
  assert.equal(quota.status.persistent, false); assert.deepEqual(quota.load().clearedPresets, ['training']);
});
test('import validates byte size, grid, types, names, equipment, finite numbers and references', () => {
  assert.equal(importSave(' '.repeat(MAX_IMPORT_BYTES + 1)).ok, false);
  const mutations: ((value: any) => void)[] = [
    d => { d.version = 2; }, d => { d.robots = []; }, d => { d.robots[0].name = 'x'.repeat(41); },
    d => { d.robots[0].frame = 'unknown'; }, d => { d.robots[0].leftWeapon = '__proto__'; },
    d => { d.robots[0].program.size = 15; }, d => { d.robots[0].program.cells.pop(); },
    d => { d.robots[0].program.cells[0] = { kind: 'Unknown' }; },
    d => { d.robots[0].program.cells[0] = { kind: 'Forward', next: 'UP' }; },
    d => { d.robots[0].program.cells[0] = { kind: 'Backward', param: 'long' }; },
    d => { d.robots[0].program.cells[0] = { kind: 'TurnLeft', param: 17 }; },
    d => { d.robots[0].program.cells[0] = { kind: 'EnergyLow', param: 7 }; },
    d => { d.robots[0].program.cells[0] = { kind: 'Wait', param: '5' }; },
    d => { d.robots[1].id = d.robots[0].id; }, d => { d.settings.volume = -1; },
    d => { d.config.leftRobotId = 'missing'; }, d => { d.config.opponentId = 'missing'; }, d => { d.config.seed = 1.5; },
    d => { d.clearedPresets = ['fake']; },
  ];
  for (const mutate of mutations) {
    const data = createDefaultSave(); mutate(data);
    assert.equal(importSave(JSON.stringify(data)).ok, false, mutate.toString());
  }
  const nonfinite = createDefaultSave(); nonfinite.settings.volume = Number.NaN;
  assert.throws(() => validateSave(nonfinite));
  nonfinite.settings.volume = 0.5; nonfinite.robots[0].program.cells[0] = { kind: 'Wait', param: Infinity };
  assert.throws(() => validateSave(nonfinite));
});
test('unfinished graphs can be saved; failed imports preserve previous user work', () => {
  const store = new SaveStore(null), data = store.load();
  data.robots[0].program.cells.fill(null); store.save(data);
  const before = store.export(); assert.equal(store.import('{bad').ok, false); assert.equal(store.export(), before);
  const clean = importSave(before); assert.equal(clean.ok, true);
});
