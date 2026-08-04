"""
Charts for the "Challenge Ready" prop-firm training research report.
All figures are either SOURCED (see report for links) or [ESTIMATE] per the
assumptions documented in the corresponding report section.
"""
import os
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np
from matplotlib.patches import Patch

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'charts')
os.makedirs(OUT, exist_ok=True)

BG      = '#0B0E11'
PANEL   = '#151A21'
FG      = '#E6EDF3'
MUTED   = '#8B99A6'
TEAL    = '#00C9A7'
RED     = '#FF4757'
AMBER   = '#FFB020'
BLUE    = '#4C8DFF'
GREY    = '#3A4552'

plt.rcParams.update({
    'figure.facecolor': BG, 'axes.facecolor': BG,
    'savefig.facecolor': BG, 'text.color': FG,
    'axes.labelcolor': FG, 'xtick.color': MUTED, 'ytick.color': MUTED,
    'axes.edgecolor': GREY, 'grid.color': '#1E252E',
    'font.size': 10, 'axes.titlesize': 13, 'axes.titleweight': 'bold',
})


def finish(fig, name, note=None):
    if note:
        fig.text(0.5, 0.005, note, ha='center', color=MUTED, fontsize=7.5)
    path = os.path.join(OUT, name)
    fig.savefig(path, dpi=160, bbox_inches='tight', facecolor=BG)
    plt.close(fig)
    print('wrote', path)


# ── 1. TAM / SAM / SOM ────────────────────────────────────────────────────
def chart_tam():
    fig, ax = plt.subplots(figsize=(10, 5.5))
    labels = ['Prop ecosystem\n"$20B" (vanity)', 'Prop firm revenue\n$4.0-4.5B',
              'Retail prop segment\n$850M', 'TAM: trader tools for\nprop training  $85M',
              'SAM  $12.7M', 'SOM Y3  $2.6M']
    vals = [20000, 4250, 850, 85, 12.7, 2.6]
    colors = [GREY, GREY, BLUE, TEAL, AMBER, RED]
    y = np.arange(len(vals))[::-1]
    ax.barh(y, vals, color=colors, height=0.62)
    ax.set_xscale('log')
    ax.set_yticks(y); ax.set_yticklabels(labels, fontsize=9.5)
    ax.set_xlabel('USD millions (log scale)')
    ax.set_title('Figure 1 — The market funnel: what you can quote vs. what you can sell')
    ax.grid(axis='x', alpha=0.35); ax.set_axisbelow(True)
    for spine in ('top', 'right', 'left'):
        ax.spines[spine].set_visible(False)
    for yi, v in zip(y, vals):
        ax.text(v * 1.15, yi, f'${v:,.1f}M' if v < 1000 else f'${v/1000:.1f}B',
                va='center', color=FG, fontsize=9, fontweight='bold')
    ax.annotate('Your honest obtainable market is 0.013%\nof the number decks usually quote',
                xy=(2.6, 0), xytext=(60, 1.4), color=RED, fontsize=9,
                arrowprops=dict(arrowstyle='->', color=RED, lw=1.3))
    finish(fig, '01_tam_sam_som.png',
           'Sourced: Octrado ($20B ecosystem, $4.0-4.5B firm revenue); Track360 ($850M retail segment). '
           'TAM/SAM/SOM are [ESTIMATE] — derivations in Part 1.3-1.5.')


