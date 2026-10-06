// Drivable vehicles: detailed procedural snowmobile & ATV, CC0 pickup & rescue truck, arcade physics on the heightfield.
import * as THREE from 'three';
import { VEHICLE_TYPES, GRAVITY } from '/shared/constants.js';

// ------------------------------------------------------------------ materials
const paint = (color) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.35, metalness: 0.15, clearcoat: 0.8, clearcoatRoughness: 0.25 });
const plastic = new THREE.MeshStandardMaterial({ color: '#23262e', roughness: 0.55, metalness: 0.05 });
const rubber = new THREE.MeshStandardMaterial({ color: '#1b1c20', roughness: 0.92 });
const metal = new THREE.MeshStandardMaterial({ color: '#b9c0cc', roughness: 0.3, metalness: 0.85 });
const seatMat = new THREE.MeshPhysicalMaterial({ color: '#2a2c33', roughness: 0.45, sheen: 0.4, sheenColor: new THREE.Color('#555a66') });
const glass = new THREE.MeshPhysicalMaterial({ color: '#9fd0ff', roughness: 0.05, metalness: 0, transmission: 0, transparent: true, opacity: 0.45, side: THREE.DoubleSide });
const headlight = new THREE.MeshStandardMaterial({ color: '#fffbe8', emissive: '#fff3c4', emissiveIntensity: 2.2 });
const taillight = new THREE.MeshStandardMaterial({ color: '#ff2d2d', emissive: '#ff1a1a', emissiveIntensity: 1.6 });

function treadTexture() {
  const cv = document.createElement('canvas');
  cv.width = 64; cv.height = 256;
  const c = cv.getContext('2d');
  c.fillStyle = '#26272c'; c.fillRect(0, 0, 64, 256);
  for (let y = 0; y < 256; y += 16) { c.fillStyle = '#121316'; c.fillRect(0, y, 64, 7); c.fillStyle = '#3a3c43'; c.fillRect(0, y + 7, 64, 2); }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
let _tread = null;
const tread = () => (_tread ??= treadTexture());

function decal(text, bg, fg, w, h) {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = Math.round(256 * h / w);
  const c = cv.getContext('2d');
  c.fillStyle = bg; c.fillRect(0, 0, cv.width, cv.height);
  c.fillStyle = fg;
  c.font = `${Math.round(cv.height * 0.62)}px "Lilita One", sans-serif`;
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(text, cv.width / 2, cv.height / 2 + 2);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: t, roughness: 0.4, transparent: bg === 'transparent' }));
}

// Extrude a side profile given as [z, y] points into a body of the given width (centered on x).
function sideBody(points, width, material, bevel = 0.05) {
  const shape = new THREE.Shape();
  points.forEach(([z, y], i) => (i ? shape.lineTo(z, y) : shape.moveTo(z, y)));
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: width - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 4, curveSegments: 12 });
  g.rotateY(-Math.PI / 2).translate((width - bevel * 2) / 2, 0, 0);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, material);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
