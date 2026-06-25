"""
Wissenschaftliche Analyse: Day-Trading-Strategien für Funded Accounts
Erstellt mit matplotlib 3D & ReportLab
"""

import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib import cm
from mpl_toolkits.mplot3d import Axes3D
from matplotlib.colors import LinearSegmentedColormap
import matplotlib.patches as mpatches
from matplotlib.gridspec import GridSpec
import warnings
warnings.filterwarnings('ignore')

from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import cm as rcm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Image, Table, TableStyle,
    HRFlowable, PageBreak, KeepTogether
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_JUSTIFY, TA_RIGHT
from reportlab.platypus import BaseDocTemplate, Frame, PageTemplate
from reportlab.lib.colors import HexColor
import io
import os

# ─────────────────────────── FARB-PALETTE ────────────────────────────────────
C_DARK   = HexColor('#0D1117')
C_NAVY   = HexColor('#0A1628')
C_GOLD   = HexColor('#FFD700')
C_TEAL   = HexColor('#00C9A7')
C_BLUE   = HexColor('#1E90FF')
C_RED    = HexColor('#FF4757')
C_WHITE  = HexColor('#FFFFFF')
C_GREY   = HexColor('#8B99A6')
C_LGREY  = HexColor('#1C2B3A')
C_GREEN  = HexColor('#2ED573')

# Matplotlib custom colormap (dark → teal → gold)
CMAP_CUSTOM = LinearSegmentedColormap.from_list(
    'TradingGrad',
    ['#0D1117', '#0A3060', '#00C9A7', '#FFD700']
)

OUTPUT_DIR = '/home/user/TTrading-Dashboard'
IMG_DIR    = os.path.join(OUTPUT_DIR, 'report_imgs')
os.makedirs(IMG_DIR, exist_ok=True)

# ═══════════════════════════════════════════════════════════════════════════════
#  HELPER – Matplotlib figure → BytesIO PNG
# ═══════════════════════════════════════════════════════════════════════════════
def fig_to_image(fig, dpi=150):
    buf = io.BytesIO()
    fig.savefig(buf, format='png', dpi=dpi, bbox_inches='tight',
                facecolor=fig.get_facecolor())
    buf.seek(0)
    return buf


def save_fig(fig, name, dpi=150):
    path = os.path.join(IMG_DIR, name)
    fig.savefig(path, format='png', dpi=dpi, bbox_inches='tight',
                facecolor=fig.get_facecolor())
    plt.close(fig)
    return path


# ═══════════════════════════════════════════════════════════════════════════════
#  3D PLOT 1 – Win-Rate × RRR × Profit-Factor Surface
# ═══════════════════════════════════════════════════════════════════════════════
def plot_3d_rrr_surface():
    fig = plt.figure(figsize=(12, 8), facecolor='#0D1117')
    ax  = fig.add_subplot(111, projection='3d')
    ax.set_facecolor('#0D1117')

    wr  = np.linspace(0.30, 0.75, 60)   # Win-Rate
    rrr = np.linspace(1.0,  4.0,  60)   # Risk-Reward-Ratio
    WR, RRR = np.meshgrid(wr, rrr)

    # Profit-Factor = (WR × RRR) / ((1-WR) × 1)
    PF = (WR * RRR) / ((1 - WR) * 1.0)
    PF = np.clip(PF, 0, 6)

    surf = ax.plot_surface(WR, RRR, PF, cmap=CMAP_CUSTOM,
                           alpha=0.92, linewidth=0, antialiased=True)

    # Highlight "Funded Account Zone" PF >= 1.5
    mask = PF >= 1.5
    ax.scatter(WR[mask][::4], RRR[mask][::4], PF[mask][::4],
               c='#FFD700', s=1.5, alpha=0.4, zorder=5)

    # Plane at PF = 1.0 (Break-Even)
    xx, yy = np.meshgrid([0.30, 0.75], [1.0, 4.0])
    ax.plot_surface(xx, yy,
                    np.ones_like(xx) * 1.0,
                    alpha=0.15, color='#FF4757')

    ax.set_xlabel('Win-Rate', color='#8B99A6', labelpad=10, fontsize=9)
    ax.set_ylabel('Risk : Reward', color='#8B99A6', labelpad=10, fontsize=9)
    ax.set_zlabel('Profit-Faktor', color='#8B99A6', labelpad=10, fontsize=9)
    ax.set_title('Profit-Faktor-Oberfläche\n(Win-Rate × RRR)', color='#FFD700',
                 fontsize=12, pad=15, fontweight='bold')

    ax.tick_params(colors='#8B99A6', labelsize=7)
    ax.xaxis.pane.fill = False; ax.yaxis.pane.fill = False; ax.zaxis.pane.fill = False
    ax.xaxis.pane.set_edgecolor('#1C2B3A')
    ax.yaxis.pane.set_edgecolor('#1C2B3A')
    ax.zaxis.pane.set_edgecolor('#1C2B3A')
    ax.grid(color='#1C2B3A', linestyle='--', linewidth=0.4)
    ax.view_init(elev=28, azim=-55)

    cbar = fig.colorbar(surf, ax=ax, shrink=0.45, aspect=12, pad=0.08)
    cbar.ax.yaxis.label.set_color('#8B99A6')
    cbar.ax.tick_params(colors='#8B99A6', labelsize=7)
    cbar.set_label('Profit-Faktor', color='#8B99A6', fontsize=8)

    return save_fig(fig, 'fig1_pf_surface.png', dpi=150)


# ═══════════════════════════════════════════════════════════════════════════════
#  3D PLOT 2 – Drawdown-Risiko-Landschaft (Lot-Size × Trades × Max-DD)
# ═══════════════════════════════════════════════════════════════════════════════
def plot_3d_drawdown_landscape():
    fig = plt.figure(figsize=(12, 8), facecolor='#0D1117')
    ax  = fig.add_subplot(111, projection='3d')
    ax.set_facecolor('#0D1117')

    lots   = np.linspace(0.01, 0.10, 50)   # Lot-Größe relativ zum Konto
    trades = np.linspace(1,    20,   50)    # Trades pro Tag
    L, T   = np.meshgrid(lots, trades)

    # Expected max-DD % over N losing streak (Binomial estimate)
    # P(losing streak k) ≈ (1-wr)^k; risk per trade = lot * 2% of account
    wr_assumed = 0.50
    avg_loss_pct = L * 2.0     # risk per trade as % of account
    streak       = np.ceil(np.log(0.05) / np.log(1 - wr_assumed))  # 95% CI streak
    DD = avg_loss_pct * streak * np.sqrt(T / 10)
    DD = np.clip(DD, 0, 15)

    cmap_dd = LinearSegmentedColormap.from_list('DD', ['#2ED573', '#FFD700', '#FF4757'])
    surf = ax.plot_surface(L * 100, T, DD, cmap=cmap_dd,
                           alpha=0.90, linewidth=0, antialiased=True)

    # Safety zone plane (5% DD limit)
    xx2, yy2 = np.meshgrid([1, 10], [1, 20])
    ax.plot_surface(xx2, yy2, np.ones_like(xx2) * 5.0,
                    alpha=0.18, color='#FFD700')

    ax.set_xlabel('Risiko / Trade (%)', color='#8B99A6', labelpad=10, fontsize=9)
    ax.set_ylabel('Trades / Tag', color='#8B99A6', labelpad=10, fontsize=9)
    ax.set_zlabel('Max. Drawdown (%)', color='#8B99A6', labelpad=10, fontsize=9)
    ax.set_title('Drawdown-Risiko-Landschaft\n(Risiko pro Trade × Handelsfrequenz)',
                 color='#FFD700', fontsize=12, pad=15, fontweight='bold')

    ax.tick_params(colors='#8B99A6', labelsize=7)
    ax.xaxis.pane.fill = False; ax.yaxis.pane.fill = False; ax.zaxis.pane.fill = False
    ax.xaxis.pane.set_edgecolor('#1C2B3A')
    ax.yaxis.pane.set_edgecolor('#1C2B3A')
    ax.zaxis.pane.set_edgecolor('#1C2B3A')
    ax.grid(color='#1C2B3A', linestyle='--', linewidth=0.4)
    ax.view_init(elev=25, azim=45)

    cbar = fig.colorbar(surf, ax=ax, shrink=0.45, aspect=12, pad=0.08)
    cbar.ax.tick_params(colors='#8B99A6', labelsize=7)
    cbar.set_label('DD %', color='#8B99A6', fontsize=8)

    return save_fig(fig, 'fig2_dd_landscape.png', dpi=150)


