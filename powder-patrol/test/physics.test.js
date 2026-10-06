// Headless ski physics checks using the real client controller.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateMountain, distToPolyline, pointAlong } from '../shared/mountain.js';
import { Skier } from '../client/js/skier.js';

const m = generateMountain('physics-test');

function rideDown(piste, seconds, opts = {}) {
  const s = new Skier(m);
  const st = pointAlong(piste.points, 30);
  s.spawn(st.x, st.z, 0);
  let maxSpeed = 0, crashes = 0, airTime = 0;
  const dt = 1 / 60;
  for (let i = 0; i < seconds * 60; i++) {
    const r = distToPolyline(piste.points, s.pos.x, s.pos.z);
    const tgt = pointAlong(piste.points, r.along + 22);
    const want = Math.atan2(tgt.x - s.pos.x, tgt.z - s.pos.z);
    const diff = Math.atan2(Math.sin(want - s.heading), Math.cos(want - s.heading));
    s.update(dt, { left: diff > 0.06, right: diff < -0.06, up: opts.tuck ?? Math.abs(diff) < 0.35, down: s.speed > (opts.limit ?? 99), jump: false });
    for (const e of s.events) if (e.type === 'crash') crashes++;
    s.events.length = 0;
    if (s.mode === 'air') airTime += dt;
    maxSpeed = Math.max(maxSpeed, s.speed);
    assert.ok(Number.isFinite(s.pos.x) && Number.isFinite(s.pos.y) && Number.isFinite(s.pos.z), 'position stays finite');
    if (r.along > piste.length - 30) break;
  }
  return { s, maxSpeed, crashes, airTime, along: distToPolyline(piste.points, s.pos.x, s.pos.z).along };
}

test('a skier following each piste makes real progress at sane speeds', () => {
  for (const p of m.pistes) {
    const r = rideDown(p, 90, { limit: 24 });
    assert.ok(r.along > p.length * 0.6, `${p.name}: only reached ${Math.round(r.along)}m of ${Math.round(p.length)}m`);
    assert.ok(r.maxSpeed > 12, `${p.name}: too slow (${r.maxSpeed.toFixed(1)} m/s)`);
    assert.ok(r.maxSpeed < 45, `${p.name}: too fast (${r.maxSpeed.toFixed(1)} m/s)`);
  }
});

test('snowplough brakes to a stop on a gentle slope', () => {
  const s = new Skier(m);
  const p = pointAlong(m.pistes[0].points, 400);
  s.spawn(p.x, p.z, Math.atan2(p.dx, p.dz));
  s.vel.set(p.dx * 15, 0, p.dz * 15);
  for (let i = 0; i < 60 * 6; i++) s.update(1 / 60, { left: false, right: false, up: false, down: true, jump: false });
  assert.ok(s.speed < 4, `still moving at ${s.speed.toFixed(1)} m/s`);
});

test('hitting a tree at speed causes a crash', () => {
  const tree = m.trees.find((t) => t.s > 1);
  const s = new Skier(m);
  s.spawn(tree.x, tree.z - 6, 0);
  s.vel.set(0, 0, 16);
  let crashed = false;
  for (let i = 0; i < 60; i++) {
    s.update(1 / 60, { left: false, right: false, up: false, down: false, jump: false });
    if (s.events.some((e) => e.type === 'crash')) crashed = true;
    s.events.length = 0;
  }
  assert.ok(crashed, 'expected a crash after hitting a tree');
});

test('chairlift carries the skier from the bottom to the top', () => {
  const s = new Skier(m);
  s.spawn(m.lift.bottom.x, m.lift.bottom.z, 0);
  s.boardLift();
  for (let i = 0; i < 60 * 21; i++) s.update(1 / 60, {});
  assert.notEqual(s.mode, 'lift');
  assert.ok(Math.hypot(s.pos.x - m.lift.top.x, s.pos.z - m.lift.top.z) < 15, 'ends up at the top station');
});

test('toboggan follows the skier on its rope', () => {
  const s = new Skier(m);
  const p = pointAlong(m.pistes[1].points, 200);
  s.spawn(p.x, p.z, Math.atan2(p.dx, p.dz));
  s.attachSled(1, p.x, m.heightAt(p.x, p.z), p.z - 2, 0, true);
  for (let i = 0; i < 60 * 8; i++) s.update(1 / 60, { left: false, right: false, up: true, down: false, jump: false });
  const d = Math.hypot(s.sled.pos.x - s.pos.x, s.sled.pos.z - s.pos.z);
  assert.ok(d < 4.5, `sled is ${d.toFixed(1)}m away from the skier`);
});
