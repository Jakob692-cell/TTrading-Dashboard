import { generateMountain, distToPolyline, avalancheFront, pointAlong, mountainName } from '../shared/mountain.js';
import { mulberry32, hashString, dailySeedString } from '../shared/rng.js';
import {
  MAX_PLAYERS, TICK_RATE, SNAP_RATE, COUNTDOWN, JACKET_COLORS, HATS, SHOP_ITEMS, shiftConfig, emptyStats,
  AWARDS, PATIENT_LINES, TOURIST_NAMES, AIR_SUPPLY, DIG_TIME, CHARGE_FUSE, CHARGES_PER_REFILL, PATIENT_TYPES,
} from '../shared/constants.js';

const now = () => performance.now() / 1000;
const mountainCache = new Map();
function getMountain(seed) {
  if (!mountainCache.has(seed)) {
    if (mountainCache.size > 6) mountainCache.delete(mountainCache.keys().next().value);
    mountainCache.set(seed, generateMountain(seed));
  }
  return mountainCache.get(seed);
}

const clampStr = (s, n) => String(s ?? '').replace(/[<>]/g, '').slice(0, n);
const r2 = (v) => Math.round(v * 100) / 100;

export class Room {
  constructor(code, onEmpty) {
    this.code = code;
    this.onEmpty = onEmpty;
    this.players = new Map();
    this.hostId = null;
    this.phase = 'lobby';
    this.mode = 'daily';
    this.run = this.freshRun();
    this.shift = null;
    this.nextEntityId = 1;
    this.lastSnap = 0;
    this.timer = setInterval(() => this.tick(), 1000 / TICK_RATE);
  }

  freshRun() {
    return { day: 1, money: 0, upgrades: {}, seed: this.mode === 'daily' ? dailySeedString() : String(Math.floor(Math.random() * 1e9)) };
  }

  // ---------------------------------------------------------------- players
  addPlayer(ws, id, profile) {
    if (this.players.size >= MAX_PLAYERS) return false;
    if (this.phase !== 'lobby') return false;
    const usedColors = new Set([...this.players.values()].map((p) => p.color));
    let color = JACKET_COLORS.includes(profile?.color) && !usedColors.has(profile.color) ? profile.color : null;
    if (!color) color = JACKET_COLORS.find((c) => !usedColors.has(c)) || JACKET_COLORS[0];
    const p = {
      id, ws,
      name: clampStr(profile?.name || 'Patroller', 16) || 'Patroller',
      color,
      hat: HATS.includes(profile?.hat) ? profile.hat : 'beanie',
      ready: false,
      st: null,
      stats: emptyStats(),
      charges: CHARGES_PER_REFILL,
      buried: null,
      lastChat: 0,
    };
    this.players.set(id, p);
    if (this.hostId === null) this.hostId = id;
    this.send(p, { t: 'welcome', id, code: this.code });
    this.broadcastLobby();
    this.toast(`${p.name} joined the patrol`, 'join');
    return true;
  }

  removePlayer(id) {
    const p = this.players.get(id);
    if (!p) return;
    this.players.delete(id);
    if (this.shift) {
      for (const s of this.shift.sleds) if (s.owner === id) s.owner = null;
    }
    if (this.hostId === id) this.hostId = this.players.size ? this.players.keys().next().value : null;
    if (this.players.size === 0) {
      clearInterval(this.timer);
      this.onEmpty(this.code);
      return;
    }
    this.toast(`${p.name} left`, 'leave');
    this.broadcastLobby();
  }

  send(p, msg) {
    if (p.ws.readyState === 1) p.ws.send(JSON.stringify(msg));
  }
  broadcast(msg, exceptId = null) {
    const data = JSON.stringify(msg);
    for (const p of this.players.values()) if (p.id !== exceptId && p.ws.readyState === 1) p.ws.send(data);
  }
  event(e) { this.broadcast({ t: 'ev', ...e }); }
  toast(text, kind = 'info') { this.event({ k: 'toast', text, kind }); }

