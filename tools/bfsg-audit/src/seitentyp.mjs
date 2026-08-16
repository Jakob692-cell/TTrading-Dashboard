/**
 * Klassifizierung von URLs nach Seitentyp.
 *
 * Grundlage für zwei Dinge: die Stichprobenpriorität beim Crawlen (funktional begründet,
 * nicht zufällig) und die Zuordnung jedes Befundes zu einem Seitentyp im Bericht.
 *
 * Die Erkennung stützt sich auf URL-Muster und – falls vorhanden – auf Merkmale der
 * geladenen Seite (Passwortfeld, Warenkorb-Formular, Zahlungsbegriffe).
 */

const MUSTER = [
  ['Checkout', /(checkout|kasse|zur-kasse|bestellabschluss|payment|zahlung|bezahlen)/i, 95],
  ['Warenkorb', /(warenkorb|cart|basket|einkaufswagen)/i, 90],
  ['Buchung', /(buchen|booking|termin|reservier|anfrage-senden|jetzt-buchen)/i, 88],
  ['Login', /(login|anmelden|signin|sign-in|einloggen)/i, 85],
  ['Registrierung', /(registrier|signup|sign-up|konto-erstellen|neukunde)/i, 84],
  ['Kundenkonto', /(mein-konto|kundenkonto|account|profil|dashboard)/i, 80],
  ['Kontakt', /(kontakt|contact|ansprechpartner)/i, 78],
  ['Barrierefreiheit', /(barrierefrei|accessibility|erklaerung-zur-barrierefreiheit)/i, 76],
  ['Produktseite', /(produkt|product|artikel|p\/|shop\/.+\/)/i, 70],
  ['Dienstleistungsseite', /(leistung|service|angebot|dienstleistung|behandlung|kurse?)/i, 68],
  ['Suche', /(suche|search|\?s=|\?q=)/i, 60],
  ['Hilfe', /(hilfe|faq|support|service\/)/i, 58],
  ['AGB', /(agb|terms|geschaeftsbedingungen)/i, 55],
  ['Widerruf', /(widerruf|withdrawal|rueckgabe)/i, 54],
  ['Datenschutz', /(datenschutz|privacy)/i, 52],
  ['Impressum', /(impressum|imprint|legal-notice)/i, 50],
  ['Blog/News', /(blog|news|aktuelles|presse|magazin)/i, 30],
  ['Dokument', /\.(pdf|docx?|xlsx?|pptx?)(\?|#|$)/i, 40],
];

/** Bestimmt den Seitentyp aus URL und – wenn vorhanden – Seiteninhalt. */
export function seitentyp(url, probe) {
  let pfad;
  try {
    const u = new URL(url);
    pfad = u.pathname + u.search;
    if (pfad === '/' || pfad === '' || /^\/(index|home|start)\.[a-z]{2,5}$/i.test(pfad)) return 'Startseite';
  } catch {
    pfad = url || '';
  }

  if (probe) {
    const formulare = probe.forms || [];
    if (formulare.some((f) => f.hasPassword)) {
      return /registrier|signup|konto-erstellen/i.test(pfad) ? 'Registrierung' : 'Login';
    }
    const felder = JSON.stringify(formulare).toLowerCase();
    if (/\b(iban|kreditkarte|card-number|cardnumber|cvc|paypal)\b/.test(felder)) return 'Checkout';
  }

  let treffer = null;
  for (const [name, re, gewicht] of MUSTER) {
    if (re.test(pfad) && (!treffer || gewicht > treffer.gewicht)) treffer = { name, gewicht };
  }
  return treffer ? treffer.name : 'Inhaltsseite';
}

/** Priorität für die Stichprobe – höher wird früher geprüft. */
export function stichprobenPrioritaet(url, probe) {
  const typ = seitentyp(url, probe);
  const rang = {
    Startseite: 100, Checkout: 95, Warenkorb: 90, Buchung: 88, Login: 85, Registrierung: 84,
    Kundenkonto: 80, Kontakt: 78, Barrierefreiheit: 76, Produktseite: 70, Dienstleistungsseite: 68,
    Suche: 60, Hilfe: 58, AGB: 55, Widerruf: 54, Datenschutz: 52, Impressum: 50,
    Dokument: 40, 'Blog/News': 30, Inhaltsseite: 35,
  };
  let tiefe = 0;
  try { tiefe = (new URL(url).pathname.match(/\//g) || []).length; } catch { /* egal */ }
  return (rang[typ] || 35) - tiefe;
}

/** Zählt die geprüften Seitentypen – für die Qualitätskontrolle im Bericht. */
export function typenUebersicht(seiten) {
  const zaehler = {};
  for (const s of seiten) {
    const t = s.seitentyp || 'Inhaltsseite';
    zaehler[t] = (zaehler[t] || 0) + 1;
  }
  return zaehler;
}

/** Seitentypen, deren Fehlen im Bericht als Prüflücke ausgewiesen wird. */
export const KRITISCHE_TYPEN = ['Startseite', 'Kontakt', 'Impressum', 'Login', 'Warenkorb', 'Checkout', 'Buchung', 'Barrierefreiheit'];
