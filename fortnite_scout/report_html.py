"""HTML-Report und Claude-Ideen-Prompt aus einem analysierten Snapshot."""

from __future__ import annotations

import html
import json
from datetime import datetime

GENRE_NAMES: dict[str, str] = {}


def esc(s) -> str:
    return html.escape(str(s if s is not None else ""))


def num(v, nd=0, suffix=""):
    if v is None:
        return "–"
    if nd == 0:
        v = int(round(v))
        return f"{v:,}".replace(",", ".") + suffix
    return f"{v:.{nd}f}".replace(".", ",") + suffix


def pct(v, nd=0):
    return "–" if v is None else num(100 * v, nd, " %")


def growth_cell(g, new=False):
    if new:
        return '<td class="n" data-v="999"><span class="tag new" title="Erst seit wenigen Tagen mit Daten – Wachstum nicht messbar">neu</span></td>'
    if g is None:
        return '<td class="n" data-v="0">–</td>'
    cls = "up" if g >= 1.15 else ("down" if g <= 0.87 else "flat")
    arrow = "▲" if cls == "up" else ("▼" if cls == "down" else "■")
    return f'<td class="n {cls}" data-v="{g:.4f}"><span aria-hidden="true">{arrow}</span> {num(g, 2, "×")}</td>'


def rank_cell(now, d7):
    if not now:
        return '<td class="n" data-v="9999">–</td>'
    if not d7:
        delta = '<span class="tag new">neu</span>'
    else:
        d = d7 - now
        delta = f'<span class="{"up" if d > 0 else "down" if d < 0 else "flat"}">{"+" if d > 0 else ""}{d}</span>'
    return f'<td class="n" data-v="{now}">#{now} {delta}</td>'


def spark(series, w=96, h=26):
    vals = [v for v in series if v is not None]
    if len(vals) < 2:
        return ""
    mx, mn = max(vals), min(vals)
    rng = (mx - mn) or 1
    pts = []
    n = len(series)
    for i, v in enumerate(series):
        if v is None:
            continue
        x = 2 + i * (w - 4) / (n - 1)
        y = h - 3 - (v - mn) * (h - 6) / rng
        pts.append((x, y, v))
    path = " ".join(f"{x:.1f},{y:.1f}" for x, y, _ in pts)
    lx, ly, lv = pts[-1]
    label = "Peak-CCU der letzten Tage: " + ", ".join(num(v) for v in series if v is not None)
    return (f'<svg class="spark" viewBox="0 0 {w} {h}" width="{w}" height="{h}" role="img" aria-label="{esc(label)}">'
            f'<title>{esc(label)}</title><polyline points="{path}" fill="none" stroke="var(--series-1)" '
            f'stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>'
            f'<circle cx="{lx:.1f}" cy="{ly:.1f}" r="2.5" fill="var(--series-1)"/></svg>')


def bar(v, mx, label=None):
    w = 0 if not mx or v is None else max(2, min(100, 100 * v / mx))
    return (f'<div class="bar" title="{esc(label or "")}"><span style="width:{w:.0f}%"></span></div>')


def map_rows(fs, show_score="viral_score"):
    out = []
    for i, f in enumerate(fs, 1):
        tags = "".join(f'<span class="tag">{esc(t)}</span>' for t in f["tags"][:4])
        out.append(
            f'<tr data-genre="{esc(f["genre"] or "")}" data-search="{esc((f["title"] + " " + f["code"] + " " + " ".join(f["tags"])).lower())}">'
            f'<td class="n" data-v="{i}">{i}</td>'
            f'<td><div class="t">{esc(f["title"])}</div><div class="sub"><code class="code" title="Code kopieren">{esc(f["code"])}</code> · {esc(f["creator"] or "")} · {tags}</div></td>'
            f'<td data-v="{esc(f["genre"] or "")}">{esc(GENRE_NAMES.get(f["genre"], f["genre"] or "–"))}</td>'
            f'<td class="n score" data-v="{f[show_score] or 0}">{num(f[show_score], 1)}</td>'
            + rank_cell(f["rank"], f["rank_d7"])
            + f'<td class="n" data-v="{f["players_avg"] or 0}">{num(f["players_avg"])}</td>'
            f'<td class="n" data-v="{f["peak_ccu"] or 0}">{num(f["peak_ccu"])}</td>'
            + growth_cell(f["growth_rel"], f.get("growth_new"))
            + f'<td class="n" data-v="{f["d1"] or 0}">{pct(f["d1"])}</td>'
            f'<td class="n" data-v="{f["minutes"] or 0}">{num(f["minutes"], 1)}</td>'
            f'<td class="n" data-v="{f["social"] or 0}">{num(f["social"], 0)}</td>'
            f'<td>{spark(f["ccu_series"])}</td></tr>')
    return "\n".join(out)