  lobbyState() {
    return {
      t: 'lobby', code: this.code, hostId: this.hostId, phase: this.phase, mode: this.mode,
      run: this.run,
      players: [...this.players.values()].map((p) => ({ id: p.id, name: p.name, color: p.color, hat: p.hat, ready: p.ready })),
    };
  }
  broadcastLobby() { this.broadcast(this.lobbyState()); }

  // ---------------------------------------------------------------- messages
  handle(id, msg) {
    const p = this.players.get(id);
    if (!p || !msg || typeof msg.t !== 'string') return;
    const sh = this.shift;
    switch (msg.t) {
      case 'sync':
        this.send(p, { t: 'sync', ct: msg.ct, st: now() });
        break;
      case 'profile': {
        if (msg.name) p.name = clampStr(msg.name, 16) || p.name;
        if (HATS.includes(msg.hat)) p.hat = msg.hat;
        if (JACKET_COLORS.includes(msg.color) && ![...this.players.values()].some((o) => o !== p && o.color === msg.color)) p.color = msg.color;
        this.broadcastLobby();
        break;
      }
      case 'ready':
        p.ready = !!msg.ready;
        this.broadcastLobby();
        break;
      case 'mode':
        if (id === this.hostId && this.phase === 'lobby' && (msg.mode === 'daily' || msg.mode === 'random')) {
          this.mode = msg.mode;
          this.run = this.freshRun();
          this.broadcastLobby();
        }
        break;
      case 'start':
        if (id === this.hostId && (this.phase === 'lobby' || (this.phase === 'results' && this.lastResults?.passed))) this.startShift();
        break;
      case 'toLobby':
        if (id === this.hostId && this.phase === 'results') {
          this.run = this.freshRun();
          this.phase = 'lobby';
          this.shift = null;
          for (const pl of this.players.values()) pl.ready = false;
          this.broadcastLobby();
        }
        break;
      case 'buy': {
        if (this.phase !== 'results' || !this.lastResults?.passed) break;
        const item = SHOP_ITEMS[msg.item];
        if (!item) break;
        const owned = this.run.upgrades[msg.item] || 0;
        if (owned >= item.max || this.run.money < item.price) break;
        this.run.money -= item.price;
        this.run.upgrades[msg.item] = owned + 1;
        this.toast(`${p.name} bought ${item.name}`, 'shop');
        this.broadcastLobby();
        break;
      }
      case 'chat': {
        const text = clampStr(msg.text, 140).trim();
        if (!text || now() - p.lastChat < 0.4) break;
        p.lastChat = now();
        this.broadcast({ t: 'chat', id: p.id, name: p.name, color: p.color, text });
        break;
      }
      default:
        if (sh && this.phase === 'playing') this.handleGame(p, msg, sh);
    }
  }