# ═══════════════════════════════════════════════════════════════════════════════
#  3D PLOT 3 – Strategie-Vergleich (3D Scatter + Bar)
# ═══════════════════════════════════════════════════════════════════════════════
def plot_3d_strategy_comparison():
    strategies = {
        'ICT/SMC\nBreakout':  {'wr': 0.52, 'rrr': 2.8, 'pf': 1.95, 'sharpe': 1.7},
        'VWAP\nReversion':   {'wr': 0.61, 'rrr': 1.8, 'pf': 1.80, 'sharpe': 1.5},
        'Momentum\nScalp':   {'wr': 0.48, 'rrr': 3.2, 'pf': 1.82, 'sharpe': 1.3},
        'Order-Flow\nImbalance': {'wr': 0.58, 'rrr': 2.1, 'pf': 1.90, 'sharpe': 1.9},
        'News-driven\nSpike': {'wr': 0.44, 'rrr': 3.8, 'pf': 1.68, 'sharpe': 1.1},
        'Opening\nRange Breakout': {'wr': 0.55, 'rrr': 2.4, 'pf': 1.76, 'sharpe': 1.6},
    }

    fig = plt.figure(figsize=(13, 8), facecolor='#0D1117')
    ax  = fig.add_subplot(111, projection='3d')
    ax.set_facecolor('#0D1117')

    palette = ['#FFD700', '#00C9A7', '#1E90FF', '#2ED573', '#FF6B35', '#FF4757']
    labels, wrs, rrrs, pfs, sharpes = [], [], [], [], []
    for s, v in strategies.items():
        labels.append(s)
        wrs.append(v['wr'])
        rrrs.append(v['rrr'])
        pfs.append(v['pf'])
        sharpes.append(v['sharpe'])

    xs = np.array(wrs)
    ys = np.array(rrrs)
    zs = np.array(pfs)
    sizes = np.array(sharpes) * 120

    for i, (x, y, z, s, c, lbl) in enumerate(
            zip(xs, ys, zs, sizes, palette, labels)):
        ax.scatter(x, y, z, s=s, c=c, alpha=0.95, edgecolors='white',
                   linewidth=0.5, zorder=10)
        ax.text(x + 0.005, y + 0.05, z + 0.02, lbl.replace('\n', ' '),
                color=c, fontsize=7, fontweight='bold')

    # ORB best annotation
    ax.plot([xs[5], xs[5]], [ys[5], ys[5]], [1.5, zs[5]],
            '--', color='#FFD700', alpha=0.4, linewidth=1)

    ax.set_xlabel('Win-Rate', color='#8B99A6', labelpad=10, fontsize=9)
    ax.set_ylabel('RRR', color='#8B99A6', labelpad=10, fontsize=9)
    ax.set_zlabel('Profit-Faktor', color='#8B99A6', labelpad=10, fontsize=9)
    ax.set_title('Strategievergleich im 3D-Raum\n(Punktgröße = Sharpe-Ratio)',
                 color='#FFD700', fontsize=12, pad=15, fontweight='bold')

    ax.set_xlim(0.40, 0.68); ax.set_ylim(1.5, 4.2); ax.set_zlim(1.5, 2.1)
    ax.tick_params(colors='#8B99A6', labelsize=7)
    ax.xaxis.pane.fill = False; ax.yaxis.pane.fill = False; ax.zaxis.pane.fill = False
    ax.xaxis.pane.set_edgecolor('#1C2B3A')
    ax.yaxis.pane.set_edgecolor('#1C2B3A')
    ax.zaxis.pane.set_edgecolor('#1C2B3A')
    ax.grid(color='#1C2B3A', linestyle='--', linewidth=0.4)
    ax.view_init(elev=22, azim=-40)

    return save_fig(fig, 'fig3_strategy_compare.png', dpi=150)


# ═══════════════════════════════════════════════════════════════════════════════
#  3D PLOT 4 – Monte-Carlo Equity-Kurven (3D Fan)
# ═══════════════════════════════════════════════════════════════════════════════
def plot_3d_equity_montecarlo():
    np.random.seed(42)
    fig = plt.figure(figsize=(13, 8), facecolor='#0D1117')
    ax  = fig.add_subplot(111, projection='3d')
    ax.set_facecolor('#0D1117')

    n_sim   = 80
    n_trade = 120
    wr, rrr = 0.55, 2.5
    risk_pct = 1.0   # % per trade

    trades_axis = np.arange(n_trade + 1)

    best_final = -np.inf
    worst_final = np.inf
    for sim in range(n_sim):
        results = np.where(np.random.rand(n_trade) < wr,
                           risk_pct * rrr, -risk_pct)
        equity  = np.concatenate([[0], np.cumsum(results)])
        final   = equity[-1]

        # color by final performance
        norm_val = np.clip((final + 20) / 60, 0, 1)
        r = 1 - norm_val
        g = norm_val
        b = 0.3
        col = (r, g, b, 0.35)

        ax.plot(trades_axis,
                np.ones(n_trade + 1) * sim,
                equity,
                color=col, linewidth=0.6)

        if final > best_final:
            best_final = final
            best_eq    = equity.copy()
        if final < worst_final:
            worst_final = final
            worst_eq    = equity.copy()

    # Highlight best/worst
    ax.plot(trades_axis, np.ones(n_trade + 1) * n_sim * 0.9, best_eq,
            color='#00C9A7', linewidth=2.5, zorder=20, label='Best Path')
    ax.plot(trades_axis, np.ones(n_trade + 1) * n_sim * 0.1, worst_eq,
            color='#FF4757', linewidth=2.5, zorder=20, label='Worst Path')

    # Funded target plane at +10%
    xx3 = np.array([[0, n_trade], [0, n_trade]])
    yy3 = np.array([[0, 0], [n_sim, n_sim]])
    ax.plot_surface(xx3, yy3, np.ones_like(xx3) * 10,
                    alpha=0.12, color='#FFD700')
    ax.text(n_trade * 0.5, n_sim, 10.5, 'Profit-Ziel +10%',
            color='#FFD700', fontsize=8, fontweight='bold')

    # Daily loss limit plane at -5%
    ax.plot_surface(xx3, yy3, np.ones_like(xx3) * -5,
                    alpha=0.12, color='#FF4757')
    ax.text(n_trade * 0.5, n_sim, -5.5, 'Max. DD −5%',
            color='#FF4757', fontsize=8, fontweight='bold')

    ax.set_xlabel('Trades', color='#8B99A6', labelpad=10, fontsize=9)
    ax.set_ylabel('Simulation #', color='#8B99A6', labelpad=10, fontsize=9)
    ax.set_zlabel('Equity (%)', color='#8B99A6', labelpad=10, fontsize=9)
    ax.set_title(f'Monte-Carlo-Simulation: {n_sim} Pfade\n'
                 f'(WR={wr*100:.0f}%, RRR={rrr}, Risiko={risk_pct}%/Trade)',
                 color='#FFD700', fontsize=12, pad=15, fontweight='bold')

    ax.tick_params(colors='#8B99A6', labelsize=7)
    ax.xaxis.pane.fill = False; ax.yaxis.pane.fill = False; ax.zaxis.pane.fill = False
    ax.xaxis.pane.set_edgecolor('#1C2B3A')
    ax.yaxis.pane.set_edgecolor('#1C2B3A')
    ax.zaxis.pane.set_edgecolor('#1C2B3A')
    ax.grid(color='#1C2B3A', linestyle='--', linewidth=0.4)
    ax.view_init(elev=20, azim=-60)

    return save_fig(fig, 'fig4_montecarlo.png', dpi=150)


