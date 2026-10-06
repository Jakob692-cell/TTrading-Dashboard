import * as THREE from 'three';
import { Renderer } from './renderer.js';
import { World } from './world.js';
import { Effects } from './effects.js';
import { Sound } from './audio.js';
import { Net } from './net.js';
import { UI } from './ui.js';
import { Game } from './game.js';
import { Skier } from './skier.js';
import { makeCharacter } from './models.js';
import { generateMountain, mountainName, distToPolyline, pointAlong } from '/shared/mountain.js';
import { dailySeedString } from '/shared/rng.js';
import { JACKET_COLORS } from '/shared/constants.js';

const $ = (id) => document.getElementById(id);
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

// ------------------------------------------------------------------ input
class Input {
  constructor() {
    this.keys = new Set();
    this.edges = new Set();
    this.mdx = 0;
    this.mdy = 0;
    this.blocked = false;
  }
  held(c) { return !this.blocked && this.keys.has(c); }
  pressed(c) { return !this.blocked && this.edges.has(c); }
  endFrame() { this.edges.clear(); this.mdx = 0; this.mdy = 0; }
}

// ------------------------------------------------------------------ app
const app = {
  state: 'boot',
  settings: { quality: 'high', sens: 1, volume: 0.8, music: 0.5, invert: false, ...store.get('pp-settings', {}) },
  profile: store.get('pp-profile', null) || { name: `Patroller${Math.floor(Math.random() * 90 + 10)}`, color: JACKET_COLORS[Math.floor(Math.random() * 4)], hat: 'beanie' },
  input: new Input(),
  lobby: null,
  game: null,
  lobbyPlayers() { return this.lobby?.players || []; },
};
const canvas = $('scene');
const ui = new UI();
app.ui = ui;
const renderer = new Renderer(canvas);
app.renderer = renderer;
renderer.setQuality(app.settings.quality);
const sound = new Sound();
sound.setVolume(app.settings.volume);
sound.setMusic(app.settings.music);
app.sound = sound;
const net = new Net();
app.net = net;
app.fx = new Effects(renderer.scene);

function saveSettings() { store.set('pp-settings', app.settings); }
function saveProfile() { store.set('pp-profile', app.profile); }

// ------------------------------------------------------------------ menu backdrop: AI skiers carving down
const menu = { skiers: [], t: 0, camPos: new THREE.Vector3(), camLook: new THREE.Vector3() };
function setupMenuScene() {
  for (const s of menu.skiers) renderer.scene.remove(s.model.root);
  menu.skiers = [];
  const m = app.mountain;
  const looks = [['#e63946', 'helmet'], ['#2f6fd6', 'beanie'], ['#f2b134', 'viking']];
  looks.forEach(([color, hat], i) => {
    const sk = new Skier(m);
    const piste = m.pistes[(i + 1) % m.pistes.length];
    const start = pointAlong(piste.points, 40 + i * 25);
    sk.spawn(start.x + i * 2, start.z, 0);
    const model = makeCharacter({ jacket: color, hat, hatColor: '#ffd23f' });
    renderer.scene.add(model.root);
    menu.skiers.push({ sk, model, piste, id: `ai${i}`, sprayAcc: 0 });
  });
}

