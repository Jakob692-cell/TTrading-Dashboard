/**
 * Kategorie J – Dokumente: heuristische PDF-Analyse.
 *
 * Geprüft wird, was sich ohne vollständigen PDF-Parser zuverlässig feststellen lässt:
 * Verschlüsselung, Tagging (/StructTreeRoot, /MarkInfo), Dokumentsprache (/Lang),
 * Titel-Metadaten, Vorhandensein von Textfonts (Indiz gegen ein reines Scan-PDF) und
 * Formularfelder (/AcroForm). Objekt-Streams werden dafür entpackt.
 *
 * Alles Weitere (Lesereihenfolge, Qualität der Alternativtexte, Tabellenstruktur,
 * Kontraste im Dokument) ist nur manuell bzw. mit einem PDF/UA-Prüfwerkzeug bewertbar
 * und wird entsprechend als manuelle Prüfung ausgewiesen.
 */
import zlib from 'node:zlib';
import { fetchRaw } from './browser.mjs';

function inflateStreams(buf, maxBytes = 6 * 1024 * 1024) {
  let out = '';
  let idx = 0;
  let produced = 0;
  while (produced < maxBytes) {
    const s = buf.indexOf('stream', idx);
    if (s === -1) break;
    let start = s + 6;
    if (buf[start] === 0x0d) start++;
    if (buf[start] === 0x0a) start++;
    const e = buf.indexOf('endstream', start);
    if (e === -1) break;
    const chunk = buf.subarray(start, e);
    idx = e + 9;
    if (chunk.length < 4 || chunk.length > 4 * 1024 * 1024) continue;
    try {
      const inflated = zlib.inflateSync(chunk);
      out += inflated.toString('latin1');
      produced += inflated.length;
    } catch { /* nicht Flate-kodiert oder beschädigt – überspringen */ }
  }
  return out;
}

export async function analyzePdf(url, { dispatcher, maxBytes = 12 * 1024 * 1024 } = {}) {
  const doc = { url, type: 'pdf', ok: false, checks: {}, notes: [] };
  let res;
  try {
    res = await fetchRaw(url, { dispatcher, timeout: 45000 });
  } catch (e) {
    doc.error = `Nicht abrufbar: ${e.message}`;
    return doc;
  }
  doc.status = res.status;
  doc.bytes = res.body.length;
  if (res.status >= 400) { doc.error = `HTTP ${res.status}`; return doc; }
  if (res.body.length > maxBytes) doc.notes.push(`Sehr grosse Datei (${Math.round(res.body.length / 1024 / 1024)} MB) – nur teilweise analysiert.`);

  const buf = res.body.subarray(0, maxBytes);
  const raw = buf.toString('latin1');
  if (!raw.startsWith('%PDF-')) { doc.error = 'Keine gültige PDF-Signatur'; return doc; }
  doc.version = raw.slice(5, 8);
  const text = raw + inflateStreams(buf);

  const has = (re) => re.test(text);
  doc.ok = true;
  doc.checks = {
    encrypted: has(/\/Encrypt\b/),
    tagged: has(/\/StructTreeRoot\b/),
    markInfoMarked: /\/MarkInfo\s*<<[^>]*\/Marked\s+true/i.test(text) || /\/Marked\s+true/.test(text),
    lang: (/\/Lang\s*\(([^)]{2,12})\)/.exec(text) || [])[1] || null,
    title: (/\/Title\s*\(([^)]{1,120})\)/.exec(text) || [])[1] || (/<dc:title>[\s\S]{0,200}?<rdf:li[^>]*>([^<]{1,120})</.exec(text) || [])[1] || null,
    hasFonts: has(/\/(Type\s*\/Font|FontFile\d?|BaseFont)/),
    hasImages: has(/\/Subtype\s*\/Image/),
    acroForm: has(/\/AcroForm\b/),
    hasAltText: has(/\/Alt\s*\(/),
    hasHeadingTags: /\/(H1|H2|H3)\b/.test(text),
    hasTableTags: /\/(Table|TR|TD|TH)\b/.test(text),
    pageCount: (/\/Count\s+(\d+)/.exec(text) || [])[1] || null,
    displayDocTitle: /\/DisplayDocTitle\s+true/.test(text),
  };
  doc.likelyScanned = !doc.checks.hasFonts && doc.checks.hasImages;
  return doc;
}

