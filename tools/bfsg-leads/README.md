# bfsg-leads

Vertriebsvorbereitung für Barrierefreiheits-Dienstleistungen: Betriebe mit Website in einer Region
finden, deren Seiten in einem kurzen Durchlauf prüfen und daraus eine Anrufliste mit belegten
Gesprächsaufhängern erzeugen.

> **Kein Rechtsgutachten und kein Vollaudit.** Der Kurzcheck prüft Startseite plus bis zu zwei
> Unterseiten. Er dient als Gesprächsaufhänger – die vollständige Prüfung läuft mit
> `tools/bfsg-audit`, sobald jemand kauft. Es wird nirgends behauptet, ein Betrieb verstosse gegen
> das BFSG.

## Voraussetzungen

Die Abhängigkeiten liegen im Nachbarpaket:

```bash
cd tools/bfsg-audit && npm install
```

`bfsg-leads` selbst braucht keine eigene Installation – es nutzt Playwright, axe-core und undici
aus `tools/bfsg-audit/node_modules` sowie dessen Prüfmodule.

## Verwendung

```bash
cd tools/bfsg-leads

# Alles in einem Lauf
node bin/bfsg-leads.mjs run --ort "Forchheim" --radius 15 \
  --branchen shop,gastro_hotel,handwerk --max 30 --out ../../leads-forchheim

# oder schrittweise
node bin/bfsg-leads.mjs discover --ort "Bamberg" --branchen shop --out leads/kandidaten.json
node bin/bfsg-leads.mjs qualify  --in leads/kandidaten.json --max 25 --out leads/leads.json
node bin/bfsg-leads.mjs report   --in leads/leads.json --out leads/

# eigene Firmenliste statt OpenStreetMap
node bin/bfsg-leads.mjs run --liste meine-firmen.csv --max 50
```

| Option | Bedeutung | Standard |
| --- | --- | --- |
| `--ort <name>` | Ort/Landkreis (Nominatim-Geokodierung) | – |
| `--radius <km>` | Radius um den Ortsmittelpunkt statt amtlicher Grenze | Ortsgrenze |
| `--branchen <a,b>` | `shop`, `handwerk`, `gastro_hotel`, `gesundheit`, `kultur_tickets`, `dienstleistung`, `bueros` | shop,handwerk,dienstleistung |
| `--max <n>` | maximal geprüfte Betriebe | 25 |
| `--liste <datei>` | eigene CSV (`name,website[,telefon,ort,branche]`) oder URL-Liste | – |
| `--sperrliste <datei>` | Hosts/Nummern, die nie kontaktiert werden | – |
| `--unterseiten <n>` | zusätzlich geprüfte Unterseiten je Betrieb | 2 |
| `--delay <ms>` | Pause zwischen zwei Betrieben | 1500 |
| `--ketten` | Filialisten nicht ausfiltern | aus |
| `--network auto\|direct\|relay` | Netzwerkmodus des Browsers | auto |

## Ausgabe

```
<out>/anrufliste.csv     Excel-tauglich (Semikolon, UTF-8 BOM), mit Status- und Notizspalte
<out>/anrufliste.md      Steckbrief je Lead: Einstieg, Belege, Hinweise, Einwilligungsdoku
<out>/anrufliste.html    dieselbe Fassung im Browser
<out>/kurzliste.md       eine Zeile je Lead
<out>/leads.json         Rohdaten inkl. aller Befunde
<out>/kandidaten.json    Discovery-Ergebnis
```

## Bewertung

| Teil | max. | Grundlage |
| --- | --- | --- |
| BFSG-Relevanz | 40 | Shop-, Bestell-, Buchungs-, Konto-, Zahlungssignale + Branchenpreset |
| Barrieren | 40 | gewichtete Befunde des Kurzchecks (CRITICAL 9, HIGH 5, MEDIUM 1,5, LOW 0,4), Bonus ohne Barrierefreiheitserklärung |
| Ansprechbarkeit | 20 | Telefonnummer, Ansprechpartner, kein Filialist, inhabergeführt |

Segmente: A ≥ 70, B ≥ 50, C ≥ 30, D darunter. `ausgeschlossen` bei Sperrlisteneintrag, nicht
erreichbarer Website oder robots.txt-Sperre.

## Rechtliche Leitplanken (Kurzfassung)

- **Telefon:** Verbraucher nur mit vorheriger ausdrücklicher Einwilligung (Bußgeld bis 300.000 €,
  § 20 Abs. 2 UWG) – also **nie**. Unternehmen: mutmaßliche Einwilligung nötig; das Werkzeug
  dokumentiert je Lead den sachlichen Zusammenhang.
- **E-Mail/Fax:** ohne vorherige ausdrückliche Einwilligung unzulässig, auch B2B.
- **Widerspruch:** sofort in die Sperrliste, keine weitere Ansprache.
- **Datenquellen:** öffentlich zugängliche Websites und OpenStreetMap
  (© OpenStreetMap-Mitwirkende, ODbL). robots.txt wird beachtet, Formulare werden nie abgesendet.

Ausführlich: `.claude/skills/bfsg-leads/references/kaltakquise-recht.md`.

## Grenzen

- OSM-Daten sind unvollständig und teils veraltet – Nummern und Websites vor dem Anruf gegenprüfen.
- Websites mit Bot-Schutz werden als nicht auswertbar markiert statt falsch bewertet.
- Portal-Profile (z. B. `*.business.site`) tauchen als Lead auf, sind aber meist nicht änderbar.
- Die Kleinstunternehmen-Schwelle (§ 2 Nr. 17 BFSG) lässt sich von aussen nicht feststellen.
