// Ambient guest skiers ("Pistengäste") that bring the slopes to life. Client-side only, not networked.
// Each NPC follows a path made of: lift-top exit -> piste centreline -> run-out to the lift loading mat.
// Along that path it carves S-turns inside the piste width, keeps clear of obstacles, slower skiers and
// secured accident sites (FIS rule 3: the skier behind chooses a line that does not endanger the one ahead),
// stops now and then at the side of the piste, and rides the lift back up (hidden) to start again.
import * as THREE from 'three';
import { Character } from './characters.js';
import { TOURISTS } from './assets.js';

const VIS_DIST = 220;           // beyond this NPCs are hidden and simulated cheaply
const NEAR_ALWAYS = 30;         // closer than this NPCs stay visible even outside the view frustum (shadows)
const JUMP_G = 20;              // same gravity as the patrollers' physics
const LEAN_G = 9.81;
const LIFT_RIDE = [22, 45];     // seconds an NPC stays "on the lift" before it reappears at the top
const MAX_BLOCK = 64;
const SITE_DETOUR = 11;      // how far beyond the piste edge NPCs may swing to pass a secured site

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
// scratch objects for the procedural stance (no per-frame allocations)
const _H = new THREE.Vector3(), _K = new THREE.Vector3(), _F = new THREE.Vector3(), _K2 = new THREE.Vector3();
const _u = new THREE.Vector3(), _w = new THREE.Vector3(), _d = new THREE.Vector3(), _e = new THREE.Vector3(), _fw = new THREE.Vector3();
const _p = new THREE.Vector3(), _sc = new THREE.Vector3();
const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _qp = new THREE.Quaternion(), _qt = new THREE.Quaternion();
const _qs = new THREE.Quaternion(), _qn = new THREE.Quaternion(), _qi = new THREE.Quaternion(), _qr = new THREE.Quaternion();
const _ax = new THREE.Vector3(), _nrm = { x: 0, y: 1, z: 0 };
const _legs = [
  { up: 'UpperLegL', lo: 'LowerLegL', ft: 'FootL', F0: new THREE.Vector3(), K0: new THREE.Vector3(), H0: new THREE.Vector3(), dy: 0 },
  { up: 'UpperLegR', lo: 'LowerLegR', ft: 'FootR', F0: new THREE.Vector3(), K0: new THREE.Vector3(), H0: new THREE.Vector3(), dy: 0 },
];
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const rnd = (a, b) => a + Math.random() * (b - a);

function catmull(points, samplesPerSeg) {
  const out = [];
  const p = [points[0], ...points, points[points.length - 1]];
  for (let i = 1; i < p.length - 2; i++) {
    for (let s = 0; s < samplesPerSeg; s++) {
      const t = s / samplesPerSeg, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push({ x: f(p[i - 1].x, p[i].x, p[i + 1].x, p[i + 2].x), z: f(p[i - 1].z, p[i].z, p[i + 1].z, p[i + 2].z) });
    }
  }
  out.push({ x: points[points.length - 1].x, z: points[points.length - 1].z });
  return out;
}

