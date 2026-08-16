/**
 * Phase 3/4 – Auswertung: aus den Rohdaten der Sonde, den axe-core-Ergebnissen sowie
 * den Tastatur-/Responsive-Läufen werden Befunde mit WCAG-Zuordnung und Schweregrad.
 *
 * Grundsatz: Jeder Befund benennt Problem, Erwartung, betroffene Elemente und ob er
 * automatisiert feststellbar ist. Nicht automatisiert entscheidbare Sachverhalte werden
 * als `detectable: 'manuell'` bzw. 'teilautomatisch' ausgegeben und landen im Bericht in
 * der Liste "MANUELLE PRÜFUNG ERFORDERLICH".
 */
import { wcagFromAxeTags, wcagLevel, wcagRef } from './wcag.mjs';

export const SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

/** Die drei Automatisierbarkeitsstufen der Prüfspezifikation. */
export const AUTOMATISIERBARKEIT = {
  automatisch: 'AUTOMATISCH',
  teilautomatisch: 'AUTOMATISCHER HINWEIS – MANUELLE PRÜFUNG',
  manuell: 'NUR MANUELL PRÜFBAR',
};

/**
 * Wirkung auf Nutzende je Prüfung – knapp, konkret und ohne Dramatisierung.
 * Für Prüfungen ohne Eintrag wird aus der Kategorie eine allgemeine Formulierung gebildet.
 */
const WIRKUNG = {
  'contrast-text': 'Text ist für Menschen mit Sehbeeinträchtigung, bei Farbsehschwäche und bei Sonnenlicht auf dem Mobilgerät schwer bis nicht lesbar.',
  'contrast-nontext': 'Eingabefelder und Schaltflächen sind als solche nicht sicher erkennbar; Bedienelemente werden übersehen.',
  'contrast-bgimage': 'Über Bildern kann der Text je nach Bildstelle unlesbar werden.',
  'color-only-links': 'Bei Farbsehschwäche sind Links im Fliesstext nicht von normalem Text unterscheidbar.',
  'img-alt-missing': 'Screenreader lesen Dateinamen vor oder überspringen die Information; der Bildinhalt geht verloren.',
  'img-link-no-name': 'Grafische Links werden ohne Ziel angesagt – die Navigation ist blind nicht nutzbar.',
  'img-alt-suspicious': 'Der vorgelesene Text vermittelt den Bildinhalt nicht.',
  'svg-icon-no-name': 'Icon-Schaltflächen werden ohne Funktion angesagt.',
  'button-empty': 'Bedienelemente werden nur als „Schaltfläche" angesagt und sind ohne Raten nicht bedienbar.',
  'link-empty': 'Der Link wird ohne Ziel angesagt und ist in Linklisten unbrauchbar.',
  'link-generic': 'In der Linkliste des Screenreaders stehen mehrfach „mehr" oder „hier" ohne Kontext.',
  'link-ambiguous': 'Gleich benannte Links führen an verschiedene Ziele – die Auswahl wird zum Ratespiel.',
  'clickable-nonsemantic': 'Die Funktion ist per Tastatur nicht auslösbar und für Screenreader unsichtbar.',
  'form-unlabelled': 'Es ist nicht erkennbar, welche Eingabe erwartet wird; das Formular wird unbenutzbar.',
  'form-placeholder-only': 'Die Beschriftung verschwindet beim Tippen; Kontrolle und Korrektur werden erschwert.',
  'form-autocomplete': 'Automatisches Ausfüllen entfällt – für motorisch eingeschränkte Nutzende ein erheblicher Mehraufwand.',
  'form-group': 'Der Bezug einzelner Optionen zur Gruppenfrage geht verloren.',
  'form-error-region': 'Fehler werden beim Absenden nicht angesagt; Nutzende suchen den Fehler blind.',
  'lang-missing': 'Screenreader lesen deutsche Texte mit fremder Aussprache vor – der Inhalt wird unverständlich.',
  'lang-mismatch': 'Teile der Seite werden in falscher Aussprache vorgelesen.',
  'title-missing': 'In Tab- und Verlaufslisten ist die Seite nicht identifizierbar.',
  'h1-missing': 'Der Einstiegspunkt für die Sprungnavigation über Überschriften fehlt.',
  'heading-skip': 'Die Gliederung ist über die Überschriftennavigation nicht nachvollziehbar.',
  'heading-empty': 'Leere Einträge in der Überschriftenliste stören die Orientierung.',
  'landmark-main-missing': 'Der wiederkehrende Kopfbereich lässt sich nicht überspringen.',
  'skiplink-missing': 'Bei reiner Tastaturnutzung muss vor jedem Inhalt die gesamte Navigation durchlaufen werden.',
  'focus-invisible': 'Ohne Maus ist nicht erkennbar, welches Element gerade aktiv ist – die Seite wird unbedienbar.',
  'focus-order': 'Der Fokus springt entgegen der Leserichtung; die Bedienung wird unvorhersehbar.',
  'focus-offscreen': 'Der Fokus liegt auf unsichtbaren Elementen – Nutzende verlieren die Orientierung.',
  'keyboard-trap': 'Der Fokus lässt sich nicht mehr aus dem Element herausbewegen; die Seite muss neu geladen werden.',
  'keyboard-unreachable': 'Einzelne Bedienelemente sind ohne Maus möglicherweise nicht erreichbar.',
  'keyboard-modal-hold': 'Die Seite hinter dem Overlay konnte nicht geprüft werden; für Nutzende zählt, ob der Dialog schliessbar ist.',
  'tabindex-positive': 'Die Reihenfolge beim Tabben weicht von der sichtbaren Anordnung ab.',
  'aria-role-invalid': 'Assistive Technik erhält eine unbekannte Rolle und meldet das Element falsch oder gar nicht.',
  'aria-ref-broken': 'Der Name des Elements entfällt vollständig, weil der Verweis ins Leere zeigt.',
  'aria-hidden-focusable': 'Elemente sind per Tastatur erreichbar, für Screenreader aber unsichtbar – der Fokus verschwindet ins Nichts.',
  'iframe-title': 'Eingebettete Inhalte werden ohne Bezeichnung angesagt.',
  'video-captions': 'Gehörlose und schwerhörige Nutzende erhalten den Inhalt nicht.',
  'media-autoplay': 'Automatischer Ton überlagert die Sprachausgabe des Screenreaders.',
  'motion-infinite': 'Dauerbewegung erschwert Konzentration und Lesen, bei Vestibularstörungen bis zur Übelkeit.',
  'motion-carousel': 'Inhalte wechseln, bevor sie gelesen werden konnten.',
  'meta-refresh': 'Die Seite wechselt ohne Vorwarnung; Screenreader beginnen von vorn.',
  'viewport-zoom': 'Vergrössern auf dem Mobilgerät ist gesperrt – für Menschen mit Sehbeeinträchtigung eine harte Barriere.',
  'target-size': 'Kleine Ziele sind bei motorischen Einschränkungen und auf Touchgeräten schwer treffbar.',
  'table-headers': 'Der Bezug einer Zelle zu ihrer Spalte oder Zeile wird nicht vorgelesen.',
  'duplicate-ids': 'Beschriftungen und Verweise können auf das falsche Element zeigen.',
  'consent-semantics': 'Der Consent-Dialog wird nicht als Dialog erkannt; Nutzende landen im Hintergrundinhalt.',
  'consent-manual': 'Der Layer steht vor der gesamten Website – scheitert er, ist nichts nutzbar.',
};

let seq = 0;
/** Fortlaufende Befund-IDs im Format BFSG-001. */
export function resetFindingIds() { seq = 0; }

function F(o) {
  if (o.wcag) {
    for (const id of o.wcag) {
      if (!wcagRef(id)) throw new Error(`Unbekanntes WCAG-Kriterium im Code: ${id}`);
    }
  }
  const detectable = o.detectable || 'automatisch';
  const basis = o.check.replace(/-\d+$/, '');
  return {
    id: `BFSG-${String(++seq).padStart(3, '0')}`,
    key: `${o.check}-${seq}`,
    check: o.check,
    category: o.category,
    title: o.title,
    wcag: o.wcag || [],
    level: wcagLevel(o.wcag || []),
    severity: o.severity,
    url: o.url,
    seitentyp: null, // wird beim Zusammenführen im CLI gesetzt
    problem: o.problem,
    expectation: o.expectation,
    messwert: o.messwert != null ? String(o.messwert) : null,
    erwartet: o.erwartet != null ? String(o.erwartet) : null,
    elements: (o.elements || []).slice(0, 10),
    count: o.count != null ? o.count : (o.elements || []).length,
    detectable,
    automatisierbarkeit: AUTOMATISIERBARKEIT[detectable] || AUTOMATISIERBARKEIT.automatisch,
    benutzerwirkung: o.benutzerwirkung || WIRKUNG[basis] ||
      `Beeinträchtigt die Nutzung im Bereich „${o.category}" für Menschen mit Behinderungen.`,
    recommendation: o.recommendation,
    rationale: o.rationale || '',
    screenshot: null, // wird beim Zusammenführen im CLI gesetzt
    source: o.source || 'eigene Prüfung',
  };
}

const bump = (base, count, thresholds = [10, 3]) => {
  const order = SEVERITIES.indexOf(base);
  if (count >= thresholds[0] && order > 0) return SEVERITIES[order - 1];
  return base;
};

