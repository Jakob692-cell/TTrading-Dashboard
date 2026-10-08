// Mountain-rescue mechanics over real WebSockets: first aid, securing the site, radio acks, the rescue
// helicopter, probing & digging, the akja rear rope and the closing sweep.
//
// One server for the whole file (PORT 3998, PP_SHIFT_SECONDS=90 so the closing sweep and the results
// screen happen inside the test). Every test opens its own room, so each one gets a fresh, independent
// shift and they can all run concurrently.
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';
import { generateMountain, distToPolyline, pointAlong } from '../shared/mountain.js';
import { INJURIES, AID_STEPS, RESCUE, DIG_TIME } from '../shared/constants.js';

const PORT = 3998;
const SHIFT = 90;
const ROOT = fileURLToPath(new URL('..', import.meta.url));
let proc;
const sockets = new Set();

before(async () => {
  proc = spawn(process.execPath, ['server/index.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), PP_SHIFT_SECONDS: String(SHIFT) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let err = '';
  proc.stderr.on('data', (d) => { err += d; });
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('server did not start')), 15000);
    proc.stdout.on('data', (d) => { if (String(d).includes('running')) { clearTimeout(t); res(); } });
    proc.once('exit', (code) => { clearTimeout(t); rej(new Error(`server exited (${code}): ${err}`)); });
  });
});
after(() => {
  for (const ws of sockets) ws.terminate();
  proc?.kill(); // by handle (= by PID), never pkill
});

// ---------------------------------------------------------------- client helper
function client() {
  const ws = new WebSocket(`ws://localhost:${PORT}/ws`);
  sockets.add(ws);
  const msgs = [];
  const waiters = new Set();
  ws.on('message', (d) => {
    const m = JSON.parse(d);
    msgs.push(m);
    for (const w of [...waiters]) if (w.pred(m)) { waiters.delete(w); clearTimeout(w.timer); w.res(m); }
  });
  let syncN = 0;
  const c = {
    ws, msgs, id: null, slot: null, name: null,
    send: (m) => ws.send(JSON.stringify(m)),
    mark: () => msgs.length,
    // resolves with the first message at index >= from that matches
    wait(pred, ms = 8000, from = 0, label = 'message') {
      return new Promise((res, rej) => {
        for (let i = from; i < msgs.length; i++) if (pred(msgs[i])) return res(msgs[i]);
        const w = { pred, res };
        w.timer = setTimeout(() => { waiters.delete(w); rej(new Error(`timeout waiting for ${label}`)); }, ms);
        waiters.add(w);
      });
    },
    // The server handles one socket's messages in order and emits events synchronously, so once the
    // reply to this sync arrives, every event caused by what we sent earlier has arrived too.
    async barrier() {
      const ct = `barrier-${++syncN}`;
      c.send({ t: 'sync', ct });
      await c.wait((m) => m.t === 'sync' && m.ct === ct, 5000, 0, 'sync barrier');
    },
    events: (from, k, pred = () => true) => msgs.slice(from).filter((m) => m.t === 'ev' && m.k === k && pred(m)),
    // last snapshot received before message index i
    snapBefore(i) { for (let j = i - 1; j >= 0; j--) if (msgs[j].t === 'snap') return msgs[j]; return null; },
    snapAfter: (i, pred = () => true) => c.wait((m) => m.t === 'snap' && pred(m), 4000, i + 1, 'snapshot'),
    async nextSnap(pred = () => true) { return c.snapAfter(msgs.length - 1, pred); },
    indexOf: (m) => msgs.indexOf(m),
    open: () => new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); }),
    close: () => ws.close(),
  };
  return c;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const r2 = (v) => Math.round(v * 100) / 100;
const isEv = (k, pred = () => true) => (m) => m.t === 'ev' && m.k === k && pred(m);

const mountains = new Map();
function mountainFor(seed) {
  if (!mountains.has(seed)) mountains.set(seed, generateMountain(seed));
  return mountains.get(seed);
}

// create a room with n patrollers, start the shift and wait for the countdown to end
async function patrol(n, label) {
  const cs = Array.from({ length: n }, client);
  await Promise.all(cs.map((c) => c.open()));
  const [host, ...rest] = cs;
  host.name = `${label}0`;
  host.send({ t: 'create', profile: { name: host.name } });
  const w = await host.wait((m) => m.t === 'welcome');
  host.id = w.id;
  for (const [i, c] of rest.entries()) {
    c.name = `${label}${i + 1}`;
    c.send({ t: 'join', code: w.code, profile: { name: c.name } });
    c.id = (await c.wait((m) => m.t === 'welcome')).id;
  }
  const lobby = await host.wait((m) => m.t === 'lobby' && m.players.length === n);
  for (const c of cs) c.slot = lobby.players.find((p) => p.id === c.id).slot;
  host.send({ t: 'start' });
  const [start] = await Promise.all(cs.map((c) => c.wait((m) => m.t === 'start')));
  await Promise.all(cs.map((c) => c.wait((m) => m.t === 'snap' && m.el >= 0, 12000, 0, 'shift start')));
  return { cs, start, m: mountainFor(start.seed), close: () => cs.forEach((c) => c.close()) };
}

