/**
 * Browser-Start und Netzwerkanbindung.
 *
 * Zwei Netzwerkmodi:
 *  - "direct": Chromium baut die Verbindungen selbst auf (Normalfall).
 *  - "relay":  Alle Requests werden abgefangen und über undici (mit HTTPS_PROXY und
 *              CA-Bundle) ausgeführt. Nötig in abgeschotteten Umgebungen, in denen
 *              Chromium keine eigene Egress-Verbindung aufbauen darf.
 * Standard ist "auto": es wird ein Testaufruf im Direktmodus gemacht; scheitert er,
 * wird automatisch auf "relay" umgeschaltet.
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { Agent, ProxyAgent, request as undiciRequest } from 'undici';

/** Sucht eine nutzbare Chromium-Binary (vorinstallierte Browser haben Vorrang). */
export function resolveChromiumPath() {
  if (process.env.BFSG_CHROMIUM_PATH) return process.env.BFSG_CHROMIUM_PATH;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (root && fs.existsSync(root)) {
    const dirs = fs
      .readdirSync(root)
      .filter((d) => /^chromium-\d+$/.test(d))
      .sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));
    for (const d of dirs) {
      const p = path.join(root, d, 'chrome-linux', 'chrome');
      if (fs.existsSync(p)) return p;
    }
  }
  return undefined; // Playwright nutzt seine eigene Installation
}

function buildDispatcher() {
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  const caPath = process.env.NODE_EXTRA_CA_CERTS || '/root/.ccr/ca-bundle.crt';
  const ca = fs.existsSync(caPath) ? fs.readFileSync(caPath) : undefined;
  if (proxy) return new ProxyAgent({ uri: proxy, requestTls: ca ? { ca } : undefined });
  return new Agent(ca ? { connect: { ca } } : {});
}

const HOP_BY_HOP = new Set([
  'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
  'te', 'trailer', 'transfer-encoding', 'upgrade', 'content-encoding', 'content-length',
]);

/** Führt einen HTTP-Request ausserhalb des Browsers aus (proxy- und CA-bewusst). */
export async function fetchRaw(url, { dispatcher, method = 'GET', headers = {}, body, timeout = 30000 } = {}) {
  const d = dispatcher || buildDispatcher();
  const h = {};
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === 'accept-encoding') continue;
    // Nicht-ASCII in Headern führt bei manchen Servern zu 4xx/5xx – defensiv entfernen
    h[k] = String(v).replace(/[^\x20-\x7e]/g, '');
  }
  const res = await undiciRequest(url, { dispatcher: d, method, headers: h, body, headersTimeout: timeout, bodyTimeout: timeout });
  const buf = Buffer.from(await res.body.arrayBuffer());
  return { status: res.statusCode, headers: res.headers, body: buf };
}

/**
 * Startet Chromium und liefert { browser, context, mode, dispatcher, close }.
 */
export async function launchBrowser({ networkMode = 'auto', userAgent, locale = 'de-DE', timezone = 'Europe/Berlin', probeUrl } = {}) {
  const dispatcher = buildDispatcher();
  const executablePath = resolveChromiumPath();
  const browser = await chromium.launch({
    executablePath,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-features=IsolateOrigins'],
  });

  let mode = networkMode;
  if (mode === 'auto') mode = probeUrl ? await probeDirect(browser, probeUrl) : 'relay';

  const context = await browser.newContext({
    locale,
    timezoneId: timezone,
    // bewusst rein ASCII: Nicht-ASCII-Zeichen im User-Agent lassen manche Server/WAFs
    // mit HTTP 500 antworten und verfälschen damit das gesamte Audit.
    userAgent: userAgent ||
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 bfsg-audit/1.0 (+accessibility-audit)',
    viewport: { width: 1440, height: 900 },
    ignoreHTTPSErrors: false,
  });

  if (mode === 'relay') await installRelay(context, dispatcher);

  return {
    browser,
    context,
    mode,
    dispatcher,
    async close() {
      await context.close().catch(() => {});
      await browser.close().catch(() => {});
      // Ohne das Beenden des Dispatchers halten offene Keep-alive-Sockets die
      // Event-Loop am Leben und der Prozess beendet sich nicht. destroy() statt close(),
      // weil close() auf noch laufende Anfragen wartet und dabei selbst hängen kann.
      await dispatcher.destroy().catch(() => {});
    },
  };
}

async function probeDirect(browser, url) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  try {
    await page.goto(url, { timeout: 20000, waitUntil: 'domcontentloaded' });
    await ctx.close();
    return 'direct';
  } catch {
    await ctx.close().catch(() => {});
    return 'relay';
  }
}

/** Leitet sämtliche Browser-Requests über den Node-Prozess (proxy-fähig) um. */
async function installRelay(context, dispatcher) {
  await context.route('**/*', async (route) => {
    const req = route.request();
    const url = req.url();
    if (!/^https?:/i.test(url)) return route.continue().catch(() => {});
    try {
      const res = await fetchRaw(url, {
        dispatcher,
        method: req.method(),
        headers: req.headers(),
        body: req.postDataBuffer() || undefined,
      });
      const headers = {};
      for (const [k, v] of Object.entries(res.headers)) {
        if (HOP_BY_HOP.has(k.toLowerCase())) continue;
        headers[k] = Array.isArray(v) ? v.join(', ') : String(v);
      }
      await route.fulfill({ status: res.status, headers, body: res.body });
    } catch {
      await route.abort().catch(() => {});
    }
  });
}
