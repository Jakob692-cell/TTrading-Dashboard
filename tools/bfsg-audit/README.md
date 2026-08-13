# bfsg-audit

Automatisierte Barrierefreiheits-Vorprüfung einer Website (deutschsprachige Ausgabe, Bezug auf
WCAG 2.1/2.2, BFSG und BFSGV). Crawlt die Site, prüft jede Seite im echten Browser, ordnet die
Befunde WCAG-Kriterien zu, priorisiert sie und erzeugt einen Bericht.

> **Das Werkzeug erstellt kein Konformitätszeugnis.** Automatisierte Prüfungen decken nur einen Teil
> der WCAG-Anforderungen ab. „Keine Befunde" bedeutet nicht „barrierefrei". Die rechtliche Einordnung
> des BFSG ist eine Einschätzung und ersetzt keine Rechtsberatung.

## Installation

```bash
cd tools/bfsg-audit
npm install
```

Benötigt Node.js ≥ 20 und einen Chromium-Build. Ist bereits ein Playwright-Browser vorhanden
(`PLAYWRIGHT_BROWSERS_PATH`), wird dieser verwendet; alternativ `BFSG_CHROMIUM_PATH=/pfad/zu/chrome`
setzen oder `npx playwright install chromium` ausführen.

## Verwendung

```bash
node bin/bfsg-audit.mjs https://beispiel.de --max-pages 15 --out ./audit-beispiel
```

| Option | Bedeutung | Standard |
| --- | --- | --- |
| `--max-pages <n>` | maximale Seitenanzahl | 12 |
| `--out <dir>` | Ausgabeverzeichnis | `audit-<host>-<datum>` |
| `--network auto\|direct\|relay` | Netzwerkmodus (siehe unten) | auto |
| `--delay <ms>` | Pause zwischen Seiten (Höflichkeit gegenüber dem Server) | 600 |
| `--max-tabs <n>` | Tab-Schritte je Seite im Tastaturlauf | 60 |
| `--max-docs <n>` | maximal analysierte PDFs | 8 |
| `--no-screenshots` / `--no-keyboard` / `--no-responsive` | Teilprüfungen abschalten | an |
| `--ignore-robots` | robots.txt ignorieren (nur mit Erlaubnis des Betreibers) | robots wird beachtet |
| `--same-host` | Subdomains ausschliessen | Subdomains werden mitgeprüft |
| `--timeout <ms>` | Navigations-Timeout | 45000 |
| `--cookie "n=v; n2=v2"` | Cookies vorab setzen – z. B. das Consent-Cookie, damit der Cookie-Layer den Tastatur-Durchlauf nicht blockiert | – |

### Ausgabe

```
<out>/bericht.md        vollständiger Bericht (Phasen 1–8, Kompakttabelle, BFSG-Einschätzung)
<out>/bericht.html      dieselbe Fassung als HTML
<out>/befunde.json      Rohdaten: Sitemap, Sondendaten je Seite, Befunde, Kontextsignale
<out>/screenshots/      Desktop- und Viewport-Screenshots je Seite
```

### Netzwerkmodus

- `direct` – Chromium baut die Verbindungen selbst auf (Normalfall).
- `relay` – alle Requests laufen über den Node-Prozess (undici mit `HTTPS_PROXY` und CA-Bundle).
  Nötig in abgeschotteten CI-/Container-Umgebungen, in denen der Browser keinen eigenen Egress hat.
- `auto` – testet zuerst `direct` und schaltet bei Fehlschlag auf `relay` um.

## Was geprüft wird

