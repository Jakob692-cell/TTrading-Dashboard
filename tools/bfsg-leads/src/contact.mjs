/**
 * Kontakt- und Firmendaten aus den öffentlich zugänglichen Seiten ziehen
 * (Impressum, Kontaktseite, Startseite).
 *
 * Verarbeitet werden nur Pflichtangaben nach § 5 DDG (Impressum) und offen
 * veröffentlichte Geschäftskontaktdaten. Personenbezogene Angaben (z. B. Name der
 * Inhaberin) sind DSGVO-relevant – siehe references/kaltakquise-recht.md im Skill.
 */

const RE = {
  tel: /(?:tel(?:efon)?|fon|ruf|phone)?[\s:.]*(\+49[\s\-/()]?\d[\d\s\-/()]{5,20}|0\d{2,5}[\s\-/()]?[\d\s\-/()]{4,18})/gi,
  email: /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi,
  plzOrt: /\b(\d{5})\s+([A-ZÄÖÜ][\wäöüß.-]+(?:[ -][A-ZÄÖÜ][\wäöüß.-]+){0,2})/,
  strasse: /\b([A-ZÄÖÜ][\wäöüß.-]*(?:str(?:aße|asse)\.?|weg|platz|allee|gasse|ring|damm|ufer|chaussee)\s?\d+[a-z]?)\b/i,
  rechtsform: /\b(GmbH & Co\.\s?KG|gGmbH|GmbH|UG\s?\(haftungsbeschränkt\)|UG|AG|SE|KG|OHG|GbR|e\.\s?K\.|e\.\s?V\.|eG)\b/,
  register: /\b(HRA|HRB|VR|GnR)\s?\d{1,7}\b/i,
  ustId: /\bDE\s?\d{9}\b/,
  vertreter: /(Geschäftsführer(?:in)?|Geschäftsführung|Vertreten durch|Inhaber(?:in)?|Inhaber\/in|Betreiber(?:in)?)\s*:?\s*([^\n,;|]{3,60})/i,
  handwerk: /\b(Meisterbetrieb|Handwerkskammer|Innung|Handwerksrolle|Meister(?:in)?\b)/i,
  mitarbeiter: /\b(\d{1,4})\s*(?:feste\s*)?(?:Mitarbeiter(?:innen)?|Beschäftigte|Kolleg(?:innen|en)|Angestellte)\b/i,
  team: /\b(unser Team|das Team|Team von)\b/i,
};

const cleanTel = (s) => s.replace(/[^\d+]/g, '').replace(/^0049/, '+49');

/**
 * Im Impressum folgt auf "12345 Musterstadt" oft direkt das nächste Feld
 * ("Telefon", "E-Mail"). Solche Anhängsel abschneiden.
 */
const ORT_STOPP = /^(Telefon|Tel|Fon|Fax|E-?Mail|Mail|Internet|Web|Website|USt|Umsatzsteuer|Steuernummer|Inhaber|Inhaberin|Geschäftsführer|Geschäftsführerin|Vertreten|Handelsregister|Registergericht|Amtsgericht|Öffnungszeiten|Kontakt|Impressum|Deutschland|Germany)\b/i;
function ortBereinigen(ort) {
  const teile = ort.split(/\s+/);
  const behalten = [];
  for (const t of teile) {
    if (ORT_STOPP.test(t)) break;
    behalten.push(t);
  }
  return behalten.join(' ').replace(/[.,;:]$/, '') || null;
}

/** Impressum und Kontaktseite liefern die verlässlichsten Angaben – zuerst auswerten. */
function rank(url = '') {
  if (/impressum|imprint/i.test(url)) return 0;
  if (/kontakt|contact/i.test(url)) return 1;
  if (/datenschutz|privacy/i.test(url)) return 3;
  return 2;
}

function plausibleTel(raw) {
  const d = cleanTel(raw);
  if (d.startsWith('+49')) return d.length >= 9 && d.length <= 17;
  if (d.startsWith('0')) return d.length >= 7 && d.length <= 15;
  return false;
}