MAP_HEAD = """<thead><tr><th data-sort="n">#</th><th data-sort="s">Map</th><th data-sort="s">Genre</th>
<th data-sort="n" title="{score_help}">{score_name}</th><th data-sort="n" title="Aktueller Genre-Rang und Veränderung zu vor ~7 Tagen">Rang (7 T)</th>
<th data-sort="n" title="Ø Unique Players pro Tag (volle Tage)">Spieler/Tag</th><th data-sort="n" title="Höchste gleichzeitige Spielerzahl der Woche">Peak CCU</th>
<th data-sort="n" title="Ø Peak-CCU der letzten 2 Tage vs. Median davor, bereinigt um den Fortnite-Gesamttrend">Wachstum</th>
<th data-sort="n" title="Anteil der Spieler, die am nächsten Tag wiederkommen">D1</th><th data-sort="n" title="Ø Spielminuten pro Spieler">Min/Sp.</th>
<th data-sort="n" title="Favoriten + Empfehlungen pro 1.000 Spieler">Fav+Rec ‰</th><th>7-Tage-CCU</th></tr></thead>"""


CSS = """
:root{color-scheme:light;--bg:#f6f6f4;--surface:#ffffff;--surface-2:#f0efec;--line:#e3e1dc;--text:#191919;--text-2:#5f5f5b;
--series-1:#257de0;--good:#0a7d24;--bad:#c4302b;--accent:#257de0;--chip:#ecebe7}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){color-scheme:dark;--bg:#121212;--surface:#1b1b1b;--surface-2:#232323;
--line:#2f2f2f;--text:#efefef;--text-2:#a3a3a3;--series-1:#338ced;--good:#3fbf5b;--bad:#ef6a65;--accent:#338ced;--chip:#2a2a2a}}
:root[data-theme="dark"]{color-scheme:dark;--bg:#121212;--surface:#1b1b1b;--surface-2:#232323;--line:#2f2f2f;--text:#efefef;
--text-2:#a3a3a3;--series-1:#338ced;--good:#3fbf5b;--bad:#ef6a65;--accent:#338ced;--chip:#2a2a2a}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:1280px;margin:0 auto;padding:24px 16px 64px}h1{font-size:28px;margin:0 0 4px;letter-spacing:-.01em}
h2{font-size:20px;margin:40px 0 4px}p.lead{color:var(--text-2);margin:0 0 16px;max-width:80ch}.muted{color:var(--text-2)}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;margin:20px 0}
.kpi{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:14px 16px}
.kpi .v{font-size:26px;font-weight:650;font-variant-numeric:tabular-nums}.kpi .l{color:var(--text-2);font-size:13px}
.card{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:4px 0;overflow:hidden}
.scroll{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:14px}
th,td{padding:8px 10px;border-bottom:1px solid var(--line);text-align:left;vertical-align:middle}
th{font-size:12px;color:var(--text-2);font-weight:600;white-space:nowrap;position:sticky;top:0;background:var(--surface);cursor:pointer;user-select:none}
th[data-sort]:hover{color:var(--text)}tr:last-child td{border-bottom:0}td.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.t{font-weight:600;max-width:340px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.sub{font-size:12px;color:var(--text-2)}
.tag{display:inline-block;background:var(--chip);border-radius:6px;padding:0 6px;margin:1px 2px 1px 0;font-size:11.5px;color:var(--text-2)}
.tag.new{background:transparent;border:1px solid var(--accent);color:var(--accent)}
.up{color:var(--good)}.down{color:var(--bad)}.flat{color:var(--text-2)}.score{font-weight:650}
code.code{cursor:pointer;font-size:12px}code.code.copied{color:var(--good)}
.bar{height:8px;background:var(--surface-2);border-radius:4px;min-width:80px}.bar span{display:block;height:100%;background:var(--series-1);border-radius:4px}
.controls{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}
.controls input,.controls select{font:inherit;padding:7px 10px;border:1px solid var(--line);border-radius:8px;background:var(--surface);color:var(--text);min-width:0}
.controls input{flex:1 1 220px}
.ideas{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(300px,100%),1fr));gap:12px;margin-top:12px}
.idea{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:16px}
.idea h3{margin:0 0 2px;font-size:17px}.idea .opp{float:right;font-weight:650;color:var(--accent)}
.idea dd{min-width:0;overflow-wrap:anywhere}.idea dl{display:grid;grid-template-columns:max-content minmax(0,1fr);gap:4px 10px;margin:10px 0 0;font-size:13.5px}.idea dt{color:var(--text-2)}.idea dd{margin:0}
.grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(380px,100%),1fr));gap:16px}.grid2>div{min-width:0}
@media (max-width:600px){.grid2{grid-template-columns:1fr}h1{font-size:23px}.t{max-width:200px}}
details{margin-top:8px}summary{cursor:pointer;color:var(--text-2)}
.spark{display:block}footer{margin-top:48px;color:var(--text-2);font-size:13px}
"""

