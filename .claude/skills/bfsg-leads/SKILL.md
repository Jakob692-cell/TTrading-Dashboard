---
name: bfsg-leads
description: Kundenakquise für Barrierefreiheits-Dienstleistungen. Findet Betriebe mit Website in einer Region (OpenStreetMap), prüft deren Seiten in einem kurzen Check auf Barrieren, bewertet BFSG-Relevanz und Ansprechbarkeit und erzeugt eine Anrufliste mit belegten Gesprächsaufhängern, Einwandbehandlung und dokumentierter mutmaßlicher Einwilligung nach § 7 UWG. Auslöser: "Kunden finden", "Leads", "Akquise", "Anrufliste", "Kaltakquise", "wen kann ich anrufen", "Onlineshops in der Region prüfen".
---

# Lead-Recherche für Barrierefreiheits-Audits

## Rolle

Du bereitest Kaltakquise vor: passende Betriebe finden, ihre Websites sachlich prüfen und daraus
eine Anrufliste bauen, mit der man seriös verkaufen kann. Verkauft werden zwei Stufen:
**(1) der vollständige Barrierefreiheits-Check**, **(2) die anschliessende Umsetzung**.

Die eigentliche Prüfung beim zahlenden Kunden macht der Skill `bfsg-audit`. Hier geht es nur um
den Kurzcheck als Gesprächsaufhänger.

## Harte Regeln

1. **Nur Gewerbebetriebe anrufen, nur unter der veröffentlichten Geschäftsnummer.**
   § 7 Abs. 2 Nr. 1 UWG: Verbraucher brauchen eine *vorherige ausdrückliche* Einwilligung
   (Bußgeld bis 300.000 €, § 20 Abs. 2 UWG), Unternehmen zumindest eine *mutmaßliche*.
   Wirkt ein Anschluss privat (keine Firmenangabe, reine Mobilnummer, kein Impressum): nicht anrufen.
2. **Keine Werbe-E-Mail und kein Fax ohne vorherige ausdrückliche Einwilligung** (§ 7 Abs. 2 Nr. 2
   UWG) – das gilt auch gegenüber Unternehmen und auch für die `info@`-Adresse aus dem Impressum.
   Bittet die Ansprechperson im Telefonat um Zusendung, ist das eine Einwilligung: Datum, Name und
   Wortlaut dokumentieren.
3. **Keine Rechtsbehauptungen.** Nie „Ihre Website ist rechtswidrig", „Sie werden abgemahnt",
   „Sie sind BFSG-konform". Gesagt wird, was gemessen wurde; die rechtliche Einordnung hängt an
   Unternehmensgrösse und Online-Angebot und bleibt offen.
4. **Keine erfundenen Befunde.** Jeder Gesprächsaufhänger stammt aus einem tatsächlichen
   Prüfergebnis mit Beleg-URL und Anzahl betroffener Stellen.
5. **Widerspruch wirkt sofort** (Art. 21 DSGVO): Eintrag in `sperrliste.txt`, keine weitere Ansprache.
6. **Höflich prüfen.** robots.txt beachten, Pausen einhalten, nur öffentlich erreichbare Seiten,
   keine Formularabsendungen, keine Anmeldeversuche.
7. **Kleinstunternehmen offen ansprechen.** Bei Dienstleistungen sind Betriebe mit weniger als
   10 Beschäftigten und höchstens 2 Mio. € Umsatz/Bilanzsumme vom BFSG ausgenommen
   (§ 3 Abs. 3 i. V. m. § 2 Nr. 17 BFSG). Dann über den Nutzen verkaufen, nicht über das Gesetz.

Details und Quellen: `references/kaltakquise-recht.md`.

## Ablauf

### Schritt 1 – Zielgebiet und Branchen klären

Frage, falls nicht angegeben: Ort/Umkreis und Branchen. Auswahlhilfe:
`references/zielgruppen.md`. Presets: `shop`, `handwerk`, `gastro_hotel`, `gesundheit`,
`kultur_tickets`, `dienstleistung`, `bueros`.

### Schritt 2 – Lauf starten

```bash
cd tools/bfsg-audit && npm install          # einmalig, liefert die Abhängigkeiten
cd ../bfsg-leads
node bin/bfsg-leads.mjs run \
  --ort "Forchheim" --radius 15 \
  --branchen shop,gastro_hotel,handwerk \
  --max 30 --sperrliste sperrliste.txt --out ../../leads-forchheim
```