/** Sammelt Kontaktdaten aus mehreren geladenen Seiten (Reihenfolge = Priorität). */
export function extractContact(pages) {
  const out = {
    telefon: null, telefonQuelle: null, telefone: [],
    email: null, emails: [],
    strasse: null, plz: null, ort: null,
    rechtsform: null, register: null, ustId: null,
    ansprechpartner: null,
    impressumUrl: null, kontaktUrl: null, datenschutzUrl: null,
    kontaktformular: false,
    handwerksbetrieb: false,
    mitarbeiterHinweis: null,
    barrierefreiheitsseite: null,
  };

  const prio = [...pages].sort((a, b) => rank(a.url) - rank(b.url));
  for (const p of prio) {
    const text = p.text || '';
    const url = p.url;
    if (/impressum|imprint/i.test(url) && !out.impressumUrl) out.impressumUrl = url;
    if (/kontakt|contact/i.test(url) && !out.kontaktUrl) out.kontaktUrl = url;
    if (/datenschutz|privacy/i.test(url) && !out.datenschutzUrl) out.datenschutzUrl = url;
    if (/barrierefrei|accessibility/i.test(url) && !out.barrierefreiheitsseite) out.barrierefreiheitsseite = url;

    // Telefon: bevorzugt aus tel:-Links, sonst aus dem Text
    for (const l of (p.probe && p.probe.links) || []) {
      if (l.href && /^tel:/i.test(l.href)) {
        const t = cleanTel(l.href.replace(/^tel:/i, ''));
        if (plausibleTel(t) && !out.telefone.includes(t)) out.telefone.push(t);
      }
      if (l.href && /^mailto:/i.test(l.href)) {
        const m = l.href.replace(/^mailto:/i, '').split('?')[0].trim().toLowerCase();
        if (/@/.test(m) && !out.emails.includes(m)) out.emails.push(m);
      }
    }
    for (const m of text.matchAll(RE.tel)) {
      const t = cleanTel(m[1]);
      if (plausibleTel(t) && !out.telefone.includes(t)) out.telefone.push(t);
      if (out.telefone.length > 6) break;
    }
    for (const m of text.matchAll(RE.email)) {
      const e = m[0].toLowerCase();
      if (/\.(png|jpe?g|gif|webp|svg)$/i.test(e)) continue;
      if (!out.emails.includes(e)) out.emails.push(e);
      if (out.emails.length > 6) break;
    }

    if (!out.strasse) { const m = RE.strasse.exec(text); if (m) out.strasse = m[1]; }
    if (!out.plz) { const m = RE.plzOrt.exec(text); if (m) { out.plz = m[1]; out.ort = ortBereinigen(m[2]); } }
    if (!out.rechtsform) { const m = RE.rechtsform.exec(text); if (m) out.rechtsform = m[1]; }
    if (!out.register) { const m = RE.register.exec(text); if (m) out.register = m[0]; }
    if (!out.ustId) { const m = RE.ustId.exec(text); if (m) out.ustId = m[0]; }
    if (!out.ansprechpartner) {
      const m = RE.vertreter.exec(text);
      if (m) {
        const kand = m[2].trim().replace(/\s{2,}/g, ' ');
        if (/^[A-ZÄÖÜ][\wäöüß.'-]+(\s+[A-ZÄÖÜ][\wäöüß.'-]+){0,3}$/.test(kand)) out.ansprechpartner = kand;
      }
    }
    if (!out.handwerksbetrieb && RE.handwerk.test(text)) out.handwerksbetrieb = true;
    if (!out.mitarbeiterHinweis) { const m = RE.mitarbeiter.exec(text); if (m) out.mitarbeiterHinweis = `${m[1]} ${m[0].replace(m[1], '').trim()}`; }
    if (!out.kontaktformular) {
      out.kontaktformular = ((p.probe && p.probe.forms) || []).some((f) => {
        const s = JSON.stringify(f.fields || []).toLowerCase();
        return /nachricht|message|betreff|anliegen|textarea/.test(s) || (f.fields || []).some((x) => x.tag === 'textarea');
      });
    }
  }

  out.telefon = out.telefone[0] || null;
  out.telefonQuelle = out.telefon ? (out.impressumUrl || out.kontaktUrl || (pages[0] && pages[0].url)) : null;
  out.email = out.emails.find((e) => /^(info|kontakt|office|mail|buero|büro)@/.test(e)) || out.emails[0] || null;
  return out;
}

/**
 * Grobe Einschätzung, ob es sich um einen Geschäftsbetrieb handelt (Voraussetzung für
 * B2B-Ansprache nach § 7 Abs. 2 Nr. 1 UWG). Im Zweifel: nicht anrufen.
 */
export function istGeschaeftsbetrieb(kontakt, kandidat) {
  const gruende = [];
  if (kontakt.impressumUrl) gruende.push('Impressum vorhanden (§ 5 DDG-Pflicht für geschäftsmäßige Dienste)');
  if (kontakt.rechtsform) gruende.push(`Rechtsform erkannt: ${kontakt.rechtsform}`);
  if (kontakt.register) gruende.push(`Registereintrag: ${kontakt.register}`);
  if (kontakt.ustId) gruende.push('USt-IdNr. angegeben');
  if (kontakt.handwerksbetrieb) gruende.push('Hinweis auf Handwerksbetrieb/Kammerzugehörigkeit');
  if (kandidat.osmId) gruende.push(`in OpenStreetMap als Betrieb erfasst (${kandidat.branche})`);
  return { istBetrieb: gruende.length >= 2, gruende };
}
