import { en, type Key } from './en';
import { es } from './es';

export type { Key };
export type Lang = 'en' | 'es';
export type Params = Record<string, string | number>;
export type T = (key: Key, params?: Params) => string;

const DICTS: Record<Lang, Record<Key, string>> = { en, es };

/** Looks up key in lang and fills {name} placeholders. Values are inserted as is (no escaping, no re-expansion). */
export function translate(lang: Lang, key: Key, params?: Params): string {
  const text = DICTS[lang][key];
  return params ? text.replace(/\{(\w+)\}/g, (m, name: string) => (name in params ? String(params[name]) : m)) : text;
}

export const translator = (lang: Lang): T => (key, params) => translate(lang, key, params);

/** The device's BCP 47 locale, e.g. "es-MX". Hermes ships Intl, so no native module is needed. */
export function deviceLocale(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale;
  } catch {
    return 'en-US';
  }
}

/** The supported language for a locale; anything not Spanish falls back to English. */
export const langOf = (locale: string): Lang => (locale.toLowerCase().split('-')[0] === 'es' ? 'es' : 'en');
