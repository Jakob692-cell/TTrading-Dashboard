/**
 * Browser smoke test. Drives the real UI: starts a run, places trades, forces a breach,
 * checks the autopsy renders, and screenshots each screen.
 *
 * Not part of `npm test` (it needs a browser + a server). Run:
 *   python3 -m http.server 5173 &
 *   node test/smoke.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE || 'http://localhost:5173';
const OUT = new URL('../screenshots/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const errors = [];
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

const shot = async (name) => { await page.screenshot({ path: OUT + name + '.png' }); console.log('  shot', name); };
const ok = (cond, msg) => { if (!cond) { console.error('  FAIL:', msg); process.exitCode = 1; } else console.log('  ok  ', msg); };

console.log('1. landing / setup');
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForSelector('.firm-grid');
ok(await page.locator('.sim-badge').isVisible(), 'SIMULATED badge is visible on the shell');
ok((await page.locator('.firm').count()) === 6, 'six rule sets offered');
ok((await page.locator('.rules-table tr').count()) === 8, 'all eight rule types listed');
await shot('01-setup');

console.log('2. switch ruleset (Apex, intraday trailing)');
await page.locator('[data-rs="apex-50k"]').click();
await page.waitForTimeout(150);
ok((await page.locator('.rules-table').innerText()).includes('Trailing (intraday'), 'ruleset switch updates the rule table');
await shot('02-setup-apex');

console.log('3. set guardrails and start');
await page.fill('#g-cap', '6');
await page.fill('#g-cool', '2');
await page.locator('#start').click();
await page.waitForSelector('.trade-shell');
await page.waitForTimeout(900);
ok(await page.locator('#hud .cell').first().isVisible(), 'HUD rendered');
ok((await page.locator('#hud .cell').count()) === 6, 'six HUD cells');
const hudText = await page.locator('#hud').innerText();
ok(/Loss floor/i.test(hudText), 'floor cell present');
await shot('03-trading');

console.log('4. place a trade');
await page.locator('#b-play').click();           // pause for determinism
await page.fill('#o-size', '2');
await page.locator('#b-buy').click();
await page.waitForTimeout(200);
ok((await page.locator('#ps').innerText()).includes('LONG 2'), 'position strip shows the open position');
await shot('04-position-open');

await page.locator('#b-flat').click();
await page.waitForTimeout(200);
ok(/flat/i.test(await page.locator('#ps').innerText()), 'flatten closes the position');

console.log('5. guardrail: trade cap blocks the 7th trade');
// Let the clock run between trades so each one has a real holding period and a real P&L —
// trading repeatedly on a single paused bar would produce a meaningless all-zero timeline.
for (let i = 0; i < 8; i++) {
  await page.locator('#b-play').click();          // resume
  await page.waitForTimeout(260);
  await page.locator('#b-play').click();          // pause
  await page.locator('#b-buy').click();
  await page.waitForTimeout(40);
  await page.locator('#b-play').click();
  await page.waitForTimeout(320);
  await page.locator('#b-play').click();
  await page.locator('#b-flat').click();
  await page.waitForTimeout(40);
}
const toastText = await page.locator('#toast').innerText().catch(() => '');
ok(/limit|trades per day|done for today/i.test(toastText), `guardrail toast fired: "${toastText.slice(0, 60)}"`);
await shot('05-guardrail-block');

console.log('6. run to a terminal state');
await page.locator('[data-sp="100"]').click();
await page.locator('#b-play').click();
await page.waitForSelector('.verdict', { timeout: 45000 });
await page.waitForTimeout(400);
const verdict = await page.locator('.verdict').innerText();
ok(/passed|failed|ended/i.test(verdict), `autopsy reached: ${verdict.split('\n')[0]}`);
ok(await page.locator('.timeline .row').first().isVisible(), 'timeline narrative rendered');
ok((await page.locator('.drill').count()) >= 3, 'three drills prescribed');
ok(await page.locator('#card-host canvas').isVisible(), 'share card rendered');
await shot('06-autopsy');
await page.locator('#card-host canvas').screenshot({ path: OUT + '07-share-card.png' });

console.log('7. dashboard + score');
await page.locator('#dash').click();
await page.waitForSelector('.dial');
const dialText = await page.locator('.dial .g').innerText();
ok(/\d+/.test(dialText), `score computed: ${dialText.replace(/\n/g, ' ')}`);
ok((await page.locator('.comp').count()) >= 5, 'five score components shown');
const disclosure = await page.locator('#disclosure').innerText();
ok(/simulator/i.test(disclosure) && !/probability of passing/i.test(disclosure),
   'disclosure is honest and claims no real-world probability');
ok((await page.locator('.hist tr').count()) >= 2, 'run history recorded');
await shot('08-dashboard');

console.log('8. persistence across reload');
await page.reload({ waitUntil: 'networkidle' });
await page.locator('[data-nav="dashboard"]').click();
await page.waitForSelector('.dial');
ok((await page.locator('.hist tr').count()) >= 2, 'runs survive a reload');

console.log('9. drill loading');
await page.locator('[data-drill]').first().click();
await page.waitForTimeout(250);
await page.waitForSelector('.firm-grid');
ok((await page.content()).includes('Drill loaded'), 'drill loads into the next run');
await shot('09-drill-loaded');

console.log('\nconsole errors:', errors.length);
for (const e of errors.slice(0, 10)) console.log('  !', e);
if (errors.length) process.exitCode = 1;

await browser.close();
console.log(process.exitCode ? '\nSMOKE FAILED' : '\nSMOKE PASSED');