/** Erzeugt aus der PDF-Analyse Befunde im gleichen Format wie analyze.mjs. */
export function pdfFindings(doc, sourcePage) {
  const f = [];
  const base = {
    category: 'J. Dokumente',
    url: doc.url,
    source: 'PDF-Heuristik',
  };
  const mk = (o) => f.push({ key: `${o.check}-${doc.url}`, count: 1, elements: [doc.url], ...base, ...o });

  if (doc.error) {
    mk({
      check: 'pdf-unreadable', title: 'PDF nicht analysierbar', wcag: [], severity: 'LOW',
      problem: `${doc.error} (verlinkt auf ${sourcePage || 'unbekannter Seite'}).`,
      expectation: 'Verlinkte Dokumente müssen abrufbar und barrierefrei sein.',
      detectable: 'manuell', recommendation: 'Verfügbarkeit prüfen und Dokument manuell bewerten.',
    });
    return f;
  }
  if (doc.checks.encrypted) {
    mk({
      check: 'pdf-encrypted', title: 'PDF ist verschlüsselt/geschützt', wcag: ['1.1.1'], severity: 'MEDIUM',
      problem: 'Das Dokument ist verschlüsselt; Hilfsmittelzugriff kann eingeschränkt sein.',
      expectation: 'Schutzeinstellungen dürfen den Zugriff durch Screenreader nicht verhindern.',
      detectable: 'teilautomatisch', recommendation: 'Berechtigung "Textzugriff für Hilfsmittel" freigeben.',
    });
  }
  if (doc.likelyScanned) {
    mk({
      check: 'pdf-scanned', title: 'PDF enthält vermutlich nur Scans ohne Textebene', wcag: ['1.1.1', '1.4.5'], severity: 'CRITICAL',
      problem: 'Es wurden Bilder, aber keine eingebetteten Schriften gefunden – typisch für gescannte Dokumente.',
      expectation: 'Inhalte müssen als echter Text vorliegen (kein Bild von Text).',
      detectable: 'teilautomatisch', recommendation: 'Dokument neu aus der Quelle exportieren oder OCR + Tagging durchführen.',
    });
  } else if (!doc.checks.tagged) {
    mk({
      check: 'pdf-untagged', title: 'PDF ohne Tag-Struktur', wcag: ['1.3.1'], severity: 'HIGH',
      problem: 'Kein /StructTreeRoot gefunden – das Dokument ist vermutlich nicht getaggt.',
      expectation: 'Barrierefreie PDFs brauchen eine Tag-Struktur (Überschriften, Absätze, Listen, Tabellen) gemäss PDF/UA.',
      detectable: 'teilautomatisch', recommendation: 'Dokument getaggt exportieren (Word: "Barrierefreiheit prüfen" + PDF/UA-Export) oder nachträglich taggen.',
    });
  }
  if (doc.checks.tagged && !doc.checks.hasHeadingTags) {
    mk({
      check: 'pdf-no-headings', title: 'Getaggtes PDF ohne Überschriften-Tags', wcag: ['1.3.1', '2.4.6'], severity: 'MEDIUM',
      problem: 'Es wurden keine H1/H2/H3-Tags gefunden.',
      expectation: 'Dokumentstruktur mit Überschriftenebenen.',
      detectable: 'teilautomatisch', recommendation: 'Absatzformate/Überschriften in der Quelldatei verwenden und neu exportieren.',
    });
  }
  if (!doc.checks.lang) {
    mk({
      check: 'pdf-no-lang', title: 'PDF ohne Dokumentsprache', wcag: ['3.1.1'], severity: 'MEDIUM',
      problem: 'Kein /Lang-Eintrag gefunden.',
      expectation: 'Dokumentsprache muss gesetzt sein.',
      detectable: 'teilautomatisch', recommendation: 'Dokumentsprache in den Dateieigenschaften setzen.',
    });
  }
  if (!doc.checks.title) {
    mk({
      check: 'pdf-no-title', title: 'PDF ohne Titel-Metadatum', wcag: ['2.4.2'], severity: 'LOW',
      problem: 'Kein Titel in den Dokument-Metadaten gefunden.',
      expectation: 'Titel setzen und Anzeige des Titels statt des Dateinamens aktivieren.',
      detectable: 'teilautomatisch', recommendation: 'Titel in den Dateieigenschaften pflegen, DisplayDocTitle aktivieren.',
    });
  }
  if (doc.checks.acroForm) {
    mk({
      check: 'pdf-form', title: 'PDF-Formular – manuelle Prüfung erforderlich', wcag: ['1.3.1', '3.3.2'], severity: 'MEDIUM',
      problem: 'Das Dokument enthält Formularfelder (/AcroForm).',
      expectation: 'Formularfelder brauchen Beschriftungen (Tooltip/TU), sinnvolle Tab-Reihenfolge und Fehlerhinweise.',
      detectable: 'manuell', recommendation: 'Felder mit Beschriftung versehen und Ausfüllen mit Screenreader testen; alternativ ein zugängliches HTML-Formular anbieten.',
    });
  }
  if (doc.checks.tagged && doc.checks.hasImages && !doc.checks.hasAltText) {
    mk({
      check: 'pdf-no-alt', title: 'Bilder im PDF ohne Alternativtexte', wcag: ['1.1.1'], severity: 'HIGH',
      problem: 'Das PDF enthält Bilder, es wurden aber keine /Alt-Einträge gefunden.',
      expectation: 'Informative Abbildungen brauchen Alternativtexte, dekorative werden als Artefakt markiert.',
      detectable: 'teilautomatisch', recommendation: 'Alternativtexte im Quelldokument pflegen und neu exportieren.',
    });
  }
  mk({
    check: 'pdf-manual', title: 'PDF: Lesereihenfolge, Tabellen und Kontraste manuell prüfen', wcag: [], severity: 'MEDIUM',
    problem: `Struktur-Feinheiten des Dokuments (${doc.checks.pageCount ? doc.checks.pageCount + ' Seiten, ' : ''}${Math.round((doc.bytes || 0) / 1024)} KB) sind automatisiert nicht bewertbar.`,
    expectation: 'PDF/UA-konforme Lesereihenfolge, korrekte Tabellenköpfe, ausreichende Kontraste, sinnvolle Alternativtexte.',
    detectable: 'manuell',
    recommendation: 'Mit PAC (PDF Accessibility Checker) prüfen und mit Screenreader stichprobenartig lesen; besser: zentrale Inhalte zusätzlich als HTML anbieten.',
  });
  return f;
}
