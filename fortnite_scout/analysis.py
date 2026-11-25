"""
Analyse eines Snapshots: Kennzahlen pro Map, Viral-Score, Genre-/Tag-Chancen,
Trend-Keywords im Titel und daraus abgeleitete Map-Ideen.
"""

from __future__ import annotations

import math
import re
import statistics as st
from collections import Counter, defaultdict
from itertools import combinations

MIN_PLAYERS = 300  # Ø Unique Players/Tag, damit eine Map in Scores eingeht

STOPWORDS = {
    "THE", "A", "AN", "OF", "AND", "OR", "IN", "ON", "TO", "FOR", "WITH", "BY", "MY", "YOUR",
    "IS", "IT", "AT", "VS", "X", "DE", "LA", "EL", "LE", "DER", "DIE", "DAS", "UND", "MAP",
    "FORTNITE", "FN", "NEW", "V2", "V3", "2", "3", "1", "100", "&", "-", "|", "+",
}

EMOJI_RE = re.compile(
    "[\U0001F000-\U0001FAFF☀-➿⬀-⯿️‍⌀-⏿←-⇿■-◿]"
)
WORD_RE = re.compile(r"[A-Za-zÀ-ÿ0-9']+")


# --------------------------------------------------------------------- utils
def _vals(series, key="value"):
    return [x.get(key) for x in (series or [])]


def _mean(xs):
    xs = [x for x in xs if x is not None]
    return sum(xs) / len(xs) if xs else None


def _pct_rank(values: dict) -> dict:
    """Perzentil-Rang (0..1) je Key; None bleibt None."""
    items = sorted((v, k) for k, v in values.items() if v is not None)
    n = len(items)
    out = {k: None for k in values}
    for i, (v, k) in enumerate(items):
        out[k] = (i + 0.5) / n if n else None
    return out


def title_words(title: str) -> list[str]:
    words = [w.upper().strip("'") for w in WORD_RE.findall(title or "")]
    return [w for w in words if len(w) > 1 and w not in STOPWORDS and not w.isdigit()]


def has_emoji(title: str) -> bool:
    return bool(EMOJI_RE.search(title or ""))


def _growth(series: list, smooth: float = 10.0) -> float | None:
    """Ø der letzten 2 vollen Tage vs. Median der Tage davor (robust gegen Event-Spikes)."""
    if len(series) < 4:
        return None
    recent = _mean(series[-2:])
    earlier = [x for x in series[:-2] if x is not None]
    if recent is None:
        return None
    base = st.median(earlier) if earlier else 0
    return (recent + smooth) / (base + smooth)


def ecosystem_growth(snapshot: dict) -> float | None:
    today = snapshot["generated_at"][:10]
    eco = (snapshot.get("ecosystem") or {}).get("inMatchPeakCCU") or []
    vals = [x["value"] for x in eco if not x["timestamp"].startswith(today)]
    return _growth(vals, smooth=0)


