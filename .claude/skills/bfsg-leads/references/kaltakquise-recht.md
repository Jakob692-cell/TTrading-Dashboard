# Rechtlicher Rahmen der Kaltakquise (Recherchestand 13.08.2026)

Arbeitsgrundlage für die eigene Vertriebsarbeit – **keine Rechtsberatung**. Bei ernsthaftem
Rollout einmal anwaltlich prüfen lassen; die Beträge machen es billiger als ein Fehler.

---

## 1. Telefonwerbung – § 7 UWG

**§ 7 Abs. 2 Nr. 1 UWG** (Wortlaut): Eine unzumutbare Belästigung ist stets anzunehmen
„bei Werbung mit einem Telefonanruf gegenüber einem **Verbraucher ohne dessen vorherige
ausdrückliche Einwilligung** oder gegenüber einem **sonstigen Marktteilnehmer ohne dessen
zumindest mutmaßliche Einwilligung**".

Daraus folgt die zentrale Regel dieses Projekts:

| Angerufener | Voraussetzung | Praxis |
| --- | --- | --- |
| Verbraucher (Privatperson) | vorherige **ausdrückliche** Einwilligung | **Nie anrufen.** Ohne Einwilligung schlicht verboten. |
| Gewerbebetrieb / Unternehmen | zumindest **mutmaßliche** Einwilligung | zulässig, wenn ein sachlicher Zusammenhang zum Geschäftsbetrieb besteht |

**§ 20 Abs. 1 Nr. 1, Abs. 2 UWG**: Werbeanrufe bei Verbrauchern ohne ausdrückliche Einwilligung
sind eine Ordnungswidrigkeit mit einer **Geldbuße bis zu 300.000 €**; zuständig ist die
**Bundesnetzagentur**. B2B-Anrufe ohne mutmaßliche Einwilligung sind zwar kein Bußgeldtatbestand
nach dieser Nummer, aber wettbewerbswidrig – Abmahnung, Unterlassungserklärung, Kosten.

### Was „mutmaßliche Einwilligung" praktisch verlangt

Es genügt nicht, dass jemand ein Unternehmen ist. Verlangt wird ein konkreter, sachlicher
Zusammenhang zwischen dem Angebot und dem Geschäftsbetrieb des Angerufenen – der Anruf muss aus
Sicht des Angerufenen erwartbar nützlich sein. Für dieses Angebot lässt sich das gut begründen:

1. Angerufen wird die **veröffentlichte Geschäftsnummer** (Impressum, Branchenverzeichnis).
2. Der Betrieb setzt die Website als **Vertriebs- oder Kontaktkanal** ein.
3. Es wurden **konkrete, benennbare technische Mängel** an genau dieser Website festgestellt.
4. Es gibt einen **aktuellen sachlichen Anlass** (BFSG seit 28.06.2025 anwendbar; Shop-, Buchungs-
   oder Terminfunktionen auf der Seite).

Diese vier Punkte dokumentiert das Werkzeug je Lead (`mutmasslicheEinwilligung`). Fehlt Punkt 3
oder 4, ist der Anruf sachlich schwächer begründet – solche Leads landen in Segment C/D.

**Nicht anrufen**, wenn:
- die Nummer nach Privatanschluss aussieht (kein Impressum, keine Rechtsform, reine Mobilnummer
  ohne Firmenbezug),
- der Betrieb bereits widersprochen hat (→ sofort in `sperrliste.txt`),
- es sich erkennbar um eine öffentliche Stelle handelt (dort gilt BITV 2.0/BGG bzw. Landesrecht,
  und die Beschaffung läuft anders),
- der Kontakt aus einer nicht öffentlichen Quelle stammt.

## 2. E-Mail und Fax – strenger als das Telefon

**§ 7 Abs. 2 Nr. 2 UWG**: Werbung per elektronischer Post, Fax oder Anrufmaschine ist **ohne
vorherige ausdrückliche Einwilligung des Adressaten** stets unzumutbar – **auch gegenüber
Unternehmen**. Die „info@"-Adresse aus dem Impressum ist **keine** Einwilligung.

Praktisch heisst das:
- **Keine kalten Werbe-Mails.** Auch nicht „nur kurz die Ergebnisse".
- Bittet die Ansprechperson **im Telefonat** ausdrücklich um Zusendung, ist das eine Einwilligung
  für genau diese Zusendung → Datum, Uhrzeit, Name und Wortlaut notieren (Beweislast liegt beim
  Werbenden; § 7a UWG verlangt für Verbraucher-Einwilligungen sogar Dokumentation und fünf Jahre
  Aufbewahrung – dieselbe Sorgfalt hier gewohnheitsmäßig anwenden).
- Postbrief ist rechtlich der entspannteste Kanal, aber teurer und langsamer.

## 3. Datenschutz (DSGVO)

