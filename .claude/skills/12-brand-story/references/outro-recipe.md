# The Product + Logo Outro (zero extra Higgsfield credits)

A wordless brand-story film (see [narrative-craft.md](narrative-craft.md)) intentionally
never shows a legible product or brand name mid-story — that is correct craft, the
product resolves the story's tension at the very end. But "the product resolves the
story" as a *narrative beat inside the last generated clip* is not the same as "the
viewer can clearly identify what to buy and from whom." Relying on the video model to
render crisp, on-brand packaging text and a correct logo inside a generated shot is
unreliable — text and fine logo detail are exactly what these models render least
consistently. Fix this in post, not in the prompt.

**The pattern: two fixed beats appended after the story, built entirely with ffmpeg —
no additional generation, no additional credits.**

1. **Product insert (~2s)** — a real product photo (not generated) with a slow Ken Burns
   zoom and a fade-in. This is the only place the actual packaging/label needs to be
   legible, and a real photo is always legible.
2. **Logo card (~2s)** — a solid brand-colored card with the brand's full logo **lockup**
   (icon + wordmark together, or wordmark alone) fading in.

Total addition: ~4 seconds. Cost: $0 / 0 credits — this never touches `generate_video`.

---

## Sourcing the right logo asset (this is where it usually goes wrong)

An icon-only mark (e.g. just an animal silhouette, just a monogram) floating alone on a
card reads as generic and unbranded — a viewer who doesn't already know the brand can't
tell what it is. Before building the card:

1. Fetch the brand's actual site and look for **every** logo variant: header logo,
   footer logo, and — critically — search for a **wordmark-only** file (brands routinely
   ship `wordmark.png` / `logotype.png` separate from their `icon.png` / `logomark.png`
   for exactly this compositing purpose).
2. If only an icon exists with no combined lockup, **build the lockup yourself**: stack
   icon above wordmark with `vstack`, transparent-padded to equal width:
   ```bash
   ffmpeg -y -i icon.png -i wordmark.png -filter_complex \
     "[0:v]scale=280:-1[icon];[1:v]scale=560:-1[word]; \
      [icon]pad=560:ih:(ow-iw)/2:0:color=0x00000000[icon2]; \
      [icon2][word]vstack=inputs=2[out]" \
     -map "[out]" -frames:v 1 lockup.png
   ```
   (Always add `-map "[out]"` explicitly on a filter_complex still-image export — without
   it ffmpeg silently fails with "unconnected output.")
3. Never use icon-only as the sole outro asset if a wordmark exists. The lockup is what
   actually reads as "this is the brand."

---

## Building the outro (concat demuxer — not xfade)

**Do not** try to crossfade the main video directly into a `-loop 1` image input with
`xfade`. In practice this repeatedly produced timebase mismatches
(`First input link main timebase ... do not match ...`) and, once those were patched with
`format=yuv420p,fps=24`, produced a runaway/hung encode (a multi-minute render for a
20-second output) — almost certainly the unbounded looped-image input fighting the
`xfade`/`apad` duration math. The reliable fix: **render each outro beat as its own
fixed-duration file first** (bounded by an explicit `-t`), then join everything with the
plain concat demuxer — the same reliable method already used for multi-scene stitching.

**1. Render the product insert** (Ken Burns zoom + fade-in, silent audio track so it
concats cleanly with the story clip's audio):

```bash
ffmpeg -y -loop 1 -t 2 -i product_photo.jpg \
  -f lavfi -t 2 -i anullsrc=channel_layout=stereo:sample_rate=44100 \
  -filter_complex "[0:v]scale=2400:-1,zoompan=z='min(zoom+0.0015,1.08)':d=48:s=1920x1080:fps=24,fade=t=in:st=0:d=0.5,format=yuv420p[v]" \
  -map "[v]" -map 1:a -c:v libx264 -preset fast -crf 18 -c:a aac -shortest product_insert.mp4
```

**2. Render the logo card** (solid brand-color background, logo centered, fade-in):

```bash
ffmpeg -y -t 2 -f lavfi -i color=c=0x1c1310:s=1920x1080:r=24 \
  -t 2 -f lavfi -i anullsrc=channel_layout=stereo:sample_rate=44100 \
  -loop 1 -t 2 -i lockup.png \
  -filter_complex "[2:v]scale=480:-1[logo];[0:v][logo]overlay=(W-w)/2:(H-h)/2:format=auto,fade=t=in:st=0:d=0.7,format=yuv420p[v]" \
  -map "[v]" -map 1:a -c:v libx264 -preset fast -crf 18 -c:a aac -shortest logo_card.mp4
```

Pick the card background from the brand's own palette: a **dark** card for a light/cream
logo, a **light/neutral** card for a dark-colored logo — check which logo color variant
you downloaded and match it, don't guess.

**3. Normalize the main story video** to the same fps/pixel format before concatenating
(cheap insurance against subtle concat artifacts even when specs look identical):

```bash
ffmpeg -y -i story.mp4 -c:v libx264 -preset fast -crf 18 -vf "fps=24,format=yuv420p" -c:a aac -ar 44100 -ac 2 story-norm.mp4
```

**4. Concat all three** with the concat demuxer:

```bash
printf "file 'story-norm.mp4'\nfile 'product_insert.mp4'\nfile 'logo_card.mp4'\n" > outro_list.txt
ffmpeg -y -f concat -safe 0 -i outro_list.txt -c:v libx264 -preset slow -crf 18 -c:a aac -b:a 192k final.mp4
```

**5. QA before delivering**: extract a frame from inside the product-insert window and
one from inside the logo-card window (`ffmpeg -ss <t> -i final.mp4 -frames:v 1 check.jpg`)
and look at both — confirm the product label is actually legible and the logo lockup is
centered and not clipped, rather than assuming the filter graph did what the command
implies.

---

## When to skip this

If the brand-story video's own final generated shot already contains a clean, legible,
on-brand product reveal (verify by inspecting the actual frame, not by assuming), the
product-insert beat is redundant — go straight to the logo card. Never skip the logo
card: "the product resolves the story" is a narrative beat for the viewer's emotions,
not a substitute for telling them whose product it was.