# ------------------------------------------------------------- per island
def island_features(isl: dict, today: str, eco_growth: float | None = None) -> dict:
    m = isl.get("metrics") or {}

    def full_days(key, sub="value"):
        return [x.get(sub) for x in m.get(key, []) if not x["timestamp"].startswith(today)]

    ccu = full_days("peakCCU")
    up = full_days("uniquePlayers")
    fav = full_days("favorites")
    rec = full_days("recommendations")
    mins = full_days("averageMinutesPerPlayer")
    d1 = full_days("retention", "d1")
    d7 = full_days("retention", "d7")
    plays = full_days("plays")

    ccu_clean = [c for c in ccu if c is not None]
    players_avg = _mean(up)
    up_sum = sum(x for x in up if x)

    earlier_days = sum(1 for x in ccu[:-2] if x is not None)
    growth_new = earlier_days < 2 and any(x is not None for x in ccu[-2:])
    growth = None if growth_new else _growth(ccu)

    social = None
    if up_sum >= 50:
        social = 1000 * (sum(x for x in fav if x) + sum(x for x in rec if x)) / up_sum

    ranks = isl.get("ranks", {})  # slug -> {now, d1, d7}
    best_genre, best = None, None
    for slug, r in ranks.items():
        if r.get("now") and (best is None or r["now"] < best["now"]):
            best_genre, best = slug, r

    climb = None
    if best:
        prev = best.get("d7") or best.get("d1")
        # nicht in alter Top-Liste -> so behandeln, als wäre sie knapp darunter gewesen
        prev = prev or (best.get("top_n", 250) + 50)
        climb = math.log(prev / best["now"])

    return {
        "code": isl["code"],
        "title": isl.get("title") or isl["code"],
        "creator": isl.get("creatorCode"),
        "createdIn": isl.get("createdIn"),
        "tags": isl.get("tags") or [],
        "genre": best_genre,
        "rank": best["now"] if best else None,
        "rank_d1": best.get("d1") if best else None,
        "rank_d7": best.get("d7") if best else None,
        "new_in_top": bool(best) and not best.get("d7"),
        "ranks": ranks,
        "ccu_series": ccu,
        "peak_ccu": max(ccu_clean) if ccu_clean else None,
        "ccu_last": ccu[-1] if ccu else None,
        "players_avg": players_avg,
        "plays_per_player": (_mean(plays) / players_avg) if players_avg and _mean(plays) else None,
        "growth": growth,
        "growth_rel": (growth / eco_growth) if (growth and eco_growth) else growth,
        "growth_new": growth_new,
        "climb": climb,
        "social": social,
        "d1": _mean(d1),
        "d7": _mean(d7),
        "minutes": _mean(mins),
    }


def score_islands(feats: list[dict]) -> list[dict]:
    pool = [f for f in feats if (f["players_avg"] or 0) >= MIN_PLAYERS]
    keyed = {f["code"]: f for f in pool}
    p_growth = _pct_rank({k: (math.log(f["growth_rel"]) if f["growth_rel"] else None) for k, f in keyed.items()})
    for k, f in keyed.items():  # brandneue Maps: Wachstum nicht messbar -> hohes, aber gedeckeltes Perzentil
        if f.get("growth_new"):
            p_growth[k] = 0.85
    p_climb = _pct_rank({k: f["climb"] for k, f in keyed.items()})
    p_social = _pct_rank({k: f["social"] for k, f in keyed.items()})
    p_d1 = _pct_rank({k: f["d1"] for k, f in keyed.items()})
    p_min = _pct_rank({k: f["minutes"] for k, f in keyed.items()})
    p_size = _pct_rank({k: math.log(f["players_avg"]) for k, f in keyed.items()})

    weights = [(p_growth, .30), (p_climb, .20), (p_social, .20), (p_d1, .15), (p_min, .15)]
    for k, f in keyed.items():
        num = den = 0.0
        for p, w in weights:
            if p[k] is not None:
                num += p[k] * w
                den += w
        f["viral_score"] = round(100 * num / den, 1) if den else None
        f["quality_score"] = round(100 * _mean([p_d1[k], p_min[k], p_social[k]]), 1) \
            if _mean([p_d1[k], p_min[k], p_social[k]]) is not None else None
        f["size_pct"] = p_size[k]
    for f in feats:
        f.setdefault("viral_score", None)
        f.setdefault("quality_score", None)
    return feats


