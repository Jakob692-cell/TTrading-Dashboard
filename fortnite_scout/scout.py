#!/usr/bin/env python3
"""
Fortnite Map Scout – findet virale/aufsteigende Fortnite-Creative-/UEFN-Maps über die
offizielle Fortnite Data API und leitet daraus Chancen und Map-Ideen ab.

Befehle:
  python scout.py collect             Daten holen (Genre-Rankings, 7-Tage-Metriken, Katalog)
  python scout.py report              HTML-Report + CSV + Claude-Prompt aus letztem Snapshot
  python scout.py run                 collect + report in einem Schritt
  python scout.py island 4590-4493-7113   Einzelne Map analysieren & mit Genre vergleichen
"""

from __future__ import annotations

import argparse
import csv
import gzip
import json
import os
import sys
import time
from collections import Counter
from datetime import timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from fortnite_api import FortniteDataAPI, iso, utcnow  # noqa: E402
import analysis  # noqa: E402

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"
SNAPS = DATA / "snapshots"
OUT = ROOT / "output"
CATALOG = DATA / "catalog.json.gz"


def _save_gz(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with gzip.open(path, "wt", encoding="utf-8") as fh:
        json.dump(obj, fh, ensure_ascii=False)


def _load_gz(path: Path):
    with gzip.open(path, "rt", encoding="utf-8") as fh:
        return json.load(fh)


# ------------------------------------------------------------------ catalog
def load_catalog(api: FortniteDataAPI, max_age_h: float, refresh: bool) -> list[dict]:
    if CATALOG.exists() and not refresh:
        age_h = (time.time() - CATALOG.stat().st_mtime) / 3600
        if age_h < max_age_h:
            print(f"Katalog aus Cache ({age_h:.1f} h alt)")
            return _load_gz(CATALOG)
    print("Lade kompletten Island-Katalog (~285k Maps, ca. 1–2 Min) ...")
    t = time.time()
    items = []
    for i, isl in enumerate(api.iter_islands(), 1):
        items.append(isl)
        if i % 50000 == 0:
            print(f"  {i} Maps ...", flush=True)
    print(f"  {len(items)} Maps in {time.time() - t:.0f}s")
    _save_gz(CATALOG, items)
    return items


def catalog_stats(items: list[dict]) -> dict:
    tags, words = Counter(), Counter()
    created = Counter()
    for isl in items:
        tags.update(set(isl.get("tags") or []))
        words.update(set(analysis.title_words(isl.get("title") or "")))
        created[isl.get("createdIn") or "?"] += 1
    return {
        "size": len(items),
        "tag_counts": dict(tags),
        "word_counts": {w: c for w, c in words.items() if c >= 5},
        "created_in": dict(created),
    }


# ------------------------------------------------------------------ collect
def collect(args) -> Path:
    api = FortniteDataAPI(max_rps=args.rps)
    now = utcnow()
    print(f"Snapshot {iso(now)}")

    genres = api.genres()
    print(f"{len(genres)} Genres: {', '.join(g['slug'] for g in genres)}")

    times = {"now": None, "d1": now - timedelta(hours=24), "d7": now - timedelta(days=6, hours=22)}
    rankings: dict = {}
    for g in genres:
        rankings[g["slug"]] = {}
        for label, at in times.items():
            rankings[g["slug"]][label] = api.genre_rankings(g["slug"], top=args.top, at=at)
        tot = rankings[g["slug"]]["now"]["meta"].get("total")
        print(f"  {g['displayName']:<22} {tot} Maps im Ranking")

    # Ränge pro Map zusammenführen
    ranks: dict[str, dict] = {}
    for slug, by_t in rankings.items():
        for label, res in by_t.items():
            for it in res["items"]:
                ranks.setdefault(it["code"], {}).setdefault(slug, {"top_n": args.top})[label] = it["rank"]
    # Nur Maps, die JETZT in einer Top-Liste sind (plus Absteiger für Vergleich nicht nötig)
    codes = [c for c, r in ranks.items() if any(v.get("now") for v in r.values())]
    print(f"{len(codes)} Maps aktuell in den Top-{args.top} eines Genres")

    catalog = None
    stats = None
    if not args.no_catalog:
        catalog = load_catalog(api, args.catalog_max_age, args.refresh_catalog)
        stats = catalog_stats(catalog)
    meta_by_code = {i["code"]: i for i in catalog} if catalog else {}

    missing = [c for c in codes if c not in meta_by_code]
    if missing:
        print(f"Lade Metadaten für {len(missing)} Maps ...")
        for c, m in zip(missing, api.many(api.island, missing, workers=args.workers, progress="Meta")):
            if m:
                meta_by_code[c] = m

    print(f"Lade 7-Tage-Metriken für {len(codes)} Maps ...")
    metrics = api.many(lambda c: api.island_metrics(c, "day", 7), codes,
                       workers=args.workers, progress="Metriken")

    islands = {}
    for c, m in zip(codes, metrics):
        meta = meta_by_code.get(c, {"code": c})
        islands[c] = {**{k: meta.get(k) for k in ("code", "title", "creatorCode", "createdIn", "tags")},
                      "metrics": m, "ranks": ranks[c]}

    snapshot = {
        "generated_at": iso(now),
        "top_n": args.top,
        "genres": genres,
        "rankings": rankings,
        "islands": islands,
        "ecosystem": api.ecosystem_metrics("day"),
        "catalog_stats": stats,
    }
    path = SNAPS / f"snapshot_{now.strftime('%Y%m%d_%H%M')}.json.gz"
    _save_gz(path, snapshot)
    _save_gz(DATA / "latest.json.gz", snapshot)
    print(f"Gespeichert: {path.relative_to(ROOT)}")
    return path


# ------------------------------------------------------------------- report
def _fmt(v, nd=0):
    return "" if v is None else (f"{v:.{nd}f}" if isinstance(v, float) else v)


def report(args) -> None:
    src = Path(args.snapshot) if args.snapshot else DATA / "latest.json.gz"
    if not src.exists():
        sys.exit("Kein Snapshot gefunden – zuerst `python scout.py collect` ausführen.")
    snap = _load_gz(src)
    res = analysis.analyze(snap)
    OUT.mkdir(exist_ok=True)

    feats = [f for f in res["features"] if f.get("viral_score") is not None]
    feats.sort(key=lambda f: -f["viral_score"])
    with open(OUT / "maps.csv", "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["viral_score", "quality_score", "code", "title", "creator", "genre", "rank", "rank_vor_7d",
                    "spieler_pro_tag", "peak_ccu", "wachstum_x", "d1_retention", "d7_retention",
                    "minuten_pro_spieler", "fav_rec_pro_1000", "tags"])
        for f in feats:
            w.writerow([f["viral_score"], f["quality_score"], f["code"], f["title"], f["creator"], f["genre"],
                        f["rank"], f["rank_d7"], _fmt(f["players_avg"]), f["peak_ccu"], _fmt(f["growth"], 2),
                        _fmt(f["d1"], 3), _fmt(f["d7"], 3), _fmt(f["minutes"], 1), _fmt(f["social"], 1),
                        "|".join(f["tags"])])

    slim = {k: v for k, v in res.items() if k != "features"}
    slim["generated_at"] = snap["generated_at"]
    slim["top_breakouts"] = feats[:50]
    with open(OUT / "analysis.json", "w", encoding="utf-8") as fh:
        json.dump(slim, fh, ensure_ascii=False, indent=1, default=str)

    from report_html import render_html, render_prompt
    (OUT / "report.html").write_text(render_html(snap, res), encoding="utf-8")
    (OUT / "ideen_prompt.md").write_text(render_prompt(snap, res), encoding="utf-8")

    print(f"Report:   {(OUT / 'report.html').relative_to(ROOT.parent)}")
    print(f"Tabelle:  {(OUT / 'maps.csv').relative_to(ROOT.parent)}")
    print(f"Prompt:   {(OUT / 'ideen_prompt.md').relative_to(ROOT.parent)}")
    print("\nTop-10 Breakout-Maps (Viral-Score):")
    for f in feats[:10]:
        g = "neu" if f.get("growth_new") else (f"{f['growth_rel']:.2f}x" if f["growth_rel"] else "  – ")
        print(f"  {f['viral_score']:5.1f}  {f['code']}  {g:>6}  {int(f['players_avg'] or 0):>8} Sp/Tag  {f['title'][:48]}")
    print("\nGenres nach Chancen-Score:")
    for gr in res["genres"][:5]:
        print(f"  {gr['opportunity']:5.1f}  {gr['name']}")


