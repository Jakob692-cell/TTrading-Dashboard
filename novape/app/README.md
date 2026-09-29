# NoVape — mobile app

A habit-tracking and behavior-change companion for adults who want to reduce or stop vaping.
It pairs with the **NoVape One**, a nicotine-free device that produces no vapor, and helps people
move from **baseline → awareness → reduction → independence**.

The core metric is not "how much did you use NoVape?" but "how much has your dependency on the habit
decreased?" The app is built to be needed less over time.

> NoVape is not a medical device. It does not diagnose, treat or cure nicotine addiction and does not
> guarantee that anyone will stop vaping or smoking.

## Run it

```bash
npm install
npm run dev            # http://localhost:5173 (use a phone-sized window or DevTools device mode)
npm test               # domain unit tests (vitest)
npm run typecheck
npm run build          # production build in dist/
npm run build:single   # one self-contained HTML file in dist-single/ (for sharing a preview)
```

The app is mobile-first. On a desktop browser it renders inside a phone frame.
Demo data is generated relative to today, so the demo user is always on day 21 of their journey.
Your own changes (plan edits, craving check-ins, settings, simulated uses) are kept in `localStorage`.
**Profile → Account → Demo** lets you simulate a device use or replay onboarding.

## Screens

| Area | What's there |
|---|---|
| Onboarding | Welcome with the floating 3D device, intention, starting point (slider), device pairing (3D with search rings), first editable plan |
| Home | Today ring with count-up, streak / reduction / savings, uses per hour, top insight |
| Statistics | 7D / 30D / 3M / ALL, daily-uses line with goal steps and baseline (scrubbable), since-starting metrics, weekday × hour heatmap |
| Goals | Current goal, supportive (never shaming) messaging, week-by-week plan; every week editable, observe-only weeks, add a week |
| Craving? | Floating button → trigger → 2-minute breathing timer → "How do you feel?"; stored for insights |
| Insights | Daily rhythm, craving triggers, outcomes after waiting, weekend pattern, lowest day |
| Profile | Member since / baseline / current average, My NoVape, achievements, cartridges, notifications, privacy, account, help, about |
| My NoVape | Live 3D model (drag to turn, pulsing light strip, buzz on “find”), views: device · close-up · cartridge lifted out · all four colors; battery / flavor / cartridge, haptics, light feedback, rename, firmware check, find my NoVape |
| Cartridges | Current cartridge turning in 3D + estimate, rendered Mint / Lemon / Berry cartridges, pick the next one, “I inserted a new cartridge” |

## Architecture

```
src/
  models/            Domain types: User, Device, UsageEvent, DailyStats, Goal, CravingEvent, Cartridge, Achievement …
  domain/            Pure logic (no React): stats, plan, insights, achievements, notifications, dates — unit tested
  data/              Demo data generator + flavor catalog
  services/
    api/             NoVapeApi interface · MockNoVapeApi (local) · HttpNoVapeApi (REST) · index.ts picks one
    device/          DeviceService interface · MockDeviceService · WebBluetoothDeviceService · GATT protocol
    storage.ts       Guarded localStorage
  state/             AppStore (data + actions), useDerived (memoised selectors), Ui (toasts, craving sheet)
  navigation/        Tab + stack navigator with browser-back support
  components/        ui/ (cards, ring, toggles, sheet, stepper …), charts/, device/, three/ (3D), brand/, navigation/
  three/             3D engine (three.js, loaded on demand): device and cartridge models, studio lighting, stills
  features/craving/  Craving check-in flow
  screens/           One file per screen
  styles/            tokens.css (design tokens) · base · components · charts · screens
```

### 3D

The device and cartridges are real 3D models (`src/three/models.ts`), built from the same dimensions as
the hardware plan in `novape/hardware`. `Scene3D` shows a live scene (studio environment lighting,
neutral tone mapping, contact shadows, drag to turn, pauses when off screen); `Still3D` renders small
thumbnails once and caches them. three.js is loaded on first use, so the app starts as fast as before.
Without WebGL the product photos are shown instead.

### Swapping in a backend

Everything goes through `NoVapeApi` (`src/services/api/NoVapeApi.ts`). Set `VITE_API_URL` and the app
uses `HttpNoVapeApi`, which maps each call to a REST endpoint (`GET /me/snapshot`, `POST /me/usage`,
`PUT /me/goals/:id`, …). Screens and state don't change.

### NoVape hardware

`DeviceService` (`src/services/device/DeviceService.ts`) is the only thing the UI knows about the
hardware: connect, disconnect, sync buffered offline usage, apply settings, rename, find, check firmware,
and a subscription for `usage`, `battery`, `cartridge` and `connection` events.

- `MockDeviceService` powers the demo.
- `WebBluetoothDeviceService` implements the draft GATT profile in `protocol.ts` (placeholder UUIDs,
  little-endian records). Enable it with `VITE_DEVICE=bluetooth` in a browser that supports Web Bluetooth.
- A native app (React Native / Capacitor) implements the same interface with its BLE library.

## Design system

White-first, calm and minimal: `#FFFFFF` / `#F7F7F8` surfaces, `#111111` / `#777777` text, `#EAEAEA`
borders, sage accent `#7FBF9A`, muted amber only for warnings (e.g. low battery). SF Pro on Apple
devices, Inter elsewhere. Radii 18–24 px, very soft shadows, fast ease-out motion; all animation is
disabled for `prefers-reduced-motion`.

Principles baked into the product: no shaming for missed goals, no streak pressure, notifications that
inform rather than nudge, and milestones that celebrate needing the device less.
