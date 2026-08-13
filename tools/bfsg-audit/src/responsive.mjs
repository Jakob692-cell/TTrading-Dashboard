/**
 * Kategorie L – Responsive/Mobil: gleiche Seite in mehreren Viewport-Breiten prüfen.
 * Erfasst horizontales Scrollen (Reflow, WCAG 1.4.10), überstehende Elemente,
 * kleine Touch-Ziele und optional Screenshots.
 */
export const DEFAULT_VIEWPORTS = [
  { width: 320, height: 800, label: 'Mobil 320 (≈400 % Zoom)' },
  { width: 375, height: 812, label: 'Mobil 375' },
  { width: 768, height: 1024, label: 'Tablet 768' },
  { width: 1440, height: 900, label: 'Desktop 1440' },
];

export async function runResponsive(page, { viewports = DEFAULT_VIEWPORTS, screenshotDir = null, slug = 'page' } = {}) {
  const results = [];
  for (const vp of viewports) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.waitForTimeout(350);
    let data;
    try {
      data = await page.evaluate(() => {
        const de = document.documentElement;
        const vw = window.innerWidth;
        const scrollWidth = Math.max(de.scrollWidth, document.body ? document.body.scrollWidth : 0);
        const overflowing = [];
        const els = document.querySelectorAll('body *');
        const seen = new Set();
        for (let i = 0; i < els.length && overflowing.length < 20; i++) {
          const el = els[i];
          const st = getComputedStyle(el);
          if (st.display === 'none' || st.visibility === 'hidden') continue;
          if (st.position === 'fixed') continue;
          const r = el.getBoundingClientRect();
          if (r.width < 1 || r.height < 1) continue;
          if (r.right > vw + 2) {
            // Elemente innerhalb eines eigenen Scroll-/Clipping-Containers (Karussells,
            // Tabellen mit overflow:auto) verursachen kein Scrollen der Seite – sie wären
            // als Beleg irreführend.
            let clipped = false;
            for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
              const as = getComputedStyle(a);
              if (/(hidden|auto|scroll|clip)/.test(as.overflowX)) { clipped = true; break; }
            }
            if (clipped) continue;
            let p = el.tagName.toLowerCase();
            if (el.id) p += '#' + el.id;
            else {
              const c = (el.getAttribute('class') || '').trim().split(/\s+/).filter(Boolean).slice(0, 2);
              if (c.length) p += '.' + c.join('.');
            }
            if (seen.has(p)) continue;
            seen.add(p);
            overflowing.push({ selector: p, right: Math.round(r.right), width: Math.round(r.width) });
          }
        }
        const smallTargets = [];
        document.querySelectorAll('a[href], button, [role="button"], input:not([type="hidden"]), select').forEach((el) => {
          const st = getComputedStyle(el);
          if (st.display === 'none' || st.visibility === 'hidden') return;
          const r = el.getBoundingClientRect();
          if (r.width < 1 || r.height < 1) return;
          if ((r.width < 24 || r.height < 24) && smallTargets.length < 30) {
            const inline = el.tagName === 'A' && !!el.closest('p, li, td, dd');
            if (inline) return;
            let p = el.tagName.toLowerCase();
            if (el.id) p += '#' + el.id;
            smallTargets.push({ selector: p, width: Math.round(r.width), height: Math.round(r.height) });
          }
        });
        return {
          scrollWidth: Math.round(scrollWidth),
          clientWidth: vw,
          overflowPx: Math.round(scrollWidth - vw),
          horizontalOverflow: scrollWidth > vw + 2,
          overflowing,
          smallTargets,
        };
      });
    } catch (e) {
      results.push({ ...vp, error: String(e.message || e) });
      continue;
    }
    const entry = { ...vp, ...data };
    if (screenshotDir) {
      try {
        const file = `${screenshotDir}/${slug}-${vp.width}.png`;
        await page.screenshot({ path: file, fullPage: vp.width <= 768 ? false : false });
        entry.screenshot = file;
      } catch { /* Screenshot ist optional */ }
    }
    results.push(entry);
  }
  return results;
}
