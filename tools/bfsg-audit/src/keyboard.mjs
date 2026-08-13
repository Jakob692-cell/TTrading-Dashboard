/**
 * Kategorie E – Tastatur: echter Tab-Durchlauf im Browser.
 *
 * Voraussetzung: pageProbe() lief bereits und hat sichtbare fokussierbare Elemente mit
 * data-bfsg-focus-id markiert und deren Stil im Ruhezustand ("baseline") erfasst.
 * Hier wird tatsächlich Tab gedrückt und nach jedem Schritt verglichen, ob sich das
 * fokussierte Element sichtbar verändert.
 */

const STYLE_KEYS = ['outlineStyle', 'outlineWidth', 'outlineColor', 'boxShadow', 'backgroundColor', 'color', 'border', 'textDecoration'];

export async function runKeyboardWalk(page, probe, { maxTabs = 60 } = {}) {
  const baselines = new Map((probe.focusables || []).map((f) => [String(f.id), f]));
  const limit = Math.min(maxTabs, (probe.focusables || []).length + 10);
  const visited = new Set();
  const noVisibleFocus = [];
  const orderMismatch = [];
  const offscreenFocus = [];
  let trap = null;
  let modalHold = null;
  let modalSteps = 0;
  let lastModalHost = null;
  let lastKey = null;
  let repeats = 0;
  let lastDomOrder = 0;
  let steps = 0;

  try {
    await page.evaluate(() => { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); });
  } catch { /* egal */ }

  for (let i = 0; i < limit; i++) {
    try {
      await page.keyboard.press('Tab');
    } catch {
      break;
    }
    let info;
    try {
      info = await page.evaluate((keys) => {
        // Fokus kann in einem Shadow DOM liegen (typisch für Consent-Tools);
        // document.activeElement meldet dann nur den Host – deshalb absteigen.
        let el = document.activeElement;
        const hosts = [];
        while (el && el.shadowRoot && el.shadowRoot.activeElement) {
          hosts.push(el);
          el = el.shadowRoot.activeElement;
        }
        if (!el || el === document.body || el === document.documentElement) return null;
        const CONSENT_RE = /(cookie|consent|usercentrics|cookiebot|borlabs|klaro|onetrust|didomi|einwilligung)/i;
        const chain = [...hosts, el];
        const inModal = chain.some((n) => {
          if (!n.closest) return false;
          const host = n.getAttribute && (n.getAttribute('id') || '') + ' ' + (n.getAttribute('class') || '');
          if (CONSENT_RE.test(host || '')) return true;
          const dlg = n.closest('[role="dialog"], [aria-modal="true"], dialog[open]');
          if (dlg) return true;
          const anc = n.closest ? n.closest('*') : null;
          return anc ? CONSENT_RE.test((anc.id || '') + ' ' + (anc.className || '')) : false;
        });
        const modalHost = hosts.length ? (hosts[0].id || hosts[0].tagName.toLowerCase()) : null;
        const st = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        const style = {};
        style.outlineStyle = st.outlineStyle;
        style.outlineWidth = st.outlineWidth;
        style.outlineColor = st.outlineColor;
        style.boxShadow = st.boxShadow;
        style.backgroundColor = st.backgroundColor;
        style.color = st.color;
        style.border = st.borderTopWidth + ' ' + st.borderTopColor;
        style.textDecoration = st.textDecorationLine;
        // Identitätsvergleich über die Objektreferenz – nur so lässt sich eine echte
        // Tastaturfalle von mehreren gleich benannten Elementen unterscheiden.
        const same = el === window.__bfsgPrevFocus;
        window.__bfsgPrevFocus = el;
        return {
          same, inModal, modalHost,
          id: el.getAttribute('data-bfsg-focus-id'),
          tag: el.tagName.toLowerCase(),
          name: (el.getAttribute('aria-label') || el.innerText || el.value || '').replace(/\s+/g, ' ').trim().slice(0, 60),
          style,
          rect: { top: Math.round(r.top), left: Math.round(r.left), width: Math.round(r.width), height: Math.round(r.height) },
          inViewport: r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth && r.width > 0 && r.height > 0,
          isFrame: el.tagName === 'IFRAME',
        };
      }, STYLE_KEYS);
    } catch {
      break;
    }
    steps++;
    if (!info) { lastKey = null; continue; }

    if (info.inModal) { modalSteps++; lastModalHost = info.modalHost || lastModalHost; }
    if (info.same) {
      repeats++;
      if (repeats >= 3 && !trap && !modalHold) {
        const b = info.id ? baselines.get(info.id) : null;
        const where = b ? b.selector : `<${info.tag}>${info.name ? ` „${info.name}“` : ''}`;
        if (info.inModal) {
          // Modale Dialoge (v. a. Consent-Layer) halten den Fokus absichtlich fest.
          // Das ist keine Tastaturfalle im Sinne von 2.1.2, verhindert aber die
          // weitere Prüfung der Seite.
          modalHold = { selector: info.modalHost ? `#${info.modalHost}` : where, steps: steps };
        } else {
          trap = { selector: where, repeats: repeats + 1 };
        }
      }
    } else {
      repeats = 0;
    }
    lastKey = info.id || `${info.tag}:${info.name}`;

    if (info.id) {
      visited.add(info.id);
      const base = baselines.get(info.id);
      if (base) {
        const changed = STYLE_KEYS.some((k) => String(base.baseline[k]) !== String(info.style[k]));
        if (!changed) noVisibleFocus.push({ selector: base.selector, name: base.name || info.name, tag: info.tag });
        if (base.domOrder < lastDomOrder) {
          orderMismatch.push({ step: steps, selector: base.selector, domOrder: base.domOrder, previousDomOrder: lastDomOrder });
        }
        lastDomOrder = base.domOrder;
        if (!info.inViewport) offscreenFocus.push({ selector: base.selector, rect: info.rect });
      }
    }
    if (trap || modalHold) break;
  }

  // Der Durchlauf kann komplett innerhalb eines modalen Overlays kreisen (Consent-Layer mit
  // eigenem Fokusfang). Dann sind die "nicht erreichten" Elemente kein Befund, sondern eine
  // Prüflücke.
  if (!trap && !modalHold && modalSteps >= 5 && visited.size < Math.max(3, (probe.focusables || []).length * 0.3)) {
    modalHold = { selector: lastModalHost ? `#${lastModalHost}` : 'modales Overlay', steps };
  }

  const unreachable = (probe.focusables || [])
    .filter((f) => !visited.has(String(f.id)))
    .map((f) => ({ selector: f.selector, name: f.name, tag: f.tag }));

  return {
    visited: visited.size,
    steps,
    maxTabs: limit,
    noVisibleFocus,
    orderMismatch,
    offscreenFocus,
    unreachable,
    trap,
    modalHold,
    modalSteps,
    totalFocusables: (probe.focusables || []).length,
  };
}
