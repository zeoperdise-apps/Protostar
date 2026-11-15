import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultSave, validateSave, importSave, exportSave, SaveStore, SAVE_KEY, errorMessage } from '../src/storage/save';
import { browserLocale, setLocale, t, translateRendered } from '../src/i18n';
import { en, ja } from '../src/i18n/messages';
import { catalog, presets, diagnosticMessage } from '../src/i18n/display';
import { createStarterRobots, PRESETS } from '../src/data/presets';
import { validateProgram, createEmptyProgram, makeChip } from '../src/game/program';

test('old version 1 saves preserve robots and victories, and default missing locale to Japanese',()=>{
 const old:any=createDefaultSave();delete old.settings.locale;old.robots[0].name='利用者の改良機';old.clearedPresets=['training','hunter'];
 const loaded=validateSave(old);assert.equal(loaded.settings.locale,'ja');assert.deepEqual(loaded.robots,old.robots);assert.deepEqual(loaded.clearedPresets,old.clearedPresets);
 const storage={getItem:()=>JSON.stringify(old),setItem:()=>{}};assert.deepEqual(new SaveStore(storage,'en').load(),loaded);
});
test('both locales round trip; explicit invalid locales are rejected and custom names remain data',()=>{
 for(const locale of ['ja','en'] as const){const save=createDefaultSave(locale);save.robots[0].name='名前 / My robot';assert.deepEqual(importSave(exportSave(save)).data,save);assert.equal(save.settings.locale,locale);}
 for(const locale of [null,'fr','EN',1,false]){const save:any=createDefaultSave();save.settings.locale=locale;assert.equal(importSave(JSON.stringify(save),'en').ok,false);}
 assert.equal(createDefaultSave('en').robots[0].name,'01 / Custom Chaser');assert.equal(createStarterRobots()[0].name,'01 / 追撃カスタム');
 assert.equal(browserLocale('ja-JP'),'ja');assert.equal(browserLocale('en-US'),'en');assert.equal(browserLocale('fr-FR'),'en');assert.equal(browserLocale(),'ja');
});
test('new stores use the requested locale; saved language wins over browser preference',()=>{
 let json:string|null=null;const storage={getItem:()=>json,setItem:(_key:string,value:string)=>{json=value;}};
 const store=new SaveStore(storage,'en');const save=store.load();assert.equal(save.settings.locale,'en');store.save(save);assert.equal(new SaveStore(storage,'ja').load().settings.locale,'en');assert.equal(SAVE_KEY,'protostar.save.v1');
});
test('typed dictionaries cover every immutable catalog/preset message without mutating source data',()=>{
 assert.deepEqual(Object.keys(ja).sort(),Object.keys(en).sort());const original=JSON.stringify(PRESETS);
 setLocale('en');for(const item of [...catalog().CHIPS,...Object.values(catalog().FRAMES),...Object.values(catalog().WEAPONS),...presets()]){assert.doesNotMatch(item.name+item.description,/[\u3040-\u30ff\u3400-\u9fff]/);}
 for(const chip of catalog().CHIPS)for(const param of chip.params||[])assert.doesNotMatch(param.label,/[\u3040-\u30ff\u3400-\u9fff]/);
 assert.equal(JSON.stringify(PRESETS),original);setLocale('ja');
});
test('dynamic diagnostics use code and structured interpolation; save errors localize at the boundary',()=>{
 setLocale('en');const program=createEmptyProgram();program.cells[0]=makeChip('Start');program.cells[1]=makeChip('Label',{param:'A'});program.cells[2]=makeChip('Label',{param:'A'});program.cells[3]=makeChip('Jump',{param:'B'});
 const diagnostics=validateProgram(program);assert.ok(diagnostics.some(d=>d.code==='duplicate-label'));assert.ok(diagnostics.some(d=>d.code==='missing-label'));
 for(const d of diagnostics)assert.doesNotMatch(diagnosticMessage(d),/[\u3040-\u30ff\u3400-\u9fff]/);
 assert.match(diagnosticMessage(diagnostics.find(d=>d.code==='duplicate-label')!),/Label A is duplicated/);
 const invalid:any=createDefaultSave();invalid.robots[0].name='';const nameError=importSave(JSON.stringify(invalid),'en').error!;assert.match(nameError,/Robot name must be 1–40/);setLocale('ja');assert.match(translateRendered(nameError),/機体名は1〜40/);setLocale('en');
 invalid.robots[0].name='x';invalid.settings.volume=20;assert.match(importSave(JSON.stringify(invalid),'en').error!,/Invalid number for Volume/);
 try{validateSave(invalid);assert.fail('must reject');}catch(error){assert.match(errorMessage(error,'en'),/Volume/);}
 assert.equal(t('diagnostic.control-loop',{},'en'),'No action in 128 consecutive instructions. AI stopped safely.');setLocale('ja');
});
