/**
 * Lead-Discovery: Betriebe mit Website in einer Region finden.
 *
 * Quelle ist OpenStreetMap (Nominatim für die Geokodierung, Overpass für die Abfrage).
 * Es werden ausschliesslich öffentlich publizierte Geschäftsdaten verarbeitet
 * (Firmenname, Branche, Adresse, Telefon, Website) – keine Personendaten aus
 * geschlossenen Quellen, kein Login, kein Scraping hinter Zugangsschranken.
 *
 * OSM-Daten stehen unter der ODbL; bei Weitergabe von Ableitungen ist die
 * Quelle zu nennen ("© OpenStreetMap-Mitwirkende").
 */
import { fetchRaw } from '../../bfsg-audit/src/browser.mjs';

const UA = 'bfsg-leads/1.0 (B2B-Recherche fuer Barrierefreiheits-Audits)';

/** Branchen-Presets: OSM-Tags → Zielgruppen, die typischerweise Verbraucher bedienen. */
export const BRANCHEN = {
  handwerk: {
    label: 'Handwerk / Bau',
    filters: ['["craft"]', '["shop"~"^(doityourself|hardware|paint|trade|electrical|flooring|bathroom_furnishing|kitchen)$"]'],
  },
  shop: {
    label: 'Einzelhandel / Onlineshop-Potenzial',
    filters: ['["shop"]'],
  },
  gastro_hotel: {
    label: 'Gastronomie / Beherbergung (Reservierung, Buchung)',
    filters: ['["tourism"~"^(hotel|guest_house|apartment|hostel|chalet)$"]', '["amenity"~"^(restaurant|cafe|bar|biergarten|fast_food)$"]'],
  },
  gesundheit: {
    label: 'Gesundheit / Praxen (Terminbuchung)',
    filters: ['["amenity"~"^(doctors|dentist|pharmacy|veterinary)$"]', '["healthcare"]'],
  },
  kultur_tickets: {
    label: 'Kultur / Veranstaltungen / Tickets',
    filters: ['["amenity"~"^(theatre|cinema|arts_centre|community_centre|events_venue)$"]', '["tourism"~"^(museum|attraction|theme_park)$"]', '["leisure"~"^(sports_centre|swimming_pool|fitness_centre|bowling_alley)$"]'],
  },
  dienstleistung: {
    label: 'Persönliche Dienstleistungen',
    filters: ['["shop"~"^(hairdresser|beauty|optician|travel_agency|funeral_directors|dry_cleaning|laundry|car_repair|tyres|massage|tattoo|florist)$"]', '["amenity"~"^(driving_school|dancing_school|childcare|kindergarten)$"]'],
  },
  bueros: {
    label: 'Beratung / Vermittlung (Versicherung, Immobilien, Kanzleien)',
    filters: ['["office"~"^(insurance|estate_agent|lawyer|tax_advisor|financial_advisor|travel_agent|employment_agency|architect|educational_institution)$"]'],
  },
};

export const OVERPASS_ENDPOINTS = [
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://overpass.osm.ch/api/interpreter',
];

