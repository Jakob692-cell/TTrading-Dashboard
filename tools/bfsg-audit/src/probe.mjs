/**
 * In-Page-Sonde: wird per page.evaluate() im Seitenkontext ausgeführt und sammelt
 * alle Rohdaten, aus denen src/analyze.mjs anschliessend Befunde ableitet.
 *
 * Die Funktion muss vollständig eigenständig sein (keine Referenzen nach aussen),
 * weil Playwright nur ihren Quelltext in die Seite überträgt.
 */
export function pageProbe(opts) {
  const O = Object.assign({ maxElements: 8000, maxSamples: 4 }, opts || {});
  const out = {
    url: location.href,
    title: document.title || '',
    lang: document.documentElement.getAttribute('lang') || '',
    xmlLang: document.documentElement.getAttribute('xml:lang') || '',
    dir: document.documentElement.getAttribute('dir') || '',
    doctype: !!document.doctype,
    viewportMeta: null,
    headings: [], landmarks: [], skipLinks: [], images: [], links: [], buttons: [],
    forms: [], contrast: [], nonTextContrast: [], colorOnlyLinks: [], aria: {},
    media: { videos: [], audios: [], iframes: [] },
    motion: { infinite: [], marquee: [], carousels: [], prefersReducedMotion: false, metaRefresh: null, autoplay: [] },
    tables: [], duplicateIds: [], positiveTabindex: [], accesskeys: [],
    focusables: [], consent: null, textStats: {}, counts: {}, notes: [],
  };

  /* ---------------------------------------------------------------- Helfer */
  const canvas = document.createElement('canvas').getContext('2d');
  const colorCache = new Map();

  function parseColor(str) {
    if (!str) return null;
    if (colorCache.has(str)) return colorCache.get(str);
    let res = null;
    const s = str.trim();
    if (s === 'transparent') res = { r: 0, g: 0, b: 0, a: 0 };
    else {
      const m = /^rgba?\(([^)]+)\)$/i.exec(s);
      if (m) {
        const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
        if (p.length >= 3 && p.slice(0, 3).every((n) => !Number.isNaN(n))) {
          res = { r: p[0], g: p[1], b: p[2], a: p.length > 3 && !Number.isNaN(p[3]) ? p[3] : 1 };
        }
      }
      if (!res) {
        // moderne Farbsyntax (oklch, lab, color()) über Canvas normalisieren
        try {
          canvas.fillStyle = '#000';
          canvas.fillStyle = s;
          const norm = canvas.fillStyle;
          if (/^#/.test(norm)) {
            res = { r: parseInt(norm.slice(1, 3), 16), g: parseInt(norm.slice(3, 5), 16), b: parseInt(norm.slice(5, 7), 16), a: 1 };
          } else {
            const mm = /^rgba?\(([^)]+)\)$/i.exec(norm);
            if (mm) {
              const p = mm[1].split(/[\s,/]+/).filter(Boolean).map(Number);
              res = { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
            }
          }
        } catch (e) { res = null; }
      }
    }
    colorCache.set(str, res);
    return res;
  }

  const srgb = (c) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const lum = (c) => 0.2126 * srgb(c.r) + 0.7152 * srgb(c.g) + 0.0722 * srgb(c.b);
  function ratio(a, b) {
    if (!a || !b) return null;
    const l1 = lum(a), l2 = lum(b);
    return Math.round(((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)) * 100) / 100;
  }
  const hex = (c) => c ? '#' + [c.r, c.g, c.b].map((n) => Math.round(n).toString(16).padStart(2, '0')).join('') + (c.a < 1 ? ` (alpha ${c.a})` : '') : null;
  function blend(fg, bg) {
    if (!fg) return bg;
    if (fg.a >= 1) return fg;
    if (!bg) return fg;
    const a = fg.a;
    return { r: fg.r * a + bg.r * (1 - a), g: fg.g * a + bg.g * (1 - a), b: fg.b * a + bg.b * (1 - a), a: 1 };
  }

  function isVisible(el) {
    if (!el || !el.getClientRects) return false;
    const st = getComputedStyle(el);
    if (st.visibility === 'hidden' || st.visibility === 'collapse' || st.display === 'none') return false;
    if (Number(st.opacity) < 0.05) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    if (el.closest('[aria-hidden="true"]')) return false;
    if (el.hasAttribute('hidden')) return false;
    return true;
  }

  function cssPath(el, depth) {
    depth = depth || 4;
    const parts = [];
    let n = el;
    while (n && n.nodeType === 1 && parts.length < depth) {
      let p = n.tagName.toLowerCase();
      if (n.id) { parts.unshift(p + '#' + CSS.escape(n.id)); break; }
      const cls = (n.getAttribute('class') || '').trim().split(/\s+/).filter(Boolean).slice(0, 2);
      if (cls.length) p += '.' + cls.map((c) => CSS.escape(c)).join('.');
      const parent = n.parentElement;
      if (parent) {
        const sibs = [...parent.children].filter((c) => c.tagName === n.tagName);
        if (sibs.length > 1) p += `:nth-of-type(${sibs.indexOf(n) + 1})`;
      }
      parts.unshift(p);
      n = n.parentElement;
    }
    return parts.join(' > ');
  }

  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const trunc = (s, n) => (s && s.length > (n || 80) ? s.slice(0, n || 80) + '…' : s || '');

  function textFromIds(el, attr) {
    const ids = (el.getAttribute(attr) || '').split(/\s+/).filter(Boolean);
    const missing = [];
    const txt = ids.map((id) => {
      const t = document.getElementById(id);
      if (!t) { missing.push(id); return ''; }
      return clean(t.innerText || t.textContent);
    }).join(' ');
    return { text: clean(txt), missing };
  }

  /** Näherung der Accessible-Name-Berechnung (kein vollständiger AccName-Algorithmus). */
  function accName(el) {
    const src = { name: '', from: null, issues: [] };
    if (el.getAttribute('aria-labelledby')) {
      const r = textFromIds(el, 'aria-labelledby');
      if (r.missing.length) src.issues.push('aria-labelledby verweist auf nicht vorhandene ID(s): ' + r.missing.join(', '));
      if (r.text) { src.name = r.text; src.from = 'aria-labelledby'; return src; }
    }
    const al = clean(el.getAttribute('aria-label'));
    if (al) { src.name = al; src.from = 'aria-label'; return src; }
    const tag = el.tagName.toLowerCase();
    if (['input', 'select', 'textarea'].includes(tag)) {
      if (el.id) {
        const lab = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        if (lab && clean(lab.innerText)) { src.name = clean(lab.innerText); src.from = 'label[for]'; return src; }
      }
      const wrap = el.closest('label');
      if (wrap && clean(wrap.innerText)) { src.name = clean(wrap.innerText); src.from = 'label (umschliessend)'; return src; }
      if (el.type === 'image' && clean(el.getAttribute('alt'))) { src.name = clean(el.getAttribute('alt')); src.from = 'alt'; return src; }
      if (el.type === 'submit' || el.type === 'button' || el.type === 'reset') {
        if (clean(el.value)) { src.name = clean(el.value); src.from = 'value'; return src; }
      }
      const ti = clean(el.getAttribute('title'));
      if (ti) { src.name = ti; src.from = 'title'; return src; }
      const ph = clean(el.getAttribute('placeholder'));
      if (ph) { src.name = ph; src.from = 'placeholder'; return src; }
      return src;
    }
    let txt = clean(el.innerText || el.textContent);
    if (!txt) {
      const img = el.querySelector('img[alt]');
      if (img && clean(img.getAttribute('alt'))) { src.name = clean(img.getAttribute('alt')); src.from = 'img[alt]'; return src; }
      const svgTitle = el.querySelector('svg > title');
      if (svgTitle && clean(svgTitle.textContent)) { src.name = clean(svgTitle.textContent); src.from = 'svg > title'; return src; }
      const inner = el.querySelector('[aria-label]');
      if (inner && clean(inner.getAttribute('aria-label'))) { src.name = clean(inner.getAttribute('aria-label')); src.from = 'aria-label (Kind)'; return src; }
      const ti = clean(el.getAttribute('title'));
      if (ti) { src.name = ti; src.from = 'title'; return src; }
    } else { src.name = txt; src.from = 'Textinhalt'; }
    return src;
  }

  /* ------------------------------------------------------- Grundstruktur */
  const vp = document.querySelector('meta[name="viewport" i]');
  if (vp) {
    const content = vp.getAttribute('content') || '';
    const max = /maximum-scale\s*=\s*([\d.]+)/i.exec(content);
    out.viewportMeta = {
      content,
      userScalableNo: /user-scalable\s*=\s*(no|0)/i.test(content),
      maximumScale: max ? Number(max[1]) : null,
    };
  }
  const refresh = document.querySelector('meta[http-equiv="refresh" i]');
  if (refresh) out.motion.metaRefresh = refresh.getAttribute('content');

  document.querySelectorAll('h1,h2,h3,h4,h5,h6,[role="heading"]').forEach((h) => {
    const lvl = h.getAttribute('role') === 'heading'
      ? Number(h.getAttribute('aria-level') || 0)
      : Number(h.tagName.slice(1));
    out.headings.push({
      level: lvl || null,
      text: trunc(clean(h.innerText), 120),
      empty: !clean(h.innerText) && !clean(h.getAttribute('aria-label')),
      visible: isVisible(h),
      selector: cssPath(h),
      role: h.getAttribute('role') || null,
    });
  });

  const LM = [
    ['main', 'main, [role="main"]'], ['navigation', 'nav, [role="navigation"]'],
    ['banner', 'header, [role="banner"]'], ['contentinfo', 'footer, [role="contentinfo"]'],
    ['search', '[role="search"], form[role="search"]'], ['complementary', 'aside, [role="complementary"]'],
    ['form', '[role="form"]'], ['region', '[role="region"]'],
  ];
  for (const [name, sel] of LM) {
    document.querySelectorAll(sel).forEach((el) => {
      // header/footer nur dann Landmark, wenn nicht in section/article verschachtelt
      const tag = el.tagName.toLowerCase();
      if ((tag === 'header' || tag === 'footer') && el.closest('section, article, main, aside')) return;
      out.landmarks.push({
        role: name, selector: cssPath(el), visible: isVisible(el),
        label: clean(el.getAttribute('aria-label')) || (el.getAttribute('aria-labelledby') ? textFromIds(el, 'aria-labelledby').text : ''),
      });
    });
  }

  // Skip-Links: interne Anker unter den ersten Fokuselementen
  [...document.querySelectorAll('a[href^="#"]')].slice(0, 5).forEach((a) => {
    const target = a.getAttribute('href').slice(1);
    out.skipLinks.push({
      text: clean(a.innerText) || clean(a.getAttribute('aria-label')),
      target,
      targetExists: !!(target && document.getElementById(target)),
      selector: cssPath(a),
    });
  });

  /* -------------------------------------------------------------- Bilder */
  const SUSPICIOUS_ALT = /^(image|img|bild|grafik|foto|photo|picture|icon|logo|spacer|placeholder|dsc[_-]?\d+|untitled|unbenannt)?[\s_-]*(\d+)?$|\.(jpe?g|png|gif|svg|webp)$/i;
  document.querySelectorAll('img').forEach((img) => {
    const alt = img.getAttribute('alt');
    const rect = img.getBoundingClientRect();
    const inLink = !!img.closest('a[href], button, [role="button"], [role="link"]');
    const linkHasText = inLink ? !!clean(img.closest('a[href], button, [role="button"], [role="link"]').innerText) : false;
    out.images.push({
      src: (img.currentSrc || img.src || '').slice(0, 250),
      hasAlt: img.hasAttribute('alt'),
      alt: alt === null ? null : clean(alt),
      decorative: alt !== null && clean(alt) === '',
      suspiciousAlt: alt !== null && clean(alt) !== '' && SUSPICIOUS_ALT.test(clean(alt)),
      longAlt: alt !== null && clean(alt).length > 200,
      ariaHidden: img.getAttribute('aria-hidden') === 'true',
      role: img.getAttribute('role') || null,
      title: clean(img.getAttribute('title')) || null,
      width: Math.round(rect.width), height: Math.round(rect.height),
      visible: isVisible(img),
      inLink, linkHasText,
      selector: cssPath(img),
    });
  });
  document.querySelectorAll('svg').forEach((svg) => {
    if (!isVisible(svg)) return;
    const inInteractive = !!svg.closest('a[href], button, [role="button"], [role="link"]');
    const parent = svg.closest('a[href], button, [role="button"], [role="link"]');
    const hasName = !!(clean(svg.getAttribute('aria-label')) || svg.querySelector('title') || svg.getAttribute('aria-labelledby'));
    out.images.push({
      src: 'inline <svg>', hasAlt: hasName, alt: hasName ? clean(svg.getAttribute('aria-label')) || clean((svg.querySelector('title') || {}).textContent || '') : null,
      decorative: svg.getAttribute('aria-hidden') === 'true' || svg.getAttribute('role') === 'presentation',
      suspiciousAlt: false, longAlt: false,
      ariaHidden: svg.getAttribute('aria-hidden') === 'true',
      role: svg.getAttribute('role') || null, title: null,
      width: Math.round(svg.getBoundingClientRect().width), height: Math.round(svg.getBoundingClientRect().height),
      visible: true, inLink: inInteractive, linkHasText: parent ? !!clean(parent.innerText) : false,
      isSvg: true, selector: cssPath(svg),
    });
  });
  // Hintergrundbilder mit möglicher Textinformation (nur Hinweis für manuelle Prüfung)
  out.counts.backgroundImages = [...document.querySelectorAll('*')].slice(0, O.maxElements)
    .filter((el) => { const s = getComputedStyle(el); return s.backgroundImage && s.backgroundImage !== 'none' && isVisible(el); }).length;

  /* ------------------------------------------------------ Links & Buttons */
  const GENERIC = /^(hier|hier klicken|klick hier|mehr|mehr erfahren|weiterlesen|weiter|weitere informationen|weitere infos|read more|more|click here|link|details|info|infos|zum artikel|artikel|download|hier geht'?s|los)$/i;
  document.querySelectorAll('a').forEach((a) => {
    const href = a.getAttribute('href');
    const n = accName(a);
    const st = getComputedStyle(a);
    out.links.push({
      href: href === null ? null : href.slice(0, 250),
      resolved: href && !/^(javascript:|#|mailto:|tel:)/i.test(href) ? (() => { try { return new URL(href, location.href).toString(); } catch { return null; } })() : null,
      name: trunc(n.name, 120), nameFrom: n.from, nameIssues: n.issues,
      empty: !n.name,
      generic: GENERIC.test(n.name || ''),
      urlAsText: /^https?:\/\//i.test(n.name || '') && (n.name || '').length > 30,
      target: a.getAttribute('target') || null,
      hasNewWindowHint: /neues fenster|neuem fenster|new window|new tab|neuer tab|externer link/i.test((n.name || '') + ' ' + (a.getAttribute('title') || '')),
      noHref: href === null,
      role: a.getAttribute('role') || null,
      tabindex: a.getAttribute('tabindex'),
      visible: isVisible(a),
      inNav: !!a.closest('nav, [role="navigation"]'),
      textDecoration: st.textDecorationLine,
      color: st.color,
      borderBottom: st.borderBottomWidth + ' ' + st.borderBottomStyle,
      fontWeight: st.fontWeight,
      inParagraph: !!a.closest('p, li, td, dd, blockquote'),
      selector: cssPath(a),
    });
  });
  document.querySelectorAll('button, [role="button"], input[type="button"], input[type="submit"], input[type="reset"], input[type="image"], summary').forEach((b) => {
    const n = accName(b);
    out.buttons.push({
      tag: b.tagName.toLowerCase(), type: b.getAttribute('type') || null,
      name: trunc(n.name, 120), nameFrom: n.from, nameIssues: n.issues,
      empty: !n.name, disabled: b.disabled === true || b.getAttribute('aria-disabled') === 'true',
      role: b.getAttribute('role') || null, visible: isVisible(b),
      selector: cssPath(b),
    });
  });
  // Klick-Handler auf nicht-interaktiven Elementen
  out.counts.clickableNonInteractive = [...document.querySelectorAll('[onclick]')].filter((el) => {
    const t = el.tagName.toLowerCase();
    if (['a', 'button', 'input', 'select', 'textarea', 'summary'].includes(t)) return false;
    const r = el.getAttribute('role');
    return !(r === 'button' || r === 'link') || !el.hasAttribute('tabindex');
  }).length;

  /* --------------------------------------------------------- Farbe allein */
  out.links.forEach((l) => {
    if (!l.visible || !l.inParagraph || l.empty) return;
    const noUnderline = l.textDecoration === 'none' || l.textDecoration === '';
    const noBorder = /0px|none/.test(l.borderBottom);
    if (noUnderline && noBorder) out.colorOnlyLinks.push({ selector: l.selector, name: l.name, color: l.color });
  });

  /* ----------------------------------------------------------- Formulare */
  const AUTOCOMPLETE_HINT = /(name|vorname|nachname|mail|email|tel|phone|mobil|street|strasse|straße|plz|zip|postal|ort|city|land|country|geburt|birth|firma|company|adresse|address)/i;
  document.querySelectorAll('form').forEach((f) => {
    const fields = [];
    f.querySelectorAll('input, select, textarea').forEach((el) => {
      const type = (el.getAttribute('type') || el.tagName.toLowerCase()).toLowerCase();
      if (type === 'hidden') return;
      const n = accName(el);
      const group = el.closest('fieldset');
      fields.push({
        tag: el.tagName.toLowerCase(), type,
        name: el.getAttribute('name') || null, id: el.id || null,
        accName: trunc(n.name, 80), nameFrom: n.from, nameIssues: n.issues,
        unlabelled: !n.name,
        placeholderOnly: n.from === 'placeholder',
        titleOnly: n.from === 'title',
        required: el.required || el.getAttribute('aria-required') === 'true',
        requiredMarkedInName: /\*|pflicht|erforderlich|required/i.test(n.name || ''),
        autocomplete: el.getAttribute('autocomplete') || null,
        autocompleteExpected: AUTOCOMPLETE_HINT.test((el.getAttribute('name') || '') + ' ' + (el.id || '') + ' ' + (n.name || '')),
        describedby: el.getAttribute('aria-describedby') || null,
        ariaInvalid: el.getAttribute('aria-invalid') || null,
        inFieldset: !!group,
        fieldsetHasLegend: group ? !!(group.querySelector('legend') && clean(group.querySelector('legend').innerText)) : null,
        visible: isVisible(el),
        selector: cssPath(el),
      });
    });
    const radioGroups = {};
    f.querySelectorAll('input[type="radio"], input[type="checkbox"]').forEach((el) => {
      const key = (el.getAttribute('name') || '') + ':' + el.type;
      radioGroups[key] = radioGroups[key] || { count: 0, inFieldset: false, type: el.type };
      radioGroups[key].count++;
      if (el.closest('fieldset') && el.closest('fieldset').querySelector('legend')) radioGroups[key].inFieldset = true;
      if (el.closest('[role="radiogroup"], [role="group"]')) radioGroups[key].inFieldset = true;
    });
    out.forms.push({
      action: f.getAttribute('action') || null, method: (f.getAttribute('method') || 'get').toLowerCase(),
      name: clean(f.getAttribute('name') || f.getAttribute('aria-label') || ''),
      novalidate: f.hasAttribute('novalidate'),
      fields,
      groups: Object.entries(radioGroups).filter(([, v]) => v.count > 1).map(([k, v]) => ({ key: k, ...v })),
      hasSubmit: !!f.querySelector('button:not([type="button"]), input[type="submit"]'),
      hasPassword: !!f.querySelector('input[type="password"]'),
      liveRegions: f.querySelectorAll('[aria-live], [role="alert"], [role="status"]').length,
      selector: cssPath(f),
      visible: isVisible(f),
    });
  });
  // Felder ausserhalb von <form>
  const orphan = [...document.querySelectorAll('input, select, textarea')].filter((el) => !el.closest('form') && (el.getAttribute('type') || '') !== 'hidden');
  out.counts.orphanFields = orphan.length;
  out.orphanFields = orphan.slice(0, 25).map((el) => {
    const n = accName(el);
    return {
      tag: el.tagName.toLowerCase(), type: (el.getAttribute('type') || el.tagName.toLowerCase()).toLowerCase(),
      accName: trunc(n.name, 80), nameFrom: n.from, unlabelled: !n.name,
      placeholderOnly: n.from === 'placeholder', required: el.required,
      autocomplete: el.getAttribute('autocomplete') || null,
      autocompleteExpected: AUTOCOMPLETE_HINT.test((el.getAttribute('name') || '') + ' ' + (el.id || '') + ' ' + (n.name || '')),
      visible: isVisible(el), selector: cssPath(el),
    };
  });

  /* ---------------------------------------------------------------- ARIA */
  const VALID_ROLES = new Set(('alert alertdialog application article banner blockquote button caption cell checkbox code columnheader combobox command complementary composite contentinfo definition deletion dialog directory document emphasis feed figure form generic grid gridcell group heading img input insertion landmark link list listbox listitem log main marquee math menu menubar menuitem menuitemcheckbox menuitemradio meter navigation none note option paragraph presentation progressbar radio radiogroup range region roletype row rowgroup rowheader scrollbar search searchbox section sectionhead select separator slider spinbutton status strong structure subscript superscript switch tab table tablist tabpanel term textbox time timer toolbar tooltip tree treegrid treeitem widget window').split(' '));
  const VALID_ARIA = new Set(('aria-activedescendant aria-atomic aria-autocomplete aria-braillelabel aria-brailleroledescription aria-busy aria-checked aria-colcount aria-colindex aria-colindextext aria-colspan aria-controls aria-current aria-describedby aria-description aria-details aria-disabled aria-dropeffect aria-errormessage aria-expanded aria-flowto aria-grabbed aria-haspopup aria-hidden aria-invalid aria-keyshortcuts aria-label aria-labelledby aria-level aria-live aria-modal aria-multiline aria-multiselectable aria-orientation aria-owns aria-placeholder aria-posinset aria-pressed aria-readonly aria-relevant aria-required aria-roledescription aria-rowcount aria-rowindex aria-rowindextext aria-rowspan aria-selected aria-setsize aria-sort aria-valuemax aria-valuemin aria-valuenow aria-valuetext').split(' '));
  const aria = { invalidRoles: [], invalidAttrs: [], brokenRefs: [], hiddenFocusable: [], redundantRoles: [], liveRegions: 0, modals: [] };
  const IMPLICIT = { button: 'button', a: 'link', nav: 'navigation', main: 'main', header: 'banner', footer: 'contentinfo', ul: 'list', ol: 'list', li: 'listitem', form: 'form', table: 'table', img: 'img', article: 'article', aside: 'complementary', h1: 'heading', h2: 'heading', h3: 'heading', h4: 'heading', h5: 'heading', h6: 'heading' };
  const all = [...document.querySelectorAll('*')].slice(0, O.maxElements);
  for (const el of all) {
    const role = el.getAttribute('role');
    if (role) {
      for (const r of role.split(/\s+/)) {
        if (!VALID_ROLES.has(r)) aria.invalidRoles.push({ role: r, selector: cssPath(el) });
      }
      const tag = el.tagName.toLowerCase();
      if (IMPLICIT[tag] && IMPLICIT[tag] === role.trim() && !(tag === 'a' && !el.hasAttribute('href'))) {
        aria.redundantRoles.push({ role, tag, selector: cssPath(el) });
      }
    }
    for (const attr of el.getAttributeNames()) {
      if (!attr.startsWith('aria-')) continue;
      if (!VALID_ARIA.has(attr)) aria.invalidAttrs.push({ attr, selector: cssPath(el) });
      if (attr === 'aria-labelledby' || attr === 'aria-describedby' || attr === 'aria-controls' || attr === 'aria-owns') {
        const r = textFromIds(el, attr);
        if (r.missing.length) aria.brokenRefs.push({ attr, missing: r.missing, selector: cssPath(el) });
      }
    }
    if (el.getAttribute('aria-hidden') === 'true') {
      const f = el.querySelector('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])');
      if (f || (el.matches('a[href], button, input, select, textarea') && el.getAttribute('tabindex') !== '-1')) {
        aria.hiddenFocusable.push({ selector: cssPath(el) });
      }
    }
    if (el.hasAttribute('aria-live') || ['alert', 'status', 'log'].includes(el.getAttribute('role'))) aria.liveRegions++;
    if (el.getAttribute('role') === 'dialog' || el.getAttribute('aria-modal') === 'true') {
      aria.modals.push({ selector: cssPath(el), modal: el.getAttribute('aria-modal') === 'true', name: accName(el).name, visible: isVisible(el) });
    }
  }
  out.aria = aria;

  const ids = {};
  document.querySelectorAll('[id]').forEach((el) => { ids[el.id] = (ids[el.id] || 0) + 1; });
  out.duplicateIds = Object.entries(ids).filter(([, c]) => c > 1).map(([id, c]) => ({ id, count: c })).slice(0, 30);
  document.querySelectorAll('[tabindex]').forEach((el) => {
    const t = Number(el.getAttribute('tabindex'));
    if (t > 0) out.positiveTabindex.push({ tabindex: t, selector: cssPath(el) });
  });
  document.querySelectorAll('[accesskey]').forEach((el) => out.accesskeys.push({ key: el.getAttribute('accesskey'), selector: cssPath(el) }));

  /* ------------------------------------------------------------- Sprache */
  out.langParts = [...document.querySelectorAll('[lang]')].slice(0, 50).map((el) => ({
    lang: el.getAttribute('lang'), tag: el.tagName.toLowerCase(), selector: cssPath(el),
  }));
  const bodyText = clean(document.body ? document.body.innerText : '').slice(0, 20000);
  const words = bodyText.toLowerCase().split(/[^a-zäöüß]+/).filter((w) => w.length > 1);
  const DE = new Set(['und', 'oder', 'der', 'die', 'das', 'nicht', 'für', 'mit', 'auf', 'ist', 'sie', 'wir', 'sich', 'ein', 'eine', 'werden', 'auch', 'bei', 'von', 'zum', 'zur', 'über', 'unsere', 'ihre']);
  const EN = new Set(['the', 'and', 'you', 'for', 'with', 'that', 'this', 'are', 'our', 'your', 'from', 'have', 'not', 'will', 'can', 'more', 'about']);
  let de = 0, en = 0;
  for (const w of words) { if (DE.has(w)) de++; else if (EN.has(w)) en++; }
  out.textStats = { chars: bodyText.length, words: words.length, deHits: de, enHits: en, guessed: de === en ? null : (de > en ? 'de' : 'en') };

  /* --------------------------------------------------------- Medien */
  document.querySelectorAll('video').forEach((v) => {
    out.media.videos.push({
      src: (v.currentSrc || v.getAttribute('src') || (v.querySelector('source') || {}).src || '').slice(0, 200),
      controls: v.hasAttribute('controls'), autoplay: v.hasAttribute('autoplay'), muted: v.muted,
      loop: v.hasAttribute('loop'),
      tracks: [...v.querySelectorAll('track')].map((t) => ({ kind: t.getAttribute('kind'), srclang: t.getAttribute('srclang'), label: t.getAttribute('label') })),
      accName: accName(v).name, selector: cssPath(v), duration: Number.isFinite(v.duration) ? Math.round(v.duration) : null,
    });
    if (v.hasAttribute('autoplay')) out.motion.autoplay.push({ type: 'video', selector: cssPath(v), muted: v.muted });
  });
  document.querySelectorAll('audio').forEach((a) => {
    out.media.audios.push({
      src: (a.currentSrc || a.getAttribute('src') || '').slice(0, 200),
      controls: a.hasAttribute('controls'), autoplay: a.hasAttribute('autoplay'), loop: a.hasAttribute('loop'),
      tracks: [...a.querySelectorAll('track')].map((t) => t.getAttribute('kind')),
      selector: cssPath(a),
    });
    if (a.hasAttribute('autoplay')) out.motion.autoplay.push({ type: 'audio', selector: cssPath(a), muted: a.muted });
  });
  document.querySelectorAll('iframe').forEach((f) => {
    const src = f.getAttribute('src') || '';
    out.media.iframes.push({
      src: src.slice(0, 250),
      title: clean(f.getAttribute('title')) || null,
      ariaHidden: f.getAttribute('aria-hidden') === 'true',
      kind: /youtube|youtu\.be/i.test(src) ? 'youtube' : /vimeo/i.test(src) ? 'vimeo' : /google\.com\/maps|maps\.google/i.test(src) ? 'map'
        : /recaptcha|hcaptcha|turnstile/i.test(src) ? 'captcha' : /consent|cookie|usercentrics|cookiebot|borlabs/i.test(src) ? 'consent' : 'other',
      visible: isVisible(f), selector: cssPath(f),
    });
  });

  /* --------------------------------------------------------- Bewegung */
  document.querySelectorAll('marquee, blink').forEach((el) => out.motion.marquee.push({ tag: el.tagName.toLowerCase(), selector: cssPath(el) }));
  for (const el of all) {
    if (!isVisible(el)) continue;
    const st = getComputedStyle(el);
    if (st.animationName && st.animationName !== 'none' && (st.animationIterationCount || '').split(',').some((c) => c.trim() === 'infinite')) {
      if (out.motion.infinite.length < 30) out.motion.infinite.push({ name: st.animationName, duration: st.animationDuration, selector: cssPath(el) });
    }
    const cls = (el.getAttribute('class') || '') + ' ' + (el.getAttribute('data-slider') || '');
    if (/(carousel|slider|swiper|slick|glide|splide|owl-carousel)/i.test(cls) && out.motion.carousels.length < 20) {
      out.motion.carousels.push({
        selector: cssPath(el),
        hasControls: !!el.querySelector('button, [role="button"], [aria-label*="pause" i], [aria-label*="stop" i], [class*="pause" i]'),
      });
    }
  }
  try {
    for (const sheet of document.styleSheets) {
      let rules;
      try { rules = sheet.cssRules; } catch { continue; }
      for (const r of rules || []) {
        if (r.media && /prefers-reduced-motion/i.test(r.conditionText || r.media.mediaText || '')) { out.motion.prefersReducedMotion = true; break; }
      }
      if (out.motion.prefersReducedMotion) break;
    }
  } catch (e) { out.notes.push('Stylesheet-Analyse teilweise nicht möglich (CORS)'); }

  /* --------------------------------------------------------- Tabellen */
  document.querySelectorAll('table').forEach((t) => {
    const rows = t.rows ? t.rows.length : 0;
    const th = t.querySelectorAll('th').length;
    out.tables.push({
      rows, cols: t.rows && t.rows[0] ? t.rows[0].cells.length : 0,
      hasTh: th > 0, thWithScope: t.querySelectorAll('th[scope]').length,
      hasCaption: !!t.querySelector('caption'),
      role: t.getAttribute('role') || null,
      ariaLabel: clean(t.getAttribute('aria-label')) || null,
      visible: isVisible(t), selector: cssPath(t),
    });
  });

  /* -------------------------------------------------------- Kontraste */
  const contrastMap = new Map();
  let checked = 0;
  for (const el of all) {
    if (checked > O.maxElements) break;
    let hasText = false;
    for (const node of el.childNodes) {
      if (node.nodeType === 3 && node.nodeValue && node.nodeValue.trim().length > 0) { hasText = true; break; }
    }
    if (!hasText || !isVisible(el)) continue;
    checked++;
    const st = getComputedStyle(el);
    const fgRaw = parseColor(st.color);
    if (!fgRaw) continue;
    // Hintergrund ermitteln
    let bg = null, bgImage = false, node = el;
    while (node && node.nodeType === 1) {
      const s = getComputedStyle(node);
      if (s.backgroundImage && s.backgroundImage !== 'none') { bgImage = true; break; }
      const c = parseColor(s.backgroundColor);
      if (c && c.a > 0) { bg = bg ? blend(bg, c) : (c.a < 1 ? c : c); if (c.a >= 1) break; }
      node = node.parentElement;
    }
    if (!bg && !bgImage) bg = { r: 255, g: 255, b: 255, a: 1 };
    const fs = parseFloat(st.fontSize) || 16;
    const fw = Number(st.fontWeight) || (st.fontWeight === 'bold' ? 700 : 400);
    const large = fs >= 24 || (fs >= 18.66 && fw >= 700);
    const need = large ? 3 : 4.5;
    const fg = blend(fgRaw, bg);
    const rt = bgImage ? null : ratio(fg, bg);
    const key = [st.color, bg ? hex(bg) : 'img', Math.round(fs), fw, bgImage].join('|');
    const rec = contrastMap.get(key) || {
      fg: hex(fg), bg: bgImage ? 'Hintergrundbild/Verlauf' : hex(bg), ratio: rt, required: need,
      fontSize: Math.round(fs * 10) / 10, fontWeight: fw, large, count: 0, samples: [], bgImage,
    };
    rec.count++;
    if (rec.samples.length < O.maxSamples) {
      rec.samples.push({ selector: cssPath(el), text: trunc(clean(el.innerText || el.textContent), 60) });
    }
    contrastMap.set(key, rec);
  }
  out.contrast = [...contrastMap.values()];

  // Nicht-Text-Kontrast: Bedienelemente gegen ihren Hintergrund (1.4.11, Näherung)
  document.querySelectorAll('input, select, textarea, button, [role="button"], [role="checkbox"], [role="switch"]').forEach((el) => {
    if (!isVisible(el)) return;
    const st = getComputedStyle(el);
    let parentBg = null, node = el.parentElement, bgImage = false;
    while (node && node.nodeType === 1) {
      const s = getComputedStyle(node);
      if (s.backgroundImage && s.backgroundImage !== 'none') { bgImage = true; break; }
      const c = parseColor(s.backgroundColor);
      if (c && c.a > 0) { parentBg = c; if (c.a >= 1) break; }
      node = node.parentElement;
    }
    if (!parentBg) parentBg = { r: 255, g: 255, b: 255, a: 1 };
    const own = parseColor(st.backgroundColor);
    const border = parseColor(st.borderTopColor);
    const borderVisible = parseFloat(st.borderTopWidth) > 0 && st.borderTopStyle !== 'none';
    const boundary = borderVisible ? border : (own && own.a > 0 ? own : null);
    if (!boundary || bgImage) return;
    const r = ratio(blend(boundary, parentBg), parentBg);
    if (r !== null) {
      out.nonTextContrast.push({
        element: el.tagName.toLowerCase() + (el.getAttribute('type') ? '[type=' + el.getAttribute('type') + ']' : ''),
        boundary: borderVisible ? 'Rahmen' : 'Fläche',
        color: hex(boundary), against: hex(parentBg), ratio: r, required: 3,
        selector: cssPath(el),
      });
    }
  });

  /* ------------------------------------------------ Fokussierbare Elemente */
  const FOCUS_SEL = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"]), audio[controls], video[controls], iframe';
  let idx = 0;
  document.querySelectorAll(FOCUS_SEL).forEach((el) => {
    if (!isVisible(el)) return;
    idx++;
    el.setAttribute('data-bfsg-focus-id', String(idx));
    const st = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    out.focusables.push({
      id: idx, tag: el.tagName.toLowerCase(), name: trunc(accName(el).name, 60),
      domOrder: idx, tabindex: el.getAttribute('tabindex'),
      width: Math.round(r.width), height: Math.round(r.height),
      baseline: {
        outlineStyle: st.outlineStyle, outlineWidth: st.outlineWidth, outlineColor: st.outlineColor,
        boxShadow: st.boxShadow, backgroundColor: st.backgroundColor, color: st.color,
        border: st.borderTopWidth + ' ' + st.borderTopColor, textDecoration: st.textDecorationLine,
      },
      selector: cssPath(el),
    });
  });

  /* ------------------------------------------- Zielgrössen (WCAG 2.2 2.5.8) */
  out.smallTargets = [];
  document.querySelectorAll('a[href], button, input[type="checkbox"], input[type="radio"], [role="button"], select').forEach((el) => {
    if (!isVisible(el)) return;
    const r = el.getBoundingClientRect();
    if (r.width < 24 || r.height < 24) {
      // Inline-Links in Fliesstext sind nach 2.5.8 ausgenommen
      const inlineException = el.tagName === 'A' && !!el.closest('p, li, td, dd, span');
      if (out.smallTargets.length < 40) {
        out.smallTargets.push({
          tag: el.tagName.toLowerCase(), name: trunc(accName(el).name, 40),
          width: Math.round(r.width), height: Math.round(r.height),
          inlineException, selector: cssPath(el),
        });
      }
    }
  });

  /* ------------------------------------------------------- Consent-Layer */
  const CONSENT_RE = /(cookie|consent|einwilligung|datenschutzeinstellung|tracking|privacy)/i;
  const overlays = [...document.querySelectorAll('div, section, aside, dialog, form')].filter((el) => {
    const st = getComputedStyle(el);
    if (!['fixed', 'sticky', 'absolute'].includes(st.position)) return false;
    if (!isVisible(el)) return false;
    const r = el.getBoundingClientRect();
    if (r.width * r.height < window.innerWidth * window.innerHeight * 0.05) return false;
    return CONSENT_RE.test((el.getAttribute('id') || '') + ' ' + (el.getAttribute('class') || '') + ' ' + clean(el.innerText).slice(0, 400));
  });
  if (overlays.length) {
    const el = overlays[0];
    const r = el.getBoundingClientRect();
    out.consent = {
      selector: cssPath(el),
      coverage: Math.round(((r.width * r.height) / (window.innerWidth * window.innerHeight)) * 100),
      role: el.getAttribute('role') || null,
      ariaModal: el.getAttribute('aria-modal') || null,
      accName: accName(el).name,
      buttons: [...el.querySelectorAll('button, a[href], [role="button"], input[type="submit"]')].slice(0, 12).map((b) => ({
        name: trunc(accName(b).name, 60), tag: b.tagName.toLowerCase(), selector: cssPath(b), visible: isVisible(b),
      })),
      hasRejectOption: /(ablehnen|nur (technisch )?notwendige|nur essenziell|alle ablehnen|reject|decline|deny)/i.test(clean(el.innerText)),
      bodyScrollLocked: getComputedStyle(document.body).overflow === 'hidden',
    };
  }

  /* -------------------------------------------------------------- Zähler */
  out.counts = Object.assign(out.counts, {
    elements: document.querySelectorAll('*').length,
    links: out.links.length, buttons: out.buttons.length, images: out.images.length,
    forms: out.forms.length, iframes: out.media.iframes.length, focusables: out.focusables.length,
    headings: out.headings.length, tables: out.tables.length,
  });
  return out;
}
