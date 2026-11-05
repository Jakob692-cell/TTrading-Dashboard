// Baut das Van-Eik-Pitchdeck lokal aus den Slide-Dateien:
//   index.html  – Präsentationsansicht (Pfeiltasten / Klick, Vollbild mit F)
//   Van_Eik_Pitch.pdf – 16:9-PDF, eine Folie pro Seite
//   png/NN.png  – jede Folie als Bild
//
// Aufruf:  node pitch/build.mjs            (aus dem Repo-Root)
// Benötigt: Playwright + Chromium (nur für PDF/PNG).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = process.env.DECK_SRC || path.join(here, 'deck-source', 'project');
const ASSETS = 'assets';
const map = JSON.parse(fs.readFileSync(path.join(here, 'assets', 'blobmap.json'), 'utf8'));
const deck = JSON.parse(fs.readFileSync(path.join(SRC, 'deck.json'), 'utf8'));

const fontLinks = Object.values(deck.faces || {})
  .filter(f => f.href)
  .map(f => `<link rel="stylesheet" href="${f.href}">`)
  .join('\n');

// data-crop="ZOOM X% Y%" (Editor-Zuschnitt) lokal als object-position nachbilden
const crop = s => s.replace(/<img([^>]*?)data-crop="([\d.]+) ([\d.]+%) ([\d.]+%)"([^>]*?)style="([^"]*)"/g,
  (m, a, z, x, y, b, st) => `<img${a}data-crop="${z} ${x} ${y}"${b}style="${st};object-position:${x} ${y}"`);
const blob = s => crop(s).replace(/\/_blob\/([0-9a-f]{32})/g, (m, id) => {
  if (!map[id]) throw new Error(`Unbekanntes Asset ${id}`);
  return `${ASSETS}/${map[id]}`;
});

const slides = deck.order.map(id => {
  const html = fs.readFileSync(path.join(SRC, 'slides', `${id}.html`), 'utf8');
  return blob(html);
});

const page = `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${deck.title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
${fontLinks}
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{background:#0B0F19}
  section{width:1920px;height:1080px;position:relative;overflow:hidden;display:flex;flex-direction:column;flex:none}
  section div:not([style*="display"]){display:flex;flex-direction:column}
  h1{font-size:96px;font-weight:600;line-height:1.1}
  h2{font-size:64px;font-weight:600;line-height:1.15}
  h3{font-size:44px;font-weight:600;line-height:1.2}
  p{font-size:32px;line-height:1.4}
  img,video{display:block}
  aside{display:none}
  /* Druck / PDF */
  @page{size:1920px 1080px;margin:0}
  body.print section{break-after:page}
  /* Präsentation */
  body.present{overflow:hidden;height:100vh}
  body.present #stage{position:fixed;left:50%;top:50%;width:1920px;height:1080px;transform-origin:center}
  body.present section{position:absolute;left:0;top:0;opacity:0;pointer-events:none;transition:opacity .45s ease}
  body.present section.on{opacity:1;pointer-events:auto}
  #hud{position:fixed;right:18px;bottom:14px;font:14px/1 system-ui,sans-serif;color:#8C93A6;letter-spacing:1px;user-select:none}
  body.print #hud{display:none}
</style>
</head>
<body>
<div id="stage">
${slides.join('\n')}
</div>
<div id="hud"></div>
<script>
(function(){
  var MAP = ${JSON.stringify(map)};
  var print = /[?&]print/.test(location.search);
  document.body.className = print ? 'print' : 'present';
  // Video-Platzhalter in echte Videos verwandeln
  document.querySelectorAll('img[data-video]').forEach(function(img){
    var src = img.getAttribute('data-video').replace(/\\/_blob\\/([0-9a-f]{32})/, function(m,id){ return MAP[id] ? 'assets/'+MAP[id] : m; });
    if (print) return;
    var v = document.createElement('video');
    v.src = src; v.poster = img.src; v.muted = true; v.loop = true; v.autoplay = true; v.playsInline = true;
    v.setAttribute('style', img.getAttribute('style')); v.setAttribute('aria-label', img.alt);
    img.replaceWith(v);
  });
  if (print) return;
  var S = Array.prototype.slice.call(document.querySelectorAll('section'));
  var i = Math.max(0, Math.min(S.length-1, (parseInt(location.hash.slice(1),10)||1)-1));
  var stage = document.getElementById('stage'), hud = document.getElementById('hud');
  function fit(){ var k = Math.min(innerWidth/1920, innerHeight/1080); stage.style.transform = 'translate(-50%,-50%) scale('+k+')'; }
  function show(n){ i = Math.max(0, Math.min(S.length-1, n)); S.forEach(function(s,j){ s.classList.toggle('on', j===i); }); hud.textContent = (i+1)+' / '+S.length; history.replaceState(null,'','#'+(i+1)); }
  addEventListener('resize', fit); fit(); show(i);
  addEventListener('keydown', function(e){
    if (['ArrowRight','PageDown',' ','Enter'].indexOf(e.key) > -1) { e.preventDefault(); show(i+1); }
    if (['ArrowLeft','PageUp','Backspace'].indexOf(e.key) > -1) { e.preventDefault(); show(i-1); }
    if (e.key === 'Home') show(0); if (e.key === 'End') show(S.length-1);
    if (e.key === 'f' || e.key === 'F') { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen(); }
  });
  addEventListener('click', function(e){ show(e.clientX > innerWidth/3 ? i+1 : i-1); });
})();
</script>
</body>
</html>
`;

