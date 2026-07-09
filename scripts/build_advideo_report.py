#!/usr/bin/env python3
"""Builds leads/advideo_report.html from leads/advideo_leads.json. Render to PDF separately via Playwright."""
import json
import sys
from collections import defaultdict
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_PATH = ROOT / "leads" / "advideo_leads.json"
OUT_PATH = ROOT / "leads" / "advideo_report.html"

def esc(s):
    if s is None:
        return ""
    return (str(s).replace("&", "&amp;").replace("<", "&lt;")
            .replace(">", "&gt;").replace('"', "&quot;"))

def load_leads():
    if not DATA_PATH.exists():
        return []
    with open(DATA_PATH, encoding="utf-8") as f:
        return json.load(f)

def build_html(leads):
    by_category = defaultdict(list)
    for l in leads:
        cat = l.get("product_category", "Sonstige")
        by_category[cat].append(l)

    ordered_categories = sorted(by_category.keys())

    total = len(leads)
    with_email = sum(1 for l in leads if l.get("email") and "kein" not in l.get("email", "").lower())
    us = sum(1 for l in leads if "USA" in l.get("market", ""))
    uk = sum(1 for l in leads if "UK" in l.get("market", ""))
    amazon = sum(1 for l in leads if "Amazon" in l.get("region_cluster", ""))

    cat_rows = "".join(
        f'<tr><td>{esc(c)}</td><td class="num">{len(by_category[c])}</td></tr>'
        for c in ordered_categories
    )

    sections = []
    for cat in ordered_categories:
        items = by_category[cat]
        rows = []
        for l in items:
            email = l.get("email", "") or ""
            has_email = email and "kein" not in email.lower()
            contact_html = f'<a href="mailto:{esc(email)}">{esc(email)}</a>' if has_email else esc(email or l.get("phone", "—"))
            site_link = f'<a href="{esc(l.get("website",""))}" target="_blank">Website ↗</a>' if l.get("website") else ""
            ig = l.get("instagram_handle", "") or ""
            rows.append(f"""<tr>
              <td><strong>{esc(l.get('company'))}</strong><div class="src">{esc(l.get('market',''))}</div></td>
              <td>{contact_html}</td>
              <td>{site_link}</td>
              <td>{esc(ig)}</td>
              <td class="note">{esc(l.get('evidence_no_video',''))}</td>
            </tr>""")
        sections.append(f"""
        <h2 class="region">{esc(cat)} <span class="cnt">{len(items)} Leads</span></h2>
        <table class="leadtbl">
          <thead><tr><th>Marke</th><th>Kontakt</th><th>Shop</th><th>Instagram</th><th>Beleg (kein Video)</th></tr></thead>
          <tbody>{''.join(rows)}</tbody>
        </table>""")

    today = date.today().isoformat()

    return f"""<!doctype html><html lang="de"><meta charset="utf-8">
<title>Ad-Video Lead-Report — Walkthrough Studio</title>
<style>
  @page {{ size: A4; margin: 18mm 14mm; }}
  * {{ box-sizing: border-box; }}
  body {{ font: 11.5px/1.55 "Inter","Segoe UI",Arial,sans-serif; color: #1D2B25; margin: 0; }}
  .cover {{ min-height: 240mm; display: flex; flex-direction: column; justify-content: center; page-break-after: always; }}
  .cover .kicker {{ font-size: 11px; letter-spacing: .22em; text-transform: uppercase; color: #A9823B; font-weight: 700; margin-bottom: 14px; }}
  .cover h1 {{ font: 600 42px/1.15 "Georgia",serif; margin: 0 0 10px; }}
  .cover .sub {{ color: #556; font-size: 15px; max-width: 480px; margin-bottom: 40px; }}
  .stat-row {{ display: flex; gap: 18px; margin-bottom: 34px; flex-wrap: wrap; }}
  .stat {{ border: 1px solid #E3DFD3; border-radius: 10px; padding: 14px 18px; min-width: 110px; }}
  .stat .l {{ font-size: 10px; letter-spacing: .12em; text-transform: uppercase; color: #68766D; font-weight: 700; }}
  .stat .v {{ font: 600 26px "Georgia",serif; color: #1F5849; margin-top: 4px; }}
  .legal {{ background: #F1E8D3; border-radius: 10px; padding: 14px 18px; font-size: 11.5px; color: #4A3F26; max-width: 520px; }}
  .legal b {{ color: #8C6A2C; }}
  h2.region {{ font: 600 16px "Georgia",serif; border-bottom: 2px solid #1F5849; padding-bottom: 5px; margin: 26px 0 8px; page-break-after: avoid; }}
  h2.region .cnt {{ font-family: Arial,sans-serif; font-size: 10.5px; color: #68766D; font-weight: 600; float: right; }}
  table.leadtbl {{ width: 100%; border-collapse: collapse; margin-bottom: 4px; }}
  table.leadtbl th {{ text-align: left; font-size: 9px; letter-spacing: .08em; text-transform: uppercase; color: #68766D; border-bottom: 1px solid #D3CEBF; padding: 5px 6px; }}
  table.leadtbl td {{ padding: 6px 6px; border-bottom: 1px solid #EFECE3; vertical-align: top; font-size: 10.5px; }}
  table.leadtbl tr {{ page-break-inside: avoid; }}
  .src {{ color: #9AA69D; font-size: 8.5px; margin-top: 1px; }}
  .note {{ color: #556; }}
  table.overview {{ width: 100%; border-collapse: collapse; margin-top: 6px; }}
  table.overview td {{ padding: 5px 8px; border-bottom: 1px solid #EFECE3; font-size: 12px; }}
  table.overview td.num {{ text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; }}
  a {{ color: #1F5849; text-decoration: none; }}
  footer {{ margin-top: 20px; color: #9AA69D; font-size: 9px; }}
</style>
<body>

<div class="cover">
  <div class="kicker">Walkthrough Studio · Ad-Video Lead-Report</div>
  <h1>D2C-Marken ohne Video-Ads</h1>
  <div class="sub">Öffentlich recherchierte Kontakte zu kleinen bis mittelgroßen D2C/E-Commerce-Marken in USA und UK, die auf Instagram/ihrer eigenen Website nur mit Foto-Ads werben — Stand {today}.</div>
  <div class="stat-row">
    <div class="stat"><div class="l">Leads gesamt</div><div class="v">{total}</div></div>
    <div class="stat"><div class="l">Mit Firmen-Email</div><div class="v">{with_email}</div></div>
    <div class="stat"><div class="l">USA</div><div class="v">{us}</div></div>
    <div class="stat"><div class="l">UK</div><div class="v">{uk}</div></div>
    <div class="stat"><div class="l">Amazon-sourced</div><div class="v">{amazon}</div></div>
  </div>
  <div class="legal"><b>Rechtlicher Hinweis:</b> Alle Kontakte sind öffentlich publizierte Firmenadressen von der jeweils eigenen Markenwebsite (kein Scraping von Instagram oder Amazon). Kaltakquise per Email ist rechtlich nur in USA (CAN-SPAM) und UK (PECR, nur Firmen-Postfächer) zulässig — nicht in DE/AT. Vor Versand jede Marke einmal manuell in der Meta Ad Library gegenchecken (automatisierter Zugriff war durchgehend blockiert, daher basiert "kein Video" auf der Website-Prüfung, nicht auf Ad-Library-Daten).</div>
  <table class="overview">{cat_rows}</table>
</div>

{''.join(sections)}

<footer>Walkthrough Studio · Ad-Video Lead-Report · generiert {today} · nur zur internen Verwendung, keine Weitergabe</footer>
</body></html>"""

def main():
    leads = load_leads()
    html = build_html(leads)
    OUT_PATH.write_text(html, encoding="utf-8")
    print(f"Wrote {OUT_PATH} ({len(leads)} leads)")

if __name__ == "__main__":
    sys.exit(main())
