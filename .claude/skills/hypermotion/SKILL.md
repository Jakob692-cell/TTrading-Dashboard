---
name: hypermotion
description: Generate a Higgsfield Marketing Studio "Hyper Motion" product video (high-energy product motion bursts). Use when the user asks for a Hyper Motion video/ad, a high-energy product motion clip, or references the Marketing Studio Hyper Motion preset. Always research the brand/product before generating.
---

# Hyper Motion (Higgsfield Marketing Studio)

Scope: this skill only covers the **Hyper Motion** preset (`hypermotion_oj`, mode "Hyper Motion" —
"High-energy product motion bursts") in Higgsfield's Marketing Studio. Do not branch into other
Marketing Studio presets (UGC, Unboxing, TV Spot, etc.) unless the user explicitly asks for them.

## INTERNET RESEARCH FIRST

Never start generating a motion concept immediately. Always begin with research.

Research:
- Official website
- Product page
- Brand story
- Existing advertisements
- Social media
- Existing product photos
- Existing product videos
- Competitor product presentation

Then build the creative direction. Every creative decision must be justified using publicly
observable information. Never generate generic commercials.

Use WebSearch/WebFetch to gather this before touching any Higgsfield tool. Summarize findings
(brand tone, visual language, product highlights, what competitors already do) and use them to
justify the specific motion beats, camera moves, and pacing you choose for the Hyper Motion clip —
don't default to a generic "product spins, energy burst" template without tying it back to what
was actually found.

## Workflow

1. **Research** (see above). If the user hasn't given a website/product URL or social handles,
   ask for them or search for the brand by name first.
2. **Get the product into Marketing Studio**: `show_marketing_studio` with `action='fetch'` and
   the product URL (or `action='create'` from uploaded product media) to get a `product`/
   `webproduct` entity.
3. **Generate with the Hyper Motion preset**: call `generate_video` using the Marketing Studio
   video flow, passing `mode` (or the `next_step` returned by `show_marketing_studio`) set to the
   `hypermotion_oj` preset, with `medias` referencing the fetched/created product.
4. Present the result with a short note on which research findings justified the creative choices
   (product highlight chosen, pacing/energy level, any brand-specific visual cues used).
