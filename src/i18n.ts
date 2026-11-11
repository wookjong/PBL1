/**
 * Korean / English switch.
 *  - t(ko, en) returns the string for the current language
 *  - the choice is remembered in the browser (localStorage); if storage is unavailable it falls back to Korean
 *  - switching language reloads the page (every view is built from t(), so this keeps things simple)
 */
export type Lang = 'ko' | 'en';

const KEY = 'pbl1-lang';

function load(): Lang {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'ko' || v === 'en') return v;
  } catch {
    /* storage unavailable */
  }
  return 'ko';
}

export const lang: Lang = load();

export const t = (ko: string, en: string): string => (lang === 'ko' ? ko : en);

export function setLang(l: Lang): void {
  if (l === lang) return;
  try {
    localStorage.setItem(KEY, l);
  } catch {
    /* ignore */
  }
  location.reload();
}

/** 1234567 → "1,234,567" */
export const num = (x: number): string => x.toLocaleString('en-US');