// ------------------------------------------------------------------ paths
class NpcPath {
  constructor(m, piste, index) {
    this.m = m;
    this.index = index;
    this.difficulty = piste.difficulty;
    const P = piste.points, n = P.length;
    const lt = m.lift.top, lb = m.lift.bottom, sp = m.sites.spawn;
    // lift exit: same spot where the chairlift drops the patrollers
    const ex = sp.x - lt.x, ez = sp.z - lt.z, ed = Math.hypot(ex, ez) || 1;
    const exit = { x: lt.x + (ex / ed) * 6, z: lt.z + (ez / ed) * 6 };
    // loading mat at the bottom station (mirrors world.js): skiers queue behind it and move up the lift line
    const fdx = lt.x - lb.x, fdz = lt.z - lb.z, fl = Math.hypot(fdx, fdz) || 1;
    const fx = fdx / fl, fz = fdz / fl, lx = -fz, lz = fx;
    const W1 = { x: lb.x + fx * 7 - lx * 8.5, z: lb.z + fz * 7 - lz * 8.5 };   // pass the station hut on the outside
    const W2 = { x: lb.x - fx * 4 - lx * 2.5, z: lb.z - fz * 4 - lz * 2.5 }; // round the bullwheel tower
    const W3 = { x: lb.x - fx * 3.5 + lx * 2.4, z: lb.z - fz * 3.5 + lz * 2.4 }; // corral behind the mat
    const M = { x: lb.x + fx * 1.2 + lx * 2.4, z: lb.z + fz * 1.2 + lz * 2.4 };
    const head = catmull([exit, P[0], P[4], P[8]], 6);
    const body = P.slice(9, n - 9);
    const tail = catmull([P[n - 9], P[n - 5], P[n - 1], W1, W2, W3, M], 6);
    const pts = head.concat(body, tail);
    // drop near-duplicate points
    const clean = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const q = clean[clean.length - 1];
      if (Math.hypot(pts[i].x - q.x, pts[i].z - q.z) > 0.6) clean.push(pts[i]);
    }
    this.pts = clean;
    const N = (this.n = clean.length);
    this.x = new Float64Array(N); this.z = new Float64Array(N); this.cum = new Float64Array(N);
    this.tx = new Float64Array(N); this.tz = new Float64Array(N); this.hw = new Float64Array(N); this.slope = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      this.x[i] = clean[i].x; this.z[i] = clean[i].z;
      if (i) this.cum[i] = this.cum[i - 1] + Math.hypot(this.x[i] - this.x[i - 1], this.z[i] - this.z[i - 1]);
    }
    this.length = this.cum[N - 1];
    for (let i = 0; i < N; i++) {
      const a = Math.max(0, i - 1), b = Math.min(N - 1, i + 1);
      const dx = this.x[b] - this.x[a], dz = this.z[b] - this.z[a], l = Math.hypot(dx, dz) || 1;
      this.tx[i] = dx / l; this.tz[i] = dz / l;
    }
    // where the real piste starts / ends along the path
    const findIdx = (pt) => { let bi = 0, bd = Infinity; for (let i = 0; i < N; i++) { const d = Math.hypot(this.x[i] - pt.x, this.z[i] - pt.z); if (d < bd) { bd = d; bi = i; } } return bi; };
    const i0 = findIdx(P[0]), i1 = findIdx(P[n - 1]);
    this.sPiste0 = this.cum[i0];
    this.sPiste1 = this.cum[i1];
    const hwP = piste.width / 2 - 1.5;
    for (let i = 0; i < N; i++) {
      const s = this.cum[i];
      let hw;
      if (s < this.sPiste0) hw = 2.5 + (hwP - 2.5) * smooth(0, this.sPiste0, s); // summit plateau: narrow corridor
      else if (s > this.sPiste1) hw = 2.2 + (hwP - 2.2) * (1 - smooth(this.sPiste1, this.sPiste1 + 16, s)); // run-out
      else hw = hwP;
      this.hw[i] = hw;
    }
    // smoothed fall-line slope along the path
    const h = new Float64Array(N);
    for (let i = 0; i < N; i++) h[i] = m.terrainAt(this.x[i], this.z[i]);
    const raw = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      const a = Math.max(0, i - 1), b = Math.min(N - 1, i + 1);
      raw[i] = (h[a] - h[b]) / Math.max(0.5, this.cum[b] - this.cum[a]);
    }
    for (let i = 0; i < N; i++) {
      let acc = 0, c = 0;
      for (let k = -2; k <= 2; k++) { const j = i + k; if (j >= 0 && j < N) { acc += raw[j]; c++; } }
      this.slope[i] = acc / c;
    }
    this.obstacles = []; // static, inside the piste corridor (towers, signs, kickers, buildings at the run-out)
    this.offPiste = [];  // static, beside the piste (trees, rocks) -- only matter when detouring around a site
    this.dyn = [];       // dynamic avoid points (accident sites, landing zone)
    this.buildObstacles(m, sp);
  }

  /** path coordinates (s along, lat sideways; +lat = left of travel) of a world point, nearest over segments [i0, i1) */
  project(x, z, out, i0 = 0, i1 = this.n - 1) {
    let best = Infinity, bi = i0, bt = 0;
    for (let i = Math.max(0, i0); i < Math.min(i1, this.n - 1); i++) {
      const ax = this.x[i], az = this.z[i], dx = this.x[i + 1] - ax, dz = this.z[i + 1] - az;
      const l2 = dx * dx + dz * dz || 1e-6;
      const t = clamp(((x - ax) * dx + (z - az) * dz) / l2, 0, 1);
      const px = ax + dx * t - x, pz = az + dz * t - z, d = px * px + pz * pz;
      if (d < best) { best = d; bi = i; bt = t; }
    }
    const i = bi, u = bt;
    let tx = this.tx[i] + (this.tx[i + 1] - this.tx[i]) * u, tz = this.tz[i] + (this.tz[i + 1] - this.tz[i]) * u;
    const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
    const px = this.x[i] + (this.x[i + 1] - this.x[i]) * u, pz = this.z[i] + (this.z[i + 1] - this.z[i]) * u;
    out.s = this.cum[i] + (this.cum[i + 1] - this.cum[i]) * u;
    out.lat = (x - px) * tz + (z - pz) * -tx; // N = (tz, -tx)
    out.hw = this.hw[i] + (this.hw[i + 1] - this.hw[i]) * u;
    out.d = Math.sqrt(best);
    return out;
  }

  /** calls fn(pr) once for every pass of the path close to (x, z) -- a looping run-out can pass an object twice */
  passes(x, z, reach, fn) {
    const pr = this._pr || (this._pr = { s: 0, lat: 0, hw: 0, d: 0 });
    let dPrev = Infinity, dCur = Math.hypot(this.x[0] - x, this.z[0] - z);
    for (let i = 0; i < this.n; i++) {
      const dNext = i + 1 < this.n ? Math.hypot(this.x[i + 1] - x, this.z[i + 1] - z) : Infinity;
      if (dCur <= dPrev && dCur < dNext && dCur < this.hw[i] + reach) {
        this.project(x, z, pr, i - 2, i + 2);
        fn(pr);
      }
      dPrev = dCur; dCur = dNext;
    }
  }

  buildObstacles(m, sp) {
    const seen = new Set();
    const near = [];
    const add = (x, z, r, kind) => {
      this.passes(x, z, r + SITE_DETOUR + 12, (pr) => {
        const edge = Math.abs(pr.lat) - r - 1.1;
        if (edge > pr.hw + SITE_DETOUR + 3) return;
        const o = { s0: pr.s - r, s1: pr.s + r, lat: pr.lat, half: r + 1.1, kind, id: 0 };
        (edge > pr.hw + 1.5 ? this.offPiste : this.obstacles).push(o);
      });
    };
    for (let i = 0; i < this.n; i++) {
      for (const c of m.collidersNear(this.x[i], this.z[i], near)) {
        if (seen.has(c)) continue;
        seen.add(c);
        add(c.x, c.z, c.r + 0.35, c.kind);
      }
    }
    add(sp.x + 4, sp.z, 0.5, 'sign'); // piste signpost at the summit
    for (const k of m.kickers) {
      this.passes(k.x, k.z, k.w + 4, (pr) => {
        if (Math.abs(pr.lat) > pr.hw + k.w + 2) return;
        this.obstacles.push({ s0: pr.s - k.len - 3, s1: pr.s + 1.5, lat: pr.lat, half: k.w + 1.3, kind: 'kicker', id: 0 });
      });
    }
    for (const list of [this.obstacles, this.offPiste]) {
      list.sort((a, b) => a.s0 - b.s0);
      list.forEach((o, i) => { o.id = i; });
      list.span = list.reduce((mx, o) => Math.max(mx, o.s1 - o.s0), 0);
    }
  }

  /** first index in a sorted obstacle list that can still overlap s */
  static first(list, s) {
    const key = s - list.span - 1;
    let lo = 0, hi = list.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (list[mid].s0 < key) lo = mid + 1; else hi = mid; }
    return lo;
  }

  /** writes centreline point, tangent, half-width and slope at npc.s into the npc (cached segment search) */
  sample(o) {
    const cum = this.cum;
    let i = o.seg;
    if (i > this.n - 2) i = this.n - 2;
    if (i < 0) i = 0;
    while (i < this.n - 2 && cum[i + 1] < o.s) i++;
    while (i > 0 && cum[i] > o.s) i--;
    o.seg = i;
    const u = clamp((o.s - cum[i]) / ((cum[i + 1] - cum[i]) || 1), 0, 1);
    o.cx = this.x[i] + (this.x[i + 1] - this.x[i]) * u;
    o.cz = this.z[i] + (this.z[i + 1] - this.z[i]) * u;
    let tx = this.tx[i] + (this.tx[i + 1] - this.tx[i]) * u, tz = this.tz[i] + (this.tz[i + 1] - this.tz[i]) * u;
    const tl = Math.hypot(tx, tz) || 1;
    o.ctx = tx / tl; o.ctz = tz / tl;
    o.hw = this.hw[i] + (this.hw[i + 1] - this.hw[i]) * u;
    o.slope = this.slope[i] + (this.slope[i + 1] - this.slope[i]) * u;
  }
}