  handleGame(p, msg, sh) {
    const m = sh.mountain;
    switch (msg.t) {
      case 'st': {
        if (!Array.isArray(msg.p) || msg.p.length !== 3 || !msg.p.every(Number.isFinite)) return;
        p.st = { p: msg.p.map(r2), yaw: r2(+msg.yaw || 0), a: msg.a | 0, sp: r2(+msg.sp || 0) };
        if (Number.isFinite(msg.sp)) p.stats.topSpeed = Math.max(p.stats.topSpeed, Math.min(msg.sp, 60));
        if (msg.sled && typeof msg.sled === 'object') {
          const s = sh.sleds.find((x) => x.id === msg.sled.id);
          if (s && s.owner === p.id && Array.isArray(msg.sled.p) && msg.sled.p.every(Number.isFinite)) {
            s.x = msg.sled.p[0]; s.y = msg.sled.p[1]; s.z = msg.sled.p[2]; s.yaw = +msg.sled.yaw || 0; s.tip = !!msg.sled.tip;
          }
        }
        break;
      }
      case 'grabSled': {
        if (sh.sleds.some((s) => s.owner === p.id)) return;
        const s = sh.sleds.find((x) => x.id === msg.id);
        if (!s || s.owner !== null || !p.st) return;
        if (Math.hypot(s.x - p.st.p[0], s.z - p.st.p[2]) > 6) return;
        s.owner = p.id;
        this.event({ k: 'sled', id: s.id, owner: p.id });
        break;
      }
      case 'dropSled': {
        const s = sh.sleds.find((x) => x.owner === p.id);
        if (!s) return;
        s.owner = null;
        this.event({ k: 'sled', id: s.id, owner: null });
        break;
      }
      case 'work': {
        // hold-to-interact progress, shared so several players dig faster together
        const dt = Math.min(+msg.dt || 0, 0.35);
        if (!(dt > 0) || !p.st) return;
        if (msg.kind === 'patient') {
          const pt = sh.patients.find((x) => x.id === msg.id);
          if (!pt || pt.state === 'delivered' || pt.state === 'airlifted' || pt.freed) return;
          if (Math.hypot(pt.x - p.st.p[0], pt.z - p.st.p[2]) > 4) return;
          pt.progress += dt;
          const need = PATIENT_TYPES[pt.type].time;
          if (pt.progress >= need) {
            pt.freed = true;
            if (pt.state === 'buried') { pt.state = 'waiting'; p.stats.digs++; }
            this.event({ k: 'freed', id: pt.id, by: p.id, line: pt.line });
          }
        } else if (msg.kind === 'player') {
          const v = this.players.get(msg.id);
          if (!v || !v.buried || v === p) return;
          if (Math.hypot(v.buried.x - p.st.p[0], v.buried.z - p.st.p[2]) > 4) return;
          v.buried.progress += dt;
          if (v.buried.progress >= DIG_TIME) {
            v.buried = null;
            p.stats.digs++;
            this.event({ k: 'unburied', id: v.id, by: p.id });
            this.toast(`${p.name} dug ${v.name} out!`, 'good');
          }
        }
        break;
      }
      case 'load': {
        const s = sh.sleds.find((x) => x.owner === p.id);
        const pt = sh.patients.find((x) => x.id === msg.id);
        if (!s || !pt || s.patient !== null || pt.state !== 'waiting' || !pt.freed) return;
        if (Math.hypot(pt.x - s.x, pt.z - s.z) > 7) return;
        pt.state = 'sled';
        pt.sled = s.id;
        s.patient = pt.id;
        this.event({ k: 'loaded', id: pt.id, sled: s.id, by: p.id });
        break;
      }
      case 'eject': {
        const s = sh.sleds.find((x) => x.owner === p.id);
        if (!s || s.patient === null) return;
        const pt = sh.patients.find((x) => x.id === s.patient);
        s.patient = null;
        if (pt) {
          pt.state = 'waiting'; pt.sled = null; pt.x = s.x; pt.z = s.z; pt.y = m.heightAt(s.x, s.z);
          pt.condition = Math.max(1, pt.condition - 12 * this.tobogganFactor());
        }
        p.stats.ejections++;
        this.event({ k: 'ejected', id: pt?.id, by: p.id });
        break;
      }
      case 'sledHit': {
        const s = sh.sleds.find((x) => x.owner === p.id);
        if (!s || s.patient === null) return;
        const pt = sh.patients.find((x) => x.id === s.patient);
        if (pt) pt.condition = Math.max(1, pt.condition - Math.min(+msg.mag || 0, 15) * this.tobogganFactor());
        break;
      }
      case 'crash':
        p.stats.crashes++;
        if (Math.random() < 0.35) this.toast(`${p.name} had a yard sale`, 'crash');
        break;
      case 'bump': {
        const v = this.players.get(msg.id);
        if (!v || v === p) return;
        p.stats.bumps++;
        this.send(v, { t: 'ev', k: 'bumped', by: p.id, vx: +msg.vx || 0, vz: +msg.vz || 0 });
        this.toast(`${p.name} bowled over ${v.name}`, 'crash');
        break;
      }
      case 'buried': {
        if (p.buried || !Array.isArray(msg.p)) return;
        p.buried = { x: +msg.p[0], y: +msg.p[1], z: +msg.p[2], air: AIR_SUPPLY, progress: 0 };
        p.stats.buried++;
        this.event({ k: 'buried', id: p.id, x: p.buried.x, y: p.buried.y, z: p.buried.z });
        this.toast(`${p.name} is BURIED! Grab your beacons!`, 'alert');
        break;
      }
      case 'charge': {
        if (p.charges <= 0 || !Array.isArray(msg.p) || !Array.isArray(msg.v)) return;
        if (!msg.p.every(Number.isFinite) || !msg.v.every(Number.isFinite)) return;
        p.charges--;
        p.stats.charges++;
        const c = { id: this.nextEntityId++, owner: p.id, x: msg.p[0], y: msg.p[1], z: msg.p[2], vx: msg.v[0], vy: msg.v[1], vz: msg.v[2], fuse: CHARGE_FUSE, landed: false };
        sh.charges.push(c);
        this.send(p, { t: 'ev', k: 'charges', n: p.charges });
        break;
      }
      case 'refill': {
        if (!p.st) return;
        const c = m.sites.crate;
        if (Math.hypot(c.x - p.st.p[0], c.z - p.st.p[2]) > 7) return;
        p.charges = CHARGES_PER_REFILL + 1;
        this.send(p, { t: 'ev', k: 'charges', n: p.charges });
        break;
      }
      case 'lift':
        p.stats.liftRides++;
        break;
      case 'respawn':
        if (p.buried) return;
        break;
      case 'ping': {
        if (!Array.isArray(msg.p) || !msg.p.every(Number.isFinite)) return;
        this.event({ k: 'ping', id: p.id, color: p.color, name: p.name, p: msg.p.map(r2), kind: clampStr(msg.kind, 12) });
        break;
      }
    }
  }

