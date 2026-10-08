// Tiny i18n layer: German / English. German is the default for German-speaking browsers.
// Dictionaries are plain data modules in client/i18n/*.js (export const en / de), keys are dotted strings,
// values may contain {placeholders}. In-world radio jargon stays German in both languages.
import * as dStatic from '../i18n/static.js';
import * as dUi from '../i18n/ui.js';
import * as dGame from '../i18n/game.js';
import * as dServer from '../i18n/server.js';
import * as dShared from '../i18n/shared.js';

const dicts = { en: {}, de: {} };
for (const d of [dStatic, dUi, dGame, dServer, dShared]) { Object.assign(dicts.en, d.en); Object.assign(dicts.de, d.de); }
let lang = 'en';
const listeners = new Set();

export function register(code, entries) { Object.assign(dicts[code], entries); }

export function detectLang(setting) {
  if (setting === 'de' || setting === 'en') return setting;
  let nav = '';
  try { nav = (navigator.languages && navigator.languages[0]) || navigator.language || ''; } catch { /* no navigator */ }
  return nav.toLowerCase().startsWith('de') ? 'de' : 'en';
}

export function getLang() { return lang; }

export function setLang(code) {
  lang = code === 'de' ? 'de' : 'en';
  if (typeof document !== 'undefined') {
    document.documentElement.lang = lang;
    applyStatic(document);
  }
  for (const fn of listeners) fn(lang);
}

export function onLang(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export const fmt = (str, vars = {}) => String(str).replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? `{${k}}`));

export function t(key, vars) {
  const s = dicts[lang][key] ?? dicts.en[key];
  if (s === undefined) return key;
  return vars ? fmt(s, vars) : s;
}

// pick one of two literal variants
export const L = (de, en) => (lang === 'de' ? de : en);

// static markup: data-i18n (text), data-i18n-html (trusted markup from our own dictionaries), data-i18n-ph (placeholder), data-i18n-title
export function applyStatic(root) {
  for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of root.querySelectorAll('[data-i18n-html]')) el.innerHTML = t(el.dataset.i18nHtml);
  for (const el of root.querySelectorAll('[data-i18n-ph]')) el.placeholder = t(el.dataset.i18nPh);
  for (const el of root.querySelectorAll('[data-i18n-title]')) el.title = t(el.dataset.i18nTitle);
}
