# Challenge Ready — V1

A prop firm challenge simulator. Practise under a real firm's rule set, breach the way you
would breach for real, and get told the specific behaviour that did it.

Built to the V1 spec in [`../research/PROP_FIRM_TRAINING_RESEARCH_REPORT.md`](../research/PROP_FIRM_TRAINING_RESEARCH_REPORT.md)
(Part 5), including the two strategic hedges that cost nothing to build in from the start:
the **Readiness Score** and the **guardrails**.

```bash
cd app
npm test                      # 63 unit tests, no dependencies
python3 -m http.server 5173   # then open http://localhost:5173
```

No build step, no framework, no runtime dependencies. Playwright is a dev-only dependency
for the browser smoke test.

---

## What is actually built

| Report spec (Part 5.2) | Status |
|---|---|
| Challenge engine: target, daily loss, max loss, min days, time limit, position size, consistency, news | **Done** |
| All four drawdown methodologies (static, trailing intraday, trailing EOD, trailing→lock) | **Done** |
| Replay trading surface: candles, market/limit/stop orders, brackets, 1/5/15m, speed 1–100× | **Done** |
| Live rule HUD with amber/red proximity states | **Done** |
| Breach autopsy with timestamped narrative | **Done** |
| Failure-mode taxonomy + drill prescription | **Done** — 10 modes, 12 drills |
| Readiness Score v0 with exposed components | **Done** |
| Shareable card | **Done** — canvas → PNG |
| Streaks, XP, levels | **Done** — 12 levels |
| Guardrails ("Ulysses contract") | **Done** — enforced in the engine, not the UI |
| 6 firm rule sets | **Done** |
| Onboarding diagnostic flow | Partial — setup → run → autopsy exists; the 5-question intake does not |
| Email lifecycle, Stripe billing, accounts | **Not built** — needs a backend |

---

## Architecture

```
src/
  engine/
    rulesets.js   6 firm presets, versioned, each citing its source URL and check date
    account.js    the rule engine — deterministic, event-sourced, pure
    classify.js   failure-mode classification (F1–F10) + the autopsy narrative
    score.js      readiness score, grades, and the "don't buy yet" recommendation
    training.js   guardrails, 12 drills, XP and levels
  data/
    market.js     deterministic synthetic price generator + resampling
  ui/
    app.js        views: setup, trade, autopsy, dashboard
    chart.js      canvas candlestick renderer with rule lines drawn in price space
    share.js      share-card renderer
test/
  engine.test.js  63 golden tests
  smoke.mjs       browser smoke test, screenshots every screen
```

### Four contracts the engine holds, and why

1. **Deterministic.** Same ruleset + same bars + same orders → identical result, forever.
   No `Date.now()`, no `Math.random()` in the engine. This is what makes ranked seasons
   possible and disputes resolvable.
2. **Event sourced.** Every state change appends to `timeline`. The autopsy, the classifier
   and any future evidence export all read the log, never a mutated summary.
3. **Pure.** Actions return new state. There is a test asserting the original object is
   untouched.
4. **No lookahead.** Within a bar, resting orders fill against the bar's range and — when a
   bar spans both a stop and a target — **the stop is assumed to fill first.** That is the
   pessimistic choice. The alternative flatters the trader and corrupts the score.

---

## Three decisions worth defending

### Synthetic market data, deliberately

V1 ships a seeded generator, not real exchange data. Three reasons, in order of importance:

- **Legal.** Serving exchange-derived data to end users is redistribution, and it requires a
  distribution licence — CME charges per-subscriber and differentiates professional from
  non-professional; the cheap vendor tiers explicitly exclude external distribution. On
  synthetic data there is no licensing exposure while the product is being validated.
- **Integrity.** Ranked seasons need every entrant to face an identical sequence. A seeded
  generator gives that for free and cannot leak.
- **Honesty.** Every session is labelled SYNTHETIC in the UI and on the share card.

`data/market.js` is the seam. Swapping in a licensed historical feed means implementing
`loadSession()` with the same shape; nothing above that file changes.

The generator is not a plain random walk — traders spot those instantly. It models an
intraday volatility smile, persistent trend/chop regime switching, overnight gaps, and
scheduled high-impact events that drive the news rule.

### XP for process, never for profit

A bigger winner earns exactly the same XP as a small one — there is a test asserting it.
Rewarding P&L in a gamified trading product trains gambling. XP comes from completing runs,
avoiding breaches, honouring stops, taking cooldowns, and having your own guardrails hold.

### The product tells you not to buy

Below a score of 40, the recommendation is *"Do not buy a challenge yet."* And a high score
off fewer than three runs never returns a ready verdict, because a score off one run is noise.
Both are enforced in `score.js` and covered by tests. This is the differentiator no
affiliate-funded competitor can copy without cutting its own revenue.

---

## Honesty constraints in code

These are load-bearing, not decoration. Regulators have taken action against firms for
presenting simulated trading as live, and a share card travels without its context.

- `SIMULATED` badge on the shell, the autopsy header, and every share card
- The share card distinguishes **passed / failed / ended early** — a profitable run that
  simply ran out of data is never labelled a failure
- `score.js` carries an explicit honesty contract in its header comment, and `calibration`
  stays `null` until real outcome-labelled data exists
- The disclosure string never claims a real-world pass probability — there is a test asserting
  the phrase cannot appear
- Rule sets cite `sourceUrl` and `verifiedOn`, and the setup screen links out to verify

## Testing

```bash
npm test                        # 63 unit tests
python3 -m http.server 5173 &
node test/smoke.mjs             # browser flow + screenshots into ./screenshots
```

The golden tests are a product asset, not just hygiene. The research concluded rule
**fidelity** is the one thing in this category a weekend clone cannot fake, so the suite is
written to be read: each drawdown methodology has a named test showing exactly how the floor
moves, including the give-back case where intraday trailing kills an account whose balance
never lost money.

## Known gaps

- No backend: no accounts, billing, email, or cross-device sync. Profile lives in `localStorage`.
- No real market data (see above).
- Drill *targets* are defined but completion is not yet auto-verified — loading a drill
  applies its guardrails, but finishing it is not scored.
- The onboarding diagnostic is the run itself; the 5-question intake from Part 5.6 is missing.
- Mobile is unstyled below ~860px on the trading screen. The report recommends never building
  mobile trading; a mobile companion for review and drills is the V2 shape.
- Leaderboards, seasons, duels, broker connection, Tilt Guard on live accounts: all V2+.