  tobogganFactor() { return this.run.upgrades.toboggan ? 0.5 : 1; }

  // ---------------------------------------------------------------- shift lifecycle
  startShift() {
    this.run.day = this.phase === 'results' && this.lastResults?.passed ? this.run.day + 1 : 1;
    const cfg = shiftConfig(this.run.day, this.players.size);
    if (process.env.PP_SHIFT_SECONDS) cfg.duration = Number(process.env.PP_SHIFT_SECONDS); // dev/test hook
    const mountain = getMountain(this.run.seed);
    const rand = mulberry32(hashString(`${this.run.seed}:${this.run.day}:${Math.random()}`));
    const t0 = now() + 5;
    const sleds = [];
    const sledCount = cfg.sleds + (this.run.upgrades.sled || 0);
    for (let i = 0; i < sledCount; i++) {
      const r = mountain.sites.rack;
      const x = r.x + i * 2.4 - (sledCount - 1) * 1.2, z = r.z;
      sleds.push({ id: i + 1, x, y: mountain.heightAt(x, z), z, yaw: 0, owner: null, patient: null, tip: false });
    }
    // natural avalanche schedule
    const zones = mountain.avalanches.map((a) => ({ id: a.id, released: false, controlled: false, at: null, warned: false, t0: null, buriedCheck: new Set() }));
    const order = zones.map((z) => z.id).sort(() => rand() - 0.5).slice(0, cfg.naturalAvalanches);
    order.forEach((zid, i) => {
      const frac = 0.22 + (0.66 * (i + 0.5 + (rand() - 0.5) * 0.6)) / cfg.naturalAvalanches;
      zones[zid].at = frac * cfg.duration;
    });

    this.shift = {
      cfg, mountain, rand, startAt: t0, elapsed: -5, earned: 0, penalties: 0,
      patients: [], sleds, charges: [], zones, slides: [],
      nextCallAt: cfg.firstCallAt, delivered: 0, airlifted: 0, controlled: 0,
    };
    for (const p of this.players.values()) {
      p.stats = emptyStats();
      p.charges = CHARGES_PER_REFILL;
      p.buried = null;
      p.st = null;
    }
    this.phase = 'playing';
    this.broadcast({
      t: 'start', seed: this.run.seed, day: this.run.day, cfg, startAt: t0, upgrades: this.run.upgrades,
      sleds, mountainName: this.mountainName(), money: this.run.money,
    });
    this.broadcastLobby();
  }

