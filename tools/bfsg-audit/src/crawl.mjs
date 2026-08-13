/**
 * Phase 1 – Discovery: robots.txt, sitemap.xml, URL-Normalisierung, Link-Klassifizierung.
 * Der eigentliche Crawl-Lauf wird von bin/bfsg-audit.mjs gesteuert (BFS über die Queue),
 * weil dort ohnehin jede Seite im Browser geöffnet wird.
 */
import { fetchRaw } from './browser.mjs';

const DOC_EXT = /\.(pdf|docx?|xlsx?|pptx?|odt|ods|odp|rtf|csv|epub)(\?|#|$)/i;
const ASSET_EXT = /\.(png|jpe?g|gif|svg|webp|avif|ico|css|js|mjs|json|xml|zip|rar|7z|gz|mp4|webm|mp3|wav|ogg|woff2?|ttf|eot|map)(\?|#|$)/i;

export function normalizeUrl(href, base) {
  try {
    const u = new URL(href, base);
    u.hash = '';
    // Tracking-Parameter entfernen, damit Varianten nicht mehrfach gecrawlt werden
    for (const p of [...u.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid|mc_cid|mc_eid|_ga)/i.test(p)) u.searchParams.delete(p);
    }
    if (u.pathname.length > 1 && u.pathname.endsWith('/')) u.pathname = u.pathname.replace(/\/+$/, '');
    return u.toString();
  } catch {
    return null;
  }
}

export function hostKey(url) {
  try {
    return new URL(url).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return '';
  }
}

export function isInternal(url, baseUrl, { includeSubdomains = true } = {}) {
  const a = hostKey(url);
  const b = hostKey(baseUrl);
  if (!a || !b) return false;
  return includeSubdomains ? a === b || a.endsWith('.' + b) : a === b;
}

export function classifyLink(href, baseUrl) {
  if (!href) return { kind: 'invalid' };
  const raw = href.trim();
  if (/^mailto:/i.test(raw)) return { kind: 'mail', url: raw };
  if (/^tel:/i.test(raw)) return { kind: 'tel', url: raw };
  if (/^javascript:/i.test(raw)) return { kind: 'javascript', url: raw };
  if (/^#/.test(raw)) return { kind: 'anchor', url: raw };
  const url = normalizeUrl(raw, baseUrl);
  if (!url) return { kind: 'invalid', url: raw };
  if (DOC_EXT.test(url)) return { kind: 'document', url };
  if (ASSET_EXT.test(url)) return { kind: 'asset', url };
  if (!isInternal(url, baseUrl)) return { kind: 'external', url };
  return { kind: 'page', url };
}

/** Minimaler robots.txt-Parser für User-agent: * (Allow/Disallow, longest match gewinnt). */
export class Robots {
  constructor(text = '') {
    this.rules = [];
    this.sitemaps = [];
    let applies = false;
    for (const line of text.split(/\r?\n/)) {
      const l = line.replace(/#.*$/, '').trim();
      if (!l) continue;
      const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(l);
      if (!m) continue;
      const key = m[1].toLowerCase();
      const val = m[2].trim();
      if (key === 'user-agent') applies = val === '*';
      else if (key === 'sitemap') this.sitemaps.push(val);
      else if ((key === 'disallow' || key === 'allow') && applies && val) {
        this.rules.push({ allow: key === 'allow', path: val });
      }
    }
  }

  isAllowed(url) {
    let pathname;
    try {
      const u = new URL(url);
      pathname = u.pathname + (u.search || '');
    } catch {
      return true;
    }
    let best = null;
    for (const r of this.rules) {
      const pattern = r.path.replace(/\*/g, '');
      if (pathname.startsWith(pattern.split('$')[0])) {
        if (!best || pattern.length > best.len) best = { allow: r.allow, len: pattern.length };
      }
    }
    return best ? best.allow : true;
  }
}

export async function loadRobots(origin, dispatcher) {
  try {
    const res = await fetchRaw(new URL('/robots.txt', origin).toString(), { dispatcher, timeout: 15000 });
    if (res.status >= 200 && res.status < 300) return new Robots(res.body.toString('utf8'));
  } catch { /* robots.txt ist optional */ }
  return new Robots('');
}

/** Liest sitemap.xml (inkl. Sitemap-Index, eine Ebene tief). */
export async function loadSitemapUrls(origin, dispatcher, extra = [], limit = 500) {
  const candidates = [new URL('/sitemap.xml', origin).toString(), ...extra];
  const urls = new Set();
  const seen = new Set();
  for (const c of candidates.slice(0, 5)) {
    if (seen.has(c)) continue;
    seen.add(c);
    let body;
    try {
      const res = await fetchRaw(c, { dispatcher, timeout: 20000 });
      if (res.status >= 400) continue;
      body = res.body.toString('utf8');
    } catch { continue; }
    const isIndex = /<sitemapindex/i.test(body);
    for (const m of body.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)) {
      const loc = m[1];
      if (isIndex) { if (candidates.length < 5) candidates.push(loc); }
      else if (urls.size < limit) urls.add(loc);
    }
  }
  return [...urls];
}

/** Priorisiert URLs, die für BFSG-relevante Prozesse typisch sind. */
const PRIORITY = [
  /(kontakt|contact)/i, /(impressum|legal)/i, /(datenschutz|privacy)/i,
  /(barrierefrei|accessibility|erklaerung-zur-barrierefreiheit)/i,
  /(shop|produkt|product|kasse|checkout|warenkorb|cart|bestell)/i,
  /(login|anmelden|registrier|konto|account|signup)/i,
  /(buchen|booking|termin|reservier)/i, /(preis|pricing|tarif)/i,
  /(suche|search)/i, /(agb|terms)/i, /(faq|hilfe|support)/i,
];

export function priorityScore(url) {
  let s = 0;
  PRIORITY.forEach((re, i) => { if (re.test(url)) s += PRIORITY.length - i; });
  const depth = (new URL(url).pathname.match(/\//g) || []).length;
  return s * 10 - depth;
}
