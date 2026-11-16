import { CHIPS, FRAMES, WEAPONS } from '../game/catalog';
import { PRESETS } from '../data/presets';
import type { ChipDefinition, ChipKind, Diagnostic, FrameDefinition, FrameId, Preset, WeaponDefinition, WeaponId } from '../game/types';
import { getLocale, localizeText, t, type Locale, type MessageKey } from './index';
const cache = new Map<Locale, ReturnType<typeof buildCatalog>>();
function buildCatalog(locale: Locale) {
  const chips = CHIPS.map(d => ({ ...d, name: localizeText(d.name, locale), description: localizeText(d.description, locale), params: d.params?.map(p => ({ ...p, label: d.kind === 'Wait' ? t('param.seconds', {value:p.value}, locale) : d.kind === 'EnemyAhead' ? t('param.cone', {value:p.value}, locale) : d.kind === 'HpLow' || d.kind === 'EnergyLow' ? t('param.threshold', {value:Number(p.value)*100}, locale) : localizeText(p.label, locale) })) }));
  const records = <K extends string, V extends {name:string;description:string}>(source:Record<K,V>):Record<K,V> => Object.fromEntries(Object.entries(source).map(([key,d]) => { const item=d as V; return [key,{...item,name:localizeText(item.name,locale),description:localizeText(item.description,locale)}]; })) as Record<K,V>;
  return { CHIPS:chips as readonly ChipDefinition[], CHIP_CATALOG:Object.fromEntries(chips.map(d=>[d.kind,d])) as Record<ChipKind,ChipDefinition>, FRAMES:records<FrameId,FrameDefinition>(FRAMES), WEAPONS:records<WeaponId,WeaponDefinition>(WEAPONS) };
}
export function catalog() { const locale=getLocale(); if(!cache.has(locale))cache.set(locale,buildCatalog(locale)); return cache.get(locale)!; }
export function presets(): readonly Preset[] { return PRESETS.map(p=>({...p,name:localizeText(p.name),description:localizeText(p.description),robot:{...p.robot,name:localizeText(p.robot.name)}})); }
export function diagnosticMessage(d: Diagnostic): string {
  const params = {...d.params};
  if(d.kind)params.chip=catalog().CHIP_CATALOG[d.kind].name;
  if(d.branch)params.branch=d.branch==='next'?t('通常 →').replace(' →',''):d.branch.toUpperCase();
  return t(('diagnostic.'+d.code) as MessageKey,params);
}
