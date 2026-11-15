import { en, ja, type MessageKey } from './messages';
export type Locale = 'ja' | 'en';
export type MessageParams = Record<string, string | number>;
let current: Locale = 'ja';
const formatted = new Map<string,{key:MessageKey;params:MessageParams}>();
export function getLocale(): Locale { return current; }
export function browserLocale(language?: string): Locale { return language === undefined || language.toLowerCase().startsWith('ja') ? 'ja' : 'en'; }
export function setLocale(locale: Locale): void {
  current = locale;
  if (typeof document !== 'undefined') {
    document.documentElement.lang = locale;
    document.title = 'PROTOSTAR — Autonomous Combat Lab';
    document.querySelector('meta[name="description"]')?.setAttribute('content', t('meta.description'));
  }
}
export function t(key: MessageKey, params: MessageParams = {}, locale: Locale = current): string {
  const template: string = (locale === 'ja' ? ja : en)[key];
  const message=template.replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? `{${name}}`));
  formatted.set(message,{key,params:{...params}});return message;
}
/** Exact lookup for immutable source catalog labels, never a pattern translation. */
export function localizeText(text: string, locale: Locale = current): string {
  return Object.hasOwn(ja, text) ? t(text as MessageKey, {}, locale) : text;
}
export type { MessageKey };

export function translateRendered(message:string):string {
  const source=formatted.get(message);if(!source)return message;
  const params={...source.params};
  if(typeof params.label==='string'){const key=(Object.keys(ja) as MessageKey[]).find(key=>ja[key]===params.label||en[key]===params.label);if(key)params.label=t(key);}
  return t(source.key,params);
}
