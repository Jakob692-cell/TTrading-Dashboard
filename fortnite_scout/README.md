# Fortnite Map Scout

Findet virale und aufsteigende Fortnite-Creative-/UEFN-Maps über die **offizielle Fortnite Data API**
von Epic Games. Daraus leitet das Tool Chancen und Map-Ideen ab.

- API: `https://api.fortnite.com/ecosystem/v1`, Doku: <https://api.fortnite.com/ecosystem/v1/docs/>
- **Kein API-Key nötig.** Es muss nur ein User-Agent gesetzt sein, sonst blockt Cloudflare mit 403.
- Einzige Abhängigkeit: `requests`.

## Schnellstart

```bash
cd fortnite_scout
pip install -r requirements.txt
python scout.py run                     # Daten holen + Report bauen (~4 Min)
python scout.py island 9821-7888-3528   # eine Map prüfen und mit ihrem Genre vergleichen
```

Ergebnisse in `output/`:

| Datei | Inhalt |
|---|---|
| `report.html` | Dashboard: Map-Ideen, Breakout-Maps, Genre-/Tag-Chancen, Trend-Wörter und Titel-Muster, größte Maps (sortier- und filterbar, Dark Mode) |
| `maps.csv` | alle bewerteten Maps mit allen Kennzahlen (z. B. für Excel/Sheets) |
| `ideen_prompt.md` | Datenbriefing zum Einfügen in Claude, das daraus 10 konkrete Map-Konzepte macht |
| `analysis.json` | alle Analyse-Ergebnisse maschinenlesbar |

## Befehle

| Befehl | Was passiert |
|---|---|
| `collect` | Lädt die Top-250 jedes der 13 Genres (jetzt, vor 24 h, vor ~7 Tagen), dazu die 7-Tage-Metriken aller dieser Maps (~3.000) und den kompletten Katalog (~285k Maps, wird 72 h gecacht). Speichert einen Snapshot in `data/snapshots/`. |
| `report` | Analysiert den letzten Snapshot und schreibt `output/` (`--snapshot PFAD` für einen älteren). |
| `run` | `collect` und danach `report`. |
| `island CODE` | Tageswerte, Genre-Rang und Perzentil-Vergleich mit dem Genre für eine Map, z. B. deine eigene. |

Optionen für `collect`/`run`: `--top 500` (tiefer ins Ranking), `--no-catalog` (schneller, aber ohne
Angebots-Analyse), `--refresh-catalog`, `--rps 40`, `--workers 12`.

## Was die API liefert

| Endpoint | Daten |
|---|---|
| `/islands` | alle öffentlichen Maps: Code, Titel, Creator, Tags, UEFN/FNC |
| `/islands/{code}/metrics/{day\|hour\|minute}` | Peak CCU, Unique Players, Plays, Minuten gesamt und pro Spieler, Favoriten, Empfehlungen, D1-/D7-Retention |
| `/islands/{code}/rankings` | Genre-Rang der Map, stündlich |
| `/genres`, `/genres/{slug}/rankings` | Rangliste pro Genre (stündliche Snapshots, `at=` für die Vergangenheit) |
| `/metrics/{interval}` | Spieler in ganz Fortnite (In-Match- und In-Client-Peak-CCU) |

Grenzen: Die API hat nur **7 Tage Historie**. Wer `collect` regelmäßig laufen lässt (z. B. täglich), baut in
`data/snapshots/` eine längere Historie auf. Maps mit weniger als 5 Spielern pro Intervall liefern `null`.

## Kennzahlen

- **Viral-Score (0–100):** Perzentil-Mix über alle Maps mit ≥ 300 Spielern/Tag:
  Wachstum 30 %, Rang-Aufstieg in 7 Tagen 20 %, (Favoriten + Empfehlungen) pro Spieler 20 %, D1-Retention 15 %, Minuten pro Spieler 15 %.
- **Wachstum:** Ø Peak-CCU der letzten 2 vollen Tage ÷ Median der Tage davor, geteilt durch denselben Wert für
  ganz Fortnite. So verzerren Live-Events (z. B. der Spike am 21.11.) das Bild nicht. Maps mit weniger als
  4 Tagen Daten gelten als „neu“.
- **Genre-Chance:** Spieler/Tag einer Map auf Platz 11–50 (35 %), Genre-Wachstum (25 %), neue Maps in den Top 50 (15 %),
  wenig Dominanz der Top 3 (15 %), wenig Konkurrenz (10 %).
- **Tag-Lift:** Anteil eines Tags an den Spielern ÷ Anteil an allen Maps im Katalog. Werte über 1 heißen: mehr Nachfrage als Angebot.
- **Trend-Wörter und Titel-Muster:** Wörter, Wortpaare und Muster (z. B. „[TYCOON]“-Klammer, „+1 … Evolution“,
  „Steal a …“, saisonale Begriffe), die bei Breakouts häufiger vorkommen als bei allen bewerteten Maps.

Gewichte und Schwellen stehen oben in `analysis.py` (`MIN_PLAYERS`, `score_islands`, `genre_overview`).