// ------------------------------------------------------------------ NPC skiers
export class NpcSkiers {
  constructor(app, count = 12) {
    this.app = app;
    this.m = app.mountain;
    this.assets = app.assets;
    this.group = new THREE.Group();
    this.group.name = 'npc-skiers';
    this.closing = false;
    this.paths = this.m.pistes.map((p, i) => new NpcPath(this.m, p, i));
    this.npcs = [];
    this._avoidKey = '';
    this._bLo = new Float64Array(MAX_BLOCK);
    this._bHi = new Float64Array(MAX_BLOCK);
    this._frustum = new THREE.Frustum();
    this._pm = new THREE.Matrix4();
    this._sphere = new THREE.Sphere(new THREE.Vector3(), 3);
    this._hit = { x: 0, y: 0, z: 0 };
    const order = TOURISTS.slice().sort(() => Math.random() - 0.5);
    for (let i = 0; i < count; i++) {
      const look = Math.floor(Math.random() * 256);
      const ch = new Character(this.assets, { kind: 'tourist', model: order[i % order.length], look });
      ch.root.visible = false;
      this.group.add(ch.root);
      const npc = this.makeNpc(ch, i);
      this.npcs.push(npc);
      if (i % 5 === 4) { npc.mode = 'lift'; npc.timer = rnd(2, 30); }
      else this.place(npc, rnd(0.03, 0.93));
    }
  }

  makeNpc(ch, i) {
    // skill 0..1 -> cruising speed 4..13 m/s; most guests are beginners or intermediates
    const skill = Math.pow(Math.random(), 1.25);
    const npc = {
      id: i, ch, skill, vSkill: 4 + skill * 9, plough: false,
      path: null, seg: 0, s: 0, lat: 0, latVel: 0, v: 0, lane: 0, laneTarget: 0, laneT: 0,
      phase: Math.random() * Math.PI * 2, omega: 1, amp: 3, latAcc: 6, prevDesired: 0,
      mode: 'ski', timer: 0, startT: 0, stopIn: rnd(15, 60), stopSide: 1, standHeading: 0, wave: false,
      crashT: 0, cs: 0, cl: 0, immuneT: 0,
      x: 0, y: 0, z: 0, vx: 0, vz: 0, heading: 0, yawRate: 0, lean: 0, air: false, vy: 0, yOk: false,
      cx: 0, cz: 0, ctx: 0, ctz: 1, hw: 5, slope: 0.3,
      lastKick: -1, goKick: false, nearSite: false, wide: false, animAcc: 0, visible: false, dist: 1e9,
      pose: { speed: 0, lean: 0, tuck: 0, plough: 0, air: false, crash: false, skate: false, wave: false, noPoles: false },
    };
    this.styleFor(npc);
    return npc;
  }