  mountainName() { return mountainName(this.run.seed); }

  spawnPatient(sh, fixed) {
    const m = sh.mountain;
    let spot = fixed;
    if (!spot) {
      const active = sh.patients.filter((p) => p.state === 'waiting' || p.state === 'buried');
      const playersPos = [...this.players.values()].filter((p) => p.st).map((p) => p.st.p);
      for (let tries = 0; tries < 40; tries++) {
        const s = m.spots[Math.floor(sh.rand() * m.spots.length)];
        if (active.some((a) => Math.hypot(a.x - s.x, a.z - s.z) < 70)) continue;
        if (playersPos.some((pp) => Math.hypot(pp[0] - s.x, pp[2] - s.z) < 35)) continue;
        spot = s;
        break;
      }
    }
    if (!spot) return null;
    const type = spot.kind === 'buried' ? 'buried' : spot.kind;
    const taken = new Set(sh.patients.filter((p) => p.state !== 'delivered' && p.state !== 'airlifted').map((p) => p.name));
    const free = TOURIST_NAMES.filter((n) => !taken.has(n));
    const pool = free.length ? free : TOURIST_NAMES;
    const pt = {
      id: this.nextEntityId++, type,
      name: pool[Math.floor(sh.rand() * pool.length)],
      line: PATIENT_LINES[Math.floor(sh.rand() * PATIENT_LINES.length)],
      x: spot.x, y: m.heightAt(spot.x, spot.z), z: spot.z,
      condition: 100, state: type === 'buried' ? 'buried' : 'waiting', freed: false, progress: 0, sled: null,
      look: Math.floor(sh.rand() * 1000),
    };
    sh.patients.push(pt);
    return pt;
  }

  releaseZone(sh, zone, controlled) {
    if (zone.released) return;
    zone.released = true;
    zone.controlled = controlled;
    zone.t0 = now();
    sh.slides.push({ zone, t0: zone.t0, done: false, spawnedVictim: false });
    const a = sh.mountain.avalanches[zone.id];
    this.event({ k: 'avalanche', zone: zone.id, t0: zone.t0, controlled });
    if (controlled) {
      sh.controlled++;
      sh.earned += 30;
      this.toast(`Controlled release on ${a.name}! +$30`, 'good');
    } else {
      this.toast(`AVALANCHE on ${a.name}!`, 'alert');
    }
  }

  tick() {
    const sh = this.shift;
    const t = now();
    if (this.phase === 'playing' && sh) {
      const dt = 1 / TICK_RATE;
      sh.elapsed = t - sh.startAt;
      if (sh.elapsed >= 0) this.simulate(sh, dt, t);
      if (sh.elapsed >= sh.cfg.duration) this.endShift();
      if (t - this.lastSnap >= 1 / SNAP_RATE - 0.001) {
        this.lastSnap = t;
        this.broadcast(this.snapshot(sh, t));
      }
    }
  }