/** Hauptauswertung für eine einzelne Seite. */
export function analyzePage(page) {
  const f = [];
  const url = page.url;
  const p = page.probe;
  if (!p) return f;

  /* ------------------------------------------------ I. Sprache & Dokument */
  if (!p.lang) {
    f.push(F({
      check: 'lang-missing', category: 'I. Sprache', title: 'Sprache der Seite nicht ausgezeichnet',
      wcag: ['3.1.1'], severity: 'HIGH', url,
      problem: 'Das <html>-Element hat kein lang-Attribut.',
      expectation: 'Die Hauptsprache muss maschinenlesbar angegeben sein, z. B. <html lang="de">.',
      elements: ['<html>'], count: 1,
      recommendation: 'lang="de" (bzw. die tatsächliche Hauptsprache) am <html>-Element setzen.',
      rationale: 'Screenreader wählen ohne lang-Angabe eine falsche Aussprachetabelle; deutschsprachige Inhalte werden dann unverständlich vorgelesen.',
    }));
  } else {
    const primary = p.lang.split('-')[0].toLowerCase();
    if (!/^[a-z]{2,3}$/.test(primary)) {
      f.push(F({
        check: 'lang-invalid', category: 'I. Sprache', title: 'lang-Attribut ist kein gültiger Sprachcode',
        wcag: ['3.1.1'], severity: 'MEDIUM', url,
        problem: `lang="${p.lang}" ist kein gültiges BCP-47-Sprachkennzeichen.`,
        expectation: 'Gültiger Sprachcode nach BCP 47, z. B. "de" oder "de-DE".',
        elements: ['<html>'], count: 1,
        recommendation: 'Sprachcode korrigieren.',
      }));
    } else if (p.textStats.guessed && p.textStats.guessed !== primary && p.textStats.words > 120) {
      f.push(F({
        check: 'lang-mismatch', category: 'I. Sprache', title: 'Ausgezeichnete Sprache passt möglicherweise nicht zum Inhalt',
        wcag: ['3.1.1'], severity: 'MEDIUM', url,
        problem: `Ausgezeichnet ist lang="${p.lang}", der Textinhalt wirkt jedoch überwiegend "${p.textStats.guessed}" (Stoppwort-Heuristik: de=${p.textStats.deHits}, en=${p.textStats.enHits}).`,
        expectation: 'Die Sprachauszeichnung muss der tatsächlichen Sprache entsprechen; fremdsprachige Abschnitte erhalten ein eigenes lang-Attribut.',
        elements: ['<html>'], count: 1, detectable: 'teilautomatisch',
        recommendation: 'Sprachauszeichnung prüfen und fremdsprachige Passagen mit lang="…" auszeichnen (3.1.2).',
        rationale: 'Die Heuristik ist nur ein Indiz – mehrsprachige Seiten müssen manuell bewertet werden.',
      }));
    }
  }

  if (!p.title || !p.title.trim()) {
    f.push(F({
      check: 'title-missing', category: 'D. Struktur/Semantik', title: 'Seitentitel fehlt oder ist leer',
      wcag: ['2.4.2'], severity: 'HIGH', url,
      problem: 'Die Seite hat keinen (nicht-leeren) <title>.',
      expectation: 'Jede Seite braucht einen aussagekräftigen, eindeutigen Titel.',
      elements: ['<title>'], count: 1,
      recommendation: 'Sprechenden Seitentitel vergeben, Muster: "Seitenthema – Websitename".',
    }));
  }

  /* ------------------------------------------- D. Überschriften/Landmarken */
  const visibleHeadings = p.headings.filter((h) => h.visible !== false);
  const h1 = visibleHeadings.filter((h) => h.level === 1);
  if (h1.length === 0) {
    f.push(F({
      check: 'h1-missing', category: 'D. Struktur/Semantik', title: 'Keine H1-Überschrift vorhanden',
      wcag: ['1.3.1', '2.4.6'], severity: 'MEDIUM', url,
      problem: 'Auf der Seite existiert keine sichtbare Überschrift erster Ebene.',
      expectation: 'Jede Seite sollte genau eine H1 haben, die den Seiteninhalt benennt.',
      elements: [], count: 1,
      recommendation: 'Hauptüberschrift als <h1> auszeichnen (nicht per CSS-Klasse simulieren).',
      rationale: 'Screenreader-Nutzende springen über die Überschriftenliste; ohne H1 fehlt der Einstiegspunkt.',
    }));
  } else if (h1.length > 1) {
    f.push(F({
      check: 'h1-multiple', category: 'D. Struktur/Semantik', title: 'Mehrere H1-Überschriften',
      wcag: ['1.3.1'], severity: 'LOW', url,
      problem: `${h1.length} H1-Überschriften auf einer Seite.`,
      expectation: 'In der Regel genau eine H1 pro Seite.',
      elements: h1.map((h) => `${h.selector} – "${h.text}"`), count: h1.length,
      recommendation: 'Überschriftenhierarchie so umbauen, dass es eine H1 und darunter H2/H3 gibt.',
    }));
  }
  const skips = [];
  let prev = 0;
  for (const h of visibleHeadings) {
    if (!h.level) continue;
    if (prev && h.level > prev + 1) skips.push(`${h.selector}: H${prev} → H${h.level} ("${h.text}")`);
    prev = h.level;
  }
  if (skips.length) {
    f.push(F({
      check: 'heading-skip', category: 'D. Struktur/Semantik', title: 'Überschriftenebenen werden übersprungen',
      wcag: ['1.3.1'], severity: bump('MEDIUM', skips.length, [8, 3]), url,
      problem: `${skips.length} Sprünge in der Überschriftenhierarchie.`,
      expectation: 'Überschriftenebenen dürfen beim Abwärtsgehen nicht übersprungen werden.',
      elements: skips, count: skips.length,
      recommendation: 'Ebenen lückenlos vergeben; Größe/Optik über CSS statt über die Ebene steuern.',
    }));
  }
  // bewusst über alle Überschriften: leere Überschriften haben oft die Höhe 0 und gelten
  // damit nicht als "sichtbar", müssen aber trotzdem gemeldet werden
  const emptyHeadings = p.headings.filter((h) => h.empty);
  if (emptyHeadings.length) {
    f.push(F({
      check: 'heading-empty', category: 'D. Struktur/Semantik', title: 'Leere Überschriften',
      wcag: ['1.3.1', '2.4.6'], severity: 'MEDIUM', url,
      problem: `${emptyHeadings.length} Überschriften ohne Textinhalt.`,
      expectation: 'Überschriftenelemente müssen Text enthalten oder entfernt werden.',
      elements: emptyHeadings.map((h) => h.selector), count: emptyHeadings.length,
      recommendation: 'Leere <hX>-Elemente entfernen oder mit Text füllen.',
    }));
  }

  const mains = p.landmarks.filter((l) => l.role === 'main');
  if (mains.length === 0) {
    f.push(F({
      check: 'landmark-main-missing', category: 'D. Struktur/Semantik', title: 'Kein main-Bereich ausgezeichnet',
      wcag: ['1.3.1'], severity: 'MEDIUM', url,
      problem: 'Es gibt weder <main> noch role="main".',
      expectation: 'Der Hauptinhaltsbereich muss als Landmarke erkennbar sein.',
      elements: [], count: 1,
      recommendation: 'Hauptinhalt in <main> kapseln; Navigation in <nav>, Fusszeile in <footer>.',
      rationale: 'Ohne main-Landmarke kann der wiederkehrende Kopf-/Navigationsbereich nicht übersprungen werden.',
    }));
  } else if (mains.length > 1) {
    f.push(F({
      check: 'landmark-main-multiple', category: 'D. Struktur/Semantik', title: 'Mehrere main-Landmarken',
      wcag: ['1.3.1'], severity: 'LOW', url,
      problem: `${mains.length} main-Landmarken gefunden.`,
      expectation: 'Pro Seite genau eine sichtbare main-Landmarke.',
      elements: mains.map((m) => m.selector), count: mains.length,
      recommendation: 'Zusätzliche main-Elemente entfernen oder in role="region" mit Label umwandeln.',
    }));
  }
  const navs = p.landmarks.filter((l) => l.role === 'navigation');
  if (navs.length > 1 && navs.filter((n) => n.label).length < navs.length) {
    f.push(F({
      check: 'landmark-nav-unlabelled', category: 'D. Struktur/Semantik', title: 'Mehrere Navigationsbereiche ohne unterscheidbare Beschriftung',
      wcag: ['1.3.1'], severity: 'LOW', url,
      problem: `${navs.length} nav-Landmarken, davon ${navs.filter((n) => !n.label).length} ohne aria-label.`,
      expectation: 'Mehrfach vorkommende Landmarken sollten per aria-label unterscheidbar sein.',
      elements: navs.filter((n) => !n.label).map((n) => n.selector), count: navs.length,
      recommendation: 'aria-label="Hauptnavigation" / "Fussnavigation" o. Ä. vergeben.',
    }));
  }
  const skipOk = p.skipLinks.some((s) => s.targetExists && /(inhalt|content|hauptinhalt|navigation|menü|skip|springe)/i.test(s.text || ''));
  if (!skipOk) {
    f.push(F({
      check: 'skiplink-missing', category: 'E. Tastatur', title: 'Kein erkennbarer Sprunglink ("Zum Inhalt springen")',
      wcag: ['2.4.1'], severity: 'MEDIUM', url,
      problem: 'Es wurde kein Sprunglink zu Beginn der Seite gefunden, der auf ein vorhandenes Ziel verweist.',
      expectation: 'Wiederkehrende Blöcke (Kopf/Navigation) müssen übersprungen werden können – üblicherweise per Sprunglink oder durchgängigen Landmarken.',
      elements: p.skipLinks.map((s) => `${s.selector} → #${s.target}${s.targetExists ? '' : ' (Ziel fehlt!)'}`), count: 1,
      detectable: 'teilautomatisch',
      recommendation: 'Als erstes fokussierbares Element einen Sprunglink einfügen, der bei Tastaturfokus sichtbar wird.',
      rationale: 'Landmarken allein reichen für Screenreader oft aus, für reine Tastaturnutzung ohne Screenreader jedoch nicht.',
    }));
  }

  /* ---------------------------------------------------------- C. Bilder */
  const imgs = p.images.filter((i) => !i.isSvg);
  const noAlt = imgs.filter((i) => !i.hasAlt && !i.ariaHidden && i.role !== 'presentation' && i.role !== 'none');
  if (noAlt.length) {
    f.push(F({
      check: 'img-alt-missing', category: 'C. Bilder', title: 'Bilder ohne alt-Attribut',
      wcag: ['1.1.1'], severity: bump('HIGH', noAlt.length, [10, 3]), url,
      problem: `${noAlt.length} <img>-Elemente ohne alt-Attribut.`,
      expectation: 'Jedes <img> braucht ein alt-Attribut – beschreibend bei informativen Bildern, alt="" bei rein dekorativen.',
      elements: noAlt.map((i) => `${i.selector} (${i.src.split('/').pop()})`), count: noAlt.length,
      recommendation: 'Informative Bilder mit Zweckbeschreibung versehen, dekorative mit alt="" auszeichnen.',
      rationale: 'Ohne alt liest der Screenreader den Dateinamen vor oder überspringt die Information vollständig.',
    }));
  }
  const linkImgNoName = imgs.filter((i) => i.inLink && !i.linkHasText && (!i.hasAlt || !i.alt) && !i.ariaHidden);
  if (linkImgNoName.length) {
    f.push(F({
      check: 'img-link-no-name', category: 'C. Bilder', title: 'Verlinkte Bilder ohne Alternativtext',
      wcag: ['1.1.1', '2.4.4', '4.1.2'], severity: 'HIGH', url,
      problem: `${linkImgNoName.length} Bilder sind einziger Inhalt eines Links/Buttons, liefern aber keinen Alternativtext.`,
      expectation: 'Bei Grafik-Links muss der Alternativtext das Linkziel beschreiben (nicht das Bild).',
      elements: linkImgNoName.map((i) => i.selector), count: linkImgNoName.length,
      recommendation: 'alt-Text am Bild oder aria-label am Link setzen, z. B. alt="Zur Startseite".',
    }));
  }
  const suspicious = imgs.filter((i) => i.suspiciousAlt);
  if (suspicious.length) {
    f.push(F({
      check: 'img-alt-suspicious', category: 'C. Bilder', title: 'Vermutlich unbrauchbare Alternativtexte',
      wcag: ['1.1.1'], severity: 'MEDIUM', url,
      problem: `${suspicious.length} Alternativtexte bestehen aus Dateinamen oder generischen Wörtern ("Bild", "Grafik", "IMG_1234").`,
      expectation: 'Der Alternativtext muss den Zweck/Inhalt des Bildes vermitteln.',
      elements: suspicious.map((i) => `${i.selector}: alt="${i.alt}"`), count: suspicious.length,
      detectable: 'teilautomatisch',
      recommendation: 'Alternativtexte inhaltlich neu formulieren.',
      rationale: 'Ob ein Alternativtext den Zweck tatsächlich vermittelt, ist nur redaktionell beurteilbar.',
    }));
  }
  const longAlt = imgs.filter((i) => i.longAlt);
  if (longAlt.length) {
    f.push(F({
      check: 'img-alt-long', category: 'C. Bilder', title: 'Sehr lange Alternativtexte',
      wcag: ['1.1.1'], severity: 'LOW', url,
      problem: `${longAlt.length} Alternativtexte sind länger als 200 Zeichen.`,
      expectation: 'Kurze Alternative im alt-Attribut, ausführliche Beschreibung im Fliesstext oder per aria-describedby.',
      elements: longAlt.map((i) => i.selector), count: longAlt.length, detectable: 'teilautomatisch',
      recommendation: 'Langbeschreibung in den Seiteninhalt auslagern.',
    }));
  }
  const svgIcons = p.images.filter((i) => i.isSvg && i.inLink && !i.linkHasText && !i.hasAlt && !i.decorative);
  if (svgIcons.length) {
    f.push(F({
      check: 'svg-icon-no-name', category: 'C. Bilder', title: 'Icon-SVGs in Bedienelementen ohne zugänglichen Namen',
      wcag: ['1.1.1', '4.1.2'], severity: 'HIGH', url,
      problem: `${svgIcons.length} Inline-SVGs sind alleiniger Inhalt eines Links/Buttons und haben weder <title> noch aria-label.`,
      expectation: 'Icon-Bedienelemente brauchen einen zugänglichen Namen.',
      elements: svgIcons.map((i) => i.selector), count: svgIcons.length,
      recommendation: 'aria-label am Link/Button setzen und das SVG mit aria-hidden="true" ausblenden.',
    }));
  }

  /* -------------------------------------------------- F. Links und Buttons */
  const emptyLinks = p.links.filter((l) => l.visible && l.empty && !l.noHref);
  if (emptyLinks.length) {
    f.push(F({
      check: 'link-empty', category: 'F. Links/Buttons', title: 'Links ohne zugänglichen Namen',
      wcag: ['2.4.4', '4.1.2'], severity: 'HIGH', url,
      problem: `${emptyLinks.length} sichtbare Links haben keinen Text und kein aria-label.`,
      expectation: 'Jeder Link braucht einen Namen, der sein Ziel beschreibt.',
      elements: emptyLinks.map((l) => `${l.selector} → ${l.href}`), count: emptyLinks.length,
      recommendation: 'Linktext ergänzen oder aria-label vergeben.',
    }));
  }
  const generic = p.links.filter((l) => l.visible && l.generic);
  if (generic.length) {
    f.push(F({
      check: 'link-generic', category: 'F. Links/Buttons', title: 'Nichtssagende Linktexte',
      wcag: ['2.4.4'], severity: 'MEDIUM', url,
      problem: `${generic.length} Links mit generischem Text wie "mehr", "hier", "weiterlesen".`,
      expectation: 'Der Linkzweck muss aus dem Linktext (ggf. mit unmittelbarem Kontext) hervorgehen.',
      elements: generic.map((l) => `${l.selector}: "${l.name}" → ${l.href}`), count: generic.length,
      detectable: 'teilautomatisch',
      recommendation: 'Linktexte sprechend formulieren ("Leistungsübersicht öffnen") oder per aria-label ergänzen.',
      rationale: 'Screenreader-Nutzende lassen sich Linklisten ausgeben; dort steht der Text ohne Kontext.',
    }));
  }
  const byName = new Map();
  for (const l of p.links) {
    if (!l.visible || !l.name || !l.resolved) continue;
    const k = l.name.toLowerCase();
    if (!byName.has(k)) byName.set(k, new Set());
    byName.get(k).add(l.resolved);
  }
  const ambiguous = [...byName.entries()].filter(([, targets]) => targets.size > 1);
  if (ambiguous.length) {
    f.push(F({
      check: 'link-ambiguous', category: 'F. Links/Buttons', title: 'Gleicher Linktext, unterschiedliche Ziele',
      wcag: ['2.4.4'], severity: 'MEDIUM', url,
      problem: `${ambiguous.length} Linktexte führen auf jeweils mehrere verschiedene Ziele.`,
      expectation: 'Gleich benannte Links sollten dasselbe Ziel haben – sonst muss der Text unterscheidbar sein.',
      elements: ambiguous.slice(0, 10).map(([name, t]) => `"${name}" → ${[...t].slice(0, 3).join(' | ')}`),
      count: ambiguous.length, detectable: 'teilautomatisch',
      recommendation: 'Linktexte eindeutig machen oder per aria-label differenzieren.',
    }));
  }
  const noHref = p.links.filter((l) => l.noHref && l.visible && !l.role);
  if (noHref.length) {
    f.push(F({
      check: 'link-no-href', category: 'F. Links/Buttons', title: '<a>-Elemente ohne href',
      wcag: ['2.1.1', '4.1.2'], severity: 'MEDIUM', url,
      problem: `${noHref.length} <a>-Elemente ohne href sind nicht fokussierbar und haben keine Rolle.`,
      expectation: 'Interaktive Elemente müssen als <button> ausgezeichnet oder mit href versehen sein.',
      elements: noHref.map((l) => l.selector), count: noHref.length,
      recommendation: 'Aktionen als <button> umsetzen; Navigation mit echtem href.',
    }));
  }
  const newWindow = p.links.filter((l) => l.visible && l.target === '_blank' && !l.hasNewWindowHint);
  if (newWindow.length) {
    f.push(F({
      check: 'link-new-window', category: 'F. Links/Buttons', title: 'Links öffnen ohne Ankündigung ein neues Fenster',
      wcag: [], severity: 'LOW', url,
      problem: `${newWindow.length} Links mit target="_blank" ohne Hinweis im Linktext/Titel.`,
      expectation: 'Ein Wechsel des Browserkontexts sollte angekündigt werden (WCAG-Technik G201; als AA-Kriterium nicht zwingend).',
      elements: newWindow.slice(0, 10).map((l) => `${l.selector}: "${l.name}"`), count: newWindow.length,
      recommendation: 'Hinweis "(öffnet in neuem Fenster)" im Linktext oder per visuell verstecktem Text ergänzen.',
      rationale: 'Kein eigenständiges AA-Erfolgskriterium – als Usability-/Best-Practice-Befund geführt.',
    }));
  }
  const emptyButtons = p.buttons.filter((b) => b.visible && b.empty);
  if (emptyButtons.length) {
    f.push(F({
      check: 'button-empty', category: 'F. Links/Buttons', title: 'Buttons ohne zugänglichen Namen',
      wcag: ['4.1.2'], severity: 'CRITICAL', url,
      problem: `${emptyButtons.length} sichtbare Bedienelemente ohne Namen (häufig reine Icon-Buttons).`,
      expectation: 'Jedes Bedienelement muss Name, Rolle und Wert an assistive Technik liefern.',
      elements: emptyButtons.map((b) => b.selector), count: emptyButtons.length,
      recommendation: 'aria-label oder visuell verstecktem Text ergänzen (z. B. aria-label="Menü öffnen").',
      rationale: 'Namenlose Bedienelemente werden als "Schaltfläche" vorgelesen und sind damit nicht nutzbar.',
    }));
  }
  if (p.counts.clickableNonInteractive) {
    f.push(F({
      check: 'clickable-nonsemantic', category: 'F. Links/Buttons', title: 'Klickbare Elemente ohne interaktive Semantik',
      wcag: ['2.1.1', '4.1.2'], severity: 'HIGH', url,
      problem: `${p.counts.clickableNonInteractive} Elemente mit onclick-Handler sind weder Button/Link noch mit Rolle und tabindex versehen.`,
      expectation: 'Klickbare Elemente müssen per Tastatur erreichbar und als Bedienelement erkennbar sein.',
      elements: [], count: p.counts.clickableNonInteractive,
      recommendation: '<button> verwenden oder role="button" + tabindex="0" + Tastaturhandler ergänzen.',
    }));
  }

  /* -------------------------------------------------------- G. Formulare */
  const allFields = [...p.forms.flatMap((fo) => fo.fields), ...(p.orphanFields || [])];
  const visFields = allFields.filter((x) => x.visible);
  const unlabelled = visFields.filter((x) => x.unlabelled);
  if (unlabelled.length) {
    f.push(F({
      check: 'form-unlabelled', category: 'G. Formulare', title: 'Formularfelder ohne Beschriftung',
      wcag: ['1.3.1', '3.3.2', '4.1.2'], severity: 'CRITICAL', url,
      problem: `${unlabelled.length} sichtbare Eingabefelder haben keinen zugänglichen Namen.`,
      expectation: 'Jedes Feld braucht ein <label for> oder aria-label/aria-labelledby.',
      elements: unlabelled.map((x) => `${x.selector} (${x.type}${x.name ? ', name=' + x.name : ''})`), count: unlabelled.length,
      recommendation: '<label for="id">Beschriftung</label> ergänzen.',
      rationale: 'Ohne Beschriftung ist nicht erkennbar, welche Eingabe erwartet wird – Formulare werden unbenutzbar.',
    }));
  }
  const phOnly = visFields.filter((x) => x.placeholderOnly);
  if (phOnly.length) {
    f.push(F({
      check: 'form-placeholder-only', category: 'G. Formulare', title: 'Beschriftung nur über placeholder',
      wcag: ['3.3.2', '1.3.1'], severity: 'HIGH', url,
      problem: `${phOnly.length} Felder werden ausschliesslich über das placeholder-Attribut beschriftet.`,
      expectation: 'Placeholder ersetzt kein Label – er verschwindet bei Eingabe und hat meist zu wenig Kontrast.',
      elements: phOnly.map((x) => `${x.selector}: "${x.accName}"`), count: phOnly.length,
      recommendation: 'Sichtbares <label> ergänzen; Placeholder nur als zusätzliches Beispiel nutzen.',
    }));
  }
  const titleOnly = visFields.filter((x) => x.titleOnly);
  if (titleOnly.length) {
    f.push(F({
      check: 'form-title-only', category: 'G. Formulare', title: 'Beschriftung nur über title-Attribut',
      wcag: ['3.3.2'], severity: 'MEDIUM', url,
      problem: `${titleOnly.length} Felder werden nur über title beschriftet.`,
      expectation: 'title ist auf Touch-Geräten und bei Tastaturnutzung nicht zuverlässig wahrnehmbar.',
      elements: titleOnly.map((x) => x.selector), count: titleOnly.length,
      recommendation: 'Sichtbares Label ergänzen.',
    }));
  }
  const noAutocomplete = visFields.filter((x) => x.autocompleteExpected && !x.autocomplete && !['checkbox', 'radio', 'submit', 'button', 'search'].includes(x.type));
  if (noAutocomplete.length) {
    f.push(F({
      check: 'form-autocomplete', category: 'G. Formulare', title: 'Fehlendes autocomplete bei personenbezogenen Feldern',
      wcag: ['1.3.5'], severity: 'MEDIUM', url,
      problem: `${noAutocomplete.length} Felder erfragen offenbar Nutzerdaten (Name, E-Mail, Telefon, Adresse), ohne autocomplete-Attribut.`,
      expectation: 'Der Eingabezweck muss programmatisch bestimmbar sein (autocomplete="given-name", "email", …).',
      elements: noAutocomplete.map((x) => `${x.selector} (${x.accName || x.name || x.type})`), count: noAutocomplete.length,
      detectable: 'teilautomatisch',
      recommendation: 'Passende autocomplete-Token nach WCAG 1.3.5 / HTML-Spezifikation ergänzen.',
    }));
  }
  const badGroups = p.forms.flatMap((fo) => fo.groups.filter((g) => !g.inFieldset).map((g) => ({ ...g, form: fo.selector })));
  if (badGroups.length) {
    f.push(F({
      check: 'form-group', category: 'G. Formulare', title: 'Zusammengehörige Auswahlfelder ohne Gruppierung',
      wcag: ['1.3.1'], severity: 'MEDIUM', url,
      problem: `${badGroups.length} Radio-/Checkbox-Gruppen ohne <fieldset>/<legend> bzw. role="group" mit Beschriftung.`,
      expectation: 'Gruppen brauchen eine gemeinsame, programmatisch verknüpfte Beschriftung.',
      elements: badGroups.map((g) => `${g.form} – Gruppe "${g.key}" (${g.count} Optionen)`), count: badGroups.length,
      recommendation: '<fieldset><legend>Gruppenfrage</legend>…</fieldset> verwenden.',
    }));
  }
  const requiredNotMarked = visFields.filter((x) => x.required && !x.requiredMarkedInName);
  if (requiredNotMarked.length) {
    f.push(F({
      check: 'form-required-marking', category: 'G. Formulare', title: 'Pflichtfelder ohne erkennbare Kennzeichnung im Namen',
      wcag: ['3.3.2'], severity: 'LOW', url,
      problem: `${requiredNotMarked.length} Pflichtfelder tragen die Pflichtangabe nicht in der Beschriftung (nur required-Attribut).`,
      expectation: 'Pflichtfelder sollten auch textlich gekennzeichnet sein; eine rein farbliche Markierung genügt nicht (1.4.1).',
      elements: requiredNotMarked.map((x) => `${x.selector}: "${x.accName}"`), count: requiredNotMarked.length,
      detectable: 'teilautomatisch',
      recommendation: 'Kennzeichnung "(Pflichtfeld)" bzw. "*" mit erklärender Legende ergänzen.',
    }));
  }
  const formsNoLive = p.forms.filter((fo) => fo.visible && fo.fields.length > 1 && fo.liveRegions === 0);
  if (formsNoLive.length) {
    f.push(F({
      check: 'form-error-region', category: 'N. Fehlerbehandlung', title: 'Keine Live-Region für Fehlermeldungen erkennbar',
      wcag: ['3.3.1', '4.1.3'], severity: 'MEDIUM', url,
      problem: `${formsNoLive.length} Formulare enthalten keine aria-live-Region bzw. role="alert" für Rückmeldungen.`,
      expectation: 'Fehler müssen als Text beschrieben und assistiver Technik aktiv mitgeteilt werden.',
      elements: formsNoLive.map((fo) => fo.selector), count: formsNoLive.length,
      detectable: 'teilautomatisch',
      recommendation: 'Fehlermeldungen in role="alert" ausgeben, Felder per aria-describedby und aria-invalid verknüpfen, Fokus auf die erste Fehlermeldung setzen.',
      rationale: 'Ob im Fehlerfall tatsächlich zugängliche Meldungen erscheinen, muss durch echtes Absenden manuell geprüft werden.',
    }));
  }
  const pwForms = p.forms.filter((fo) => fo.hasPassword);
  if (pwForms.length) {
    f.push(F({
      check: 'auth-manual', category: 'N. Fehlerbehandlung', title: 'Authentifizierungsprozess vorhanden – manuelle Prüfung nötig',
      wcag: ['3.3.8'], severity: 'MEDIUM', url,
      problem: `${pwForms.length} Formular(e) mit Passwortfeld. Ob der Anmeldeprozess ohne kognitiven Funktionstest (z. B. Captcha, Merken von Codes) auskommt und Einfügen erlaubt, ist automatisiert nicht entscheidbar.`,
      expectation: 'Barrierefreie Authentifizierung: keine erzwungenen Gedächtnis-/Transkriptionsaufgaben, Passwort-Einfügen erlauben.',
      elements: pwForms.map((fo) => fo.selector), count: pwForms.length,
      detectable: 'manuell',
      recommendation: 'Anmeldung mit Passwortmanager, Screenreader und Tastatur durchspielen.',
      rationale: '3.3.8 ist in WCAG 2.2 neu und geht über den derzeit in EN 301 549 V3.2.1 referenzierten Stand (WCAG 2.1) hinaus.',
    }));
  }

  /* ----------------------------------------------------------- A. Kontrast */
  const failing = p.contrast.filter((c) => c.ratio !== null && c.ratio < c.required);
  if (failing.length) {
    const total = failing.reduce((s, c) => s + c.count, 0);
    const worst = [...failing].sort((a, b) => a.ratio - b.ratio);
    f.push(F({
      check: 'contrast-text', category: 'A. Kontrast', title: 'Text mit zu geringem Kontrast',
      wcag: ['1.4.3'], severity: bump('HIGH', total, [25, 5]), url,
      problem: `${failing.length} Farbkombinationen unterschreiten den Mindestkontrast (betroffen: ${total} Textelemente). Schlechtester Wert: ${worst[0].ratio}:1.`,
      expectation: 'Mindestens 4,5:1 für normalen Text, 3:1 für grossen Text (ab 24 px bzw. 18,66 px fett).',
      messwert: `${worst[0].ratio}:1 (schlechtester gemessener Wert)`,
      erwartet: '4,5:1 (normaler Text) bzw. 3:1 (grosser Text)',
      elements: worst.slice(0, 10).map((c) => `${c.ratio}:1 (nötig ${c.required}:1) – Vordergrund ${c.fg} auf ${c.bg}, ${c.fontSize}px/${c.fontWeight} – z. B. ${c.samples[0] ? c.samples[0].selector + ' „' + c.samples[0].text + '“' : ''}`),
      count: total,
      recommendation: 'Farbwerte anpassen, bis das Verhältnis erreicht ist (meist genügt ein dunklerer Textton oder ein hellerer Hintergrund).',
      rationale: 'Betrifft alle Nutzenden mit Sehbeeinträchtigung sowie mobile Nutzung bei Sonnenlicht.',
    }));
  }
  const bgImageText = p.contrast.filter((c) => c.bgImage);
  if (bgImageText.length) {
    f.push(F({
      check: 'contrast-bgimage', category: 'A. Kontrast', title: 'Text auf Bild/Verlauf – Kontrast nicht automatisch berechenbar',
      wcag: ['1.4.3'], severity: 'MEDIUM', url,
      problem: `${bgImageText.reduce((s, c) => s + c.count, 0)} Textelemente liegen auf einem Hintergrundbild oder Farbverlauf.`,
      expectation: 'Auch über Bildern muss der Mindestkontrast an jeder Stelle eingehalten werden.',
      elements: bgImageText.slice(0, 6).map((c) => `${c.samples[0] ? c.samples[0].selector : ''} – Textfarbe ${c.fg}, ${c.fontSize}px`),
      count: bgImageText.reduce((s, c) => s + c.count, 0),
      detectable: 'manuell',
      recommendation: 'Overlay/Abdunklung hinterlegen oder Text auf einheitliche Fläche setzen und den Kontrast punktuell messen.',
    }));
  }
  const nonText = p.nonTextContrast.filter((c) => c.ratio < 3);
  if (nonText.length) {
    f.push(F({
      check: 'contrast-nontext', category: 'A. Kontrast', title: 'Bedienelemente mit zu geringem Kontrast',
      wcag: ['1.4.11'], severity: 'MEDIUM', url,
      problem: `${nonText.length} Bedienelemente (Rahmen/Flächen von Feldern und Buttons) erreichen weniger als 3:1 gegen ihre Umgebung.`,
      expectation: 'Grafische Bedienelemente und ihre Zustände benötigen mindestens 3:1.',
      messwert: `${Math.min(...nonText.map((c) => c.ratio))}:1 (schlechtester gemessener Wert)`,
      erwartet: '3:1',
      elements: nonText.slice(0, 10).map((c) => `${c.selector} – ${c.element}, ${c.boundary} ${c.color} auf ${c.against}: ${c.ratio}:1`),
      count: nonText.length,
      recommendation: 'Rahmen-/Flächenfarben der Bedienelemente kräftiger wählen.',
      rationale: 'Näherungsberechnung: gemessen wird die Elementgrenze gegen den nächsten deckenden Hintergrund.',
    }));
  }

  /* ------------------------------------------------- B. Farbabhängigkeit */
  if (p.colorOnlyLinks.length) {
    f.push(F({
      check: 'color-only-links', category: 'B. Farbabhängigkeit', title: 'Links im Fliesstext nur durch Farbe erkennbar',
      wcag: ['1.4.1'], severity: 'MEDIUM', url,
      problem: `${p.colorOnlyLinks.length} Links innerhalb von Textabsätzen haben weder Unterstreichung noch Rahmen.`,
      expectation: 'Wenn Links allein durch Farbe hervorgehoben werden, braucht es ein zusätzliches nicht-farbliches Merkmal (Unterstreichung) oder mindestens 3:1 Kontrast zum Umgebungstext plus Hervorhebung bei Hover/Fokus.',
      elements: p.colorOnlyLinks.slice(0, 10).map((l) => `${l.selector}: "${l.name}" (${l.color})`),
      count: p.colorOnlyLinks.length,
      detectable: 'teilautomatisch',
      recommendation: 'Links im Textfluss unterstreichen.',
      rationale: 'Für Nutzende mit Farbfehlsichtigkeit sind rein farbig markierte Links nicht erkennbar.',
    }));
  }

  /* ------------------------------------------------------------ H. ARIA */
  if (p.aria.invalidRoles.length) {
    f.push(F({
      check: 'aria-role-invalid', category: 'H. ARIA', title: 'Ungültige ARIA-Rollen',
      wcag: ['4.1.2'], severity: 'HIGH', url,
      problem: `${p.aria.invalidRoles.length} Elemente verwenden Rollen, die es in der ARIA-Spezifikation nicht gibt.`,
      expectation: 'Nur spezifizierte Rollen verwenden.',
      elements: p.aria.invalidRoles.map((r) => `${r.selector}: role="${r.role}"`), count: p.aria.invalidRoles.length,
      recommendation: 'Rollennamen korrigieren oder natives HTML-Element verwenden.',
    }));
  }
  if (p.aria.invalidAttrs.length) {
    f.push(F({
      check: 'aria-attr-invalid', category: 'H. ARIA', title: 'Ungültige ARIA-Attribute',
      wcag: ['4.1.2'], severity: 'MEDIUM', url,
      problem: `${p.aria.invalidAttrs.length} nicht spezifizierte aria-*-Attribute.`,
      expectation: 'Nur definierte ARIA-Attribute verwenden.',
      elements: p.aria.invalidAttrs.map((a) => `${a.selector}: ${a.attr}`), count: p.aria.invalidAttrs.length,
      recommendation: 'Attribute entfernen oder korrigieren.',
    }));
  }
  if (p.aria.brokenRefs.length) {
    f.push(F({
      check: 'aria-ref-broken', category: 'H. ARIA', title: 'ARIA-Verweise zeigen ins Leere',
      wcag: ['1.3.1', '4.1.2'], severity: 'HIGH', url,
      problem: `${p.aria.brokenRefs.length} aria-labelledby/-describedby/-controls verweisen auf nicht vorhandene IDs.`,
      expectation: 'Referenzierte IDs müssen im Dokument existieren.',
      elements: p.aria.brokenRefs.map((r) => `${r.selector}: ${r.attr} → ${r.missing.join(', ')}`), count: p.aria.brokenRefs.length,
      recommendation: 'IDs korrigieren – ins Leere zeigende Verweise löschen den Namen des Elements komplett.',
    }));
  }
  if (p.aria.hiddenFocusable.length) {
    f.push(F({
      check: 'aria-hidden-focusable', category: 'H. ARIA', title: 'Fokussierbare Elemente in aria-hidden-Bereichen',
      wcag: ['1.3.1', '4.1.2'], severity: 'HIGH', url,
      problem: `${p.aria.hiddenFocusable.length} Bereiche sind für assistive Technik ausgeblendet, enthalten aber per Tab erreichbare Elemente.`,
      expectation: 'Was per Tastatur erreichbar ist, muss auch für Screenreader vorhanden sein.',
      elements: p.aria.hiddenFocusable.map((h) => h.selector), count: p.aria.hiddenFocusable.length,
      recommendation: 'Entweder aria-hidden entfernen oder die enthaltenen Elemente per tabindex="-1"/inert aus der Tabfolge nehmen.',
    }));
  }
  if (p.aria.redundantRoles.length) {
    f.push(F({
      check: 'aria-role-redundant', category: 'H. ARIA', title: 'Überflüssige ARIA-Rollen',
      wcag: [], severity: 'LOW', url,
      problem: `${p.aria.redundantRoles.length} Elemente wiederholen ihre native Rolle (z. B. <button role="button">).`,
      expectation: 'Native Semantik nicht doppeln ("No ARIA is better than bad ARIA").',
      elements: p.aria.redundantRoles.map((r) => `${r.selector}: <${r.tag} role="${r.role}">`), count: p.aria.redundantRoles.length,
      recommendation: 'Redundante role-Attribute entfernen.',
      rationale: 'Kein WCAG-Verstoss, aber Wartungs- und Fehlerrisiko.',
    }));
  }
  if (p.duplicateIds.length) {
    f.push(F({
      check: 'duplicate-ids', category: 'H. ARIA', title: 'Mehrfach vergebene IDs',
      wcag: ['1.3.1'], severity: 'LOW', url,
      problem: `${p.duplicateIds.length} IDs kommen mehrfach vor.`,
      expectation: 'IDs müssen eindeutig sein, sonst greifen label[for] und aria-*-Verweise auf das falsche Element.',
      elements: p.duplicateIds.map((d) => `#${d.id} (${d.count}×)`), count: p.duplicateIds.length,
      recommendation: 'IDs eindeutig vergeben.',
      rationale: 'Das frühere Kriterium 4.1.1 Parsing ist in WCAG 2.2 entfallen; relevant bleibt der Einfluss auf Namen und Beziehungen (1.3.1).',
    }));
  }
  if (p.positiveTabindex.length) {
    f.push(F({
      check: 'tabindex-positive', category: 'E. Tastatur', title: 'Positive tabindex-Werte',
      wcag: ['2.4.3'], severity: 'MEDIUM', url,
      problem: `${p.positiveTabindex.length} Elemente verwenden tabindex > 0 und verschieben damit die Tab-Reihenfolge.`,
      expectation: 'Fokusreihenfolge soll der visuellen/DOM-Reihenfolge entsprechen; tabindex sollte 0 oder -1 sein.',
      elements: p.positiveTabindex.map((t) => `${t.selector} (tabindex=${t.tabindex})`), count: p.positiveTabindex.length,
      recommendation: 'DOM-Reihenfolge korrigieren statt tabindex zu erhöhen.',
    }));
  }

  /* --------------------------------------------------------- K. Medien */
  for (const v of p.media.videos) {
    const hasCaptions = v.tracks.some((t) => t.kind === 'captions' || t.kind === 'subtitles');
    if (!hasCaptions) {
      f.push(F({
        check: 'video-captions', category: 'K. Video/Audio', title: 'Video ohne Untertitelspur',
        wcag: ['1.2.2'], severity: 'HIGH', url,
        problem: `<video> ohne <track kind="captions">: ${v.src || v.selector}`,
        expectation: 'Aufgezeichnete Videos mit Ton brauchen Untertitel; zusätzlich ist eine Audiodeskription oder Volltextalternative erforderlich (1.2.3/1.2.5).',
        elements: [v.selector], count: 1, detectable: 'teilautomatisch',
        recommendation: 'Untertiteldatei (VTT) einbinden und Transkript verlinken.',
        rationale: 'Ob das Video Tonspur/Sprache enthält, ist automatisiert nicht sicher feststellbar.',
      }));
    }
    if (!v.controls) {
      f.push(F({
        check: 'video-controls', category: 'K. Video/Audio', title: 'Videoplayer ohne native Bedienelemente',
        wcag: ['2.1.1'], severity: 'MEDIUM', url,
        problem: `<video> ohne controls-Attribut: ${v.selector}`,
        expectation: 'Player müssen vollständig per Tastatur bedienbar sein.',
        elements: [v.selector], count: 1, detectable: 'teilautomatisch',
        recommendation: 'controls setzen oder eigene, tastaturbedienbare Steuerung mit zugänglichen Namen bereitstellen.',
      }));
    }
  }
  const autoplay = p.motion.autoplay.filter((a) => !a.muted);
  if (autoplay.length) {
    f.push(F({
      check: 'media-autoplay', category: 'M. Bewegung', title: 'Automatisch startende Medien mit Ton',
      wcag: ['1.4.2'], severity: 'HIGH', url,
      problem: `${autoplay.length} Medienelemente starten automatisch und sind nicht stummgeschaltet.`,
      expectation: 'Audio, das länger als 3 Sekunden automatisch spielt, braucht eine leicht erreichbare Stopp-/Lautstärkeregelung.',
      elements: autoplay.map((a) => a.selector), count: autoplay.length,
      recommendation: 'Autoplay entfernen oder stummschalten und Bedienelement anbieten.',
    }));
  }
  const untitledIframes = p.media.iframes.filter((i) => i.visible && !i.title && !i.ariaHidden);
  if (untitledIframes.length) {
    f.push(F({
      check: 'iframe-title', category: 'H. ARIA', title: 'iframes ohne Titel',
      wcag: ['4.1.2', '2.4.1'], severity: 'MEDIUM', url,
      problem: `${untitledIframes.length} sichtbare iframes ohne title-Attribut.`,
      expectation: 'Eingebettete Frames brauchen einen beschreibenden Titel.',
      elements: untitledIframes.map((i) => `${i.selector} (${i.kind}: ${i.src.slice(0, 60)})`), count: untitledIframes.length,
      recommendation: 'title="Kurzbeschreibung des Inhalts" ergänzen.',
    }));
  }
  const embeds = p.media.iframes.filter((i) => ['youtube', 'vimeo', 'map', 'captcha', 'consent'].includes(i.kind));
  if (embeds.length) {
    f.push(F({
      check: 'embed-manual', category: 'K. Video/Audio', title: 'Eingebettete Fremdkomponenten – manuelle Prüfung erforderlich',
      wcag: [], severity: 'MEDIUM', url,
      problem: `${embeds.length} eingebettete Komponenten (${[...new Set(embeds.map((e) => e.kind))].join(', ')}). Deren Bedienbarkeit, Untertitel bzw. Alternativen sind von aussen nicht automatisiert bewertbar.`,
      expectation: 'Auch eingebettete Inhalte müssen wahrnehmbar, bedienbar, verständlich und robust sein; für Captchas ist eine nicht-visuelle Alternative nötig (1.1.1).',
      elements: embeds.map((e) => `${e.kind}: ${e.src.slice(0, 80)}`), count: embeds.length,
      detectable: 'manuell',
      recommendation: 'Player-Bedienung, Untertitel und Captcha-Alternativen manuell mit Tastatur und Screenreader prüfen; Kartendienste mit Textalternative (Adresse, Anfahrtsbeschreibung) hinterlegen.',
      rationale: 'Inhalte Dritter, die der Anbieter weder finanziert noch entwickelt noch kontrolliert, sind nach § 1 Abs. 4 Nr. 4 BFSG vom Anwendungsbereich ausgenommen – die Abgrenzung ist im Einzelfall rechtlich zu klären.',
    }));
  }

  /* -------------------------------------------------------- M. Bewegung */
  if (p.motion.marquee.length) {
    f.push(F({
      check: 'motion-marquee', category: 'M. Bewegung', title: 'Blinkende/laufende Inhalte (<marquee>/<blink>)',
      wcag: ['2.2.2'], severity: 'HIGH', url,
      problem: `${p.motion.marquee.length} veraltete Bewegungselemente.`,
      expectation: 'Automatische Bewegung, die länger als 5 Sekunden läuft, muss pausierbar sein.',
      elements: p.motion.marquee.map((m) => m.selector), count: p.motion.marquee.length,
      recommendation: 'Element entfernen und – falls nötig – pausierbare CSS-Animation verwenden.',
    }));
  }
  if (p.motion.infinite.length && !p.motion.prefersReducedMotion) {
    f.push(F({
      check: 'motion-infinite', category: 'M. Bewegung', title: 'Endlos laufende Animationen ohne Reduced-Motion-Unterstützung',
      wcag: ['2.2.2'], severity: 'MEDIUM', url,
      problem: `${p.motion.infinite.length} Elemente mit animation-iteration-count: infinite; im CSS wurde keine prefers-reduced-motion-Abfrage gefunden.`,
      expectation: 'Automatisch startende Bewegung > 5 s muss pausiert/gestoppt oder ausgeblendet werden können.',
      elements: p.motion.infinite.map((m) => `${m.selector} (${m.name}, ${m.duration})`), count: p.motion.infinite.length,
      detectable: 'teilautomatisch',
      recommendation: '@media (prefers-reduced-motion: reduce) { … animation: none } ergänzen und/oder Pause-Schalter anbieten.',
    }));
  }
  const carouselsNoCtl = p.motion.carousels.filter((c) => !c.hasControls);
  if (carouselsNoCtl.length) {
    f.push(F({
      check: 'motion-carousel', category: 'M. Bewegung', title: 'Karussell/Slider ohne erkennbare Bedienelemente',
      wcag: ['2.2.2'], severity: 'MEDIUM', url,
      problem: `${carouselsNoCtl.length} Slider-Komponenten ohne gefundene Pause-/Weiter-Schaltflächen.`,
      expectation: 'Selbstlaufende Slider brauchen eine Pausenfunktion und tastaturbedienbare Steuerung.',
      elements: carouselsNoCtl.map((c) => c.selector), count: carouselsNoCtl.length,
      detectable: 'teilautomatisch',
      recommendation: 'Pause-Button ergänzen, Autoplay abschalten oder erst nach Nutzeraktion starten.',
    }));
  }
  if (p.motion.metaRefresh) {
    f.push(F({
      check: 'meta-refresh', category: 'M. Bewegung', title: 'Automatische Weiterleitung/Aktualisierung per meta refresh',
      wcag: ['2.2.1'], severity: 'HIGH', url,
      problem: `<meta http-equiv="refresh" content="${p.motion.metaRefresh}">`,
      expectation: 'Zeitbegrenzungen müssen abschaltbar, verlängerbar oder anpassbar sein.',
      elements: ['<meta http-equiv="refresh">'], count: 1,
      recommendation: 'Serverseitige Weiterleitung (301/302) statt meta refresh verwenden.',
    }));
  }

  /* ------------------------------------------------------- L. Responsive */
  if (p.viewportMeta && (p.viewportMeta.userScalableNo || (p.viewportMeta.maximumScale && p.viewportMeta.maximumScale < 2))) {
    f.push(F({
      check: 'viewport-zoom', category: 'L. Responsive/Mobil', title: 'Zoom auf Mobilgeräten eingeschränkt',
      wcag: ['1.4.4'], severity: 'HIGH', url,
      problem: `meta viewport: "${p.viewportMeta.content}"`,
      expectation: 'Vergrösserung bis mindestens 200 % muss möglich bleiben.',
      messwert: p.viewportMeta.userScalableNo ? 'user-scalable=no' : `maximum-scale=${p.viewportMeta.maximumScale}`,
      erwartet: 'keine Zoom-Sperre, maximum-scale ≥ 2',
      elements: ['<meta name="viewport">'], count: 1,
      recommendation: 'user-scalable=no und maximum-scale < 2 entfernen.',
    }));
  }

  /* -------------------------------------------------------- Tabellen */
  const badTables = p.tables.filter((t) => t.visible && t.rows > 1 && !t.hasTh && t.role !== 'presentation' && t.role !== 'none');
  if (badTables.length) {
    f.push(F({
      check: 'table-headers', category: 'D. Struktur/Semantik', title: 'Datentabellen ohne Kopfzellen',
      wcag: ['1.3.1'], severity: 'MEDIUM', url,
      problem: `${badTables.length} Tabellen mit mehreren Zeilen ohne <th>.`,
      expectation: 'Datentabellen brauchen <th> (mit scope) und möglichst eine <caption>; Layouttabellen role="presentation".',
      elements: badTables.map((t) => `${t.selector} (${t.rows}×${t.cols})`), count: badTables.length,
      detectable: 'teilautomatisch',
      recommendation: 'Kopfzellen auszeichnen oder – bei reinem Layout – role="presentation" setzen.',
    }));
  }

  /* --------------------------------------------- Zielgrössen (WCAG 2.2) */
  const targets = (p.smallTargets || []).filter((t) => !t.inlineException);
  if (targets.length) {
    f.push(F({
      check: 'target-size', category: 'L. Responsive/Mobil', title: 'Sehr kleine Klick-/Touch-Ziele',
      wcag: ['2.5.8'], severity: 'LOW', url,
      problem: `${targets.length} Bedienelemente sind kleiner als 24 × 24 CSS-Pixel.`,
      expectation: 'Zielgrösse mindestens 24 × 24 px (WCAG 2.2, 2.5.8) bzw. ausreichender Abstand.',
      messwert: `kleinstes Ziel ${Math.min(...targets.map((t) => Math.min(t.width, t.height)))} px`,
      erwartet: '24 × 24 px',
      elements: targets.slice(0, 10).map((t) => `${t.selector} (${t.width}×${t.height}px, "${t.name}")`), count: targets.length,
      recommendation: 'Trefferfläche per padding vergrössern.',
      rationale: '2.5.8 ist in WCAG 2.2 neu und geht über den in EN 301 549 V3.2.1 referenzierten Stand hinaus; für Touch-Bedienung dennoch dringend empfohlen.',
    }));
  }

  /* ---------------------------------------------------- Consent-Layer */
  if (p.consent) {
    const c = p.consent;
    if (!c.role && !c.ariaModal) {
      f.push(F({
        check: 'consent-semantics', category: 'E. Tastatur', title: 'Consent-Layer ohne Dialog-Semantik',
        wcag: ['4.1.2'], severity: 'HIGH', url,
        problem: `Der Cookie-/Consent-Layer (${c.selector}, überdeckt ca. ${c.coverage}% des Viewports) hat weder role="dialog" noch aria-modal.`,
        expectation: 'Modale Overlays brauchen Dialogrolle, zugänglichen Namen, Fokusfang und Rückgabe des Fokus.',
        elements: [c.selector], count: 1,
        recommendation: 'role="dialog" aria-modal="true" mit aria-labelledby setzen, Fokus beim Öffnen in den Dialog legen.',
        rationale: 'Der Consent-Layer ist die erste Hürde vor der gesamten Website – hier scheitern Nutzende sonst sofort.',
      }));
    }
    f.push(F({
      check: 'consent-manual', category: 'E. Tastatur', title: 'Cookie-/Consent-Oberfläche – Bedienbarkeit manuell prüfen',
      wcag: ['2.1.1', '2.1.2'], severity: 'HIGH', url,
      problem: `Consent-Layer erkannt (${c.buttons.length} Bedienelemente${c.hasRejectOption ? '' : ', keine erkennbare Ablehnen-Option auf erster Ebene'}).`,
      expectation: 'Der Layer muss vollständig per Tastatur bedienbar sein, den Fokus halten und die dahinterliegende Seite blockieren.',
      elements: c.buttons.map((b) => `${b.tag}: "${b.name}"`), count: 1,
      detectable: 'manuell',
      recommendation: 'Layer mit Tastatur und Screenreader durchspielen; Kontraste der Buttons prüfen.',
    }));
  }

  return f;
}