function smoothCurve(pts, n = 6) {
  // Catmull-Rom smoothing for closed [z,y] polygons
  const out = [];
  const N = pts.length;
  for (let i = 0; i < N; i++) {
    const p0 = pts[(i - 1 + N) % N], p1 = pts[i], p2 = pts[(i + 1) % N], p3 = pts[(i + 2) % N];
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  return out;
}
const mesh = (g, m, shadow = true) => { const o = new THREE.Mesh(g, m); o.castShadow = shadow; o.receiveShadow = true; return o; };
function cyl(r1, r2, h, seg, m, axis = 'y') {
  const g = new THREE.CylinderGeometry(r1, r2, h, seg);
  if (axis === 'x') g.rotateZ(Math.PI / 2);
  if (axis === 'z') g.rotateX(Math.PI / 2);
  return mesh(g, m);
}

// ------------------------------------------------------------------ snowmobile
export function makeSnowmobile(color = '#e63946') {
  const g = new THREE.Group();
  const body = paint(color);
  const white = paint('#f4f6fa');
  // hood / cowl (smooth side profile)
  const hood = sideBody(smoothCurve([[0.15, 0.36], [1.2, 0.3], [1.5, 0.42], [1.42, 0.62], [1.0, 0.86], [0.5, 1.0], [0.18, 1.02], [0.05, 0.7]], 6), 0.98, body, 0.07);
  // tunnel & side panels
  const tunnel = sideBody([[-1.45, 0.34], [0.25, 0.34], [0.25, 0.66], [-1.35, 0.62], [-1.48, 0.5]], 0.7, body, 0.04);
  const stripe = sideBody(smoothCurve([[0.2, 0.55], [1.38, 0.47], [1.42, 0.55], [0.25, 0.66]], 3), 1.0, white, 0.02);
  // seat
  const seat = sideBody(smoothCurve([[-1.28, 0.62], [0.1, 0.66], [0.15, 0.82], [-0.3, 0.86], [-1.2, 0.82]], 4), 0.5, seatMat, 0.05);
  // track
  const trackMat = new THREE.MeshStandardMaterial({ map: tread(), roughness: 0.9, color: '#ffffff' });
  tread().repeat.set(1, 3);
  const track = sideBody([[-1.5, 0.06], [0.05, 0.06], [0.3, 0.3], [-1.55, 0.32]], 0.5, trackMat, 0.03);
  for (const z of [-1.2, -0.65, -0.1]) for (const s of [-1, 1]) {
    const w = cyl(0.11, 0.11, 0.06, 14, metal, 'x');
    w.position.set(s * 0.27, 0.17, z);
    g.add(w);
  }
  // skis + spindles
  for (const s of [-1, 1]) {
    const ski = sideBody(smoothCurve([[0.35, 0.02], [1.35, 0.02], [1.62, 0.16], [1.66, 0.24], [1.55, 0.2], [1.32, 0.08], [0.38, 0.08]], 3), 0.14, plastic, 0.02);
    ski.position.x = s * 0.48;
    const strut = cyl(0.03, 0.03, 0.55, 8, metal);
    strut.position.set(s * 0.44, 0.33, 0.95);
    strut.rotation.z = s * 0.25;
    const arm = cyl(0.025, 0.025, 0.55, 8, metal, 'x');
    arm.position.set(s * 0.24, 0.45, 0.9);
    g.add(ski, strut, arm);
  }
  // windshield (curved)
  const ws = mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.45, 20, 1, true, -0.75, 1.5), glass, false);
  ws.rotation.x = -0.45;
  ws.position.set(0, 1.12, 0.62);
  // handlebar
  const post = cyl(0.03, 0.03, 0.3, 8, plastic);
  post.position.set(0, 1.02, 0.28);
  const bar = cyl(0.025, 0.025, 0.78, 10, metal, 'x');
  bar.position.set(0, 1.15, 0.25);
  for (const s of [-1, 1]) { const grip = cyl(0.035, 0.035, 0.14, 10, rubber, 'x'); grip.position.set(s * 0.36, 1.15, 0.25); g.add(grip); }
  // lights
  const hl = mesh(new THREE.SphereGeometry(0.09, 16, 10), headlight, false);
  hl.scale.set(1.6, 0.8, 0.6);
  hl.position.set(0, 0.72, 1.36);
  const tl = mesh(new THREE.BoxGeometry(0.3, 0.06, 0.04), taillight, false);
  tl.position.set(0, 0.56, -1.5);
  // rear rack + hitch
  const rack = mesh(new THREE.BoxGeometry(0.6, 0.04, 0.35), plastic);
  rack.position.set(0, 0.88, -1.18);
  const hitch = cyl(0.03, 0.03, 0.3, 8, metal, 'z');
  hitch.position.set(0, 0.4, -1.6);
  // patrol decals
  for (const s of [-1, 1]) {
    const d = decal('✚ PATROL', color, '#ffffff', 0.62, 0.16);
    d.position.set(s * 0.5, 0.75, 0.85);
    d.rotation.y = s * Math.PI / 2;
    d.rotation.x = -0.1;
    g.add(d);
  }
  g.add(hood, tunnel, stripe, seat, track, ws, post, bar, hl, tl, rack, hitch);
  g.userData.spin = [];
  g.userData.lights = [hl];
  return g;
}