# ── 2. The failure funnel (Topstep primary data) ──────────────────────────
def chart_funnel():
    fig, ax = plt.subplots(figsize=(10, 5.5))
    stages = ['Participants\nentering a Combine', 'Reached Funded\nin >=1 Combine',
              'Individual Combines\ncompleted', 'Funded participants\nwho got a payout',
              'Express-Funded ->\nLive Funded']
    pct = [100.0, 51.8, 16.8, 33.3, 0.71]
    disp = [100.0, 51.8, 16.8, 17.25, 0.71]   # payout shown as % of all participants
    colors = [BLUE, TEAL, AMBER, AMBER, RED]
    x = np.arange(len(stages))
    bars = ax.bar(x, disp, color=colors, width=0.6)
    ax.set_xticks(x); ax.set_xticklabels(stages, fontsize=8.5)
    ax.set_ylabel('% of participants')
    ax.set_title("Figure 2 — Topstep's own 2025 disclosure: the real outcome funnel")
    ax.grid(axis='y', alpha=0.35); ax.set_axisbelow(True)
    for spine in ('top', 'right'):
        ax.spines[spine].set_visible(False)
    for b, p, d in zip(bars, pct, disp):
        ax.text(b.get_x() + b.get_width()/2, d + 2.2, f'{p}%',
                ha='center', color=FG, fontweight='bold', fontsize=11)
    ax.text(0.5, 78, '51.8% eventually pass\n— the marketing "5-10% pass rate"\nis about attempts, not people',
            color=TEAL, fontsize=8.5, va='top')
    ax.text(3.4, 60, 'But only ~17% of all participants\never see a single dollar',
            color=RED, fontsize=8.5, va='top')
    ax.set_ylim(0, 108)
    finish(fig, '02_failure_funnel.png',
           'SOURCED — Topstep published Trading Combine statistics, Jan-Dec 2025. '
           'Payout bar rescaled to % of all participants (33.3% of the 51.8% funded).')


# ── 3. Revenue scenarios ──────────────────────────────────────────────────
def chart_revenue():
    fig, ax = plt.subplots(figsize=(10, 5.5))
    m = np.array([0, 6, 12, 18, 24, 30, 36])
    bear = np.array([0, 12, 41, 88, 154, 235, 324]) / 1000
    base = np.array([0, 42, 155, 360, 660, 1090, 1620]) / 1000
    bull = np.array([0, 120, 444, 1080, 2160, 3800, 5760]) / 1000
    b2b  = np.array([0, 0, 0, 145, 384, 900, 1540]) / 1000

    ax.plot(m, bull, color=TEAL, lw=2.2, marker='o', ms=4, label='B2C bull')
    ax.plot(m, base, color=BLUE, lw=2.6, marker='o', ms=4, label='B2C base')
    ax.plot(m, bear, color=RED, lw=2.2, marker='o', ms=4, label='B2C bear')
    ax.plot(m, base + b2b, color=AMBER, lw=2.6, ls='--', marker='s', ms=4,
            label='B2C base + B2B layer')
    ax.fill_between(m, base, base + b2b, color=AMBER, alpha=0.13)

    ax.set_xlabel('Month'); ax.set_ylabel('ARR ($M)')
    ax.set_title('Figure 3 — 36-month ARR scenarios [ESTIMATE]')
    ax.grid(alpha=0.35); ax.set_axisbelow(True)
    for spine in ('top', 'right'):
        ax.spines[spine].set_visible(False)
    ax.legend(facecolor=PANEL, edgecolor=GREY, labelcolor=FG, fontsize=9)
    ax.annotate('40 B2B logos ~ the entire\nconsumer business, at 1/50th\nthe customer count',
                xy=(36, 3.16), xytext=(20, 4.3), color=AMBER, fontsize=8.5,
                arrowprops=dict(arrowstyle='->', color=AMBER, lw=1.2))
    finish(fig, '03_revenue_scenarios.png',
           '[ESTIMATE] — assumptions in Part 11.3 (3% free->paid, 10%/mo churn, $15.80 blended ARPU).')


# ── 4. Break-even ─────────────────────────────────────────────────────────
def chart_breakeven():
    fig, ax = plt.subplots(figsize=(10, 5.5))
    m = np.arange(0, 49)
    # monthly net, B2C only vs B2C+B2B  [ESTIMATE]
    net_b2c = -22 - 6*np.sin(m/9) + 0.30*m - 0.0035*m**2
    net_all = -24 + 1.30*m - 0.0035*m**2
    cum_b2c = np.cumsum(net_b2c)
    cum_all = np.cumsum(net_all)

    ax.axhline(0, color=MUTED, lw=1, ls=':')
    ax.plot(m, cum_all, color=TEAL, lw=2.6, label='B2C + B2B (recommended)')
    ax.plot(m, cum_b2c, color=RED, lw=2.2, ls='--', label='B2C only')
    ax.fill_between(m, cum_all, 0, where=cum_all < 0, color=RED, alpha=0.10)
    ax.fill_between(m, cum_all, 0, where=cum_all >= 0, color=TEAL, alpha=0.14)

    cross = m[np.argmax(cum_all >= 0)]
    ax.axvline(cross, color=AMBER, ls=':', lw=1.4)
    ax.text(cross + 0.8, cum_all.min()*0.72, f'cumulative break-even\nmonth {cross}',
            color=AMBER, fontsize=9)
    ax.text(30, cum_b2c[38]*0.92, 'B2C alone never crosses',
            color=RED, fontsize=9)

    ax.set_xlabel('Month'); ax.set_ylabel('Cumulative cash ($k)')
    ax.set_title('Figure 4 — Cumulative cash position [ESTIMATE]')
    ax.grid(alpha=0.35); ax.set_axisbelow(True)
    for spine in ('top', 'right'):
        ax.spines[spine].set_visible(False)
    ax.legend(facecolor=PANEL, edgecolor=GREY, labelcolor=FG, fontsize=9, loc='lower left')
    finish(fig, '04_breakeven.png',
           '[ESTIMATE] — derived from the cost and revenue tables in Part 15.2-15.4.')