/** Wandelt axe-core-Ergebnisse in Befunde (Quelle klar gekennzeichnet). */
export function analyzeAxe(url, axeResult) {
  const f = [];
  if (!axeResult || !axeResult.violations) return f;
  const sevMap = { critical: 'CRITICAL', serious: 'HIGH', moderate: 'MEDIUM', minor: 'LOW' };
  for (const v of axeResult.violations) {
    const ids = wcagFromAxeTags(v.tags);
    f.push(F({
      check: `axe-${v.id}`, category: 'Automatisierte Regelprüfung (axe-core)',
      title: v.help,
      wcag: ids,
      severity: sevMap[v.impact] || 'MEDIUM',
      url,
      problem: `${v.description} (axe-Regel "${v.id}", ${v.nodes.length} betroffene Elemente).`,
      expectation: v.help,
      elements: v.nodes.slice(0, 10).map((n) => `${(n.target || []).join(' ')} – ${(n.failureSummary || '').split('\n').filter(Boolean).slice(1).join(' ').slice(0, 160)}`),
      count: v.nodes.length,
      recommendation: `Details und Lösungswege: ${v.helpUrl}`,
      rationale: ids.length ? '' : 'Diese axe-Regel trägt kein eindeutiges WCAG-A/AA-Tag – WCAG-Zuordnung nicht eindeutig.',
      source: 'axe-core',
    }));
  }
  return f;
}

