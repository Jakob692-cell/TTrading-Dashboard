# Prop Firm Training Platform — Research Deliverables

Adversarial due-diligence research on the "Challenge Ready" concept: a platform where aspiring
prop firm traders train, under real prop firm rules, before buying expensive evaluations.

**Bottom line: PASS on a $10M investment. Conditional yes on ~$500k, with the scope changed
from B2C training simulator to a B2B2C readiness credential. Weighted score 4.1/10 as specified,
6.3/10 under the recommended reframe.**

## Files

| File | Contents |
|---|---|
| [`PROP_FIRM_TRAINING_RESEARCH_REPORT.md`](PROP_FIRM_TRAINING_RESEARCH_REPORT.md) | **The main report** — all 17 parts, ~24,000 words |
| [`APPENDIX_A_300_CONTENT_IDEAS.md`](APPENDIX_A_300_CONTENT_IDEAS.md) | 300 content ideas across 8 platforms with hook, script, visual, CTA, view estimate, difficulty |
| [`APPENDIX_B_300_KEYWORDS.md`](APPENDIX_B_300_KEYWORDS.md) | 300 keywords in 10 clusters with volume, difficulty, intent, content target, and a priority matrix |
| [`generate_charts.py`](generate_charts.py) | Reproduces all 7 figures |
| [`charts/`](charts/) | Generated figures (PNG) |

## Report structure

| Part | Topic |
|---|---|
| 0 | Executive summary, scorecard, and the 5 validation questions (~$15k, 30 days) |
| 1 | Market research — TAM $45–150M, SAM $12.7M, SOM $2.6M by Y3 |
| 2 | Problem validation — 8 pain categories and the demand paradox |
| 3 | Competitor analysis — 9 competitive rings, scored |
| 4 | Gap analysis — 14 gaps sorted into unclaimed / failed / structurally hard |
| 5 | Product design — V1/V2/V3 and what to never build |
| 6 | AI opportunities — the 3 defensible systems |
| 7 | Gamification — with the ethical line drawn explicitly |
| 8 | Virality — realistic viral coefficient K ≈ 0.085 |
| 9 | Content strategy (300 ideas in Appendix A) |
| 10 | SEO strategy (300 keywords in Appendix B) |
| 11 | Monetization — 10 models scored, and the affiliate conflict |
| 12 | Technical architecture — including the market-data licensing trap |
| 13 | UX/UI — 14 screens specified |
| 14 | Launch strategy — 100 → 1k → 10k → 100k users, no paid ads |
| 15 | Financial model — 3-year forecast and break-even |
| 16 | Risks — 20 risks with severity × probability |
| 17 | Final verdict — scores, reasoning, and what would change the conclusion |

## Source discipline

Every externally sourced figure is hyperlinked in place. Modeled figures are labeled
**[ESTIMATE]** with their derivation shown. Three limitations are stated up front in §0.6:

1. Much of the prop-firm "statistics" web is affiliate-funded content marketing; the report
   prefers primary disclosures (Topstep's published Combine statistics, FTMO's filed financials
   via Finance Magnates, CME fee schedules, CFTC/SEC/ESMA statements) and flags aggregator-only claims.
2. Reddit and Discord member counts could not be verified programmatically (Reddit removed public
   subscriber counts in Sept 2025 and gates its JSON endpoints); those figures are ranges with
   derivations shown.
3. Screenshots could not be captured in this environment; deep links plus transcribed page
   contents are used instead.

## Reproducing the charts

```bash
pip install matplotlib numpy
python3 generate_charts.py
```