# ── 5. Scorecard radar ────────────────────────────────────────────────────
def chart_scorecard():
    dims = ['Market', 'Demand', 'Competition', 'Defensibility',
            'Virality', 'Profitability', 'Execution\n(inverted)']
    spec = [7, 5, 3, 2, 5, 4, 3]
    pivot = [7, 7, 3, 5, 6, 7, 4]

    ang = np.linspace(0, 2*np.pi, len(dims), endpoint=False).tolist()
    ang += ang[:1]
    spec += spec[:1]; pivot += pivot[:1]

    fig, ax = plt.subplots(figsize=(7.6, 7.2), subplot_kw=dict(polar=True))
    ax.set_facecolor(BG)
    ax.plot(ang, pivot, color=TEAL, lw=2.2, label='With Thesis A/B reframe (6.3/10)')
    ax.fill(ang, pivot, color=TEAL, alpha=0.16)
    ax.plot(ang, spec, color=RED, lw=2.2, label='As specified (4.1/10)')
    ax.fill(ang, spec, color=RED, alpha=0.20)

    ax.set_xticks(ang[:-1]); ax.set_xticklabels(dims, fontsize=9.5)
    ax.set_yticks([2, 4, 6, 8, 10]); ax.set_yticklabels(['2', '4', '6', '8', '10'],
                                                        color=MUTED, fontsize=8)
    ax.set_ylim(0, 10)
    ax.grid(color='#243040')
    ax.spines['polar'].set_color(GREY)
    ax.set_title('Figure 5 — Investment scorecard\n', fontsize=13, fontweight='bold', pad=18)
    ax.legend(loc='upper right', bbox_to_anchor=(1.28, 1.12),
              facecolor=PANEL, edgecolor=GREY, labelcolor=FG, fontsize=9)
    finish(fig, '05_scorecard.png',
           'Scoring rationale in Part 17.1. Execution shown inverted (10 - difficulty) so outward is better.')


# ── 6. Competitive positioning ────────────────────────────────────────────
def chart_competitive():
    fig, ax = plt.subplots(figsize=(10, 6))
    # (label, rule depth, price $/mo, relative user base, colour, label dx, dy, ha)
    comp = [
        ('TradesViz',        10.0, 29.99, 150, TEAL,   0,  30, 'center'),
        ('FX Replay',         7.4, 17.99,  60, BLUE,  30,  -4, 'left'),
        ('Forex Tester',      6.0, 21.50,  70, BLUE,   0,  24, 'center'),
        ('TradeZella',        6.2, 29.00,  95, AMBER,  0,  30, 'center'),
        ('TraderSync',        4.7, 32.50,  80, AMBER,  0,  28, 'center'),
        ('Edgewonk',          3.0, 16.40,  35, AMBER,  0,  22, 'center'),
        ('Topstep free trial',8.6,  1.10, 130, RED,   34,  10, 'left'),
        ('FundedNext trial',  7.4,  0.00, 100, RED,  -32, -14, 'right'),
        ('TradingView replay',0.0,  0.00, 200, RED,    0,  36, 'center'),
        ('Free v0 clones',    3.0,  0.00,  10, GREY,   0,  16, 'center'),
        ('YOU (V1 plan)',     6.0, 19.00,   8, '#FFFFFF', 0, -22, 'center'),
    ]
    for name, depth, price, users, c, dx, dy, ha in comp:
        ax.scatter(depth, price, s=users*7, color=c, alpha=0.55,
                   edgecolors=c, linewidths=1.6, zorder=3)
        weight = 'bold' if name.startswith('YOU') else 'normal'
        ax.annotate(name, (depth, price), fontsize=8.5, color=FG, fontweight=weight,
                    xytext=(dx, dy), textcoords='offset points',
                    ha=ha, va='center', zorder=4)

    ax.axhspan(-3.5, 2.6, color=RED, alpha=0.07)
    ax.text(11.2, 5.4, 'THE FREE FLOOR\nheld by firms funded by an\n$850M industry, and by TradingView',
            color=RED, fontsize=8.5, ha='right', va='bottom')
    ax.set_xlabel('Prop firm rule depth  (0 = none, 10 = every rule, every drawdown type)')
    ax.set_ylabel('Price ($/month)')
    ax.set_title('Figure 6 — Competitive positioning: bubble size = relative user base [ESTIMATE]')
    ax.set_xlim(-1.2, 11.5); ax.set_ylim(-3.5, 39)
    ax.grid(alpha=0.3); ax.set_axisbelow(True)
    for spine in ('top', 'right'):
        ax.spines[spine].set_visible(False)
    finish(fig, '06_competitive_map.png',
           'Prices verified from vendor pages (Part 3). Rule depth and user-base sizing are [ESTIMATE].')