// ------------------------------------------------------------------ ATV / quad
function makeTire(r, w) {
  const tireMat = new THREE.MeshStandardMaterial({ map: tread(), roughness: 0.95, color: '#ffffff' });
  const t = new THREE.Group();
  const tire = mesh(new THREE.CylinderGeometry(r, r, w, 24, 1).rotateZ(Math.PI / 2), tireMat);
  const sideWall = new THREE.TorusGeometry(r * 0.82, r * 0.18, 8, 24).rotateY(Math.PI / 2);
  const sw1 = mesh(sideWall, rubber); sw1.position.x = w / 2 - 0.02;
  const sw2 = mesh(sideWall, rubber); sw2.position.x = -w / 2 + 0.02;
  const rim = mesh(new THREE.CylinderGeometry(r * 0.55, r * 0.55, w + 0.02, 12).rotateZ(Math.PI / 2), metal);
  t.add(tire, sw1, sw2, rim);
  return t;
}
export function makeQuad(color = '#f07b2c') {
  const g = new THREE.Group();
  const body = paint(color);
  const frame = mesh(new THREE.BoxGeometry(0.5, 0.18, 1.5), plastic);
  frame.position.set(0, 0.42, 0);
  const front = sideBody(smoothCurve([[0.3, 0.55], [1.05, 0.52], [1.08, 0.7], [0.85, 0.8], [0.45, 0.82], [0.3, 0.72]], 4), 1.18, body, 0.06);
  const rear = sideBody(smoothCurve([[-1.02, 0.55], [-0.25, 0.55], [-0.2, 0.74], [-0.55, 0.82], [-0.98, 0.78]], 4), 1.18, body, 0.06);
  const tank = sideBody(smoothCurve([[-0.15, 0.6], [0.45, 0.6], [0.4, 0.95], [0.05, 1.0], [-0.12, 0.88]], 4), 0.42, body, 0.06);
  const seat = sideBody(smoothCurve([[-0.75, 0.82], [-0.1, 0.84], [-0.05, 0.98], [-0.35, 1.02], [-0.72, 0.98]], 4), 0.46, seatMat, 0.05);
  g.add(frame, front, rear, tank, seat);
  const wheels = [];
  for (const [x, z] of [[0.55, 0.65], [-0.55, 0.65], [0.55, -0.65], [-0.55, -0.65]]) {
    const w = makeTire(0.34, 0.28);
    w.position.set(x, 0.34, z);
    g.add(w);
    wheels.push(w);
  }
  // racks
  for (const z of [0.78, -0.8]) {
    const rk = new THREE.Group();
    for (const x of [-0.45, -0.15, 0.15, 0.45]) { const r = cyl(0.015, 0.015, 0.55, 6, plastic, 'z'); r.position.set(x, 0, 0); rk.add(r); }
    for (const zz of [-0.25, 0.25]) { const r = cyl(0.015, 0.015, 0.95, 6, plastic, 'x'); r.position.set(0, 0, zz); rk.add(r); }
    rk.position.set(0, 0.88, z);
    g.add(rk);
  }
  const post = cyl(0.03, 0.03, 0.25, 8, plastic);
  post.position.set(0, 1.05, 0.38);
  const bar = cyl(0.025, 0.025, 0.85, 10, metal, 'x');
  bar.position.set(0, 1.17, 0.35);
  for (const s of [-1, 1]) {
    const grip = cyl(0.035, 0.035, 0.14, 10, rubber, 'x'); grip.position.set(s * 0.4, 1.17, 0.35); g.add(grip);
    const hl = mesh(new THREE.SphereGeometry(0.07, 14, 10), headlight, false);
    hl.scale.set(1.4, 0.8, 0.6);
    hl.position.set(s * 0.25, 0.74, 1.08);
    g.add(hl);
  }
  const tl = mesh(new THREE.BoxGeometry(0.22, 0.06, 0.04), taillight, false);
  tl.position.set(0, 0.7, -1.03);
  const hitch = cyl(0.03, 0.03, 0.25, 8, metal, 'z');
  hitch.position.set(0, 0.45, -1.1);
  for (const s of [-1, 1]) {
    const d = decal('✚', color, '#ffffff', 0.22, 0.22);
    d.position.set(s * 0.6, 0.68, -0.6);
    d.rotation.y = s * Math.PI / 2;
    g.add(d);
  }
  g.add(post, bar, tl, hitch);
  g.userData.spin = wheels;
  g.userData.steer = wheels.slice(0, 2);
  return g;
}