  styleFor(npc) {
    const k = npc.skill;
    npc.vSkill = 4 + k * 9 + rnd(-0.4, 0.4);
    npc.plough = npc.vSkill < 6.4;
    let period;
    if (npc.plough) { period = rnd(5, 8); npc.amp = rnd(3, 5); }
    else if (k > 0.65 && Math.random() < 0.45) { period = rnd(1.6, 2.3); npc.amp = rnd(1.4, 2.4); } // short swings
    else { period = rnd(2.8, 4.6); npc.amp = rnd(3.2, 6); } // carving / cruising
    npc.omega = (Math.PI * 2) / period;
    npc.latAcc = 4 + k * 8;
  }

  pickPath(npc) {
    const k = npc.skill;
    let wG = 1.5 - k, wB = k > 0.18 ? 1 : 0.15, wK = k > 0.55 ? k * 1.5 : 0;
    const w = [0, 0, 0];
    for (const p of this.paths) w[p.index] = p.difficulty === 'green' ? wG : p.difficulty === 'black' ? wK : wB;
    let tot = 0;
    for (const v of w) tot += v;
    let r = Math.random() * tot;
    for (let i = 0; i < w.length; i++) { r -= w[i]; if (r <= 0) return this.paths[i]; }
    return this.paths[0];
  }

  /** put an NPC on a (new) path at fraction f of its length */
  place(npc, f) {
    npc.path = this.pickPath(npc);
    npc.seg = 0;
    npc.s = npc.path.length * f;
    npc.path.sample(npc);
    npc.lane = rnd(-0.4, 0.4);
    npc.laneTarget = npc.lane;
    npc.lat = f > 0 ? npc.lane * npc.hw : 0;
    npc.latVel = 0;
    npc.v = f > 0 ? npc.vSkill * 0.8 : 0.8;
    npc.mode = 'ski';
    npc.startT = f > 0 ? 0 : 1.6;
    npc.stopIn = rnd(20, 70);
    npc.air = false; npc.vy = 0; npc.yOk = false;
    npc.lastKick = -1; npc.goKick = false;
    npc.prevDesired = npc.lat;
    npc.heading = Math.atan2(npc.ctx, npc.ctz);
    npc.yawRate = 0; npc.lean = 0;
    this.toWorld(npc, npc.v, 0);
  }

  toWorld(npc, fwd, latVel) {
    const nx = npc.ctz, nz = -npc.ctx;
    npc.x = npc.cx + nx * npc.lat;
    npc.z = npc.cz + nz * npc.lat;
    npc.vx = npc.ctx * fwd + nx * latVel;
    npc.vz = npc.ctz * fwd + nz * latVel;
  }

  // ------------------------------------------------------------------ public API
  setAvoid(points) {
    const list = points || [];
    let key = '' + list.length;
    for (const p of list) key += `|${Math.round(p.x * 2)},${Math.round(p.z * 2)},${Math.round((p.r || 0) * 2)}`;
    if (key === this._avoidKey) return;
    this._avoidKey = key;
    for (const path of this.paths) {
      path.dyn.length = 0;
      for (const p of list) {
        const r = Math.max(0.5, p.r || 0);
        path.passes(p.x, p.z, r + 16, (pr) => {
          if (Math.abs(pr.lat) - r > pr.hw + 3) return;
          path.dyn.push({ s0: pr.s - r - 4, s1: pr.s + r + 1, lat: pr.lat, half: r + 1.6, kind: 'site', id: -1 });
        });
      }
    }
  }

  setClosing(on) { this.closing = !!on; }

  /** number of NPCs currently out on the slopes (not riding the lift / gone home) */
  get activeCount() {
    let c = 0;
    for (const n of this.npcs) if (n.mode !== 'lift' && n.mode !== 'gone') c++;
    return c;
  }

  hitTest(pos, vel, radius = 0.9) {
    const sp = Math.hypot(vel.x, vel.y || 0, vel.z);
    if (sp <= 7) return null;
    for (const n of this.npcs) {
      if (n.mode === 'lift' || n.mode === 'gone' || n.mode === 'crash' || n.mode === 'getup' || n.immuneT > 0) continue;
      const dx = n.x - pos.x, dz = n.z - pos.z, R = radius + 0.45;
      if (dx * dx + dz * dz > R * R) continue;
      if (n.yOk && Math.abs((pos.y ?? n.y) - n.y) > 1.8) continue;
      // knocked over: slide a little in the direction of the impact, then lie in the snow
      const ivx = n.vx * 0.3 + vel.x * 0.5, ivz = n.vz * 0.3 + vel.z * 0.5;
      const nx = n.ctz, nz = -n.ctx;
      n.cs = ivx * n.ctx + ivz * n.ctz;
      n.cl = ivx * nx + ivz * nz;
      n.mode = 'crash';
      n.crashT = 0;
      n.air = false;
      n.v = 0; n.latVel = 0;
      if (!n.yOk) n.y = this.m.heightAt(n.x, n.z);
      return { x: n.x, y: n.y, z: n.z };
    }
    return null;
  }