# ------------------------------------------------------------------- island
def island_cmd(args) -> None:
    api = FortniteDataAPI()
    code = args.code.strip()
    meta = api.island(code)
    if not meta:
        sys.exit(f"Map {code} nicht gefunden (nicht öffentlich/discoverable?).")
    metrics = api.island_metrics(code, "day", 7)
    rk = api.island_rankings(code)
    ranks = {}
    for snap in rk[-1:]:
        for g in snap.get("genres", []):
            ranks[g["genreSlug"]] = {"now": g["rank"]}
    hist = api.island_rankings(code, hours=24 * 6 + 22)
    if hist:
        for g in hist[0].get("genres", []):
            ranks.setdefault(g["genreSlug"], {})["d7"] = g["rank"]
    today = utcnow().strftime("%Y-%m-%d")
    f = analysis.island_features({**meta, "metrics": metrics, "ranks": ranks}, today)

    print(f"\n{meta['title']}  ({code})  von {meta.get('creatorCode')}  [{meta.get('createdIn')}]")
    print(f"Tags: {', '.join(meta.get('tags') or [])}")
    for slug, r in ranks.items():
        print(f"Rang {slug}: {r.get('now')}  (vor ~7 Tagen: {r.get('d7') or '–'})")
    print("\nTag        PeakCCU  Spieler   Plays  Min/Sp  Fav  Rec   D1    D7")
    for i, row in enumerate((metrics or {}).get("peakCCU", [])):
        ts = row["timestamp"][:10]
        g = lambda k, sub="value": ((metrics.get(k) or [{}] * 99)[i] or {}).get(sub)  # noqa: E731
        print(f"{ts}  {_fmt(g('peakCCU')):>7}  {_fmt(g('uniquePlayers')):>7}  {_fmt(g('plays')):>6}  "
              f"{_fmt(g('averageMinutesPerPlayer'), 1):>6}  {_fmt(g('favorites')):>3}  {_fmt(g('recommendations')):>3}  "
              f"{_fmt(g('retention', 'd1'), 2):>4}  {_fmt(g('retention', 'd7'), 2):>4}")

    if f["growth_new"]:
        print("\nWachstum: neu (erst seit < 4 Tagen mit Daten)")
    else:
        print(f"\nWachstum Peak-CCU (Ø letzte 2 Tage vs. Median davor): {_fmt(f['growth'], 2)}x")
    print(f"Fav+Rec pro 1000 Spieler: {_fmt(f['social'], 1)}")

    latest = DATA / "latest.json.gz"
    if latest.exists():
        res = analysis.analyze(_load_gz(latest))
        b = analysis.benchmark_island(f, res["features"])
        labels = {"players_avg": "Spieler/Tag", "peak_ccu": "Peak CCU", "growth": "Wachstum",
                  "d1": "D1-Retention", "d7": "D7-Retention", "minutes": "Minuten/Spieler",
                  "social": "Fav+Rec-Rate"}
        print(f"\nVergleich mit {b['peer_count']} getrackten Maps im Genre '{f['genre'] or 'alle'}' (Perzentil):")
        for k, p in b["percentiles"].items():
            bar = "█" * int((p or 0) * 20)
            print(f"  {labels[k]:<16} {'–' if p is None else f'{p * 100:4.0f}%'}  {bar}")
    else:
        print("\n(Für Genre-Vergleich zuerst `python scout.py collect` ausführen.)")


def main():
    ap = argparse.ArgumentParser(description="Fortnite Map Scout")
    sub = ap.add_subparsers(dest="cmd", required=True)

    def add_collect_args(p):
        p.add_argument("--top", type=int, default=250, help="Top-N je Genre (Standard 250)")
        p.add_argument("--workers", type=int, default=12)
        p.add_argument("--rps", type=float, default=40.0, help="max. Requests/Sekunde")
        p.add_argument("--no-catalog", action="store_true", help="Katalog-Crawl überspringen")
        p.add_argument("--refresh-catalog", action="store_true")
        p.add_argument("--catalog-max-age", type=float, default=72.0, help="Stunden")

    p = sub.add_parser("collect"); add_collect_args(p)
    p = sub.add_parser("report"); p.add_argument("--snapshot")
    p = sub.add_parser("run"); add_collect_args(p)
    p = sub.add_parser("island"); p.add_argument("code")
    args = ap.parse_args()

    if args.cmd == "collect":
        collect(args)
    elif args.cmd == "report":
        report(args)
    elif args.cmd == "run":
        args.snapshot = str(collect(args))
        report(args)
    elif args.cmd == "island":
        island_cmd(args)


if __name__ == "__main__":
    main()
