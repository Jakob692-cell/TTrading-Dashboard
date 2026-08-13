# Checkliste: MANUELLE PRÜFUNG ERFORDERLICH

Automatisierte Tests decken erfahrungsgemäss nur einen Teil der WCAG-Anforderungen ab. Die folgenden
Punkte sind **nicht** oder **nicht abschliessend** automatisiert feststellbar und gehören in jeden
Bericht (Phase 5). Jeder übernommene Punkt wird im Bericht ausdrücklich mit
**„MANUELLE PRÜFUNG ERFORDERLICH"** gekennzeichnet.

## 1. Screenreader und Hilfsmittel

- Bedienbarkeit der Kernprozesse mit NVDA/JAWS (Windows) und VoiceOver (macOS/iOS)
- Vorlesereihenfolge gegenüber der visuellen Reihenfolge
- Ansage von Rollen, Zuständen und Änderungen (aufgeklappt/zugeklappt, ausgewählt, Ladezustand)
- Statusmeldungen (4.1.3): Warenkorb-Änderungen, Filterergebnisse, Fehlerzähler
- Verhalten von Modals: Fokus hinein, Fokusfang, Escape, Fokusrückgabe
- Sprachausgabe fremdsprachiger Passagen (3.1.2)

## 2. Tastatur

- Vollständige Bedienung ohne Maus: Tab, Shift+Tab, Enter, Leertaste, Pfeiltasten, Escape
- Menüs, Tabs, Akkordeons, Datepicker, Autocomplete, Slider, Drag-and-Drop-Ersatz (2.5.7)
- Sichtbarkeit und Kontrast des Fokusindikators auf jedem Hintergrund
- Fokus nicht durch Sticky-Header/Cookie-Layer verdeckt (2.4.11)
- Consent-Layer vollständig per Tastatur bedienbar, kein Zugriff auf Inhalte dahinter

## 3. Inhalt und Verständlichkeit

- Angemessenheit der Alternativtexte (vermitteln sie Zweck und Information?)
- Verständlichkeit der Texte, Fachbegriffe, Abkürzungen
- Aussagekraft von Überschriften und Beschriftungen (2.4.6)
- Verständlichkeit und Hilfestellung von Fehlermeldungen (3.3.1, 3.3.3)
- Kognitive Zugänglichkeit: Konsistenz, Vorhersehbarkeit, Hilfen (3.2.6), Vermeidung von Zeitdruck
- Sind sensorische Anweisungen ("klicken Sie rechts auf das grüne Symbol") vermieden? (1.3.3, 1.4.1)

## 4. Prozesse (BFSG-relevant, Anlage 1 BFSG: Prüfung entlang der realen Schritte)

- Kontaktaufnahme: Formular absenden, Fehlerfall provozieren, Bestätigung prüfen
- Registrierung/Anmeldung inkl. Passwortmanager, 2FA und Captcha-Alternativen (3.3.8, 1.1.1)
- Bestellung/Buchung vollständig bis zur Bestätigung, inkl. Zahlungsschritt (§ 19 BFSGV)
- Widerruf/Stornierung, Kündigungsprozess
- Suche: Eingabe, Vorschläge, Ergebnisliste, "keine Treffer"
- Downloads und Dokumente im Prozess (Rechnungen, Verträge)

## 5. Darstellung

- Zoom 200 % und Textvergrösserung ohne Informationsverlust (1.4.4)
- Textabstände nach 1.4.12 (Zeilenhöhe 1,5; Absatz 2×; Buchstabe 0,12em; Wort 0,16em)
- Reflow bei 320 px ohne horizontales Scrollen (1.4.10) – Screenshots prüfen
- Hoher Kontrastmodus / erzwungene Farben (Windows High Contrast)
- Text auf Bildern und Verläufen: Kontrast punktuell messen
- Hover-/Fokus-Einblendungen: schliessbar, hoverbar, beständig (1.4.13)
- Ausrichtung Hoch-/Querformat (1.3.4)

## 6. Medien

- Qualität, Synchronität und Vollständigkeit von Untertiteln
- Vorhandensein und Qualität von Transkripten und Audiodeskription (1.2.3, 1.2.5)
- Bedienbarkeit des Players per Tastatur und Screenreader
- Blitzen/Flackern (2.3.1) – nur visuell zu beurteilen

## 7. Dokumente

- PDF: Lesereihenfolge, Tag-Struktur, Tabellenköpfe, Alternativtexte, Lesezeichen, Kontraste
  (Werkzeug: PDF Accessibility Checker PAC, Adobe-Prüfung; Ziel: PDF/UA)
- Office-Dateien: Formatvorlagen, Alternativtexte, Sprachauszeichnung

## 8. Organisatorisch/rechtlich

- Inhalt und Auffindbarkeit der Informationen nach § 14 Abs. 1 Nr. 2 i. V. m. Anlage 3 BFSG
- Feedback-/Kontaktmöglichkeit für Barrieremeldungen
- Barrierefreiheitszusagen für eingesetzte Fremdkomponenten (Consent-Tool, Shopsystem,
  Zahlungsdienstleister, Buchungs-Widget)
- Unternehmensgrösse und Umsatz (Kleinstunternehmen-Ausnahme, § 2 Nr. 17 BFSG)
- Bestehende Beurteilungen nach §§ 16, 17 BFSG
