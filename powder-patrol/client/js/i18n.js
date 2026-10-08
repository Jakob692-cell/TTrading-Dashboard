// Tiny i18n layer: German / English. German is the default for German-speaking browsers.
// Dictionaries are plain objects registered per module (see client/i18n/*.js), keys are dotted strings,
// values may contain {placeholders}. In-world radio jargon stays German in both languages.
const dicts = { en: {}, de: {} };
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
