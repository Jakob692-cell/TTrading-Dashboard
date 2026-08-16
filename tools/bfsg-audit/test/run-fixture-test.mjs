#!/usr/bin/env node
/**
 * Regressionstest: startet einen lokalen Server mit der Testseite (test/fixture),
 * lässt den Audit-Lauf darüber laufen und prüft, ob die bewusst eingebauten Barrieren
 * gefunden werden. Aufruf: node test/run-fixture-test.mjs
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const fixtureDir = path.join(here, 'fixture');

const ERWARTET = [
  'contrast-text',            // 1.4.3
  'contrast-nontext',         // 1.4.11
  'color-only-links',         // 1.4.1
  'img-alt-missing',          // 1.1.1
  'img-alt-suspicious',
  'img-link-no-name',
  'button-empty',             // 4.1.2
  'link-empty',
  'link-generic',
  'link-ambiguous',
  'heading-skip',
  'heading-empty',
  'form-unlabelled',
  'form-placeholder-only',
  'form-autocomplete',
  'form-group',
  'aria-role-invalid',
  'aria-ref-broken',
  'aria-hidden-focusable',
  'duplicate-ids',
  'tabindex-positive',
  'table-headers',
  'video-captions',
  'iframe-title',
  'viewport-zoom',
  'lang-missing',
  'title-missing',
  'landmark-main-missing',
  'skiplink-missing',
  'target-size',
  'focus-invisible',
  'reflow-320',
  'clickable-nonsemantic',
  'embed-manual',
];

const server = http.createServer((req, res) => {
  const name = decodeURIComponent((req.url || '/').split('?')[0]);
  const file = path.join(fixtureDir, name === '/' ? 'index.html' : path.basename(name));
  if (fs.existsSync(file) && fs.statSync(file).isFile()) {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    fs.createReadStream(file).pipe(res);
  } else {
    res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
    res.end('<!DOCTYPE html><html lang="de"><head><title>Nicht gefunden</title></head><body><h1>404</h1></body></html>');
  }
});

await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const base = `http://127.0.0.1:${port}/`;
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'bfsg-fixture-'));
console.log(`Testserver: ${base}\nAusgabe:    ${out}`);

const child = spawn(process.execPath, [
  path.join(root, 'bin', 'bfsg-audit.mjs'), base,
  '--max-pages', '8', '--out', out, '--network', 'direct', '--delay', '0', '--no-screenshots',
], { stdio: ['ignore', 'inherit', 'inherit'] });

const code = await new Promise((r) => child.on('exit', r));
server.close();
if (code !== 0) { console.error('Audit-Lauf fehlgeschlagen'); process.exit(1); }

const result = JSON.parse(fs.readFileSync(path.join(out, 'befunde.json'), 'utf8'));
const gefunden = new Set(result.findings.map((f) => f.check));
const fehlend = ERWARTET.filter((c) => ![...gefunden].some((g) => g === c || g.startsWith(c)));

console.log(`\nBefunde gesamt: ${result.findings.length}`);
console.log(`Erwartete Prüfungen gefunden: ${ERWARTET.length - fehlend.length}/${ERWARTET.length}`);
if (fehlend.length) {
  console.error('FEHLT:', fehlend.join(', '));
  process.exit(1);
}
// Kontrastwert plausibilisieren: #999999 auf #ffffff ≈ 2,85:1
const kontrast = result.pages[0].probe.contrast.find((c) => c.fg === '#999999');
if (!kontrast || Math.abs(kontrast.ratio - 2.85) > 0.05) {
  console.error('Kontrastberechnung unplausibel:', kontrast);
  process.exit(1);
}
console.log(`Kontrollrechnung #999999 auf ${kontrast.bg}: ${kontrast.ratio}:1 (erwartet ≈ 2,85)`);
console.log('OK – alle erwarteten Barrieren wurden erkannt.');