Einzelschritte: `discover` (Betriebe finden) → `qualify` (Websites kurz prüfen) → `report`
(Listen erzeugen). Eigene Firmenliste statt OpenStreetMap: `--liste meine-firmen.csv`
(Spalten `name,website[,telefon,ort,branche]`).

Ergebnis im Ausgabeverzeichnis:
- `anrufliste.csv` – für Excel/CRM, mit Spalten für Status und Notiz
- `anrufliste.md` / `.html` – Steckbrief je Lead mit Einstieg, Belegen und Hinweisen
- `kurzliste.md` – eine Zeile je Lead für den schnellen Blick
- `leads.json` / `kandidaten.json` – Rohdaten

### Schritt 3 – Liste durchsehen, bevor telefoniert wird

Prüfe je Lead:
- Ist das wirklich ein Gewerbebetrieb? (`betriebspruefung`, Impressum, Rechtsform)
- Ist die Nummer eine Geschäftsnummer? (Mobilnummern sind markiert)
- Passen die Aufhänger, sind sie am Telefon erklärbar?
- Gibt es Flags (öffentliche Stelle, bereits Barrierefreiheitserklärung, reine B2B-Ausrichtung)?

Leads, bei denen etwas unklar ist, gehören nicht in die Anrufliste, sondern in die Prüfschleife.

### Schritt 4 – Telefonieren

`references/gespraechsleitfaden.md` enthält Einstieg, Belegführung, Einwandbehandlung
(„Kleinstunternehmen", „haben schon eine Agentur", „schicken Sie was per Mail") und
Abschlussvarianten. Preise, Rabattlogik und eine Angebotsvorlage stehen in
`references/preise-und-angebot.md`. Nach jedem Anruf Ergebnis in die CSV eintragen.

### Schritt 5 – Übergabe an das Audit

Sobald jemand kauft: vollständiges Audit mit `bfsg-audit` (alle relevanten Seiten, Tastatur,
Responsive, PDFs), Bericht besprechen, Umsetzung anbieten, nach der Umsetzung erneut prüfen und
den Vorher-/Nachher-Vergleich als Nachweis liefern.

## Wie bewertet wird

Score 0–100 aus drei Teilen (Details in `src/score.mjs`):

| Teil | max. | Grundlage |
| --- | --- | --- |
| BFSG-Relevanz | 40 | Shop-, Bestell-, Buchungs-, Konto-, Zahlungssignale auf der Seite + Branche |
| Gefundene Barrieren | 40 | gewichtete Befunde aus dem Kurzcheck, Bonus wenn keine Barrierefreiheitserklärung existiert |
| Ansprechbarkeit | 20 | Telefonnummer, Ansprechpartner, kein Filialist, inhabergeführt |

Segmente: **A** ≥ 70 (zuerst anrufen), **B** ≥ 50, **C** ≥ 30, **D** darunter,
`ausgeschlossen` bei Sperrliste, nicht erreichbarer Website oder fehlender Grundlage.

## Grenzen (im Gespräch offenlegen, wenn gefragt)

- Der Kurzcheck prüft nur Startseite plus bis zu zwei Unterseiten und findet nur einen Teil der
  Probleme. Er ersetzt kein Audit – das ist genau das Verkaufsargument, aber es darf nicht
  umgekehrt als „vollständige Prüfung" verkauft werden.
- OpenStreetMap-Daten sind unvollständig und teilweise veraltet; Telefonnummern und Websites vor
  dem Anruf gegenprüfen.
- Die BFSG-Relevanz ist eine Einschätzung aus Website-Signalen. Beschäftigtenzahl und Umsatz –
  also die Kleinstunternehmen-Schwelle – sind von aussen nicht feststellbar.
- Datenquelle bei Nachfrage nennen: öffentlich zugängliche Website und OpenStreetMap
  (© OpenStreetMap-Mitwirkende, ODbL).

## Pflichtangaben in der Antwort an die Nutzerin/den Nutzer

Nach einem Lauf immer ausgeben:

```
## Ergebnis der Recherche
Region, geprüfte Betriebe, Segmente A/B/C/D, ausgeschlossene Leads

## Top-Leads (Firma · Telefon · Score · Aufhänger)

## Vor dem ersten Anruf beachten
(mind.: nur Geschäftsnummern, keine Werbe-Mails ohne Einwilligung, keine Rechtsbehauptungen)

## Dateien
```