/** Ort → Bounding Box (Nominatim, max. 1 Anfrage/Sekunde laut Nutzungsbedingungen). */
export async function geocode(ort, { dispatcher, land = 'Deutschland' } = {}) {
  // Nominatim findet zusammengesetzte Angaben ("Ort, Region, Land") oft nicht –
  // deshalb der Reihe nach mehrere Schreibweisen versuchen.
  const varianten = [];
  const hatLand = /deutschland|germany|österreich|schweiz/i.test(ort);
  varianten.push(hatLand ? ort : `${ort}, ${land}`);
  const ersterTeil = ort.split(',')[0].trim();
  if (ersterTeil && ersterTeil !== ort) varianten.push(hatLand ? ersterTeil : `${ersterTeil}, ${land}`);
  varianten.push(ort);

  let letzterFehler = null;
  for (const [i, v] of varianten.entries()) {
    if (i > 0) await new Promise((r) => setTimeout(r, 1200)); // Nominatim: max. 1 Anfrage/Sekunde
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(v)}&format=json&limit=1&addressdetails=1`;
    let res;
    try {
      res = await fetchRaw(url, { dispatcher, headers: { 'user-agent': UA, accept: 'application/json' }, timeout: 30000 });
    } catch (e) { letzterFehler = e; continue; }
    if (res.status >= 400) { letzterFehler = new Error(`Nominatim antwortete mit HTTP ${res.status}`); continue; }
    const data = JSON.parse(res.body.toString('utf8'));
    if (!data.length) continue;
    const b = data[0].boundingbox.map(Number); // [südlich, nördlich, westlich, östlich]
    return {
      name: data[0].display_name,
      angefragt: v,
      lat: Number(data[0].lat),
      lon: Number(data[0].lon),
      bbox: { south: b[0], north: b[1], west: b[2], east: b[3] },
    };
  }
  throw new Error(`Ort "${ort}" nicht gefunden${letzterFehler ? ` (${letzterFehler.message})` : ''} – versucht: ${varianten.join(' | ')}`);
}

/** Vergrössert/verkleinert eine Bounding Box auf einen Radius um den Mittelpunkt. */
export function bboxFromRadius(lat, lon, km) {
  const dLat = km / 111.32;
  const dLon = km / (111.32 * Math.cos((lat * Math.PI) / 180));
  return { south: lat - dLat, north: lat + dLat, west: lon - dLon, east: lon + dLon };
}

function buildQuery(bbox, branchen, limit) {
  const bb = `(${bbox.south.toFixed(5)},${bbox.west.toFixed(5)},${bbox.north.toFixed(5)},${bbox.east.toFixed(5)})`;
  const parts = [];
  for (const key of branchen) {
    const preset = BRANCHEN[key];
    if (!preset) throw new Error(`Unbekannte Branche: ${key} (verfügbar: ${Object.keys(BRANCHEN).join(', ')})`);
    for (const filt of preset.filters) {
      parts.push(`  nwr${filt}["website"]${bb};`);
      parts.push(`  nwr${filt}["contact:website"]${bb};`);
    }
  }
  return `[out:json][timeout:120];\n(\n${parts.join('\n')}\n);\nout center tags ${limit};`;
}

const CHAIN_HINTS = /(edeka|rewe|aldi|lidl|netto|penny|kaufland|dm-|rossmann|müller|deichmann|h&m|c&a|zara|rituals|douglas|fielmann|apollo|vodafone|telekom|o2|mcdonald|burger king|subway|starbucks|ibis|motel one|best western|hilton|marriott|nkd|kik|takko|tedi|action|jysk|ikea|obi|hornbach|bauhaus|toom|hagebau|fressnapf|intersport|thalia|hugendubel|sparkasse|volksbank|commerzbank|deutsche bank|postbank|dhl|hermes|ups |fedex)/i;

/** Deutsche Klartextnamen für die häufigsten OSM-Werte (für Anrufliste und CSV). */
const LABELS = {
  painter: 'Malerbetrieb', plasterer: 'Stuckateur/Verputzer', carpenter: 'Schreinerei/Zimmerei',
  electrician: 'Elektrobetrieb', plumber: 'Sanitär/Heizung', roofer: 'Dachdeckerei',
  tiler: 'Fliesenleger', gardener: 'Garten- und Landschaftsbau', metal_construction: 'Metallbau',
  joiner: 'Tischlerei', glaziery: 'Glaserei', bakery: 'Bäckerei', butcher: 'Metzgerei',
  supermarket: 'Supermarkt', hairdresser: 'Friseur', beauty: 'Kosmetik', optician: 'Optiker',
  florist: 'Blumenladen', car_repair: 'Kfz-Werkstatt', tyres: 'Reifendienst',
  travel_agency: 'Reisebüro', furniture: 'Möbelhaus', clothes: 'Bekleidung', shoes: 'Schuhe',
  jewelry: 'Schmuck', books: 'Buchhandlung', doityourself: 'Baumarkt', hardware: 'Eisenwaren',
  restaurant: 'Restaurant', cafe: 'Café', bar: 'Bar', fast_food: 'Imbiss/Schnellrestaurant',
  hotel: 'Hotel', guest_house: 'Pension/Gästehaus', apartment: 'Ferienwohnung', hostel: 'Hostel',
  doctors: 'Arztpraxis', dentist: 'Zahnarztpraxis', pharmacy: 'Apotheke', veterinary: 'Tierarztpraxis',
  physiotherapist: 'Physiotherapie', theatre: 'Theater', cinema: 'Kino', museum: 'Museum',
  attraction: 'Freizeit-/Ausflugsziel', events_venue: 'Veranstaltungsort',
  fitness_centre: 'Fitnessstudio', swimming_pool: 'Schwimmbad', sports_centre: 'Sportzentrum',
  driving_school: 'Fahrschule', dancing_school: 'Tanzschule', kindergarten: 'Kindergarten',
  insurance: 'Versicherungsbüro', estate_agent: 'Immobilienmakler', lawyer: 'Kanzlei',
  tax_advisor: 'Steuerberatung', financial_advisor: 'Finanzberatung', architect: 'Architekturbüro',
  funeral_directors: 'Bestattungen', massage: 'Massage', tattoo: 'Tattoostudio',
};

/** Vereinheitlicht ein OSM-Element zu einem Kandidaten-Datensatz. */
function toCandidate(el) {
  const t = el.tags || {};
  const website = t.website || t['contact:website'] || t.url || '';
  if (!website || !/^https?:\/\//i.test(website)) return null;
  let host;
  try { host = new URL(website).hostname.replace(/^www\./i, '').toLowerCase(); } catch { return null; }
  const branche = t.craft ? `craft=${t.craft}` : t.shop ? `shop=${t.shop}` : t.tourism ? `tourism=${t.tourism}`
    : t.amenity ? `amenity=${t.amenity}` : t.office ? `office=${t.office}` : t.healthcare ? `healthcare=${t.healthcare}`
      : t.leisure ? `leisure=${t.leisure}` : 'sonstige';
  const rohLabel = t.craft || t.shop || t.tourism || t.amenity || t.office || t.healthcare || t.leisure || '';
  const name = t.name || t.operator || t.brand || '';
  const kette = !!(t.brand || t['brand:wikidata'] || CHAIN_HINTS.test(`${name} ${host}`));
  return {
    osmId: `${el.type}/${el.id}`,
    name,
    branche,
    branchenLabel: LABELS[rohLabel] || rohLabel,
    website,
    host,
    telefon: t.phone || t['contact:phone'] || t['contact:mobile'] || '',
    email: t.email || t['contact:email'] || '',
    strasse: [t['addr:street'], t['addr:housenumber']].filter(Boolean).join(' '),
    plz: t['addr:postcode'] || '',
    ort: t['addr:city'] || t['addr:town'] || t['addr:village'] || '',
    lat: el.lat || (el.center && el.center.lat) || null,
    lon: el.lon || (el.center && el.center.lon) || null,
    ketteVermutet: kette,
    opening: t.opening_hours || '',
    quelle: 'OpenStreetMap (ODbL)',
  };
}

/** Führt die Overpass-Abfrage aus und liefert entdupliierte Kandidaten. */
export async function discoverOsm({ ort, radiusKm = null, branchen = ['shop', 'handwerk', 'dienstleistung'], limit = 200, dispatcher, endpoints = OVERPASS_ENDPOINTS, includeChains = false }) {
  const geo = await geocode(ort, { dispatcher });
  const bbox = radiusKm ? bboxFromRadius(geo.lat, geo.lon, radiusKm) : geo.bbox;
  const query = buildQuery(bbox, branchen, limit);

  let lastErr;
  for (const ep of endpoints) {
    try {
      const res = await fetchRaw(ep, {
        dispatcher, method: 'POST',
        headers: { 'user-agent': UA, 'content-type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`,
        timeout: 180000,
      });
      if (res.status >= 400) { lastErr = new Error(`${ep}: HTTP ${res.status}`); continue; }
      const data = JSON.parse(res.body.toString('utf8'));
      // Overpass meldet Laufzeitfehler (Timeout, Überlast) mit HTTP 200 und einem
      // "remark"-Feld. Ohne diese Prüfung sieht ein Fehlschlag wie "keine Betriebe" aus.
      if (data.remark) { lastErr = new Error(`${ep}: ${String(data.remark).slice(0, 120)}`); continue; }
      if (!Array.isArray(data.elements) || data.elements.length === 0) {
        lastErr = new Error(`${ep}: leeres Ergebnis`);
        if (ep !== endpoints[endpoints.length - 1]) continue; // anderen Endpunkt probieren
      }
      const seen = new Set();
      const out = [];
      for (const el of data.elements || []) {
        const c = toCandidate(el);
        if (!c) continue;
        if (!includeChains && c.ketteVermutet) continue;
        if (seen.has(c.host)) continue; // eine Website = ein Lead
        seen.add(c.host);
        out.push(c);
      }
      return { region: geo.name, bbox, query, endpoint: ep, kandidaten: out };
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(`Overpass nicht erreichbar: ${lastErr ? lastErr.message : 'unbekannt'}`);
}