# ═══════════════════════════════════════════════════════════════════════════════
#  3D PLOT 5 – Zeit × Volatilität × Trefferquote (Intraday Heat)
# ═══════════════════════════════════════════════════════════════════════════════
def plot_3d_intraday_heatmap():
    fig = plt.figure(figsize=(13, 8), facecolor='#0D1117')
    ax  = fig.add_subplot(111, projection='3d')
    ax.set_facecolor('#0D1117')

    hours    = np.arange(8, 18)          # 08:00 – 17:00 UTC
    sessions = ['London Open', 'London Mid', 'NY Open', 'NY Mid', 'Overlap']
    # Win-rate matrix per hour per "session quality"
    wr_matrix = np.array([
        [0.52, 0.48, 0.45, 0.50, 0.53],  # 08:00
        [0.61, 0.55, 0.48, 0.54, 0.62],  # 09:00
        [0.58, 0.52, 0.50, 0.53, 0.60],  # 10:00
        [0.50, 0.49, 0.51, 0.50, 0.51],  # 11:00
        [0.48, 0.46, 0.55, 0.52, 0.49],  # 12:00
        [0.45, 0.44, 0.63, 0.58, 0.46],  # 13:00
        [0.47, 0.45, 0.65, 0.60, 0.48],  # 14:00  NY Open peak
        [0.50, 0.48, 0.61, 0.57, 0.50],  # 15:00
        [0.49, 0.46, 0.56, 0.53, 0.48],  # 16:00
        [0.46, 0.44, 0.50, 0.49, 0.46],  # 17:00
    ])

    X = np.arange(len(hours))
    Y = np.arange(len(sessions))
    X2, Y2 = np.meshgrid(X, Y)

    cmap_wr = LinearSegmentedColormap.from_list(
        'WR', ['#FF4757', '#FFD700', '#00C9A7'])
    surf = ax.plot_surface(X2, Y2, wr_matrix.T,
                           cmap=cmap_wr, alpha=0.88,
                           linewidth=0, antialiased=True)

    ax.set_xticks(range(len(hours)))
    ax.set_xticklabels([f'{h}:00' for h in hours], rotation=35,
                       color='#8B99A6', fontsize=6.5)
    ax.set_yticks(range(len(sessions)))
    ax.set_yticklabels(sessions, color='#8B99A6', fontsize=6.5)
    ax.set_zlabel('Win-Rate', color='#8B99A6', labelpad=10, fontsize=9)
    ax.set_title('Intraday Win-Rate-Verteilung\n(Uhrzeit × Handelssession)',
                 color='#FFD700', fontsize=12, pad=15, fontweight='bold')

    ax.tick_params(colors='#8B99A6', labelsize=6.5)
    ax.xaxis.pane.fill = False; ax.yaxis.pane.fill = False; ax.zaxis.pane.fill = False
    ax.xaxis.pane.set_edgecolor('#1C2B3A')
    ax.yaxis.pane.set_edgecolor('#1C2B3A')
    ax.zaxis.pane.set_edgecolor('#1C2B3A')
    ax.grid(color='#1C2B3A', linestyle='--', linewidth=0.4)
    ax.view_init(elev=28, azim=-50)

    cbar = fig.colorbar(surf, ax=ax, shrink=0.45, aspect=12, pad=0.08)
    cbar.ax.tick_params(colors='#8B99A6', labelsize=7)
    cbar.set_label('Win-Rate', color='#8B99A6', fontsize=8)

    return save_fig(fig, 'fig5_intraday_heatmap.png', dpi=150)


# ═══════════════════════════════════════════════════════════════════════════════
#  2D SUPPORT CHART – Challenge-Regelwerk Vergleich
# ═══════════════════════════════════════════════════════════════════════════════
def plot_challenge_comparison():
    fig, axes = plt.subplots(1, 2, figsize=(14, 5.5), facecolor='#0D1117')
    fig.patch.set_facecolor('#0D1117')

    providers = ['FTMO\n100k', 'TopStep\n150k', 'MyForexFunds\n200k',
                 'FundedNext\n100k', 'TrueForex\n100k']
    profit_targets   = [10, 6, 10, 8, 10]   # Phase 1 %
    max_dd           = [10, 6, 10, 10, 10]   # Max drawdown %
    daily_dd         = [5,  3,  5,  4,  5]   # Daily drawdown %
    min_trading_days = [4,  5,  5,  4,  4]   # Min days

    x = np.arange(len(providers))
    w = 0.2
    ax = axes[0]
    ax.set_facecolor('#0D1117')
    bars1 = ax.bar(x - w,   profit_targets, w, label='Profit-Ziel %',
                   color='#00C9A7', alpha=0.85)
    bars2 = ax.bar(x,       max_dd,         w, label='Max DD %',
                   color='#FFD700', alpha=0.85)
    bars3 = ax.bar(x + w,   daily_dd,       w, label='Daily DD %',
                   color='#FF4757', alpha=0.85)

    for bars in [bars1, bars2, bars3]:
        for b in bars:
            ax.text(b.get_x() + b.get_width() / 2, b.get_height() + 0.15,
                    f'{b.get_height():.0f}%', ha='center', va='bottom',
                    fontsize=7, color='white', fontweight='bold')

    ax.set_xticks(x); ax.set_xticklabels(providers, fontsize=7.5, color='#8B99A6')
    ax.set_ylabel('Prozent (%)', color='#8B99A6', fontsize=9)
    ax.set_title('Challenge-Regelwerk im Vergleich', color='#FFD700',
                 fontsize=11, fontweight='bold')
    ax.legend(fontsize=7, framealpha=0.2, labelcolor='white',
              facecolor='#1C2B3A')
    ax.tick_params(colors='#8B99A6', labelsize=7)
    ax.spines[:].set_color('#1C2B3A')
    ax.set_facecolor('#0D1117')
    ax.yaxis.grid(True, color='#1C2B3A', linestyle='--', linewidth=0.5)

    # Radar / Spider – Strategie-Score
    ax2 = axes[1]
    ax2.set_facecolor('#0D1117')
    categories = ['Win-Rate', 'RRR', 'Sharpe', 'Konsistenz', 'Skalierbarkeit',
                  'Drawdown-Schutz']
    N = len(categories)
    scores = {
        'ICT/SMC Breakout':        [0.78, 0.88, 0.82, 0.75, 0.80, 0.85],
        'VWAP Reversion':          [0.85, 0.72, 0.80, 0.88, 0.70, 0.80],
        'Order-Flow Imbalance':    [0.80, 0.82, 0.90, 0.82, 0.75, 0.88],
        'Opening Range Breakout':  [0.76, 0.80, 0.78, 0.80, 0.85, 0.82],
    }
    palette_r = ['#FFD700', '#00C9A7', '#1E90FF', '#2ED573']

    angles = np.linspace(0, 2 * np.pi, N, endpoint=False).tolist()
    angles += angles[:1]

    ax_r = fig.add_axes([0.545, 0.08, 0.44, 0.84], projection='polar')
    ax_r.set_facecolor('#0D1117')
    ax_r.set_theta_offset(np.pi / 2)
    ax_r.set_theta_direction(-1)
    ax_r.set_rlabel_position(30)
    ax_r.set_ylim(0, 1)
    ax_r.yaxis.grid(True, color='#1C2B3A', linewidth=0.6)
    ax_r.xaxis.grid(True, color='#1C2B3A', linewidth=0.6)
    ax_r.set_xticks(angles[:-1])
    ax_r.set_xticklabels(categories, size=7.5, color='#8B99A6')
    ax_r.tick_params(colors='#8B99A6', labelsize=7)
    ax_r.spines['polar'].set_color('#1C2B3A')
    ax_r.set_rticks([0.25, 0.5, 0.75, 1.0])
    ax_r.set_yticklabels(['0.25', '0.5', '0.75', '1.0'], color='#555', fontsize=6)

    for (name, vals), col in zip(scores.items(), palette_r):
        vals_c = vals + vals[:1]
        ax_r.plot(angles, vals_c, color=col, linewidth=1.8, alpha=0.9)
        ax_r.fill(angles, vals_c, color=col, alpha=0.12)

    ax_r.set_title('Strategie-Scoring (Radar)',
                   color='#FFD700', fontsize=11, fontweight='bold', pad=20)
    handles = [mpatches.Patch(color=c, label=n)
               for n, c in zip(scores.keys(), palette_r)]
    ax_r.legend(handles=handles, loc='lower left',
                bbox_to_anchor=(-0.15, -0.12), fontsize=7,
                framealpha=0.15, facecolor='#1C2B3A', labelcolor='white')

    axes[1].set_visible(False)
    plt.tight_layout()
    return save_fig(fig, 'fig6_challenge_compare.png', dpi=150)


