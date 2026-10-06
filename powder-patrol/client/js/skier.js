// Local player physics: carving skis on a faceted heightfield, jumps, crashes, chairlift, toboggan on a rope.
import * as THREE from 'three';
import { GRAVITY, LIFT_RIDE_TIME } from '/shared/constants.js';

const H = 1 / 120;
const _n = { x: 0, y: 1, z: 0 };
const _sn = { x: 0, y: 1, z: 0 };
const f = new THREE.Vector3(), l = new THREE.Vector3(), nv = new THREE.Vector3();
const near = [];

export class Skier {
  constructor(mountain) {
    this.m = mountain;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.heading = 0;
    this.mode = 'ski'; // ski | air | crash | lift | buried | vehicle
    this.anchor = null; // when set, a towed toboggan hooks here (vehicle hitch) instead of the skier
    this.seat = 0;
    this.crashT = 0;
    this.airT = 0;
    this.airSpin = 0;
    this.tuck = 0;
    this.plough = 0;
    this.leanV = 0;
    this.skid = 0;
    this.speed = 0;
    this.liftT = 0;
    this.sled = null;
    this.events = [];
    this.upgrades = {};
    this.acc = 0;
    this.grounded = true;
    this.skating = false;
    const lb = mountain.lift.bottom, lt = mountain.lift.top;
    const dx = lt.x - lb.x, dz = lt.z - lb.z, len = Math.hypot(dx, dz);
    this.liftLat = { x: -dz / len, z: dx / len };
    this.liftYaw = Math.atan2(dx, dz);
  }

  spawn(x, z, heading = 0) {
    this.pos.set(x, this.m.heightAt(x, z), z);
    this.vel.set(0, 0, 0);
    this.heading = heading;
    this.mode = 'ski';
    this.crashT = 0;
    if (this.sled) {
      this.sled.pos.set(x - Math.sin(heading) * 2.5, 0, z - Math.cos(heading) * 2.5);
      this.sled.pos.y = this.m.heightAt(this.sled.pos.x, this.sled.pos.z);
      this.sled.vel.set(0, 0, 0);
    }
  }

  attachSled(id, x, y, z, yaw, hasPatient) {
    this.sled = { id, pos: new THREE.Vector3(x, y, z), vel: new THREE.Vector3(), yaw, tip: false, tipT: 0, hasPatient, hitCd: 0 };
  }
  detachSled() { const s = this.sled; this.sled = null; return s; }

  crash(reason = 'impact') {
    if (this.mode === 'crash' || this.mode === 'lift' || this.mode === 'buried') return;
    this.mode = 'crash';
    this.crashT = 2.0;
    this.events.push({ type: 'crash', reason, speed: this.speed });
    if (this.sled && this.sled.hasPatient) {
      this.events.push({ type: 'sledHit', mag: 8 });
      if (this.speed > 9) this.tipSled();
    }
  }

  tipSled() {
    const s = this.sled;
    if (!s || s.tip) return;
    s.tip = true;
    s.tipT = 1.4;
    if (s.hasPatient) {
      s.hasPatient = false;
      this.events.push({ type: 'eject' });
    }
  }

  boardLift() {
    this.mode = 'lift';
    this.liftT = 0;
    this.vel.set(0, 0, 0);
    this.events.push({ type: 'lift' });
  }

  bury() {
    this.mode = 'buried';
    this.vel.set(0, 0, 0);
  }
  unbury() {
    this.mode = 'ski';
    this.pos.y = this.m.heightAt(this.pos.x, this.pos.z) + 0.4;
    this.vel.set(0, 6, 0);
    this.mode = 'air';
  }

  update(dt, inp) {
    this.acc += Math.min(dt, 0.1);
    while (this.acc >= H) {
      this.acc -= H;
      this.step(H, inp);
      inp.jump = false;
    }
    this.speed = Math.hypot(this.vel.x, this.vel.y, this.vel.z);
    const want = inp.up && this.mode === 'ski' && this.speed > 6 ? 1 : 0;
    this.tuck += (want - this.tuck) * Math.min(1, dt * 6);
    const wp = inp.down && this.mode === 'ski' ? 1 : 0;
    this.plough += (wp - this.plough) * Math.min(1, dt * 8);
    this.skating = inp.up && this.mode === 'ski' && this.speed < 6;
  }