function updateMenuScene(dt) {
  const m = app.mountain;
  menu.t += dt;
  for (const a of menu.skiers) {
    const s = a.sk;
    const r = distToPolyline(a.piste.points, s.pos.x, s.pos.z);
    if (r.along > a.piste.length - 40 || s.pos.z > 860) {
      const st = pointAlong(a.piste.points, 30);
      s.spawn(st.x, st.z, 0);
      app.fx.trails.cut(a.id + 'L'); app.fx.trails.cut(a.id + 'R');
      continue;
    }
    const tgt = pointAlong(a.piste.points, r.along + 22);
    const wob = Math.sin(menu.t * 0.9 + a.id.length + a.piste.width) * a.piste.width * 0.3;
    const tx = tgt.x - tgt.dz * wob, tz = tgt.z + tgt.dx * wob;
    const want = Math.atan2(tx - s.pos.x, tz - s.pos.z);
    const diff = Math.atan2(Math.sin(want - s.heading), Math.cos(want - s.heading));
    s.update(dt, { left: diff > 0.06, right: diff < -0.06, up: Math.abs(diff) < 0.35 && s.speed < 20, down: s.speed > 24, jump: false });
    s.events.length = 0;
    if (s.mode === 'crash' && s.crashT < 0.1) s.mode = 'ski';
    a.model.root.position.copy(s.pos);
    a.model.root.rotation.y = s.heading;
    a.model.animate(dt, s.pose());
    if (s.mode === 'ski') {
      const lx = Math.cos(s.heading) * 0.13, lz = -Math.sin(s.heading) * 0.13;
      app.fx.trails.add(a.id + 'L', s.pos.x + lx, s.pos.y, s.pos.z + lz);
      app.fx.trails.add(a.id + 'R', s.pos.x - lx, s.pos.y, s.pos.z - lz);
      a.sprayAcc += dt * Math.min(50, s.skid);
      while (a.sprayAcc > 1) {
        a.sprayAcc -= 1;
        app.fx.spray.emit(s.pos.x, s.pos.y + 0.1, s.pos.z, s.vel.x * 0.4 + (Math.random() - 0.5) * 3, 1.5 + Math.random() * 2.5, s.vel.z * 0.4 + (Math.random() - 0.5) * 3, 0.12 + Math.random() * 0.18, 0.5, '#ffffff');
      }
    }
  }
  // cinematic camera orbiting the lead skier
  const lead = menu.skiers[0]?.sk;
  if (lead) {
    const ang = menu.t * 0.12;
    const want = new THREE.Vector3(lead.pos.x + Math.sin(ang) * 16 + 10, lead.pos.y + 7, lead.pos.z - 14 + Math.cos(ang) * 6);
    const g = m.heightAt(want.x, want.z) + 2;
    if (want.y < g) want.y = g;
    if (menu.camPos.lengthSq() === 0) { menu.camPos.copy(want); menu.camLook.set(lead.pos.x, lead.pos.y + 1, lead.pos.z + 6); }
    menu.camPos.lerp(want, Math.min(1, dt * 2));
    menu.camLook.lerp(new THREE.Vector3(lead.pos.x, lead.pos.y + 1, lead.pos.z + 6), Math.min(1, dt * 3));
    renderer.camera.position.copy(menu.camPos);
    renderer.camera.lookAt(menu.camLook);
    if (renderer.camera.fov !== 55) { renderer.camera.fov = 55; renderer.camera.updateProjectionMatrix(); }
    renderer.followShadow(lead.pos);
  }
  renderer.setTimeOfDay(0.8, 0.1);
  app.world.update(dt, menu.t, 0.8);
  app.fx.update(dt, renderer.camera.position, 0.12);
}

// ------------------------------------------------------------------ profile preview (live 3D)
const preview = { renderer: null, scene: null, cam: null, model: null };
function setupPreview() {
  try {
    const r = new THREE.WebGLRenderer({ canvas: $('preview'), antialias: true, alpha: true });
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    r.setSize(290, 250, false);
    preview.renderer = r;
    preview.scene = new THREE.Scene();
    preview.scene.add(new THREE.HemisphereLight('#ffffff', '#c3d3ea', 1.5));
    const d = new THREE.DirectionalLight('#fff4e2', 2.6);
    d.position.set(3, 4, 5);
    preview.scene.add(d);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.2, 0.15, 24), new THREE.MeshStandardMaterial({ color: '#f6f9fd', flatShading: true }));
    disc.position.y = -0.08;
    preview.scene.add(disc);
    preview.cam = new THREE.PerspectiveCamera(32, 290 / 250, 0.1, 50);
    preview.cam.position.set(0, 1.5, 4.6);
    preview.cam.lookAt(0, 0.95, 0);
  } catch { /* preview optional */ }
  rebuildPreview();
}
function rebuildPreview() {
  if (!preview.scene) return;
  if (preview.model) preview.scene.remove(preview.model.root);
  const p = app.profile;
  preview.model = makeCharacter({ jacket: p.color, hat: p.hat, hatColor: p.hat === 'beanie' ? '#ffd23f' : p.color });
  preview.scene.add(preview.model.root);
}
function renderPreview(dt, t) {
  if (!preview.renderer || app.state !== 'menu') return;
  preview.model.root.rotation.y = t * 0.6;
  preview.model.animate(dt, { skate: false, wave: Math.sin(t * 0.7) > 0.6 });
  preview.renderer.render(preview.scene, preview.cam);
}

// ------------------------------------------------------------------ boot
async function boot() {
  ui.show('loading');
  ui.setLoading(0.1, 'Waxing skis…');
  await nextFrame();
  const seed = dailySeedString();
  $('daily-label').textContent = `Daily mountain: ${mountainName(seed)}`;
  ui.setLoading(0.35, 'Piling up snow…');
  await nextFrame();
  app.mountain = generateMountain(seed);
  ui.setLoading(0.6, 'Planting 2,000 pine trees…');
  await nextFrame();
  app.world = new World(renderer, app.mountain);
  ui.setLoading(0.9, 'Starting the chairlift…');
  await nextFrame();
  setupMenuScene();
  setupPreview();
  ui.buildProfile(app.profile, () => { saveProfile(); rebuildPreview(); });
  ui.setLoading(1, 'Ready!');
  await nextFrame();
  goMenu();
  requestAnimationFrame(loop);
}