# --------------------------------------------------------------- genres
def genre_overview(snapshot: dict, feats: list[dict]) -> list[dict]:
    by_code = {f["code"]: f for f in feats}
    rows = []
    for g in snapshot["genres"]:
        slug = g["slug"]
        rk = snapshot["rankings"].get(slug, {})
        codes = [x["code"] for x in rk.get("now", {}).get("items", [])]
        fs = [by_code[c] for c in codes if c in by_code]
        players = [f["players_avg"] or 0 for f in fs]
        total_players = sum(players)
        top3 = sum(sorted(players, reverse=True)[:3])
        growths = [f["growth_rel"] for f in fs if f["growth_rel"] and (f["players_avg"] or 0) >= MIN_PLAYERS]
        supply = rk.get("now", {}).get("meta", {}).get("total") or len(codes)
        supply_d7 = rk.get("d7", {}).get("meta", {}).get("total")
        # Wie viele Spieler bekommt eine Map auf Platz 11-50 im Schnitt? (= erreichbares Ziel)
        mid = [f["players_avg"] or 0 for f in fs if f.get("ranks", {}).get(slug, {}).get("now")
               and 11 <= f["ranks"][slug]["now"] <= 50]
        new_entries = sum(1 for f in fs if f["ranks"].get(slug, {}).get("now", 999) <= 50
                          and not f["ranks"][slug].get("d7"))
        rows.append({
            "slug": slug,
            "name": g["displayName"],
            "supply": supply,
            "supply_change": (supply - supply_d7) / supply_d7 if supply_d7 else None,
            "players_top": total_players,
            "players_per_island": total_players / supply if supply else 0,
            "mid_tier_players": _mean(mid),
            "top3_share": top3 / total_players if total_players else None,
            "growth_median": st.median(growths) if growths else None,
            "new_in_top50": new_entries,
            "d1_top10": _mean([f["d1"] for f in sorted(fs, key=lambda f: -(f["players_avg"] or 0))[:10]]),
            "min_top10": _mean([f["minutes"] for f in sorted(fs, key=lambda f: -(f["players_avg"] or 0))[:10]]),
        })
    # Chancen-Score: Nachfrage je Map (Platz 11-50), Wachstum, Offenheit (neue Maps), wenig Monopol
    p_mid = _pct_rank({r["slug"]: math.log((r["mid_tier_players"] or 1)) for r in rows})
    p_growth = _pct_rank({r["slug"]: r["growth_median"] for r in rows})
    p_new = _pct_rank({r["slug"]: r["new_in_top50"] for r in rows})
    p_open = _pct_rank({r["slug"]: (1 - r["top3_share"]) if r["top3_share"] is not None else None for r in rows})
    p_sup = _pct_rank({r["slug"]: -math.log(r["supply"] or 1) for r in rows})
    for r in rows:
        s = r["slug"]
        parts = [(p_mid[s], .35), (p_growth[s], .25), (p_new[s], .15), (p_open[s], .15), (p_sup[s], .10)]
        num = sum(p * w for p, w in parts if p is not None)
        den = sum(w for p, w in parts if p is not None)
        r["opportunity"] = round(100 * num / den, 1) if den else None
    return sorted(rows, key=lambda r: -(r["opportunity"] or 0))


# ----------------------------------------------------------------- tags
def tag_analysis(feats: list[dict], catalog_tag_counts: dict | None) -> list[dict]:
    scored = [f for f in feats if (f["players_avg"] or 0) >= MIN_PLAYERS]
    demand = Counter()
    islands = defaultdict(list)
    for f in scored:
        for t in f["tags"]:
            demand[t] += f["players_avg"]
            islands[t].append(f)
    total_demand = sum(f["players_avg"] for f in scored) or 1

    supply = Counter(catalog_tag_counts or {})
    if not supply:  # Fallback: Verbreitung unter allen getrackten Maps
        for f in feats:
            supply.update(f["tags"])
    total_supply = sum(supply.values()) or 1

    rows = []
    for t, d in demand.items():
        fs = islands[t]
        if len(fs) < 3 or supply.get(t, 0) < 20:
            continue
        growths = [f["growth_rel"] for f in fs if f["growth_rel"]]
        viral = [f["viral_score"] for f in fs if f["viral_score"] is not None]
        rows.append({
            "tag": t,
            "maps_tracked": len(fs),
            "supply": supply.get(t, 0),
            "demand_share": d / total_demand,
            "supply_share": supply.get(t, 0) / total_supply,
            "lift": (d / total_demand) / (supply.get(t, 0) / total_supply),
            "growth_median": st.median(growths) if growths else None,
            "viral_avg": _mean(viral),
            "examples": [f["title"] for f in sorted(fs, key=lambda f: -(f["viral_score"] or 0))[:3]],
        })
    p_lift = _pct_rank({r["tag"]: math.log(r["lift"]) for r in rows})
    p_g = _pct_rank({r["tag"]: r["growth_median"] for r in rows})
    p_v = _pct_rank({r["tag"]: r["viral_avg"] for r in rows})
    for r in rows:
        t = r["tag"]
        r["opportunity"] = round(100 * (.45 * p_lift[t] + .30 * (p_g[t] or 0) + .25 * (p_v[t] or 0)), 1)
    return sorted(rows, key=lambda r: -r["opportunity"])