  update(dt, time, camPos) {
    if (!(dt > 0)) return;
    dt = Math.min(dt, 0.1);
    const cam = this.app.renderer && this.app.renderer.camera;
    let useFrustum = false;
    if (cam && cam.projectionMatrix) {
      this._pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
      this._frustum.setFromProjectionMatrix(this._pm);
      useFrustum = true;
    }
    const cx = camPos ? camPos.x : 0, cz = camPos ? camPos.z : 0;
    for (let i = 0; i < this.npcs.length; i++) {
      const n = this.npcs[i];
      if (n.mode === 'gone') { if (n.ch.root.visible) n.ch.root.visible = false; continue; }
      if (n.mode === 'lift') {
        if (n.ch.root.visible) n.ch.root.visible = false;
        n.visible = false;
        if (this.closing) continue;
        n.timer -= dt;
        if (n.timer <= 0) { this.styleFor(n); this.place(n, 0); }
        continue;
      }
      const dx = n.x - cx, dz = n.z - cz;
      n.dist = Math.sqrt(dx * dx + dz * dz);
      const near = n.dist < VIS_DIST;
      this.step(n, dt, near);
      if (n.mode === 'lift' || n.mode === 'gone') continue;
      let vis = near;
      if (vis && useFrustum && n.dist > NEAR_ALWAYS) {
        this._sphere.center.set(n.x, (n.yOk ? n.y : this.m.terrainAt(n.x, n.z)) + 0.9, n.z);
        vis = this._frustum.intersectsSphere(this._sphere);
      }
      if (vis) this.render(n, dt);
      else {
        n.yOk = false; n.air = false;
        if (n.mode === 'ski' || n.mode === 'stopping') n.heading = Math.atan2(n.vx, n.vz);
      }
      n.visible = vis;
      if (n.ch.root.visible !== vis) n.ch.root.visible = vis;
    }
  }

  // ------------------------------------------------------------------ simulation
  step(n, dt, near) {
    const path = n.path;
    if (n.immuneT > 0) n.immuneT -= dt;
    if (n.mode === 'crash') {
      n.crashT += dt;
      const k = Math.exp(-2.6 * dt);
      n.cs *= k; n.cl *= k;
      n.s = clamp(n.s + n.cs * dt, 0, path.length - 1);
      path.sample(n);
      n.lat = clamp(n.lat + n.cl * dt, -(n.hw + 4), n.hw + 4);
      this.toWorld(n, 0, 0);
      n.vx = n.vz = 0;
      if (n.crashT > 4) { n.mode = 'getup'; n.timer = 0.9; }
      return;
    }
    if (n.mode === 'getup' || n.mode === 'stand') {
      path.sample(n);
      this.toWorld(n, 0, 0);
      n.vx = n.vz = 0;
      n.timer -= dt;
      if (n.mode === 'stand' && n.timer < 1.2) n.wave = false;
      if (n.timer <= 0) {
        n.immuneT = n.mode === 'getup' ? 1.5 : 0;
        n.mode = 'ski';
        n.v = 0.4; n.latVel = 0;
        n.startT = 1.6;
        n.stopIn = rnd(25, 80);
        n.wave = false;
        n.prevDesired = n.lat;
      }
      return;
    }

    path.sample(n);
    const hw = n.hw, slope = n.slope;
    const onPiste = n.s > path.sPiste0 + 30 && n.s < path.sPiste1 - 60;
    // ---- stops at the side of the piste
    if (n.mode === 'ski' && onPiste && n.startT <= 0) {
      n.stopIn -= dt;
      if (n.stopIn <= 0 && n.v > 2 && !n.air) {
        n.mode = 'stopping';
        n.timer = 9;
        n.stopSide = n.lat > 0.5 ? 1 : n.lat < -0.5 ? -1 : (Math.random() < 0.5 ? -1 : 1);
      }
    }
    if (n.startT > 0) n.startT -= dt;
    // ---- speed
    let vt;
    if (n.mode === 'stopping') vt = 0;
    else {
      vt = Math.min(13, n.vSkill * clamp(0.45 + slope * 1.5, 0.35, 1.15));
      if (n.plough) vt = Math.min(vt, n.vSkill);
      if (slope < 0.07) vt = Math.max(vt, 3.4); // skating across the flats
      if (n.nearSite) vt = Math.min(vt, 5.5);   // slow down past an accident site
    }
    const flat = slope < 0.07;
    if (n.v < vt) n.v = Math.min(vt, n.v + (flat ? 0.9 : 0.8 + slope * 6) * dt);
    else n.v = Math.max(vt, n.v - (n.mode === 'stopping' ? (n.v < 4 ? 3.2 : 2.2) : flat ? 0.45 : 1.6) * dt);

    // ---- desired line: lane + S-turns
    n.laneT -= dt;
    if (n.laneT <= 0) { n.laneTarget = rnd(-0.55, 0.55); n.laneT = rnd(8, 22); }
    n.lane += (n.laneTarget - n.lane) * Math.min(1, dt * 0.35);
    const swing = n.mode === 'stopping' ? 0 : smooth(2.5, 6, n.v) * (onPiste || n.s < path.sPiste1 ? 1 : 0.2);
    n.phase += n.omega * dt * clamp(n.v / (n.vSkill * 0.8), 0.5, 1.15);
    const amp = Math.min(n.amp * swing, hw * 0.8);
    const laneMax = Math.max(0, hw - amp);
    let desired = clamp(n.lane * hw, -laneMax, laneMax) + amp * Math.sin(n.phase);
    if (n.mode === 'stopping') desired = n.stopSide * (hw - 0.3);
    const look = 8 + n.v * 2.2;
    const target = this.avoid(n, desired, hw, look);
    // ---- lateral control (feed-forward on the S-curve + proportional correction, limited turning)
    const dd = clamp((target - n.prevDesired) / dt, -n.v, n.v);
    n.prevDesired = target;
    const lim = Math.max(0.3, n.v * 0.8);
    const lvDes = clamp((target - n.lat) * 2 + dd, -lim, lim);
    const acc = n.latAcc * dt;
    n.latVel += clamp(lvDes - n.latVel, -acc, acc);
    n.latVel = clamp(n.latVel, -lim, lim);
    const fwd = Math.sqrt(Math.max(n.v * n.v - n.latVel * n.latVel, 0.06 * n.v * n.v));
    n.s += fwd * dt;
    n.lat += n.latVel * dt;
    // stay on the piste (a little wider while detouring around a site); never snap back, just stop drifting out
    const hard = n.wide ? hw + SITE_DETOUR + 0.5 : hw + 1.5;
    if (n.lat > hard) { if (n.latVel > 0) n.latVel = 0; n.lat = Math.min(n.lat, hw + SITE_DETOUR + 1); }
    else if (n.lat < -hard) { if (n.latVel < 0) n.latVel = 0; n.lat = Math.max(n.lat, -(hw + SITE_DETOUR + 1)); }
    if (n.s >= path.length - 0.3) {
      // reached the loading mat: ride the lift (hidden) and come back at the top, unless the lifts are closing
      n.mode = this.closing ? 'gone' : 'lift';
      n.timer = rnd(LIFT_RIDE[0], LIFT_RIDE[1]);
      n.visible = false;
      n.ch.root.visible = false;
      return;
    }
    path.sample(n);
    this.toWorld(n, fwd, n.latVel);
    // ---- stopping finished?
    if (n.mode === 'stopping') {
      n.timer -= dt;
      if (n.v < 0.3 || n.timer <= 0) {
        n.mode = 'stand';
        n.v = 0; n.latVel = 0;
        n.timer = rnd(3, 10);
        n.wave = Math.random() < 0.3;
        n.standHeading = Math.atan2(n.ctx, n.ctz) + n.stopSide * 1.3;
      }
    }
  }