  simulate(sh, dt, t) {
    const cfg = sh.cfg;
    const m = sh.mountain;
    // ---- emergency calls
    const active = sh.patients.filter((p) => p.state === 'waiting' || p.state === 'buried' || p.state === 'sled');
    if (sh.elapsed >= sh.nextCallAt && sh.elapsed < cfg.duration - 25) {
      if (active.length < cfg.maxActiveCalls) {
        const pt = this.spawnPatient(sh);
        if (pt) this.event({ k: 'call', id: pt.id, type: pt.type, name: pt.name, line: pt.line, x: pt.x, z: pt.z });
      }
      sh.nextCallAt = sh.elapsed + cfg.callInterval * (0.75 + sh.rand() * 0.5);
    }
    // ---- patient condition
    const waitDecay = cfg.decayWaiting * (this.run.upgrades.thermos ? 0.6 : 1);
    for (const pt of sh.patients) {
      if (pt.state === 'waiting') pt.condition -= waitDecay * dt;
      else if (pt.state === 'buried') pt.condition -= waitDecay * 1.5 * dt;
      else if (pt.state === 'sled') pt.condition -= 0.1 * dt;
      else continue;
      if (pt.state === 'sled') {
        const s = sh.sleds.find((x) => x.id === pt.sled);
        if (s) {
          pt.x = s.x; pt.y = s.y; pt.z = s.z;
          if (Math.hypot(s.x - m.sites.clinic.x, s.z - m.sites.clinic.z) < m.sites.clinicRadius) {
            const reward = Math.round(40 + Math.max(0, pt.condition) * 0.6);
            sh.earned += reward;
            sh.delivered++;
            pt.state = 'delivered';
            s.patient = null;
            const owner = this.players.get(s.owner);
            if (owner) { owner.stats.rescues++; owner.stats.conditionSum += pt.condition; }
            this.event({ k: 'delivered', id: pt.id, reward, by: s.owner, name: pt.name, condition: Math.round(pt.condition) });
            continue;
          }
        }
      }
      if (pt.condition <= 0) {
        pt.condition = 0;
        if (pt.sled) { const s = sh.sleds.find((x) => x.id === pt.sled); if (s) s.patient = null; }
        pt.state = 'airlifted';
        sh.airlifted++;
        this.event({ k: 'airlift', id: pt.id, name: pt.name, x: pt.x, y: pt.y, z: pt.z });
        this.toast(`${pt.name} had to be airlifted. Too slow!`, 'bad');
      }
    }
    // ---- natural avalanches
    for (const z of sh.zones) {
      if (z.released || z.at === null) continue;
      if (!z.warned && sh.elapsed >= z.at - 8) {
        z.warned = true;
        this.event({ k: 'avalancheWarn', zone: z.id, in: 8 });
        this.toast(`Cornice cracking on ${m.avalanches[z.id].name}... clear the area!`, 'alert');
      }
      if (sh.elapsed >= z.at) this.releaseZone(sh, z, false);
    }
    // ---- slides bury waiting patients
    for (const sl of sh.slides) {
      if (sl.done) continue;
      const a = m.avalanches[sl.zone.id];
      const front = avalancheFront(t - sl.t0);
      for (const pt of sh.patients) {
        if (pt.state !== 'waiting' || sl.zone.buriedCheck.has(pt.id)) continue;
        const r = distToPolyline(a.path, pt.x, pt.z);
        if (r.dist < a.width * 0.5 && r.along < front && r.along > front - 40) {
          sl.zone.buriedCheck.add(pt.id);
          pt.state = 'buried'; pt.freed = false; pt.progress = 0; pt.type = 'buried';
          this.event({ k: 'patientBuried', id: pt.id });
        }
      }
      if (!sl.spawnedVictim && !sl.zone.controlled && front > a.length * 0.6) {
        sl.spawnedVictim = true;
        const along = a.length * (0.55 + sh.rand() * 0.35);
        const pa = pointAlong(a.path, along);
        const off = (sh.rand() - 0.5) * a.width * 0.5;
        const pt = this.spawnPatient(sh, { x: pa.x - pa.dz * off, z: pa.z + pa.dx * off, kind: 'buried' });
        if (pt) this.event({ k: 'call', id: pt.id, type: 'buried', name: pt.name, line: pt.line, x: pt.x, z: pt.z });
      }
      if (front > a.length + 40) sl.done = true;
    }
    // ---- charges
    for (const c of sh.charges) {
      if (!c.landed) {
        c.vy -= 20 * dt;
        c.x += c.vx * dt; c.y += c.vy * dt; c.z += c.vz * dt;
        const g = m.heightAt(c.x, c.z);
        if (c.y <= g + 0.15) { c.y = g + 0.15; c.landed = true; }
      }
      c.fuse -= dt;
      if (c.fuse <= 0) {
        c.dead = true;
        this.event({ k: 'boom', x: c.x, y: c.y, z: c.z, by: c.owner });
        for (const z of sh.zones) {
          if (z.released) continue;
          const a = m.avalanches[z.id];
          const d = Math.hypot(c.x - a.release.x, c.z - a.release.z);
          if (d < 34) this.releaseZone(sh, z, true);
        }
      }
    }
    sh.charges = sh.charges.filter((c) => !c.dead);
    // ---- buried players run out of air
    for (const p of this.players.values()) {
      if (!p.buried) continue;
      p.buried.air -= dt;
      if (p.buried.air <= 0) {
        p.buried = null;
        sh.penalties += 20;
        this.event({ k: 'evac', id: p.id });
        this.toast(`${p.name} was flown out by helicopter (-$20)`, 'bad');
      }
    }
  }