// ------------------------------------------------------------------ views
export class VehicleView {
  constructor(assets, type, id) {
    this.type = type;
    this.T = VEHICLE_TYPES[type];
    this.id = id;
    this.root = new THREE.Group();
    this.root.rotation.order = 'YXZ';
    let model;
    if (type === 'snowmobile') model = makeSnowmobile(id % 2 ? '#e63946' : '#2f6fd6');
    else if (type === 'quad') model = makeQuad('#f07b2c');
    else {
      model = assets.cloneVehicle(this.T.model);
      model.scale.setScalar(this.T.scale || 1);
      const box = new THREE.Box3().setFromObject(model);
      model.position.y -= box.min.y;
      model.userData.spin = [];
      model.userData.steer = [];
      model.traverse((o) => {
        if (/Wheel/i.test(o.name)) model.userData.spin.push(o);
        if (/FrontWheel/i.test(o.name)) model.userData.steer.push(o);
      });
      if (this.T.ambulance) {
        for (const s of [-1, 1]) {
          const d = decal('✚ RESCUE', '#ffffff', '#e63946', 1.6, 0.42);
          d.position.set(s * 1.28, 2.0, -0.6);
          d.rotation.y = s * Math.PI / 2;
          this.root.add(d);
        }
        const beacon = mesh(new THREE.BoxGeometry(0.9, 0.14, 0.25), new THREE.MeshStandardMaterial({ color: '#ff3b3b', emissive: '#ff2020', emissiveIntensity: 0 }), false);
        beacon.position.set(0, 2.78, 1.4);
        this.root.add(beacon);
        this.beacon = beacon;
      }
    }
    this.model = model;
    this.root.add(model);
    this.spinAngle = 0;
  }

  setPose(x, y, z, yaw, pitch, roll) {
    this.root.position.set(x, y, z);
    this.root.rotation.set(pitch, yaw, roll, 'YXZ');
  }

  seatWorld(i, out = new THREE.Vector3()) {
    const s = this.T.seats[i] || this.T.seats[0];
    this.root.updateMatrixWorld(true);
    return out.set(s[0], s[1], s[2]).applyMatrix4(this.root.matrixWorld);
  }

  update(dt, speed, steer = 0, time = 0) {
    this.spinAngle += (speed * dt) / 0.34;
    for (const w of this.model.userData.spin || []) w.rotation.x = this.spinAngle;
    for (const w of this.model.userData.steer || []) w.rotation.y = steer * 0.4;
    if (this.type === 'snowmobile') tread().offset.y -= speed * dt * 0.4;
    if (this.beacon) this.beacon.material.emissiveIntensity = speed > 2 ? (Math.sin(time * 12) > 0 ? 3 : 0.2) : 0.3;
  }
}

// ------------------------------------------------------------------ physics (run by the driver's client)
const _n = { x: 0, y: 1, z: 0 };
const near = [];
export class VehiclePhysics {
  constructor(mountain, type, x, y, z, yaw) {
    this.m = mountain;
    this.type = type;
    this.T = VEHICLE_TYPES[type];
    this.pos = new THREE.Vector3(x, y, z);
    this.vel = new THREE.Vector3();
    this.yaw = yaw;
    this.pitch = 0;
    this.roll = 0;
    this.air = false;
    this.steer = 0;
    this.events = [];
    this.acc = 0;
    this.crashCd = 0;
  }

  get speed() { return Math.hypot(this.vel.x, this.vel.z); }

  update(dt, inp, onStep) {
    this.acc += Math.min(dt, 0.1);
    const h = 1 / 120;
    while (this.acc >= h) {
      this.acc -= h;
      this.step(h, inp);
      onStep?.(h);
    }
  }

  groundSample() {
    const m = this.m, T = this.T, p = this.pos;
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const lx = fz, lz = -fx; // vehicle-left
    const hl = T.len * 0.4, hw = T.wid * 0.45;
    const hF = m.heightAt(p.x + fx * hl, p.z + fz * hl), hB = m.heightAt(p.x - fx * hl, p.z - fz * hl);
    const hL = m.heightAt(p.x + lx * hw, p.z + lz * hw), hR = m.heightAt(p.x - lx * hw, p.z - lz * hw);
    return { ground: Math.max((hF + hB + hL + hR) / 4, m.heightAt(p.x, p.z)), pitch: Math.atan2(hB - hF, 2 * hl), roll: Math.atan2(hL - hR, 2 * hw) };
  }

