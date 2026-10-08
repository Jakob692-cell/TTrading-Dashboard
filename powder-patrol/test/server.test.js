// End-to-end server test: two patrollers run a full rescue loop over real WebSockets.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { WebSocket } from 'ws';
import { generateMountain } from '../shared/mountain.js';
import { dailySeedString } from '../shared/rng.js';
import { INJURIES, AID_STEPS } from '../shared/constants.js';

const PORT = 3999;
let proc;

before(async () => {
  proc = spawn(process.execPath, ['server/index.js'], { env: { ...process.env, PORT: String(PORT) }, stdio: 'pipe' });
  await new Promise((res) => proc.stdout.on('data', (d) => { if (String(d).includes('running')) res(); }));
});
after(() => proc.kill());

function client() {
  const ws = new WebSocket(`ws://localhost:${PORT}/ws`);
  const msgs = [];
  const waiters = [];
  ws.on('message', (d) => {
    const m = JSON.parse(d);
    msgs.push(m);
    for (const w of [...waiters]) if (w.pred(m)) { waiters.splice(waiters.indexOf(w), 1); w.res(m); }
  });
  const c = {
    ws, msgs,
    send: (m) => ws.send(JSON.stringify(m)),
    wait: (pred, ms = 8000) => new Promise((res, rej) => {
      const hit = msgs.find(pred);
      if (hit) return res(hit);
      const w = { pred, res };
      waiters.push(w);
      setTimeout(() => rej(new Error('timeout waiting for message')), ms);
    }),
    open: () => new Promise((res) => ws.on('open', res)),
  };
  return c;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('full rescue loop: join, start, sled, ack, secure, treat, load, deliver, avalanche, bury & dig', { timeout: 60000 }, async () => {
  const m = generateMountain(dailySeedString());
  const a = client(), b = client();
  await Promise.all([a.open(), b.open()]);
  a.send({ t: 'create', profile: { name: 'Host', color: '#e63946', hat: 'helmet' } });
  const wa = await a.wait((x) => x.t === 'welcome');
  b.send({ t: 'join', code: wa.code, profile: { name: 'Guest', color: '#e63946', hat: 'viking' } });
  const wb = await b.wait((x) => x.t === 'welcome');
  const lob = await b.wait((x) => x.t === 'lobby' && x.players.length === 2);
  assert.notEqual(lob.players[0].color, lob.players[1].color, 'colors are unique per room');

  b.send({ t: 'ready', ready: true });
  await a.wait((x) => x.t === 'lobby' && x.players.find((p) => p.id === wb.id)?.ready);
  a.send({ t: 'start' });
  const start = await a.wait((x) => x.t === 'start');
  assert.equal(start.day, 1);
  assert.ok(start.sleds.length >= 2);

  // host walks to the rack and grabs a sled
  const sled = start.sleds[0];
  a.send({ t: 'st', p: [sled.x + 1, sled.y, sled.z], yaw: 0, a: 0, sp: 0 });
  await sleep(100);
  a.send({ t: 'grabSled', id: sled.id });
  const grabbed = await a.wait((x) => x.t === 'ev' && x.k === 'sled' && x.owner === wa.id);
  assert.equal(grabbed.id, sled.id);

  // wait for the first emergency call (shift starts ~5s after start + firstCallAt)
  const call = await a.wait((x) => x.t === 'ev' && x.k === 'call', 20000);
  assert.ok(Number.isFinite(call.x) && Number.isFinite(call.z));

  assert.ok(INJURIES[call.inj], `call carries an injury (${call.inj})`);
  assert.ok(call.where && call.where.kind, 'call says where');
  // guest acknowledges the call over the radio
  b.send({ t: 'ack', id: call.id });
  const ack = await a.wait((x) => x.t === 'ev' && x.k === 'ack' && x.id === call.id);
  assert.equal(ack.by, wb.id);

  // ski over (teleport); tree-well victims must be pulled out first
  const py = m.heightAt(call.x, call.z);
  a.send({ t: 'st', p: [call.x + 1, py, call.z], yaw: 0, a: 0, sp: 0, sled: { id: sled.id, p: [call.x + 2, py, call.z + 1], yaw: 0, tip: false } });
  await sleep(100);
  if (call.type !== 'injured') {
    for (let i = 0; i < 14; i++) { a.send({ t: 'work', kind: 'patient', id: call.id, dt: 0.2 }); await sleep(20); }
    await a.wait((x) => x.t === 'ev' && x.k === 'extracted' && x.id === call.id);
  }
  // secure the site with crossed skis (uphill)
  a.send({ t: 'secure', id: call.id });
  const sec = await a.wait((x) => x.t === 'ev' && x.k === 'secured' && x.id === call.id);
  assert.ok(m.heightAt(sec.x, sec.z) > py, 'crossed skis go uphill of the patient');
  // first aid: a wrong measure is rejected, then the right sequence frees the patient
  const steps = INJURIES[call.inj].steps;
  const wrong = Object.keys(AID_STEPS).find((k) => k !== steps[0]);
  a.send({ t: 'treat', id: call.id, step: wrong });
  await a.wait((x) => x.t === 'ev' && x.k === 'treatWrong' && x.id === call.id);
  for (const st of steps) {
    await sleep(AID_STEPS[st].time * 1000);
    a.send({ t: 'treat', id: call.id, step: st });
    await a.wait((x) => x.t === 'ev' && x.k === 'treated' && x.id === call.id && x.step === st);
  }
  await a.wait((x) => x.t === 'ev' && x.k === 'freed' && x.id === call.id);
  a.send({ t: 'load', id: call.id });
  await a.wait((x) => x.t === 'ev' && x.k === 'loaded' && x.id === call.id);

  // pull the sled into the clinic zone
  const C = m.sites.clinic;
  a.send({ t: 'st', p: [C.x, m.heightAt(C.x, C.z), C.z - 2], yaw: 0, a: 0, sp: 4, sled: { id: sled.id, p: [C.x, m.heightAt(C.x, C.z), C.z], yaw: 0, tip: false } });
  const del = await a.wait((x) => x.t === 'ev' && x.k === 'delivered' && x.id === call.id);
  assert.ok(del.reward >= 40 && del.reward <= 110, `reward ${del.reward}`);
  assert.equal(del.transport, 'akja');
  const snap = await a.wait((x) => x.t === 'snap' && x.earned >= del.reward);
  assert.ok(snap.earned >= del.reward);

  // avalanche control: throw a charge onto a release zone
  const zone = m.avalanches[0];
  const ry = m.heightAt(zone.release.x, zone.release.z);
  a.send({ t: 'charge', p: [zone.release.x, ry + 0.5, zone.release.z], v: [0, 0, 0] });
  const boom = await a.wait((x) => x.t === 'ev' && x.k === 'boom', 8000);
  assert.ok(boom);
  const av = await a.wait((x) => x.t === 'ev' && x.k === 'avalanche' && x.zone === zone.id);
  assert.equal(av.controlled, true);

  // guest gets buried, host digs them out
  const gx = 0, gz = 600, gy = m.heightAt(gx, gz);
  b.send({ t: 'st', p: [gx, gy, gz], yaw: 0, a: 4, sp: 0 });
  b.send({ t: 'buried', p: [gx, gy, gz] });
  await a.wait((x) => x.t === 'ev' && x.k === 'buried' && x.id === wb.id);
  a.send({ t: 'st', p: [gx + 1.5, gy, gz], yaw: 0, a: 0, sp: 0 });
  await sleep(80);
  for (let i = 0; i < 16; i++) { a.send({ t: 'work', kind: 'player', id: wb.id, dt: 0.2 }); await sleep(20); }
  await b.wait((x) => x.t === 'ev' && x.k === 'unburied' && x.id === wb.id);

  // chat is relayed and sanitized
  b.send({ t: 'chat', text: '<b>hi</b> team' });
  const chat = await a.wait((x) => x.t === 'chat');
  assert.equal(chat.text, 'bhi/b team');

  a.ws.close(); b.ws.close();
});

test('rejects unknown room codes', async () => {
  const c = client();
  await c.open();
  c.send({ t: 'join', code: 'ZZZZ', profile: { name: 'x' } });
  const err = await c.wait((x) => x.t === 'error');
  assert.match(err.text, /No patrol/);
  c.ws.close();
});

test('mountain generation is deterministic', () => {
  const a = generateMountain('test-seed'), b = generateMountain('test-seed');
  assert.equal(a.trees.length, b.trees.length);
  assert.equal(a.heightAt(12.3, 456.7), b.heightAt(12.3, 456.7));
  assert.ok(a.heightAt(a.sites.summit.x, a.sites.summit.z) > a.heightAt(0, 900) + 200, 'summit is high above the base');
});