  /** returns a lateral target that keeps clear of everything ahead (static obstacles, sites, slower skiers) */
  avoid(n, desired, hw, look) {
    const path = n.path, s = n.s;
    const bLo = this._bLo, bHi = this._bHi;
    let nb = 0;
    let kick = null;
    const obs = path.obstacles;
    for (let i = NpcPath.first(obs, s); i < obs.length; i++) {
      const o = obs[i];
      if (o.s0 > s + look) break;
      if (o.s1 < s - 0.5) continue;
      if (o.kind === 'kicker') {
        if (n.lastKick !== o.id) { n.lastKick = o.id; n.goKick = n.skill > 0.6 && !n.plough && Math.random() < 0.65; }
        if (n.goKick && n.mode === 'ski') { if (s < o.s1 - 1) kick = o; continue; }
      }
      if (nb < MAX_BLOCK) { bLo[nb] = o.lat - o.half; bHi[nb] = o.lat + o.half; nb++; }
    }
    let site = false;
    const dyn = path.dyn;
    for (let i = 0; i < dyn.length; i++) {
      const o = dyn[i];
      if (o.s0 > s + look + 10 || o.s1 < s - 0.5) continue;
      site = true;
      if (nb < MAX_BLOCK) { bLo[nb] = o.lat - o.half; bHi[nb] = o.lat + o.half; nb++; }
    }
    n.nearSite = site;
    for (let i = 0; i < this.npcs.length; i++) {
      const o = this.npcs[i];
      if (o === n || o.path !== path || o.mode === 'lift' || o.mode === 'gone') continue;
      const ds = o.s - s;
      if (ds < -0.5 || ds > 5 + n.v * 1.3) continue;
      if (o.mode === 'ski' && o.v >= n.v - 0.5 && ds > 3) continue; // faster skier ahead pulls away
      if (nb < MAX_BLOCK) { bLo[nb] = o.lat - 1.8; bHi[nb] = o.lat + 1.8; nb++; }
    }
    n.wide = false;
    if (kick && nb === 0) return kick.lat;
    if (kick) desired = kick.lat;
    if (!nb) return desired;
    const lo = -hw, hi = hw;
    let c = clamp(desired, lo, hi);
    if (!this.blocked(c, nb)) return c;
    // a secured site may need a detour beside the piste: then the trees and rocks there count too
    let xr = hw + 1.2;
    if (site) {
      xr = hw + SITE_DETOUR;
      const off = path.offPiste;
      for (let i = NpcPath.first(off, s); i < off.length && nb < MAX_BLOCK; i++) {
        const o = off[i];
        if (o.s0 > s + look) break;
        if (o.s1 < s - 0.5) continue;
        bLo[nb] = o.lat - o.half; bHi[nb] = o.lat + o.half; nb++;
      }
    }
    // nearest free edge to where the skier is now (stable side choice), preferring to stay on the piste
    let best = c, bestD = Infinity;
    for (let k = 0; k < nb; k++) {
      for (let e = 0; e < 2; e++) {
        const cand = e ? bHi[k] + 0.05 : bLo[k] - 0.05;
        if (cand < -xr || cand > xr || this.blocked(cand, nb)) continue;
        const out = cand < lo ? lo - cand : cand > hi ? cand - hi : 0;
        const d = Math.abs(cand - n.lat) + out * 1.5;
        if (d < bestD) { bestD = d; best = cand; }
      }
    }
    if (bestD === Infinity) { n.v = Math.min(n.v, 3); return c; } // no gap: slow down and squeeze past
    n.wide = best < -(hw + 1.2) || best > hw + 1.2;
    return best;
  }

