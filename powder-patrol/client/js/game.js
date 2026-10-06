// One patrol shift: local physics, networked entities, rescue loop, avalanches, HUD.
import * as THREE from 'three';
import { Skier } from './skier.js';
import { makeToboggan, makeHelicopter, makeCharge, makeChair } from './models.js';
import { Character } from './characters.js';
import { TOURISTS } from './assets.js';
import { Slide } from './avalanche.js';
import { distToPolyline } from '/shared/mountain.js';
import { PLAYER_SEND_RATE, PATIENT_TYPES, AIR_SUPPLY, DIG_TIME, VEHICLE_TYPES } from '/shared/constants.js';
import { VehicleView, VehiclePhysics } from './vehicles.js';

const lerp = (a, b, t) => a + (b - a) * t;
const lerpAngle = (a, b, t) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;
const v3 = new THREE.Vector3();
const fwd = new THREE.Vector3();
const PATIENT_TITLE = { injured: 'Injured skier', tree: 'Stuck in a tree well', buried: 'Buried by avalanche!' };

export class Game {
  constructor(app, start) {
    this.app = app;
    this.m = app.mountain;
    this.r = app.renderer;
    this.net = app.net;
    this.ui = app.ui;
    this.sound = app.sound;
    this.fx = app.fx;
    this.world = app.world;
    this.cfg = start.cfg;
    this.day = start.day;
    this.startAt = start.startAt;
    this.upgrades = start.upgrades || {};
    this.mountainName = start.mountainName;
    this.myId = app.net.id;
    this.scene = this.r.scene;
    this.group = new THREE.Group();
    this.scene.add(this.group);

    const me = app.lobbyPlayers().find((p) => p.id === this.myId) || { color: '#e63946', hat: 'beanie', char: 'sam', name: 'You' };
    this.meInfo = me;
    this.skier = new Skier(this.m);
    this.skier.upgrades = this.upgrades;
    const sp = this.m.sites.spawn;
    const slot = app.lobbyPlayers().findIndex((p) => p.id === this.myId);
    this.skier.spawn(sp.x + (slot - 1.5) * 3, sp.z, 0);
    this.myModel = new Character(app.assets, { model: me.char, color: me.color });
    this.group.add(this.myModel.root);
    this.myChair = makeChair();
    this.myChair.visible = false;
    this.group.add(this.myChair);

    this.remotes = new Map();
    this.patients = new Map();
    this.sleds = new Map();
    this.charges = new Map();
    this.slides = [];
    this.helis = [];
    this.pings = [];
    this.warnZones = new Map();
    this.camYaw = 0;
    this.camPitch = 0.28;
    this.lastMouse = -10;
    this.sendAcc = 0;
    this.hold = { key: null, acc: 0, send: 0 };
    this.chargesLeft = 2;
    this.earned = 0;
    this.danger = 1;
    this.lastCount = 99;
    this.bumpCd = 0;
    this.beepT = 0;
    this.beepIdx = 0;
    this.respawnHold = 0;
    this.shake = 0;
    this.time = 0;
    this.seenLines = new Set();
    this.lines = new Map();
    this.bubbles = new Map();
    this.ended = false;
    this.buriedAir = AIR_SUPPLY;
    this.sprayAcc = 0;
    this.smokeAcc = 0;
    this.hurtT = 0;
    this.ropeGeo = new THREE.BufferGeometry();
    this.ropeGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(8 * 6), 3));
    this.ropes = new THREE.LineSegments(this.ropeGeo, new THREE.LineBasicMaterial({ color: '#ffd23f' }));
    this.ropes.frustumCulled = false;
    this.group.add(this.ropes);
    this.vehicles = new Map();
    this.myVeh = null;
    for (const v of start.vehicles || []) this.ensureVehicle(v.id, v.type, v.x, v.y, v.z, v.yaw);
    for (const a of this.m.avalanches) this.world.setCornice(a.id, true);
    this.fx.clear();
    this.ui.prepareMap(this.m, this.mountainName);
    this.r.camera.position.set(this.skier.pos.x, this.skier.pos.y + 4, this.skier.pos.z - 7);
  }

  // ------------------------------------------------------------------ events
  onEvent(e) {
    const s = this.skier;
    switch (e.k) {
      case 'toast': this.ui.toast(e.text, e.kind === 'join' || e.kind === 'leave' ? 'info' : e.kind); break;
      case 'call': {
        this.sound.play('radio');
        if (e.line) this.lines.set(e.id, e.line);
        const d = Math.hypot(e.x - s.pos.x, e.z - s.pos.z);
        this.ui.toast(`📻 ${PATIENT_TITLE[e.type] || 'Emergency'}: ${e.name} · ${e.type === 'buried' ? '~' : ''}${Math.round(d)}m`, e.type === 'buried' ? 'alert' : 'info', 5);
        break;
      }
      case 'sled': {
        if (e.owner === this.myId && !s.sled) {
          const snap = this.net.latest();
          const sl = snap?.sl.find((x) => x.id === e.id);
          if (sl) s.attachSled(e.id, sl.p[0], sl.p[1], sl.p[2], sl.yaw, sl.pt !== null);
          else s.attachSled(e.id, s.pos.x, s.pos.y, s.pos.z - 2, 0, false);
          this.sound.play('clunk');
        } else if (e.owner !== this.myId && s.sled?.id === e.id) {
          s.detachSled();
        }
        break;
      }
      case 'freed':
        this.sound.play('load');
        if (e.by === this.myId) this.ui.toast('Patient ready — load them onto a toboggan!', 'good');
        this.showBubble(e.id, e.line, 4);
        break;
      case 'loaded':
        this.sound.play('load');
        if (s.sled?.id === e.sled) {
          s.sled.hasPatient = true;
          this.ui.banner('PATIENT LOADED', 'Get them to the clinic at the base — gently!', '', 2.6);
        }
        break;
      case 'ejected':
        this.sound.play('bad');
        if (e.by === this.myId) this.ui.banner('PATIENT EJECTED!', 'Pick them back up (E)', 'alert', 2);
        break;
      case 'delivered':
        this.sound.play('cash');
        this.ui.toast(`+$${e.reward} · ${e.name} delivered (${e.condition}%)`, 'money', 4);
        if (s.sled && e.by === this.myId) {
          s.sled.hasPatient = false;
          this.ui.banner(`+$${e.reward}`, `${e.name} is safe!`, '', 2.2);
        }
        break;
      case 'airlift':
        this.sound.play('bad');
        this.spawnHeli(e.x, e.y, e.z, null);
        break;
      case 'avalancheWarn': {
        const a = this.m.avalanches[e.zone];
        this.sound.play('crack', this.distVol(a.release.x, a.release.z, 600));
        this.warnZones.set(e.zone, this.time + 12);
        this.ui.banner('CORNICE CRACKING!', `${a.name} is about to slide`, 'alert', 3);
        break;
      }
      case 'avalanche': {
        const a = this.m.avalanches[e.zone];
        this.slides.push(new Slide(this.scene, this.m, e.zone, e.t0, this.fx));
        this.world.setCornice(e.zone, false);
        const vol = this.distVol(a.release.x, a.release.z, 700);
        this.sound.play('rumble', Math.max(0.35, vol));
        this.shake = Math.max(this.shake, 0.3 + vol * 0.6);
        if (!e.controlled) this.ui.banner('AVALANCHE!', a.name, 'alert', 3);
        break;
      }
      case 'boom': {
        this.fx.explosion(e.x, e.y, e.z);
        const d = Math.hypot(e.x - s.pos.x, e.y - s.pos.y, e.z - s.pos.z);
        this.sound.play('boom', Math.min(1, 40 / Math.max(10, d)));
        this.shake = Math.max(this.shake, Math.max(0, 1.2 - d / 60));
        if (d < 25) this.r.grade.uniforms.uFlash.value = Math.max(this.r.grade.uniforms.uFlash.value, 0.5 * (1 - d / 25));
        if (d < 7 && s.mode !== 'buried' && s.mode !== 'lift') {
          const k = (7 - d) * 2.2;
          s.vel.x += (s.pos.x - e.x) / (d || 1) * k;
          s.vel.z += (s.pos.z - e.z) / (d || 1) * k;
          s.vel.y += k * 0.8;
          s.mode = 'air';
          s.crash('boom');
        }
        break;
      }
      case 'buried':
        if (e.id !== this.myId) this.sound.play('radio');
        break;
      case 'unburied':
        if (e.id === this.myId) {
          s.unbury();
          this.ui.buried(false);
          this.ui.banner('DUG OUT!', 'Thanks, team!', '', 2);
        }
        this.sound.play('dig');
        break;
      case 'evac': {
        const pl = e.id === this.myId ? s.pos : this.remotes.get(e.id)?.pos;
        if (pl) this.spawnHeli(pl.x, pl.y, pl.z, e.id === this.myId ? null : e.id);
        if (e.id === this.myId) {
          this.ui.buried(false);
          this.ui.banner('HELI EVAC', 'The patrol pays the bill (-$20)', 'alert', 3);
          setTimeout(() => { if (!this.disposed) { this.dropSled(); this.skier.spawn(this.m.sites.spawn.x, this.m.sites.spawn.z, 0); } }, 2500);
        }
        break;
      }
      case 'charges': this.chargesLeft = e.n; break;
      case 'veh': {
        const view = this.vehicles.get(e.id);
        if (view) view.seats = e.seats;
        const idx = e.seats.indexOf(this.myId);
        if (idx >= 0 && (!this.myVeh || this.myVeh.id !== e.id || this.myVeh.seat !== idx)) this.enterVehicle(e.id, idx);
        else if (idx < 0 && this.myVeh && this.myVeh.id === e.id) this.leaveVehicle(false);
        break;
      }
      case 'vehEject':
        if (this.myVeh && this.myVeh.id === e.id && e.riders.includes(this.myId)) this.leaveVehicle(true, e.v);
        break;
      case 'ambulance':
        this.sound.play('load');
        if (e.by === this.myId && s.sled) {
          s.sled.hasPatient = false;
          this.ui.banner('PATIENT IN THE RESCUE TRUCK', 'Drive them down to the clinic!', '', 2.6);
        }
        break;
      case 'bumped':
        s.crash('bumped');
        s.vel.x += e.vx * 0.6; s.vel.z += e.vz * 0.6;
        this.sound.play('crash');
        this.hurtT = 0.5;
        break;
      case 'ping': {
        this.pings.push({ x: e.p[0], y: e.p[1], z: e.p[2], color: e.color, name: e.name, until: this.time + 9 });
        if (this.pings.length > 8) this.pings.shift();
        this.sound.play('whistle');
        break;
      }
    }
  }

  distVol(x, z, range) {
    const d = Math.hypot(x - this.skier.pos.x, z - this.skier.pos.z);
    return Math.max(0, 1 - d / range);
  }

  showBubble(patientId, text, dur) {
    this.bubbles.set(patientId, { text, until: this.time + dur });
  }

  spawnHeli(x, y, z, playerId) {
    const h = makeHelicopter();
    const from = new THREE.Vector3(x + 260, y + 120, z + 200);
    h.root.position.copy(from);
    this.group.add(h.root);
    this.helis.push({ h, from, target: new THREE.Vector3(x, y, z), t: 0, playerId });
    this.sound.play('heli', this.distVol(x, z, 500) * 0.8 + 0.2);
  }

  ensureVehicle(id, type, x, y, z, yaw) {
    let view = this.vehicles.get(id);
    if (!view) {
      view = new VehicleView(this.app.assets, type, id);
      view.seats = VEHICLE_TYPES[type].seats.map(() => null);
      view.setPose(x, y, z, yaw, 0, 0);
      view.speed = 0;
      view.hornWas = false;
      this.group.add(view.root);
      this.vehicles.set(id, view);
    }
    return view;
  }

  enterVehicle(id, seat) {
    const view = this.vehicles.get(id);
    if (!view) return;
    const s = this.skier;
    const T = VEHICLE_TYPES[view.type];
    if (s.sled && !T.tow) this.dropSled();
    s.mode = 'vehicle';
    s.seat = seat;
    s.vel.set(0, 0, 0);
    this.fx.trails.cut('meL'); this.fx.trails.cut('meR');
    const r = view.root;
    this.myVeh = { id, seat, phys: seat === 0 ? new VehiclePhysics(this.m, view.type, r.position.x, r.position.y, r.position.z, r.rotation.y) : null };
    this.sound.play('clunk');
    if (seat === 0) {
      this.sound.play('engine');
      this.ui.toast(`${T.label}: W/S drive · A/D steer · Space handbrake · H horn · E get out`, 'info', 4);
    } else this.ui.toast(`Riding along in the ${T.label} — E to hop off`, 'info', 3);
  }

  leaveVehicle(crash, vel) {
    const s = this.skier;
    const mv = this.myVeh;
    if (!mv) return;
    const view = this.vehicles.get(mv.id);
    this.myVeh = null;
    s.anchor = null;
    if (!crash) this.net.send({ t: 'exitVeh' });
    if (view) {
      const yaw = view.root.rotation.y;
      const side = mv.seat % 2 === 0 ? 1 : -1;
      const x = view.root.position.x + Math.cos(yaw) * 1.7 * side, z = view.root.position.z - Math.sin(yaw) * 1.7 * side;
      s.pos.set(x, this.m.heightAt(x, z) + (crash ? 1.2 : 0.05), z);
      s.heading = yaw;
    }
    s.mode = 'ski';
    if (crash) {
      const v = vel || [0, 4, 0];
      s.vel.set(v[0] * 0.8 + (Math.random() - 0.5) * 4, Math.max(4, v[1]), v[2] * 0.8 + (Math.random() - 0.5) * 4);
      s.mode = 'air';
      s.crash('vehicle');
      this.ui.banner('WIPEOUT!', 'Everybody off the vehicle', 'alert', 1.8);
    } else s.vel.set(0, 0, 0);
    this.sound.stopEngine?.();
  }

  dropSled() {
    if (!this.skier.sled) return;
    this.net.send({ t: 'dropSled' });
    this.skier.detachSled();
  }

  // ------------------------------------------------------------------ main update
  update(dt, input) {
    this.time += dt;
    const s = this.skier;
    const net = this.net;
    const serverNow = net.serverNow();
    const elapsed = serverNow - this.startAt;
    const locked = this.ended || elapsed < 0 || input.blocked;

    // countdown
    if (elapsed < 0) {
      const n = Math.ceil(-elapsed);
      if (n !== this.lastCount && n <= 4) {
        this.lastCount = n;
        this.ui.banner(`${n}`, 'Shift starts — grab a toboggan at the rack!', '', 1.1);
        this.sound.play('tick');
      }
    } else if (this.lastCount !== 0) {
      this.lastCount = 0;
      this.ui.banner('LIFTS ARE OPEN!', 'Follow the red smoke · Tab = trail map', '', 2.4);
      this.sound.play('go');
    }

    // camera look
    const sens = 0.0022 * (this.app.settings.sens || 1);
    if (input.mdx || input.mdy) {
      this.camYaw -= input.mdx * sens;
      this.camPitch += input.mdy * sens * (this.app.settings.invert ? -1 : 1);
      this.camPitch = THREE.MathUtils.clamp(this.camPitch, -0.45, 1.25);
      if (Math.abs(input.mdx) + Math.abs(input.mdy) > 1) this.lastMouse = this.time;
    }

    // local physics
    const inp = locked ? { left: false, right: false, up: false, down: false, jump: false } : {
      left: input.held('KeyA') || input.held('ArrowLeft'),
      right: input.held('KeyD') || input.held('ArrowRight'),
      up: input.held('KeyW') || input.held('ArrowUp'),
      down: input.held('KeyS') || input.held('ArrowDown'),
      jump: input.pressed('Space'),
    };
    s.update(dt, inp);
    this.handleSkierEvents();
    if (this.myVeh) this.driveVehicle(dt, inp, input, locked);

    if (!locked) this.handleActions(input, dt);
    else this.ui.prompt(null);

    // snapshot driven
    const br = net.bracket();
    const latest = net.latest();
    if (latest) {
      this.earned = latest.earned;
      this.danger = latest.danger;
    }
    this.updateVehicles(dt, br, latest);
    this.updateRemotes(dt, br, latest);
    this.updateSleds(dt, br, latest);
    this.updatePatients(dt, latest);
    this.updateCharges(dt, br);
    this.updateSlides(dt, serverNow);
    this.updateHelis(dt);
    this.updateMe(dt, latest);
    this.updateRopes();

    // send state
    this.sendAcc += dt;
    if (this.sendAcc >= 1 / PLAYER_SEND_RATE) {
      this.sendAcc = 0;
      const msg = { t: 'st', p: [s.pos.x, s.pos.y, s.pos.z].map((v) => Math.round(v * 100) / 100), yaw: Math.round(s.heading * 100) / 100, a: s.animCode(), sp: Math.round(s.speed * 10) / 10 };
      if (s.sled) msg.sled = { id: s.sled.id, p: [s.sled.pos.x, s.sled.pos.y, s.sled.pos.z].map((v) => Math.round(v * 100) / 100), yaw: Math.round(s.sled.yaw * 100) / 100, tip: s.sled.tip };
      const ph = this.myVeh?.phys;
      if (ph) msg.veh = { id: this.myVeh.id, p: [ph.pos.x, ph.pos.y, ph.pos.z].map((v) => Math.round(v * 100) / 100), r: [ph.yaw, ph.pitch, ph.roll].map((v) => Math.round(v * 1000) / 1000), sp: Math.round(ph.speed * 10) / 10, horn: !!this.horn };
      net.send(msg);
    }

    // world + time of day
    const tod = THREE.MathUtils.clamp(elapsed / this.cfg.duration, 0, 1);
    const weather = Math.max(0, (this.danger - 1) / 4) * 0.6;
    this.r.setTimeOfDay(tod, weather);
    this.world.update(dt, this.time, tod, this.r.camera.position);
    this.fx.update(dt, this.r.camera.position, weather);
    this.updateCamera(dt);
    this.updateHud(tod, latest, br);
  }

  driveVehicle(dt, inp, input, locked) {
    const s = this.skier, mv = this.myVeh;
    const view = this.vehicles.get(mv.id);
    if (!view) return;
    this.horn = !locked && input.held('KeyH');
    if (mv.phys) {
      const ph = mv.phys;
      const vin = locked ? { left: false, right: false, up: false, down: false, jump: false } : { ...inp, jump: input.held('Space') };
      ph.update(dt, vin, (h) => {
        if (s.sled) { s.anchor = ph.hitch(); s.stepSled(h); }
      });
      for (const e of ph.events) {
        if (e.type === 'crash') {
          this.sound.play('crash');
          this.shake = Math.max(this.shake, 0.6);
          this.net.send({ t: 'vehCrash', vx: e.v[0], vy: e.v[1], vz: e.v[2] });
          if (s.sled?.hasPatient) this.net.send({ t: 'sledHit', mag: 12 });
        } else if (e.type === 'bonk') this.sound.play('bonk', Math.min(1, e.mag / 8));
        else if (e.type === 'land') this.sound.play('land', Math.min(1, e.impact / 10));
      }
      ph.events.length = 0;
      view.setPose(ph.pos.x, ph.pos.y, ph.pos.z, ph.yaw, ph.pitch, ph.roll);
      view.speed = ph.speed;
      view.steerVis = ph.steer;
      s.vel.copy(ph.vel);
      this.sound.updateEngine?.(true, ph.speed / VEHICLE_TYPES[view.type].maxSpeed, inp.up);
      // run over teammates
      for (const [id, r] of this.remotes) {
        if (r.a === 8 || r.a === 9 || r.a === 4) continue;
        if (ph.speed > 6 && Math.hypot(r.pos.x - ph.pos.x, r.pos.z - ph.pos.z) < VEHICLE_TYPES[view.type].radius + 0.4 && this.bumpCd <= 0) {
          this.bumpCd = 2;
          this.net.send({ t: 'bump', id, vx: ph.vel.x, vz: ph.vel.z });
          this.sound.play('bonk');
        }
      }
    }
    view.seatWorld(mv.seat, s.pos);
    s.heading = view.root.rotation.y;
  }

  updateVehicles(dt, br, latest) {
    if (!latest?.vh) return;
    for (const vh of latest.vh) {
      const view = this.ensureVehicle(vh.id, vh.ty, vh.p[0], vh.p[1], vh.p[2], vh.r[0]);
      view.seats = vh.s;
      view.cargo = vh.c;
      const driving = this.myVeh && this.myVeh.id === vh.id && this.myVeh.phys;
      if (!driving) {
        let pose = vh;
        let t = 1, prev = vh;
        if (br) {
          const pb = br.b.vh?.find((q) => q.id === vh.id) || vh;
          prev = br.a.vh?.find((q) => q.id === vh.id) || pb;
          pose = pb; t = br.t;
        }
        view.setPose(lerp(prev.p[0], pose.p[0], t), lerp(prev.p[1], pose.p[1], t), lerp(prev.p[2], pose.p[2], t),
          lerpAngle(prev.r[0], pose.r[0], t), lerp(prev.r[1], pose.r[1], t), lerp(prev.r[2], pose.r[2], t));
        view.speed = vh.sp;
        view.steerVis = 0;
        if (vh.h && !view.hornWas) this.sound.play('horn', this.distVol(vh.p[0], vh.p[2], 250));
        view.hornWas = vh.h;
      }
      view.update(dt, view.speed || 0, view.steerVis || 0, this.time);
    }
  }

  handleSkierEvents() {
    const s = this.skier;
    for (const e of s.events) {
      switch (e.type) {
        case 'crash':
          this.sound.play('crash', Math.min(1, 0.4 + e.speed / 20));
          this.fx.burst(s.pos.x, s.pos.y + 0.5, s.pos.z, 40, 6, 0.3, '#ffffff', 4);
          for (let i = 0; i < 8; i++) this.fx.puff.emit(s.pos.x, s.pos.y + 0.6, s.pos.z, (Math.random() - 0.5) * 6, 1 + Math.random() * 2, (Math.random() - 0.5) * 6, 0.7 + Math.random() * 0.6, 1 + Math.random(), '#ffffff');
          this.net.send({ t: 'crash' });
          this.shake = Math.max(this.shake, 0.35);
          this.hurtT = 0.4;
          this.fx.trails.cut('meL'); this.fx.trails.cut('meR');
          break;
        case 'land':
          this.sound.play('land', Math.min(1, e.impact / 10 + 0.2));
          this.fx.burst(s.pos.x, s.pos.y + 0.1, s.pos.z, 18, 4, 0.22, '#ffffff', 2);
          if (e.spin >= 0.4 || e.airT > 1.1) {
            const deg = Math.round(e.spin * 2) * 180;
            const txt = deg >= 180 ? `${deg}!` : 'BIG AIR!';
            this.ui.trick(e.airT > 1.4 && deg >= 180 ? `${txt} BIG AIR` : txt);
            this.sound.play('trick');
          }
          break;
        case 'jump': this.sound.play('jump'); break;
        case 'sledHit': this.net.send({ t: 'sledHit', mag: Math.round(e.mag * 10) / 10 }); this.sound.play('bonk'); break;
        case 'sledBonk': this.sound.play('bonk', Math.min(1, e.mag / 8)); break;
        case 'eject':
          this.net.send({ t: 'eject' });
          break;
        case 'lift': this.net.send({ t: 'lift' }); this.sound.play('clunk'); break;
        case 'liftExit': this.sound.play('clunk'); break;
      }
    }
    s.events.length = 0;
  }

  // ------------------------------------------------------------------ interactions
  findAction(latest) {
    const s = this.skier, m = this.m;
    if (s.mode === 'lift' || s.mode === 'buried' || s.mode === 'air') return null;
    const dist = (x, z) => Math.hypot(x - s.pos.x, z - s.pos.z);
    // digging out buried teammates
    if (latest) {
      for (const p of latest.pl) {
        if (p.id === this.myId || !p.b) continue;
        if (dist(p.b[0], p.b[2]) < 3.4) return { kind: 'player', id: p.id, label: 'Dig them out!', hold: true, need: DIG_TIME, progress: p.b[4] };
      }
      for (const p of latest.pt) {
        const d = dist(p.x, p.z);
        if (p.s === 'buried' && d < 3.4) return { kind: 'patient', id: p.id, label: `Dig out ${p.n}!`, hold: true, need: DIG_TIME, progress: p.pr };
        if (p.s === 'waiting' && !p.f && d < 3.4) return { kind: 'patient', id: p.id, label: `${PATIENT_TYPES[p.ty].verb} ${p.n}`, hold: true, need: PATIENT_TYPES[p.ty].time, progress: p.pr };
      }
      if (s.sled && !s.sled.hasPatient) {
        for (const p of latest.pt) {
          if (p.s !== 'waiting' || !p.f) continue;
          if (dist(p.x, p.z) < 5.5 || Math.hypot(p.x - s.sled.pos.x, p.z - s.sled.pos.z) < 5.5) return { kind: 'load', id: p.id, label: `Load ${p.n} onto the toboggan` };
        }
      }
      if (!s.sled) {
        for (const sl of latest.sl) {
          if (sl.o !== null) continue;
          if (dist(sl.p[0], sl.p[2]) < 4) return { kind: 'grab', id: sl.id, label: sl.pt !== null ? 'Grab toboggan (with patient!)' : 'Grab toboggan' };
        }
        for (const p of latest.pt) {
          if (p.s === 'waiting' && p.f && dist(p.x, p.z) < 6) return { kind: 'hint', label: 'Bring a toboggan from the summit rack!' };
        }
      }
    }
    for (const view of this.vehicles.values()) {
      const T = VEHICLE_TYPES[view.type];
      const d = dist(view.root.position.x, view.root.position.z);
      if (T.ambulance && s.sled?.hasPatient && !view.cargo && d < T.len * 0.5 + 5) return { kind: 'ambulance', id: view.id, label: `Load patient into the ${T.label}` };
      if (d < T.len * 0.5 + 1.8 && view.seats && view.seats.includes(null)) {
        const driverFree = view.seats[0] === null;
        return { kind: 'enterVeh', id: view.id, label: driverFree ? `Drive the ${T.label}` : `Ride along (${T.label})` };
      }
    }
    const ll = this.world.liftLoad;
    if (dist(ll.x, ll.z) < 6) return { kind: 'lift', label: 'Ride the chairlift' };
    if (dist(m.sites.crate.x, m.sites.crate.z) < 5.5) return { kind: 'crate', label: 'Grab avalanche charges' };
    return null;
  }

  handleActions(input, dt) {
    const s = this.skier;
    const latest = this.net.latest();
    const act = s.mode === 'vehicle' ? { kind: 'exitVeh', label: this.myVeh?.seat === 0 ? 'Get out (H = horn)' : 'Hop off' }
      : s.mode === 'ski' || s.mode === 'crash' ? this.findAction(latest) : null;
    const eHeld = input.held('KeyE');
    const ePressed = input.pressed('KeyE');
    if (act) {
      if (act.hold) {
        const key = `${act.kind}:${act.id}`;
        if (this.hold.key !== key) this.hold = { key, acc: 0, send: 0 };
        if (eHeld && s.mode === 'ski') {
          this.hold.acc += dt;
          this.hold.send += dt;
          if (this.hold.send >= 0.2) {
            this.net.send({ t: 'work', kind: act.kind, id: act.id, dt: Math.round(this.hold.send * 1000) / 1000 });
            this.hold.send = 0;
            this.sound.play('dig', 0.6);
            this.fx.burst(s.pos.x + Math.sin(s.heading) * 0.8, s.pos.y + 0.2, s.pos.z + Math.cos(s.heading) * 0.8, 6, 2, 0.15, '#ffffff', 3);
          }
          this.digging = true;
        } else {
          this.digging = false;
        }
        const prog = Math.max(act.progress || 0, this.hold.acc * 0.9) / act.need;
        this.ui.prompt(act.label, 'E', eHeld ? prog : null);
      } else {
        this.digging = false;
        this.ui.prompt(act.label, act.kind === 'hint' ? '' : 'E');
        if (ePressed) {
          switch (act.kind) {
            case 'load': this.net.send({ t: 'load', id: act.id }); break;
            case 'grab': this.net.send({ t: 'grabSled', id: act.id }); break;
            case 'lift': s.boardLift(); this.fx.trails.cut('meL'); this.fx.trails.cut('meR'); break;
            case 'crate': this.net.send({ t: 'refill' }); this.sound.play('load'); this.ui.toast('Charges restocked. Throw with G!', 'good'); break;
            case 'enterVeh': this.net.send({ t: 'enterVeh', id: act.id }); break;
            case 'exitVeh': this.leaveVehicle(false); break;
            case 'ambulance': this.net.send({ t: 'loadAmbulance', id: act.id }); break;
          }
        }
      }
    } else {
      this.digging = false;
      this.ui.prompt(null);
    }
    if (input.pressed('KeyQ') && s.sled) { this.dropSled(); this.ui.toast('Toboggan dropped', 'info', 2); }
    if (input.pressed('KeyG') && s.mode !== 'buried' && s.mode !== 'lift' && s.mode !== 'vehicle') this.throwCharge();
    if (input.pressed('KeyF')) this.ping();
    if (input.held('KeyR') && s.mode !== 'buried' && s.mode !== 'lift' && s.mode !== 'vehicle') {
      this.respawnHold += dt;
      this.ui.prompt('Hold to return to the summit hut', 'R', this.respawnHold / 1.2);
      if (this.respawnHold > 1.2) {
        this.respawnHold = 0;
        this.dropSled();
        s.spawn(this.m.sites.spawn.x, this.m.sites.spawn.z, 0);
        this.fx.trails.cut('meL'); this.fx.trails.cut('meR');
      }
    } else this.respawnHold = 0;
  }

  throwCharge() {
    if (this.chargesLeft <= 0) { this.ui.toast('No charges — restock at the crate by the patrol hut', 'bad', 2.5); return; }
    const cam = this.r.camera;
    cam.getWorldDirection(fwd);
    const s = this.skier;
    const p = [s.pos.x + fwd.x * 0.8, s.pos.y + 1.7, s.pos.z + fwd.z * 0.8];
    const v = [fwd.x * 17 + s.vel.x * 0.6, fwd.y * 17 + 6 + s.vel.y * 0.3, fwd.z * 17 + s.vel.z * 0.6];
    this.net.send({ t: 'charge', p, v });
    this.chargesLeft--;
    this.sound.play('whistle', 0.5);
  }

  ping() {
    const cam = this.r.camera;
    cam.getWorldDirection(fwd);
    const hit = this.world.raycast(cam.position.clone(), fwd, 500);
    if (hit) this.net.send({ t: 'ping', p: [hit.x, hit.y, hit.z] });
  }

  // ------------------------------------------------------------------ entities
  remoteInfo(id) {
    return this.app.lobbyPlayers().find((p) => p.id === id) || { name: 'Patroller', color: '#888888', hat: 'beanie', char: 'matt' };
  }

  updateRemotes(dt, br, latest) {
    const seen = new Set();
    if (br) {
      const { a, b, t } = br;
      for (const pb of b.pl) {
        if (pb.id === this.myId) continue;
        seen.add(pb.id);
        const pa = a.pl.find((x) => x.id === pb.id) || pb;
        let r = this.remotes.get(pb.id);
        if (!r) {
          const info = this.remoteInfo(pb.id);
          const ch = new Character(this.app.assets, { model: info.char, color: info.color });
          this.group.add(ch.root);
          const chair = makeChair();
          chair.visible = false;
          this.group.add(chair);
          r = { ch, chair, info, pos: new THREE.Vector3(), yaw: 0, prevYaw: 0, lean: 0, a: 0, sp: 0, b: null };
          this.remotes.set(pb.id, r);
        }
        r.pos.set(lerp(pa.p[0], pb.p[0], t), lerp(pa.p[1], pb.p[1], t), lerp(pa.p[2], pb.p[2], t));
        r.prevYaw = r.yaw;
        r.yaw = lerpAngle(pa.yaw, pb.yaw, t);
        r.a = pb.a; r.sp = pb.sp; r.b = pb.b;
        const yawRate = Math.atan2(Math.sin(r.yaw - r.prevYaw), Math.cos(r.yaw - r.prevYaw)) / Math.max(dt, 0.001);
        r.lean = lerp(r.lean, THREE.MathUtils.clamp(-yawRate * 0.5, -1, 1) * Math.min(1, r.sp / 8), Math.min(1, dt * 6));
        if (r.a === 8 || r.a === 9) {
          // sit them exactly on their seat of the (interpolated) vehicle
          for (const view of this.vehicles.values()) {
            const idx = view.seats ? view.seats.indexOf(pb.id) : -1;
            if (idx >= 0) { view.seatWorld(idx, r.pos); r.yaw = view.root.rotation.y; break; }
          }
        }
        r.ch.root.position.copy(r.pos);
        r.ch.root.rotation.y = r.yaw;
        r.ch.root.visible = r.a !== 4;
        r.chair.visible = r.a === 3;
        if (r.a === 3) { r.chair.position.copy(r.pos); r.chair.rotation.y = r.yaw; }
        const a2 = r.a;
        r.ch.animate(dt, {
          speed: r.sp, lean: a2 === 0 || a2 === 5 ? r.lean : 0, tuck: a2 === 5 ? 1 : 0, plough: a2 === 6 ? 1 : 0,
          air: a2 === 1, crash: a2 === 2, sit: a2 === 3 || a2 === 9, drive: a2 === 8, skate: a2 === 7,
        });
        // trails + spray for remotes
        const grounded = a2 === 0 || a2 === 5 || a2 === 6 || a2 === 7;
        if (grounded && r.sp > 1) {
          const lx = Math.cos(r.yaw) * 0.13, lz = -Math.sin(r.yaw) * 0.13;
          this.fx.trails.add(`r${pb.id}L`, r.pos.x + lx, r.pos.y, r.pos.z + lz);
          this.fx.trails.add(`r${pb.id}R`, r.pos.x - lx, r.pos.y, r.pos.z - lz);
          if ((a2 === 6 || Math.abs(r.lean) > 0.5) && r.sp > 6 && Math.random() < 0.5) {
            this.fx.spray.emit(r.pos.x, r.pos.y + 0.1, r.pos.z, (Math.random() - 0.5) * 3, 2 + Math.random() * 2, (Math.random() - 0.5) * 3, 0.15 + Math.random() * 0.15, 0.5, '#ffffff');
          }
        } else {
          this.fx.trails.cut(`r${pb.id}L`); this.fx.trails.cut(`r${pb.id}R`);
        }
        // bumping into teammates
        const s = this.skier;
        this.bumpCd -= dt;
        if (this.bumpCd <= 0 && grounded && s.mode === 'ski' && s.speed > 8 && s.speed > r.sp + 2) {
          const d = Math.hypot(r.pos.x - s.pos.x, r.pos.z - s.pos.z);
          if (d < 1.1 && Math.abs(r.pos.y - s.pos.y) < 1.2) {
            this.bumpCd = 2;
            this.net.send({ t: 'bump', id: pb.id, vx: s.vel.x, vz: s.vel.z });
            s.crash('bump');
          }
        }
      }
    }
    for (const [id, r] of this.remotes) {
      if (!seen.has(id)) {
        this.group.remove(r.ch.root);
        this.group.remove(r.chair);
        this.remotes.delete(id);
      }
    }
  }

  updateSleds(dt, br, latest) {
    if (!latest) return;
    const seen = new Set();
    for (const sl of latest.sl) {
      seen.add(sl.id);
      let v = this.sleds.get(sl.id);
      if (!v) {
        v = { model: makeToboggan(), roll: 0 };
        this.group.add(v.model.root);
        this.sleds.set(sl.id, v);
      }
      let x, y, z, yaw, tip;
      const mine = this.skier.sled && this.skier.sled.id === sl.id;
      if (mine) {
        const s = this.skier.sled;
        x = s.pos.x; y = s.pos.y; z = s.pos.z; yaw = s.yaw; tip = s.tip;
      } else if (br) {
        const pb = br.b.sl.find((q) => q.id === sl.id) || sl;
        const pa = br.a.sl.find((q) => q.id === sl.id) || pb;
        x = lerp(pa.p[0], pb.p[0], br.t); y = lerp(pa.p[1], pb.p[1], br.t); z = lerp(pa.p[2], pb.p[2], br.t);
        yaw = lerpAngle(pa.yaw, pb.yaw, br.t); tip = pb.tip;
      } else { [x, y, z] = sl.p; yaw = sl.yaw; tip = sl.tip; }
      v.model.root.position.set(x, y, z);
      v.model.root.rotation.y = yaw;
      // tilt to slope
      const n = this.m.normalAt(x, z);
      v.model.body.rotation.x = Math.atan2(n.z * Math.cos(yaw) + n.x * Math.sin(yaw), n.y);
      v.roll = lerp(v.roll, tip ? 1 : 0, Math.min(1, dt * 8));
      v.model.body.rotation.z = v.roll * Math.PI * 0.55;
      v.owner = sl.o;
      v.patient = sl.pt;
      v.x = x; v.y = y; v.z = z; v.yaw = yaw;
    }
    for (const [id, v] of this.sleds) if (!seen.has(id)) { this.group.remove(v.model.root); this.sleds.delete(id); }
  }

  updatePatients(dt, latest) {
    if (!latest) return;
    const seen = new Set();
    const s = this.skier;
    this.smokeAcc += dt;
    const emitSmoke = this.smokeAcc > 0.07;
    if (emitSmoke) this.smokeAcc = 0;
    for (const p of latest.pt) {
      seen.add(p.id);
      let v = this.patients.get(p.id);
      if (!v) {
        v = { model: new Character(this.app.assets, { kind: 'tourist', model: TOURISTS[p.lk % TOURISTS.length], look: p.lk }), data: p };
        this.group.add(v.model.root);
        this.patients.set(p.id, v);
      }
      v.data = p;
      const root = v.model.root;
      root.visible = p.s !== 'buried' && p.s !== 'veh';
      if (p.s === 'sled') {
        const sl = this.sleds.get(p.sl);
        if (sl) {
          root.position.set(sl.x, sl.y + 0.2, sl.z);
          root.rotation.set(0, sl.yaw + Math.PI, sl.roll * Math.PI * 0.55);
          root.visible = sl.roll < 0.5;
          v.model.animate(dt, { lie: true, wave: Math.sin(this.time * 2 + p.id) > 0.7 });
          if (sl.roll >= 0.5) {
            root.visible = true;
            root.position.set(sl.x + 1.2, this.m.heightAt(sl.x + 1.2, sl.z), sl.z);
            v.model.animate(dt, { crash: true });
          }
        }
      } else if (p.s === 'waiting') {
        const g = this.m.heightAt(p.x, p.z);
        if (p.ty === 'tree' && !p.f) {
          // comically stuck head-first in the snow
          root.position.set(p.x, g + 1.55, p.z);
          root.rotation.set(Math.PI, p.id, 0.15 * Math.sin(this.time * 6));
          v.model.animate(dt, { noPoles: true, skate: true });
        } else if (!p.f) {
          root.position.set(p.x, g, p.z);
          root.rotation.set(0, p.id * 1.7, 0);
          v.model.animate(dt, { lie: true, wave: true, noPoles: true });
        } else {
          root.position.set(p.x, g + 0.05, p.z);
          root.rotation.set(0, Math.atan2(s.pos.x - p.x, s.pos.z - p.z), 0);
          v.model.animate(dt, { sit: true, wave: true, noPoles: true });
        }
        if (emitSmoke) {
          const sx = p.x + 1.4, sz = p.z + 1.4;
          this.fx.smoke.emit(sx, g + 0.4, sz, (Math.random() - 0.5) * 0.8 + 0.8, 3.5 + Math.random() * 2.5, (Math.random() - 0.5) * 0.8, 0.7 + Math.random() * 0.6, 5 + Math.random() * 3, Math.random() < 0.7 ? '#ff3030' : '#ff7a7a');
        }
        const d = Math.hypot(p.x - s.pos.x, p.z - s.pos.z);
        if (d < 14 && !this.seenLines.has(p.id)) {
          this.seenLines.add(p.id);
          const lines = { injured: 'Over here!! ', tree: 'Mmmph! MMMPH!! ', buried: '' };
          const extra = this.lines.get(p.id) || '';
          this.showBubble(p.id, `${lines[p.ty] || ''}${extra}`.trim() || 'Help!', 4);
        }
      }
    }
    for (const [id, v] of this.patients) if (!seen.has(id)) { this.group.remove(v.model.root); this.patients.delete(id); this.bubbles.delete(id); }
  }

  updateCharges(dt, br) {
    if (!br) return;
    const seen = new Set();
    for (const cb of br.b.ch) {
      seen.add(cb.id);
      const ca = br.a.ch.find((q) => q.id === cb.id) || cb;
      let v = this.charges.get(cb.id);
      if (!v) {
        v = makeCharge();
        this.group.add(v.root);
        this.charges.set(cb.id, v);
      }
      v.root.position.set(lerp(ca.p[0], cb.p[0], br.t), lerp(ca.p[1], cb.p[1], br.t), lerp(ca.p[2], cb.p[2], br.t));
      v.root.rotation.x += dt * 6;
      v.spark.scale.setScalar(0.8 + Math.random() * 0.8);
      if (Math.random() < 0.6) this.fx.fire.emit(v.root.position.x, v.root.position.y + 0.25, v.root.position.z, (Math.random() - 0.5) * 2, 2, (Math.random() - 0.5) * 2, 0.08, 0.3, new THREE.Color(5, 3, 1));
    }
    for (const [id, v] of this.charges) if (!seen.has(id)) { this.group.remove(v.root); this.charges.delete(id); }
  }

  updateSlides(dt, serverNow) {
    const s = this.skier;
    for (const sl of this.slides) {
      if (sl.done) continue;
      const front = sl.update(dt, serverNow, this.time);
      const d = Math.hypot(sl.a.release.x - s.pos.x, sl.a.release.z - s.pos.z);
      this.shake = Math.max(this.shake, Math.max(0, 0.5 - d / 900));
      if (!sl.caughtMe && s.mode !== 'lift' && s.mode !== 'buried' && front > 0) {
        const r = distToPolyline(sl.a.path, s.pos.x, s.pos.z);
        if (r.dist < sl.a.width * 0.5 && r.along < front && r.along > front - 25 && s.pos.y < this.m.heightAt(s.pos.x, s.pos.z) + 3) {
          sl.caughtMe = true;
          // tumble a bit downhill before burial
          const along = Math.min(sl.a.length - 2, r.along + 12 + Math.random() * 20);
          const pa = distToPolyline(sl.a.path, s.pos.x, s.pos.z);
          void pa;
          const q = sl.a.path[Math.min(sl.a.path.length - 1, Math.floor(along / 6))];
          const bx = q.x + (s.pos.x - q.x) * 0.3, bz = q.z + (s.pos.z - q.z) * 0.3;
          this.dropSled();
          s.pos.set(bx, this.m.heightAt(bx, bz), bz);
          s.bury();
          this.net.send({ t: 'buried', p: [s.pos.x, s.pos.y, s.pos.z] });
          this.sound.play('crash');
          this.buriedAir = AIR_SUPPLY;
        }
      }
    }
  }

  updateHelis(dt) {
    for (const h of this.helis) {
      h.t += dt;
      const { root, rotor, tailRotor, rope } = h.h;
      rotor.rotation.y += dt * 30;
      tailRotor.rotation.x += dt * 40;
      const hover = h.target.clone().add(new THREE.Vector3(0, 16, 0));
      if (h.t < 4) {
        root.position.lerpVectors(h.from, hover, 1 - Math.pow(1 - h.t / 4, 2));
        root.lookAt(hover.x, root.position.y, hover.z);
      } else if (h.t < 7) {
        root.position.copy(hover).add(new THREE.Vector3(Math.sin(h.t * 2) * 0.4, Math.sin(h.t * 3) * 0.3, 0));
        rope.visible = true;
        rope.scale.y = Math.min(15, (h.t - 4) * 12);
        if (Math.random() < 0.8) this.fx.puff.emit(h.target.x + (Math.random() - 0.5) * 10, h.target.y + 0.5, h.target.z + (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 12, 1, (Math.random() - 0.5) * 12, 1 + Math.random(), 1.2, '#ffffff');
      } else {
        rope.scale.y = Math.max(0.01, rope.scale.y - dt * 10);
        const away = h.from.clone().add(new THREE.Vector3(-500, 80, 0));
        root.position.lerpVectors(hover, away, Math.pow((h.t - 7) / 5, 2));
        root.lookAt(away.x, root.position.y, away.z);
      }
      if (h.t > 12) h.done = true;
    }
    this.helis = this.helis.filter((h) => { if (h.done) this.group.remove(h.h.root); return !h.done; });
  }

  updateMe(dt, latest) {
    const s = this.skier;
    const model = this.myModel;
    model.root.position.copy(s.pos);
    model.root.rotation.y = s.heading;
    model.root.visible = s.mode !== 'buried';
    this.myChair.visible = s.mode === 'lift';
    if (s.mode === 'vehicle') { this.fx.trails.cut('meL'); this.fx.trails.cut('meR'); }
    if (s.mode === 'lift') { this.myChair.position.copy(s.pos); this.myChair.rotation.y = s.heading; }
    const pose = s.pose();
    pose.dig = !!this.digging;
    model.animate(dt, pose);
    if (s.mode === 'ski' && s.speed > 0.5) {
      const lx = Math.cos(s.heading) * 0.13, lz = -Math.sin(s.heading) * 0.13;
      this.fx.trails.add('meL', s.pos.x + lx, s.pos.y, s.pos.z + lz);
      this.fx.trails.add('meR', s.pos.x - lx, s.pos.y, s.pos.z - lz);
      this.sprayAcc += dt * Math.min(60, s.skid * 0.9 + (s.plough > 0.5 ? s.speed * 3 : 0));
      while (this.sprayAcc > 1) {
        this.sprayAcc -= 1;
        const side = -Math.sign(s.leanV || 1);
        this.fx.spray.emit(s.pos.x + Math.cos(s.heading) * 0.4 * side, s.pos.y + 0.1, s.pos.z - Math.sin(s.heading) * 0.4 * side,
          s.vel.x * 0.4 + Math.cos(s.heading) * side * (2 + Math.random() * 3), 1.5 + Math.random() * 3, s.vel.z * 0.4 - Math.sin(s.heading) * side * (2 + Math.random() * 3),
          0.12 + Math.random() * 0.2, 0.4 + Math.random() * 0.4, '#ffffff');
      }
    } else if (s.mode !== 'crash') {
      this.fx.trails.cut('meL'); this.fx.trails.cut('meR');
    }
    // buried overlay & air
    if (s.mode === 'buried') {
      const mine = latest?.pl.find((p) => p.id === this.myId);
      if (mine?.b) this.buriedAir = mine.b[3];
      this.ui.buried(true, this.buriedAir, AIR_SUPPLY);
    }
    this.sound.updateMotion(s.mode === 'lift' ? 3 : s.mode === 'vehicle' ? s.speed * 0.5 : s.speed, s.mode === 'vehicle' ? 0 : s.skid, s.mode === 'air', s.mode === 'buried');
    if (!this.myVeh?.phys) this.sound.updateEngine?.(false, 0, false);
  }

  updateRopes() {
    const arr = this.ropeGeo.attributes.position.array;
    let n = 0;
    for (const v of this.sleds.values()) {
      if (v.owner === null || v.owner === undefined || n >= 8) continue;
      let px, py, pz;
      if (v.owner === this.myId && this.myVeh?.phys && this.skier.anchor) { const a = this.skier.anchor; px = a.x; pz = a.z; py = this.m.heightAt(a.x, a.z) - 0.4; }
      else if (v.owner === this.myId) { px = this.skier.pos.x; py = this.skier.pos.y; pz = this.skier.pos.z; }
      else { const r = this.remotes.get(v.owner); if (!r) continue; px = r.pos.x; py = r.pos.y; pz = r.pos.z; }
      arr.set([px, py + 0.95, pz, v.x + Math.sin(v.yaw) * 1.1, v.y + 0.45, v.z + Math.cos(v.yaw) * 1.1], n * 6);
      n++;
    }
    this.ropeGeo.setDrawRange(0, n * 2);
    this.ropeGeo.attributes.position.needsUpdate = true;
  }

  // ------------------------------------------------------------------ camera
  updateCamera(dt) {
    const s = this.skier, cam = this.r.camera;
    const moving = s.speed > (s.mode === 'vehicle' ? 2 : 4) && (s.mode === 'ski' || s.mode === 'air' || s.mode === 'crash' || s.mode === 'vehicle');
    if (moving && this.time - this.lastMouse > 0.8) {
      const target = s.mode === 'crash' ? Math.atan2(s.vel.x, s.vel.z) : s.heading;
      this.camYaw = lerpAngle(this.camYaw, target, Math.min(1, dt * 2.2));
      this.camPitch = lerp(this.camPitch, 0.26, Math.min(1, dt * 1.2));
    }
    const vehT = this.myVeh ? VEHICLE_TYPES[this.vehicles.get(this.myVeh.id)?.type] : null;
    const dist = (vehT ? vehT.len + 4.2 : s.mode === 'lift' ? 7 : 5.6) + Math.min(s.speed, 30) * 0.05 + (s.sled ? 1.2 : 0);
    const cp = Math.cos(this.camPitch), sp = Math.sin(this.camPitch);
    fwd.set(Math.sin(this.camYaw) * cp, -sp, Math.cos(this.camYaw) * cp);
    const target = v3.copy(s.pos).add(new THREE.Vector3(0, s.mode === 'buried' ? 0.6 : 1.55, 0));
    const want = target.clone().addScaledVector(fwd, -dist);
    const g = this.m.heightAt(want.x, want.z) + 0.7;
    if (want.y < g) want.y = g;
    cam.position.lerp(want, Math.min(1, dt * 14));
    if (cam.position.y < g) cam.position.y = g;
    cam.lookAt(target);
    if (this.shake > 0.001) {
      cam.position.x += (Math.random() - 0.5) * this.shake * 0.6;
      cam.position.y += (Math.random() - 0.5) * this.shake * 0.6;
      this.shake = Math.max(0, this.shake - dt * 1.2);
    }
    const fov = 62 + Math.min(s.speed, 34) * 0.42;
    if (Math.abs(cam.fov - fov) > 0.05) { cam.fov = lerp(cam.fov, fov, Math.min(1, dt * 3)); cam.updateProjectionMatrix(); }
    this.r.followShadow(s.pos);
  }

  // ------------------------------------------------------------------ HUD
  project(x, y, z) {
    v3.set(x, y, z).project(this.r.camera);
    if (v3.z > 1 || v3.z < -1) return null;
    return { x: (v3.x * 0.5 + 0.5) * window.innerWidth, y: (-v3.y * 0.5 + 0.5) * window.innerHeight };
  }

  updateHud(tod, latest, br) {
    const s = this.skier, ui = this.ui, m = this.m;
    const mins = 9 * 60 + Math.floor(tod * 7.5 * 60);
    const sledTxt = !s.sled ? '—' : s.sled.hasPatient ? (() => {
      const sl = latest?.sl.find((q) => q.id === s.sled.id);
      const pt = latest?.pt.find((q) => q.id === sl?.pt);
      return pt ? `${pt.n} ${pt.c}%` : 'Patient';
    })() : 'Empty';
    ui.updateHud({
      clock: `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`,
      money: this.earned, quota: this.cfg.quota, danger: this.danger, speed: s.mode === 'lift' ? 0 : s.speed,
      charges: this.chargesLeft, sled: sledTxt,
    });
    this.hurtT -= 1 / 60;
    ui.hurt(this.hurtT > 0);

    const markers = [];
    const angTo = (x, z) => Math.atan2(x - s.pos.x, z - s.pos.z);
    const distTo = (x, z) => Math.hypot(x - s.pos.x, z - s.pos.z);
    const calls = [];
    ui.beginLabels();
    const W = window.innerWidth, H = window.innerHeight;
    const onScreen = (q) => q && q.x > -50 && q.x < W + 50 && q.y > -50 && q.y < H + 50;
    if (latest) {
      for (const p of latest.pt) {
        let x = p.x, z = p.z;
        if (p.s === 'buried') { x += Math.sin(p.id * 7.3) * 14; z += Math.cos(p.id * 3.1) * 14; }
        const d = distTo(x, z);
        const mine = s.sled && latest.sl.find((q) => q.id === s.sled.id)?.pt === p.id;
        if (!mine) markers.push({ ang: angTo(x, z), icon: p.s === 'buried' ? '?' : '✚', dist: d, cls: 'pt' + (p.c < 30 ? ' urgent' : ''), color: p.s === 'buried' ? '#f39c12' : undefined });
        let title, sub, cls = '';
        if (p.s === 'sled') {
          const sl = latest.sl.find((q) => q.id === p.sl);
          const owner = sl?.o === this.myId ? 'You' : this.remoteInfo(sl?.o).name;
          title = 'On toboggan → Clinic'; sub = `${p.n} · pulled by ${owner}`; cls = 'sled';
        } else if (p.s === 'buried') {
          title = PATIENT_TITLE.buried; sub = `${p.n} · use your beacon, then dig (E)`; cls = 'buried';
        } else if (!p.f) {
          title = PATIENT_TITLE[p.ty]; sub = `${p.n} · hold E to ${PATIENT_TYPES[p.ty].verb.toLowerCase()}`;
        } else {
          title = 'Ready for pickup'; sub = `${p.n} · load onto a toboggan (E)`;
        }
        calls.push({ id: p.id, title, sub, dist: p.s === 'buried' ? Math.round(d / 10) * 10 : d, condition: p.c, cls, state: p.s, mine });
        if (p.s === 'waiting') {
          const q = this.project(p.x, this.m.heightAt(p.x, p.z) + 2.6, p.z);
          if (onScreen(q) && d > 4) ui.label(`pt${p.id}`, q.x, q.y, `<div class="wi">✚</div>${Math.round(d)}m<div class="wbar"><i style="width:${p.c}%;background:${p.c > 50 ? '#6be08e' : p.c > 25 ? '#f6b94a' : '#ff5d5d'}"></i></div>`, 'wmark');
          const bub = this.bubbles.get(p.id);
          if (bub && bub.until > this.time && d < 40) {
            const qb = this.project(p.x, this.m.heightAt(p.x, p.z) + 2.2, p.z);
            if (onScreen(qb)) ui.label(`bub${p.id}`, qb.x, qb.y - 44, bub.text, 'bubble');
          }
        }
      }
      // buried teammates on the compass (exact for teammates — they have beacons on)
    }
    calls.sort((a, b) => (b.mine ? 1 : 0) - (a.mine ? 1 : 0) || a.dist - b.dist);
    ui.radio(calls);
    // fixed places
    const C = m.sites.clinic;
    const carrying = s.sled && s.sled.hasPatient;
    markers.push({ ang: angTo(C.x, C.z), icon: 'H', dist: carrying ? distTo(C.x, C.z) : undefined, cls: carrying ? 'pt urgent' : '', color: '#e63946' });
    if (carrying) {
      const q = this.project(C.x, m.heightAt(C.x, C.z) + 6, C.z);
      if (onScreen(q)) ui.label('clinic', q.x, q.y, `<div class="wi">H</div>CLINIC ${Math.round(distTo(C.x, C.z))}m`, 'wmark clinic');
    }
    const L = this.world.liftLoad;
    markers.push({ ang: angTo(L.x, L.z), icon: '🚡', cls: '' });
    markers.push({ ang: angTo(m.sites.hut.x, m.sites.hut.z), icon: '⌂', cls: '' });
    for (const [zone, until] of this.warnZones) {
      if (until < this.time) { this.warnZones.delete(zone); continue; }
      const a = m.avalanches[zone];
      markers.push({ ang: angTo(a.release.x, a.release.z), icon: '⚠', dist: distTo(a.release.x, a.release.z), color: '#f39c12', cls: 'pt urgent' });
    }
    this.pings = this.pings.filter((p) => p.until > this.time);
    for (const p of this.pings) {
      markers.push({ ang: angTo(p.x, p.z), icon: '◆', dist: distTo(p.x, p.z), color: p.color });
      const q = this.project(p.x, p.y + 2, p.z);
      if (onScreen(q)) ui.label(`ping${p.x}${p.z}`, q.x, q.y, `<div class="wi" style="background:${p.color}">!</div>${p.name}`, 'wmark ping', `--c:${p.color}`);
    }
    for (const [id, r] of this.remotes) {
      markers.push({ ang: angTo(r.pos.x, r.pos.z), icon: '●', color: r.info.color });
      if (r.a !== 4) {
        const q = this.project(r.pos.x, r.pos.y + 2.4, r.pos.z);
        const d = distTo(r.pos.x, r.pos.z);
        if (onScreen(q) && d < 250) ui.label(`tag${id}`, q.x, q.y, `${r.info.name}${d > 30 ? ` · ${Math.round(d)}m` : ''}`, 'tag', `--c:${r.info.color}`);
      }
    }
    ui.endLabels();
    ui.compass(this.camYaw, markers);

    // beacon
    const targets = [];
    if (latest) {
      for (const p of latest.pl) if (p.b && p.id !== this.myId) targets.push({ x: p.b[0], z: p.b[2] });
      for (const p of latest.pt) if (p.s === 'buried') targets.push({ x: p.x, z: p.z });
    }
    if (targets.length && s.mode !== 'buried') {
      const range = this.upgrades.beacon ? 120 : 60;
      let best = null, bd = Infinity;
      for (const t of targets) { const d = distTo(t.x, t.z); if (d < bd) { bd = d; best = t; } }
      if (bd <= range) {
        const rel = Math.atan2(Math.sin(this.camYaw - angTo(best.x, best.z)), Math.cos(this.camYaw - angTo(best.x, best.z)));
        this.beepT -= 1 / 60;
        const interval = THREE.MathUtils.clamp(bd / 28, 0.1, 1.4);
        let flash = false;
        if (this.beepT <= 0) { this.beepT = interval; this.sound.play('beep'); flash = true; this.beepIdx++; }
        ui.beacon({ dist: bd, rel: this.upgrades.beacon ? rel : Math.round(rel / (Math.PI / 4)) * (Math.PI / 4), flash: flash || this.beepT > interval * 0.6, flashIdx: this.beepIdx });
      } else ui.beacon({ dist: null, rel: 0 });
    } else ui.beacon(null);

    // trail map
    if (this.app.input.held('Tab')) {
      ui.showMap(true);
      const players = [{ x: s.pos.x, z: s.pos.z, yaw: s.heading, color: this.meInfo.color, name: 'You' }];
      for (const r of this.remotes.values()) players.push({ x: r.pos.x, z: r.pos.z, yaw: r.yaw, color: r.info.color, name: r.info.name });
      const pts = (latest?.pt || []).filter((p) => p.s !== 'sled').map((p) => (p.s === 'buried' ? { x: p.x + Math.sin(p.id * 7.3) * 14, z: p.z + Math.cos(p.id * 3.1) * 14, state: 'buried' } : { x: p.x, z: p.z, state: p.s }));
      ui.drawMap(players, pts, this.pings);
    } else ui.showMap(false);
    void br;
  }

  end() {
    this.ended = true;
    this.ui.prompt(null);
    this.ui.buried(false);
    this.ui.beacon(null);
    this.ui.showMap(false);
  }

  dispose() {
    this.disposed = true;
    this.sound.updateEngine?.(false, 0, false);
    this.scene.remove(this.group);
    for (const sl of this.slides) sl.dispose();
    this.fx.clear();
    this.ui.clearLabels();
    this.ui.beacon(null);
    this.ui.buried(false);
  }
}
