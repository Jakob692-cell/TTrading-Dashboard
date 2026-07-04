<!-- Cached from marketing_studio_video tool schema + MCP server instructions.
     Re-verify with higgsfield:models_explore('marketing_studio_video') before
     generating — UGC preset mechanics are more likely to drift than basic params. -->

# marketing_studio_video — UGC Parameter Reference

## Full parameter table

| Parameter | Required | Type | Notes |
|---|---|---|---|
| `resolution` | Optional | string | `480p` \| `720p` \| `1080p`, default `720p` |
| `generate_audio` | Optional | bool | Default `true`. **Never set false for UGC** — the whole format depends on spoken audio. |
| `mode` | Recommended | string | The creative format/style slug. Get options from `show_marketing_studio(action='presets')`. For this skill: must be one of the 5 UGC-eligible presets. |
| `folder_id` | Optional | string | Marketing project/folder id |
| `width` / `height` | Optional | number | Explicit output override — normally let `aspect_ratio` handle this |
| `avatar_ids` | Optional, max 1 | string array | Plain UUID array. Preferred over the legacy `avatars` field. Get preset avatar IDs via `higgsfield:show_characters`. |
| `product_ids` | Optional | string array | Plain UUID array (note: plural field name even for one product) |
| `assets` | Optional | string array | Backend asset ids for additional b-roll |
| `hook_id` | Optional | string | The opening attention mechanic. From `show_marketing_studio(action='list', type='hook')`. Only functional on the 5 UGC-eligible presets. Can be combined with `setting_id`, or used alone. |
| `setting_id` | Optional | string | Location/vibe. From `show_marketing_studio(action='list', type='setting')`. Same 5-preset restriction as `hook_id`. Independent of `hook_id` — either, both, or neither. |
| `ad_reference_id` | Optional | string | Recreates an existing ad's scenario (composition, pacing, hook, narration) instead of building from hook/setting. **Mutually exclusive with `hook_id`/`setting_id`** — pick one mechanism. |
| `aspect_ratio` | Yes | string | `auto`, `21:9`, `16:9`, `4:3`, `1:1`, `3:4`, `9:16` |
| `duration` | Yes | number | 4–15 s (continuous range for marketing_studio_video) |

## Critical gotcha: avatar/product are NOT auto-pulled from ad_reference

If an `ad_reference_id` was created with a linked avatar/product, those links are for
organizational reference only — **they do not carry over automatically**. If the new
video should use the same (or a different) avatar/product, pass `avatar_ids` /
`product_ids` explicitly on the `generate_video` call regardless of what the reference
was linked to.

## Discovery calls (free, no credits)

```
higgsfield:show_characters                                    → list preset avatars
higgsfield:show_marketing_studio(action='presets')             → list mode/preset slugs
higgsfield:show_marketing_studio(action='list', type='hook')   → list hook_id options
higgsfield:show_marketing_studio(action='list', type='setting')→ list setting_id options
higgsfield:show_marketing_studio(action='list', type='ad_reference') → list saved ad references
```

Always run the relevant discovery call before proposing a storyboard beat that names a
specific hook/setting/avatar — never invent an ID or preset name.

## Aspect ratio decision

| Target | Aspect ratio |
|---|---|
| TikTok, Instagram Reels, YouTube Shorts | `9:16` (default assumption for "UGC" unless told otherwise) |
| YouTube in-feed/pre-roll UGC-style ad | `16:9` |
| Instagram feed post | `1:1` |

Confirm explicitly with the user rather than assuming — this skill was written after a
session where "16:9" was requested for what is conventionally a `9:16` format, so don't
silently correct it either. Ask.
