# Worked UGC Storyboard Examples

Both examples use placeholder product/avatar details — swap in real
`show_characters`/`show_marketing_studio` IDs before generating. These exist to prove
the format works and to give a copy-paste starting structure for a real client.

---

## Example 1: 15s / 9:16 — TikTok UGC ad (skincare, generic)

```
PRODUCT / NICHE: overnight face serum
PLATFORM: TikTok/Reels/Shorts → 9:16
MODE: UGC
AVATAR PERSONA: mid-20s, casual, bathroom-mirror energy, slightly deadpan
SETTING: bathroom, morning light, messy counter (realistic, not staged)
DURATION: 15s
HOOK PATTERN: Confession
```

| Time | Beat | Spoken line | Framing |
|---|---|---|---|
| 0:00–0:02 | Hook | "—okay I was today years old when I found out why my skin's been doing this." | Handheld selfie, slightly too close, bathroom mirror reflection visible |
| 0:02–0:05 | Problem | "I've tried like six different serums and nothing touched the dry patches around here." (gestures to cheek) | Same framing, natural head turn |
| 0:05–0:10 | Reveal + Demo | "This one's different though — you literally just do like two pumps before bed." (picks up bottle, dispenses onto fingertip, close-up) | Whip to product close-up on "two pumps," back to face for application |
| 0:10–0:13 | Proof | "Woke up and my skin actually looked... normal? Like not tight, not flaky." (touches cheek, genuine surprise) | Close on face, natural lighting shift to "next morning" cue via caption |
| 0:13–0:15 | CTA | "It's linked below if your skin does this too." (points down/off-frame) | Steady on face, caption-style text overlay with offer cue |

**generate_video params:**
```json
{
  "model": "marketing_studio_video",
  "mode": "UGC",
  "aspect_ratio": "9:16",
  "duration": 15,
  "generate_audio": true,
  "hook_id": "<from show_marketing_studio type=hook, Confession-style>",
  "setting_id": "<from show_marketing_studio type=setting, bathroom/messy-counter>",
  "avatar_ids": ["<from show_characters>"],
  "product_ids": ["<client's product id>"]
}
```

---

## Example 2: 15s / 16:9 — YouTube-style UGC ad (kitchen gadget, generic)

```
PRODUCT / NICHE: countertop vegetable chopper
PLATFORM: YouTube in-feed/pre-roll → 16:9
MODE: Product Review
AVATAR PERSONA: late-20s/30s, kitchen-counter energy, mildly skeptical-turned-convinced
SETTING: home kitchen, daytime, cluttered counter (real, not styled)
DURATION: 15s
HOOK PATTERN: Skepticism flip
```

| Time | Beat | Spoken line | Framing |
|---|---|---|---|
| 0:00–0:02 | Hook | "I did NOT think this was gonna save me any time, ngl." | Landscape framing, phone propped on counter, kitchen visible behind |
| 0:02–0:05 | Problem | "I was chopping like three onions by hand every single night for dinner prep." | Same framing, gestures with knife (not using it, just holding) |
| 0:05–0:10 | Reveal + Demo | "Then my sister sent me this — you just load it and pull, that's it." (loads chopper, pulls handle, veggies fall diced) | Cut to close-up on the chopper action, then back to face |
| 0:10–0:13 | Proof | "That took like four seconds. FOUR seconds." (holds up diced result to camera) | Close on the diced product in a bowl, held toward lens |
| 0:13–0:15 | CTA | "Yeah I'm never going back, it's in the description." | Back to face, steady, text overlay with link cue |

**generate_video params:**
```json
{
  "model": "marketing_studio_video",
  "mode": "Product Review",
  "aspect_ratio": "16:9",
  "duration": 15,
  "generate_audio": true,
  "hook_id": "<from show_marketing_studio type=hook, Skepticism-flip-style>",
  "setting_id": "<from show_marketing_studio type=setting, home-kitchen>",
  "avatar_ids": ["<from show_characters>"],
  "product_ids": ["<client's product id>"]
}
```

---

## How to adapt these for a real client

1. Run `show_characters` and `show_marketing_studio` to replace every placeholder ID.
2. Rewrite every spoken line in the client's actual product's voice — these are
   templates for BEAT TIMING, not copy to reuse verbatim.
3. Present the filled-in storyboard table to the user for approval before calling
   `generate_video` — per the skill's storyboard-first rule.
4. Only after approval: `get_cost` → confirm balance → generate.
