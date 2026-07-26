#!/usr/bin/env node
/* ============================================================================
 *  build.js
 *  Baut aus den Quelldateien eine einzige, in sich geschlossene HTML-Datei
 *  (`dist/index.html`): CSS und JavaScript werden minifiziert und inline
 *  eingebettet. Ergebnis ist ein Deploy-Artefakt ohne jede Abhaengigkeit —
 *  eine Datei, die man hochladen oder verschicken kann.
 *
 *  Fuer die Entwicklung wird das NICHT gebraucht: `index.html` laeuft direkt.
 *
 *  Aufruf:  node build.js
 *  Bedarf:  npm i terser clean-css   (nur zum Bauen)
 * ==========================================================================*/
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const DIST = path.join(ROOT, 'dist');

/** Ladereihenfolge — identisch zu den <script>-Tags in index.html. */
const SCRIPTS = [
  'utils', 'settings', 'audio', 'skins', 'particles', 'food', 'snake',
  'ai', 'camera', 'input', 'events', 'renderer', 'ui', 'game', 'main'
];

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function kb(str) {
  return (Buffer.byteLength(str, 'utf8') / 1024).toFixed(1) + ' kB';
}

(async function build() {
  const { minify } = require('terser');
  const CleanCSS = require('clean-css');

  /* --- JavaScript ---------------------------------------------------------
     Alle Module in Ladereihenfolge zusammenfuegen und gemeinsam minifizieren.
     Property-Mangling bleibt aus: die Module reden ueber benannte Felder
     miteinander (SNK.*), das darf nicht umbenannt werden. */
  const sources = {};
  let rawJs = 0;
  for (const name of SCRIPTS) {
    const code = read(path.join('js', name + '.js'));
    rawJs += Buffer.byteLength(code, 'utf8');
    sources['js/' + name + '.js'] = code;
  }

  const jsResult = await minify(sources, {
    compress: { passes: 2 },
    mangle: true,          // nur lokale Namen
    format: { comments: false },
    sourceMap: false
  });
  if (jsResult.error) throw jsResult.error;
  const js = jsResult.code;

  /* --- CSS ----------------------------------------------------------------
     Bewusst Level 1: nur Whitespace und Kommentare. Level 2 fasst Regeln
     zusammen und kann moderne Funktionen wie color-mix() beschaedigen. */
  const rawCss = read(path.join('css', 'style.css'));
  const cssResult = new CleanCSS({ level: 1 }).minify(rawCss);
  if (cssResult.errors.length) throw new Error(cssResult.errors.join('\n'));
  const css = cssResult.styles;

  /* --- HTML ---------------------------------------------------------------
     Stylesheet-Link und alle Script-Tags durch Inline-Bloecke ersetzen. */
  let html = read('index.html');

  html = html.replace(
    /[ \t]*<link rel="stylesheet" href="css\/style\.css">\n/,
    '<style>' + css + '</style>\n'
  );

  // Den kompletten Script-Block (inkl. Kommentar davor) durch ein Tag ersetzen.
  const scriptBlock = /[ \t]*<!-- =+ Skripte[\s\S]*?<script src="js\/main\.js"><\/script>\n/;
  if (!scriptBlock.test(html)) {
    throw new Error('Script-Block in index.html nicht gefunden – build.js anpassen.');
  }
  html = html.replace(scriptBlock, '<script>' + js + '</script>\n');

  // HTML selbst nur sanft eindampfen: Kommentare und Leerzeilen raus.
  html = html
    .replace(/<!--(?!\[if)[\s\S]*?-->/g, '')
    .replace(/^[ \t]*\n/gm, '');

  if (/<script src=|<link rel="stylesheet"/.test(html)) {
    throw new Error('Es sind noch externe Referenzen im Build – Abbruch.');
  }

  fs.mkdirSync(DIST, { recursive: true });
  fs.writeFileSync(path.join(DIST, 'index.html'), html);

  console.log('JS  : ' + kb(String(rawJs ? ' '.repeat(rawJs) : '')) + ' -> ' + kb(js));
  console.log('CSS : ' + kb(rawCss) + ' -> ' + kb(css));
  console.log('dist/index.html: ' + kb(html));
})().catch(function (err) {
  console.error('Build fehlgeschlagen:', err && err.message ? err.message : err);
  process.exit(1);
});
