# The Centered-Logo Watermark (zero extra Higgsfield credits)

A wordless brand-story film (see [narrative-craft.md](narrative-craft.md)) intentionally
never shows a legible product or brand name mid-story — that is correct craft, the
product resolves the story's tension at the very end. But relying on the video model to
render a crisp, on-brand, legible logo inside a generated shot is unreliable — text and
fine logo detail are exactly what these models render least consistently. Fix this in
post, not in the prompt, and keep the fix minimal.

**The pattern: fade the brand's logo in, CENTERED in frame, over the final ~2–3 seconds
of the existing footage, with zero change to the video's length or content.** Client
feedback across iterations: a small top-corner watermark read as too subtle/incidental
("like a TV bug"); a centered fade-in reads as the deliberate closing brand statement
and is the default to reach for. Built entirely with ffmpeg's `overlay` + `fade` filters.
No additional `generate_video` call, no additional credits.

## What NOT to do (tried and rejected)

A first attempt appended two extra beats after the story — a real-photo product insert
followed by a separate full-screen logo card — joined via the concat demuxer. This was
**explicitly rejected by the client as "wrong"**: it reads as separate static images
bolted onto the end of a video, not as part of the film. Do not extend the video's
duration or insert non-video-content frames. The fix belongs *inside* the existing
runtime, as a subtle overlay — not appended after it.

---

## Sourcing the right logo asset

An icon-only mark (just an animal silhouette, just a monogram) is fine for a small
corner watermark **if paired with the wordmark** — an icon alone at watermark size is
usually too ambiguous to read. Prefer a combined icon+wordmark lockup:

1. Fetch the brand's site and look for a header/footer logo. If icon and wordmark exist
   as separate files, composite them into one lockup first:
   ```bash
   ffmpeg -y -i icon.png -i wordmark.png -filter_complex \
     "[0:v]scale=280:-1[icon];[1:v]scale=560:-1[word]; \
      [icon]pad=560:ih:(ow-iw)/2:0:color=0x00000000[icon2]; \
      [icon2][word]vstack=inputs=2[out]" \
     -map "[out]" -frames:v 1 lockup.png
   ```
   (Always add `-map "[out]"` explicitly on a filter_complex still-image export — without
   it ffmpeg silently fails with "unconnected output.")
2. Check the logo's own color (light-on-transparent vs dark-on-transparent) against
   where in the frame it will sit — a light logo needs a naturally darker corner of the
   footage to read clearly, and vice versa. If the story's final seconds don't have a
   suitable corner, this is a reason to reconsider which corner/timing to use, not a
   reason to add a background plate behind the logo (that starts sliding back toward the
   rejected "card" look).

---

## Building the watermark overlay (with the dim-down, confirmed final pattern)

Determine the source video's exact duration first (`ffprobe -v error -show_entries
format=duration -of csv=p=0 video.mp4`). The confirmed final recipe has two things
happening together over the last ~2.5s: the **whole frame dims slightly** (a uniform
semi-transparent black wash, not a full fade to black) and the **logo fades in** on top
of that dimmed frame. The dim is what gives the logo authority — a logo faded in over
full-brightness, busy footage competes with the scene; a logo faded in as the frame
quietly darkens reads as the intentional closing beat.

```bash
D=16.275692                       # exact duration from ffprobe
START=$(echo "$D - 2.5" | bc)     # both the dim and the logo start fading in here

ffmpeg -y -i video.mp4 -f lavfi -t ${D} -i color=c=black:s=1920x1080:r=24 \
  -loop 1 -i lockup.png -filter_complex \
  "[1:v]format=rgba,colorchannelmixer=aa=0.5,fade=t=in:st=${START}:d=1:alpha=1[dim]; \
   [0:v][dim]overlay=0:0:shortest=1[bg]; \
   [2:v]scale=420:-1,format=rgba,fade=t=in:st=${START}:d=1:alpha=1[logo]; \
   [bg][logo]overlay=(W-w)/2:(H-h)/2:shortest=1,format=yuv420p[v]" \
  -map "[v]" -map 0:a -c:v libx264 -preset slow -crf 18 -c:a copy video-watermark.mp4