function goMenu() {
  app.state = 'menu';
  ui.show('menu');
  sound.setInGame(false);
}

async function ensureWorld(seed) {
  if (app.mountain && app.mountain.seed === seed) return;
  ui.show('loading');
  ui.setLoading(0.3, 'Generating a fresh mountain…');
  await nextFrame();
  app.world.dispose();
  app.mountain = generateMountain(seed);
  ui.setLoading(0.7, 'Planting trees…');
  await nextFrame();
  app.world = new World(renderer, app.mountain);
  setupMenuScene();
}

// ------------------------------------------------------------------ networking
async function connectAnd(msg) {
  sound.unlock();
  try {
    if (!net.connected) await net.connect();
  } catch (e) {
    ui.error(e.message);
    return;
  }
  app.profile.name = $('name-input').value.trim().slice(0, 16) || app.profile.name;
  saveProfile();
  net.send({ ...msg, profile: app.profile });
}

net.on('error', (m) => ui.error(m.text));
net.on('welcome', () => {
  app.state = 'lobby';
  ui.show('lobby');
});
net.on('lobby', async (m) => {
  app.lobby = m;
  if (m.phase === 'lobby') {
    if (app.state === 'game' || app.state === 'results') {
      app.game?.dispose();
      app.game = null;
      if (document.pointerLockElement) document.exitPointerLock();
      sound.setInGame(false);
    }
    if (app.state !== 'menu' && app.state !== 'boot') {
      await ensureWorld(m.run.seed);
      for (const s of menu.skiers) s.model.root.visible = true;
      app.state = 'lobby';
      ui.show('lobby');
    }
    ui.renderLobby(m, net.id, mountainName(m.run.seed));
  } else if (app.state === 'results') {
    ui.renderShop(m.run.money, m.run.upgrades, buy);
  }
});
net.on('start', async (m) => {
  await ensureWorld(m.seed);
  app.game?.dispose();
  for (const s of menu.skiers) s.model.root.visible = false;
  app.fx.clear();
  app.game = new Game(app, m);
  app.state = 'game';
  ui.show('hud');
  sound.setInGame(true);
  requestLock();
  setTimeout(() => $('click-hint').classList.toggle('hidden', document.pointerLockElement === canvas), 300);
});
net.on('snap', () => {});
net.on('ev', (e) => app.game?.onEvent(e));
net.on('chat', (m) => ui.chatLine(m.name, m.color, m.text));
net.on('results', (r) => {
  if (!app.game) return;
  app.game.end();
  app.state = 'results';
  if (document.pointerLockElement) document.exitPointerLock();
  const isHost = app.lobby?.hostId === net.id;
  sound.play(r.passed ? 'cash' : 'bad');
  ui.showResults(r, net.id, isHost, r.money, app.lobby?.run.upgrades || {}, app.game.mountainName, buy);
});
net.on('close', () => {
  if (app.state !== 'menu') {
    ui.error('Disconnected from the patrol server.');
    app.game?.dispose();
    app.game = null;
    for (const s of menu.skiers) s.model.root.visible = true;
    goMenu();
  }
});
function buy(item) { sound.play('ui'); net.send({ t: 'buy', item }); }

