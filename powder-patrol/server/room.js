import { generateMountain, distToPolyline, avalancheFront, pointAlong, mountainName } from '../shared/mountain.js';
import { mulberry32, hashString, dailySeedString } from '../shared/rng.js';
import {
  MAX_PLAYERS, TICK_RATE, SNAP_RATE, COUNTDOWN, JACKET_COLORS, HATS, CHARACTERS, SHOP_ITEMS, shiftConfig, emptyStats,
  AWARDS, PATIENT_LINES, TOURIST_NAMES, AIR_SUPPLY, DIG_TIME, CHARGE_FUSE, CHARGES_PER_REFILL, PATIENT_TYPES, VEHICLE_TYPES,
  INJURIES, INJURY_POOL, AID_STEPS, RESCUE,
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
    const slots = new Set([...this.players.values()].map((o) => o.slot));
    const p = {
      id, ws,
      slot: [0, 1, 2, 3].find((i) => !slots.has(i)) ?? 0,
      name: clampStr(profile?.name || 'Patroller', 16) || 'Patroller',
      color,
      hat: HATS.includes(profile?.hat) ? profile.hat : 'beanie',
      char: CHARACTERS.includes(profile?.char) ? profile.char : CHARACTERS[this.players.size % CHARACTERS.length],
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
      for (const s of this.shift.sleds) {
        if (s.owner === id) s.owner = null;
        if (s.rear === id) s.rear = null;
      }
      for (const pt of this.shift.patients) if (pt.ack === id) pt.ack = null;
      for (const v of this.shift.vehicles) {
        const i = v.seats.indexOf(id);
        if (i >= 0) { v.seats[i] = null; this.event({ k: 'veh', id: v.id, seats: v.seats }); }
      }
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
      players: [...this.players.values()].map((p) => ({ id: p.id, slot: p.slot, name: p.name, color: p.color, hat: p.hat, char: p.char, ready: p.ready })),
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
        if (CHARACTERS.includes(msg.char)) p.char = msg.char;
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
        if (msg.veh && typeof msg.veh === 'object') {
          const v = sh.vehicles.find((x) => x.id === msg.veh.id);
          if (v && v.seats[0] === p.id && Array.isArray(msg.veh.p) && msg.veh.p.every(Number.isFinite) && Array.isArray(msg.veh.r)) {
            v.x = msg.veh.p[0]; v.y = msg.veh.p[1]; v.z = msg.veh.p[2];
            v.yaw = +msg.veh.r[0] || 0; v.pitch = +msg.veh.r[1] || 0; v.roll = +msg.veh.r[2] || 0;
            v.sp = +msg.veh.sp || 0; v.horn = !!msg.veh.horn; v.siren = !!msg.veh.sir;
          }
        }
        break;
      }
      case 'enterVeh': {
        if (!p.st || sh.vehicles.some((v) => v.seats.includes(p.id))) return;
        const v = sh.vehicles.find((x) => x.id === msg.id);
        if (!v) return;
        if (Math.hypot(v.x - p.st.p[0], v.z - p.st.p[2]) > 6) return;
        let seat = Number.isInteger(msg.seat) && v.seats[msg.seat] === null ? msg.seat : v.seats.indexOf(null);
        if (seat < 0) return;
        v.seats[seat] = p.id;
        this.event({ k: 'veh', id: v.id, seats: v.seats });
        break;
      }
      case 'exitVeh': {
        const v = sh.vehicles.find((x) => x.seats.includes(p.id));
        if (!v) return;
        v.seats[v.seats.indexOf(p.id)] = null;
        this.event({ k: 'veh', id: v.id, seats: v.seats });
        break;
      }
      case 'vehCrash': {
        const v = sh.vehicles.find((x) => x.seats[0] === p.id);
        if (!v) return;
        const riders = v.seats.filter((x) => x !== null);
        v.seats = v.seats.map(() => null);
        for (const r of riders) { const pl = this.players.get(r); if (pl) pl.stats.crashes++; }
        this.event({ k: 'vehEject', id: v.id, riders, v: [+msg.vx || 0, +msg.vy || 0, +msg.vz || 0] });
        this.event({ k: 'veh', id: v.id, seats: v.seats });
        if (riders.length > 1) this.toast(`${p.name} crashed the ${VEHICLE_TYPES[v.type].label} with everyone on board!`, 'crash');
        break;
      }
      case 'loadAmbulance': {
        // move the patient from my toboggan into a rescue truck parked next to me
        const s = sh.sleds.find((x) => x.owner === p.id);
        const v = sh.vehicles.find((x) => x.id === msg.id && VEHICLE_TYPES[x.type].ambulance);
        if (!s || !v || s.patient === null || v.cargo) return;
        if (Math.hypot(v.x - s.x, v.z - s.z) > 8) return;
        const pt = sh.patients.find((x) => x.id === s.patient);
        if (!pt) return;
        s.patient = null;
        pt.state = 'veh'; pt.sled = null; pt.veh = v.id;
        v.cargo = pt.id;
        this.event({ k: 'ambulance', id: pt.id, veh: v.id, by: p.id });
        break;
      }
      case 'injureTourist': {
        if (!Array.isArray(msg.p) || !msg.p.every(Number.isFinite)) return;
        const active = sh.patients.filter((x) => x.state === 'waiting' || x.state === 'buried').length;
        if (active >= sh.cfg.maxActiveCalls + 2) return;
        const pt = this.spawnPatient(sh, { x: msg.p[0], z: msg.p[2], kind: 'injured' });
        if (pt) {
          sh.penalties += 10;
          pt.line = 'You ran me OVER!';
          pt.ack = p.id; // you broke it, you fix it
          this.callEvent(pt);
          this.toast(`${p.name} flattened a tourist (-$10). Rescue them!`, 'crash');
        }
        break;
      }
      case 'ack': {
        // acknowledge a dispatch call over the radio ("übernehmen")
        const pt = sh.patients.find((x) => x.id === msg.id);
        if (!pt || pt.ack !== null || !this.isActive(pt)) return;
        pt.ack = p.id;
        p.stats.acks++;
        const quick = sh.elapsed - pt.callAt < 20;
        if (quick) sh.earned += RESCUE.ackBonus;
        this.event({ k: 'ack', id: pt.id, by: p.id, slot: p.slot, bonus: quick ? RESCUE.ackBonus : 0 });
        break;
      }
      case 'secure': {
        // crossed skis ~10 m uphill of the accident site
        const pt = sh.patients.find((x) => x.id === msg.id);
        if (!pt || pt.secured || pt.state !== 'waiting' || !p.st) return;
        if (Math.hypot(pt.x - p.st.p[0], pt.z - p.st.p[2]) > 7) return;
        const n = m.normalAt(pt.x, pt.z);
        const hl = Math.hypot(n.x, n.z) || 1;
        const ux = -n.x / hl, uz = -n.z / hl; // uphill
        const sx = pt.x + ux * 10, sz = pt.z + uz * 10;
        pt.secured = { x: r2(sx), z: r2(sz) };
        p.stats.secures++;
        sh.earned += RESCUE.secureBonus;
        pt.log.secured = true;
        this.event({ k: 'secured', id: pt.id, x: pt.secured.x, z: pt.secured.z, by: p.id });
        break;
      }
      case 'treat': {
        const pt = sh.patients.find((x) => x.id === msg.id);
        if (!pt || pt.state !== 'waiting' || !pt.out || pt.freed || !p.st) return;
        if (Math.hypot(pt.x - p.st.p[0], pt.z - p.st.p[2]) > 4.5) return;
        const steps = INJURIES[pt.inj].steps;
        const want = steps[pt.step];
        const step = AID_STEPS[msg.step] ? msg.step : null;
        if (!step) return;
        // the client plays the action for AID_STEPS[step].time; don't accept faster than that
        if (sh.elapsed - pt.lastStepAt < AID_STEPS[step].time * 0.6) return;
        pt.lastStepAt = sh.elapsed;
        if (step === want) {
          pt.step++;
          pt.condition = Math.min(100, pt.condition + 3);
          if (step === 'warm' || step === 'heatPack') pt.wrapped = true;
          if (step === 'mattress') pt.mattress = true;
          p.stats.treats++;
          pt.log.helpers.add(p.name);
          const done = pt.step >= steps.length;
          this.event({ k: 'treated', id: pt.id, step, by: p.id, n: pt.step, done });
          if (done) {
            pt.freed = true;
            this.event({ k: 'freed', id: pt.id, by: p.id, line: pt.line, inj: pt.inj });
          }
        } else {
          pt.condition = Math.max(1, pt.condition - (AID_STEPS[step].trap ? 7 : 4));
          pt.log.wrong++;
          this.event({ k: 'treatWrong', id: pt.id, step, want, by: p.id });
        }
        break;
      }
      case 'probe': {
        if (!Array.isArray(msg.p) || msg.p.length !== 2 || !msg.p.every(Number.isFinite) || !p.st) return;
        if (now() - (p.lastProbe || 0) < 0.3) return;
        p.lastProbe = now();
        const [x, z] = msg.p;
        if (Math.hypot(x - p.st.p[0], z - p.st.p[2]) > 3) return;
        p.stats.probes++;
        const pt = sh.patients.find((q) => q.state === 'buried' && !q.probed && Math.hypot(q.x - x, q.z - z) <= RESCUE.probeHitRadius);
        if (pt) {
          pt.probed = true;
          this.event({ k: 'probeHit', id: pt.id, x: r2(x), z: r2(z), depth: pt.depth, by: p.id });
        } else {
          this.event({ k: 'probeMiss', x: r2(x), z: r2(z), by: p.id });
        }
        break;
      }
      case 'heli': {
        // request the rescue helicopter for a patient
        const pt = sh.patients.find((x) => x.id === msg.id);
        if (!pt || pt.state !== 'waiting' || !pt.out || !p.st || pt.heli) return;
        if (Math.hypot(pt.x - p.st.p[0], pt.z - p.st.p[2]) > 40) return;
        if (sh.heli) { this.send(p, { t: 'ev', k: 'heliBusy' }); return; }
        const reason = this.heliGrounded(sh);
        if (reason) { this.event({ k: 'heliNo', id: pt.id, by: p.id, reason }); return; }
        const C = m.sites.clinic;
        const sx = C.x - 420, sz = C.z + 160;
        sh.heli = {
          state: 'inbound', t: 0, eta: RESCUE.heliEta, pt: pt.id, lz: null, marshal: null, by: p.id,
          x: sx, y: m.heightAt(sx, sz) + 140, z: sz, yaw: 0, sx, sy: m.heightAt(sx, sz) + 140, sz, circleA: 0, nag: 0, carry: 0,
        };
        pt.heli = true;
        this.event({ k: 'heli', state: 'inbound', id: pt.id, by: p.id, eta: RESCUE.heliEta, needed: !!INJURIES[pt.inj].heli });
        break;
      }
      case 'lz': {
        // mark and marshal the helicopter landing zone where I stand
        const h = sh.heli;
        if (!h || !p.st || (h.state !== 'inbound' && h.state !== 'circling') || h.lz) return;
        const pt = sh.patients.find((x) => x.id === h.pt);
        const [x, , z] = p.st.p;
        const bad = this.lzProblem(sh, x, z, pt);
        if (bad) { this.send(p, { t: 'ev', k: 'lzBad', reason: bad }); return; }
        h.lz = { x: r2(x), y: r2(m.heightAt(x, z)), z: r2(z) };
        h.marshal = p.id;
        this.event({ k: 'lz', x: h.lz.x, y: h.lz.y, z: h.lz.z, by: p.id });
        break;
      }
      case 'rear': {
        // second rescuer takes the rear rope of someone else's akja
        if (sh.sleds.some((s) => s.owner === p.id || s.rear === p.id) || !p.st) return;
        const s = sh.sleds.find((x) => x.id === msg.id);
        if (!s || s.owner === null || s.owner === p.id || s.rear !== null) return;
        if (Math.hypot(s.x - p.st.p[0], s.z - p.st.p[2]) > 6) return;
        s.rear = p.id;
        this.event({ k: 'sledRear', id: s.id, rear: p.id });
        break;
      }
      case 'rearOff': {
        const s = sh.sleds.find((x) => x.rear === p.id);
        if (!s) return;
        s.rear = null;
        this.event({ k: 'sledRear', id: s.id, rear: null });
        break;
      }
      case 'sweepNpc': {
        const g = sh.stragglers.find((x) => x.id === msg.id);
        if (!g || g.done || !p.st) return;
        if (Math.hypot(g.x - p.st.p[0], g.z - p.st.p[2]) > 12) return;
        g.done = true;
        p.stats.sweeps++;
        sh.earned += RESCUE.sweepBonus;
        this.event({ k: 'swept', id: g.id, by: p.id, bonus: RESCUE.sweepBonus });
        break;
      }
      case 'grabSled': {
        if (sh.sleds.some((s) => s.owner === p.id || s.rear === p.id)) return;
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
        if (s.rear !== null) { s.rear = null; this.event({ k: 'sledRear', id: s.id, rear: null }); }
        break;
      }
      case 'work': {
        // hold-to-interact progress, shared so several players dig faster together
        const dt = Math.min(+msg.dt || 0, 0.35);
        if (!(dt > 0) || !p.st) return;
        if (msg.kind === 'patient') {
          const pt = sh.patients.find((x) => x.id === msg.id);
          if (!pt || pt.out || (pt.state !== 'waiting' && pt.state !== 'buried')) return;
          if (pt.state === 'buried' && !pt.probed) return; // probe first, then dig
          if (Math.hypot(pt.x - p.st.p[0], pt.z - p.st.p[2]) > 4) return;
          pt.progress += dt;
          pt.log.helpers.add(p.name);
          if (pt.progress >= this.workNeed(pt)) {
            pt.out = true;
            if (pt.state === 'buried') { pt.state = 'waiting'; p.stats.digs++; }
            this.event({ k: 'extracted', id: pt.id, by: p.id, inj: pt.inj });
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
        s.tripT = 0; s.assistT = 0;
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

  isActive(pt) { return pt.state === 'waiting' || pt.state === 'buried' || pt.state === 'sled' || pt.state === 'veh'; }

  // seconds of shovelling / pulling needed to get a patient out
  workNeed(pt) {
    if (pt.state === 'buried') return DIG_TIME * (0.55 + pt.depth * 0.6);
    return PATIENT_TYPES[pt.type].time;
  }

  // null if the helicopter can fly, else the reason
  heliGrounded(sh) {
    if (this.dangerLevel(sh) >= 4) return 'weather';
    if (sh.elapsed > sh.cfg.duration * 0.94) return 'dark';
    return null;
  }

  // null if (x, z) is a usable landing zone for the patient, else the reason
  lzProblem(sh, x, z, pt) {
    const m = sh.mountain;
    if (pt && Math.hypot(pt.x - x, pt.z - z) > RESCUE.lzMaxDist) return 'far';
    const n = m.normalAt(x, z);
    if (Math.hypot(n.x, n.z) / Math.max(0.01, n.y) > RESCUE.lzMaxSlope) return 'steep';
    for (const c of m.collidersNear(x, z)) if (Math.hypot(c.x - x, c.z - z) < RESCUE.lzClear + c.r) return 'obstacles';
    for (const v of sh.vehicles) if (Math.hypot(v.x - x, v.z - z) < RESCUE.lzClear * 0.6) return 'obstacles';
    return null;
  }

  // where is it? (for the dispatch message)
  placeOf(sh, x, z, buried) {
    const m = sh.mountain;
    if (buried) {
      let best = null, bd = Infinity;
      for (const a of m.avalanches) { const d = distToPolyline(a.path, x, z).dist; if (d < bd) { bd = d; best = a; } }
      if (best && bd < 60) return { kind: 'slide', name: best.name };
    }
    const pm = m.pisteMaskAt(x, z);
    const piste = m.pistes[pm.piste];
    return { kind: pm.edge < 4 ? 'piste' : 'off', name: piste ? piste.name : '' };
  }

  callEvent(pt, repeat = false, folge = false) {
    const sh = this.shift;
    this.event({
      k: 'call', id: pt.id, type: pt.type, inj: pt.inj, name: pt.name, line: pt.line, x: pt.x, z: pt.z,
      where: this.placeOf(sh, pt.x, pt.z, pt.type === 'buried'), repeat, folge,
    });
  }

  // an unsecured accident site on a piste with rescuers bunched around it can cause a second crash
  maybeFolgeunfall(sh, pt, dt) {
    if (pt.type !== 'injured' || !pt.onPiste || pt.secured || pt.folge || pt.freed) return;
    let near = false;
    for (const p of this.players.values()) if (p.st && Math.hypot(p.st.p[0] - pt.x, p.st.p[2] - pt.z) < 12) near = true;
    if (!near || sh.rand() > 0.02 * dt) return;
    pt.folge = true;
    const activeN = sh.patients.filter((x) => x.state === 'waiting' || x.state === 'buried').length;
    if (activeN >= sh.cfg.maxActiveCalls + 2) return;
    const n = sh.mountain.normalAt(pt.x, pt.z);
    const hl = Math.hypot(n.x, n.z) || 1;
    const side = sh.rand() < 0.5 ? -1 : 1;
    const x = pt.x + (n.x / hl) * 4 - (n.z / hl) * 2.5 * side, z = pt.z + (n.z / hl) * 4 + (n.x / hl) * 2.5 * side;
    const np = this.spawnPatient(sh, { x, z, kind: 'injured', inj: ['knee', 'wrist', 'shoulder'][Math.floor(sh.rand() * 3)], folge: true });
    if (np) {
      np.onPiste = false; // no chain reactions
      np.folge = true;
      pt.log.folge = true;
      this.callEvent(np, false, true);
    }
  }

  // ---------------------------------------------------------------- rescue helicopter (RTH)
  heliEvent(sh, state, extra = {}) {
    const h = sh.heli;
    this.event({ k: 'heli', state, id: h?.pt ?? null, ...extra });
  }

  heliLeave(sh, why) {
    const h = sh.heli;
    if (!h || h.state === 'leaving') return;
    const pt = sh.patients.find((x) => x.id === h.pt);
    if (pt && pt.state !== 'heli') pt.heli = false;
    if (why === 'timeout') sh.penalties += 15;
    h.state = 'leaving'; h.t = 0; h.why = why;
    this.heliEvent(sh, 'leaving', { why });
  }

  simHeli(sh, dt) {
    const h = sh.heli, m = sh.mountain;
    h.t += dt;
    const pt = sh.patients.find((x) => x.id === h.pt);
    const moveTo = (x, y, z, speed) => {
      const dx = x - h.x, dy = y - h.y, dz = z - h.z;
      const d = Math.hypot(dx, dy, dz);
      const st = Math.min(d, speed * dt);
      if (d > 0.01) { h.x += (dx / d) * st; h.y += (dy / d) * st; h.z += (dz / d) * st; }
      if (Math.hypot(dx, dz) > 3) h.yaw += Math.atan2(Math.sin(Math.atan2(dx, dz) - h.yaw), Math.cos(Math.atan2(dx, dz) - h.yaw)) * Math.min(1, dt * 2);
      return d;
    };
    const keepAbove = (clear) => { h.y = Math.max(h.y, m.heightAt(h.x, h.z) + clear); };
    // the marshal has to stay at the landing zone
    if (h.lz && (h.state === 'inbound' || h.state === 'circling' || h.state === 'landing')) {
      const mp = this.players.get(h.marshal);
      if (!mp || !mp.st || Math.hypot(mp.st.p[0] - h.lz.x, mp.st.p[2] - h.lz.z) > 25) {
        h.lz = null; h.marshal = null;
        if (h.state === 'landing') { h.state = 'circling'; h.t = 0; h.nag = 0; }
        this.event({ k: 'lzLost' });
      }
    }
    switch (h.state) {
      case 'inbound': {
        h.eta = Math.max(0, h.eta - dt);
        if (!pt || !this.isActive(pt)) { this.heliLeave(sh, 'abort'); break; }
        const tg = h.lz || { x: pt.x, y: m.heightAt(pt.x, pt.z), z: pt.z };
        const d = Math.hypot(tg.x - h.x, tg.z - h.z);
        moveTo(tg.x, tg.y + 45, tg.z, Math.max(25, d / Math.max(0.6, h.eta)));
        keepAbove(30);
        if (h.eta <= 0 && d < 30) {
          if (h.lz) { h.state = 'landing'; h.t = 0; this.heliEvent(sh, 'landing'); }
          else { h.state = 'circling'; h.t = 0; h.nag = 0; }
        }
        break;
      }
      case 'circling': {
        if (!pt || !this.isActive(pt)) { this.heliLeave(sh, 'abort'); break; }
        if (h.lz) { h.state = 'landing'; h.t = 0; this.heliEvent(sh, 'landing'); break; }
        h.circleA += dt * 0.45;
        const cy = m.heightAt(pt.x, pt.z) + 42;
        moveTo(pt.x + Math.cos(h.circleA) * 55, cy, pt.z + Math.sin(h.circleA) * 55, 30);
        keepAbove(25);
        h.nag -= dt;
        if (h.nag <= 0) { h.nag = 14; this.heliEvent(sh, 'circling'); }
        if (h.t > 60) this.heliLeave(sh, 'timeout');
        break;
      }
      case 'landing': {
        const high = h.y - h.lz.y;
        const d = moveTo(h.lz.x, h.lz.y, h.lz.z, high > 14 ? 16 : 4.5);
        if (high > 6) keepAbove(4);
        if (d < 0.25) { h.x = h.lz.x; h.y = h.lz.y; h.z = h.lz.z; h.state = 'landed'; h.t = 0; h.carry = 0; this.heliEvent(sh, 'landed'); }
        break;
      }
      case 'landed': {
        if (!pt || !this.isActive(pt)) { this.heliLeave(sh, 'abort'); break; }
        let board = false;
        if (pt.state === 'sled') {
          const s = sh.sleds.find((x) => x.id === pt.sled);
          if (s && Math.hypot(s.x - h.x, s.z - h.z) < 12) { s.patient = null; s.tripT = 0; s.assistT = 0; board = true; this.event({ k: 'heliBoard', id: pt.id, sled: s.id }); }
        } else if (pt.state === 'waiting' && pt.freed && Math.hypot(pt.x - h.x, pt.z - h.z) < 30) {
          // the crew walks over with their stretcher
          h.carry += dt;
          if (h.carry > 6) { board = true; this.event({ k: 'heliBoard', id: pt.id, sled: null }); }
        }
        if (board) {
          pt.state = 'heli'; pt.sled = null;
          h.state = 'boarding'; h.t = 0;
        } else if (h.t > RESCUE.heliWait) this.heliLeave(sh, 'timeout');
        break;
      }
      case 'boarding': {
        if (h.t > 3 && pt) {
          const needed = !!INJURIES[pt.inj].heli;
          this.handover(sh, pt, 'rth', needed ? 90 + Math.max(0, pt.condition) * 0.7 : 25 + Math.max(0, pt.condition) * 0.4, h.marshal ?? h.by);
          h.state = 'leaving'; h.t = 0; h.why = 'done';
          this.heliEvent(sh, 'leaving', { why: 'done', needed });
        }
        break;
      }
      case 'leaving': {
        if (h.t < 4) { h.y += dt * 6; }
        else { moveTo(h.sx, h.sy, h.sz, 45); keepAbove(30); }
        if (h.t > 16) { sh.heli = null; this.event({ k: 'heli', state: 'gone', id: null }); }
        break;
      }
    }
  }

  // ---------------------------------------------------------------- closing sweep
  startSweep(sh) {
    sh.sweep = true;
    const m = sh.mountain;
    const n = 2 + Math.min(2, this.players.size);
    const taken = new Set(sh.patients.map((p) => p.name));
    for (let i = 0; i < n; i++) {
      const piste = m.pistes[i % m.pistes.length];
      const pa = pointAlong(piste.points, piste.length * (0.2 + sh.rand() * 0.6));
      const off = (sh.rand() - 0.5) * piste.width * 0.6;
      const x = pa.x - pa.dz * off, z = pa.z + pa.dx * off;
      const free = TOURIST_NAMES.filter((t) => !taken.has(t));
      const name = free[Math.floor(sh.rand() * free.length)] || 'Gast';
      taken.add(name);
      sh.stragglers.push({ id: this.nextEntityId++, x: r2(x), y: r2(m.heightAt(x, z)), z: r2(z), done: false, name, look: Math.floor(sh.rand() * 1000) });
    }
    this.event({ k: 'sweep', n });
  }

  // finish a patient: reward, stats, protocol line
  handover(sh, pt, transport, reward, creditId) {
    reward = Math.max(0, Math.round(reward));
    sh.earned += reward;
    sh.delivered++;
    pt.state = 'delivered';
    const who = this.players.get(creditId);
    if (who) { who.stats.rescues++; who.stats.conditionSum += pt.condition; }
    this.logPatient(sh, pt, transport);
    this.event({ k: 'delivered', id: pt.id, reward, by: creditId ?? null, name: pt.name, condition: Math.round(pt.condition), transport });
  }

  logPatient(sh, pt, transport) {
    sh.protocol.push({
      name: pt.name, inj: pt.inj, transport, condition: Math.round(Math.max(0, pt.condition)),
      steps: Math.min(pt.step, INJURIES[pt.inj].steps.length), total: INJURIES[pt.inj].steps.length, wrong: pt.log.wrong,
      secured: !!pt.log.secured, folge: !!pt.log.folge, mins: Math.max(1, Math.round(((sh.elapsed - pt.callAt) / sh.cfg.duration) * 450)),
      helpers: [...pt.log.helpers].slice(0, 4), callAt: Math.round(pt.callAt),
    });
  }

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
      sleds.push({ id: i + 1, x, y: mountain.heightAt(x, z), z, yaw: 0, owner: null, rear: null, patient: null, tip: false, assistT: 0, tripT: 0 });
    }
    // vehicles parked at the two patrol garages
    const vehicles = [];
    const park = (type, site, dx, dz, yaw) => {
      const x = site.x + dx, z = site.z + dz;
      vehicles.push({ id: vehicles.length + 1, type, x, y: mountain.heightAt(x, z), z, yaw, pitch: 0, roll: 0, sp: 0, seats: VEHICLE_TYPES[type].seats.map(() => null), cargo: null, horn: false, siren: false });
    };
    const T = mountain.sites.garageTop, B = mountain.sites.garageBase, P = mountain.sites.parking;
    park('snowmobile', T, -4, 0, 0.2); park('snowmobile', T, 0, 1, 0); park('quad', T, 4.5, 0, -0.2);
    park('snowmobile', B, -3, 1, Math.PI); park('quad', B, 2, 1, Math.PI);
    park('pickup', P, -4, 0, Math.PI * 0.9); park('truck', P, 5, 0, Math.PI * 1.1);
    // natural avalanche schedule
    const zones = mountain.avalanches.map((a) => ({ id: a.id, released: false, controlled: false, at: null, warned: false, t0: null, buriedCheck: new Set() }));
    const order = zones.map((z) => z.id).sort(() => rand() - 0.5).slice(0, cfg.naturalAvalanches);
    order.forEach((zid, i) => {
      const frac = 0.22 + (0.66 * (i + 0.5 + (rand() - 0.5) * 0.6)) / cfg.naturalAvalanches;
      zones[zid].at = frac * cfg.duration;
    });

    this.shift = {
      cfg, mountain, rand, startAt: t0, elapsed: -5, earned: 0, penalties: 0,
      patients: [], sleds, vehicles, charges: [], zones, slides: [],
      nextCallAt: cfg.firstCallAt, delivered: 0, airlifted: 0, controlled: 0,
      heli: null, protocol: [], stragglers: [], sweep: false, stragglersMissed: 0,
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
      sleds, vehicles, mountainName: this.mountainName(), money: this.run.money, forecast: this.dangerLevel(this.shift),
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
    let inj = type === 'buried' ? 'burial' : type === 'tree' ? 'hypo' : fixed?.inj;
    if (!inj) {
      const pool = this.run.day >= 3 ? [...INJURY_POOL, 'head', 'spine', 'lowerLeg'] : INJURY_POOL;
      inj = pool[Math.floor(sh.rand() * pool.length)];
    }
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
      inj, out: type === 'injured', step: 0, lastStepAt: -99, secured: null, probed: false,
      depth: type === 'buried' ? r2(0.6 + sh.rand() * 1.2) : 0, buriedAt: sh.elapsed, ack: null, callAt: Math.max(0, sh.elapsed),
      onPiste: type === 'injured' && m.pisteMaskAt(spot.x, spot.z).edge < 3, folge: false, heli: false, wrapped: false, mattress: false,
      repeated: false, log: { wrong: 0, secured: false, folge: !!fixed?.folge, helpers: new Set() },
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
    // ---- emergency calls (Leitstelle alarm)
    const active = sh.patients.filter((p) => p.state === 'waiting' || p.state === 'buried' || p.state === 'sled');
    if (sh.elapsed >= sh.nextCallAt && sh.elapsed < cfg.duration * RESCUE.sweepAt - 10) {
      if (active.length < cfg.maxActiveCalls) {
        const pt = this.spawnPatient(sh);
        if (pt) this.callEvent(pt);
      }
      sh.nextCallAt = sh.elapsed + cfg.callInterval * (0.75 + sh.rand() * 0.5);
    }
    // ---- patient condition, handovers
    const waitDecay = cfg.decayWaiting * (this.run.upgrades.thermos ? 0.6 : 1);
    const flyable = !this.heliGrounded(sh);
    for (const pt of sh.patients) {
      const I = INJURIES[pt.inj];
      if (pt.state === 'waiting') {
        // every first-aid measure stabilises the patient; a wrapped patient cools down slower
        const stab = pt.freed ? 0.35 : Math.max(0.4, 1 - 0.15 * pt.step);
        pt.condition -= waitDecay * stab * (pt.wrapped ? 0.8 : 1) * (0.8 + I.sev * 0.15) * dt;
        if (pt.ack === null && !pt.repeated && sh.elapsed - pt.callAt > 25) { pt.repeated = true; this.callEvent(pt, true); }
        this.maybeFolgeunfall(sh, pt, dt);
      } else if (pt.state === 'buried') {
        // survival curve: good first phase, then the "deadly bend"
        pt.condition -= (sh.elapsed - pt.buriedAt < RESCUE.buriedGrace ? 0.12 : 1.7) * dt;
        if (pt.ack === null && !pt.repeated && sh.elapsed - pt.callAt > 25) { pt.repeated = true; this.callEvent(pt, true); }
      } else if (pt.state === 'sled') pt.condition -= (I.heli && flyable ? 0.35 : 0.1) * dt; // bumpy ride for spine / head
      else if (pt.state === 'veh') pt.condition -= 0.05 * dt;
      else continue;
      if (pt.state === 'veh') {
        const v = sh.vehicles.find((x) => x.id === pt.veh);
        if (v) {
          pt.x = v.x; pt.y = v.y; pt.z = v.z;
          if (Math.hypot(v.x - m.sites.clinic.x, v.z - m.sites.clinic.z) < m.sites.clinicRadius + 6) {
            v.cargo = null;
            this.handover(sh, pt, 'rtw', 50 + Math.max(0, pt.condition) * 0.6, v.seats[0]);
            continue;
          }
        }
      }
      if (pt.state === 'sled') {
        const s = sh.sleds.find((x) => x.id === pt.sled);
        if (s) {
          pt.x = s.x; pt.y = s.y; pt.z = s.z;
          s.tripT += dt;
          const rear = s.rear !== null ? this.players.get(s.rear) : null;
          if (rear?.st && Math.hypot(rear.st.p[0] - s.x, rear.st.p[2] - s.z) < 10) s.assistT += dt;
          if (Math.hypot(s.x - m.sites.clinic.x, s.z - m.sites.clinic.z) < m.sites.clinicRadius) {
            const assisted = rear && s.assistT > s.tripT * 0.5;
            if (assisted) rear.stats.assists++;
            s.patient = null;
            s.tripT = 0; s.assistT = 0;
            this.handover(sh, pt, assisted ? 'akja2' : 'akja', 40 + Math.max(0, pt.condition) * 0.6 + (assisted ? RESCUE.assistBonus : 0), s.owner);
            continue;
          }
        }
      }
      if (pt.condition <= 0) {
        pt.condition = 0;
        if (pt.sled) { const s = sh.sleds.find((x) => x.id === pt.sled); if (s) s.patient = null; }
        if (pt.veh) { const v = sh.vehicles.find((x) => x.id === pt.veh); if (v) v.cargo = null; }
        if (sh.heli && sh.heli.pt === pt.id) this.heliLeave(sh, 'abort');
        pt.state = 'airlifted';
        sh.airlifted++;
        this.logPatient(sh, pt, 'airlift');
        this.event({ k: 'airlift', id: pt.id, name: pt.name, x: pt.x, y: pt.y, z: pt.z });
        this.toast(`${pt.name} had to be airlifted. Too slow!`, 'bad');
      }
    }
    // ---- rescue helicopter
    if (sh.heli) this.simHeli(sh, dt);
    // ---- closing sweep (Pistenschluss)
    if (!sh.sweep && sh.elapsed >= cfg.duration * RESCUE.sweepAt) this.startSweep(sh);
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
          if (pt.secured) pt.secured = null;
          pt.state = 'buried'; pt.freed = false; pt.progress = 0; pt.type = 'buried';
          pt.out = false; pt.probed = false; pt.inj = 'burial'; pt.step = 0; pt.wrapped = false; pt.mattress = false;
          pt.depth = r2(0.6 + sh.rand() * 1.2); pt.buriedAt = sh.elapsed;
          if (sh.heli && sh.heli.pt === pt.id) this.heliLeave(sh, 'abort');
          this.event({ k: 'patientBuried', id: pt.id });
        }
      }
      if (!sl.spawnedVictim && !sl.zone.controlled && front > a.length * 0.6) {
        sl.spawnedVictim = true;
        const along = a.length * (0.55 + sh.rand() * 0.35);
        const pa = pointAlong(a.path, along);
        const off = (sh.rand() - 0.5) * a.width * 0.5;
        const pt = this.spawnPatient(sh, { x: pa.x - pa.dz * off, z: pa.z + pa.dx * off, kind: 'buried' });
        if (pt) this.callEvent(pt);
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
        inj: p.inj, o: p.out, st: p.step, sec: p.secured ? [p.secured.x, p.secured.z] : null, pb: p.probed, dp: p.probed ? p.depth : null,
        ack: p.ack, wr: p.wrapped, mt: p.mattress, he: p.heli, need: r2(this.workNeed(p)),
        sv: p.state === 'buried' ? Math.round(Math.max(0, RESCUE.buriedGrace - (sh.elapsed - p.buriedAt))) : null,
      })),
      sl: sh.sleds.map((s) => ({ id: s.id, p: [r2(s.x), r2(s.y), r2(s.z)], yaw: r2(s.yaw), o: s.owner, r: s.rear, pt: s.patient, tip: s.tip })),
      he: sh.heli ? { s: sh.heli.state, p: [r2(sh.heli.x), r2(sh.heli.y), r2(sh.heli.z)], yaw: r2(sh.heli.yaw), lz: sh.heli.lz ? [sh.heli.lz.x, sh.heli.lz.y, sh.heli.lz.z] : null, pt: sh.heli.pt, eta: Math.ceil(sh.heli.eta), m: sh.heli.marshal } : null,
      sg: sh.stragglers.filter((g) => !g.done).map((g) => ({ id: g.id, x: g.x, y: g.y, z: g.z, n: g.name, lk: g.look })),
      ch: sh.charges.map((c) => ({ id: c.id, p: [r2(c.x), r2(c.y), r2(c.z)], f: r2(c.fuse) })),
      vh: sh.vehicles.map((v) => ({ id: v.id, ty: v.type, p: [r2(v.x), r2(v.y), r2(v.z)], r: [r2(v.yaw), r2(v.pitch), r2(v.roll)], s: v.seats, sp: r2(v.sp), c: v.cargo, h: v.horn, si: v.siren })),
    };
  }

  endShift() {
    const sh = this.shift;
    const missed = sh.stragglers.filter((g) => !g.done).length;
    sh.penalties += missed * RESCUE.stragglerPenalty;
    // patients still on the mountain go into the protocol as handed over to the night shift
    for (const pt of sh.patients) if (this.isActive(pt)) this.logPatient(sh, pt, 'open');
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
      controlled: sh.controlled, penalties: sh.penalties, money: this.run.money, protocol: sh.protocol, stragglersMissed: missed,
      stragglers: sh.stragglers.length,
      players: players.map((p) => ({ id: p.id, name: p.name, color: p.color, hat: p.hat, char: p.char, stats: p.stats, award: awards[p.id] })),
    };
    this.phase = 'results';
    this.broadcast(this.lastResults);
    this.broadcastLobby();
  }
}