JS = """
document.querySelectorAll('table.sortable').forEach(t=>{
  t.querySelectorAll('th[data-sort]').forEach((th,i)=>{
    th.addEventListener('click',()=>{
      const tb=t.tBodies[0],rows=[...tb.rows],num=th.dataset.sort==='n';
      const dir=th.dataset.dir==='asc'?'desc':'asc';t.querySelectorAll('th').forEach(x=>delete x.dataset.dir);th.dataset.dir=dir;
      rows.sort((a,b)=>{let x=a.cells[i].dataset.v??a.cells[i].innerText,y=b.cells[i].dataset.v??b.cells[i].innerText;
        if(num){x=parseFloat(x)||0;y=parseFloat(y)||0;return dir==='asc'?x-y:y-x}return dir==='asc'?x.localeCompare(y):y.localeCompare(x)});
      rows.forEach(r=>tb.appendChild(r));});});});
function filt(id){const q=document.getElementById(id+'-q').value.toLowerCase(),g=document.getElementById(id+'-g').value;
  document.querySelectorAll('#'+id+' tbody tr').forEach(r=>{r.hidden=!((!g||r.dataset.genre===g)&&(!q||r.dataset.search.includes(q)))});}
document.addEventListener('click',e=>{const c=e.target.closest('code.code');if(!c)return;
  try{navigator.clipboard.writeText(c.innerText);c.classList.add('copied');setTimeout(()=>c.classList.remove('copied'),900)}catch(_){}});
"""


