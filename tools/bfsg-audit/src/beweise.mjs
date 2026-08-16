/**
 * Beweisführung: sichtbare Belege statt blosser Messwerte.
 *
 * Für jeden belegbaren Befund wird das betroffene Element im Browser angesteuert,
 * rot markiert, in den Sichtbereich gescrollt und einzeln fotografiert. Wo eine
 * Interaktion den Fehler erst zeigt, wird sie tatsächlich ausgeführt:
 *
 *  - Formularfelder: Fokus setzen, echten Text eintippen, Vorher/Nachher fotografieren
 *    (zeigt, dass die Platzhalter-Beschriftung beim Tippen verschwindet)
 *  - Bedienelemente: Fokus per Tastatur setzen und fotografieren (Fokusindikator)
 *  - Zoomsperre: mobile Ansicht fotografieren und das meta-Tag im Original zeigen
 *  - Kontrast: Element fotografieren, Farbwerte als Belegwerte ausgeben
 *
 * Formulare werden **nicht abgesendet** – getippt wird nur, um die Beschriftung zu
 * prüfen. Danach wird das Feld wieder geleert.
 */

const PADDING = 12;

/** Markiert ein Element sichtbar und liefert Kontextdaten zurück. */
async function markiere(page, selector, farbe = '#e60000') {
  return page.evaluate(({ sel, farbe: f, padding }) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    el.scrollIntoView({ block: 'center', inline: 'center' });
    const alt = { outline: el.style.outline, offset: el.style.outlineOffset, box: el.style.boxShadow };
    el.style.outline = `3px solid ${f}`;
    el.style.outlineOffset = '2px';
    el.style.boxShadow = `0 0 0 6px ${f}33`;
    el.setAttribute('data-bfsg-markiert', '1');
    const r = el.getBoundingClientRect();
    const st = getComputedStyle(el);
    return {
      vorher: alt,
      rect: {
        x: Math.max(0, r.left - padding), y: Math.max(0, r.top - padding),
        width: Math.min(innerWidth, r.width + padding * 2), height: Math.min(innerHeight, r.height + padding * 2),
      },
      tag: el.tagName.toLowerCase(),
      text: (el.innerText || el.value || '').replace(/\s+/g, ' ').trim().slice(0, 120),
      farbe: st.color,
      hintergrund: st.backgroundColor,
      schrift: `${st.fontSize} / ${st.fontWeight}`,
      html: el.outerHTML.replace(/\s+/g, ' ').slice(0, 400),
    };
  }, { sel: selector, farbe, padding: PADDING });
}

async function markierungAufheben(page) {
  await page.evaluate(() => {
    document.querySelectorAll('[data-bfsg-markiert]').forEach((el) => {
      el.style.outline = ''; el.style.outlineOffset = ''; el.style.boxShadow = '';
      el.removeAttribute('data-bfsg-markiert');
    });
  }).catch(() => {});
}

/** Was eine Sprachausgabe zu diesem Element sagen würde (Näherung des Accessible Name). */
export async function screenreaderAnsage(page, selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const rolle = {
      a: 'Link', button: 'Schaltfläche', input: 'Eingabefeld', select: 'Auswahlfeld',
      textarea: 'mehrzeiliges Eingabefeld', img: 'Grafik', iframe: 'Frame',
    }[el.tagName.toLowerCase()] || el.getAttribute('role') || 'Element';
    const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
    let name = clean(el.getAttribute('aria-label'));
    let quelle = name ? 'aria-label' : null;
    if (!name && el.getAttribute('aria-labelledby')) {
      const ids = el.getAttribute('aria-labelledby').split(/\s+/);
      name = clean(ids.map((i) => (document.getElementById(i) || {}).innerText || '').join(' '));
      quelle = name ? 'aria-labelledby' : null;
    }
    if (!name && el.id) {
      const lab = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (lab) { name = clean(lab.innerText); quelle = 'label[for]'; }
    }
    if (!name && el.closest('label')) { name = clean(el.closest('label').innerText); quelle = 'umschliessendes label'; }
    if (!name && el.tagName === 'IMG') { name = clean(el.getAttribute('alt')); quelle = el.hasAttribute('alt') ? 'alt' : null; }
    if (!name) { name = clean(el.innerText); quelle = name ? 'Textinhalt' : null; }
    if (!name && el.getAttribute('title')) { name = clean(el.getAttribute('title')); quelle = 'title'; }
    if (!name && el.getAttribute('placeholder')) { name = clean(el.getAttribute('placeholder')); quelle = 'placeholder (kein echtes Label)'; }
    return {
      ansage: name ? `„${name}", ${rolle}` : `nur „${rolle}" – ohne Namen`,
      name, quelle, rolle,
      pflichtfeld: el.required || el.getAttribute('aria-required') === 'true',
    };
  }, selector);
}