  blocked(x, nb) {
    for (let k = 0; k < nb; k++) if (x > this._bLo[k] && x < this._bHi[k]) return true;
    return false;
  }

  // ------------------------------------------------------------------ visuals (only for NPCs near the camera)
  render(n, dt) {
    const m = this.m;
    const g = m.heightAt(n.x, n.z);
    if (!n.yOk) { n.y = g; n.vy = 0; n.air = false; n.yOk = true; }
    else if (n.air) {
      n.vy -= JUMP_G * dt;
      n.y += n.vy * dt;
      if (n.y <= g) { n.y = g; n.air = false; n.vy = 0; }
    } else {
      const pred = n.y + n.vy * dt;
      if (n.mode === 'ski' && n.v > 5 && pred - g > 0.3 + 0.35 * n.v * dt) {
        n.air = true; n.y = pred; n.vy -= JUMP_G * dt; // launched off a kicker
      } else {
        n.vy = clamp((g - n.y) / dt, -25, 25);
        n.y = g;
      }
    }
    // heading + lean from the yaw rate (centripetal acceleration -> lean angle)
    const prev = n.heading;
    let tgt;
    if (n.mode === 'stand') tgt = n.standHeading;
    else if (n.mode === 'crash' || n.mode === 'getup') tgt = n.heading;
    else tgt = n.v > 0.5 ? Math.atan2(n.vx, n.vz) : n.heading;
    n.heading = wrap(n.heading + wrap(tgt - n.heading) * Math.min(1, dt * (n.mode === 'stand' ? 3 : 9)));
    const yr = wrap(n.heading - prev) / dt;
    n.yawRate += (yr - n.yawRate) * Math.min(1, dt * 8);
    const sp = n.mode === 'ski' || n.mode === 'stopping' ? n.v : 0;
    const leanT = n.air ? 0 : clamp((-Math.atan((sp * n.yawRate) / LEAN_G) * 0.85) / 0.42, -1, 1);
    n.lean += (leanT - n.lean) * Math.min(1, dt * 6);

    const root = n.ch.root;
    root.position.set(n.x, n.y, n.z);
    root.rotation.y = n.heading;

    // animation LOD: far NPCs animate at a lower rate
    n.animAcc += dt;
    const every = n.dist > 120 ? 1 / 10 : n.dist > 60 ? 1 / 20 : 0;
    if (n.animAcc < every) return;
    const adt = n.animAcc;
    n.animAcc = 0;
    const p = n.pose;
    const skiing = n.mode === 'ski' || n.mode === 'stopping';
    p.speed = skiing ? n.v : 0;
    p.lean = skiing ? n.lean : 0;
    p.plough = skiing && (n.plough || n.mode === 'stopping') && n.startT <= 0 ? 1 : 0;
    p.tuck = skiing && !n.plough ? 0.12 + smooth(8, 13, n.v) * 0.45 : 0;
    p.air = n.air;
    p.crash = n.mode === 'crash';
    p.skate = n.mode === 'ski' && !n.air && (n.startT > 0 || (n.v < 3.9 && n.slope < 0.08));
    p.wave = n.mode === 'stand' && n.wave;
    n.ch.animate(adt, p);
    this.stance(n);
  }