- Reine **Unternehmensdaten** (Firma, Zentralnummer, info@-Adresse einer GmbH) sind keine
  personenbezogenen Daten. **Einzelunternehmen, Freiberufler und namentlich genannte
  Geschäftsführer/Inhaber** sind dagegen personenbezogen – dann greift die DSGVO voll.
- Rechtsgrundlage für die Vertriebsrecherche: **Art. 6 Abs. 1 lit. f DSGVO** (berechtigtes
  Interesse an Direktwerbung, vgl. Erwägungsgrund 47) – mit dokumentierter Interessenabwägung.
  Genau dafür gibt es die Felder `mutmasslicheEinwilligung` und `betriebspruefung` im Datensatz.
- **Art. 14 DSGVO**: Werden personenbezogene Daten nicht bei der betroffenen Person erhoben, ist
  sie zu informieren – spätestens bei der ersten Kontaktaufnahme. Praktisch: im Telefonat auf
  Nachfrage die Herkunft nennen („Ihre öffentlich zugängliche Website und OpenStreetMap") und
  einen Hinweis auf die eigene Datenschutzerklärung bereithalten.
- **Art. 21 Abs. 2/3 DSGVO**: Widerspruch gegen Direktwerbung wirkt sofort und ohne Begründung –
  danach keine weitere Ansprache, Eintrag in die Sperrliste.
- Löschfristen setzen: nicht kontaktierte oder abgelehnte Leads nach spätestens 12 Monaten löschen.

## 4. Datenherkunft und Nutzungsrechte

- **OpenStreetMap**: Daten stehen unter der **ODbL**. Für die interne Nutzung unkritisch; bei
  Weitergabe abgeleiteter Datenbanken sind Quellenangabe („© OpenStreetMap-Mitwirkende") und
  Share-alike zu beachten. Nominatim und Overpass haben Nutzungsbedingungen (Rate Limits,
  aussagekräftiger User-Agent) – das Werkzeug hält sich daran.
- **Websites der Betriebe**: Es werden nur öffentlich abrufbare Seiten geladen, robots.txt wird
  beachtet, keine Formularabsendungen, keine Anmeldeversuche, Pausen zwischen den Abrufen.
- **Impressumsdaten** dürfen nicht ohne Weiteres für Werbung zweckentfremdet werden – das ist
  gerade bei E-Mail der Streitpunkt. Für den B2B-**Anruf** gilt § 7 Abs. 2 Nr. 1 UWG (s. o.).

## 5. Was am Telefon nicht gesagt werden darf

Falschbehauptungen sind selbst wettbewerbswidrig (§§ 3, 5 UWG) und zerstören das Geschäft:

| Nicht sagen | Stattdessen |
| --- | --- |
| „Ihre Website ist rechtswidrig." | „Ob das BFSG für Sie gilt, hängt von Unternehmensgrösse und Online-Angebot ab – das kann ich Ihnen nicht abschliessend beantworten." |
| „Sie werden abgemahnt / bekommen ein Bußgeld." | „Es gibt eine Marktüberwachung der Länder, und Verbraucherverbände können tätig werden. Wie wahrscheinlich das für Sie ist, weiss ich nicht." |
| „Ich komme von der Bundesfachstelle / im Auftrag einer Behörde." | Eigene Firma nennen. Identitätsverschleierung ist nach § 7 Abs. 2 Nr. 3 UWG unzulässig. |
| „Ihre Seite ist zu 100 % nicht konform." | „Ich habe drei konkrete Punkte gemessen: …" |
| „Nach der Umsetzung sind Sie garantiert konform." | „Wir bringen die technischen Punkte in Ordnung und dokumentieren das; eine Rechtsgarantie gibt es von uns nicht." |

## 6. Quellen (abgerufen am 13.08.2026)

1. UWG § 7 Unzumutbare Belästigungen: <https://www.gesetze-im-internet.de/uwg_2004/__7.html>
2. UWG § 7a Einwilligungsdokumentation: <https://www.gesetze-im-internet.de/uwg_2004/__7a.html>
3. UWG § 20 Bußgeldvorschriften: <https://www.gesetze-im-internet.de/uwg_2004/__20.html>
4. DSGVO Art. 6, 14, 21 sowie Erwägungsgrund 47: <https://eur-lex.europa.eu/eli/reg/2016/679/oj>
5. DDG § 5 (Impressumspflicht): <https://www.gesetze-im-internet.de/ddg/__5.html>
6. Bundesnetzagentur zu unerlaubter Telefonwerbung:
   <https://www.bundesnetzagentur.de/DE/Vportal/TK/Aerger/UnerlaubteWerbung/start.html>
7. OSM-Nutzungsbedingungen: <https://operations.osmfoundation.org/policies/nominatim/> ·
   <https://wiki.openstreetmap.org/wiki/Overpass_API> · ODbL: <https://opendatacommons.org/licenses/odbl/>
8. BFSG-Grundlagen: siehe `.claude/skills/bfsg-audit/references/rechtsgrundlagen-bfsg.md`