/** Befunde aus dem Tastatur-Durchlauf. */
export function analyzeKeyboard(url, kb) {
  const f = [];
  if (!kb) return f;
  if (kb.noVisibleFocus && kb.noVisibleFocus.length) {
    f.push(F({
      check: 'focus-invisible', category: 'E. Tastatur', title: 'Kein sichtbarer Fokusindikator',
      wcag: ['2.4.7'], severity: bump('HIGH', kb.noVisibleFocus.length, [10, 3]), url,
      problem: `${kb.noVisibleFocus.length} von ${kb.visited} per Tab erreichten Elementen zeigen bei Fokus keine erkennbare visuelle Änderung (Outline, Schatten, Hintergrund, Rahmen, Unterstreichung).`,
      expectation: 'Der Tastaturfokus muss jederzeit sichtbar sein.',
      messwert: `${kb.noVisibleFocus.length} von ${kb.visited} fokussierten Elementen ohne sichtbare Änderung`,
      erwartet: '0',
      elements: kb.noVisibleFocus.slice(0, 10).map((e) => `${e.selector} ("${e.name}")`),
      count: kb.noVisibleFocus.length,
      recommendation: 'outline nicht entfernen; stattdessen :focus-visible mit kontrastreichem Indikator (mind. 3:1) gestalten.',
      rationale: 'Ohne Fokusindikator ist die Seite ohne Maus praktisch nicht bedienbar.',
    }));
  }
  if (kb.trap) {
    f.push(F({
      check: 'keyboard-trap', category: 'E. Tastatur', title: 'Mögliche Tastaturfalle',
      wcag: ['2.1.2'], severity: 'CRITICAL', url,
      problem: `Der Fokus verblieb ${kb.trap.repeats}× auf demselben Element (${kb.trap.selector}); ein Weiterkommen mit Tab war nicht feststellbar.`,
      expectation: 'Aus jedem Element muss man mit Tastatur wieder herauskommen.',
      elements: [kb.trap.selector], count: 1, detectable: 'teilautomatisch',
      recommendation: 'Fokusmanagement der Komponente korrigieren; manuell mit Tab/Shift+Tab gegenprüfen.',
    }));
  }
  if (kb.modalHold) {
    f.push(F({
      check: 'keyboard-modal-hold', category: 'E. Tastatur',
      title: 'Modaler Layer hält den Tastaturfokus – Seite nicht vollständig prüfbar',
      wcag: [], severity: 'MEDIUM', url,
      problem: `Der Tastaturfokus blieb nach ${kb.modalHold.steps} Tab-Schritten im Overlay ${kb.modalHold.selector} (typischerweise ein Cookie-/Consent-Dialog). Der Fokusfang selbst ist für modale Dialoge erwünscht; der automatisierte Durchlauf der übrigen Seite war dadurch aber nicht möglich (${(kb.unreachable || []).length} Bedienelemente wurden nicht erreicht).`,
      expectation: 'Modale Dialoge dürfen den Fokus halten, müssen aber mit der Tastatur vollständig bedienbar und schliessbar sein; danach muss der Fokus sinnvoll zurückgegeben werden.',
      elements: [kb.modalHold.selector], count: 1, detectable: 'manuell',
      recommendation: 'Consent-Dialog manuell mit Tastatur und Screenreader prüfen (Erreichbarkeit aller Optionen, Escape/Schliessen, Fokusrückgabe). Für einen vollständigen automatisierten Durchlauf den Scan mit gesetztem Consent-Cookie oder in einer Testumgebung ohne Layer wiederholen.',
      rationale: 'Kein WCAG-Verstoss aus dem Fokusfang selbst – der Befund markiert eine Prüflücke.',
    }));
  }
  if (!kb.modalHold && kb.unreachable && kb.unreachable.length) {
    f.push(F({
      check: 'keyboard-unreachable', category: 'E. Tastatur', title: 'Fokussierbare Elemente per Tab nicht erreicht',
      wcag: ['2.1.1'], severity: 'MEDIUM', url,
      problem: `${kb.unreachable.length} sichtbare Bedienelemente wurden innerhalb von ${kb.maxTabs} Tab-Schritten nicht erreicht.`,
      expectation: 'Alle Bedienelemente müssen per Tastatur erreichbar sein.',
      elements: kb.unreachable.slice(0, 10).map((e) => `${e.selector} ("${e.name}")`),
      count: kb.unreachable.length, detectable: 'teilautomatisch',
      recommendation: 'Prüfen, ob die Elemente hinter Aufklapp-Menüs liegen (dann unkritisch) oder tatsächlich unerreichbar sind.',
      rationale: 'Der Lauf bricht nach einer festen Zahl an Tab-Schritten ab; Elemente in geschlossenen Menüs erscheinen hier ebenfalls.',
    }));
  }
  if (kb.orderMismatch && kb.orderMismatch.length) {
    f.push(F({
      check: 'focus-order', category: 'E. Tastatur', title: 'Fokusreihenfolge weicht von der DOM-/Leserichtung ab',
      wcag: ['2.4.3'], severity: 'MEDIUM', url,
      problem: `${kb.orderMismatch.length} Sprünge zwischen Tab-Reihenfolge und Dokumentreihenfolge.`,
      expectation: 'Die Fokusreihenfolge muss der bedeutungstragenden Reihenfolge entsprechen.',
      elements: kb.orderMismatch.slice(0, 8).map((m) => `Schritt ${m.step}: ${m.selector} (DOM-Position ${m.domOrder})`),
      count: kb.orderMismatch.length, detectable: 'teilautomatisch',
      recommendation: 'DOM-Reihenfolge und CSS-Positionierung (order/flex-direction/absolute) angleichen.',
    }));
  }
  if (kb.offscreenFocus && kb.offscreenFocus.length) {
    f.push(F({
      check: 'focus-offscreen', category: 'E. Tastatur', title: 'Fokussierte Elemente ausserhalb des sichtbaren Bereichs',
      wcag: ['2.4.7'], severity: 'MEDIUM', url,
      problem: `${kb.offscreenFocus.length} Elemente lagen nach dem Fokussieren ausserhalb des Viewports.`,
      expectation: 'Das fokussierte Element muss sichtbar sein (bzw. in den Sichtbereich gescrollt werden).',
      elements: kb.offscreenFocus.slice(0, 8).map((e) => e.selector), count: kb.offscreenFocus.length,
      detectable: 'teilautomatisch',
      recommendation: 'Offscreen-Menüs korrekt ausblenden (display:none/inert), statt sie nur zu verschieben.',
    }));
  }
  return f;
}