def tag_combos(feats: list[dict], top_share: float = 0.15, min_count: int = 3) -> list[dict]:
    scored = [f for f in feats if f.get("viral_score") is not None]
    if not scored:
        return []
    scored.sort(key=lambda f: -f["viral_score"])
    n_top = max(10, int(len(scored) * top_share))
    top = scored[:n_top]
    all_pairs, top_pairs = Counter(), Counter()
    examples = defaultdict(list)
    for f in scored:
        for p in combinations(sorted(set(f["tags"])), 2):
            all_pairs[p] += 1
    for f in top:
        for p in combinations(sorted(set(f["tags"])), 2):
            top_pairs[p] += 1
            examples[p].append(f["title"])
    rows = []
    for p, c in top_pairs.items():
        if c < min_count:
            continue
        lift = (c / n_top) / (all_pairs[p] / len(scored))
        rows.append({"tags": list(p), "count_breakout": c, "count_all": all_pairs[p],
                     "lift": lift, "examples": examples[p][:3]})
    return sorted(rows, key=lambda r: (-r["lift"] * math.log(1 + r["count_breakout"])))


# -------------------------------------------------------------- keywords
TITLE_PATTERNS = {
    "[GENRE]-Klammer am Ende (z.B. „… [TYCOON]“)": r"\[[^\]]{2,20}\]\s*$",
    "„+1 … pro Klick/Sekunde“": r"^\+\s?1\b|\+1 ",
    "„… Evolution“": r"\bEVOLUTION\b",
    "„Steal a/an …“": r"\bSTEAL\b",
    "„Build a/your …“": r"\bBUILD\b",
    "„Escape / Prison / Obby“": r"\b(ESCAPE|PRISON|OBBY)\b",
    "Tycoon / Simulator": r"\b(TYCOON|SIMULATOR|SIM)\b",
    "Hide and Seek / Prop Hunt": r"\b(HIDE|SEEK|PROP HUNT)\b",
    "Saisonal (Christmas/Winter/Santa)": r"\b(CHRISTMAS|XMAS|WINTER|SANTA|SNOW)\b",
    "RP / Roleplay": r"\b(RP|ROLEPLAY)\b",
    "1v1 / Zonewars / Boxfight": r"\b(1V1|ZONE ?WARS|BOX ?FIGHTS?)\b",
    "Level-/Zahl im Titel (100 LEVEL, 999…)": r"\b\d{2,4}\s*(LEVEL|LEVELS|STAGES?)\b|\b(99|100|999|1000)\b",
    "Emoji im Titel": None,
}


def _pattern_hit(name, rx, title):
    if rx is None:
        return has_emoji(title)
    return bool(re.search(rx, (title or "").upper()))


def title_bigrams(title: str) -> list[str]:
    words = [w.upper() for w in WORD_RE.findall(title or "")]
    return [f"{a} {b}" for a, b in zip(words, words[1:]) if not (a.isdigit() and b.isdigit())]