def render_html(snap: dict, res: dict) -> str:
    GENRE_NAMES.clear()
    GENRE_NAMES.update({g["slug"]: g["displayName"] for g in snap["genres"]})
    feats = res["features"]
    scored = sorted([f for f in feats if f.get("viral_score") is not None], key=lambda f: -f["viral_score"])
    biggest = sorted([f for f in feats if f.get("players_avg")], key=lambda f: -f["players_avg"])[:40]
    gen_at = datetime.fromisoformat(snap["generated_at"].replace("Z", "+00:00"))
    eco = snap.get("ecosystem", {}).get("inMatchPeakCCU") or []
    eco_full = [x for x in eco if not x["timestamp"].startswith(snap["generated_at"][:10])]
    cat = snap.get("catalog_stats") or {}

    genre_opts = "".join(f'<option value="{esc(g["slug"])}">{esc(g["displayName"])}</option>'
                         for g in sorted(snap["genres"], key=lambda g: g["displayName"]))

    def filter_bar(id_):
        return (f'<div class="controls"><input id="{id_}-q" type="search" placeholder="Suchen: Titel, Code, Tag …" '
                f'oninput="filt(\'{id_}\')" aria-label="Suchen"><select id="{id_}-g" onchange="filt(\'{id_}\')" aria-label="Genre">'
                f'<option value="">Alle Genres</option>{genre_opts}</select></div>')

    # Genres
    g_max_mid = max((g["mid_tier_players"] or 0) for g in res["genres"]) or 1
    g_rows = []
    for g in res["genres"]:
        g_rows.append(
            f'<tr><td><b>{esc(g["name"])}</b></td><td class="n score" data-v="{g["opportunity"] or 0}">{num(g["opportunity"], 1)}</td>'
            f'<td class="n" data-v="{g["supply"]}">{num(g["supply"])}</td>'
            f'<td data-v="{g["mid_tier_players"] or 0}"><div style="display:flex;gap:8px;align-items:center">'
            f'{bar(g["mid_tier_players"], g_max_mid)}<span class="n">{num(g["mid_tier_players"])}</span></div></td>'
            + growth_cell(g["growth_median"])
            + f'<td class="n" data-v="{g["top3_share"] or 0}">{pct(g["top3_share"])}</td>'
            f'<td class="n" data-v="{g["new_in_top50"]}">{g["new_in_top50"]}</td>'
            f'<td class="n" data-v="{g["d1_top10"] or 0}">{pct(g["d1_top10"])}</td>'
            f'<td class="n" data-v="{g["min_top10"] or 0}">{num(g["min_top10"], 0)}</td></tr>')

    # Tags
    t_rows = []
    for t in res["tags"][:30]:
        t_rows.append(
            f'<tr><td><span class="tag">{esc(t["tag"])}</span></td><td class="n score" data-v="{t["opportunity"]}">{num(t["opportunity"], 1)}</td>'
            f'<td class="n" data-v="{t["lift"]}">{num(t["lift"], 1, "×")}</td><td class="n" data-v="{t["supply"]}">{num(t["supply"])}</td>'
            f'<td class="n" data-v="{t["maps_tracked"]}">{t["maps_tracked"]}</td>' + growth_cell(t["growth_median"])
            + f'<td class="sub">{esc(" · ".join(t["examples"]))}</td></tr>')

    c_rows = []
    for c in res["combos"][:15]:
        c_rows.append(f'<tr><td>{"".join(f"<span class=tag>{esc(x)}</span>" for x in c["tags"])}</td>'
                      f'<td class="n">{num(c["lift"], 1, "×")}</td><td class="n">{c["count_breakout"]} / {c["count_all"]}</td>'
                      f'<td class="sub">{esc(" · ".join(c["examples"]))}</td></tr>')

    kw = res["keywords"]
    k_rows = []
    for k in kw["keywords"][:20]:
        k_rows.append(f'<tr><td><b>{esc(k["word"])}</b></td><td class="n">{num(k["lift"], 1, "×")}</td>'
                      f'<td class="n">{k["breakout_maps"]}</td><td class="n">{pct(k["catalog_rate"], 2)}</td>'
                      f'<td class="sub">{esc(" · ".join(k["examples"]))}</td></tr>')
    p_rows = []
    for p in kw["patterns"]:
        p_rows.append(f'<tr><td>{esc(p["pattern"])}</td><td class="n">{num(p["lift"], 1, "×")}</td>'
                      f'<td class="n">{pct(p["rate_breakout"])}</td><td class="n">{pct(p["rate_top100"])}</td><td class="n">{pct(p["rate_all"])}</td>'
                      f'<td class="sub">{esc(" · ".join(p["examples"]))}</td></tr>')

    ideas_html = []
    for i, idea in enumerate(res["ideas"], 1):
        bm = "<br>".join(f'{esc(b["title"])} <code class="code">{esc(b["code"])}</code> '
                         f'<span class="muted">({num(b["players"])} Sp./Tag, {"neu" if b.get("new") else num(b["growth"], 1, "×")})</span>'
                         for b in idea["benchmarks"])
        ideas_html.append(f"""<article class="idea"><span class="opp" title="Chancen-Score des Genres">{num(idea["opportunity"], 0)}</span>
<h3>{i}. {esc(idea["genre"])}</h3><div class="muted">{esc(idea["hook"])}</div>
<dl><dt>Mechanik-Tags</dt><dd>{"".join(f'<span class="tag">{esc(t)}</span>' for t in idea["tags"]) or "–"}</dd>
<dt>Trend-Themen</dt><dd>{esc(", ".join(idea["keywords"])) or "–"}</dd>
<dt>Titel-Muster</dt><dd>{esc(idea["title_pattern"] or "eigener, klarer Titel")}{f' <span class="muted">({pct(idea["title_pattern_rate"])} der Breakouts)</span>' if idea["title_pattern"] else ""}</dd>
<dt>Ziel-KPIs</dt><dd>D1 ≥ {pct(idea["target_d1"])}, ≥ {num(idea["target_minutes"], 0)} Min/Spieler, Fav+Rec ≥ {num(idea["target_social"], 0)} ‰</dd>
<dt>Platz 11–50</dt><dd>≈ {num(idea["mid_tier_players"])} Spieler/Tag</dd>
<dt>Vorbilder</dt><dd>{bm}</dd></dl></article>""")

    eco_last = eco_full[-1]["value"] if eco_full else None
    eco_max = max((x["value"] for x in eco_full), default=None)
    eco_max_day = next((x["timestamp"][:10] for x in eco_full if x["value"] == eco_max), "")
    sb, sa = kw.get("style_breakout", {}), kw.get("style_all", {})

    return f"""<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Fortnite Map Scout</title><style>{CSS}</style></head><body><main>
<h1>Fortnite Map Scout</h1>
<p class="lead">Virale und aufsteigende Creative-/UEFN-Maps aus der offiziellen Fortnite Data API. Snapshot vom
{gen_at.strftime("%d.%m.%Y, %H:%M")} UTC · Top-{snap["top_n"]} aus {len(snap["genres"])} Genres · 7 Tage Historie.</p>

<div class="kpis">
<div class="kpi"><div class="v">{num(len(feats))}</div><div class="l">Maps in Genre-Top-Listen</div></div>
<div class="kpi"><div class="v">{num(len(scored))}</div><div class="l">mit genug Daten bewertet (≥ 300 Spieler/Tag)</div></div>
<div class="kpi"><div class="v">{num(cat.get("size"))}</div><div class="l">öffentliche Maps im Katalog</div></div>
<div class="kpi"><div class="v">{num(eco_last)}</div><div class="l">Fortnite In-Match Peak-CCU (gestern)</div></div>
<div class="kpi"><div class="v">{num(res.get("eco_growth"), 2, "×")}</div><div class="l">Fortnite-Trend (Basis für „Wachstum“); Spitze {num(eco_max)} am {esc(eco_max_day)}</div></div>
</div>

<h2>Map-Ideen aus den Daten</h2>
<p class="lead">Pro Genre (sortiert nach Chancen-Score): welche Mechanik-Tags und Themen bei den aktuellen Breakouts überdurchschnittlich oft vorkommen,
welche KPIs die Vorbilder erreichen und wie viele Spieler ein Platz im Mittelfeld bringt. Für kreativere Konzepte: <code>output/ideen_prompt.md</code> in Claude einfügen.</p>
<div class="ideas">{"".join(ideas_html)}</div>

<h2>Breakout-Maps (Viral-Score)</h2>
<p class="lead">Viral-Score 0–100 = Perzentil-Mix aus Wachstum (30 %), Rang-Aufstieg (20 %), Favoriten+Empfehlungen pro Spieler (20 %),
D1-Retention (15 %) und Spielzeit (15 %). Klick auf Spaltenkopf sortiert, Klick auf Code kopiert ihn.</p>
{filter_bar("breakout")}
<div class="card scroll"><table id="breakout" class="sortable">{MAP_HEAD.format(score_name="Viral", score_help="Viral-Score 0–100")}
<tbody>{map_rows(scored[:150])}</tbody></table></div>

<h2>Genre-Chancen</h2>
<p class="lead">Wo lohnt sich eine neue Map? Chancen-Score = Spieler, die Maps auf Platz 11–50 bekommen (35 %), Genre-Wachstum (25 %),
neue Maps in den Top 50 (15 %), wenig Dominanz der Top 3 (15 %) und wenig Konkurrenz (10 %).</p>
<div class="card scroll"><table class="sortable"><thead><tr><th data-sort="s">Genre</th><th data-sort="n">Chance</th>
<th data-sort="n" title="Maps im Genre-Ranking">Konkurrenz</th><th data-sort="n" title="Ø Spieler/Tag einer Map auf Platz 11–50">Spieler/Tag Platz 11–50</th>
<th data-sort="n" title="Median-Wachstum der Top-Maps, bereinigt um den Gesamttrend">Wachstum</th><th data-sort="n" title="Anteil der Top 3 an allen Spielern der Top-Liste">Top-3-Anteil</th>
<th data-sort="n" title="Maps in den Top 50, die vor 7 Tagen noch nicht in der Top-Liste waren">Neu in Top 50</th>
<th data-sort="n">D1 Top 10</th><th data-sort="n">Min Top 10</th></tr></thead><tbody>{"".join(g_rows)}</tbody></table></div>

<div class="grid2">
<div><h2>Tag-Chancen</h2><p class="lead">Lift = Anteil an den Spielern ÷ Anteil an allen Maps im Katalog. Hoch = viel Nachfrage, wenig Angebot.</p>
<div class="card scroll"><table class="sortable"><thead><tr><th data-sort="s">Tag</th><th data-sort="n">Chance</th><th data-sort="n">Lift</th>
<th data-sort="n">Maps im Katalog</th><th data-sort="n">getrackt</th><th data-sort="n">Wachstum</th><th>Beispiele</th></tr></thead><tbody>{"".join(t_rows)}</tbody></table></div></div>
<div><h2>Tag-Kombinationen der Breakouts</h2><p class="lead">Tag-Paare, die bei den Top 15 % nach Viral-Score häufiger vorkommen als bei allen bewerteten Maps.</p>
<div class="card scroll"><table><thead><tr><th>Kombination</th><th>Lift</th><th>Breakout / alle</th><th>Beispiele</th></tr></thead><tbody>{"".join(c_rows)}</tbody></table></div></div>
</div>

<div class="grid2">
<div><h2>Trend-Wörter im Titel</h2><p class="lead">Wörter, die in Titeln von Breakout-Maps überdurchschnittlich oft vorkommen. „Katalog“ = Anteil aller 285k Maps mit dem Wort (niedrig = noch unverbraucht).</p>
<div class="card scroll"><table><thead><tr><th>Wort</th><th>Lift</th><th>Breakouts</th><th>Katalog</th><th>Beispiele</th></tr></thead><tbody>{"".join(k_rows)}</tbody></table></div></div>
<div><h2>Titel-Muster</h2><p class="lead">Breakout-Titel: {pct(sb.get("emoji_rate"))} mit Emoji (alle: {pct(sa.get("emoji_rate"))}), {pct(sb.get("caps_rate"))} überwiegend in Großbuchstaben,
Ø {num(sb.get("avg_len"))} Zeichen.</p>
<div class="card scroll"><table><thead><tr><th>Muster</th><th>Lift</th><th>Breakouts</th><th>Top 100</th><th>alle</th><th>Beispiele</th></tr></thead><tbody>{"".join(p_rows)}</tbody></table></div></div>
</div>

<h2>Größte Maps (Spieler/Tag)</h2>
{filter_bar("biggest")}
<div class="card scroll"><table id="biggest" class="sortable">{MAP_HEAD.format(score_name="Qualität", score_help="Qualitäts-Score: Perzentil aus D1, Spielzeit und Fav+Rec-Rate")}
<tbody>{map_rows(biggest, "quality_score")}</tbody></table></div>

<details><summary>Methodik &amp; Grenzen</summary><p class="muted">Quelle: api.fortnite.com/ecosystem/v1 (öffentlich, ohne Key). Historie ist auf 7 Tage begrenzt –
<code>python scout.py collect</code> regelmäßig laufen lassen, damit sich unter <code>data/snapshots/</code> eine längere Historie aufbaut.
Maps mit &lt; 5 Spielern pro Intervall liefern keine Werte. Spieler/Tag = Ø Unique Players der vollen Tage (heute ausgeschlossen).
Wachstum = Ø Peak-CCU der letzten 2 Tage ÷ Median der Tage davor, geteilt durch denselben Wert für ganz Fortnite (Events wie am {esc(eco_max_day)} verzerren sonst).
Rang = bester aktueller Rang über alle Genres; „neu“ = vor ~7 Tagen nicht in den Top {snap["top_n"]}.</p></details>
<footer>Fortnite Map Scout · Daten: Epic Games Fortnite Data API</footer>
</main><script>{JS}</script></body></html>"""