  dangerLevel(sh) {
    const unreleased = sh.zones.filter((z) => !z.released).length;
    const f = Math.max(0, sh.elapsed) / sh.cfg.duration;
    return Math.max(1, Math.min(5, Math.round(0.6 + f * 3.6 + unreleased * 0.15 - sh.controlled * 0.6)));
  }

  snapshot(sh, t) {
    return {
      t: 'snap', st: t, el: r2(sh.elapsed),
      earned: sh.earned - sh.penalties, danger: this.dangerLevel(sh),
      pl: [...this.players.values()].filter((p) => p.st).map((p) => ({
        id: p.id, p: p.st.p, yaw: p.st.yaw, a: p.st.a, sp: p.st.sp,
        b: p.buried ? [r2(p.buried.x), r2(p.buried.y), r2(p.buried.z), Math.round(p.buried.air), r2(p.buried.progress)] : null,
      })),
      pt: sh.patients.filter((p) => p.state !== 'delivered' && p.state !== 'airlifted').map((p) => ({
        id: p.id, ty: p.type, n: p.name, x: r2(p.x), y: r2(p.y), z: r2(p.z), c: Math.round(p.condition), s: p.state, f: p.freed, pr: r2(p.progress), sl: p.sled, lk: p.look,
      })),
      sl: sh.sleds.map((s) => ({ id: s.id, p: [r2(s.x), r2(s.y), r2(s.z)], yaw: r2(s.yaw), o: s.owner, pt: s.patient, tip: s.tip })),
      ch: sh.charges.map((c) => ({ id: c.id, p: [r2(c.x), r2(c.y), r2(c.z)], f: r2(c.fuse) })),
    };
  }

  endShift() {
    const sh = this.shift;
    const earned = sh.earned - sh.penalties;
    const passed = earned >= sh.cfg.quota;
    this.run.money += Math.max(0, earned);
    const players = [...this.players.values()];
    // awards: give each player the stat where they lead the team by the biggest margin
    const awards = {};
    const taken = new Set();
    const scored = [];
    for (const aw of AWARDS) {
      for (const p of players) {
        const v = p.stats[aw.key];
        if (!v) continue;
        const others = players.filter((o) => o !== p).map((o) => o.stats[aw.key]);
        const best = others.length ? Math.max(...others) : 0;
        scored.push({ aw, p, score: (v - best) / Math.max(1, v) + (v > best ? 1 : 0) });
      }
    }
    scored.sort((a, b) => b.score - a.score);
    for (const s of scored) {
      if (awards[s.p.id] || taken.has(s.aw.key)) continue;
      awards[s.p.id] = { title: s.aw.title, desc: s.aw.desc };
      taken.add(s.aw.key);
    }
    for (const p of players) if (!awards[p.id]) awards[p.id] = { title: 'Lift Line Legend', desc: 'Showed up. Respect.' };
    this.lastResults = {
      t: 'results', day: this.run.day, earned, quota: sh.cfg.quota, passed, delivered: sh.delivered, airlifted: sh.airlifted,
      controlled: sh.controlled, penalties: sh.penalties, money: this.run.money,
      players: players.map((p) => ({ id: p.id, name: p.name, color: p.color, hat: p.hat, stats: p.stats, award: awards[p.id] })),
    };
    this.phase = 'results';
    this.broadcast(this.lastResults);
    this.broadcastLobby();
  }
}