/** Befunde aus dem Responsive-Durchlauf. */
export function analyzeResponsive(url, viewports) {
  const f = [];
  for (const vp of viewports || []) {
    if (vp.horizontalOverflow) {
      const px = vp.overflowPx != null ? vp.overflowPx : vp.scrollWidth - vp.clientWidth;
      const severity = vp.width > 400 ? 'MEDIUM' : px > 32 ? 'HIGH' : 'MEDIUM';
      f.push(F({
        check: `reflow-${vp.width}`, category: 'L. Responsive/Mobil',
        title: `Horizontales Scrollen bei ${vp.width} px Breite`,
        wcag: vp.width <= 400 ? ['1.4.10'] : [],
        severity, url,
        problem: `Bei ${vp.width}×${vp.height} px ist der Inhalt ${vp.scrollWidth} px breit (${px} px Überstand) – es entsteht horizontales Scrollen.`,
        expectation: 'Inhalte müssen sich bei 320 px Breite (entspricht 400 % Zoom) ohne horizontales Scrollen umbrechen.',
        messwert: `${vp.scrollWidth} px Inhaltsbreite bei ${vp.width} px Viewport`,
        erwartet: `höchstens ${vp.width} px`,
        elements: (vp.overflowing || []).slice(0, 8).map((o) => `${o.selector} (rechte Kante bei ${o.right} px)`),
        count: (vp.overflowing || []).length || 1,
        detectable: (vp.overflowing || []).length ? 'automatisch' : 'teilautomatisch',
        recommendation: 'Feste Breiten/min-width durch flexible Layouts ersetzen, lange Inhalte umbrechen lassen (overflow-wrap, hyphens).',
        rationale: (vp.overflowing || []).length ? '' : 'Kein einzelnes überstehendes Element identifizierbar – Ursache liegt vermutlich in Margins/Paddings oder einem Scroll-Container; visuell nachprüfen.',
      }));
    }
    if (vp.smallTargets && vp.smallTargets.length && vp.width <= 480) {
      f.push(F({
        check: `touch-target-${vp.width}`, category: 'L. Responsive/Mobil',
        title: `Kleine Touch-Ziele bei ${vp.width} px Breite`,
        wcag: ['2.5.8'], severity: 'MEDIUM', url,
        problem: `${vp.smallTargets.length} Bedienelemente unter 24 × 24 px in der mobilen Ansicht.`,
        expectation: 'Mindestens 24 × 24 px (WCAG 2.2); für Touch werden 44 × 44 px empfohlen.',
        elements: vp.smallTargets.slice(0, 8).map((t) => `${t.selector} (${t.width}×${t.height}px)`),
        count: vp.smallTargets.length,
        recommendation: 'Trefferflächen vergrössern.',
        rationale: '2.5.8 ist in WCAG 2.2 neu; EN 301 549 V3.2.1 referenziert WCAG 2.1.',
      }));
    }
  }
  return f;
}

