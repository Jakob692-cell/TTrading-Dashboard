/**
 * Phase 2 – Signale für die BFSG-Einordnung.
 *
 * Dieses Modul sammelt ausschliesslich *Indizien* aus der Website (Shop-, Konto-,
 * Zahlungs-, Buchungs-, B2B-/B2C-Hinweise, Pflichtseiten, Rechtsform aus dem Impressum).
 * Es trifft bewusst KEINE rechtliche Bewertung – die Einordnung erfolgt im Bericht durch
 * die Auditorin/den Auditor bzw. den Skill (Phase 6) und bleibt eine Einschätzung.
 */

const SIGNALS = [
  ['shop', 'Online-Shop / Warenkorb', /(warenkorb|zum warenkorb|in den warenkorb|einkaufswagen|shopping cart|zur kasse|checkout|kasse|bestellübersicht|jetzt kaufen|kaufen und herunterladen)/i],
  ['order', 'Bestell-/Vertragsabschluss online', /(jetzt bestellen|zahlungspflichtig bestellen|verbindlich bestellen|bestellung abschliessen|bestellung abschließen|vertrag abschließen|jetzt buchen|kostenpflichtig bestellen)/i],
  ['booking', 'Buchung / Reservierung / Termin', /(termin (buchen|vereinbaren|reservieren)|online buchen|reservierung|reservieren|buchungsanfrage|terminvereinbarung|calendly|jetzt termin)/i],
  ['account', 'Kundenkonto / Login / Registrierung', /(mein konto|kundenkonto|kundenbereich|anmelden|einloggen|login|registrieren|registrierung|passwort vergessen|jetzt anmelden)/i],
  ['payment', 'Zahlungsfunktionen', /(paypal|klarna|stripe|sofortüberweisung|kreditkarte|lastschrift|rechnungskauf|apple pay|google pay|zahlungsart|zahlungsmethode)/i],
  ['subscription', 'Abonnement / wiederkehrende Leistung', /(abo|abonnement|mitgliedschaft|monatlich kündbar|jederzeit kündbar|subscription|mitglied werden)/i],
  ['price', 'Preisangaben', /(\d+[.,]\d{2}\s?(€|eur)|€\s?\d+|preis(e)?:|ab \d+ ?€|inkl\. mwst|zzgl\. mwst)/i],
  ['b2c', 'Verbraucheransprache', /(widerrufsbelehrung|widerrufsrecht|verbraucher|privatkunden|für privatpersonen|kundinnen und kunden|versandkosten|rückgabe)/i],
  ['b2b', 'B2B-Ausrichtung', /(nur für (gewerbliche|unternehmen|geschäftskunden|händler)|b2b|geschäftskunden|firmenkunden|alle preise (verstehen sich )?(netto|zzgl)|gewerbliche kunden|kein verkauf an (privat|verbraucher))/i],
  ['telecom', 'Telekommunikationsdienst (BFSG § 1 Abs. 3 Nr. 1)', /(telefonie|voip|mobilfunktarif|internetanschluss|dsl-tarif|messenger-dienst)/i],
  ['transport', 'Personenbeförderung (BFSG § 1 Abs. 3 Nr. 2)', /(fahrplan|ticket kaufen|fahrkarte|flugbuchung|reisebuchung|abfahrt|ankunft|bahnticket)/i],
  ['banking', 'Bankdienstleistungen für Verbraucher (BFSG § 1 Abs. 3 Nr. 3)', /(girokonto|kredit(vertrag|antrag)|darlehen|zahlungskonto|wertpapierdepot|baufinanzierung|kontoeröffnung)/i],
  ['ebook', 'E-Books (BFSG § 1 Abs. 3 Nr. 4)', /(e-?book|epub|hörbuch als download|digitales buch)/i],
  ['app', 'Mobile App', /(app store|google play|play store|itunes\.apple|jetzt app laden|unsere app)/i],
  ['search', 'Suchfunktion', /(suche|suchbegriff|search)/i],
  ['newsletter', 'Newsletter-Anmeldung', /(newsletter|zum newsletter anmelden)/i],
];

const LEGAL_PAGES = [
  ['impressum', /(^|\/)(impressum|imprint|legal-notice)/i, /impressum/i],
  ['datenschutz', /(^|\/)(datenschutz|privacy)/i, /datenschutzerklärung|datenschutz/i],
  ['agb', /(^|\/)(agb|terms|geschaeftsbedingungen)/i, /allgemeine geschäftsbedingungen|agb/i],
  ['barrierefreiheit', /(barrierefrei|accessibility)/i, /(erklärung zur barrierefreiheit|barrierefreiheitserklärung|barrierefreiheit)/i],
  ['widerruf', /(widerruf|withdrawal)/i, /widerrufsbelehrung|widerrufsrecht/i],
  ['kontakt', /(^|\/)(kontakt|contact)/i, /kontakt/i],
];

const LEGAL_FORMS = /\b(GmbH & Co\. KG|gGmbH|GmbH|UG \(haftungsbeschränkt\)|UG|AG|SE|KG|OHG|GbR|e\.K\.|e\.V\.|eG|Einzelunternehmen|Freiberufler)\b/;

