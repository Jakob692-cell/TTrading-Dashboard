# UGC Ad Storyboard Structure

UGC ads work because they read as unscripted. Paradoxically, that means the script and
timing must be MORE precise than a polished studio ad, not less — every beat has to land
inside a narrow window or the "authentic" illusion breaks.

## The 5-beat structure (universal across UGC/Tutorial/Unboxing/Review)

| Beat | Purpose | Typical share of runtime |
|---|---|---|
| 1. Hook | Stop the scroll in the first 1–2s | 10–15% |
| 2. Problem / Agitation | Relatable pain point, said plainly | 20–25% |
| 3. Product Reveal + Demo | Show it, use it, close-up on the product doing its thing | 30–35% |
| 4. Proof / Reaction | Genuine-sounding result, reaction, or before/after | 15–20% |
| 5. CTA | Direct address, tell them exactly what to do | 10–15% |

## 15-second timing table (most common short-form length)

| Time | Beat | Avatar does/says | Camera |
|---|---|---|---|
| 0:00–0:02 | Hook | Spoken hook line, direct eye contact, mid-sentence energy (starts like you caught the middle of a thought) | Handheld selfie framing, slightly too close, natural room light |
| 0:02–0:05 | Problem | States the relatable frustration in plain, unscripted-sounding language | Same framing, minor natural movement |
| 0:05–0:10 | Reveal + Demo | Picks up/shows the product, demonstrates the one core action | Cut or whip-pan to product in hand, close-up on the product detail |
| 0:10–0:13 | Proof | Reaction shot — surprise, relief, satisfaction; states the result in one sentence | Back to face, slightly closer, genuine expression |
| 0:13–0:15 | CTA | Direct address: what to do, urgency or offer | Steady on face, text overlay with offer/link cue |

## 30-second timing table (Tutorial / Unboxing / longer Product Review)

| Time | Beat |
|---|---|
| 0:00–0:03 | Hook |
| 0:03–0:09 | Problem / context (why this matters to the viewer) |
| 0:09–0:20 | Extended demo — multiple steps or angles, this is where Tutorial/Unboxing differ from 15s UGC by actually showing process |
| 0:20–0:26 | Proof / result |
| 0:26–0:30 | CTA |

## Authenticity rules (what separates UGC from a studio ad)

1. **Imperfect framing.** Slightly off-center, a bit too close, occasional micro-shake.
   Never a locked, centered, professionally lit frame.
2. **Natural speech, not ad copy.** No "Introducing the revolutionary new—". Write how
   a person actually talks: contractions, filler-adjacent phrasing, mid-thought starts.
3. **One location, real-feeling.** Bedroom, bathroom, car, kitchen counter — not a
   studio backdrop. The `setting_id` preset should match a place a real customer would
   actually be.
4. **Product handled, not displayed.** The avatar picks it up, uses it clumsily-but-
   genuinely, doesn't present it like a game show host.
5. **Reaction before explanation.** Real reviewers react first, explain second — flip
   this and it reads as scripted.
6. **Text overlays are captions, not headlines.** Auto-caption style (like the avatar's
   own speech captioned), not marketing typography.

## Blank template — fill in per project before writing the final prompt

```
PRODUCT / NICHE:
PLATFORM (drives aspect ratio):        [ ] TikTok/Reels/Shorts (9:16)   [ ] YouTube (16:9)
MODE:            [ ] UGC   [ ] Tutorial   [ ] Unboxing   [ ] Product Review   [ ] UGC Virtual Try On
AVATAR PERSONA:  (age range, vibe, energy — e.g. "mid-20s, casual, slightly sarcastic")
SETTING:         (must match a real show_marketing_studio setting_id)
DURATION:        (15s default, 30s if Tutorial/Unboxing needs more demo time)

BEAT 1 — HOOK (0:00–__):
  Spoken line: "..."
  Framing: ...

BEAT 2 — PROBLEM (__–__):
  Spoken line: "..."
  Framing: ...

BEAT 3 — REVEAL + DEMO (__–__):
  Spoken line: "..."
  Action: ...
  Framing: ...

BEAT 4 — PROOF (__–__):
  Spoken line: "..."
  Framing: ...

BEAT 5 — CTA (__–__):
  Spoken line: "..."
  Text overlay: ...
```
