/**
 * Bewertung eines qualifizierten Leads: Score, Segment, Ausschlussgründe,
 * Gesprächsaufhänger und die Dokumentation der mutmaßlichen Einwilligung
 * (§ 7 Abs. 2 Nr. 1 UWG) für den B2B-Telefonkontakt.
 *
 * Wichtig: Alle Aussagen bleiben Einschätzungen. Es wird nirgends behauptet, ein Betrieb
 * verstosse gegen das BFSG – weder in der Liste noch im Gesprächsleitfaden.
 */

const SEV_GEWICHT = { CRITICAL: 9, HIGH: 5, MEDIUM: 1.5, LOW: 0.4 };

/** Branchen, bei denen Verbraucherverträge über die Website besonders naheliegen. */
const BRANCHEN_RELEVANZ = [
  [/tourism=(hotel|guest_house|apartment|hostel|chalet)/, 12, 'Beherbergung mit Online-Buchung'],
  [/amenity=(theatre|cinema|arts_centre|events_venue)/, 12, 'Ticketverkauf'],
  [/shop=(travel_agency)/, 12, 'Reisevermittlung'],
  [/office=(insurance|financial_advisor|estate_agent)/, 10, 'Vermittlung/Abschluss online'],
  [/amenity=(doctors|dentist|veterinary|driving_school)/, 8, 'Terminbuchung für Verbraucher'],
  [/amenity=(restaurant|cafe|bar|fast_food)/, 7, 'Tischreservierung/Bestellung'],
  [/shop=/, 7, 'Einzelhandel mit möglichem Onlineverkauf'],
  [/craft=/, 5, 'Handwerk mit Angebots-/Terminanfragen'],
  [/healthcare=|leisure=/, 5, 'Verbraucherleistungen mit Onlineprozessen'],
];

/** Reihenfolge der Befunde, die sich am Telefon gut erklären lassen. */
const PITCH_REIHENFOLGE = [
  ['form-unlabelled', 'Formularfelder ohne Beschriftung – Screenreader sagen dort nur „Eingabefeld“, Kundinnen und Kunden können das Formular nicht ausfüllen'],
  ['button-empty', 'Schaltflächen ohne Namen (z. B. Menü- oder Such-Icons) – sie werden nur als „Schaltfläche“ vorgelesen'],
  ['contrast-text', 'Textfarben mit zu wenig Kontrast – bei Sehschwäche oder Sonnenlicht auf dem Handy kaum lesbar'],
  ['img-alt-missing', 'Bilder ohne Alternativtext – der Inhalt fehlt für blinde Nutzerinnen und Nutzer komplett'],
  ['focus-invisible', 'Kein sichtbarer Fokusrahmen – wer die Website mit der Tastatur bedient, sieht nicht, wo er gerade ist'],
  ['viewport-zoom', 'Zoom auf dem Handy gesperrt – Vergrössern ist nicht möglich'],
  ['reflow-320', 'Auf schmalen Handys muss seitlich gescrollt werden'],
  ['link-empty', 'Links ohne erkennbaren Text'],
  ['form-placeholder-only', 'Formularfelder nur mit Platzhaltertext beschriftet – die Beschriftung verschwindet beim Tippen'],
  ['aria-hidden-focusable', 'Für Screenreader ausgeblendete Bereiche, die per Tastatur trotzdem angesprungen werden'],
  ['video-captions', 'Videos ohne Untertitel'],
  ['lang-missing', 'Fehlende Sprachauszeichnung – Screenreader lesen deutsche Texte mit englischer Aussprache vor'],
  ['link-generic', 'Linktexte wie „hier“ oder „mehr“ – ohne Kontext unverständlich'],
  ['table-headers', 'Tabellen ohne Kopfzellen'],
  ['skiplink-missing', 'Kein Sprunglink zum Inhalt – die Navigation muss jedes Mal durchgetabbt werden'],
];

const OEFFENTLICH = /(\.bund\.de|\.bayern\.de|\.nrw\.de|gemeinde|stadt-|stadtverwaltung|landkreis|kreisverwaltung|schule|hochschule|universitaet|universität|kirche|caritas|diakonie)/i;