  step(h, inp) {
    const m = this.m, p = this.pos, v = this.vel;
    if (this.mode === 'buried' || this.mode === 'vehicle') return;
    if (this.mode === 'lift') {
      this.liftT += h / LIFT_RIDE_TIME;
      const a = m.lift.at(Math.min(this.liftT, 1));
      p.set(a.x + this.liftLat.x * 2.4, a.y + 0.15, a.z + this.liftLat.z * 2.4);
      this.heading = this.liftYaw;
      if (this.liftT >= 1) {
        const t = m.lift.top;
        const sp = m.sites.spawn;
        const dx = sp.x - t.x, dz = sp.z - t.z, d = Math.hypot(dx, dz) || 1;
        const x = t.x + dx / d * 6, z = t.z + dz / d * 6;
        p.set(x, m.heightAt(x, z) + 0.6, z);
        this.heading = Math.atan2(dx, dz);
        v.set(dx / d * 3, 0, dz / d * 3);
        this.mode = 'air';
        this.events.push({ type: 'liftExit' });
      }
      if (this.sled) {
        this.sled.pos.set(p.x, p.y - 1.4, p.z - 0.3);
        this.sled.vel.set(0, 0, 0);
        this.sled.yaw = this.heading;
      }
      return;
    }

    const steer = (inp.left ? 1 : 0) - (inp.right ? 1 : 0);
    this.leanV += (steer * Math.min(1, this.speed / 8) - this.leanV) * Math.min(1, h * 8);
    const ground = m.heightAt(p.x, p.z);

    if (this.mode === 'air') {
      v.y -= GRAVITY * h;
      p.addScaledVector(v, h);
      this.heading += steer * 5.2 * h;
      this.airSpin += steer * 5.2 * h;
      this.airT += h;
      const g = m.heightAt(p.x, p.z);
      if (p.y <= g) {
        p.y = g;
        const n = m.normalAt(p.x, p.z, _n);
        const impact = -(v.x * n.x + v.y * n.y + v.z * n.z);
        const hs = Math.hypot(v.x, v.z);
        let ang = 0;
        if (hs > 0.5) {
          const va = Math.atan2(v.x, v.z);
          ang = Math.abs(Math.atan2(Math.sin(va - this.heading), Math.cos(va - this.heading)));
        }
        const dot = v.x * n.x + v.y * n.y + v.z * n.z;
        v.x -= n.x * dot; v.y -= n.y * dot; v.z -= n.z * dot;
        const spinTurns = Math.abs(this.airSpin) / (Math.PI * 2);
        if (impact > 17 || (hs > 9 && ang > 1.25 && ang < Math.PI - 0.5)) {
          this.mode = 'ski';
          this.crash('landing');
        } else {
          if (ang > Math.PI - 0.5 && hs > 3) this.heading += Math.PI; // landed switch -> flip around
          this.mode = 'ski';
          this.events.push({ type: 'land', airT: this.airT, spin: spinTurns, impact });
          if (this.sled && this.sled.hasPatient && impact > 7) this.events.push({ type: 'sledHit', mag: impact * 0.8 });
        }
        this.airT = 0;
        this.airSpin = 0;
      }
    } else {
      // grounded (ski or crash)
      const crashing = this.mode === 'crash';
      if (crashing) {
        this.crashT -= h;
        if (this.crashT <= 0) {
          this.mode = 'ski';
          const hs = Math.hypot(v.x, v.z);
          if (hs > 1) this.heading = Math.atan2(v.x, v.z);
        }
      }
      const n = m.normalAt(p.x, p.z, _n);
      nv.set(n.x, n.y, n.z);
      const sp = Math.hypot(v.x, v.z);
      if (!crashing) {
        const turnRate = (inp.down ? 2.8 : 2.35) - Math.min(sp, 32) * 0.028;
        this.heading += steer * turnRate * h;
      }
      v.y -= GRAVITY * h;
      f.set(Math.sin(this.heading), 0, Math.cos(this.heading));
      f.addScaledVector(nv, -f.dot(nv)).normalize();
      l.crossVectors(nv, f).normalize();
      const vn = v.dot(nv);
      if (vn < 0) v.addScaledVector(nv, -vn);
      let vf = v.dot(f), vl = v.dot(l);
      const waxed = this.upgrades.wax ? 1 : 0;
      if (crashing) {
        const k = Math.exp(-2.2 * h);
        vf *= k; vl *= k;
      } else {
        const grip = inp.down ? 3.2 : 7.5;
        const nvl = vl * Math.exp(-grip * h);
        this.skid = Math.abs(vl - nvl) / h;
        vl = nvl;
        let mu = 0.035 * (waxed ? 0.75 : 1);
        if (inp.down) mu += 0.42;
        const fr = mu * GRAVITY * n.y * h;
        if (Math.abs(vf) <= fr) vf = 0; else vf -= Math.sign(vf) * fr;
        const spd = Math.hypot(vf, vl);
        let cd = (inp.up && spd > 6 ? 0.0085 : 0.014) * (this.sled ? 1.3 : 1) * (waxed ? 0.83 : 1);
        const ddv = cd * spd * spd * h;
        if (spd > 0) { const k = Math.max(0, spd - ddv) / spd; vf *= k; vl *= k; }
        if (inp.up && vf < (this.sled ? 5 : 7)) vf += 5.5 * h;
        if (vf < 0) vf *= Math.exp(-1.8 * h);
      }
      v.copy(f).multiplyScalar(vf).addScaledVector(l, vl);
      // jump
      if (inp.jump && !crashing) {
        v.addScaledVector(nv, 6.5);
        v.y += 1.5;
        this.mode = 'air';
        this.airT = 0;
        this.airSpin = 0;
        this.events.push({ type: 'jump' });
      }
      p.addScaledVector(v, h);
      const g2 = m.heightAt(p.x, p.z);
      if (this.mode !== 'air') {
        if (p.y - g2 > 0.22 && sp > 6) {
          this.mode = 'air'; // launched off a lip
          this.airT = 0;
          this.airSpin = 0;
        } else {
          p.y = g2;
        }
      }
    }

    // obstacles (trees, rocks, towers, buildings)
    m.collidersNear(p.x, p.z, near);
    for (const c of near) {
      const dx = p.x - c.x, dz = p.z - c.z;
      const R = c.r + 0.35;
      const d2 = dx * dx + dz * dz;
      if (d2 >= R * R) continue;
      const top = c.kind === 'tree' ? 6 : c.kind === 'rock' ? 2.2 : c.kind === 'tower' ? 30 : 8;
      if (p.y > m.terrainAt(c.x, c.z) + top) continue;
      const d = Math.sqrt(d2) || 0.001;
      const nx = dx / d, nz = dz / d;
      p.x = c.x + nx * R; p.z = c.z + nz * R;
      const vn = v.x * nx + v.z * nz;
      if (vn < 0) {
        if (-vn > 8.5 && this.mode !== 'crash') this.crash(c.kind);
        v.x -= nx * vn * 1.4; v.z -= nz * vn * 1.4;
      }
    }
    // world bounds
    p.x = THREE.MathUtils.clamp(p.x, -312, 312);
    p.z = THREE.MathUtils.clamp(p.z, -35, 975);
    if (p.y < m.heightAt(p.x, p.z) - 0.5) p.y = m.heightAt(p.x, p.z);

    if (this.sled) this.stepSled(h);
  }

