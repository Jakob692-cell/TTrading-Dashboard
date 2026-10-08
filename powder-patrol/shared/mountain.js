// Deterministic mountain generator shared by server (gameplay checks) and client (rendering + physics).
// Coordinates: x = left/right, z = downhill, y = up. Summit near z=50, base lodge near z=900.
import { mulberry32, hashString, makeNoise2D, smoothstep, clamp, lerp } from './rng.js';

export const WORLD = { minX: -320, maxX: 320, minZ: -40, maxZ: 980, cell: 4 };

const H_TOP = 300;
const H_BASE = 12;

export function distToPolyline(pts, x, z) {
  let best = Infinity, bi = 0, bt = 0, along = 0, acc = 0, bestAlong = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const dx = b.x - a.x, dz = b.z - a.z;
    const len2 = dx * dx + dz * dz || 1e-6;
    const len = Math.sqrt(len2);
    let t = ((x - a.x) * dx + (z - a.z) * dz) / len2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = a.x + dx * t - x, pz = a.z + dz * t - z;
    const d = px * px + pz * pz;
    if (d < best) { best = d; bi = i; bt = t; bestAlong = acc + len * t; }
    acc += len;
  }
  along = bestAlong;
  return { dist: Math.sqrt(best), seg: bi, t: bt, along };
}

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
  out.push({ ...points[points.length - 1] });
  return out;
}

function polyLength(pts) {
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
  return l;
}

export function pointAlong(pts, dist) {
  let acc = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const l = Math.hypot(b.x - a.x, b.z - a.z);
    if (acc + l >= dist) {
      const t = (dist - acc) / (l || 1);
      return { x: lerp(a.x, b.x, t), z: lerp(a.z, b.z, t), dx: (b.x - a.x) / (l || 1), dz: (b.z - a.z) / (l || 1) };
    }
    acc += l;
  }
  const a = pts[pts.length - 2], b = pts[pts.length - 1];
  const l = Math.hypot(b.x - a.x, b.z - a.z) || 1;
  return { x: b.x, z: b.z, dx: (b.x - a.x) / l, dz: (b.z - a.z) / l };
}

const AVALANCHE_NAMES = ['West Bowl', 'Yeti Chute', 'Widowmaker Couloir', 'Grandma\'s Gully', 'Cornice Alley', 'The Slab'];