def keyword_trends(feats: list[dict], catalog_word_counts: dict | None, catalog_size: int | None) -> dict:
    scored = [f for f in feats if f.get("viral_score") is not None]
    scored.sort(key=lambda f: -f["viral_score"])
    breakout = scored[: max(20, len(scored) // 6)]
    by_players = sorted(scored, key=lambda f: -(f["players_avg"] or 0))[:100]

    def doc_freq(fs, fn):
        c = Counter()
        for f in fs:
            c.update(set(fn(f["title"])))
        return c

    def trend_rows(fn, min_c):
        bo, allw = doc_freq(breakout, fn), doc_freq(scored, fn)
        rows = []
        for w, c in bo.items():
            if c < min_c:
                continue
            lift = (c / len(breakout)) / (allw[w] / len(scored))
            cat = None
            if catalog_word_counts and catalog_size and " " not in w:
                cat = catalog_word_counts.get(w, 0) / catalog_size
            rows.append({"word": w, "breakout_maps": c, "tracked_maps": allw[w], "lift": lift,
                         "catalog_rate": cat,
                         "examples": [f["title"] for f in breakout if w in fn(f["title"])][:3]})
        rows.sort(key=lambda r: -(r["lift"] * math.log(1 + r["breakout_maps"])))
        return rows

    patterns = []
    for name, rx in TITLE_PATTERNS.items():
        b = [f for f in breakout if _pattern_hit(name, rx, f["title"])]
        a = [f for f in scored if _pattern_hit(name, rx, f["title"])]
        t = [f for f in by_players if _pattern_hit(name, rx, f["title"])]
        if not a:
            continue
        patterns.append({
            "pattern": name,
            "rate_breakout": len(b) / len(breakout),
            "rate_top100": len(t) / len(by_players) if by_players else None,
            "rate_all": len(a) / len(scored),
            "lift": (len(b) / len(breakout)) / (len(a) / len(scored)),
            "examples": [f["title"] for f in b[:3]],
        })
    patterns.sort(key=lambda r: -r["lift"])

    def style(fs):
        if not fs:
            return {}
        titles = [f["title"] for f in fs]
        letters = [sum(ch.isalpha() for ch in t) or 1 for t in titles]
        return {
            "emoji_rate": sum(has_emoji(t) for t in titles) / len(titles),
            "caps_rate": sum((sum(ch.isupper() for ch in t) / l) > 0.7 for t, l in zip(titles, letters)) / len(titles),
            "avg_len": _mean([len(t) for t in titles]),
            "number_rate": sum(bool(re.search(r"\d", t)) for t in titles) / len(titles),
        }

    return {"keywords": trend_rows(title_words, 3)[:40],
            "bigrams": trend_rows(title_bigrams, 3)[:25],
            "patterns": patterns,
            "style_breakout": style(breakout), "style_top": style(by_players), "style_all": style(scored)}


# ------------------------------------------------------------------ ideas
GENRE_HOOKS = {
    "horror": "kurze Jump-Scare-Runden (5–10 Min) im Koop für 2–4 Spieler, ein klar erkennbares Monster",
    "simulation-tycoon": "sichtbarer Fortschritt in den ersten 60 Sekunden + Rebirth-/Prestige-Loop",
    "party-mini-games": "Runden unter 3 Minuten, Lobby-Voting, Chaos-Momente, die sich clippen lassen",
    "deathrun-platformer": "Level-Nummern im Titel, faire Checkpoints, „nur 1 % schaffen es“-Challenge",
    "shooter": "sofort in der Action spawnen, Kill-Streaks, Ranked-/Leaderboard-Gefühl",
    "battle-royale": "kleinere Lobbys, schnelle Zone, bekanntes Loot mit einem Twist",
    "roleplaying-social": "Rollen, Jobs, Häuser und tägliche Belohnungen als Grund zum Wiederkommen",
    "adventure-rpg": "klarer Quest-Faden, Loot-Seltenheiten, alle ~10 Minuten ein Boss",
    "sports-racing": "Matches unter 5 Minuten, Upgrades für Fahrzeuge oder Skills",
    "survival": "Wellen-System, Basebau, Koop gegen KI",
    "strategy": "einfacher Einstieg, tiefe Meta, Team-Rollen",
    "roguelike": "Run-basierte Upgrades, jede Runde anders, Meta-Progression zwischen Runs",
    "music-rhythm": "bekannte Beats, Combo-Multiplikator, Gruppen-Performance",
}

GENERIC_TAGS = {"just for fun", "casual", "action", "multiplayer", "fun", "single player", "pvp",
                "free for all", "practice", "minigame"}


def _genre_tokens(g):
    toks = {w.upper() for w in WORD_RE.findall(g["name"] + " " + g["slug"].replace("-", " "))}
    return toks | {t.rstrip("S") for t in toks} | {"RPG", "RP"} if g["slug"] == "roleplaying-social" else \
        toks | {t.rstrip("S") for t in toks}


def build_ideas(genres: list[dict], tags: list[dict], combos: list[dict], kw: dict,
                feats: list[dict], n: int = 8) -> list[dict]:
    by_genre = defaultdict(list)
    for f in feats:
        if f["genre"] and f.get("viral_score") is not None:
            by_genre[f["genre"]].append(f)
    tag_opp = {t["tag"]: t["opportunity"] for t in tags}
    pattern_rx = dict(TITLE_PATTERNS)
    ideas = []
    for g in genres:
        if len(ideas) >= n:
            break
        pool = by_genre.get(g["slug"], [])
        fs = sorted(pool, key=lambda f: -f["viral_score"])
        if len(fs) < 5:
            continue
        breakout = fs[:10]
        gtok = _genre_tokens(g)

        # Tags, die bei den Breakouts dieses Genres häufiger sind als im restlichen Genre
        bo_c = Counter(t for f in breakout for t in set(f["tags"]))
        all_c = Counter(t for f in pool for t in set(f["tags"]))
        cand = []
        for t, c in bo_c.items():
            if c < 2 or t in GENERIC_TAGS or t.upper().replace(" ", "") in {x.replace(" ", "") for x in gtok}:
                continue
            lift = (c / len(breakout)) / (all_c[t] / len(pool))
            cand.append((lift * (1 + (tag_opp.get(t, 50) / 100)), t))
        mech_tags = [t for _, t in sorted(cand, reverse=True)[:3]]

        # Themen-Wörter aus den Titeln der Breakouts (ohne Genre-Wörter)
        words = Counter(w for f in breakout for w in set(title_words(f["title"])) if w not in gtok)
        trend_words = {k["word"]: k["lift"] for k in kw["keywords"]}
        hot = sorted(((trend_words.get(w, 1.0) * c, w) for w, c in words.items() if c >= 2), reverse=True)
        hot_words = [w for _, w in hot[:4]]

        # bestes Titel-Muster in diesem Genre
        best_pat, best_rate = None, 0
        for p in kw.get("patterns", []):
            rx = pattern_rx.get(p["pattern"], "__none__")
            rate = sum(_pattern_hit(p["pattern"], rx, f["title"]) for f in breakout) / len(breakout)
            if rate > best_rate and p["lift"] > 1:
                best_pat, best_rate = p["pattern"], rate

        ideas.append({
            "genre": g["name"],
            "genre_slug": g["slug"],
            "opportunity": g["opportunity"],
            "tags": mech_tags,
            "keywords": hot_words,
            "title_pattern": best_pat,
            "title_pattern_rate": best_rate,
            "hook": GENRE_HOOKS.get(g["slug"], ""),
            "benchmarks": [{"title": b["title"], "code": b["code"], "viral": b["viral_score"],
                            "players": b["players_avg"], "growth": b["growth_rel"],
                            "new": b.get("growth_new")} for b in breakout[:3]],
            "target_d1": _mean([f["d1"] for f in breakout]),
            "target_minutes": _mean([f["minutes"] for f in breakout]),
            "target_social": _mean([f["social"] for f in breakout]),
            "mid_tier_players": g["mid_tier_players"],
        })
    return ideas


# ------------------------------------------------------------- top-level
def analyze(snapshot: dict) -> dict:
    today = snapshot["generated_at"][:10]
    eco = ecosystem_growth(snapshot)
    feats = [island_features(isl, today, eco) for isl in snapshot["islands"].values()]
    score_islands(feats)
    genres = genre_overview(snapshot, feats)
    cat = snapshot.get("catalog_stats") or {}
    tags = tag_analysis(feats, cat.get("tag_counts"))
    combos = tag_combos(feats)
    kw = keyword_trends(feats, cat.get("word_counts"), cat.get("size"))
    ideas = build_ideas(genres, tags, combos, kw, feats)
    return {"features": feats, "genres": genres, "tags": tags, "combos": combos,
            "keywords": kw, "ideas": ideas, "eco_growth": eco}


def benchmark_island(f: dict, feats: list[dict]) -> dict:
    """Vergleicht eine Map mit allen getrackten Maps desselben Genres (Perzentile)."""
    peers = [x for x in feats if x["genre"] == f["genre"] and (x["players_avg"] or 0) >= MIN_PLAYERS] \
        if f["genre"] else [x for x in feats if (x["players_avg"] or 0) >= MIN_PLAYERS]
    out = {}
    for key in ["players_avg", "peak_ccu", "growth", "d1", "d7", "minutes", "social"]:
        vals = sorted(x[key] for x in peers if x[key] is not None)
        v = f.get(key)
        if v is None or not vals:
            out[key] = None
            continue
        out[key] = sum(1 for x in vals if x <= v) / len(vals)
    return {"peer_count": len(peers), "percentiles": out}