  step(h, inp) {
    const m = this.m, T = this.T, p = this.pos, v = this.vel;
    this.crashCd -= h;
    const steerIn = (inp.left ? 1 : 0) - (inp.right ? 1 : 0);
    this.steer += (steerIn - this.steer) * Math.min(1, h * 8);
    const gs = this.groundSample();
    if (!this.air) {
      const n = m.normalAt(p.x, p.z, _n);
      v.y -= GRAVITY * h;
      const vn = v.x * n.x + v.y * n.y + v.z * n.z;
      if (vn < 0) { v.x -= n.x * vn; v.y -= n.y * vn; v.z -= n.z * vn; }
      // forward along the slope plane
      let fx = Math.sin(this.yaw), fz = Math.cos(this.yaw), fy = 0;
      const fd = fx * n.x + fz * n.z;
      fx -= n.x * fd; fy -= n.y * fd; fz -= n.z * fd;
      const fl = Math.hypot(fx, fy, fz) || 1;
      fx /= fl; fy /= fl; fz /= fl;
      // side = n x f
      const sx = n.y * fz - n.z * fy, sy = n.z * fx - n.x * fz, sz = n.x * fy - n.y * fx;
      let vf = v.x * fx + v.y * fy + v.z * fz;
      let vs = v.x * sx + v.y * sy + v.z * sz;
      const grade = fy / Math.max(0.2, Math.hypot(fx, fz));
      const traction = grade > T.climb ? Math.max(0.1, 1 - (grade - T.climb) * 5) : 1;
      if (inp.up) vf += T.accel * traction * Math.max(0, 1 - vf / T.maxSpeed) * h;
      if (inp.down) {
        if (vf > 0.5) vf -= 16 * h;
        else vf = Math.max(-7, vf - T.accel * 0.6 * h);
      }
      if (!inp.up && !inp.down) vf -= Math.sign(vf) * Math.min(Math.abs(vf), 1.4 * h);
      vf -= vf * Math.abs(vf) * 0.0035 * h;
      const grip = inp.jump ? 1.0 : T.grip;
      vs *= Math.exp(-grip * h);
      const yawRate = this.steer * T.turn * THREE.MathUtils.clamp(vf / 5, -1, 1) * (1 - 0.35 * Math.min(1, Math.abs(vf) / T.maxSpeed));
      this.yaw += yawRate * h;
      v.set(fx * vf + sx * vs, fy * vf + sy * vs, fz * vf + sz * vs);
      p.addScaledVector(v, h);
      const g2 = this.groundSample().ground;
      if (p.y - g2 > 0.3 && Math.abs(vf) > 8) this.air = true;
      else p.y = g2;
    } else {
      v.y -= GRAVITY * h;
      p.addScaledVector(v, h);
      this.yaw += this.steer * 0.8 * h;
      const g2 = this.groundSample().ground;
      if (p.y <= g2) {
        const n = m.normalAt(p.x, p.z, _n);
        const impact = -(v.x * n.x + v.y * n.y + v.z * n.z);
        p.y = g2;
        this.air = false;
        const vn = v.x * n.x + v.y * n.y + v.z * n.z;
        v.x -= n.x * vn; v.y -= n.y * vn; v.z -= n.z * vn;
        this.events.push({ type: 'land', impact });
        if (impact > 15) this.crash(impact);
      }
    }
    // obstacles
    m.collidersNear(p.x, p.z, near);
    for (const c of near) {
      const dx = p.x - c.x, dz = p.z - c.z;
      const R = c.r + T.radius;
      const d2 = dx * dx + dz * dz;
      if (d2 >= R * R) continue;
      if (c.kind === 'tree' && p.y > m.terrainAt(c.x, c.z) + 6) continue;
      const d = Math.sqrt(d2) || 0.001;
      const nx = dx / d, nz = dz / d;
      p.x = c.x + nx * R; p.z = c.z + nz * R;
      const vn = v.x * nx + v.z * nz;
      if (vn < 0) {
        if (-vn > 11) this.crash(-vn);
        else if (-vn > 3) this.events.push({ type: 'bonk', mag: -vn });
        v.x -= nx * vn * 1.5; v.z -= nz * vn * 1.5;
      }
    }
    p.x = THREE.MathUtils.clamp(p.x, -312, 312);
    p.z = THREE.MathUtils.clamp(p.z, -35, 975);
    // smooth visual tilt
    const k = Math.min(1, h * (this.air ? 2 : 12));
    this.pitch += (gs.pitch - this.pitch) * k;
    this.roll += (gs.roll - this.roll) * k;
  }

  crash(mag) {
    if (this.crashCd > 0) return;
    this.crashCd = 1.5;
    this.events.push({ type: 'crash', mag, v: [this.vel.x, this.vel.y + 4, this.vel.z] });
    this.vel.multiplyScalar(0.25);
  }

  // where a towed toboggan hooks on
  hitch() {
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const back = this.T.len * 0.55;
    return { x: this.pos.x - fx * back, z: this.pos.z - fz * back, vx: this.vel.x, vz: this.vel.z };
  }
}