/** Import einer eigenen Liste: CSV mit Spalten name,website[,telefon,ort,branche] oder eine URL je Zeile. */
export function importList(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return [];
  const head = lines[0].toLowerCase();
  const hasHeader = /name|website|url|firma/.test(head) && head.includes(',');
  const rows = hasHeader ? lines.slice(1) : lines;
  const cols = hasHeader ? head.split(',').map((c) => c.trim()) : null;
  const out = [];
  for (const line of rows) {
    let rec;
    if (cols) {
      const parts = line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
      rec = Object.fromEntries(cols.map((c, i) => [c, parts[i] || '']));
    } else {
      rec = { website: line };
    }
    const website = rec.website || rec.url || '';
    if (!/^https?:\/\//i.test(website)) continue;
    let host;
    try { host = new URL(website).hostname.replace(/^www\./i, '').toLowerCase(); } catch { continue; }
    out.push({
      osmId: null,
      name: rec.name || rec.firma || '',
      branche: rec.branche || 'import',
      branchenLabel: rec.branche || '',
      website, host,
      telefon: rec.telefon || rec.phone || '',
      email: rec.email || '',
      strasse: rec.strasse || '', plz: rec.plz || '', ort: rec.ort || '',
      lat: null, lon: null, ketteVermutet: false, opening: '',
      quelle: 'eigene Liste',
    });
  }
  return out;
}