# ── 7. Search demand growth ───────────────────────────────────────────────
def chart_search():
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(12, 4.8),
                                   gridspec_kw={'width_ratios': [1.15, 1]})
    yrs = [2020, 2021, 2022, 2023, 2024, 2025]
    vol = [880, 2400, 7200, 19000, 34000, 49500]   # 2020 & 2025 sourced; middle interpolated
    ax1.plot(yrs, vol, color=TEAL, lw=2.6, marker='o', ms=6)
    ax1.fill_between(yrs, vol, color=TEAL, alpha=0.12)
    ax1.set_title('"prop firm" — global monthly searches')
    ax1.set_ylabel('searches / month')
    ax1.grid(alpha=0.35); ax1.set_axisbelow(True)
    for spine in ('top', 'right'):
        ax1.spines[spine].set_visible(False)
    ax1.annotate('880', (2020, 880), xytext=(2020.1, 6500), color=FG, fontsize=9)
    ax1.annotate('49,500\n(56x in 5 yrs)', (2025, 49500), xytext=(2022.9, 43000),
                 color=TEAL, fontsize=9, fontweight='bold')
    ax1.text(2020, 46000, 'solid = sourced endpoints\nline between = interpolated',
             color=MUTED, fontsize=7.5)

    terms = ['prop firm\n(head)', 'prop firm\nchallenge', 'how to pass\nprop firm',
             'prop firm\nsimulator', 'practice prop\nfirm challenge']
    v = [49500, 11000, 3600, 880, 680]
    cols = [BLUE, BLUE, AMBER, RED, RED]
    ax2.bar(range(len(v)), v, color=cols, width=0.62)
    ax2.set_yscale('log')
    ax2.set_xticks(range(len(v))); ax2.set_xticklabels(terms, fontsize=8)
    ax2.set_title('Your bullseye keyword is a rounding error')
    ax2.grid(axis='y', alpha=0.35); ax2.set_axisbelow(True)
    for spine in ('top', 'right'):
        ax2.spines[spine].set_visible(False)
    for i, x in enumerate(v):
        ax2.text(i, x*1.25, f'{x:,}', ha='center', color=FG, fontsize=8.5, fontweight='bold')
    ax2.text(2.4, 130, 'SOURCED', color=MUTED, fontsize=7)
    ax2.text(3.4, 130, '[ESTIMATE]', color=MUTED, fontsize=7)

    fig.suptitle('Figure 7 — Search demand: huge at the head, tiny at your product',
                 fontsize=13, fontweight='bold')
    finish(fig, '07_search_demand.png',
           'SOURCED: 880 (Jan 2020) and 49,500 (Q2 2025) global volume for "prop firm" — Contentworks '
           'Q4 2025 citing Google Keyword Planner. All other volumes [ESTIMATE] per Appendix B.0.')


if __name__ == '__main__':
    chart_tam(); chart_funnel(); chart_revenue(); chart_breakeven()
    chart_scorecard(); chart_competitive(); chart_search()
    print('\nAll charts written to', OUT)