export function generateMountain(seedStr) {
  const seed = hashString('powder:' + seedStr);
  const rand = mulberry32(seed);
  const nMid = makeNoise2D(seed ^ 0x1234);
  const nDetail = makeNoise2D(seed ^ 0x9876);
  const nForest = makeNoise2D(seed ^ 0x5555);
  const j = (amt) => (rand() * 2 - 1) * amt;

  // ---------- Key sites ----------
  const summit = { x: j(12), z: 50 };
  const sites = {
    summit,
    hut: { x: summit.x - 26, z: 36 },
    rack: { x: summit.x - 12, z: 50 },
    crate: { x: summit.x - 34, z: 52 },
    liftTop: { x: summit.x + 46, z: 60 },
    liftBottom: { x: 78 + j(8), z: 884 },
    lodge: { x: -48, z: 918 },
    clinic: { x: -8, z: 896 },
    spawn: { x: summit.x - 6, z: 66 },
    garageTop: { x: summit.x + 18, z: 34 },
    garageBase: { x: -95, z: 905 },
    parking: { x: 40, z: 925 },
  };
  sites.clinicRadius = 15;

  // ---------- Base landform ----------
  const profile = (z) => {
    const t = clamp((z - 60) / 820, 0, 1);
    const s = 0.55 * t + 0.45 * (t * t * (3 - 2 * t));
    return lerp(H_TOP, H_BASE, s);
  };
  const baseH = (x, z) => {
    const ax = Math.abs(x);
    let h = profile(z);
    h += (x / 260) ** 2 * 18;
    h += Math.pow(smoothstep(185, 320, ax), 1.6) * 150;
    h += smoothstep(-40, -5, -z) * 0; // keep
    h += Math.pow(smoothstep(30, -40, z), 1.5) * 60; // back wall behind summit
    h += nMid.fbm(x * 0.0065, z * 0.0065, 4) * 20;
    h += nMid(x * 0.02 + 40, z * 0.02) * 4;
    return h;
  };

  // ---------- Pistes ----------
  const pisteDefs = [
    { name: 'Bunny Boulevard', difficulty: 'green', color: '#2e9e5b', width: 30, ctrl: [
      [summit.x - 14, 72], [-90 + j(15), 190], [-40 + j(15), 320], [-125 + j(15), 470], [-70 + j(15), 620], [-115 + j(10), 760], [-40, 872]] },
    { name: 'Cocoa Cruiser', difficulty: 'blue', color: '#2f6fd6', width: 24, ctrl: [
      [summit.x + 4, 76], [35 + j(15), 220], [-10 + j(15), 380], [45 + j(15), 530], [5 + j(15), 690], [25 + j(10), 800], [8, 878]] },
    { name: 'Yeti\'s Spine', difficulty: 'black', color: '#1b1f2a', width: 18, ctrl: [
      [summit.x + 24, 74], [115 + j(12), 230], [150 + j(12), 420], [110 + j(12), 600], [140 + j(10), 760], [70, 870]] },
  ];
  const pistes = pisteDefs.map((d) => {
    const pts = catmull(d.ctrl.map(([x, z]) => ({ x, z })), 14);
    return { name: d.name, difficulty: d.difficulty, color: d.color, width: d.width, points: pts, length: polyLength(pts) };
  });

  // ---------- Avalanche paths (steepest descent from release zones) ----------
  const releaseCandidates = [
    { x: -195 + j(12), z: 150 + j(20) },
    { x: 205 + j(10), z: 250 + j(25) },
    { x: -75 + j(15), z: 395 + j(20) },
    { x: 75 + j(12), z: 330 + j(25) },
  ];
  const avalanches = releaseCandidates.map((rel, idx) => {
    const path = [{ x: rel.x, z: rel.z }];
    let x = rel.x, z = rel.z, dx = 0, dz = 1;
    for (let s = 0; s < 60; s++) {
      const gx = (baseH(x + 2, z) - baseH(x - 2, z)) / 4;
      const gz = (baseH(x, z + 2) - baseH(x, z - 2)) / 4;
      const gl = Math.hypot(gx, gz) || 1;
      let ndx = dx * 0.78 - (gx / gl) * 0.22, ndz = dz * 0.78 - (gz / gl) * 0.22;
      const nl = Math.hypot(ndx, ndz) || 1;
      dx = ndx / nl; dz = ndz / nl;
      if (dz < 0.35) { dz = 0.35; const l = Math.hypot(dx, dz); dx /= l; dz /= l; }
      x += dx * 6; z += dz * 6;
      x = clamp(x, -260, 260);
      path.push({ x, z });
      if (z > 820) break;
      if (s > 38 && gl < 0.12) break;
    }
    return {
      id: idx, name: AVALANCHE_NAMES[idx % AVALANCHE_NAMES.length], release: { ...rel }, path,
      width: 30 + Math.floor(rand() * 10), length: polyLength(path),
    };
  });

  // ---------- Cliff bands (off-piste drops) ----------
  const cliffs = [
    { x0: -265, x1: -205, z: 300 + j(30), drop: 9 },
    { x0: 170, x1: 240, z: 520 + j(30), drop: 10 },
    { x0: -250, x1: -175, z: 660 + j(30), drop: 8 },
    { x0: 200, x1: 250, z: 720 + j(20), drop: 7 },
  ];

  const pisteMaskAt = (x, z) => {
    let m = 0, best = Infinity, bestP = -1;
    for (let i = 0; i < pistes.length; i++) {
      const p = pistes[i];
      const r = distToPolyline(p.points, x, z);
      const mm = smoothstep(p.width * 0.5 + 10, p.width * 0.5 - 2, r.dist);
      if (mm > m) m = mm;
      if (r.dist - p.width * 0.5 < best) { best = r.dist - p.width * 0.5; bestP = i; }
    }
    return { mask: m, edge: best, piste: bestP };
  };

  const flatten = [
    { x: summit.x, z: summit.z, r: 34, h: null },
    { x: sites.hut.x, z: sites.hut.z, r: 16, h: null },
    { x: sites.liftTop.x, z: sites.liftTop.z, r: 12, h: null },
    { x: sites.liftBottom.x, z: sites.liftBottom.z, r: 14, h: null },
    { x: 0, z: 905, r: 95, h: null },
    { x: sites.garageTop.x, z: sites.garageTop.z, r: 14, h: null },
  ];
  for (const f of flatten) f.h = baseH(f.x, f.z);
  flatten[1].h = flatten[0].h; // hut sits on the summit plateau
  flatten[4].h = H_BASE + 2;
  flatten[5].h = flatten[0].h;

  const rawHeight = (x, z) => {
    let h = baseH(x, z);
    const pm = pisteMaskAt(x, z);
    for (const a of avalanches) {
      const r = distToPolyline(a.path, x, z);
      const k = r.along / a.length;
      const fade = smoothstep(0, 0.12, k) * (1 - 0.6 * smoothstep(0.75, 1, k));
      h -= 7 * Math.exp(-((r.dist / (a.width * 0.6)) ** 2)) * fade;
      // cornice lip just above the release zone
      const dr = Math.hypot(x - a.release.x, z - (a.release.z - 14));
      h += 4 * Math.exp(-((dr / 16) ** 2));
    }
    for (const c of cliffs) {
      const mx = smoothstep(c.x0 - 14, c.x0, x) * smoothstep(c.x1 + 14, c.x1, x) * (1 - pm.mask);
      if (mx <= 0) continue;
      const step = smoothstep(c.z - 2, c.z + 2, z) * (1 - smoothstep(c.z + 2, c.z + 70, z));
      h -= c.drop * step * mx;
    }
    h += nDetail(x * 0.09, z * 0.09) * 1.6 * (1 - pm.mask * 0.85);
    h += nDetail(x * 0.035 + 7, z * 0.035) * 3 * (1 - pm.mask * 0.7);
    for (const f of flatten) {
      const d = Math.hypot(x - f.x, z - f.z);
      const m = smoothstep(f.r + 26, f.r, d);
      if (m > 0) h = lerp(h, f.h, m);
    }
    return h;
  };

  // ---------- Heightfield ----------
  const cell = WORLD.cell;
  const nx = Math.round((WORLD.maxX - WORLD.minX) / cell) + 1;
  const nz = Math.round((WORLD.maxZ - WORLD.minZ) / cell) + 1;
  const heights = new Float32Array(nx * nz);
  const pisteGrid = new Uint8Array(nx * nz); // 0 = off piste, 1..3 piste index+1
  for (let iz = 0; iz < nz; iz++) {
    for (let ix = 0; ix < nx; ix++) {
      const x = WORLD.minX + ix * cell, z = WORLD.minZ + iz * cell;
      heights[iz * nx + ix] = rawHeight(x, z);
      const pm = pisteMaskAt(x, z);
      pisteGrid[iz * nx + ix] = pm.edge < 0 ? pm.piste + 1 : 0;
    }
  }

  // ---------- Kickers (jumps) on pistes ----------
  const kickers = [];
  for (const p of pistes) {
    const count = p.difficulty === 'green' ? 1 : 2;
    for (let k = 0; k < count; k++) {
      const at = p.length * (0.3 + 0.4 * (k + rand() * 0.6) / count);
      const pt = pointAlong(p.points, at);
      kickers.push({ x: pt.x + (rand() - 0.5) * p.width * 0.3, z: pt.z, dx: pt.dx, dz: pt.dz, w: 3.2, len: 6, h: p.difficulty === 'black' ? 2.4 : 1.7 });
    }
  }

  const terrainAt = (x, z) => {
    const fx = clamp((x - WORLD.minX) / cell, 0, nx - 1.0001);
    const fz = clamp((z - WORLD.minZ) / cell, 0, nz - 1.0001);
    const ix = Math.floor(fx), iz = Math.floor(fz);
    const u = fx - ix, v = fz - iz;
    const i00 = iz * nx + ix;
    const h00 = heights[i00], h10 = heights[i00 + 1], h01 = heights[i00 + nx], h11 = heights[i00 + nx + 1];
    if (u > v) return h00 + u * (h10 - h00) + v * (h11 - h10);
    return h00 + v * (h01 - h00) + u * (h11 - h01);
  };

  const kickerAt = (x, z) => {
    let best = 0;
    for (const k of kickers) {
      const rx = x - k.x, rz = z - k.z;
      const along = rx * k.dx + rz * k.dz; // downhill
      if (along < -k.len || along > 0.05) continue;
      const lat = Math.abs(rx * -k.dz + rz * k.dx);
      if (lat > k.w) continue;
      const hh = k.h * (along + k.len) / k.len;
      if (hh > best) best = hh;
    }
    return best;
  };

  const heightAt = (x, z) => terrainAt(x, z) + kickerAt(x, z);

  const normalAt = (x, z, out = { x: 0, y: 1, z: 0 }) => {
    const e = 0.6;
    const hx = heightAt(x + e, z) - heightAt(x - e, z);
    const hz = heightAt(x, z + e) - heightAt(x, z - e);
    let nxv = -hx / (2 * e), nzv = -hz / (2 * e);
    const l = Math.hypot(nxv, 1, nzv);
    out.x = nxv / l; out.y = 1 / l; out.z = nzv / l;
    return out;
  };

  const pisteAt = (x, z) => {
    const fx = Math.round((x - WORLD.minX) / cell), fz = Math.round((z - WORLD.minZ) / cell);
    if (fx < 0 || fz < 0 || fx >= nx || fz >= nz) return 0;
    return pisteGrid[fz * nx + fx];
  };

  // ---------- Lift line ----------
  const lb = sites.liftBottom, lt = sites.liftTop;
  const liftLen = Math.hypot(lt.x - lb.x, lt.z - lb.z);
  const towerCount = Math.max(6, Math.round(liftLen / 75));
  const towers = [];
  for (let i = 0; i <= towerCount; i++) {
    const t = i / towerCount;
    const x = lerp(lb.x, lt.x, t), z = lerp(lb.z, lt.z, t);
    const ground = heightAt(x, z);
    towers.push({ x, z, ground, top: ground + (i === 0 || i === towerCount ? 6.5 : 11) });
  }
  // make sure the cable never cuts into the slope between towers
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 0; i < towers.length - 1; i++) {
      const a = towers[i], b = towers[i + 1];
      for (let s = 1; s < 10; s++) {
        const t = s / 10;
        const g = heightAt(lerp(a.x, b.x, t), lerp(a.z, b.z, t));
        const c = lerp(a.top, b.top, t);
        if (c - g < 7) { const lift = 7 - (c - g); if (i > 0) a.top += lift; if (i + 1 < towers.length - 1) b.top += lift; }
      }
    }
  }
  const lift = { bottom: lb, top: lt, towers, length: liftLen };
  lift.at = (t) => {
    const f = clamp(t, 0, 1) * (towers.length - 1);
    const i = Math.min(Math.floor(f), towers.length - 2);
    const u = f - i;
    const a = towers[i], b = towers[i + 1];
    return { x: lerp(a.x, b.x, u), y: lerp(a.top, b.top, u) - 2.6, z: lerp(a.z, b.z, u) };
  };

  // ---------- Trees & rocks ----------
  const liftDist = (x, z) => distToPolyline([lb, lt], x, z).dist;
  const trees = [];
  const rocks = [];
  const clearOf = (x, z, r) => {
    for (const k of Object.values(sites)) {
      if (typeof k !== 'object') continue;
      if (Math.hypot(x - k.x, z - k.z) < r) return false;
    }
    return true;
  };
  for (let n = 0; n < 9000 && trees.length < 2400; n++) {
    const x = lerp(-300, 300, rand()), z = lerp(70, 960, rand());
    const y = heightAt(x, z);
    if (y > 235) continue; // treeline
    const f = nForest.fbm(x * 0.011, z * 0.011, 3) + (y < 120 ? 0.18 : 0) - (y > 200 ? 0.2 : 0);
    if (f < -0.02) continue;
    const pm = pisteMaskAt(x, z);
    if (pm.edge < 5) continue;
    let inSlide = false;
    for (const a of avalanches) if (distToPolyline(a.path, x, z).dist < a.width * 0.6) { inSlide = true; break; }
    if (inSlide) continue;
    if (liftDist(x, z) < 10) continue;
    if (!clearOf(x, z, 28)) continue;
    if (Math.hypot(x, z - 905) < 80) continue;
    const nrm = normalAt(x, z);
    if (nrm.y < 0.72) continue;
    const s = 0.75 + rand() * 0.7;
    trees.push({ x, y, z, s, type: rand() < 0.12 ? 1 : 0, rot: rand() * Math.PI * 2 });
  }
  for (let n = 0; n < 4000 && rocks.length < 260; n++) {
    const x = lerp(-300, 300, rand()), z = lerp(60, 940, rand());
    const nrm = normalAt(x, z);
    const steep = nrm.y < 0.86;
    if (!steep && rand() > 0.08) continue;
    const pm = pisteMaskAt(x, z);
    if (pm.edge < 3) continue;
    if (liftDist(x, z) < 6 || !clearOf(x, z, 24)) continue;
    rocks.push({ x, y: heightAt(x, z), z, s: 0.8 + rand() * (steep ? 2.6 : 1.4), rot: rand() * Math.PI * 2 });
  }

  // ---------- Collision spatial hash ----------
  const HC = 8;
  const hash = new Map();
  const addCol = (o, r, kind) => {
    const c = { x: o.x, z: o.z, r, kind };
    const k = `${Math.floor(o.x / HC)},${Math.floor(o.z / HC)}`;
    if (!hash.has(k)) hash.set(k, []);
    hash.get(k).push(c);
  };
  for (const t of trees) addCol(t, 0.55 * t.s, 'tree');
  for (const r of rocks) addCol(r, 1.1 * r.s, 'rock');
  for (const tw of towers) addCol(tw, 0.7, 'tower');
  addCol(sites.hut, 6.5, 'building');
  addCol({ x: sites.lodge.x, z: sites.lodge.z }, 10, 'building');
  const addCollider = (x, z, r, kind = 'building') => addCol({ x, z }, r, kind);
  const collidersNear = (x, z, out = []) => {
    out.length = 0;
    const cx = Math.floor(x / HC), cz = Math.floor(z / HC);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const l = hash.get(`${cx + a},${cz + b}`);
      if (l) for (const c of l) out.push(c);
    }
    return out;
  };

  // all colliders whose hash cell overlaps the square of half-size R around (x, z)
  const collidersWithin = (x, z, R, out = []) => {
    out.length = 0;
    const x0 = Math.floor((x - R) / HC), x1 = Math.floor((x + R) / HC);
    const z0 = Math.floor((z - R) / HC), z1 = Math.floor((z + R) / HC);
    for (let a = x0; a <= x1; a++) for (let b = z0; b <= z1; b++) {
      const l = hash.get(`${a},${b}`);
      if (l) for (const c of l) out.push(c);
    }
    return out;
  };

  // ---------- Patient spawn spots ----------
  const spots = [];
  for (let n = 0; n < 6000 && spots.length < 260; n++) {
    const x = lerp(-230, 230, rand()), z = lerp(110, 830, rand());
    const nrm = normalAt(x, z);
    if (nrm.y < 0.8) continue;
    if (liftDist(x, z) < 8 || !clearOf(x, z, 40)) continue;
    const near = collidersNear(x, z);
    let blocked = false, nearTree = false;
    for (const c of near) {
      const d = Math.hypot(c.x - x, c.z - z);
      if (d < c.r + 1.2) blocked = true;
      if (c.kind === 'tree' && d < 5) nearTree = true;
    }
    if (blocked) continue;
    spots.push({ x, z, kind: nearTree ? 'tree' : 'injured' });
  }

  return {
    seed: seedStr, world: WORLD, cell, nx, nz, heights, pisteGrid,
    heightAt, terrainAt, normalAt, pisteAt, pisteMaskAt,
    pistes, avalanches, cliffs, kickers, trees, rocks, towers, lift, sites, spots,
    collidersNear, collidersWithin, addCollider,
  };
}

// Avalanche front kinematics (shared so every client agrees on where the slide is).
export function avalancheFront(elapsed) {
  // accelerates up to 26 m/s
  const a = 7, vmax = 26;
  const tAcc = vmax / a;
  if (elapsed <= 0) return 0;
  if (elapsed < tAcc) return 0.5 * a * elapsed * elapsed;
  return 0.5 * a * tAcc * tAcc + vmax * (elapsed - tAcc);
}

export function mountainName(seed) {
  const r = mulberry32(hashString('name' + seed));
  const a = ['Mount', 'Big', 'Old', 'Grizzly', 'Frosty', 'Sleepy', 'Thunder', 'Yodel'];
  const b = ['Kaboom', 'Edelweiss', 'Pfanne', 'Bluebird', 'Avalanche', 'Marmot', 'Cocoa', 'Yeti', 'Lederhosen', 'Fondue'];
  return `${a[Math.floor(r() * a.length)]} ${b[Math.floor(r() * b.length)]}`;
}