  stepSled(h) {
    const s = this.sled, m = this.m, p = this.pos;
    s.hitCd -= h;
    if (s.tip) {
      s.tipT -= h;
      if (s.tipT <= 0) s.tip = false;
    }
    const sp = s.pos, sv = s.vel;
    const n = m.normalAt(sp.x, sp.z, _sn);
    sv.y -= GRAVITY * h;
    const vn = sv.x * n.x + sv.y * n.y + sv.z * n.z;
    if (vn < 0) { sv.x -= n.x * vn; sv.y -= n.y * vn; sv.z -= n.z * vn; }
    // runner friction: strong sideways, light lengthwise
    const fx = Math.sin(s.yaw), fz = Math.cos(s.yaw);
    const along = sv.x * fx + sv.z * fz;
    const lx = -fz, lz = fx;
    const side = sv.x * lx + sv.z * lz;
    const keep = Math.exp(-(this.upgrades.toboggan ? 4 : 2.6) * h);
    sv.x -= lx * side * (1 - keep); sv.z -= lz * side * (1 - keep);
    const fr = Math.exp(-0.25 * h);
    sv.x *= fr; sv.z *= fr;
    sp.addScaledVector(sv, h);
    const g = m.heightAt(sp.x, sp.z);
    sp.y = g;
    // rope to the skier (or to a vehicle hitch)
    const anc = this.anchor;
    const ax = anc ? anc.x : p.x - Math.sin(this.heading) * 0.7, az = anc ? anc.z : p.z - Math.cos(this.heading) * 0.7;
    const avx = anc ? anc.vx : this.vel.x, avz = anc ? anc.vz : this.vel.z;
    let dx = sp.x - ax, dz = sp.z - az;
    const dist = Math.hypot(dx, dz) || 0.001;
    const L = anc ? 3.2 : 2.7;
    if (dist > L) {
      dx /= dist; dz /= dist;
      sp.x = ax + dx * L; sp.z = az + dz * L;
      sp.y = m.heightAt(sp.x, sp.z);
      const rel = (sv.x - avx) * dx + (sv.z - avz) * dz;
      if (rel > 0) {
        sv.x -= dx * rel; sv.z -= dz * rel;
        if (rel > 10 && s.hitCd <= 0 && s.hasPatient) { this.events.push({ type: 'sledHit', mag: rel * 0.6 }); s.hitCd = 0.5; }
      }
    }
    const tyaw = Math.atan2(ax - sp.x, az - sp.z);
    s.yaw += Math.atan2(Math.sin(tyaw - s.yaw), Math.cos(tyaw - s.yaw)) * Math.min(1, h * 10);
    // obstacles
    m.collidersNear(sp.x, sp.z, near);
    for (const c of near) {
      const ox = sp.x - c.x, oz = sp.z - c.z;
      const R = c.r + 0.45;
      const d2 = ox * ox + oz * oz;
      if (d2 >= R * R) continue;
      const d = Math.sqrt(d2) || 0.001;
      const nx = ox / d, nz = oz / d;
      sp.x = c.x + nx * R; sp.z = c.z + nz * R;
      const vv = sv.x * nx + sv.z * nz;
      if (vv < 0) {
        if (-vv > 4.5 && s.hitCd <= 0) {
          if (s.hasPatient) this.events.push({ type: 'sledHit', mag: -vv * 1.4 });
          s.hitCd = 0.4;
          this.events.push({ type: 'sledBonk', mag: -vv });
          if (-vv > (this.upgrades.toboggan ? 12 : 8)) this.tipSled();
        }
        sv.x -= nx * vv * 1.3; sv.z -= nz * vv * 1.3;
      }
    }
    // sliding sideways fast flips the sled
    const ssp = Math.hypot(sv.x, sv.z);
    if (!s.tip && ssp > 7) {
      const sideNow = Math.abs(sv.x * -Math.cos(s.yaw) + sv.z * Math.sin(s.yaw));
      if (sideNow > (this.upgrades.toboggan ? 9 : 6)) this.tipSled();
    }
  }

  // Pose information for the character animator
  pose() {
    if (this.mode === 'vehicle') return { sit: true, drive: this.seat === 0, speed: 0 };
    return {
      speed: this.speed,
      lean: this.mode === 'ski' ? -this.leanV : 0,
      tuck: this.tuck,
      plough: this.plough,
      air: this.mode === 'air',
      crash: this.mode === 'crash',
      sit: this.mode === 'lift',
      skate: this.skating,
    };
  }

  animCode() {
    // compact animation state for the network
    switch (this.mode) {
      case 'air': return 1;
      case 'crash': return 2;
      case 'lift': return 3;
      case 'buried': return 4;
      case 'vehicle': return this.seat === 0 ? 8 : 9;
      default: return this.tuck > 0.5 ? 5 : this.plough > 0.5 ? 6 : this.skating ? 7 : 0;
    }
  }
}