/** Befunde zur Fehlerseite (404). */
export function analyzeErrorPage(base, err) {
  const f = [];
  if (!err) return f;
  if (err.status !== 404) {
    f.push(F({
      check: 'error-404-status', category: 'N. Fehlerbehandlung', title: 'Fehlerseite liefert keinen 404-Status',
      wcag: [], severity: 'LOW', url: err.url,
      problem: `Eine nicht existierende URL antwortet mit HTTP ${err.status}.`,
      expectation: 'Nicht vorhandene Seiten sollten mit 404 antworten (Orientierung für Nutzende und Hilfsmittel).',
      elements: [err.url], count: 1,
      recommendation: 'Korrekten Statuscode ausliefern.',
      rationale: 'Kein WCAG-Erfolgskriterium; Best Practice.',
    }));
  }
  if (err.probe) {
    if (!err.probe.lang) {
      f.push(F({
        check: 'error-404-lang', category: 'N. Fehlerbehandlung', title: 'Fehlerseite ohne Sprachauszeichnung',
        wcag: ['3.1.1'], severity: 'MEDIUM', url: err.url,
        problem: 'Die 404-Seite hat kein lang-Attribut.',
        expectation: 'Auch Fehlerseiten müssen die Anforderungen erfüllen.',
        elements: ['<html>'], count: 1, recommendation: 'lang-Attribut setzen.',
      }));
    }
    const nav = err.probe.landmarks.filter((l) => l.role === 'navigation').length;
    if (!nav) {
      f.push(F({
        check: 'error-404-nav', category: 'N. Fehlerbehandlung', title: 'Fehlerseite ohne Navigation/Rückweg',
        wcag: ['2.4.5'], severity: 'LOW', url: err.url,
        problem: 'Auf der 404-Seite wurde keine Navigation gefunden.',
        expectation: 'Nutzende müssen von der Fehlerseite aus weiterkommen (Navigation, Suche, Startseitenlink).',
        elements: [], count: 1, detectable: 'teilautomatisch',
        recommendation: 'Navigation, Suchfunktion und Link zur Startseite einbinden.',
      }));
    }
  }
  return f;
}