def render_prompt(snap: dict, res: dict) -> str:
    names = {g["slug"]: g["displayName"] for g in snap["genres"]}
    scored = sorted([f for f in res["features"] if f.get("viral_score") is not None], key=lambda f: -f["viral_score"])
    lines = [
        "# Fortnite-Map-Ideen – Datenbriefing",
        "",
        f"Daten: offizielle Fortnite Data API, Snapshot {snap['generated_at']}, 7 Tage Historie.",
        "",
        "**Aufgabe an Claude:** Du bist Game-Designer für Fortnite UEFN. Entwickle auf Basis der Daten unten "
        "10 konkrete Map-Konzepte mit hohem Viral-Potenzial. Pro Konzept: Titel (im Stil der Breakouts), Genre, "
        "Kern-Loop in 3 Sätzen, was in den ersten 60 Sekunden passiert, Grund zum Wiederkommen (D1), "
        "warum es geteilt/geclippt wird, 3 passende Discovery-Tags, Thumbnail-Idee, Umfang für ein 1–2-Personen-Team. "
        "Begründe jede Idee mit konkreten Zahlen aus dem Briefing und nenne die Vorbild-Maps. "
        "Kopiere keine bestehende Map, sondern kombiniere Trends neu.",
        "",
        "## Genres nach Chancen-Score",
        "| Genre | Chance | Konkurrenz (Maps) | Spieler/Tag Platz 11–50 | Wachstum | Top-3-Anteil | Neu in Top 50 |",
        "|---|---|---|---|---|---|---|",
    ]
    for g in res["genres"]:
        lines.append(f"| {g['name']} | {num(g['opportunity'], 1)} | {num(g['supply'])} | {num(g['mid_tier_players'])} | "
                     f"{num(g['growth_median'], 2, '×')} | {pct(g['top3_share'])} | {g['new_in_top50']} |")
    lines += ["", "## Top-30 Breakout-Maps",
              "| Viral | Titel | Genre | Spieler/Tag | Wachstum | D1 | Min/Sp | Fav+Rec ‰ | Tags |", "|---|---|---|---|---|---|---|---|---|"]
    for f in scored[:30]:
        lines.append(f"| {num(f['viral_score'], 1)} | {f['title']} | {names.get(f['genre'], f['genre'])} | {num(f['players_avg'])} | "
                     f"{'neu' if f.get('growth_new') else num(f['growth_rel'], 1, '×')} | {pct(f['d1'])} | {num(f['minutes'], 0)} | {num(f['social'], 0)} | {', '.join(f['tags'])} |")
    lines += ["", "## Tags mit Nachfrage > Angebot", "| Tag | Lift | Maps im Katalog | Wachstum |", "|---|---|---|---|"]
    for t in res["tags"][:20]:
        lines.append(f"| {t['tag']} | {num(t['lift'], 1, '×')} | {num(t['supply'])} | {num(t['growth_median'], 2, '×')} |")
    lines += ["", "## Tag-Kombinationen der Breakouts"]
    for c in res["combos"][:12]:
        lines.append(f"- {' + '.join(c['tags'])}: Lift {num(c['lift'], 1, '×')} (z. B. {'; '.join(c['examples'][:2])})")
    lines += ["", "## Trend-Wörter & Titel-Muster"]
    lines.append("Wörter: " + ", ".join(f"{k['word']} ({num(k['lift'], 1, '×')})" for k in res["keywords"]["keywords"][:20]))
    lines.append("Wortpaare: " + ", ".join(f"„{k['word']}“" for k in res["keywords"]["bigrams"][:12]))
    for p in res["keywords"]["patterns"]:
        lines.append(f"- {p['pattern']}: {pct(p['rate_breakout'])} der Breakouts vs. {pct(p['rate_all'])} aller (Lift {num(p['lift'], 1, '×')})")
    return "\n".join(lines) + "\n"
