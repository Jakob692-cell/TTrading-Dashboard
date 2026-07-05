# The Corner-Logo Watermark (zero extra Higgsfield credits)

A wordless brand-story film (see [narrative-craft.md](narrative-craft.md)) intentionally
never shows a legible product or brand name mid-story — that is correct craft, the
product resolves the story's tension at the very end. But relying on the video model to
render a crisp, on-brand, legible logo inside a generated shot is unreliable — text and
fine logo detail are exactly what these models render least consistently. Fix this in
post, not in the prompt, and keep the fix minimal.

**The pattern: fade the brand's logo in as a small corner watermark over the final ~2–3
seconds of the existing footage — like a TV network bug — with zero change to the
video's length or content.** Built entirely with ffmpeg's `overlay` + `fade` filters.
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

## Building the watermark overlay

Determine the source video's exact duration first (`ffprobe -v error -show_entries
format=duration -of csv=p=0 video.mp4`), then fade the logo in starting ~2.5s before the
end, holding for the remainder:

```bash
D=16.275692                       # exact duration from ffprobe
START=$(echo "$D - 2.5" | bc)     # fade-in begins 2.5s before the end

ffmpeg -y -i video.mp4 -loop 1 -i lockup.png -filter_complex \
  "[1:v]scale=260:-1,format=rgba,fade=t=in:st=${START}:d=1:alpha=1[logo]; \
   [0:v][logo]overlay=W-w-50:50:shortest=1,format=yuv420p[v]" \
  -map "[v]" -map 0:a -c:v libx264 -preset slow -crf 18 -c:a copy video-watermark.mp4
```

Notes on the filter:
- `fade=...:alpha=1` fades the logo's own alpha channel from 0→1 — before `START` the
  logo is fully transparent, so `overlay` can run for the entire video without showing
  anything early. No `enable=` gating needed.
- `overlay=W-w-50:50` positions top-right with a 50px margin — swap to `50:50` for
  top-left. Keep it in a top corner (out of the way of centered subjects); avoid bottom
  corners where generated text overlays or subtitles conventionally sit.
- `-c:a copy` — the audio track is untouched, so copy it instead of re-encoding.
- `shortest=1` on overlay guards against the looped image input running longer than the
  main video.
- Logo width ~200–300px on a 1920px-wide 1080p frame reads as a watermark, not a slide.

**QA before delivering**: extract a frame from inside the fade window
(`ffmpeg -ss <t> -i video-watermark.mp4 -frames:v 1 check.jpg` at roughly
`START + 1.5`) and confirm the logo is legible against whatever footage happens to be
behind it at that moment — a busy or same-color background at that exact timestamp can
wash out the mark even though the filter graph is correct.

---

## When a background plate is genuinely warranted

If after checking the actual frame the logo truly does not read against the footage
(same-color clash, not just habit), the minimal fix is a soft dark scrim only behind the
logo's own bounding box (e.g. a semi-transparent rounded rectangle sized to the logo),
not a full corner card and never a full-frame card. Confirm with the client before
adding any plate — the default expectation is logo-only, no backing shape.