  /**
   * Procedural layers on top of the tourist clips (which have no ski stance): skis follow the slope under the
   * feet, hips drop into an athletic flexed stance and a two-bone IK keeps the legs connected to the feet.
   * The tourist rigs keep the feet as separate IK-target bones (children of 'Bone'), the legs hang off 'Body_1'.
   */
  stance(n) {
    const ch = n.ch, b = ch.bones;
    if (n.mode === 'crash' && n.crashT > 1.1) ch.lean.rotation.x *= 0.2; // stop tumbling once it lies in the snow
    const skiing = (n.mode === 'ski' || n.mode === 'stopping') && !n.air && !n.pose.skate;
    const standing = n.mode === 'stand';
    if (!(skiing || standing) || !b.Bone || !b.Body_1 || !b.UpperLegL || !b.LowerLegL || !b.FootL || !b.UpperLegR || !b.LowerLegR || !b.FootR) return;
    const drop = standing ? 0.025 : n.plough ? 0.055 : 0.07 + smooth(8, 13, n.v) * 0.035;
    // slope under the skier in the character's frame (+Z forward, +X to its left)
    const nr = this.m.normalAt(n.x, n.z, _nrm);
    const sh = Math.sin(n.heading), chh = Math.cos(n.heading);
    const gF = -(nr.x * sh + nr.z * chh) / nr.y;
    const gX = -(nr.x * chh - nr.z * sh) / nr.y;
    const root = ch.root;
    // 1) read the clip pose
    for (const L of _legs) {
      L.H0.setFromMatrixPosition(b[L.up].matrixWorld);
      L.K0.setFromMatrixPosition(b[L.lo].matrixWorld);
      L.F0.setFromMatrixPosition(b[L.ft].matrixWorld);
      _d.copy(L.F0).sub(root.position);
      L.dy = clamp(gX * (_d.x * chh - _d.z * sh) + gF * (_d.x * sh + _d.z * chh), -0.25, 0.25);
    }
    // 2) feet: follow the terrain height and pitch/roll with the slope (in the parent 'Bone' frame)
    b.Bone.matrixWorld.decompose(_p, _qp, _sc);
    _qi.copy(_qp).invert();
    _qa.setFromAxisAngle(_ax.set(chh, 0, -sh), clamp(-Math.atan(gF), -0.6, 0.6));
    _qb.setFromAxisAngle(_ax.set(sh, 0, chh), clamp(Math.atan(gX), -0.5, 0.5));
    _qr.multiplyQuaternions(_qb, _qa); // world-space foot tilt
    _qt.copy(_qi).multiply(_qr).multiply(_qp); // same rotation expressed in the parent frame
    for (const L of _legs) {
      const ft = b[L.ft];
      _d.set(0, L.dy, 0).applyQuaternion(_qi).divide(_sc);
      ft.position.add(_d);
      ft.quaternion.premultiply(_qt);
    }
    // 3) hips down
    _d.set(0, -drop, 0).applyQuaternion(_qi).divide(_sc);
    b.Body_1.position.add(_d);
    b.Bone.updateMatrixWorld(true);
    // 4) two-bone IK per leg, knees bend towards the skier's front
    _fw.set(sh, 0, chh);
    b.Body_1.matrixWorld.decompose(_p, _qn, _sc); // parent of the thighs (rotation unchanged by the drop)
    for (const L of _legs) {
      const up = b[L.up], lo = b[L.lo];
      const L1 = L.K0.distanceTo(L.H0), L2 = L.F0.distanceTo(L.K0);
      if (L1 < 1e-4 || L2 < 1e-4) continue;
      _H.copy(L.H0).y -= drop;
      _F.copy(L.F0).y += L.dy;
      _u.copy(_F).sub(_H);
      let a = _u.length();
      if (a < 1e-4) continue;
      _u.divideScalar(a);
      a = clamp(a, Math.abs(L1 - L2) + 1e-3, (L1 + L2) * 0.9995);
      const cosA = clamp((L1 * L1 + a * a - L2 * L2) / (2 * L1 * a), -1, 1), sinA = Math.sqrt(1 - cosA * cosA);
      _w.copy(_fw).addScaledVector(_u, -_fw.dot(_u));
      if (_w.lengthSq() < 1e-8) continue;
      _w.normalize();
      _K2.copy(_H).addScaledVector(_u, L1 * cosA).addScaledVector(_w, L1 * sinA);
      // thigh: rotate the old knee direction onto the new one (world), then back into Body_1's frame
      _d.copy(L.K0).sub(L.H0).divideScalar(L1);
      _e.copy(_K2).sub(_H).divideScalar(L1);
      _qa.setFromUnitVectors(_d, _e);
      up.matrixWorld.decompose(_p, _qt, _sc);
      _qt.premultiply(_qa); // new thigh world rotation
      up.quaternion.copy(_qn).invert().multiply(_qt);
      // shin: it turned with the thigh; aim it at the (moved) foot
      lo.matrixWorld.decompose(_p, _qs, _sc);
      _d.copy(L.F0).sub(L.K0).divideScalar(L2).applyQuaternion(_qa);
      _e.copy(_F).sub(_K2).normalize();
      _qb.setFromUnitVectors(_d, _e);
      _qs.premultiply(_qa).premultiply(_qb); // new shin world rotation
      lo.quaternion.copy(_qt).invert().multiply(_qs);
    }
  }

  dispose() {
    if (this.group.parent) this.group.parent.remove(this.group);
    for (const n of this.npcs) {
      const ch = n.ch;
      ch.mixer.stopAllAction();
      ch.mixer.uncacheRoot(ch.body);
      ch.root.traverse((o) => {
        if (!o.isMesh) return;
        if (o.isSkinnedMesh) {
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          for (const mt of mats) mt.dispose(); // recoloured per-NPC clones; geometry is shared with the template
        } else if (o.geometry) o.geometry.dispose(); // skis, poles, shovel are built per character
      });
      const blade = ch.shovel && ch.shovel.children[1];
      if (blade && blade.material) blade.material.dispose();
    }
    this.npcs.length = 0;
  }
}