```

Notes on the filter:
- The `color=c=black` input is a full-frame black layer bounded to the video's exact
  duration (`-t ${D}`) so it doesn't run indefinitely. `colorchannelmixer=aa=0.5` sets
  its alpha to a flat 0.5 — "slightly black," not opaque. `fade=...:alpha=1` then ramps
  that layer's own alpha from 0 up to its already-set 0.5 ceiling, starting at `START`.
  Before `START` the dim layer is fully transparent, so the first `overlay` can run for
  the whole video with zero visible effect until the ramp begins.
- The logo's `fade=...:alpha=1` uses the *same* `START` so both effects land together.
- `overlay=(W-w)/2:(H-h)/2` centers the logo — the default position. A centered logo can
  run larger than a corner watermark (~350–480px wide on a 1920px-wide 1080p frame)
  since it's meant to read as a deliberate final statement, not an unobtrusive mark.
- `-c:a copy` — the audio track is untouched, so copy it instead of re-encoding.
- `shortest=1` on both overlays guards against a looped/bounded input running longer
  than the main video.

**Check for collision with on-screen text/subject before finalizing.** If the story's
final frame already has a centered subject with its own text (e.g. a product package
that itself reads "BRAND NAME" in the frame), a dead-center logo overlay will stack
directly on top of it and both become unreadable. Extract the frame at `START + 1.5` and
look — if there's a collision, shift the logo to an open area in the same frame (e.g.
lower-third below the subject) rather than forcing dead-center or falling back to a
corner:
```bash
[bg][logo]overlay=(W-w)/2:H-h-70:shortest=1,format=yuv420p[v]   # centered, lower third
```
Keep it horizontally centered even when shifted vertically — only move it off-center as
a last resort if the whole lower and upper thirds are both occupied. The dim layer still
covers the full frame regardless of where the logo sits.

**QA before delivering**: extract a frame from inside the fade window
(`ffmpeg -ss <t> -i video-watermark.mp4 -frames:v 1 check.jpg` at roughly
`START + 1.5`) and confirm the logo is legible and not overlapping other text, and that
the dim reads as a mood shift rather than looking like a brightness bug.

---

## If a scene's internal cuts feel choppy, fix that separately first

A hard concat between generated scenes can feel jarring even before any outro work — most
often when one scene's own pacing (e.g. a prompt explicitly requesting "fast hard cuts"
for a labor/action montage) sits next to calmer scenes. This is a pacing problem, not an
outro problem: smooth it by rebuilding the scene concat with short crossfades (~0.4s)
before applying the logo/dim overlay, video and audio together:
```bash
D=4.062993   # exact per-scene duration from ffprobe
X=0.4
ffmpeg -y -i A.mp4 -i B.mp4 -i C.mp4 -i D.mp4 -filter_complex \
  "[0:v]format=yuv420p,fps=24[v0];[1:v]format=yuv420p,fps=24[v1]; \
   [2:v]format=yuv420p,fps=24[v2];[3:v]format=yuv420p,fps=24[v3]; \
   [v0][v1]xfade=transition=fade:duration=${X}:offset=$(echo "$D-$X"|bc)[v01]; \
   [v01][v2]xfade=transition=fade:duration=${X}:offset=$(echo "2*$D-2*$X"|bc)[v012]; \
   [v012][v3]xfade=transition=fade:duration=${X}:offset=$(echo "3*$D-3*$X"|bc)[outv]; \
   [0:a][1:a]acrossfade=d=${X}[a01];[a01][2:a]acrossfade=d=${X}[a012]; \
   [a012][3:a]acrossfade=d=${X}[outa]" \
  -map "[outv]" -map "[outa]" -c:v libx264 -preset slow -crf 18 -c:a aac -b:a 192k smooth.mp4
```
Note the resulting video is shorter than `n × per-scene-duration` (each crossfade
overlaps two scenes) — recompute `D` for the outro step above from the *actual* output
duration, not the sum of the inputs. Only apply this fix to the scene(s) that actually
feel choppy; a client may explicitly prefer the other scenes' hard cuts left as-is.
