---
name: airbnb-walkthrough-video
description: Produce photo-accurate AI walkthrough videos of real rental properties (Airbnb, vacation rentals, listings) from their real listing photos using Higgsfield MCP + Seedance 2.0 and ffmpeg stitching. Use whenever the user wants a walkthrough/tour video of a REAL existing property from a listing URL or photo set — NOT an imaginary showcase. Triggers on walkthrough video, Airbnb video, listing tour, property tour from photos, "mach ein Video von dieser Immobilie".
---

# Photo-genaue Airbnb/Immobilien-Walkthrough-Videos (Higgsfield MCP)

Erprobter End-to-End-Workflow. Kernprinzip aus schmerzhafter Erfahrung:

> **NIEMALS aus einem einzigen Foto einen Rundgang generieren.** Das Modell
> halluziniert dann die komplette Einrichtung. Jeder Clip bekommt ein echtes
> Foto als Startbild UND (wo möglich) ein echtes Foto des angrenzenden Raums
> als Endbild. Das Modell darf nur den Weg dazwischen erfinden — nie den Raum.

## Phase 1: Fotos beschaffen und das Haus VERSTEHEN

1. Listing-Seite laden (WebFetch) → Fakten ziehen: Räume, Betten, Bäder, Besonderheiten.
2. Foto-URLs extrahieren, z. B.: `curl -sL <listing-url> | grep -oE 'https?://[^"]+\.(jpg|jpeg|JPG)' | sort -u`
   (Escapia/VRBO-Hosts liefern oft 350x250-Thumbs UND Vollauflösung — nur die großen verwenden, per `file`-Check auf Auflösung filtern.)
3. **ALLE brauchbaren Fotos mit Read ansehen** und den Grundriss kartieren:
   Welcher Raum grenzt an welchen? Wo sind Türen/Durchgänge? Was sieht man
   von wo? Erst wenn die Raumfolge klar ist, Shots planen.
4. Foto-Set wählen (5–8 Bilder): 1 Außen-Hook, 1 Hauptwohnraum, 1 Küche,
   1 Flur/Übergang, 1–2 Schlafzimmer, 1 Außen-Abschluss. Übergangsfotos
   (Blick durch Türen/Flure) sind Gold wert — sie werden Endbilder.

## Phase 2: Higgsfield vorbereiten (Stolperfallen!)

- `balance` prüfen: **Seedance 2.0 (auch Mini) braucht mindestens Basic-Plan** — auf Free kommt `job_minimum_basic_plan_required` trotz Credits. Fallback auf Free: `veo3_1_lite` (aber schwächere Bildtreue).
- **Media-IDs sind kontogebunden.** Nach Konto-/Workspace-Wechsel alle Bilder neu importieren.
- Jedes Foto mit `media_import_url` importieren → media_id notieren.
- **Kosten IMMER mit `get_cost: true` preflighten.** Gemessene Seedance-2.0-Preise (fast, ohne Audio): 480p ≈ 1,5 Credits/s, 720p ≈ 3,5 Credits/s; std 720p+ ≈ 4,5 Credits/s. Start-/End-/Referenzbilder kosten nichts extra.
- Budgetregel: Erst alles in 480p produzieren und den Schnitt abnehmen lassen, dann dieselben Prompts in 720p/1080p re-rendern oder `upscale_video` nutzen.

## Phase 3: Clips generieren

Pro Clip (6s ist der Sweet Spot; 4–15s möglich):

```json
{
  "model": "seedance_2_0",
  "duration": 6, "aspect_ratio": "16:9",
  "mode": "fast", "resolution": "480p", "generate_audio": false,
  "medias": [
    {"role": "start_image", "value": "<media_id Raum A>"},
    {"role": "end_image",   "value": "<media_id Raum B (angrenzend!)>"}
  ],
  "prompt": "<siehe Template>"
}
```

**Prompt-Template (funktioniert, konservativ halten):**
```
Real estate interior walkthrough shot. Slow, smooth gimbal <push-in/pan/glide/pull-back>:
starting on <exakte Beschreibung Startbild>, the camera slowly <Bewegung>,
ending on <exakte Beschreibung Endbild>. Keep every room, wall, piece of
furniture and detail EXACTLY as in the photos — do not add, remove or change
anything. <Licht-Stimmung>, photorealistic, steady slow camera, no people, no text.
```

Regeln:
- Beschreibe konkret, was auf den Fotos IST (Farben, Materialien, Möbel) — das ankert das Modell zusätzlich.
- Nur EINE Kamerabewegung pro Clip. Langsam. Keine Schnitte im Clip.
- Start- und Endbild müssen räumlich zusammenhängen (max. 1 Raum Distanz), sonst morpht das Modell unlogisch.
- Reihenfolge des fertigen Videos = echte Gehreihenfolge durchs Haus: Ankunft → Haupraum → Küche → Flur → Schlafzimmer → Außen-Finale.

Betriebliches:
- Kommt `preset_recommendation` zurück: mit `declined_preset_id` wörtlich erneut generieren (Presets sind für diesen Use-Case falsch).
- **Rate-Limit: Basic erlaubt 2 parallele Jobs** (`rate_limit_reached`) → in 2er-Wellen einreichen, ~90–120s pro Welle, Status via `job_display` pollen.
- Job-IDs + rawUrls notieren.

## Phase 4: Schnitt (ffmpeg)

1. Alle Clips per rawUrl herunterladen, Specs mit ffprobe prüfen (Seedance 480p liefert 864×496@24fps — alle Clips identisch, kein Rescale nötig).
2. Mit 0,5s-Crossfades verketten (Offsets = kumulierte Dauer − n×0,5):

```bash
ffmpeg -y -i c1.mp4 -i c2.mp4 -i c3.mp4 -i c4.mp4 -i c5.mp4 -filter_complex \
"[0:v][1:v]xfade=transition=fade:duration=0.5:offset=5.54[v01];\
[v01][2:v]xfade=transition=fade:duration=0.5:offset=11.08[v02];\
[v02][3:v]xfade=transition=fade:duration=0.5:offset=16.63[v03];\
[v03][4:v]xfade=transition=fade:duration=0.5:offset=22.17,format=yuv420p[v]" \
-map "[v]" -c:v libx264 -preset slow -crf 18 -r 24 walkthrough.mp4
```

3. Falls ffmpeg fehlt: `apt-get update && apt-get install -y ffmpeg` (update zuerst, sonst 404s).
4. Ergebnis mit SendUserFile liefern; erst nach Abnahme upscalen/re-rendern.

## Kalkulation (Richtwerte pro Objekt)

| Variante | Clips | Credits | Ergebnis |
|---|---|---|---|
| Entwurf 480p | 5×6s | ~45 | 28s-Video zur Abnahme |
| Final 720p | 5×6s | ~105 | Social-media-tauglich |
| Final-Serie 720p, 8 Clips | 8×6s | ~170 | 44s Full-Tour |
| Audio (Ambience/Musik) | — | im Schnitt zufügen | lizenzfreie Musik statt generate_audio |

## Checkliste

- [ ] Listing gelesen, alle Fotos angesehen, Grundriss kartiert
- [ ] Plan/Credits geprüft, Kosten preflighted, Budget mit Nutzer geklärt
- [ ] Jeder Clip: echtes Start- UND möglichst Endbild, konservativer Prompt
- [ ] 2er-Wellen wegen Rate-Limit, Job-IDs notiert
- [ ] ffmpeg-Schnitt mit Crossfades, Specs vorher geprüft
- [ ] 480p-Entwurf abnehmen lassen, DANN Qualitäts-Rerender