export function buildContext(pages, docs, baseUrl) {
  const ctx = {
    baseUrl,
    pagesAnalysed: pages.length,
    signals: {},
    legalPages: {},
    imprint: null,
    appLinks: [],
    forms: { total: 0, withPassword: 0, withPayment: 0, contact: 0 },
    externalComponents: [],
    documents: (docs || []).map((d) => ({ url: d.url, tagged: d.checks ? d.checks.tagged : null, scanned: d.likelyScanned || false })),
    notDeterminable: [
      'Beschäftigtenzahl und Jahresumsatz/Bilanzsumme (Kleinstunternehmen-Schwelle nach § 2 Nr. 17 BFSG) sind aus der Website nicht ableitbar.',
      'Ob Verträge tatsächlich elektronisch und auf individuelle Anfrage von Verbrauchern geschlossen werden (§ 2 Nr. 26 BFSG), lässt sich nur aus dem realen Bestellprozess/AGB abschliessend beurteilen.',
      'Ob eine mobile App existiert und ob sie zur selben Dienstleistung gehört, ist ggf. nur über die App-Stores prüfbar.',
      'Ob sich der Anbieter auf § 16 BFSG (grundlegende Veränderung) oder § 17 BFSG (unverhältnismässige Belastung) beruft, ist von aussen nicht erkennbar.',
    ],
  };

  for (const [key, label, re] of SIGNALS) {
    const hits = [];
    for (const p of pages) {
      const hay = `${p.url}\n${p.text || ''}`;
      const m = re.exec(hay);
      if (m) hits.push({ url: p.url, match: m[0].slice(0, 80) });
      if (hits.length >= 5) break;
    }
    ctx.signals[key] = { label, found: hits.length > 0, evidence: hits };
  }

  for (const [key, urlRe, textRe] of LEGAL_PAGES) {
    const hit = pages.find((p) => urlRe.test(p.url)) ||
      pages.find((p) => (p.probe && p.probe.links || []).some((l) => l.href && urlRe.test(l.href))) ||
      pages.find((p) => textRe.test(p.text || ''));
    ctx.legalPages[key] = hit
      ? { found: true, url: urlRe.test(hit.url) ? hit.url : `verlinkt auf ${hit.url}` }
      : { found: false };
  }

  const imprintPage = pages.find((p) => /(impressum|imprint)/i.test(p.url));
  if (imprintPage && imprintPage.text) {
    const t = imprintPage.text;
    ctx.imprint = {
      url: imprintPage.url,
      legalForm: (LEGAL_FORMS.exec(t) || [])[0] || null,
      register: (/\b(HRB|HRA)\s?\d+[^\n]{0,30}/i.exec(t) || [])[0] || null,
      vatId: (/\bDE\s?\d{9}\b/.exec(t) || [])[0] || null,
      representative: (/(Geschäftsführer(in)?|Vertreten durch|Inhaber(in)?)\s*:?\s*([^\n]{3,60})/i.exec(t) || [])[4] || null,
      supervisory: /(Aufsichtsbehörde|Kammer|Berufsbezeichnung)/i.test(t),
    };
  }

  for (const p of pages) {
    const m = (p.text || '').match(/https?:\/\/(apps\.apple\.com|play\.google\.com)[^\s"')]+/gi);
    if (m) ctx.appLinks.push(...m.slice(0, 3));
    for (const l of (p.probe && p.probe.links) || []) {
      if (l.href && /(apps\.apple\.com|play\.google\.com)/i.test(l.href)) ctx.appLinks.push(l.href);
    }
    for (const fo of (p.probe && p.probe.forms) || []) {
      ctx.forms.total++;
      if (fo.hasPassword) ctx.forms.withPassword++;
      if (/(zahl|payment|card|iban)/i.test(JSON.stringify(fo.fields).slice(0, 4000))) ctx.forms.withPayment++;
      if (/(kontakt|contact|nachricht|message)/i.test(fo.selector + ' ' + (fo.name || '') + ' ' + JSON.stringify(fo.fields).slice(0, 2000))) ctx.forms.contact++;
    }
    for (const fr of (p.probe && p.probe.media && p.probe.media.iframes) || []) {
      if (fr.kind !== 'other') ctx.externalComponents.push({ kind: fr.kind, src: fr.src.slice(0, 120), url: p.url });
    }
  }
  ctx.appLinks = [...new Set(ctx.appLinks)].slice(0, 6);

  // Verdichtete, ausdrücklich als Indiz gekennzeichnete Einschätzung
  const s = ctx.signals;
  const ecomStrong = s.shop.found || s.order.found || (s.booking.found && s.price.found);
  const ecomWeak = s.account.found || s.payment.found || s.booking.found || s.subscription.found;
  ctx.indication = {
    electronicCommerce: ecomStrong ? 'deutliche Hinweise' : ecomWeak ? 'schwache Hinweise' : 'keine Hinweise gefunden',
    consumerFacing: s.b2c.found ? 'Hinweise vorhanden' : s.b2b.found ? 'überwiegend B2B-Hinweise' : 'nicht eindeutig',
    sectorSpecific: ['telecom', 'transport', 'banking', 'ebook'].filter((k) => s[k].found).map((k) => s[k].label),
    accessibilityStatement: ctx.legalPages.barrierefreiheit.found,
  };
  return ctx;
}