| Kategorie | Beispiele | WCAG (Auswahl) |
| --- | --- | --- |
| A Kontrast | Textkontraste mit berechneten Verhältnissen, Bedienelementkontraste, Text auf Bildern | 1.4.3, 1.4.11 |
| B Farbabhängigkeit | Links nur farblich markiert | 1.4.1 |
| C Bilder | fehlende/verdächtige alt-Texte, Grafiklinks, Icon-SVGs | 1.1.1, 2.4.4 |
| D Semantik | H1/Hierarchie, Landmarken, Titel, Tabellen, seitenübergreifende Konsistenz | 1.3.1, 2.4.2, 3.2.3 |
| E Tastatur | echter Tab-Durchlauf, Fokussichtbarkeit, Tastaturfalle, Reihenfolge, Sprunglink | 2.1.1, 2.1.2, 2.4.1, 2.4.3, 2.4.7 |
| F Links/Buttons | leere, generische, mehrdeutige Namen; `<a>` ohne href; neue Fenster | 2.4.4, 4.1.2 |
| G Formulare | Label, Placeholder-only, autocomplete, Gruppen, Pflichtfelder, Fehlerregionen | 1.3.1, 1.3.5, 3.3.1, 3.3.2 |
| H ARIA | ungültige Rollen/Attribute, tote Verweise, aria-hidden mit Fokus, doppelte IDs | 1.3.1, 4.1.2 |
| I Sprache | `lang`, Plausibilität gegen den Text, Sprachwechsel | 3.1.1, 3.1.2 |
| J Dokumente | PDF: Tagging, Sprache, Titel, Textebene, Formularfelder | 1.1.1, 1.3.1, 3.1.1 |
| K Video/Audio | Untertitelspuren, Controls, Autoplay, Fremd-Embeds | 1.2.2, 1.4.2, 2.1.1 |
| L Responsive | 320/375/768/1440 px, Reflow, Touch-Ziele, Zoomsperre | 1.4.4, 1.4.10, 2.5.8 |
| M Bewegung | Endlosanimationen, Karussells, `marquee`, `meta refresh` | 2.2.1, 2.2.2 |
| N Fehlerbehandlung | 404-Seite, Fehlerregionen, Authentifizierung | 3.3.1, 3.3.8, 4.1.3 |

Zusätzlich läuft **axe-core** mit den Regelsätzen wcag2a/aa, wcag21a/aa, wcag22aa und best-practice.
Befunde aus axe sind im Bericht mit der Quelle „axe-core" gekennzeichnet.

Jeder Befund enthält: Kategorie, WCAG-Zuordnung (oder ausdrücklich „WCAG-Zuordnung nicht eindeutig"),
Problem, Erwartung, betroffene URLs und Elemente, Schweregrad (CRITICAL/HIGH/MEDIUM/LOW),
Kennzeichnung `automatisch | teilautomatisch | manuell` und eine konkrete Empfehlung.

## Test

```bash
npm test
```

Startet einen lokalen Server mit `test/fixture/` (Seite mit bewusst eingebauten Barrieren), lässt das
Audit darüber laufen und prüft, ob alle 34 erwarteten Prüfungen anschlagen. Zusätzlich wird die
Kontrastberechnung gegen einen bekannten Wert (`#999999` auf `#ffffff` ≈ 2,85:1) verifiziert.

## Grenzen

- Kontrast über Hintergrundbildern/Verläufen wird nicht berechnet, sondern als manuell zu prüfen
  ausgewiesen.
- Der Tab-Durchlauf endet nach `--max-tabs` Schritten; Elemente in geschlossenen Menüs erscheinen als
  „nicht erreicht" und sind zu verifizieren.
- Inhalte hinter Login, Bezahlschranke oder mehrstufigen Prozessen werden nicht durchlaufen.
- Formulare werden **nicht** abgesendet – das Fehlerverhalten muss manuell geprüft werden.
- Die PDF-Prüfung ist eine Heuristik (kein PDF/UA-Prüfbericht); komprimierte Objekt-Streams können
  Merkmale verbergen.
- Bot-Schutz/Interstitials werden erkannt und als „nicht bewertbar" ausgewiesen, statt die
  Zwischenseite zu bewerten.
- Nicht-ASCII-Zeichen in Request-Headern werden entfernt, da manche Server darauf mit 5xx antworten.

## Fairness gegenüber dem geprüften Server

robots.txt wird ausgewertet, zwischen den Seitenaufrufen wird gewartet, es werden ausschliesslich
lesende Zugriffe ausgeführt (kein Absenden von Formularen, keine Anmeldeversuche, keine Lasttests).
Der User-Agent weist das Werkzeug als `bfsg-audit/1.0` aus.