/**
 * Erzeugt Belege für eine Liste von Befunden.
 * `aufgaben`: [{ id, art, selector, titel }] – art steuert die Interaktion.
 */
export async function sammleBeweise(page, aufgaben, { verzeichnis, praefix = 'beweis' }) {
  const belege = [];
  for (const [nr, a] of aufgaben.entries()) {
    const beleg = { id: a.id, art: a.art, titel: a.titel, selector: a.selector, schritte: [], bilder: [] };
    try {
      const info = await markiere(page, a.selector);
      if (!info) { beleg.fehler = 'Element auf der Seite nicht mehr gefunden'; belege.push(beleg); continue; }
      beleg.element = { tag: info.tag, text: info.text, html: info.html, farbe: info.farbe, hintergrund: info.hintergrund, schrift: info.schrift };

      const schuss = async (name, clip = true) => {
        const datei = `${verzeichnis}/${praefix}-${String(nr + 1).padStart(2, '0')}-${name}.png`;
        try {
          await page.screenshot({ path: datei, clip: clip && info.rect.width > 8 && info.rect.height > 8 ? info.rect : undefined });
          beleg.bilder.push({ name, datei });
        } catch { /* Screenshot ist Beleg, kein Muss */ }
      };

      await schuss('element');

      if (a.art === 'formularfeld') {
        const vorher = await screenreaderAnsage(page, a.selector);
        beleg.schritte.push(`Sprachausgabe vor der Eingabe: ${vorher.ansage}${vorher.quelle ? ` (Quelle: ${vorher.quelle})` : ''}`);
        beleg.ansage = vorher;
        // echte Eingabe – ohne Absenden
        try {
          await page.focus(a.selector, { timeout: 4000 });
          await schuss('fokussiert');
          const typ = await page.evaluate((sel) => {
            const el = document.querySelector(sel);
            return { tag: el.tagName.toLowerCase(), type: (el.getAttribute('type') || '').toLowerCase() };
          }, a.selector);
          if (typ.tag !== 'input' && typ.tag !== 'textarea') {
            beleg.schritte.push(`${typ.tag === 'select' ? 'Auswahlfeld' : typ.tag} – keine Texteingabe möglich, nur Fokus geprüft.`);
            throw new Error('keine Texteingabe möglich');
          }
          if (['checkbox', 'radio', 'file', 'submit', 'button', 'image'].includes(typ.type)) {
            beleg.schritte.push(`Feldtyp „${typ.type}" – keine Texteingabe möglich, nur Fokus geprüft.`);
            throw new Error('keine Texteingabe möglich');
          }
          await page.fill(a.selector, 'Testeingabe Barrierefreiheit', { timeout: 4000 });
          await page.waitForTimeout(250);
          await schuss('nach-eingabe');
          const danach = await page.evaluate((sel) => {
            const el = document.querySelector(sel);
            const lab = el.labels && el.labels.length ? el.labels[0].innerText.trim() : '';
            return { wert: el.value, sichtbaresLabel: lab, platzhalterNochSichtbar: !!el.placeholder && !el.value };
          }, a.selector);
          beleg.schritte.push(danach.sichtbaresLabel
            ? `Nach der Eingabe bleibt die Beschriftung „${danach.sichtbaresLabel}" sichtbar.`
            : 'Nach der Eingabe ist keine Beschriftung mehr sichtbar – der Platzhalter war die einzige Erklärung des Feldes.');
          await page.fill(a.selector, '', { timeout: 4000 }).catch(() => {});
          beleg.schritte.push('Feld wieder geleert, nichts abgesendet.');
        } catch (e) {
          const m = String(e.message || e).split('\n')[0];
          if (m !== 'keine Texteingabe möglich') beleg.schritte.push(`Eingabe nicht möglich: ${m}`);
        }
      }

      if (a.art === 'bedienelement') {
        const ans = await screenreaderAnsage(page, a.selector);
        beleg.ansage = ans;
        beleg.schritte.push(`Sprachausgabe: ${ans.ansage}${ans.quelle ? ` (Quelle: ${ans.quelle})` : ''}`);
        const fokus = await page.evaluate((sel) => {
          const el = document.querySelector(sel);
          if (!el || !el.focus) return null;
          const vor = getComputedStyle(el);
          const vorher = { outline: vor.outlineStyle + ' ' + vor.outlineWidth + ' ' + vor.outlineColor, schatten: vor.boxShadow, hintergrund: vor.backgroundColor };
          el.focus();
          const na = getComputedStyle(el);
          const nachher = { outline: na.outlineStyle + ' ' + na.outlineWidth + ' ' + na.outlineColor, schatten: na.boxShadow, hintergrund: na.backgroundColor };
          return { vorher, nachher, unveraendert: JSON.stringify(vorher) === JSON.stringify(nachher) };
        }, a.selector);
        if (fokus) {
          await schuss('fokussiert');
          beleg.fokus = fokus;
          beleg.schritte.push(fokus.unveraendert
            ? 'Beim Fokussieren ändert sich die Darstellung nicht – es gibt keinen sichtbaren Fokusindikator.'
            : `Fokusindikator vorhanden (Outline: ${fokus.nachher.outline}).`);
        }
      }

      if (a.art === 'element') {
        const ans = await screenreaderAnsage(page, a.selector);
        if (ans) {
          beleg.ansage = ans;
          beleg.schritte.push(`Sprachausgabe: ${ans.ansage}${ans.quelle ? ` (Quelle: ${ans.quelle})` : ''}`);
        }
      }

      if (a.art === 'kontrast') {
        beleg.schritte.push(`Gemessen: Vordergrund ${info.farbe} auf Hintergrund ${info.hintergrund}, Schrift ${info.schrift}.`);
      }

      await markierungAufheben(page);
    } catch (e) {
      beleg.fehler = String(e.message || e).split('\n')[0];
      await markierungAufheben(page);
    }
    belege.push(beleg);
  }
  return belege;
}

/** Ganzseiten- und Mobilbelege (Zoomsperre, Reflow). */
export async function seitenBelege(page, { verzeichnis, praefix = 'seite' }) {
  const belege = {};
  const original = page.viewportSize();
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${verzeichnis}/${praefix}-desktop.png`, fullPage: false });
    belege.desktop = `${praefix}-desktop.png`;

    await page.setViewportSize({ width: 320, height: 800 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${verzeichnis}/${praefix}-mobil-320.png`, fullPage: false });
    belege.mobil320 = `${praefix}-mobil-320.png`;
    belege.reflow = await page.evaluate(() => {
      const breite = Math.max(document.documentElement.scrollWidth, document.body ? document.body.scrollWidth : 0);
      return { inhaltsbreite: Math.round(breite), viewport: window.innerWidth, ueberstand: Math.round(breite - window.innerWidth) };
    });
    belege.viewportMeta = await page.evaluate(() => {
      const m = document.querySelector('meta[name="viewport" i]');
      return m ? m.outerHTML : null;
    });
  } finally {
    if (original) await page.setViewportSize(original).catch(() => {});
  }
  return belege;
}