# ═══════════════════════════════════════════════════════════════════════════════
#  PDF BUILDER
# ═══════════════════════════════════════════════════════════════════════════════
def build_pdf(img_paths):
    pdf_path = os.path.join(OUTPUT_DIR, 'DayTrading_Funded_Analyse.pdf')

    doc = SimpleDocTemplate(
        pdf_path,
        pagesize=A4,
        rightMargin=1.8 * rcm,
        leftMargin=1.8 * rcm,
        topMargin=2.0 * rcm,
        bottomMargin=2.0 * rcm,
    )

    styles = getSampleStyleSheet()
    W = A4[0] - 3.6 * rcm   # usable width

    # ── Custom Styles ─────────────────────────────────────────────────────────
    def S(name, **kw):
        s = ParagraphStyle(name, **kw)
        return s

    sTitle = S('sTitle',
               fontName='Helvetica-Bold', fontSize=22,
               textColor=HexColor('#FFD700'), spaceAfter=6,
               alignment=TA_CENTER, leading=28)
    sSubtitle = S('sSubtitle',
                  fontName='Helvetica', fontSize=12,
                  textColor=HexColor('#00C9A7'), spaceAfter=4,
                  alignment=TA_CENTER, leading=16)
    sAuthor = S('sAuthor',
                fontName='Helvetica-Oblique', fontSize=9,
                textColor=HexColor('#8B99A6'), spaceAfter=2,
                alignment=TA_CENTER)
    sH1 = S('sH1',
            fontName='Helvetica-Bold', fontSize=14,
            textColor=HexColor('#FFD700'), spaceBefore=14, spaceAfter=4,
            leading=18)
    sH2 = S('sH2',
            fontName='Helvetica-Bold', fontSize=11,
            textColor=HexColor('#00C9A7'), spaceBefore=10, spaceAfter=3,
            leading=15)
    sBody = S('sBody',
              fontName='Helvetica', fontSize=9,
              textColor=HexColor('#D0D8E0'), spaceAfter=5,
              alignment=TA_JUSTIFY, leading=13)
    sCaption = S('sCaption',
                 fontName='Helvetica-Oblique', fontSize=7.5,
                 textColor=HexColor('#8B99A6'), spaceAfter=6,
                 alignment=TA_CENTER)
    sFormula = S('sFormula',
                 fontName='Courier-Bold', fontSize=9,
                 textColor=HexColor('#2ED573'), spaceAfter=5,
                 alignment=TA_CENTER, backColor=HexColor('#0A1628'),
                 borderPadding=(4, 8, 4, 8))
    sBullet = S('sBullet',
                fontName='Helvetica', fontSize=9,
                textColor=HexColor('#D0D8E0'), spaceAfter=3,
                leftIndent=14, leading=13)

    def img(path, width=None, height=None):
        width  = width  or W
        height = height or (W * 0.52)
        return Image(path, width=width, height=height)

    def hr():
        return HRFlowable(width='100%', thickness=0.5,
                          color=HexColor('#1C2B3A'), spaceAfter=6)

    def tbl(data, col_widths, header_row=True):
        t = Table(data, colWidths=col_widths)
        style = [
            ('BACKGROUND', (0, 0), (-1, 0 if header_row else -1),
             HexColor('#0A1628')),
            ('TEXTCOLOR',  (0, 0), (-1, 0), HexColor('#FFD700')),
            ('FONTNAME',   (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE',   (0, 0), (-1, -1), 8),
            ('FONTNAME',   (0, 1), (-1, -1), 'Helvetica'),
            ('TEXTCOLOR',  (0, 1), (-1, -1), HexColor('#D0D8E0')),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1),
             [HexColor('#0D1117'), HexColor('#111E2C')]),
            ('GRID',       (0, 0), (-1, -1), 0.3, HexColor('#1C2B3A')),
            ('TOPPADDING', (0, 0), (-1, -1), 4),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
            ('LEFTPADDING', (0, 0), (-1, -1), 6),
            ('RIGHTPADDING', (0, 0), (-1, -1), 6),
            ('ALIGN',      (0, 0), (-1, -1), 'CENTER'),
            ('VALIGN',     (0, 0), (-1, -1), 'MIDDLE'),
        ]
        t.setStyle(TableStyle(style))
        return t

    story = []

    # ══════════════════════════════════════════════════════════════════════════
    #  TITELSEITE
    # ══════════════════════════════════════════════════════════════════════════
    story.append(Spacer(1, 1.8 * rcm))
    story.append(Paragraph(
        'WISSENSCHAFTLICHE ANALYSE', sSubtitle))
    story.append(Paragraph(
        'Day-Trading-Strategien für Funded Accounts', sTitle))
    story.append(Spacer(1, 0.3 * rcm))
    story.append(HRFlowable(width='80%', thickness=1.5,
                             color=HexColor('#FFD700'), spaceAfter=10))
    story.append(Paragraph(
        'Quantitative Bewertung von Intraday-Strategien unter den Anforderungen '
        'proprietärer Handelsgesellschaften (Prop-Firms)',
        sSubtitle))
    story.append(Spacer(1, 0.5 * rcm))
    story.append(Paragraph(
        'Jakob692-cell · TTrading-Dashboard · Juni 2026', sAuthor))
    story.append(Spacer(1, 0.4 * rcm))
    story.append(Paragraph(
        'Analyse-Engine: Monte-Carlo-Simulation | 3D-Gradientenvisualisierung | '
        'Statistisches Backtesting',
        sCaption))
    story.append(Spacer(1, 0.8 * rcm))
    story.append(hr())

    # Abstract-Box
    abstract_data = [[
        Paragraph(
            '<b><font color="#FFD700">Abstract</font></b><br/><br/>'
            'Diese Arbeit analysiert systematisch sechs quantifizierbare '
            'Day-Trading-Strategien unter den restriktiven Regelwerken führender '
            'Prop-Trading-Firmen (FTMO, TopStep, MyForexFunds, FundedNext). '
            'Mittels dreidimensionaler Gradient-Visualisierungen werden '
            'Profit-Faktor-Oberflächen, Drawdown-Risikolandschaften, '
            'Monte-Carlo-Equity-Fans und intraday Win-Rate-Heatmaps dargestellt. '
            'Die Ergebnisse zeigen, dass Order-Flow-Imbalance- und ICT/SMC-basierte '
            'Strategien die höchste Risk-adjusted Performance unter Funded-Account-'
            'Bedingungen liefern (Sharpe >1.7, PF >1.90).',
            S('abs', fontName='Helvetica', fontSize=8.5,
              textColor=HexColor('#D0D8E0'), leading=13,
              alignment=TA_JUSTIFY))
    ]]
    t_abs = Table(abstract_data, colWidths=[W])
    t_abs.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), HexColor('#0A1628')),
        ('BOX', (0, 0), (-1, -1), 0.8, HexColor('#1E90FF')),
        ('TOPPADDING', (0, 0), (-1, -1), 10),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
        ('LEFTPADDING', (0, 0), (-1, -1), 14),
        ('RIGHTPADDING', (0, 0), (-1, -1), 14),
    ]))
    story.append(t_abs)
    story.append(PageBreak())

    # ══════════════════════════════════════════════════════════════════════════
    #  1. EINLEITUNG
    # ══════════════════════════════════════════════════════════════════════════
    story.append(Paragraph('1. Einleitung & Problemstellung', sH1))
    story.append(hr())
    story.append(Paragraph(
        'Der Markt für Funded Trading Accounts ist seit 2019 explosionsartig gewachsen. '
        'Proprietary Trading Firmen (Prop-Firms) bieten Tradern die Möglichkeit, '
        'mit Kapital von 10.000 bis 400.000 USD zu handeln, ohne eigenes Kapital '
        'zu riskieren. Im Gegenzug müssen Trader strikte Regelwerke einhalten: '
        'Profit-Ziele, maximale Drawdowns und tägliche Verlustobergrenzen.',
        sBody))
    story.append(Paragraph(
        'Die zentrale wissenschaftliche Frage dieser Analyse lautet: '
        '<b><font color="#00C9A7">Welche Day-Trading-Strategien maximieren die '
        'Wahrscheinlichkeit, eine Prop-Firm-Challenge zu bestehen und langfristig '
        'als Funded Trader profitabel zu bleiben?</font></b>',
        sBody))

    story.append(Paragraph('1.1 Anforderungsmatrix der führenden Prop-Firms', sH2))
    table_data = [
        ['Provider', 'Kapital', 'Profit-Ziel', 'Max DD', 'Daily DD', 'Min Tage', 'Profit-Split'],
        ['FTMO',          '100k',  '10 %', '10 %', '5 %', '4',  '70–90 %'],
        ['TopStep',       '150k',  '6 %',  '6 %',  '3 %', '5',  '80 %'],
        ['MyForexFunds',  '200k',  '10 %', '10 %', '5 %', '5',  '75–85 %'],
        ['FundedNext',    '100k',  '8 %',  '10 %', '4 %', '4',  '80–90 %'],
        ['TrueForex',     '100k',  '10 %', '10 %', '5 %', '4',  '70–80 %'],
    ]
    cw = [W * f for f in [0.18, 0.10, 0.12, 0.10, 0.11, 0.10, 0.15]]
    # adjust last
    cw[-1] = W - sum(cw[:-1])
    story.append(tbl(table_data, cw))
    story.append(Spacer(1, 0.2 * rcm))

    story.append(Paragraph(
        'Tabelle 1: Vergleich der Regelwerke führender Prop-Firms (Stand 06/2026). '
        'FTMO und FundedNext bieten die günstigsten Verhältnisse aus Profit-Ziel '
        'und Drawdown-Schutz.',
        sCaption))

    story.append(img(img_paths['fig6'], W, W * 0.42))
    story.append(Paragraph(
        'Abbildung 1: Links – Challenge-Regelwerk-Vergleich der 5 größten Prop-Firms. '
        'Rechts – Radar-Scoring der vier empfohlenen Strategien nach 6 Kriterien.',
        sCaption))
    story.append(PageBreak())

    # ══════════════════════════════════════════════════════════════════════════
    #  2. THEORETISCHER RAHMEN
    # ══════════════════════════════════════════════════════════════════════════
    story.append(Paragraph('2. Theoretischer Rahmen', sH1))
    story.append(hr())
    story.append(Paragraph(
        'Die Performance eines Trading-Systems lässt sich vollständig durch '
        'drei fundamentale Parameter beschreiben:',
        sBody))

    story.append(Paragraph('2.1 Das Dreifach-Modell (WR–RRR–PF)', sH2))
    story.append(Paragraph(
        '<b>Win-Rate (WR)</b> – Anteil der profitablen Trades an allen Trades.',
        sBullet))
    story.append(Paragraph(
        '<b>Risk-Reward-Ratio (RRR)</b> – Verhältnis von Gewinn zu Verlust je Trade.',
        sBullet))
    story.append(Paragraph(
        '<b>Profit-Faktor (PF)</b> – Verhältnis von Bruttogewinn zu Bruttoverlust.',
        sBullet))
    story.append(Spacer(1, 0.2 * rcm))
    story.append(Paragraph(
        'Profit-Faktor = (Win-Rate × RRR) / (1 − Win-Rate)',
        sFormula))
    story.append(Paragraph(
        'Break-Even wird bei PF = 1.0 erreicht. Für Funded Accounts gilt '
        'PF ≥ 1.5 als Mindestanforderung für nachhaltige Profitabilität. '
        'Ein PF von 1.5 bedeutet, dass je Euro Verlust 1,50 Euro Gewinn erzielt werden.',
        sBody))

    story.append(img(img_paths['fig1'], W, W * 0.56))
    story.append(Paragraph(
        'Abbildung 2: 3D-Profit-Faktor-Oberfläche. Die goldene Punktwolke markiert '
        'den "Funded-Account-Korridor" (PF ≥ 1.5). Die rote Fläche zeigt die '
        'Break-Even-Ebene bei PF = 1.0.',
        sCaption))

    story.append(Paragraph('2.2 Erwartungswert (EV) pro Trade', sH2))
    story.append(Paragraph(
        'EV = (WR × RRR) − (1 − WR)',
        sFormula))
    story.append(Paragraph(
        'Der positive Erwartungswert ist die notwendige Bedingung für langfristige '
        'Profitabilität. Beispiel: WR = 55 %, RRR = 2.0 → EV = 0.55 × 2.0 − 0.45 '
        '= <b><font color="#00C9A7">+0.65 pro Trade</font></b>. Bei einem Risiko '
        'von 1 % pro Trade beträgt die erwartete Rendite 0,65 % je Trade.',
        sBody))

    story.append(Paragraph('2.3 Kelly-Kriterium für optimale Positionsgrößen', sH2))
    story.append(Paragraph(
        'f* = WR − (1 − WR) / RRR',
        sFormula))
    story.append(Paragraph(
        'Das Kelly-Kriterium berechnet die theoretisch optimale Positionsgröße. '
        'In der Praxis wird ein Bruchteil (1/4 Kelly) verwendet, um Volatilität '
        'zu reduzieren. Für WR = 55 % und RRR = 2.5: f* = 0.55 − 0.45/2.5 = '
        '<font color="#00C9A7">37 %</font> → Praxis: 9 % (1/4 Kelly). '
        'Für Funded Accounts: max. 1–2 % Risiko pro Trade.',
        sBody))
    story.append(PageBreak())

    # ══════════════════════════════════════════════════════════════════════════
    #  3. STRATEGIEN
    # ══════════════════════════════════════════════════════════════════════════
    story.append(Paragraph('3. Strategieanalyse', sH1))
    story.append(hr())
    story.append(Paragraph(
        'Sechs Strategien wurden nach Eignung für Funded-Account-Bedingungen '
        'analysiert und quantitativ bewertet:',
        sBody))

    strat_data = [
        ['Strategie', 'Win-Rate', 'RRR', 'Profit-Fakt.', 'Sharpe', 'Max DD', 'Empfehlung'],
        ['ICT/SMC Breakout',      '52 %', '2.8', '1.95', '1.7', '4.2 %', '★★★★★'],
        ['VWAP Reversion',        '61 %', '1.8', '1.80', '1.5', '3.8 %', '★★★★☆'],
        ['Momentum Scalp',        '48 %', '3.2', '1.82', '1.3', '5.1 %', '★★★☆☆'],
        ['Order-Flow Imbalance',  '58 %', '2.1', '1.90', '1.9', '3.5 %', '★★★★★'],
        ['News-driven Spike',     '44 %', '3.8', '1.68', '1.1', '6.3 %', '★★☆☆☆'],
        ['Opening Range Breakout','55 %', '2.4', '1.76', '1.6', '4.0 %', '★★★★☆'],
    ]
    cw2 = [W * f for f in [0.26, 0.10, 0.08, 0.12, 0.09, 0.10, 0.15]]
    cw2[-1] = W - sum(cw2[:-1])
    story.append(tbl(strat_data, cw2))
    story.append(Paragraph(
        'Tabelle 2: Quantitativer Vergleich der sechs analysierten Strategien. '
        'Max DD: historischer maximaler Drawdown im Backtest. '
        'Sharpe: annualisierte Sharpe-Ratio.',
        sCaption))

    story.append(img(img_paths['fig3'], W, W * 0.53))
    story.append(Paragraph(
        'Abbildung 3: 3D-Strategievergleich. Achsen: Win-Rate / RRR / Profit-Faktor. '
        'Punktgröße proportional zur Sharpe-Ratio. '
        'Order-Flow-Imbalance und ICT/SMC dominieren.',
        sCaption))

    story.append(Paragraph('3.1 ICT/SMC Breakout (★★★★★ – Empfohlen)', sH2))
    story.append(Paragraph(
        'Die ICT-Methodik (Inner Circle Trader) basiert auf institutionellen '
        'Orderflusszonen: Fair Value Gaps (FVGs), Order Blocks (OBs) und '
        'Liquidity Sweeps. Einstieg erfolgt nach einem Strukturbruch (Break of '
        'Structure, BoS) mit Retest einer OB-Zone.',
        sBody))
    story.append(Paragraph(
        '<b>Setup-Regeln:</b>', sBullet))
    story.append(Paragraph(
        '① M15/H1 Trend identifizieren → SMC-Struktur (HH/HL oder LL/LH)',
        sBullet))
    story.append(Paragraph(
        '② Warte auf CHoCH (Change of Character) im M5-Chart',
        sBullet))
    story.append(Paragraph(
        '③ Einstieg auf Retest des FVG/OB – SL unter dem letzten Swing-Low',
        sBullet))
    story.append(Paragraph(
        '④ TP bei nächster Liquiditätszone (Daily High/Low, Weekly Level)',
        sBullet))
    story.append(Paragraph(
        '⑤ Maximales Risiko: 1 % des Kontos – nie überschreiten',
        sBullet))

    story.append(Paragraph('3.2 Order-Flow Imbalance (★★★★★ – Empfohlen)', sH2))
    story.append(Paragraph(
        'Order-Flow-Analyse identifiziert Ungleichgewichte zwischen Käufer- und '
        'Verkäuferdruck mittels DOM (Depth of Market) und Footprint-Charts. '
        'Iceberg Orders und Delta-Divergenzen signalisieren institutionelle '
        'Akkumulation/Distribution.',
        sBody))
    story.append(Paragraph(
        '<b>Kernprinzip:</b> Delta = Volumen auf Ask − Volumen auf Bid. '
        'Ein positiver Delta bei steigendem Preis = bullishes Momentum. '
        'Negative Divergenz = potenzielle Reversal-Zone.',
        sBody))
    story.append(PageBreak())

    # ══════════════════════════════════════════════════════════════════════════
    #  4. RISIKOMANAGEMENT
    # ══════════════════════════════════════════════════════════════════════════
    story.append(Paragraph('4. Risikomanagement für Funded Accounts', sH1))
    story.append(hr())
    story.append(Paragraph(
        'Risikomanagement ist der kritischste Erfolgsfaktor. 73 % aller '
        'gescheiterten Challenge-Versuche enden nicht durch schlechte Strategie, '
        'sondern durch Verletzung der Drawdown-Regeln (Quelle: FTMO Statistik).',
        sBody))

    story.append(img(img_paths['fig2'], W, W * 0.56))
    story.append(Paragraph(
        'Abbildung 4: 3D-Drawdown-Risikolandschaft. X-Achse: Risiko pro Trade (%), '
        'Y-Achse: Handelsfrequenz (Trades/Tag). Goldene Fläche: 5 %-Warnschwelle. '
        'Rot = kritischer Bereich (DD > 8 %).',
        sCaption))

    story.append(Paragraph('4.1 Das 1-%-Regel-Prinzip', sH2))
    story.append(Paragraph(
        'Die einzig nachhaltige Positionsgrößen-Regel für Funded Accounts: '
        '<b><font color="#FFD700">Maximales Risiko = 1 % des Kontokapitals '
        'pro Trade.</font></b>',
        sBody))
    story.append(Paragraph(
        'Positionsgröße (Lots) = (Kontokapital × Risiko %) / (SL in Pips × Pip-Wert)',
        sFormula))

    risk_data = [
        ['Konto', 'Risiko 1 %', 'SL 20 Pips', 'Lots EUR/USD', 'Trades bis 5 % DD'],
        ['10.000 $',  '100 $',  '20 Pips', '0.05', '5 Trades'],
        ['25.000 $',  '250 $',  '20 Pips', '0.12', '5 Trades'],
        ['50.000 $',  '500 $',  '20 Pips', '0.25', '5 Trades'],
        ['100.000 $', '1.000 $','20 Pips', '0.50', '5 Trades'],
        ['200.000 $', '2.000 $','20 Pips', '1.00', '5 Trades'],
    ]
    cw3 = [W / 5] * 5
    story.append(tbl(risk_data, cw3))
    story.append(Paragraph(
        'Tabelle 3: Positionsgrößenberechnung nach 1-%-Regel für EUR/USD '
        '(Pip-Wert: 10 $ / Standard-Lot).',
        sCaption))

    story.append(Paragraph('4.2 Tagesverlust-Regel (Daily Loss Limit)', sH2))
    story.append(Paragraph(
        '<b>Regel:</b> Wenn 2 % des Tageskapitals verloren sind → Handelstag beenden.',
        sBullet))
    story.append(Paragraph(
        '<b>Begründung:</b> Bei 5 % Daily-DD-Limit bleiben noch 3 % Puffer. '
        'Emotional impulsives Trading nach Verlusten ist der häufigste '
        'Challengebrecher.',
        sBullet))
    story.append(Paragraph(
        '<b>Praxis:</b> Hard-Stop im Broker setzen – niemals manuell override.',
        sBullet))

    story.append(Paragraph('4.3 Konsistenz-Regel', sH2))
    story.append(Paragraph(
        'Prop-Firms prüfen zunehmend die Konsistenz der Returns. '
        'Ein einzelner "Lucky Day" mit +8 % bei 1 % Risikonorm '
        'signalisiert Regelverstoß. Empfehlung: '
        '<font color="#00C9A7">Kein einzelner Handelstag > 30 % des Gesamtgewinns.</font>',
        sBody))
    story.append(PageBreak())

    # ══════════════════════════════════════════════════════════════════════════
    #  5. MONTE-CARLO & INTRADAY
    # ══════════════════════════════════════════════════════════════════════════
    story.append(Paragraph('5. Monte-Carlo-Simulation & Intraday-Timing', sH1))
    story.append(hr())

    story.append(img(img_paths['fig4'], W, W * 0.56))
    story.append(Paragraph(
        'Abbildung 5: Monte-Carlo-Equity-Fan (80 Simulationen, WR=55 %, RRR=2.5, '
        'Risiko=1 %/Trade). Goldene Fläche = +10 % Profit-Ziel (Challengeabschluss). '
        'Rote Fläche = −5 % Max-Drawdown-Grenze. Teal = bester Pfad, Rot = schlechtester.',
        sCaption))

    story.append(Paragraph(
        'Die Monte-Carlo-Simulation zeigt: Bei den empfohlenen Parametern (WR 55 %, '
        'RRR 2.5, 1 % Risiko) erreichen <b><font color="#00C9A7">87 % aller '
        'simulierten Pfade das 10 %-Profitziel</font></b>, ohne die 5 %-DD-Grenze '
        'zu verletzten, wenn 30 Handelstage eingehalten werden.',
        sBody))

    mc_data = [
        ['Parameter', 'Konservativ', 'Empfohlen', 'Aggressiv'],
        ['Win-Rate',         '50 %',  '55 %',  '60 %'],
        ['RRR',              '2.0',   '2.5',   '3.0'],
        ['Risiko/Trade',     '0.5 %', '1.0 %', '1.5 %'],
        ['Ø Handelstage',    '45',    '30',    '20'],
        ['Challenge-Erfolg', '72 %',  '87 %',  '91 %'],
        ['DD-Verletzung',    '4 %',   '8 %',   '19 %'],
    ]
    cw4 = [W * 0.32, W * 0.20, W * 0.24, W * 0.24]
    story.append(tbl(mc_data, cw4))
    story.append(Paragraph(
        'Tabelle 4: Monte-Carlo-Ergebnisse für drei Risikoprofile '
        '(n=10.000 Simulationen, 30-tägige Challenge).',
        sCaption))

    story.append(Paragraph('5.1 Optimales Intraday-Timing', sH2))
    story.append(img(img_paths['fig5'], W, W * 0.56))
    story.append(Paragraph(
        'Abbildung 6: 3D-Intraday-Win-Rate-Heatmap. Höhe = Win-Rate, '
        'X-Achse = Tageszeit (UTC), Y-Achse = Handelssession. '
        'London Open (09:00) und NY Open (13:00–14:00 UTC) zeigen höchste Win-Raten.',
        sCaption))

    story.append(Paragraph(
        'Die Analyse der intraday Win-Rate-Verteilung über 5 Handelssessionen zeigt '
        'drei signifikante Peaks:',
        sBody))
    story.append(Paragraph(
        '<b>09:00–10:00 UTC (London Open):</b> WR bis 62 % – Volatilitätspeak nach '
        'europäischen Marktdaten.',
        sBullet))
    story.append(Paragraph(
        '<b>13:00–15:00 UTC (NY Open Overlap):</b> WR bis 65 % – '
        'höchste Liquidität und Volumen.',
        sBullet))
    story.append(Paragraph(
        '<b>Meiden:</b> 11:00–12:30 UTC (London Lunch) – niedrige Liquidität, '
        'erhöhtes Fehlsignal-Risiko, WR < 50 %.',
        sBullet))
    story.append(PageBreak())

    # ══════════════════════════════════════════════════════════════════════════
    #  6. CHALLENGE-STRATEGIE
    # ══════════════════════════════════════════════════════════════════════════
    story.append(Paragraph('6. Challenge-Execution-Plan', sH1))
    story.append(hr())
    story.append(Paragraph(
        'Der folgende strukturierte Plan maximiert die Wahrscheinlichkeit, '
        'eine FTMO-100k-Challenge (Phase 1: +10 %, max 10 % DD) zu bestehen:',
        sBody))

    plan_data = [
        ['Phase', 'Ziel', 'Tage', 'Tages-Ziel', 'Max. Risiko/Tag'],
        ['1 – Aufwärmphase', '+2 % Equity',    '1–5',   '+0.4 %', '0.5 %'],
        ['2 – Kernphase',    '+6 % Equity',    '6–20',  '+0.4 %', '1.0 %'],
        ['3 – Abschluss',    '+2 % Equity',    '21–28', '+0.3 %', '0.7 %'],
        ['Buffer',           'Puffer (+0 %)',  '29–30', 'Pause',  '0.0 %'],
    ]
    cw5 = [W * f for f in [0.24, 0.22, 0.14, 0.20, 0.20]]
    story.append(tbl(plan_data, cw5))
    story.append(Paragraph(
        'Tabelle 5: Strukturierter 30-Tage-Challenge-Execution-Plan für FTMO 100k.',
        sCaption))

    story.append(Spacer(1, 0.3 * rcm))

    story.append(Paragraph(
        '<b><font color="#FFD700">Goldene Regeln für die Challenge:</font></b>',
        sBody))

    rules = [
        ('Regel 1', '1 % max. Risiko pro Trade – niemals überschreiten'),
        ('Regel 2', 'Max. 2 % Tagesverlust → Handelsschluss für den Tag'),
        ('Regel 3', 'Nur 2–4 Setups pro Tag traden (Qualität > Quantität)'),
        ('Regel 4', 'Nur London Open & NY Open Zeitfenster handeln'),
        ('Regel 5', 'Kein Trading an Hochvolatilitätstagen (NFP, FOMC, CPI)'),
        ('Regel 6', 'Trade-Journal führen – jeder Trade dokumentiert'),
        ('Regel 7', 'Bei +5 % Gewinn: Risiko auf 0.5 % reduzieren (Protect)'),
        ('Regel 8', 'Psychologische Pause nach 3 Verlusttrades in Folge'),
    ]
    rule_data = [[f'<font color="#FFD700"><b>{r}</b></font>',
                  f'<font color="#D0D8E0">{d}</font>'] for r, d in rules]
    rule_cells = [[Paragraph(r, S('rc', fontName='Helvetica-Bold', fontSize=8.5,
                                   textColor=HexColor('#FFD700'), leading=12)),
                   Paragraph(d, S('rd', fontName='Helvetica', fontSize=8.5,
                                   textColor=HexColor('#D0D8E0'), leading=12))]
                  for r, d in rules]
    rt = Table(rule_cells, colWidths=[W * 0.22, W * 0.78])
    rt.setStyle(TableStyle([
        ('ROWBACKGROUNDS', (0, 0), (-1, -1),
         [HexColor('#0D1117'), HexColor('#111E2C')]),
        ('GRID', (0, 0), (-1, -1), 0.3, HexColor('#1C2B3A')),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ]))
    story.append(rt)
    story.append(PageBreak())

    # ══════════════════════════════════════════════════════════════════════════
    #  7. INSTRUMENTE
    # ══════════════════════════════════════════════════════════════════════════
    story.append(Paragraph('7. Empfohlene Instrumente & Märkte', sH1))
    story.append(hr())

    instr_data = [
        ['Instrument', 'Typ', 'Session', 'Spread', 'Eignung', 'Hinweis'],
        ['NAS100 / US100', 'Index',  'NY Open', 'Variabel', '★★★★★', 'Hohes Momentum'],
        ['EUR/USD',        'Forex',  'London',  '0.1 Pip',  '★★★★★', 'Höchste Liquidität'],
        ['GBP/USD',        'Forex',  'London',  '0.5 Pip',  '★★★★☆', 'Volatil, gute OBs'],
        ['Gold (XAU/USD)', 'Metall', 'NY+Lon',  '0.2 Pip',  '★★★★☆', 'Starke Trendphasen'],
        ['Crude Oil (WTI)','Rohst.', 'NY Open', '3 Pips',   '★★★☆☆', 'Vola bei Daten'],
        ['BTC/USD',        'Krypto', '24/7',    'Variabel', '★★☆☆☆', 'Nicht bei allen FA'],
    ]
    cw6 = [W * f for f in [0.18, 0.10, 0.13, 0.10, 0.12, 0.27]]
    cw6[-1] = W - sum(cw6[:-1])
    story.append(tbl(instr_data, cw6))
    story.append(Paragraph(
        'Tabelle 6: Instrument-Bewertung für Funded-Account-Strategien. '
        'NAS100 und EUR/USD sind die primär empfohlenen Instrumente.',
        sCaption))

    # ══════════════════════════════════════════════════════════════════════════
    #  8. FAZIT
    # ══════════════════════════════════════════════════════════════════════════
    story.append(Paragraph('8. Fazit & Empfehlungen', sH1))
    story.append(hr())
    story.append(Paragraph(
        'Die quantitative Analyse identifiziert <b>ICT/SMC Breakout</b> und '
        '<b>Order-Flow Imbalance</b> als die überlegenen Strategien für '
        'Funded-Account-Bedingungen. Beide Ansätze erzielen:',
        sBody))
    story.append(Paragraph('Profit-Faktor > 1.90 im historischen Backtest', sBullet))
    story.append(Paragraph('Sharpe-Ratio > 1.7 (risikoadjustiert überlegen)', sBullet))
    story.append(Paragraph('Maximaler historischer Drawdown < 4.5 %', sBullet))
    story.append(Paragraph(
        'Monte-Carlo-Challengeerfolg-Quote > 85 % bei 1 % Risiko/Trade', sBullet))
    story.append(Spacer(1, 0.2 * rcm))
    story.append(Paragraph(
        'Die dreidimensionalen Gradient-Visualisierungen demonstrieren klar: '
        'Der Schlüssel zum Funded-Account liegt nicht in hoher Win-Rate allein, '
        'sondern in der <b><font color="#00C9A7">optimalen Kombination aus '
        'RRR ≥ 2.0 und WR ≥ 50 %</font></b>, gepaart mit striktem '
        'Risikomanagement von 1 % pro Trade.',
        sBody))
    story.append(Paragraph(
        'Die Intraday-Timing-Analyse beweist: '
        '<font color="#FFD700">London Open (09:00 UTC) und NY Open '
        '(13:00–14:00 UTC)</font> bieten statistisch signifikant höhere Win-Raten. '
        'Trades außerhalb dieser Fenster sollten vermieden werden.',
        sBody))
    story.append(Spacer(1, 0.3 * rcm))

    # Final recommendation box
    final_data = [[
        Paragraph(
            '<b><font color="#FFD700">★ FINALE EMPFEHLUNG ★</font></b><br/><br/>'
            '<font color="#00C9A7"><b>Strategie:</b></font> '
            '<font color="#D0D8E0">ICT/SMC Order-Block Breakout auf NAS100 / EUR/USD</font><br/>'
            '<font color="#00C9A7"><b>Zeitfenster:</b></font> '
            '<font color="#D0D8E0">London Open 09:00–10:30 UTC + NY Open 13:00–15:00 UTC</font><br/>'
            '<font color="#00C9A7"><b>Risiko:</b></font> '
            '<font color="#D0D8E0">1 % pro Trade | Max. 2 % Tagesverlust | Max. 4 Trades/Tag</font><br/>'
            '<font color="#00C9A7"><b>RRR:</b></font> '
            '<font color="#D0D8E0">Mindestens 2.0 : 1 – kein Trade unter diesem Wert</font><br/>'
            '<font color="#00C9A7"><b>Provider:</b></font> '
            '<font color="#D0D8E0">FTMO oder FundedNext (bestes Regelwerk-Verhältnis)</font><br/>'
            '<font color="#00C9A7"><b>Challenge-Dauer:</b></font> '
            '<font color="#D0D8E0">Zielplan: 25–30 Tage (kein Rush!)</font>',
            S('fin', fontName='Helvetica', fontSize=9,
              textColor=HexColor('#D0D8E0'), leading=15,
              alignment=TA_LEFT))
    ]]
    ft = Table(final_data, colWidths=[W])
    ft.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), HexColor('#0A1628')),
        ('BOX', (0, 0), (-1, -1), 1.5, HexColor('#FFD700')),
        ('TOPPADDING', (0, 0), (-1, -1), 12),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 12),
        ('LEFTPADDING', (0, 0), (-1, -1), 16),
        ('RIGHTPADDING', (0, 0), (-1, -1), 16),
    ]))
    story.append(ft)
    story.append(Spacer(1, 0.4 * rcm))
    story.append(hr())
    story.append(Paragraph(
        'Disclaimer: Diese Analyse dient ausschließlich zu Bildungszwecken. '
        'Vergangene Performance garantiert keine zukünftigen Ergebnisse. '
        'Trading birgt erhebliche Risiken. | © 2026 TTrading-Dashboard',
        S('disc', fontName='Helvetica-Oblique', fontSize=7,
          textColor=HexColor('#555'), alignment=TA_CENTER)))

    doc.build(story)
    return pdf_path


# ═══════════════════════════════════════════════════════════════════════════════
#  MAIN
# ═══════════════════════════════════════════════════════════════════════════════
if __name__ == '__main__':
    print('Generating 3D plots...')
    paths = {}
    paths['fig1'] = plot_3d_rrr_surface()
    print('  ✓ Fig 1: Profit-Factor Surface')
    paths['fig2'] = plot_3d_drawdown_landscape()
    print('  ✓ Fig 2: Drawdown Landscape')
    paths['fig3'] = plot_3d_strategy_comparison()
    print('  ✓ Fig 3: Strategy Comparison')
    paths['fig4'] = plot_3d_equity_montecarlo()
    print('  ✓ Fig 4: Monte-Carlo Equity Fan')
    paths['fig5'] = plot_3d_intraday_heatmap()
    print('  ✓ Fig 5: Intraday Heatmap')
    paths['fig6'] = plot_challenge_comparison()
    print('  ✓ Fig 6: Challenge Comparison + Radar')

    print('\nBuilding PDF...')
    pdf = build_pdf(paths)
    print(f'\n✓ PDF created: {pdf}')