fs.writeFileSync(path.join(here, 'index.html'), page);
console.log(`index.html: ${slides.length} Folien`);

if (process.argv.includes('--no-render')) process.exit(0);

const { createRequire } = await import('node:module');
const { chromium } = createRequire(import.meta.url)('playwright');
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: Number(process.env.DPR || 1) });
const pg = await ctx.newPage();
await pg.goto('file://' + path.join(here, 'index.html') + '?print=1');
await pg.evaluate(() => document.fonts.ready);
await pg.waitForTimeout(800);

const pngDir = path.join(here, process.env.PNG_DIR || 'png');
if (!process.argv.includes('--no-png')) {
  fs.mkdirSync(pngDir, { recursive: true });
  const sections = await pg.$$('section');
  for (let k = 0; k < sections.length; k++) {
    await sections[k].screenshot({ path: path.join(pngDir, String(k + 1).padStart(2, '0') + '.png') });
  }
  console.log(`${path.relative(here, pngDir)}/: ${sections.length} Bilder`);
}

if (!process.argv.includes('--no-pdf')) {
  await pg.pdf({ path: path.join(here, 'Van_Eik_Pitch.pdf'), width: '1920px', height: '1080px', printBackground: true, preferCSSPageSize: true });
  console.log('Van_Eik_Pitch.pdf geschrieben');
}

// Layout-Check: Text, der aus seiner Box oder der Folie läuft
const issues = await pg.evaluate(() => {
  const out = [];
  document.querySelectorAll('section').forEach((s, n) => {
    const sr = s.getBoundingClientRect();
    s.querySelectorAll('h1,h2,h3,p,li,td,th,img,div').forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return;
      const tag = el.tagName.toLowerCase();
      if (r.right > sr.right + 1 || r.bottom > sr.bottom + 1 || r.left < sr.left - 1 || r.top < sr.top - 1) {
        if (!(tag === 'img' || tag === 'div') || el.style.position !== 'absolute')
          out.push(`Folie ${n + 1}: <${tag}> ragt aus der Folie (${Math.round(r.left - sr.left)},${Math.round(r.top - sr.top)} ${Math.round(r.width)}×${Math.round(r.height)}) "${(el.textContent || '').trim().slice(0, 40)}"`);
      }
      const fs = parseFloat(getComputedStyle(el).fontSize) || 16;
      if (/^(h1|h2|h3|p|li)$/.test(tag) && (el.scrollWidth > el.clientWidth + 2 || el.scrollHeight > el.clientHeight + fs * 0.35))
        out.push(`Folie ${n + 1}: <${tag}> Text läuft über "${el.textContent.trim().slice(0, 40)}"`);
    });
  });
  return out;
});
if (issues.length) console.log('LAYOUT-HINWEISE:\n' + issues.join('\n'));
else console.log('Layout-Check: keine Überläufe gefunden');
await browser.close();