export function bewerteLead(lead, kontakt, { doNotCall = [] } = {}) {
  const b = { punkte: {}, ausschluss: [], flags: [] };
  const befunde = lead.befunde || [];
  const kontext = lead.kontext;

  /* --- 1. BFSG-Relevanz (max. 40) ---------------------------------------- */
  let relevanz = 0;
  const relevanzGruende = [];
  const sig = (kontext && kontext.signals) || {};
  const treffer = (k) => sig[k] && sig[k].found;
  if (treffer('shop') || treffer('order')) { relevanz += 18; relevanzGruende.push('Shop-/Bestellfunktion erkennbar'); }
  if (treffer('booking')) { relevanz += 12; relevanzGruende.push('Buchung/Termin online'); }
  if (treffer('account')) { relevanz += 6; relevanzGruende.push('Kundenkonto/Login'); }
  if (treffer('payment')) { relevanz += 8; relevanzGruende.push('Zahlungsfunktionen'); }
  if (treffer('subscription')) { relevanz += 4; relevanzGruende.push('Abo/Mitgliedschaft'); }
  if (treffer('b2c')) { relevanz += 4; relevanzGruende.push('Verbraucheransprache im Text'); }
  for (const [re, pkt, grund] of BRANCHEN_RELEVANZ) {
    if (re.test(lead.branche || '')) { relevanz += pkt; relevanzGruende.push(`Branche: ${grund}`); break; }
  }
  if (treffer('b2b') && !treffer('b2c')) { relevanz -= 10; b.flags.push('Hinweise auf reine B2B-Ausrichtung – BFSG-Relevanz fraglich'); }
  b.punkte.bfsgRelevanz = Math.max(0, Math.min(40, Math.round(relevanz)));

  /* --- 2. Gefundene Barrieren (max. 40) ---------------------------------- */
  const zaehler = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
  for (const f of befunde) zaehler[f.severity] = (zaehler[f.severity] || 0) + 1;
  let barrieren = Object.entries(zaehler).reduce((s, [k, n]) => s + n * (SEV_GEWICHT[k] || 0), 0);
  if (!kontakt.barrierefreiheitsseite) { barrieren += 6; b.flags.push('Keine Erklärung zur Barrierefreiheit gefunden'); }
  b.punkte.barrieren = Math.max(0, Math.min(40, Math.round(barrieren)));
  b.befundZaehler = zaehler;

  /* --- 3. Ansprechbarkeit (max. 20) -------------------------------------- */
  let fit = 0;
  if (kontakt.telefon) fit += 9;
  if (kontakt.ansprechpartner) fit += 4;
  if (!lead.ketteVermutet) fit += 4;
  if (kontakt.handwerksbetrieb || /GbR|e\.\s?K\.|UG|Einzel/i.test(kontakt.rechtsform || '')) fit += 3;
  b.punkte.ansprechbarkeit = Math.min(20, fit);

  /* --- Ausschlüsse und Warnhinweise -------------------------------------- */
  const host = (lead.host || '').toLowerCase();
  if (doNotCall.some((e) => host === e || host.endsWith(`.${e}`) || (kontakt.telefon && kontakt.telefon === e))) {
    b.ausschluss.push('Auf der Sperrliste (do-not-call)');
  }
  // Zugriffsschutz ist kein Ausschlussgrund: Der Betrieb bleibt ein gültiger Lead,
  // nur der Aufhänger muss von Hand geholt werden. Ausgeschlossen wird nur, was
  // wirklich nicht existiert.
  const zugriffsschutz = !lead.erreichbar && /403|robots\.txt|Bot-Schutz|429/i.test(lead.fehler || '');
  if (!lead.erreichbar) {
    if (zugriffsschutz) {
      b.flags.push('Website automatisiert nicht prüfbar (Zugriffsschutz/robots.txt) – vor dem Anruf selbst ansehen, es liegt kein geprüfter Aufhänger vor');
    } else {
      b.ausschluss.push(lead.fehler || 'Website nicht erreichbar – keine belastbare Grundlage');
    }
  }
  if (!kontakt.telefon) b.flags.push('Keine Telefonnummer gefunden – Kaltanruf nicht möglich');
  if (kontakt.telefon && /^(00(?!49)|\+(?!49))/.test(kontakt.telefon)) {
    b.flags.push(`Telefonnummer ist keine deutsche Rufnummer (${kontakt.telefon}) – vermutlich fehlerhafter Verzeichniseintrag, vor dem Anruf prüfen`);
  }
  if (kontakt.telefon && kontakt.telefon.replace(/\D/g, '').length < 7) {
    b.flags.push(`Telefonnummer wirkt unvollständig (${kontakt.telefon}) – vor dem Anruf prüfen`);
  }
  if (kontakt.telefon && /^(\+49\s?1[5-7]|01[5-7])/.test(kontakt.telefon)) {
    b.flags.push('Mobilnummer – vor dem Anruf sicherstellen, dass es ein Geschäftsanschluss ist (sonst Verbraucheranruf, § 7 Abs. 2 Nr. 1 UWG)');
  }
  if (OEFFENTLICH.test(host) || OEFFENTLICH.test(lead.name || '')) {
    b.flags.push('Möglicherweise öffentliche Stelle oder gemeinnützige Einrichtung – dann gelten BITV 2.0/BGG bzw. Landesrecht, nicht das BFSG');
  }
  if (kontakt.barrierefreiheitsseite) {
    b.flags.push(`Erklärung/Seite zur Barrierefreiheit vorhanden (${kontakt.barrierefreiheitsseite}) – vor dem Anruf ansehen`);
  }
  if (lead.erreichbar && b.befundZaehler.CRITICAL + b.befundZaehler.HIGH === 0) {
    b.flags.push('Keine schweren Befunde im Kurzcheck – als Lead nur schwach geeignet');
  }

  /* --- Score und Segment -------------------------------------------------- */
  const score = b.punkte.bfsgRelevanz + b.punkte.barrieren + b.punkte.ansprechbarkeit;
  b.score = b.ausschluss.length ? 0 : score;
  b.segment = b.ausschluss.length ? 'ausgeschlossen'
    : score >= 70 ? 'A' : score >= 50 ? 'B' : score >= 30 ? 'C' : 'D';
  b.relevanzGruende = relevanzGruende;

  /* --- Gesprächsaufhänger aus echten Befunden ---------------------------- */
  const gesehen = new Set();
  const aufhaenger = [];
  for (const [check, klartext] of PITCH_REIHENFOLGE) {
    const f = befunde.find((x) => x.check.startsWith(check) && !gesehen.has(check));
    if (!f) continue;
    gesehen.add(check);
    aufhaenger.push({
      check, klartext,
      belegUrl: f.url,
      anzahl: f.count,
      wcag: f.wcag,
      severity: f.severity,
    });
    if (aufhaenger.length >= 3) break;
  }
  b.aufhaenger = aufhaenger;

  /* --- Dokumentation der mutmasslichen Einwilligung (§ 7 UWG) ------------ */
  b.mutmasslicheEinwilligung = {
    geprueftAm: new Date().toISOString().slice(0, 10),
    sachlicherZusammenhang: [
      lead.name ? `Angerufen wird der Gewerbebetrieb „${lead.name}“ unter der öffentlich im Impressum/Verzeichnis angegebenen Geschäftsnummer.` : 'Angerufen wird ein Gewerbebetrieb unter der öffentlich angegebenen Geschäftsnummer.',
      `Das Angebot (Prüfung und Verbesserung der Website-Barrierefreiheit) betrifft unmittelbar den Geschäftsbetrieb: Die Website ist Vertriebs- bzw. Kontaktkanal des Betriebs.`,
      relevanzGruende.length ? `Konkreter Anlass: ${relevanzGruende.join('; ')}.` : 'Konkreter Anlass: Website als Kundenkanal.',
      aufhaenger.length ? `Im öffentlich zugänglichen Kurzcheck wurden konkrete technische Mängel festgestellt (${aufhaenger.map((a) => a.check).join(', ')}).` : 'Im Kurzcheck wurden keine schweren Mängel festgestellt – Anruf sachlich schwächer begründbar.',
    ],
    einschraenkung: 'Die mutmaßliche Einwilligung ist eine Einzelfallabwägung. Kein Anruf bei Privatanschlüssen, kein Anruf nach Widerspruch, keine Werbe-E-Mail oder -Fax ohne vorherige ausdrückliche Einwilligung (§ 7 Abs. 2 Nr. 2 UWG).',
  };

  return b;
}

/** Kurzer, ehrlicher Aufhänger-Satz für die erste halbe Minute am Telefon. */
export function pitchSatz(lead, bewertung) {
  const a = bewertung.aufhaenger;
  if (!a.length) {
    return `Kurzcheck der Website ${lead.host} ohne schwere Befunde – nur anrufen, wenn Interesse an einer vollständigen Prüfung besteht.`;
  }
  return `Ich habe mir ${lead.host} öffentlich angesehen: ${a[0].klartext}. Das betrifft ${a[0].anzahl} Stelle(n) auf ${new URL(a[0].belegUrl).pathname || '/'}.`;
}
