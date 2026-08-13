# Zielgruppen: wer sich für dieses Angebot eignet

Sortiert nach Verkaufswahrscheinlichkeit × sachlicher Anlass. Grundlage der Einordnung ist
§ 1 Abs. 3 BFSG (erfasste Dienstleistungen) und § 2 Nr. 26 BFSG (elektronischer Geschäftsverkehr:
elektronisch, auf individuelle Anfrage, **im Hinblick auf einen Verbrauchervertrag**).

## Stufe 1 – starker sachlicher Anlass

| Zielgruppe | Warum | OSM-Preset |
| --- | --- | --- |
| Onlineshops (Einzelhandel mit Warenkorb/Kasse) | Klarer elektronischer Geschäftsverkehr; Checkout ist der kritische Prozess | `shop` |
| Hotels, Pensionen, Ferienwohnungen mit Online-Buchung | Buchungsstrecke = Vertragsabschluss; oft fremde Buchungs-Widgets | `gastro_hotel` |
| Ticket-/Veranstaltungsverkauf, Kinos, Theater, Freizeitbäder | Ticketkauf online, häufig eingebettete Fremdsysteme | `kultur_tickets` |
| Reisebüros, Versicherungs- und Immobilienvermittlung | Anfrage-/Abschlussstrecken für Verbraucher | `bueros`, `dienstleistung` |
| Fitnessstudios, Fahrschulen, Kurse mit Online-Anmeldung | Mitgliedschaft/Anmeldung online | `kultur_tickets`, `dienstleistung` |

## Stufe 2 – guter Anlass, Abschluss über Nutzen statt Gesetz

| Zielgruppe | Warum | OSM-Preset |
| --- | --- | --- |
| Restaurants mit Tischreservierung oder Bestellung | Reservierung/Bestellung online; oft sehr schwache Websites | `gastro_hotel` |
| Arzt-, Zahnarzt-, Physio-, Tierarztpraxen mit Terminbuchung | Terminbuchung online, hohe Betroffenheit älterer Patientinnen | `gesundheit` |
| Friseure, Kosmetik, Optiker mit Online-Termin | Terminbuchung; Optiker haben zusätzlich das passende Publikum | `dienstleistung` |
| Handwerksbetriebe mit Angebots-/Terminanfrage | Kontaktformular ist der Vertriebskanal; Malerbetriebe & Co. | `handwerk` |

Bei Stufe 2 gilt häufig die **Kleinstunternehmen-Ausnahme** (§ 3 Abs. 3 i. V. m. § 2 Nr. 17 BFSG:
weniger als 10 Beschäftigte **und** höchstens 2 Mio. € Umsatz oder Bilanzsumme). Das offen
ansprechen – und über den wirtschaftlichen Nutzen verkaufen:

- Rund jede zehnte Person in Deutschland hat eine anerkannte Schwerbehinderung; deutlich mehr haben
  eingeschränktes Sehvermögen, Farbsehschwäche oder Motorikprobleme.
- Die Zielgruppe „ältere Kundschaft mit Lesebrille auf dem Handy" ist bei Dorfbetrieben die Mehrheit.
- Barrierefreie Seiten sind schneller, besser strukturiert und in der Suche besser auffindbar.
- Wer heute umbaut, hat es beim nächsten Relaunch bereits erledigt.

## Stufe 3 – vorsichtig behandeln

- **Öffentliche Stellen, Schulen, Kirchen, Vereine mit öffentlicher Förderung**: Hier gelten
  BGG/BITV 2.0 bzw. Landesgesetze, nicht das BFSG. Vergabe läuft anders, Ansprechpartner sind
  andere. Das Werkzeug markiert solche Treffer.
- **Filialisten und Ketten**: Entscheidungen fallen in der Zentrale, nicht vor Ort. Werden
  standardmässig ausgefiltert (`--ketten` hebt das auf).
- **Reine B2B-Anbieter** (Zulieferer, Großhandel „nur für Gewerbetreibende"): BFSG-Relevanz
  fraglich, weil es an Verbraucherverträgen fehlt. Als Lead nur über den Nutzen verkaufbar.
- **Betriebe ohne Impressum oder mit reiner Mobilnummer**: Erst prüfen, ob es überhaupt ein
  Gewerbebetrieb ist. Im Zweifel nicht anrufen.

## Was einen Lead wertvoll macht

1. **Prozess auf der Seite** (Shop, Buchung, Termin, Login) – nicht nur eine Visitenkarten-Website.
2. **Sichtbare, erklärbare Mängel** – Formular ohne Beschriftung, gesperrter Zoom, unsichtbarer
   Fokus. Das kann die Person am Telefon sofort nachvollziehen.
3. **Erreichbare Entscheidung** – Inhaberin oder Geschäftsführer sind direkt am Telefon.
4. **Keine Erklärung zur Barrierefreiheit** vorhanden – niemand hat sich bisher gekümmert.
5. **Website nicht museal** – wer seit 2011 nichts angefasst hat, kauft auch jetzt nichts;
   wer gerade investiert hat, ist ansprechbar.

## Was einen Lead entwertet

- Website ist eine reine Landingpage eines Portals (z. B. `*.business.site`, Branchenbuch-Profile) –
  der Betrieb kann daran nichts ändern.
- Bereits vorhandene, ernsthafte Barrierefreiheitserklärung und saubere Technik.
- Keine Telefonnummer, kein Impressum, keine Rechtsform → rechtlich unsauber anzusprechen.
