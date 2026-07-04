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

> **ZWEITE LEKTION (v2, nach Nutzer-Feedback „harte Übergänge, Räume switchen
> random, Tempo wechselt"):** Diese drei Symptome haben EINE gemeinsame Ursache —
> eine gebrochene Bild-Kette. Die Fixes:
> 1. **Strikte Kette**: `end_image` von Clip N = `start_image` von Clip N+1,
>    ausnahmslos, für die GESAMTE Sequenz. Keine Lücken, kein „mal mit,
>    mal ohne Endbild".
> 2. **Uniforme Clip-Dauer** für die ganze Serie (z. B. alle 6s). Das ist der
>    größte Hebel gegen wahrgenommenen Tempowechsel — unterschiedliche
>    Dauern je Clip lesen sich als unterschiedliche Geschwindigkeit.
> 3. **Wortidentischer Tempo-Satz** in jedem einzelnen Prompt, nicht nur
>    sinngemäß ähnlich: exakt derselbe String, z. B. "Continuous slow
>    steadicam glide at a constant, unhurried walking pace throughout —
>    no acceleration, no deceleration, no camera shake, no cuts."
> 4. **Crossfade auf 0,2–0,3s reduzieren** (nicht 0,5s) — wenn die Bildkette
>    stimmt, matchen sich Clip-Ende und nächster Clip-Anfang fast pixelgenau;
>    ein langer Fade macht den Bruch dann sichtbarer statt ihn zu kaschieren.

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
- **Kosten IMMER mit `get_cost: true` preflighten.** Gemessene Preise (ohne Audio, 16:9):
  - `seedance_2_0` **fast**: 480p ≈ 1,5 Cr/s, 720p ≈ 3,5 Cr/s
  - `seedance_2_0` **std**: 480p ≈ 3 Cr/s, 720p ≈ 4,5 Cr/s
  - `cinematic_studio_3_0` (das im `15-real-estate`-Skill empfohlene Primärmodell): 480p ≈ 3,5 Cr/s, 720p (Default) ≈ 5 Cr/s — **~2–3× teurer als seedance fast**. Trotz Skill-Doku „keine tunbaren Parameter" wird `resolution: 480p` akzeptiert und drückt den Preis spürbar.
  - Start-/End-/Referenzbilder kosten nichts extra, unabhängig vom Modell.
- **Budget-Faustregel:** Bei knappem Budget (< ~100 Credits) ist `seedance_2_0 fast/480p` fast immer die einzige Option, die eine komplette 6–8-Clip-Kette abdeckt. `cinematic_studio_3_0` erst erwägen, wenn der Nutzer explizit mehr Budget freigibt — vorher `get_cost` für EINEN Clip prüfen und hochrechnen, bevor man sich auf das teurere Modell festlegt.
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
- **Kette ohne Lücken bauen**: Clip-Liste vorher als Tabelle Start-ID/End-ID aufschreiben und prüfen, dass End-ID(N) == Start-ID(N+1) für ALLE Übergänge — das ist der Unterschied zwischen einem Rundgang, der sich wie ein Rundgang anfühlt, und einem, der zwischen Räumen "springt".
- **Alle Clips einer Serie identische `duration`** setzen (z. B. immer 6, nie mal 6 mal 8) — sonst wirkt das fertige Video ungleichmäßig getaktet, selbst wenn jeder einzelne Clip für sich sauber ist.
- Tempo-Satz wortidentisch in jeden Prompt kopieren (siehe zweite Lektion oben), nicht umformulieren.

Betriebliches:
- Kommt `preset_recommendation` zurück: mit `declined_preset_id` wörtlich erneut generieren (Presets sind für diesen Use-Case falsch).
- **Rate-Limit: Basic erlaubt 2 parallele Jobs** (`rate_limit_reached`) → in 2er-Wellen einreichen, ~90–120s pro Welle, Status via `job_display` pollen.
- Job-IDs + rawUrls notieren.

## Phase 4: Schnitt (ffmpeg)

1. Alle Clips per rawUrl herunterladen, Specs mit ffprobe prüfen (Seedance 480p liefert 864×496@24fps — alle Clips identisch, kein Rescale nötig). **Bei uniformer `duration` sind auch alle Output-Dateien exakt gleich lang** — das lässt sich direkt verifizieren und ist ein guter Sanity-Check, bevor geschnitten wird.
2. Mit **kurzen** Crossfades verketten — 0,2–0,3s, NICHT 0,5s (Begründung: zweite Lektion oben). Offsets = n × Cliplänge − n × Fade-Dauer:

```bash
D=6.041667   # exakte Clip-Dauer laut ffprobe
X=0.25       # Fade-Dauer
ffmpeg -y -i c1.mp4 -i c2.mp4 -i c3.mp4 -i c4.mp4 -i c5.mp4 -i c6.mp4 -i c7.mp4 -filter_complex \
"[0:v][1:v]xfade=transition=fade:duration=${X}:offset=$(echo "$D-$X"|bc)[v01];\
[v01][2:v]xfade=transition=fade:duration=${X}:offset=$(echo "2*$D-2*$X"|bc)[v02];\
[v02][3:v]xfade=transition=fade:duration=${X}:offset=$(echo "3*$D-3*$X"|bc)[v03];\
[v03][4:v]xfade=transition=fade:duration=${X}:offset=$(echo "4*$D-4*$X"|bc)[v04];\
[v04][5:v]xfade=transition=fade:duration=${X}:offset=$(echo "5*$D-5*$X"|bc)[v05];\
[v05][6:v]xfade=transition=fade:duration=${X}:offset=$(echo "6*$D-6*$X"|bc),format=yuv420p[v]" \
-map "[v]" -c:v libx264 -preset slow -crf 18 -r 24 walkthrough.mp4
```

3. Falls ffmpeg fehlt: `apt-get update && apt-get install -y ffmpeg` (update zuerst, sonst 404s).
4. **Visuelle QA vor Auslieferung**: Bei jedem Clip-Übergang ein Frame extrahieren (`ffmpeg -ss <t> -i walkthrough.mp4 -frames:v 1 check.jpg`) und mit Read ansehen — bestätigt, dass die Kette wirklich hält und keine Naht sichtbar ist, bevor der Nutzer es sieht.
5. Ergebnis mit SendUserFile liefern; erst nach Abnahme upscalen/re-rendern.

## Kalkulation (Richtwerte pro Objekt, seedance_2_0 fast)

| Variante | Clips | Credits | Ergebnis |
|---|---|---|---|
| Entwurf 480p | 7×6s | ~63 | 41s-Video, uniforme Kette, zur Abnahme |
| Final 720p | 7×6s | ~147 | Social-media-tauglich |
| Final-Serie 720p, 8 Clips | 8×6s | ~168 | ~48s Full-Tour |
| cinematic_studio_3_0 480p (Premium) | 7×6s | ~147 | 2× teurer als seedance fast — nur bei größerem Budget |
| Audio (Ambience/Musik) | — | im Schnitt zufügen | lizenzfreie Musik statt generate_audio |

## Checkliste

- [ ] Listing gelesen, alle Fotos angesehen, Grundriss kartiert
- [ ] Plan/Credits geprüft, Kosten preflighted, Budget mit Nutzer geklärt
- [ ] Kette als Start/End-Tabelle notiert, lückenlos geprüft (End(N) == Start(N+1))
- [ ] Alle Clips derselben Serie: identische `duration`, wortidentischer Tempo-Satz
- [ ] 2er-Wellen wegen Rate-Limit, Job-IDs notiert
- [ ] ffmpeg-Schnitt mit kurzen Crossfades (0,2–0,3s), Specs vorher geprüft
- [ ] Frame-Check an jedem Übergang vor Auslieferung
- [ ] 480p-Entwurf abnehmen lassen, DANN Qualitäts-Rerender