function stand(c, m, x, z, extra = {}) {
  c.send({ t: 'st', p: [x, r2(m.heightAt(x, z)), z], yaw: 0, a: 0, sp: 0, ...extra });
}

// "run over" a tourist at (x, z): the server spawns an injured patient there and dispatches a call
async function injure(c, m, x, z) {
  const from = c.mark();
  // the server only accepts a collision right next to the reporting player
  stand(c, m, r2(x + 1.5), z);
  c.send({ t: 'injureTourist', p: [x, m.heightAt(x, z), z] });
  const call = await c.wait(isEv('call', (e) => e.x === x && e.z === z), 4000, from, 'injureTourist call');
  await c.wait((s) => s.t === 'snap' && s.pt.some((p) => p.id === call.id), 4000, from, 'patient in snapshot');
  return call;
}
const ptIn = (snap, id) => snap.pt.find((p) => p.id === id);

// ---------------------------------------------------------------- terrain picking (same rules as the server)
// patient spots far from avalanche paths and pistes: no slide buries them, no Folgeunfall happens next to them
function quietSpots(m) {
  return m.spots
    .filter((s) => s.kind === 'injured' && m.pisteMaskAt(s.x, s.z).edge >= 8
      && m.avalanches.every((a) => distToPolyline(a.path, s.x, s.z).dist > a.width * 0.6 + 25))
    .map((s) => ({ x: r2(s.x), z: r2(s.z) }));
}
// the server puts the crossed skis 10 m against the terrain normal (uphill); pick a clearly sloped spot
function uphillOf(m, x, z) {
  const n = m.normalAt(x, z);
  const hl = Math.hypot(n.x, n.z) || 1;
  return { x: x - (n.x / hl) * 10, z: z - (n.z / hl) * 10, hl };
}
function slopedSpot(m) {
  const s = quietSpots(m).find((p) => { const u = uphillOf(m, p.x, p.z); return u.hl > 0.12 && m.heightAt(u.x, u.z) > m.heightAt(p.x, p.z) + 0.5; });
  assert.ok(s, 'found a sloped, quiet patient spot');
  return s;
}
// mirror of Room.lzProblem
function lzProblem(m, vehicles, x, z, pt) {
  if (pt && Math.hypot(pt.x - x, pt.z - z) > RESCUE.lzMaxDist) return 'far';
  const n = m.normalAt(x, z);
  if (Math.hypot(n.x, n.z) / Math.max(0.01, n.y) > RESCUE.lzMaxSlope) return 'steep';
  for (const c of m.collidersNear(x, z)) if (Math.hypot(c.x - x, c.z - z) < RESCUE.lzClear + c.r) return 'obstacles';
  for (const v of vehicles) if (Math.hypot(v.x - x, v.z - z) < RESCUE.lzClear * 0.6) return 'obstacles';
  return null;
}
// a patient spot P with a valid landing zone Q 8-20 m away, plus a steep spot S and an obstructed spot O within range
function heliSite(m, vehicles) {
  const ring = (P, r, k, n) => { const a = (k / n) * Math.PI * 2; return { x: r2(P.x + Math.cos(a) * r), z: r2(P.z + Math.sin(a) * r) }; };
  for (const P of quietSpots(m)) {
    let Q = null, S = null, O = null;
    for (let r = 8; r <= 20 && !Q; r += 2) for (let k = 0; k < 24 && !Q; k++) {
      const q = ring(P, r, k, 24);
      if (lzProblem(m, vehicles, q.x, q.z, P) === null) Q = q;
    }
    if (!Q) continue;
    for (let r = 6; r <= 80 && !(S && O); r += 3) for (let k = 0; k < 36 && !(S && O); k++) {
      const q = ring(P, r, k, 36);
      const why = lzProblem(m, vehicles, q.x, q.z, P);
      if (why === 'steep' && !S) S = q;
      if (why === 'obstacles' && !O) O = q;
    }
    if (S && O) return { P, Q, S, O, F: { x: r2(P.x > 0 ? P.x - 100 : P.x + 100), z: P.z } };
  }
  return null;
}
const plainWrongStep = (steps) => Object.keys(AID_STEPS).find((k) => !AID_STEPS[k].trap && !steps.includes(k));

// treat with the server-enforced spacing (the client plays the action for AID_STEPS[step].time)
async function treatStep(c, id, step, from = c.mark()) {
  await sleep(AID_STEPS[step].time * 1000 + 60);
  c.send({ t: 'treat', id, step });
  return c.wait(isEv('treated', (e) => e.id === id && e.step === step), 4000, from, `treated ${step}`);
}

