---
name: higgsfield-ugc-ad
description: >-
  Crafts avatar-driven UGC (user-generated-content style) testimonial and
  talking-head ad videos for Higgsfield, using the native marketing_studio_video
  UGC/Tutorial/Unboxing/Product-Review presets (avatar + hook + setting).
  Always storyboards the full beat-by-beat sequence in writing BEFORE any
  generation call. Use when the user wants UGC content, creator-style ads,
  talking-head testimonials, "make it look like a real person recommending
  this," faux-organic social ads, or authentic-feeling product content.
when_to_use: >-
  Use for: UGC video, UGC ad, creator content, testimonial video, talking-head
  ad, "looks like a normal person filmed this," influencer-style video, POV
  review, unboxing with a person, tutorial with a presenter, faux-organic
  social ad, native ad, or any request for content that should NOT look like
  a polished studio ad. Distinct from 07-ecommerce-ad (product-only, no
  avatar) and 11-social-hook (viral hook, not necessarily UGC/testimonial
  style) — use this skill whenever a speaking avatar/creator is the point.
allowed-tools: >-
  mcp__higgsfield__generate_video
  mcp__higgsfield__generate_image
  mcp__higgsfield__models_explore
  mcp__higgsfield__show_marketing_studio
  mcp__higgsfield__show_characters
  mcp__higgsfield__job_status
  mcp__higgsfield__job_display
  mcp__higgsfield__media_upload
  mcp__higgsfield__media_confirm
  mcp__higgsfield__balance
  mcp__higgsfield__show_plans_and_credits
---

# Higgsfield UGC Ad Skill

## Gap this skill fills

None of the other 14 downloaded Higgsfield skills (`01`–`15`) document the platform's
**native UGC mechanism**. `07-ecommerce-ad` and `11-social-hook` cover generic product
ads and viral hooks, but UGC is a distinct format: a specific avatar/creator speaks
directly to camera in a deliberately imperfect, phone-shot style. Higgsfield supports
this natively via `marketing_studio_video` with `hook_id` + `setting_id` presets scoped
to exactly five modes: **UGC, Tutorial, Unboxing, Product Review, UGC Virtual Try On**.
This skill exists to use that mechanism correctly and to enforce a storyboard-first
workflow, since a talking-head ad lives or dies on its beat timing.

---

## Model routing

**Primary and only real option: `marketing_studio_video`.** No other model in the
catalog supports the `avatar_ids` + `hook_id`/`setting_id` UGC preset system — there is
no meaningful fallback for true avatar-driven UGC. If `marketing_studio_video` is
unavailable, tell the user UGC generation is blocked rather than silently substituting
a generic model that will produce a studio-ad look instead of a UGC look.

### UGC-specific parameters

| Parameter | Notes |
|---|---|
| `avatar_ids` | Array of UUID strings, **max 1** for a single-creator UGC video. Get available preset avatars via `higgsfield:show_characters`, or the user's own custom avatar if one exists. |
| `product_ids` | Array of UUID strings identifying the product being reviewed/shown. |
| `hook_id` | The **what** — the attention-grabbing opening mechanic. List options via `higgsfield:show_marketing_studio(action='list', type='hook')`. |
| `setting_id` | The **where** — location/vibe (e.g. "messy bedroom," "car," "bathroom mirror"). List via `higgsfield:show_marketing_studio(action='list', type='setting')`. |
| `mode` | Must be one of the five UGC-eligible presets: `UGC`, `Tutorial`, `Unboxing`, `Product Review`, `UGC Virtual Try On`. Hooks/settings only apply to these five — do not attempt them on other marketing_studio_video modes. |
| `ad_reference_id` | Alternative to hook/setting: recreates the scenario of an existing reference ad (use when the user says "make one like this video"). **Mutually exclusive** with `hook_id`/`setting_id` — pick one approach. |
| `generate_audio` | Set `true` — UGC without spoken audio is not UGC. This is the one skill in this collection where audio is not optional. |
| `resolution` | `480p`, `720p`, `1080p` |
| `aspect_ratio` | `9:16` for TikTok/Reels/Shorts (the default UGC platform); `16:9` only for YouTube pre-roll/in-feed UGC-style ads — confirm which with the user, never assume. |
| `duration` | 4–15 s continuous range |

**Before generating:** call `higgsfield:models_explore('marketing_studio_video')` to
re-verify these are still current — UGC preset mechanics are more likely to change than
basic video params.

---

## Storyboard-first workflow (mandatory, no exceptions)

UGC ads are judged entirely on pacing and authenticity — a talking-head video with the
wrong beat timing reads as fake immediately. Never call `generate_video` for this skill
without first writing out the storyboard and getting it approved.

1. **Gather intent** — product/niche, target platform (determines aspect ratio),
   creator persona (age/vibe/energy), desired mode (UGC / Tutorial / Unboxing /
   Product Review / Virtual Try On), duration.
2. **Pick hook + setting** — call `show_marketing_studio` to list real options; don't
   invent hook/setting names.
3. **Write the full beat-by-beat storyboard as a table** (timestamp, beat, what the
   avatar says/does, camera framing) using the structure in
   [references/storyboard.md](references/storyboard.md). This is the deliverable the
   user reviews — words matter more than visuals here, since the avatar is speaking.
4. **Present the storyboard for explicit approval** before touching `generate_video`.
   Treat storyboard revision requests as free — only the final `generate_video` call
   spends credits.
5. Only after approval: surface cost (`get_cost`), confirm balance, then generate.

---

## Reference materials

| File | Contents |
|---|---|
| [references/storyboard.md](references/storyboard.md) | The canonical UGC beat structure (hook → problem → reveal → proof → CTA) with timing tables for 15s/30s, authenticity rules (phone-shot framing, imperfect lighting, natural speech pauses), and a blank template to fill in per project |
| [references/hooks.md](references/hooks.md) | UGC-specific spoken hook patterns (distinct from the visual hooks in `07-ecommerce-ad`/`11-social-hook` — these are things the avatar SAYS in the first 2 seconds) |
| [references/model-specs.md](references/model-specs.md) | Full `marketing_studio_video` UGC parameter reference, mode constraints, and the `show_marketing_studio`/`show_characters` discovery calls |
| [references/examples.md](references/examples.md) | Two fully worked storyboards: a 15s/9:16 TikTok UGC ad and a 15s/16:9 YouTube-style UGC ad, both with hook/setting/avatar placeholders ready to swap for a real client |