/** Seitenübergreifende Prüfungen (Konsistenz). */
export function analyzeCrossPage(pages) {
  const f = [];
  const withNav = pages.filter((p) => p.probe && p.probe.landmarks.some((l) => l.role === 'navigation'));
  if (pages.length >= 3) {
    const sigs = pages.filter((p) => p.probe).map((p) => ({
      url: p.url,
      sig: p.probe.links.filter((l) => l.inNav && l.name).map((l) => l.name.toLowerCase()).slice(0, 40).join('|'),
    })).filter((s) => s.sig);
    const distinct = new Set(sigs.map((s) => s.sig));
    if (sigs.length >= 3 && distinct.size > Math.max(2, Math.ceil(sigs.length * 0.6))) {
      f.push(F({
        check: 'consistent-navigation', category: 'D. Struktur/Semantik', title: 'Navigation über die Seiten hinweg uneinheitlich',
        wcag: ['3.2.3'], severity: 'MEDIUM', url: pages[0].url,
        problem: `Die Navigationslinks unterscheiden sich auf ${distinct.size} von ${sigs.length} untersuchten Seiten deutlich.`,
        expectation: 'Wiederkehrende Navigation muss in gleicher relativer Reihenfolge erscheinen.',
        elements: sigs.slice(0, 6).map((s) => s.url), count: distinct.size,
        detectable: 'teilautomatisch',
        recommendation: 'Navigationsstruktur vereinheitlichen; Abweichungen prüfen (z. B. Landing-Pages ohne Hauptnavigation).',
      }));
    }
    const titles = pages.filter((p) => p.probe && p.probe.title).map((p) => p.probe.title.trim().toLowerCase());
    const dupTitles = titles.filter((t, i) => titles.indexOf(t) !== i);
    if (dupTitles.length) {
      f.push(F({
        check: 'title-duplicate', category: 'D. Struktur/Semantik', title: 'Mehrere Seiten mit identischem Titel',
        wcag: ['2.4.2'], severity: 'LOW', url: pages[0].url,
        problem: `${new Set(dupTitles).size} Seitentitel kommen mehrfach vor.`,
        expectation: 'Seitentitel sollen den Inhalt der jeweiligen Seite unterscheidbar benennen.',
        elements: [...new Set(dupTitles)].slice(0, 8), count: new Set(dupTitles).size,
        recommendation: 'Titel je Seite individualisieren.',
      }));
    }
  }
  if (withNav.length === 0 && pages.length > 1) {
    f.push(F({
      check: 'nav-missing-global', category: 'D. Struktur/Semantik', title: 'Keine Navigations-Landmarke auf den untersuchten Seiten',
      wcag: ['1.3.1'], severity: 'MEDIUM', url: pages[0].url,
      problem: 'Auf keiner untersuchten Seite wurde <nav> oder role="navigation" gefunden.',
      expectation: 'Navigationsbereiche sollten als Landmarke ausgezeichnet sein.',
      elements: [], count: pages.length,
      recommendation: 'Navigationslisten in <nav> kapseln.',
    }));
  }
  return f;
}