// ---------------------------------------------------------------- tests
describe('mountain rescue', { concurrency: true }, () => {
  test('treat: traps cost more than plain mistakes, order, spacing and range are enforced', { timeout: 60000 }, async () => {
    const { cs: [a], m, close } = await patrol(1, 'Medic');
    try {
      const P = quietSpots(m)[0];
      const call = await injure(a, m, P.x, P.z);
      const id = call.id;
      const steps = INJURIES[call.inj].steps;
      assert.ok(steps.length >= 3);
      stand(a, m, r2(P.x + 1), P.z);

      // condition change across an event: last snapshot before it vs. first one after it
      const drop = async (ev) => {
        const i = a.indexOf(ev);
        const before = ptIn(a.snapBefore(i), id).c;
        const after = ptIn(await a.snapAfter(i), id).c;
        return before - after;
      };

      // a trap ("schnaps") is never right and hurts more than an ordinary wrong measure
      const trap = 'schnaps';
      assert.ok(AID_STEPS[trap].trap && !steps.includes(trap));
      let from = a.mark();
      a.send({ t: 'treat', id, step: trap });
      const tw = await a.wait(isEv('treatWrong', (e) => e.id === id && e.step === trap), 4000, from, 'treatWrong trap');
      assert.equal(tw.want, steps[0]);
      assert.equal(tw.by, a.id);
      const trapDrop = await drop(tw);

      const plain = plainWrongStep(steps);
      await sleep(AID_STEPS[plain].time * 1000 + 60);
      from = a.mark();
      a.send({ t: 'treat', id, step: plain });
      const pw = await a.wait(isEv('treatWrong', (e) => e.id === id && e.step === plain), 4000, from, 'treatWrong plain');
      assert.equal(pw.want, steps[0]);
      const plainDrop = await drop(pw);
      // server: -7 for a trap, -4 otherwise (snapshot condition is rounded, so allow +-1)
      assert.ok(trapDrop >= 6 && trapDrop <= 8, `trap drop ${trapDrop}`);
      assert.ok(plainDrop >= 3 && plainDrop <= 5, `plain drop ${plainDrop}`);
      assert.ok(trapDrop > plainDrop, `trap (${trapDrop}) costs more than a plain mistake (${plainDrop})`);

      // the right first step counts
      const t1 = await treatStep(a, id, steps[0]);
      assert.equal(t1.n, 1);
      assert.equal(t1.done, false);

      // the next step sent right away (< 0.6 * its action time) is ignored
      from = a.mark();
      a.send({ t: 'treat', id, step: steps[1] });
      await a.barrier();
      assert.equal(a.events(from, 'treated', (e) => e.id === id).length, 0, 'too-fast treat ignored');
      assert.equal(a.events(from, 'treatWrong', (e) => e.id === id).length, 0);
      assert.equal(ptIn(await a.nextSnap(), id).st, 1, 'still at step 1');

      // from more than 4.5 m away nothing happens either (spacing is fine by now)
      await sleep(AID_STEPS[steps[1]].time * 1000 + 60);
      stand(a, m, r2(P.x + 6), P.z);
      from = a.mark();
      a.send({ t: 'treat', id, step: steps[1] });
      a.send({ t: 'treat', id, step: trap });
      await a.barrier();
      assert.equal(a.events(from, 'treated', (e) => e.id === id).length, 0, 'out-of-range treat ignored');
      assert.equal(a.events(from, 'treatWrong', (e) => e.id === id).length, 0, 'out-of-range wrong treat ignored');

      // back in range: accepted immediately (the ignored attempts did not reset the spacing clock)
      stand(a, m, r2(P.x + 1), P.z);
      from = a.mark();
      a.send({ t: 'treat', id, step: steps[1] });
      const t2 = await a.wait(isEv('treated', (e) => e.id === id && e.step === steps[1]), 4000, from, 'treated step 2');
      assert.equal(t2.n, 2);

      // the rest of the sequence frees the patient
      let last = t2;
      for (const st of steps.slice(2)) last = await treatStep(a, id, st);
      assert.equal(last.done, true);
      const freed = await a.wait(isEv('freed', (e) => e.id === id), 4000, a.indexOf(last), 'freed');
      assert.equal(freed.inj, call.inj);
      const snap = ptIn(await a.snapAfter(a.indexOf(freed)), id);
      assert.equal(snap.f, true);
      assert.equal(snap.st, steps.length);

      // a freed patient takes no more measures
      await sleep(1200);
      from = a.mark();
      a.send({ t: 'treat', id, step: trap });
      await a.barrier();
      assert.equal(a.events(from, 'treatWrong').length + a.events(from, 'treated').length, 0);
    } finally { close(); }
  });

  test('secure: crossed skis ~10 m uphill, once, with the secure bonus', { timeout: 30000 }, async () => {
    const { cs: [a], m, close } = await patrol(1, 'Skis');
    try {
      const P = slopedSpot(m);
      const call = await injure(a, m, P.x, P.z);
      const id = call.id;

      // too far away (> 7 m): ignored
      stand(a, m, r2(P.x + 9), P.z);
      let from = a.mark();
      a.send({ t: 'secure', id });
      await a.barrier();
      assert.equal(a.events(from, 'secured').length, 0, 'secure from 9 m ignored');

      stand(a, m, r2(P.x + 2), P.z);
      from = a.mark();
      a.send({ t: 'secure', id });
      const sec = await a.wait(isEv('secured', (e) => e.id === id), 4000, from, 'secured');
      assert.equal(sec.by, a.id);
      const d = Math.hypot(sec.x - P.x, sec.z - P.z);
      assert.ok(Math.abs(d - 10) < 0.05, `skis ${d.toFixed(2)} m from the patient`);
      assert.ok(m.heightAt(sec.x, sec.z) > m.heightAt(P.x, P.z), 'crossed skis are uphill of the patient');

      const i = a.indexOf(sec);
      const before = a.snapBefore(i);
      const after = await a.snapAfter(i);
      assert.equal(after.earned - before.earned, RESCUE.secureBonus, 'secure bonus in earned');
      assert.deepEqual(ptIn(after, id).sec, [sec.x, sec.z]);

      // a second secure does nothing
      from = a.mark();
      a.send({ t: 'secure', id });
      await a.barrier();
      assert.equal(a.events(from, 'secured').length, 0, 'second secure ignored');
      const later = await a.nextSnap();
      assert.equal(later.earned, after.earned, 'no second bonus');
      assert.deepEqual(ptIn(later, id).sec, [sec.x, sec.z]);
    } finally { close(); }
  });

  test('ack: only the first radio ack counts, the event names the rescuer and slot', { timeout: 40000 }, async () => {
    const { cs: [a, b], m, close } = await patrol(2, 'Radio');
    try {
      // first dispatch call of the shift (firstCallAt = 6 s)
      const call = await a.wait(isEv('call', (e) => !e.repeat && !e.folge), 20000, 0, 'dispatch call');
      await a.wait((s) => s.t === 'snap' && s.pt.some((p) => p.id === call.id), 4000, a.indexOf(call));
      const fromA = a.mark();
      b.send({ t: 'ack', id: call.id });
      const ack = await a.wait(isEv('ack', (e) => e.id === call.id), 4000, fromA, 'ack');
      assert.equal(ack.by, b.id);
      assert.equal(ack.slot, b.slot);
      assert.equal(ack.bonus, RESCUE.ackBonus, 'quick ack bonus');
      await b.wait(isEv('ack', (e) => e.id === call.id), 4000, 0, 'ack on the acking client');
      const i = a.indexOf(ack);
      const after = await a.snapAfter(i);
      assert.equal(after.earned - a.snapBefore(i).earned, RESCUE.ackBonus);
      assert.equal(ptIn(after, call.id).ack, b.id);

      // later acks (by anyone, including the same rescuer) are ignored
      const fa = a.mark(), fb = b.mark();
      a.send({ t: 'ack', id: call.id });
      b.send({ t: 'ack', id: call.id });
      await Promise.all([a.barrier(), b.barrier()]);
      assert.equal(a.events(fa, 'ack').length, 0, 'second ack ignored');
      assert.equal(b.events(fb, 'ack').length, 0, 'repeated ack ignored');
      const later = await a.nextSnap();
      assert.equal(ptIn(later, call.id).ack, b.id);
      assert.equal(later.earned, after.earned);

      // whoever runs a tourist over has already "taken" the call
      const P = quietSpots(m)[1];
      const own = await injure(a, m, P.x, P.z);
      const fb2 = b.mark();
      b.send({ t: 'ack', id: own.id });
      await b.barrier();
      assert.equal(b.events(fb2, 'ack').length, 0, 'pre-acked call cannot be taken');
      assert.equal(ptIn(await b.nextSnap(), own.id).ack, a.id);
    } finally { close(); }
  });

  test('heli: request, busy, landing-zone rules, landing and RTH handover', { timeout: 90000 }, async () => {
    const { cs: [a, b], m, start, close } = await patrol(2, 'Heli');
    let keep = null;
    try {
      const site = heliSite(m, start.vehicles);
      assert.ok(site, 'found a patient spot with a usable landing zone nearby');
      const { P, Q, S, O, F } = site;
      const call = await injure(a, m, P.x, P.z);
      const id = call.id;
      const call2 = await injure(a, m, r2(P.x + 3), r2(P.z + 3));

      stand(a, m, r2(P.x + 2), P.z);
      let from = a.mark();
      a.send({ t: 'heli', id });
      const inb = await a.wait(isEv('heli', (e) => e.state === 'inbound' && e.id === id), 4000, from, 'heli inbound');
      assert.equal(inb.by, a.id);
      assert.equal(inb.eta, RESCUE.heliEta);
      assert.equal(inb.needed, !!INJURIES[call.inj].heli);
      const s1 = await a.snapAfter(a.indexOf(inb));
      assert.equal(s1.he.s, 'inbound');
      assert.equal(s1.he.pt, id);
      assert.equal(s1.he.lz, null);
      assert.equal(ptIn(s1, id).he, true);

      // one helicopter at a time
      from = a.mark();
      a.send({ t: 'heli', id: call2.id });
      await a.wait(isEv('heliBusy'), 4000, from, 'heliBusy');
      assert.equal(a.events(from, 'heli').length, 0);

      // landing zone: steep / obstructed / too far are refused with a reason
      for (const [spot, reason] of [[S, 'steep'], [O, 'obstacles'], [F, 'far']]) {
        stand(a, m, spot.x, spot.z);
        from = a.mark();
        a.send({ t: 'lz' });
        const bad = await a.wait(isEv('lzBad'), 4000, from, `lzBad ${reason}`);
        assert.equal(bad.reason, reason, `LZ at ${spot.x},${spot.z}`);
        assert.equal(a.events(from, 'lz').length, 0);
      }
      // ...a flat, open spot near the patient is accepted
      stand(a, m, Q.x, Q.z);
      from = a.mark();
      a.send({ t: 'lz' });
      const lz = await a.wait(isEv('lz'), 4000, from, 'lz accepted');
      assert.equal(lz.x, Q.x);
      assert.equal(lz.z, Q.z);
      assert.equal(lz.by, a.id);
      const s2 = await a.snapAfter(a.indexOf(lz));
      assert.deepEqual(s2.he.lz, [lz.x, lz.y, lz.z]);
      assert.equal(s2.he.m, a.id);
      keep = setInterval(() => stand(a, m, Q.x, Q.z), 500); // the marshal stays in the LZ

      // nobody can re-mark the LZ while one is set
      stand(b, m, r2(P.x + 1), P.z);
      const fb = b.mark();
      b.send({ t: 'lz' });
      await b.barrier();
      assert.equal(b.events(fb, 'lz').length + b.events(fb, 'lzBad').length, 0, 'second LZ ignored');

      // meanwhile B gives first aid
      for (const st of INJURIES[call.inj].steps) await treatStep(b, id, st);
      await b.wait(isEv('freed', (e) => e.id === id), 4000, fb, 'freed');

      const landed = await a.wait(isEv('heli', (e) => e.state === 'landed'), 45000, from, 'heli landed');
      assert.equal(landed.id, id);
      const s3 = await a.snapAfter(a.indexOf(landed));
      assert.equal(s3.he.s, 'landed');
      assert.ok(Math.hypot(s3.he.p[0] - Q.x, s3.he.p[2] - Q.z) < 0.5, 'landed on the LZ');

      // the crew carries the freed patient (< 30 m away) aboard and flies to hospital
      const board = await a.wait(isEv('heliBoard', (e) => e.id === id), 15000, a.indexOf(landed), 'heliBoard');
      assert.equal(board.sled, null);
      const del = await a.wait(isEv('delivered', (e) => e.id === id), 10000, a.indexOf(board), 'delivered by heli');
      assert.equal(del.transport, 'rth');
      assert.equal(del.by, a.id, 'credited to the marshal');
      const need = !!INJURIES[call.inj].heli;
      const expect = need ? 90 + del.condition * 0.7 : 25 + del.condition * 0.4;
      assert.ok(Math.abs(del.reward - expect) <= 1, `reward ${del.reward} vs ${expect}`);
      const leave = await a.wait(isEv('heli', (e) => e.state === 'leaving'), 4000, a.indexOf(board));
      assert.equal(leave.why, 'done');
      const s4 = await a.snapAfter(a.indexOf(del));
      assert.equal(ptIn(s4, id), undefined, 'patient left the mountain');
    } finally { clearInterval(keep); close(); }
  });

  test('probe & dig: miss far away, no digging before a probe hit, hit then dig out', { timeout: 60000 }, async () => {
    const { cs: [a], m, close } = await patrol(1, 'Probe');
    try {
      // bury a patient deterministically: tourist on a slide path + a controlled release from above
      const zone = [...m.avalanches].sort((x, y) => y.length - x.length)[0];
      const pa = pointAlong(zone.path, 80);
      const P = { x: r2(pa.x), z: r2(pa.z) };
      assert.ok(distToPolyline(zone.path, P.x, P.z).dist < zone.width * 0.5);
      const call = await injure(a, m, P.x, P.z);
      const id = call.id;
      const R = zone.release;
      a.send({ t: 'charge', p: [R.x, m.heightAt(R.x, R.z) + 0.5, R.z], v: [0, 0, 0] });
      await a.wait(isEv('avalanche', (e) => e.zone === zone.id && e.controlled), 10000, 0, 'controlled avalanche');
      const bur = await a.wait(isEv('patientBuried', (e) => e.id === id), 15000, 0, 'patient buried');
      let pt = ptIn(await a.snapAfter(a.indexOf(bur)), id);
      assert.equal(pt.s, 'buried');
      assert.equal(pt.ty, 'buried');
      assert.equal(pt.inj, 'burial');
      assert.equal(pt.pb, false);
      assert.equal(pt.dp, null, 'depth unknown before the probe hit');
      assert.equal(pt.o, false);

      stand(a, m, r2(P.x + 2), P.z);
      // probing 2.6 m from the victim: miss
      let from = a.mark();
      a.send({ t: 'probe', p: [r2(P.x + 2.6), P.z] });
      const miss = await a.wait(isEv('probeMiss'), 4000, from, 'probeMiss');
      assert.equal(miss.by, a.id);
      assert.deepEqual([miss.x, miss.z], [r2(P.x + 2.6), P.z]);
      assert.equal(a.events(from, 'probeHit').length, 0);
      // a second strike right away (< 0.3 s) is ignored
      from = a.mark();
      a.send({ t: 'probe', p: [r2(P.x + 2.6), P.z] });
      await a.barrier();
      assert.equal(a.events(from, 'probeMiss').length, 0, 'rapid probe ignored');

      // probing more than 3 m from where I stand: ignored (no hit, no miss)
      await sleep(400); // server: min 0.3 s between probes
      from = a.mark();
      a.send({ t: 'probe', p: [r2(P.x - 1.2), P.z] }); // 3.2 m from me, 1.2 m from the victim
      await a.barrier();
      assert.equal(a.events(from, 'probeHit').length + a.events(from, 'probeMiss').length, 0, 'out-of-reach probe ignored');

      // digging before a probe hit makes no progress
      from = a.mark();
      for (let k = 0; k < 20; k++) a.send({ t: 'work', kind: 'patient', id, dt: 0.35 });
      await a.barrier();
      assert.equal(a.events(from, 'extracted').length, 0, 'no extraction without a probe hit');
      pt = ptIn(await a.nextSnap(), id);
      assert.equal(pt.pr, 0, 'no dig progress');
      assert.equal(pt.s, 'buried');

      // probe hit within RESCUE.probeHitRadius
      await sleep(400);
      from = a.mark();
      a.send({ t: 'probe', p: [r2(P.x + 0.4), r2(P.z - 0.3)] });
      const hit = await a.wait(isEv('probeHit', (e) => e.id === id), 4000, from, 'probeHit');
      assert.equal(hit.by, a.id);
      assert.ok(hit.depth >= 0.6 && hit.depth <= 1.8, `depth ${hit.depth}`);
      pt = ptIn(await a.snapAfter(a.indexOf(hit)), id);
      assert.equal(pt.pb, true);
      assert.equal(pt.dp, hit.depth);
      const need = DIG_TIME * (0.55 + hit.depth * 0.6);
      assert.equal(pt.need, r2(need));

      // now digging works; it takes exactly workNeed seconds of shovelling
      let n = 0, prog = 0;
      while (prog < need) { prog += 0.35; n++; }
      from = a.mark();
      // the server only credits as much shovelling as wall-clock time allows, so pace the messages
      for (let k = 0; k < n - 1; k++) { a.send({ t: 'work', kind: 'patient', id, dt: 0.35 }); await sleep(360); }
      await a.barrier();
      assert.equal(a.events(from, 'extracted').length, 0, 'not out yet');
      await sleep(360);
      a.send({ t: 'work', kind: 'patient', id, dt: 0.35 });
      const ex = await a.wait(isEv('extracted', (e) => e.id === id), 4000, from, 'extracted');
      assert.equal(ex.by, a.id);
      assert.equal(ex.inj, 'burial');
      pt = ptIn(await a.snapAfter(a.indexOf(ex)), id);
      assert.equal(pt.s, 'waiting');
      assert.equal(pt.o, true);
    } finally { close(); }
  });

  test('rear rope: second rescuer on the akja, exclusivity, release and drop', { timeout: 30000 }, async () => {
    const { cs: [a, b, c], m, start, close } = await patrol(3, 'Akja');
    try {
      const [s1, s2] = start.sleds;
      stand(a, m, r2(s1.x + 1), s1.z);
      let fa = a.mark();
      a.send({ t: 'grabSled', id: s1.id });
      await a.wait(isEv('sled', (e) => e.id === s1.id && e.owner === a.id), 4000, fa, 'A grabs sled');
      stand(b, m, r2(s1.x - 1), r2(s1.z + 1));
      stand(c, m, s1.x, r2(s1.z + 2));

      // nobody holds the rear of an unowned sled
      let fb = b.mark();
      b.send({ t: 'rear', id: s2.id });
      await b.barrier();
      assert.equal(b.events(fb, 'sledRear').length, 0, 'no rear on an unowned sled');

      fb = b.mark();
      b.send({ t: 'rear', id: s1.id });
      const rear = await b.wait(isEv('sledRear', (e) => e.id === s1.id), 4000, fb, 'B takes the rear');
      assert.equal(rear.rear, b.id);
      await a.wait(isEv('sledRear', (e) => e.id === s1.id && e.rear === b.id), 4000, 0, 'owner sees the rear');
      const sn = await b.snapAfter(b.indexOf(rear));
      assert.equal(sn.sl.find((s) => s.id === s1.id).r, b.id);
      assert.equal(sn.sl.find((s) => s.id === s1.id).o, a.id);

      // not twice, not by a third rescuer, not by the owner
      fb = b.mark();
      const fc = c.mark();
      fa = a.mark();
      b.send({ t: 'rear', id: s1.id });
      c.send({ t: 'rear', id: s1.id });
      a.send({ t: 'rear', id: s1.id });
      await Promise.all([a.barrier(), b.barrier(), c.barrier()]);
      assert.equal(b.events(fb, 'sledRear').length, 0, 'B cannot take it twice');
      assert.equal(c.events(fc, 'sledRear').length, 0, 'C cannot take a taken rear');
      assert.equal(a.events(fa, 'sledRear').length, 0, 'owner cannot take its own rear');

      // on a rear rope you cannot grab a sled of your own
      fb = b.mark();
      b.send({ t: 'grabSled', id: s2.id });
      await b.barrier();
      assert.equal(b.events(fb, 'sled').length, 0, 'no grabbing while on a rear rope');
      assert.equal((await b.nextSnap()).sl.find((s) => s.id === s2.id).o, null);

      // rearOff lets go (once)
      fb = b.mark();
      b.send({ t: 'rearOff' });
      const off = await b.wait(isEv('sledRear', (e) => e.id === s1.id), 4000, fb, 'rearOff');
      assert.equal(off.rear, null);
      fb = b.mark();
      b.send({ t: 'rearOff' });
      await b.barrier();
      assert.equal(b.events(fb, 'sledRear').length, 0, 'second rearOff is a no-op');
      assert.equal((await b.nextSnap()).sl.find((s) => s.id === s1.id).r, null);

      // back on the rope, then the owner drops the sled: the rear is cleared too
      fb = b.mark();
      b.send({ t: 'rear', id: s1.id });
      await b.wait(isEv('sledRear', (e) => e.id === s1.id && e.rear === b.id), 4000, fb, 'rear again');
      fb = b.mark();
      a.send({ t: 'dropSled' });
      await b.wait(isEv('sled', (e) => e.id === s1.id && e.owner === null), 4000, fb, 'sled dropped');
      const cleared = await b.wait(isEv('sledRear', (e) => e.id === s1.id), 4000, fb, 'rear cleared on drop');
      assert.equal(cleared.rear, null);
      const sd = (await b.snapAfter(b.indexOf(cleared))).sl.find((s) => s.id === s1.id);
      assert.equal(sd.o, null);
      assert.equal(sd.r, null);

      // B is free again
      fb = b.mark();
      b.send({ t: 'grabSled', id: s2.id });
      await b.wait(isEv('sled', (e) => e.id === s2.id && e.owner === b.id), 4000, fb, 'B grabs a sled now');
    } finally { close(); }
  });

  test('sweep: stragglers at closing, range check, bonus, protocol and stragglersMissed in results', { timeout: 140000 }, async () => {
    const { cs: [a], m, close } = await patrol(1, 'Sweep');
    try {
      // one documented patient that is still on the mountain at the end of the shift
      const P = slopedSpot(m);
      const call = await injure(a, m, P.x, P.z);
      const id = call.id;
      const steps = INJURIES[call.inj].steps;
      stand(a, m, r2(P.x + 1), P.z);
      let from = a.mark();
      a.send({ t: 'secure', id });
      await a.wait(isEv('secured', (e) => e.id === id), 4000, from, 'secured');
      from = a.mark();
      a.send({ t: 'treat', id, step: plainWrongStep(steps) });
      await a.wait(isEv('treatWrong', (e) => e.id === id), 4000, from, 'treatWrong');
      await treatStep(a, id, steps[0]);

      // closing sweep at RESCUE.sweepAt of the shift: 2 + players stragglers
      const sw = await a.wait(isEv('sweep'), (SHIFT + 20) * 1000, 0, 'sweep');
      const n = 2 + Math.min(2, 1);
      assert.equal(sw.n, n);
      const sn = await a.snapAfter(a.indexOf(sw));
      assert.ok(sn.el >= SHIFT * RESCUE.sweepAt - 0.2, `sweep at ${sn.el}`);
      assert.equal(sn.sg.length, n);
      const g = sn.sg[0];
      assert.ok(Number.isFinite(g.x) && Number.isFinite(g.z) && typeof g.n === 'string');

      // more than 12 m away: ignored
      stand(a, m, r2(g.x + 14), g.z);
      from = a.mark();
      a.send({ t: 'sweepNpc', id: g.id });
      await a.barrier();
      assert.equal(a.events(from, 'swept').length, 0, 'sweep from 14 m ignored');

      stand(a, m, r2(g.x + 3), g.z);
      from = a.mark();
      a.send({ t: 'sweepNpc', id: g.id });
      const swept = await a.wait(isEv('swept', (e) => e.id === g.id), 4000, from, 'swept');
      assert.equal(swept.by, a.id);
      assert.equal(swept.bonus, RESCUE.sweepBonus);
      const i = a.indexOf(swept);
      const after = await a.snapAfter(i);
      assert.equal(after.earned - a.snapBefore(i).earned, RESCUE.sweepBonus);
      assert.equal(after.sg.length, n - 1);
      assert.ok(!after.sg.some((x) => x.id === g.id));
      from = a.mark();
      a.send({ t: 'sweepNpc', id: g.id });
      await a.barrier();
      assert.equal(a.events(from, 'swept').length, 0, 'a straggler is sent home only once');

      // end of shift
      const res = await a.wait((x) => x.t === 'results', 30000, 0, 'results');
      assert.equal(res.stragglers, n);
      assert.equal(res.stragglersMissed, n - 1);
      assert.equal(res.penalties, 10 + (n - 1) * RESCUE.stragglerPenalty, 'run-over tourist + missed stragglers');
      assert.ok(Array.isArray(res.protocol) && res.protocol.length >= 1);
      for (const row of res.protocol) {
        assert.equal(typeof row.name, 'string');
        assert.ok(INJURIES[row.inj], `protocol injury ${row.inj}`);
        assert.ok(['open', 'airlift', 'akja', 'akja2', 'rtw', 'rth'].includes(row.transport), row.transport);
        assert.ok(Number.isInteger(row.condition) && row.condition >= 0 && row.condition <= 100);
        assert.ok(Array.isArray(row.helpers));
        assert.ok(row.mins >= 1);
      }
      const row = res.protocol.find((r) => r.name === call.name);
      assert.ok(row, 'our patient is in the protocol');
      assert.equal(row.transport, 'open');
      assert.equal(row.inj, call.inj);
      assert.equal(row.secured, true);
      assert.equal(row.wrong, 1);
      assert.equal(row.steps, 1);
      assert.equal(row.total, steps.length);
      assert.equal(row.folge, false);
      assert.ok(row.helpers.includes(a.name));
      const me = res.players.find((p) => p.id === a.id);
      assert.equal(me.stats.sweeps, 1);
      assert.equal(me.stats.secures, 1);
      assert.equal(me.stats.treats, 1);
    } finally { close(); }
  });

  // ---------------------------------------------------------------- regression tests for bugs found in review
  test('rear rope: the rear is released when the sled owner leaves', {
    timeout: 30000,
  }, async () => {
    const { cs: [a, b], m, start, close } = await patrol(2, 'Leave');
    try {
      const [s1] = start.sleds;
      stand(a, m, r2(s1.x + 1), s1.z);
      stand(b, m, r2(s1.x - 1), s1.z);
      a.send({ t: 'grabSled', id: s1.id });
      await b.wait(isEv('sled', (e) => e.id === s1.id && e.owner === a.id), 4000, 0, 'A grabs');
      b.send({ t: 'rear', id: s1.id });
      await b.wait(isEv('sledRear', (e) => e.id === s1.id && e.rear === b.id), 4000, 0, 'B on rear');
      const fb = b.mark();
      a.close();
      await b.wait((x) => x.t === 'lobby' && x.players.length === 1, 4000, fb, 'A left');
      const s = (await b.nextSnap()).sl.find((x) => x.id === s1.id);
      assert.equal(s.o, null);
      assert.equal(s.r, null, 'nobody holds the rear rope of an ownerless sled');
    } finally { close(); }
  });

  test('heli: an LZ with an obstacle just outside the 3x3 collider cells is refused', {
    timeout: 30000,
  }, async (t) => {
    const { cs: [a], m, start, close } = await patrol(1, 'Rock');
    try {
      const all = [
        ...m.trees.map((x) => ({ x: x.x, z: x.z, r: 0.55 * x.s })), ...m.rocks.map((x) => ({ x: x.x, z: x.z, r: 1.1 * x.s })),
        ...m.towers.map((x) => ({ x: x.x, z: x.z, r: 0.7 })),
      ];
      let H = null;
      for (let x = -250; x <= 250 && !H; x += 3) for (let z = 120; z <= 820 && !H; z += 3) {
        if (lzProblem(m, start.vehicles, x, z, null) !== null) continue;
        if (all.some((c) => Math.hypot(c.x - x, c.z - z) < RESCUE.lzClear + c.r)) H = { x, z };
      }
      if (!H) { t.skip('no LZ with a hidden obstacle on this mountain'); return; }
      const call = await injure(a, m, H.x + 5, H.z);
      stand(a, m, H.x + 6, H.z);
      a.send({ t: 'heli', id: call.id });
      await a.wait(isEv('heli', (e) => e.state === 'inbound'), 4000, 0, 'heli inbound');
      stand(a, m, H.x, H.z);
      const from = a.mark();
      a.send({ t: 'lz' });
      const r = await a.wait((e) => e.t === 'ev' && (e.k === 'lz' || e.k === 'lzBad'), 4000, from, 'lz answer');
      assert.equal(r.k, 'lzBad', `LZ at ${H.x},${H.z} has an obstacle within lzClear`);
      assert.equal(r.reason, 'obstacles');
    } finally { close(); }
  });
});
