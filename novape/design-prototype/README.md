# NoVape — design prototype

Clickable design prototype for the NoVape mobile app (16 screens, 390 px phone width).

Live canvas: https://claude.ai/artifact/VUG1MpY22fewHrsGzpY1UE

These files are the source of that canvas. Each `*.dc.html` file is one screen
(a Design Component artboard); `canvas.json` holds the layout of the artboards.

| Row | Screens |
|---|---|
| Onboarding | `Onboarding1`–`Onboarding5` (welcome, intention, starting point, connect device, first plan) |
| Core app | `Main` (Home), `Statistics`, `Goals`, `Profile` |
| Details | `Craving1`–`Craving3` (trigger, 2-minute wait, check-in), `Device`, `Flavors`, `Achievements`, `Notifications` |

Design tokens used throughout:

- Background `#FFFFFF`, secondary `#F7F7F8`, borders `#EAEAEA`
- Text `#111111`, secondary `#777777`
- Accent (sage) `#7FBF9A`, darker chart/text sage `#5E9F7A` / `#3F7F5B`, soft tint `#EEF6F1`
- Type: SF Pro on Apple devices, Inter elsewhere
- Radii 18–24 px

All numbers are sample data. NoVape is presented as a habit-tracking companion,
not a medical device.