// ------------------------------------------------------------------ DOM wiring
const click = (id, fn) => $(id).addEventListener('click', () => { sound.unlock(); sound.play('ui'); fn(); });
click('btn-host', () => connectAnd({ t: 'create' }));
click('btn-join', () => {
  const code = $('join-code').value.trim().toUpperCase();
  if (code.length !== 4) { ui.error('Enter the 4-letter patrol code first.'); $('join-code').focus(); return; }
  connectAnd({ t: 'join', code });
});
$('join-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btn-join').click(); e.stopPropagation(); });
$('name-input').addEventListener('input', () => { app.profile.name = $('name-input').value.slice(0, 16); saveProfile(); });
$('name-input').addEventListener('keydown', (e) => e.stopPropagation());
click('btn-how', () => ui.modal('howto', true));
click('btn-settings', () => openSettings());
for (const b of document.querySelectorAll('[data-close]')) b.addEventListener('click', () => { sound.play('ui'); b.closest('.screen').classList.remove('show'); });
click('room-code', () => { navigator.clipboard?.writeText($('room-code').textContent).catch(() => {}); ui.error('Code copied — send it to your friends!'); });
for (const b of document.querySelectorAll('#mode-toggle button')) b.addEventListener('click', () => net.send({ t: 'mode', mode: b.dataset.mode }));
click('btn-ready', () => {
  const me = app.lobbyPlayers().find((p) => p.id === net.id);
  net.send({ t: 'ready', ready: !me?.ready });
});
click('btn-start', () => net.send({ t: 'start' }));
click('btn-leave', () => { net.close(); app.lobby = null; goMenu(); });
click('btn-next', () => net.send({ t: 'start' }));
click('btn-res-lobby', () => net.send({ t: 'toLobby' }));
click('btn-resume', () => { ui.modal('pause', false); requestLock(); });
click('btn-pause-settings', () => openSettings());
click('btn-pause-how', () => ui.modal('howto', true));
click('btn-quit', () => {
  ui.modal('pause', false);
  net.close();
  app.game?.dispose();
  app.game = null;
  for (const s of menu.skiers) s.model.root.visible = true;
  goMenu();
});

function openSettings() {
  const s = app.settings;
  $('set-quality').value = s.quality;
  $('set-sens').value = s.sens;
  $('set-vol').value = s.volume;
  $('set-music').value = s.music;
  $('set-invert').checked = !!s.invert;
  ui.modal('settings', true);
}
$('set-quality').addEventListener('change', (e) => { app.settings.quality = e.target.value; renderer.setQuality(e.target.value); saveSettings(); });
$('set-sens').addEventListener('input', (e) => { app.settings.sens = +e.target.value; saveSettings(); });
$('set-vol').addEventListener('input', (e) => { app.settings.volume = +e.target.value; sound.setVolume(+e.target.value); saveSettings(); });
$('set-music').addEventListener('input', (e) => { app.settings.music = +e.target.value; sound.setMusic(+e.target.value); saveSettings(); });
$('set-invert').addEventListener('change', (e) => { app.settings.invert = e.target.checked; saveSettings(); });

// pointer lock + keyboard
let chatOpen = false;
function requestLock() {
  if (app.state !== 'game' || chatOpen) return;
  try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch { /* not supported */ }
}
canvas.addEventListener('click', () => { sound.unlock(); if (app.state === 'game') requestLock(); });
document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === canvas;
  $('click-hint').classList.toggle('hidden', locked || app.state !== 'game');
  if (!locked && app.state === 'game' && !chatOpen && !$('settings').classList.contains('show') && !$('howto').classList.contains('show')) ui.modal('pause', true);
  if (locked) ui.modal('pause', false);
});
let dragging = false;
canvas.addEventListener('mousedown', () => { dragging = true; });
window.addEventListener('mouseup', () => { dragging = false; });
window.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement === canvas || (dragging && app.state === 'game')) {
    app.input.mdx += e.movementX || 0;
    app.input.mdy += e.movementY || 0;
  }
});
window.addEventListener('keydown', (e) => {
  if (chatOpen) {
    if (e.key === 'Enter') {
      const text = $('chat-input').value.trim();
      if (text) net.send({ t: 'chat', text });
      closeChat();
    } else if (e.key === 'Escape') closeChat();
    return;
  }
  if (app.state === 'game' && (e.code === 'KeyT' || e.code === 'Enter')) {
    e.preventDefault();
    chatOpen = true;
    app.input.keys.clear();
    if (document.pointerLockElement) document.exitPointerLock();
    ui.openChat(true);
    return;
  }
  if (['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code) && app.state === 'game') e.preventDefault();
  if (!e.repeat) app.input.edges.add(e.code);
  app.input.keys.add(e.code);
});
window.addEventListener('keyup', (e) => app.input.keys.delete(e.code));
window.addEventListener('blur', () => app.input.keys.clear());
function closeChat() {
  chatOpen = false;
  ui.openChat(false);
  requestLock();
}

// ------------------------------------------------------------------ loop
let last = performance.now();
let time = 0;
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  time += dt;
  app.input.blocked = chatOpen || $('pause').classList.contains('show');
  if ((app.state === 'game' || app.state === 'results') && app.game) {
    app.game.update(dt, app.input);
  } else if (app.world) {
    updateMenuScene(dt);
  }
  renderPreview(dt, time);
  renderer.render(dt, time);
  app.input.endFrame();
  requestAnimationFrame(loop);
}

window.__pp = app; // handy for debugging in the console
boot().catch((e) => {
  console.error(e);
  ui.setLoading(1, `Something broke: ${e.message}`);
});
