// Procedural low-poly models: patrollers, tourists, rescue akja, helicopter, charges, rescue props and the
// badge of our fictional organisation "Pistenrettung Hintereck".
// Legal note: no red/white/any-colour cross, no Swiss cross, no Star of Life, no edelweiss — our badge is an
// orange disc with a petrol ring, a white akja silhouette and an ECG pulse line.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export const BRAND = { orange: '#f07b2c', petrol: '#1f6f78', ink: '#1d2a44', rim: '#e2401c', white: '#ffffff' };

/** Runs fn once the "Lilita One" web font is available (canvas text drawn earlier falls back to sans-serif). */
export function afterFonts(fn) {
  try {
    if (typeof document === 'undefined' || !document.fonts) return;
    if (document.fonts.check('20px "Lilita One"')) return;
    document.fonts.load('20px "Lilita One"').then(() => fn(), () => {});
  } catch { /* ignore */ }
}

// ------------------------------------------------------------------ emblem (2D canvas)
function arcText(ctx, text, cx, cy, radius, centerAngle, fontPx, bottom) {
  ctx.font = `${fontPx}px "Lilita One", "Arial Black", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const gap = fontPx * 0.12;
  const widths = [...text].map((ch) => ctx.measureText(ch).width);
  const total = widths.reduce((a, b) => a + b, 0) + gap * (widths.length - 1);
  // top text runs clockwise, bottom text counter-clockwise so both read left -> right
  const dir = bottom ? -1 : 1;
  let a = centerAngle - (dir * total) / (2 * radius);
  [...text].forEach((ch, i) => {
    const w = widths[i];
    a += (dir * w) / (2 * radius);
    ctx.save();
    ctx.translate(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius);
    ctx.rotate(a + (bottom ? -Math.PI / 2 : Math.PI / 2));
    ctx.fillText(ch, 0, 0);
    ctx.restore();
    a += dir * (w / (2 * radius) + gap / radius);
  });
}

/**
 * Draws the Pistenrettung Hintereck badge centred at (cx, cy) with radius r (canvas pixels):
 * orange disc, petrol ring with white keylines, white akja (rescue sled) silhouette with its handle bars and a
 * white ECG pulse line above it. Ring lettering "HINTERECK" / "PISTENRETTUNG" only when r is big enough to read.
 */
export function drawEmblem(ctx, cx, cy, r) {
  const lettering = r >= 34;
  const ringIn = lettering ? r * 0.7 : r * 0.82;
  const TAU = Math.PI * 2;
  ctx.save();
  const disc = (rad, color) => { ctx.beginPath(); ctx.arc(cx, cy, rad, 0, TAU); ctx.fillStyle = color; ctx.fill(); };
  disc(r, '#ffffff');
  disc(r * 0.955, BRAND.petrol);
  disc(ringIn + r * 0.04, '#ffffff');
  disc(ringIn, BRAND.orange);
  if (lettering) {
    ctx.fillStyle = '#ffffff';
    const mid = (ringIn + r * 0.04 + r * 0.955) / 2;
    arcText(ctx, 'HINTERECK', cx, cy, mid, -Math.PI / 2, r * 0.17, false);
    arcText(ctx, 'PISTENRETTUNG', cx, cy, mid, Math.PI / 2, r * 0.125, true);
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(cx + s * mid, cy, r * 0.028, 0, TAU);
      ctx.fill();
    }
  }
  // inside the disc (unit = inner radius R, +y is down)
  const R = ringIn;
  const X = (u) => cx + u * R, Y = (v) => cy + v * R;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, R * 0.97, 0, TAU);
  ctx.clip();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#ffffff';
  ctx.fillStyle = '#ffffff';
  // ECG pulse line (P wave, QRS spike, T wave)
  const ecg = [[-0.92, -0.3], [-0.42, -0.3], [-0.34, -0.38], [-0.26, -0.3], [-0.16, -0.3], [-0.1, -0.22], [0.0, -0.8], [0.1, -0.1], [0.17, -0.3], [0.3, -0.3], [0.4, -0.41], [0.5, -0.3], [0.92, -0.3]];
  ctx.lineWidth = R * 0.085;
  ctx.beginPath();
  ecg.forEach(([u, v], i) => (i ? ctx.lineTo(X(u), Y(v)) : ctx.moveTo(X(u), Y(v))));
  ctx.stroke();
  // casualty lying in the akja: head + body above the rim
  ctx.beginPath();
  ctx.arc(X(-0.5), Y(0.0), R * 0.105, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(X(-0.08), Y(0.07), R * 0.32, R * 0.085, 0, Math.PI, TAU);
  ctx.fill();
  // akja hull: long low tub, bow (right) curving up like a ski tip
  ctx.beginPath();
  ctx.moveTo(X(-0.72), Y(0.08));
  ctx.lineTo(X(0.36), Y(0.08));
  ctx.quadraticCurveTo(X(0.54), Y(0.07), X(0.66), Y(-0.1));
  ctx.quadraticCurveTo(X(0.66), Y(0.33), X(0.3), Y(0.35));
  ctx.lineTo(X(-0.62), Y(0.35));
  ctx.quadraticCurveTo(X(-0.72), Y(0.35), X(-0.72), Y(0.25));
  ctx.closePath();
  ctx.fill();
  // rim line (orange) gives the tub some depth
  ctx.strokeStyle = BRAND.orange;
  ctx.lineWidth = R * 0.04;
  ctx.beginPath();
  ctx.moveTo(X(-0.66), Y(0.165));
  ctx.lineTo(X(0.36), Y(0.165));
  ctx.quadraticCurveTo(X(0.52), Y(0.155), X(0.6), Y(0.04));
  ctx.stroke();
  // handle bar (Holm) reaching forward from the bow, with a grip
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = R * 0.05;
  ctx.beginPath();
  ctx.moveTo(X(0.5), Y(0.06));
  ctx.lineTo(X(0.9), Y(-0.06));
  ctx.stroke();
  // runners
  ctx.lineWidth = R * 0.05;
  ctx.beginPath();
  ctx.moveTo(X(-0.56), Y(0.45));
  ctx.lineTo(X(0.26), Y(0.45));
  ctx.stroke();
  ctx.restore();
  ctx.restore();
}

/** Badge on a transparent square canvas -> CanvasTexture (sRGB). */
export function makeEmblemTexture(size = 256) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d');
  const draw = () => { ctx.clearRect(0, 0, size, size); drawEmblem(ctx, size / 2, size / 2, size / 2 - 2); };
  draw();
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  afterFonts(() => { draw(); tex.needsUpdate = true; });
  return tex;
}
let _emblemTex = null;
const emblemTex = () => (_emblemTex ??= makeEmblemTexture(256));

let _patchMat = null;
/** Shared material for small emblem patches (backpacks, akja bow, vehicles). Use on a CircleGeometry / plane. */
export function makePatchMaterial() {
  return (_patchMat ??= new THREE.MeshStandardMaterial({
    map: emblemTex(), transparent: true, alphaTest: 0.3, roughness: 0.55, metalness: 0,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  }));
}
/** Round emblem patch (Mesh facing +z) of the given diameter in metres. */
export function makeEmblemPatch(diameter = 0.2) {
  const m = new THREE.Mesh(new THREE.CircleGeometry(diameter / 2, 24), makePatchMaterial());
  m.castShadow = false;
  return m;
}

// merge a list of geometries (any mix of indexed / non-indexed) into one position/normal/uv geometry
function mergeGeo(geos, keepColor = false) {
  const keep = keepColor ? ['position', 'normal', 'uv', 'color'] : ['position', 'normal', 'uv'];
  return mergeGeometries(geos.map((g0) => {
    const g = g0.index ? g0.toNonIndexed() : g0;
    for (const n of Object.keys(g.attributes)) if (!keep.includes(n)) g.deleteAttribute(n);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    return g;
  }));
}
function paintGeo(g0, color) {
  const g = g0.index ? g0.toNonIndexed() : g0;
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}
const smooth01 = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

const matCache = new Map();
export function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!matCache.has(key)) {
    matCache.set(key, new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.82, metalness: 0, ...opts }));
  }
  return matCache.get(key);
}
const outlineMat = new THREE.MeshBasicMaterial({ color: '#1c2741', side: THREE.BackSide });

function mesh(geo, material, shadow = true) {
  const m = new THREE.Mesh(geo, material);
  m.castShadow = shadow;
  m.receiveShadow = false;
  return m;
}
function withOutline(m, s = 1.07) {
  const o = new THREE.Mesh(m.geometry, outlineMat);
  o.scale.setScalar(s);
  o.castShadow = false;
  m.add(o);
  return m;
}

const SKIN = ['#f3c9a8', '#e0a98a', '#c78c68', '#9a6748', '#f6d7c0'];

function makeHat(type, color) {
  const g = new THREE.Group();
  const knit = mat(color);
  switch (type) {
    case 'beanie': {
      const dome = mesh(new THREE.SphereGeometry(0.225, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), knit);
      dome.position.y = 0.04;
      const band = mesh(new THREE.CylinderGeometry(0.232, 0.232, 0.08, 8), mat('#f6f9fd'));
      band.position.y = 0.05;
      const pom = mesh(new THREE.IcosahedronGeometry(0.075, 0), mat('#f6f9fd'));
      pom.position.y = 0.29;
      g.add(withOutline(dome, 1.06), band, pom);
      break;
    }
    case 'helmet': {
      const dome = mesh(new THREE.SphereGeometry(0.245, 9, 5, 0, Math.PI * 2, 0, Math.PI / 1.9), mat(color, { roughness: 0.35, metalness: 0.15 }));
      dome.position.y = 0.0;
      g.add(withOutline(dome, 1.05));
      break;
    }
    case 'cap': {
      const dome = mesh(new THREE.SphereGeometry(0.222, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), knit);
      dome.position.y = 0.03;
      const brim = mesh(new THREE.BoxGeometry(0.26, 0.025, 0.2), knit);
      brim.position.set(0, 0.05, 0.25);
      g.add(withOutline(dome, 1.06), brim);
      break;
    }
    case 'ushanka': {
      const fur = mat('#7a5638');
      const dome = mesh(new THREE.SphereGeometry(0.25, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), fur);
      dome.position.y = 0.03;
      const flapL = mesh(new THREE.BoxGeometry(0.06, 0.22, 0.2), fur);
      flapL.position.set(0.23, -0.08, 0);
      const flapR = flapL.clone(); flapR.position.x = -0.23;
      const front = mesh(new THREE.BoxGeometry(0.4, 0.09, 0.06), fur);
      front.position.set(0, 0.12, 0.22);
      g.add(withOutline(dome, 1.05), flapL, flapR, front);
      break;
    }
    case 'viking': {
      const dome = mesh(new THREE.SphereGeometry(0.24, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), mat('#9aa3b2', { roughness: 0.4, metalness: 0.5 }));
      dome.position.y = 0.02;
      const hornGeo = new THREE.ConeGeometry(0.06, 0.32, 6);
      const horn = mat('#f4ead2');
      const hl = mesh(hornGeo, horn); hl.position.set(0.24, 0.16, 0); hl.rotation.z = -0.9;
      const hr = mesh(hornGeo, horn); hr.position.set(-0.24, 0.16, 0); hr.rotation.z = 0.9;
      g.add(withOutline(dome, 1.05), hl, hr);
      break;
    }
    case 'tophat': {
      const black = mat('#22242c');
      const crown = mesh(new THREE.CylinderGeometry(0.17, 0.18, 0.34, 8), black);
      crown.position.y = 0.26;
      const brim = mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.03, 10), black);
      brim.position.y = 0.1;
      const band = mesh(new THREE.CylinderGeometry(0.183, 0.183, 0.06, 8), mat(color));
      band.position.y = 0.15;
      g.add(withOutline(crown, 1.06), brim, band);
      break;
    }
    case 'cowboy': {
      const leather = mat('#a8743f');
      const crown = mesh(new THREE.CylinderGeometry(0.16, 0.21, 0.2, 8), leather);
      crown.position.y = 0.2;
      const brim = mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.03, 12), leather);
      brim.position.y = 0.1;
      brim.scale.z = 0.85;
      g.add(withOutline(crown, 1.06), brim);
      break;
    }
    default: {
      const hair = mesh(new THREE.SphereGeometry(0.218, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2.2), mat('#4a3426'));
      hair.position.y = 0.02;
      g.add(hair);
    }
  }
  return g;
}

/**
 * Low-poly skier. The model faces +z. Returns an object with an `animate` method.
 */
export function makeCharacter({ jacket = '#e63946', pants = '#2b3550', hat = 'beanie', hatColor, skin = 0, patrol = true, skiColor = '#ffd23f' } = {}) {
  const root = new THREE.Group();
  const lean = new THREE.Group();
  root.add(lean);
  const hips = new THREE.Group();
  hips.position.y = 0.92;
  lean.add(hips);

  const jacketMat = mat(jacket);
  const torso = withOutline(mesh(new THREE.CylinderGeometry(0.23, 0.29, 0.62, 7).translate(0, 0.33, 0), jacketMat));
  hips.add(torso);
  const collar = mesh(new THREE.CylinderGeometry(0.17, 0.22, 0.1, 7), mat('#f6f9fd'));
  collar.position.y = 0.66;
  hips.add(collar);
  if (patrol) {
    // little patrol backpack with our emblem patch and a reflective strip
    const pack = mesh(new THREE.BoxGeometry(0.34, 0.38, 0.14), mat(BRAND.petrol));
    pack.position.set(0, 0.36, -0.28);
    const patch = makeEmblemPatch(0.2);
    patch.position.set(0, 0.4, -0.352);
    patch.rotation.y = Math.PI;
    const strip = mesh(new THREE.BoxGeometry(0.345, 0.03, 0.006), mat('#e3e8ee', { metalness: 0.5, roughness: 0.2, emissive: '#50565e', emissiveIntensity: 0.3 }), false);
    strip.position.set(0, 0.22, -0.352);
    hips.add(pack, patch, strip);
  } else {
    const belt = mesh(new THREE.CylinderGeometry(0.295, 0.295, 0.06, 7), mat('#ffffff'));
    belt.position.y = 0.04;
    hips.add(belt);
  }

  const head = new THREE.Group();
  head.position.y = 0.88;
  hips.add(head);
  const skinMat = mat(SKIN[skin % SKIN.length]);
  head.add(withOutline(mesh(new THREE.IcosahedronGeometry(0.21, 1), skinMat), 1.06));
  const nose = mesh(new THREE.ConeGeometry(0.04, 0.09, 5).rotateX(Math.PI / 2), skinMat);
  nose.position.set(0, -0.02, 0.21);
  head.add(nose);
  const strap = mesh(new THREE.CylinderGeometry(0.218, 0.218, 0.07, 9), mat('#22242c'));
  strap.position.y = 0.06;
  head.add(strap);
  const lens = mesh(new THREE.BoxGeometry(0.3, 0.1, 0.06), mat('#ff9a3d', { roughness: 0.15, metalness: 0.6, emissive: '#5a2a00', emissiveIntensity: 0.4 }));
  lens.position.set(0, 0.07, 0.19);
  head.add(lens);
  const eyeMat = mat('#1c2741');
  const eyeL = mesh(new THREE.SphereGeometry(0.025, 5, 4), eyeMat, false);
  eyeL.position.set(0.07, -0.0, 0.19);
  const eyeR = eyeL.clone(); eyeR.position.x = -0.07;
  head.add(eyeL, eyeR);
  const hatG = makeHat(hat, hatColor || jacket);
  hatG.position.y = 0.06;
  head.add(hatG);

  const mkArm = (side) => {
    const arm = new THREE.Group();
    arm.position.set(0.3 * side, 0.58, 0);
    const upper = mesh(new THREE.CylinderGeometry(0.07, 0.065, 0.55, 6).translate(0, -0.27, 0), jacketMat);
    const glove = mesh(new THREE.IcosahedronGeometry(0.075, 0), mat('#22242c'));
    glove.position.y = -0.56;
    const pole = new THREE.Group();
    pole.position.y = -0.56;
    const shaft = mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.15, 4).translate(0, -0.5, 0), mat('#c9ced8', { metalness: 0.6, roughness: 0.3 }));
    const basket = mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.015, 6), mat('#22242c'));
    basket.position.y = -0.95;
    pole.add(shaft, basket);
    pole.rotation.x = 0.35;
    arm.add(upper, glove, pole);
    arm.rotation.z = 0.12 * side;
    hips.add(arm);
    return { arm, pole };
  };
  const armL = mkArm(1), armR = mkArm(-1);

  const pantsMat = mat(pants);
  const skiMat = mat(skiColor);
  const mkLeg = (side) => {
    const leg = new THREE.Group();
    leg.position.set(0.12 * side, 0.02, 0);
    const thigh = mesh(new THREE.BoxGeometry(0.16, 0.82, 0.18).translate(0, -0.42, 0), pantsMat);
    const boot = mesh(new THREE.BoxGeometry(0.17, 0.16, 0.3), mat('#2a2f3d'));
    boot.position.set(0, -0.86, 0.03);
    const ski = new THREE.Group();
    ski.position.set(0, -0.93, 0.05);
    const plank = mesh(new THREE.BoxGeometry(0.1, 0.03, 1.6), skiMat);
    const tip = mesh(new THREE.BoxGeometry(0.1, 0.03, 0.18), skiMat);
    tip.position.set(0, 0.04, 0.85);
    tip.rotation.x = -0.5;
    ski.add(plank, tip);
    leg.add(thigh, boot, ski);
    hips.add(leg);
    return { leg, ski };
  };
  const legL = mkLeg(1), legR = mkLeg(-1);

  // extra props
  const shovel = new THREE.Group();
  const sh1 = mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.8, 4).translate(0, 0.4, 0), mat('#c9ced8'));
  const sh2 = mesh(new THREE.BoxGeometry(0.22, 0.03, 0.26), mat('#ff6b3d'));
  sh2.position.set(0, -0.02, 0.1);
  shovel.add(sh1, sh2);
  shovel.visible = false;
  armR.arm.add(shovel);
  shovel.position.set(0, -0.56, 0.05);
  shovel.rotation.x = Math.PI * 0.9;

  const parts = { root, lean, hips, head, torso, armL, armR, legL, legR, shovel };
  let phase = Math.random() * 10;
  let tumble = 0;

  /**
   * pose: { speed, lean, tuck, plough, air, crash, sit, dig, wave, skate, lie }
   */
  function animate(dt, pose) {
    phase += dt * (pose.skate ? 7 : pose.dig ? 9 : 3);
    const tuck = pose.tuck || 0;
    const crouch = Math.max(tuck * 0.8, pose.air ? 0.15 : 0, 0.22);
    hips.position.y = 0.92 - crouch * 0.22;
    hips.rotation.x = tuck * 0.75 + (pose.dig ? 0.5 + Math.sin(phase) * 0.1 : 0);
    head.rotation.x = -tuck * 0.6;
    lean.rotation.z = THREE.MathUtils.lerp(lean.rotation.z, (pose.lean || 0) * 0.45, Math.min(1, dt * 8));
    const pl = pose.plough || 0;
    legL.leg.position.x = 0.12 + pl * 0.18;
    legR.leg.position.x = -0.12 - pl * 0.18;
    legL.ski.rotation.y = -pl * 0.32;
    legR.ski.rotation.y = pl * 0.32;
    legL.leg.scale.y = legR.leg.scale.y = 1 - crouch * 0.18;
    let la = 0, ra = 0;
    if (pose.skate) { la = Math.sin(phase) * 0.45; ra = -la; }
    legL.leg.rotation.x = la + (pose.sit ? -1.4 : 0);
    legR.leg.rotation.x = ra + (pose.sit ? -1.4 : 0);
    legL.ski.rotation.x = legR.ski.rotation.x = pose.sit ? 1.15 : 0;
    legL.leg.position.z = legR.leg.position.z = 0;
    // arms
    if (pose.wave) {
      armL.arm.rotation.set(0, 0, 2.6 + Math.sin(phase * 3) * 0.4);
      armR.arm.rotation.set(0.2, 0, -0.25);
    } else if (pose.dig) {
      const s = Math.sin(phase);
      armL.arm.rotation.set(-1.3 + s * 0.6, 0, 0.2);
      armR.arm.rotation.set(-1.3 + s * 0.6, 0, -0.2);
    } else if (pose.air) {
      armL.arm.rotation.set(-0.3, 0, 1.1);
      armR.arm.rotation.set(-0.3, 0, -1.1);
    } else if (tuck > 0.3) {
      armL.arm.rotation.set(-1.2 * tuck, 0, -0.1);
      armR.arm.rotation.set(-1.2 * tuck, 0, 0.1);
    } else if (pose.skate) {
      armL.arm.rotation.set(-Math.sin(phase) * 0.8, 0, 0.15);
      armR.arm.rotation.set(Math.sin(phase) * 0.8, 0, -0.15);
    } else {
      armL.arm.rotation.set(-0.35, 0, 0.25);
      armR.arm.rotation.set(-0.35, 0, -0.25);
    }
    armL.pole.visible = armR.pole.visible = !pose.dig && !pose.wave && !pose.noPoles;
    shovel.visible = !!pose.dig;
    // crash tumble
    if (pose.crash) {
      tumble += dt * 9;
      lean.rotation.x = tumble;
      lean.position.y = 0.4 + Math.abs(Math.sin(tumble)) * 0.4;
      armL.arm.rotation.z = 1.8; armR.arm.rotation.z = -1.8;
      legL.leg.rotation.x = Math.sin(tumble * 1.3) * 1.1;
      legR.leg.rotation.x = -Math.sin(tumble * 1.1) * 1.1;
    } else if (pose.lie) {
      lean.rotation.x = -Math.PI / 2;
      lean.position.y = 0.25;
    } else {
      tumble = 0;
      lean.rotation.x = THREE.MathUtils.lerp(lean.rotation.x, 0, Math.min(1, dt * 10));
      lean.position.y = THREE.MathUtils.lerp(lean.position.y, pose.sit ? -0.25 : 0, Math.min(1, dt * 10));
    }
  }

  return { root, parts, animate };
}

const TOURIST_SUITS = [
  ['#ff4fa3', '#38e1d4'], ['#38e1d4', '#7d3cff'], ['#ffe14d', '#ff4fa3'], ['#7d3cff', '#ffe14d'],
  ['#ff8a00', '#2b3550'], ['#46e06a', '#ff4fa3'], ['#ffffff', '#e63946'], ['#00b3ff', '#ffe14d'],
];
const TOURIST_HATS = ['beanie', 'cap', 'none', 'helmet', 'cowboy', 'beanie'];
export function makeTourist(look = 0) {
  const s = TOURIST_SUITS[look % TOURIST_SUITS.length];
  return makeCharacter({
    jacket: s[0], pants: s[1], hat: TOURIST_HATS[(look >> 3) % TOURIST_HATS.length], hatColor: s[1],
    skin: (look >> 5) % 5, patrol: false, skiColor: ['#ffffff', '#ff4fa3', '#38e1d4'][look % 3],
  });
}

// ------------------------------------------------------------------ rescue akja (aluminium tub sled)
// Coordinate convention (unchanged from the old toboggan): bow toward +z, origin on the snow under the runners.
const AKJA_Z = [-1.13, 1.17]; // stern, bow tip -> 2.3 m long
function akjaStation(s) {
  let w = 0.325; // half width -> 0.65 m
  if (s < 0.06) w *= 0.8 + 0.2 * Math.sqrt(1 - ((0.06 - s) / 0.06) ** 2);
  if (s > 0.6) { const t = (s - 0.6) / 0.4; w *= Math.sqrt(Math.max(0, 1 - t * t)); }
  const tb = Math.max(0, (s - 0.55) / 0.45);
  const tr = Math.max(0, (s - 0.68) / 0.32);
  return { z: AKJA_Z[0] + s * (AKJA_Z[1] - AKJA_Z[0]), w, bottom: 0.035 + 0.5 * tb * tb, rim: 0.37 + 0.2 * tr * tr };
}
const AKJA_NS = 28, AKJA_NC = 16;
const akjaS = (i) => 1 - Math.pow(1 - i / AKJA_NS, 1.35); // denser toward the bow
function akjaPoint(st, j) {
  const phi = (Math.PI * j) / AKJA_NC;
  const c = Math.cos(phi), sn = Math.sin(phi);
  const y = st.rim - (st.rim - st.bottom) * Math.pow(sn, 0.42);
  const h01 = (y - st.bottom) / Math.max(1e-4, st.rim - st.bottom);
  return [st.w * Math.sign(c) * Math.pow(Math.abs(c), 0.5) * (0.84 + 0.16 * h01), y, st.z];
}
let akjaGeo = null;
function akjaGeometries() {
  if (akjaGeo) return akjaGeo;
  const pos = [], uv = [], idx = [];
  const row = AKJA_NC + 1;
  for (let i = 0; i <= AKJA_NS; i++) {
    const st = akjaStation(akjaS(i));
    for (let j = 0; j <= AKJA_NC; j++) { pos.push(...akjaPoint(st, j)); uv.push(i / AKJA_NS, j / AKJA_NC); }
  }
  for (let i = 0; i < AKJA_NS; i++) for (let j = 0; j < AKJA_NC; j++) {
    const a = i * row + j, b = a + row, c = b + 1, d = a + 1;
    idx.push(a, b, d, b, c, d);
  }
  // stern wall: fan from the middle of the stern top edge
  const st0 = akjaStation(0);
  const centre = pos.length / 3;
  pos.push(0, st0.rim, st0.z); uv.push(0, 0.5);
  for (let j = 0; j < AKJA_NC; j++) idx.push(centre, j, j + 1);
  const shell = new THREE.BufferGeometry();
  shell.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  shell.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  shell.setIndex(idx);
  shell.computeVertexNormals();
  // rolled rim: right edge stern -> bow, left edge bow -> stern, closed across the stern
  const rimPts = [];
  for (let i = 0; i < AKJA_NS; i++) rimPts.push(new THREE.Vector3(...akjaPoint(akjaStation(akjaS(i)), 0)));
  rimPts.push(new THREE.Vector3(0, akjaStation(1).rim - 0.01, AKJA_Z[1] - 0.005));
  for (let i = AKJA_NS - 1; i >= 0; i--) rimPts.push(new THREE.Vector3(...akjaPoint(akjaStation(akjaS(i)), AKJA_NC)));
  const rim = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rimPts, true, 'centripetal'), 140, 0.024, 6, true);
  akjaGeo = { shell, rim };
  return akjaGeo;
}
let akjaMats = null;
function akjaMaterials() {
  return (akjaMats ??= {
    metal: new THREE.MeshStandardMaterial({ color: '#d4d9e0', metalness: 0.7, roughness: 0.35, side: THREE.DoubleSide }),
    rim: new THREE.MeshStandardMaterial({ color: BRAND.rim, roughness: 0.45, metalness: 0.1 }),
    pad: new THREE.MeshStandardMaterial({ color: BRAND.orange, roughness: 0.85 }),
    dark: new THREE.MeshStandardMaterial({ color: '#23262e', roughness: 0.7 }),
    pole: new THREE.MeshStandardMaterial({ color: '#c3c9d2', metalness: 0.75, roughness: 0.3 }),
    rope: new THREE.MeshStandardMaterial({ color: '#ffd23f', roughness: 0.8 }),
    wood: new THREE.MeshStandardMaterial({ color: '#8a5a36', roughness: 0.85, side: THREE.DoubleSide }),
    woodDark: new THREE.MeshStandardMaterial({ color: '#5a3a24', roughness: 0.85 }),
  });
}

/**
 * Aluminium rescue akja (~2.3 m x 0.65 m): metal tub with upturned bow, orange-red rim, orange padding,
 * handle bars (Holme) reaching forward from the bow, rope loop at the stern and the emblem on the bow.
 * opts.wood = an old wooden akja (decoration, no padding / handle bars).
 * Returns { root, body, seat }: body is tilted / rolled by the game, seat = where a patient lies.
 */
export function makeToboggan({ wood = false } = {}) {
  const M = akjaMaterials();
  const G = akjaGeometries();
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  const shell = mesh(G.shell, wood ? M.wood : M.metal);
  const rim = mesh(G.rim, wood ? M.woodDark : M.rim);
  body.add(shell, rim);
  // runners (Kufen) under the flat part of the hull
  const darkParts = [], poleGeos = [];
  for (const x of [-0.17, 0.17]) poleGeos.push(new THREE.BoxGeometry(0.04, 0.036, 1.5).translate(x, 0.018, -0.3));
  if (!wood) {
    // padding + head cushion
    const pad = mesh(mergeGeo([
      new RoundedBoxGeometry(0.44, 0.075, 1.3, 2, 0.03).translate(0, 0.11, -0.32),
      new RoundedBoxGeometry(0.36, 0.09, 0.26, 2, 0.04).rotateX(-0.25).translate(0, 0.225, 0.56),
    ]), M.pad, false);
    pad.receiveShadow = true;
    body.add(pad);
    // patient straps
    for (const z of [-0.78, -0.3, 0.15]) darkParts.push(new THREE.BoxGeometry(0.46, 0.012, 0.05).translate(0, 0.153, z));
    // handle bars (Holme): two poles from the bow brackets forward / up, rubber grips at the ends
    const gripGeos = [];
    for (const s of [-1, 1]) {
      const a = new THREE.Vector3(0.27 * s, 0.37, 0.52), b = new THREE.Vector3(0.34 * s, 0.8, 1.95);
      const dir = b.clone().sub(a);
      const len = dir.length();
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
      const m4 = new THREE.Matrix4().compose(a.clone().lerp(b, 0.5), q, new THREE.Vector3(1, 1, 1));
      poleGeos.push(new THREE.CylinderGeometry(0.019, 0.019, len, 8).applyMatrix4(m4));
      const gm = new THREE.Matrix4().compose(b.clone().addScaledVector(dir, -0.09), q, new THREE.Vector3(1, 1, 1));
      gripGeos.push(new THREE.CylinderGeometry(0.025, 0.025, 0.2, 10).applyMatrix4(gm));
      darkParts.push(new THREE.BoxGeometry(0.06, 0.09, 0.14).translate(0.285 * s, 0.36, 0.5)); // bracket
    }
    darkParts.push(...gripGeos);
    // rope loop at the stern for the second rescuer
    const loop = mesh(new THREE.TorusGeometry(0.2, 0.014, 5, 16, Math.PI).rotateX(-Math.PI / 2 + 0.35), M.rope, false);
    loop.position.set(0, 0.34, AKJA_Z[0] - 0.01);
    body.add(loop);
    // emblem on both sides of the bow
    const st = akjaStation(0.8);
    for (const s of [-1, 1]) {
      const p = makeEmblemPatch(0.15);
      p.position.set(s * (st.w * 0.92 + 0.006), (st.rim + st.bottom) / 2 + 0.015, st.z);
      p.rotation.y = s * (Math.PI / 2 - 0.42);
      p.rotation.x = 0.0;
      body.add(p);
    }
  } else {
    // old wooden akja: short rope handle at the bow
    const loop = mesh(new THREE.TorusGeometry(0.12, 0.014, 5, 14, Math.PI).rotateX(Math.PI / 2), M.rope, false);
    loop.position.set(0, akjaStation(0.97).rim, AKJA_Z[1] - 0.06);
    body.add(loop);
  }
  body.add(mesh(mergeGeo(poleGeos), M.pole));
  if (darkParts.length) body.add(mesh(mergeGeo(darkParts), M.dark, false));
  const seat = new THREE.Group();
  seat.position.set(0, 0.36, -0.1);
  body.add(seat);
  return { root: g, body, seat };
}

// ------------------------------------------------------------------ rescue helicopter "Föhn 1" (operator Talflug)
// Root origin = bottom of the landing skids (ground contact), nose toward +z.
// Rotor hub height above the skids: HELI_DIMS.hub = 3.05 m; main rotor radius 5.25 m; overall length ~8.6 m.
export const HELI_DIMS = { hub: 3.05, rotorRadius: 5.25, z0: -6.0, z1: 2.6 };
function heliProfile(z) {
  let a = 0.8, b = 0.9, c = 1.52, belly = 0.82;
  if (z > 0.9) {
    const t = Math.min(1, (z - 0.9) / (HELI_DIMS.z1 - 0.9));
    a *= Math.sqrt(Math.max(0, 1 - Math.pow(t, 2.2)));
    b *= Math.sqrt(Math.max(0, 1 - Math.pow(t, 3.0)));
    c -= 0.3 * t * t;
  }
  const k = smooth01(-2.4, -0.4, z);
  const tb = Math.min(1, Math.max(0, (-2.4 - z) / 3.4));
  const ab = 0.27 - 0.1 * tb, bb = 0.31 - 0.11 * tb, cb = 1.98 + 0.06 * tb;
  a = ab + (a - ab) * k; b = bb + (b - bb) * k; c = cb + (c - cb) * k; belly = 1 + (belly - 1) * k;
  if (z < HELI_DIMS.z0 + 0.25) { const q = Math.sqrt(Math.max(0, (z - HELI_DIMS.z0) / 0.25)); a *= q; b *= q; }
  return { a, b, c, belly };
}
const spow = (v, p) => Math.sign(v) * Math.pow(Math.abs(v), p);
function heliPoint(z, th, P = heliProfile(z)) {
  const cs = Math.cos(th);
  return [P.a * spow(Math.sin(th), 0.75), P.c - P.b * spow(cs, 0.75) * (cs > 0 ? P.belly : 1), z];
}
function heliStations() {
  const zs = [];
  const { z0, z1 } = HELI_DIMS;
  for (let i = 0; i < 12; i++) zs.push(z0 + ((-2.4 - z0) * i) / 12);
  for (let i = 0; i < 22; i++) zs.push(-2.4 + (3.3 * i) / 22);
  for (let i = 0; i <= 14; i++) zs.push(0.9 + (z1 - 0.9) * (1 - Math.pow(1 - i / 14, 1.8)));
  return zs;
}
function heliFuselageGeometry() {
  const zs = heliStations();
  const NT = 36;
  const pos = [], uv = [], idx = [];
  const { z0, z1 } = HELI_DIMS;
  for (const z of zs) {
    const P = heliProfile(z);
    for (let j = 0; j <= NT; j++) {
      const th = (j / NT) * Math.PI * 2;
      pos.push(...heliPoint(z, th, P));
      uv.push((z - z0) / (z1 - z0), j / NT);
    }
  }
  const row = NT + 1;
  for (let i = 0; i < zs.length - 1; i++) for (let j = 0; j < NT; j++) {
    const a = i * row + j, b = a + row, c = b + 1, d = a + 1;
    idx.push(a, d, b, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
// livery painted in (z, theta) space: theta 0 = belly, PI/2 = left side (+x), PI = top, 3PI/2 = right side (-x)
function heliTexture() {
  const W = 2048, H = 1024;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const c = cv.getContext('2d');
  const { z0, z1 } = HELI_DIMS;
  const TAU = Math.PI * 2;
  const px = (z) => ((z - z0) / (z1 - z0)) * W;
  const py = (th) => (1 - th / TAU) * H;
  // metres of surface per radian of theta at (z, th), measured on the real (superellipse) cross-section
  const arcLen = (z, th) => {
    const P = heliProfile(z), e = 0.02;
    const p0 = heliPoint(z, th - e, P), p1 = heliPoint(z, th + e, P);
    return Math.max(0.05, Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) / (2 * e));
  };
  const sideTh = (side, th) => (side > 0 ? th : TAU - th);
  const poly = (side, pts, fill) => {
    c.beginPath();
    pts.forEach(([z, th], i) => { const X = px(z), Y = py(sideTh(side, th)); i ? c.lineTo(X, Y) : c.moveTo(X, Y); });
    c.closePath();
    c.fillStyle = fill;
    c.fill();
  };
  const range = (a, b, n = 40) => Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n);
  // viewer-aligned drawing frame at (z, th) on a side: x = metres to the viewer's right, y = metres down
  const frame = (side, z, th) => {
    const sx = W / (z1 - z0), sy = H / TAU / arcLen(z, th);
    c.setTransform(side > 0 ? -sx : sx, 0, 0, side > 0 ? sy : -sy, px(z), py(sideTh(side, th)));
  };
  const paint = () => {
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = '#f4f6f8';
    c.fillRect(0, 0, W, H);
    const bellyTh = (z) => 0.95 + 0.25 * smooth01(-0.6, -2.6, z);
    const stripeTh = (z) => 1.12 + 0.12 * smooth01(-0.5, -2.8, z);
    const stripeW = (z) => 0.55 + 0.45 * smooth01(-3.2, -0.6, z); // stripes taper along the tail boom
    const zsAll = range(z0, z1, 80);
    for (const side of [1, -1]) {
      // navy belly
      poly(side, [...zsAll.map((z) => [z, 0]), ...zsAll.slice().reverse().map((z) => [z, bellyTh(z)])], BRAND.ink);
      // petrol + orange stripes, constant physical width, from the nose to the fin
      const zs = range(-5.55, 2.25, 80);
      const band = (o0, o1, fill) => {
        const lo = zs.map((z) => [z, stripeTh(z) + (o0 * stripeW(z)) / arcLen(z, stripeTh(z))]);
        const hi = zs.map((z) => [z, stripeTh(z) + (o1 * stripeW(z)) / arcLen(z, stripeTh(z))]).reverse();
        poly(side, [...lo, ...hi], fill);
      };
      band(-0.05, 0.03, BRAND.petrol);
      band(0.06, 0.21, BRAND.orange);
      // side windows (front door + sliding door) and door seams
      const win = (za, zb, t0, t1) => {
        const g = c.createLinearGradient(0, py(sideTh(side, t1)), 0, py(sideTh(side, t0)));
        g.addColorStop(0, '#3f5f80'); g.addColorStop(1, '#141c2b');
        poly(side, [[za + 0.06, t0], [zb, t0], [zb, t1 - 0.06], [zb - 0.1, t1], [za, t1], [za, t0 + 0.08]], g);
      };
      win(0.32, 1.02, 1.74, 2.42);
      win(-0.95, 0.16, 1.74, 2.36);
      c.strokeStyle = '#aab3bf';
      c.lineWidth = 3;
      for (const [za, zb] of [[0.24, 1.1], [-1.04, 0.22]]) {
        c.beginPath();
        c.moveTo(px(za), py(sideTh(side, 1.0))); c.lineTo(px(za), py(sideTh(side, 2.5)));
        c.lineTo(px(zb), py(sideTh(side, 2.5))); c.lineTo(px(zb), py(sideTh(side, 1.0)));
        c.stroke();
      }
      // emblem on the front door
      frame(side, 0.66, 1.5);
      drawEmblem(c, 0, 0, 0.22);
      // operator name on the cabin
      frame(side, -0.42, 1.56);
      c.fillStyle = BRAND.petrol;
      c.font = '0.25px "Lilita One", "Arial Black", sans-serif';
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('TALFLUG', 0, 0.01);
      // call sign on the tail boom, above the stripes
      const tz = -3.7, tth = stripeTh(tz) + (0.21 * stripeW(tz) + 0.14) / arcLen(tz, stripeTh(tz));
      frame(side, tz, tth);
      c.fillStyle = BRAND.ink;
      c.font = '0.2px "Lilita One", "Arial Black", sans-serif';
      c.fillText('FÖHN 1', 0, 0.01);
      c.setTransform(1, 0, 0, 1, 0, 0);
    }
    // windshield bubble (symmetric around the top, theta = PI) + centre post
    const ws = range(1.02, 2.5, 30);
    const span = (z) => 0.5 + 1.1 * Math.pow((z - 1.02) / 1.48, 0.8);
    c.beginPath();
    ws.forEach((z, i) => (i ? c.lineTo(px(z), py(Math.PI - span(z))) : c.moveTo(px(z), py(Math.PI - span(z)))));
    ws.slice().reverse().forEach((z) => c.lineTo(px(z), py(Math.PI + span(z))));
    c.closePath();
    const wg = c.createLinearGradient(px(1.0), 0, px(2.6), 0);
    wg.addColorStop(0, '#1a2436'); wg.addColorStop(0.6, '#2d4766'); wg.addColorStop(1, '#4d6f93');
    c.fillStyle = wg;
    c.fill();
    c.fillStyle = '#c9d0da';
    c.fillRect(px(1.02), py(Math.PI) - 4, px(2.42) - px(1.02), 8);
  };
  paint();
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  afterFonts(() => { paint(); tex.needsUpdate = true; });
  return tex;
}
let heliShared = null;
function heliParts() {
  if (heliShared) return heliShared;
  const white = new THREE.MeshPhysicalMaterial({ color: '#f4f6f8', roughness: 0.32, metalness: 0.05, clearcoat: 0.6, clearcoatRoughness: 0.2 });
  const S = {
    fuselage: heliFuselageGeometry(),
    paint: new THREE.MeshPhysicalMaterial({ map: heliTexture(), roughness: 0.32, metalness: 0.05, clearcoat: 0.6, clearcoatRoughness: 0.2 }),
    white,
    petrol: new THREE.MeshStandardMaterial({ color: BRAND.petrol, roughness: 0.4 }),
    orange: new THREE.MeshStandardMaterial({ color: BRAND.orange, roughness: 0.4 }),
    dark: new THREE.MeshStandardMaterial({ color: '#2a2e38', roughness: 0.55, metalness: 0.3 }),
    skid: new THREE.MeshStandardMaterial({ color: '#aab2be', roughness: 0.35, metalness: 0.6 }),
    navRed: new THREE.MeshStandardMaterial({ color: '#ff3020', emissive: '#ff2010', emissiveIntensity: 2 }),
    navGreen: new THREE.MeshStandardMaterial({ color: '#30ff60', emissive: '#10ff40', emissiveIntensity: 2 }),
    rope: new THREE.MeshStandardMaterial({ color: '#ffd23f', roughness: 0.7 }),
  };
  const bottomAt = (z) => { const P = heliProfile(z); return P.c - P.b * P.belly; };
  // landing skids: two runners + two arched cross tubes
  const skid = [];
  for (const s of [-1, 1]) {
    const x = 1.08 * s;
    skid.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
      new THREE.Vector3(x, 0.05, -1.6), new THREE.Vector3(x, 0.05, 1.15), new THREE.Vector3(x, 0.1, 1.6), new THREE.Vector3(x, 0.3, 1.82),
    ]), 24, 0.05, 6));
  }
  for (const z of [0.85, -0.85]) {
    const top = bottomAt(z) - 0.02;
    skid.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
      new THREE.Vector3(-1.08, 0.06, z), new THREE.Vector3(-1.02, top * 0.5, z), new THREE.Vector3(-0.72, top - 0.05, z),
      new THREE.Vector3(0, top, z), new THREE.Vector3(0.72, top - 0.05, z), new THREE.Vector3(1.02, top * 0.5, z), new THREE.Vector3(1.08, 0.06, z),
    ]), 24, 0.042, 6));
  }
  S.skids = mergeGeo(skid);
  // engine cowling + horizontal stabiliser (white)
  const stabZ = -4.75, stabY = heliProfile(stabZ).c;
  S.whiteGeo = mergeGeo([
    new THREE.CapsuleGeometry(0.4, 1.5, 4, 14).rotateX(Math.PI / 2).scale(0.95, 0.55, 1).translate(0, 2.32, -0.42),
    new THREE.BoxGeometry(1.75, 0.05, 0.4).translate(0, stabY, stabZ),
  ]);
  // fin (petrol) with an orange cap and stabiliser end plates (orange)
  const finShape = (pts) => { const sh = new THREE.Shape(); pts.forEach(([z, y], i) => (i ? sh.lineTo(z, y) : sh.moveTo(z, y))); sh.closePath(); return sh; };
  const fin = (pts, t) => new THREE.ExtrudeGeometry(finShape(pts), { depth: t, bevelEnabled: false }).rotateY(-Math.PI / 2).translate(t / 2, 0, 0);
  S.finGeo = fin([[-5.0, 2.1], [-5.42, 3.2], [-5.86, 3.32], [-6.02, 3.18], [-5.95, 2.1], [-5.86, 1.52], [-5.6, 1.46], [-5.36, 1.86]], 0.07);
  S.capGeo = mergeGeo([
    fin([[-5.38, 3.05], [-5.42, 3.2], [-5.86, 3.32], [-6.02, 3.18], [-6.0, 3.05]], 0.08),
    new THREE.BoxGeometry(0.035, 0.26, 0.3).translate(0.875, stabY + 0.05, stabZ - 0.02),
    new THREE.BoxGeometry(0.035, 0.26, 0.3).translate(-0.875, stabY + 0.05, stabZ - 0.02),
  ]);
  // dark bits: rotor mast, hub, exhausts, rescue hoist above the right-hand door, cargo hook
  S.darkGeo = mergeGeo([
    new THREE.CylinderGeometry(0.085, 0.1, 0.6, 10).translate(0, 2.72, -0.3),
    new THREE.CylinderGeometry(0.075, 0.09, 0.32, 8).rotateX(Math.PI / 2 - 0.3).translate(0.23, 2.36, -1.62),
    new THREE.CylinderGeometry(0.075, 0.09, 0.32, 8).rotateX(Math.PI / 2 - 0.3).translate(-0.23, 2.36, -1.62),
    new THREE.BoxGeometry(0.62, 0.09, 0.14).translate(-0.86, 2.3, 0.15),
    new THREE.CylinderGeometry(0.1, 0.1, 0.32, 10).rotateX(Math.PI / 2).translate(-1.18, 2.24, 0.15),
    new THREE.BoxGeometry(0.16, 0.1, 0.2).translate(0, bottomAt(0.1) - 0.03, 0.1),
  ]);
  // main rotor: hub + 3 blades (dark) with orange tip markings
  const blades = [new THREE.CylinderGeometry(0.26, 0.22, 0.16, 12)], tips = [];
  for (let k = 0; k < 3; k++) {
    const r = (k * Math.PI * 2) / 3;
    blades.push(new THREE.BoxGeometry(4.75, 0.035, 0.3).translate(0.22 + 2.375, 0, 0).rotateY(r));
    tips.push(new THREE.BoxGeometry(0.3, 0.04, 0.31).translate(HELI_DIMS.rotorRadius - 0.15, 0, 0).rotateY(r));
  }
  S.bladeGeo = mergeGeo(blades);
  S.tipGeo = mergeGeo(tips);
  // tail rotor (spins around x): one two-bladed bar in the y-z plane + hub
  S.tailGeo = mergeGeo([
    new THREE.BoxGeometry(0.03, 1.3, 0.1),
    new THREE.CylinderGeometry(0.06, 0.06, 0.1, 8).rotateZ(Math.PI / 2),
  ]);
  S.beaconGeo = mergeGeo([
    new THREE.SphereGeometry(0.075, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 2.5, -1.15),
    new THREE.SphereGeometry(0.075, 12, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2).translate(0, bottomAt(-0.5) + 0.01, -0.5),
  ]);
  S.navGeo = new THREE.SphereGeometry(0.05, 8, 6);
  S.stab = { z: stabZ, y: stabY };
  S.bottomAt = bottomAt;
  heliShared = S;
  return S;
}

/**
 * Rescue helicopter "Föhn 1" of the fictional operator Talflug: white, navy belly, petrol + orange stripes,
 * badge on both doors, skids. Root origin = skid bottom (ground contact), nose toward +z; rotor hub at y = 3.05.
 * Returns { root, rotor, tailRotor, rope, beacon } — rotor spins around y, tailRotor around x, rope is a
 * 1 m cylinder hanging from the belly hook (scale.y = length), beacon = red anti-collision light (emissive).
 */
export function makeHelicopter() {
  const S = heliParts();
  const g = new THREE.Group();
  const body = mesh(S.fuselage, S.paint);
  body.receiveShadow = true;
  g.add(body, mesh(S.whiteGeo, S.white), mesh(S.finGeo, S.petrol), mesh(S.capGeo, S.orange), mesh(S.darkGeo, S.dark), mesh(S.skids, S.skid));
  const rotor = new THREE.Group();
  rotor.position.y = HELI_DIMS.hub;
  rotor.add(mesh(S.bladeGeo, S.dark), mesh(S.tipGeo, S.orange, false));
  const tailRotor = mesh(S.tailGeo, S.dark);
  tailRotor.position.set(0.11, 2.7, -5.62);
  const beaconMat = new THREE.MeshStandardMaterial({ color: '#ff2a1a', emissive: '#ff1a0a', emissiveIntensity: 2.5 });
  const beacon = mesh(S.beaconGeo, beaconMat, false);
  const navL = mesh(S.navGeo, S.navRed, false);
  navL.position.set(0.9, S.stab.y + 0.25, S.stab.z);
  const navR = mesh(S.navGeo, S.navGreen, false);
  navR.position.set(-0.9, S.stab.y + 0.25, S.stab.z);
  const rope = mesh(new THREE.CylinderGeometry(0.02, 0.02, 1, 4).translate(0, -0.5, 0), S.rope, false);
  rope.position.set(0, S.bottomAt(0.1) - 0.08, 0.1);
  rope.visible = false;
  g.add(rotor, tailRotor, beacon, navL, navR, rope);
  g.userData.rotorHub = HELI_DIMS.hub;
  return { root: g, rotor, tailRotor, rope, beacon };
}

// ------------------------------------------------------------------ rescue props (origin on the snow, +y up)
let propMats = null;
function propMaterials() {
  return (propMats ??= {
    vcol: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.2, side: THREE.DoubleSide }),
    snow: new THREE.MeshStandardMaterial({ color: '#f4f7fb', roughness: 0.9 }),
    dark: new THREE.MeshStandardMaterial({ color: '#23262e', roughness: 0.6 }),
    pole: new THREE.MeshStandardMaterial({ color: '#d9dee6', metalness: 0.5, roughness: 0.35 }),
    marker: new THREE.MeshStandardMaterial({ color: '#ff7a1a', emissive: '#ff5a00', emissiveIntensity: 0.35, roughness: 0.6 }),
    ring: new THREE.MeshBasicMaterial({ color: BRAND.orange, transparent: true, opacity: 0.42, depthWrite: false, side: THREE.DoubleSide }),
    mattress: new THREE.MeshStandardMaterial({ color: BRAND.orange, roughness: 0.75, flatShading: true }),
    strap: new THREE.MeshStandardMaterial({ color: '#ffd23f', roughness: 0.6 }),
    foil: new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, metalness: 0.9, roughness: 0.3, flatShading: true, side: THREE.DoubleSide }),
  });
}
const skiMatCache = new Map();

/** Two skis stuck upright in the snow, crossed in an X (~1.7 m tall) — secures an accident site uphill. */
export function makeCrossedSkis(color = BRAND.rim) {
  const P = propMaterials();
  if (!skiMatCache.has(color)) skiMatCache.set(color, new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.1 }));
  const shape = new THREE.Shape();
  shape.moveTo(-0.045, -0.32); shape.lineTo(0.045, -0.32); shape.lineTo(0.05, 1.56);
  shape.quadraticCurveTo(0.052, 1.74, 0, 1.78); shape.quadraticCurveTo(-0.052, 1.74, -0.05, 1.56); shape.closePath();
  const ski = new THREE.ExtrudeGeometry(shape, { depth: 0.02, bevelEnabled: false, curveSegments: 6 }).translate(0, 0, -0.01);
  // tip rocker: bend the top of the ski backwards
  const p = ski.attributes.position;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y > 1.45) p.setZ(i, p.getZ(i) - (y - 1.45) ** 2 * 0.9); }
  ski.computeVertexNormals();
  const tilt = 0.27, x0 = 1.2 * Math.tan(tilt);
  const skis = [], dark = [], snow = [];
  for (const s of [-1, 1]) {
    const m4 = new THREE.Matrix4().compose(new THREE.Vector3(s * x0, 0, s * 0.025), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, s > 0 ? 0 : Math.PI, tilt)), new THREE.Vector3(1, 1, 1));
    skis.push(ski.clone().applyMatrix4(m4));
    dark.push(new THREE.BoxGeometry(0.075, 0.3, 0.05).translate(0, 0.78, 0.03).applyMatrix4(m4));
    snow.push(new THREE.SphereGeometry(0.17, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.45, 0.8).translate(s * x0, -0.01, s * 0.025));
  }
  const g = new THREE.Group();
  g.add(mesh(mergeGeo(skis), skiMatCache.get(color)), mesh(mergeGeo(dark), P.dark), mesh(mergeGeo(snow), P.snow, false));
  return g;
}

/** Avalanche probe stuck in the debris, ~1.3 m visible. hit = small orange flag on top (probe strike). */
export function makeProbe(hit = false) {
  const P = propMaterials();
  const parts = [];
  const r = 0.011;
  let y = -0.15;
  for (let k = 0; y < 1.2; k++) {
    const h = Math.min(0.4, 1.2 - y);
    parts.push(paintGeo(new THREE.CylinderGeometry(r, r, h, 6).translate(0, y + h / 2, 0), k % 2 ? BRAND.orange : '#c3c9d2'));
    parts.push(paintGeo(new THREE.CylinderGeometry(r * 1.35, r * 1.35, 0.02, 6).translate(0, y + h, 0), '#3a3f4a'));
    y += h;
  }
  parts.push(paintGeo(new THREE.CylinderGeometry(0.02, 0.018, 0.12, 8).translate(0, 1.26, 0), '#23262e'));
  parts.push(paintGeo(new THREE.SphereGeometry(0.024, 8, 6).translate(0, 1.33, 0), BRAND.orange));
  if (hit) {
    const flag = new THREE.BufferGeometry();
    flag.setAttribute('position', new THREE.Float32BufferAttribute([0, 1.31, 0, 0.24, 1.25, 0, 0, 1.17, 0], 3));
    flag.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
    flag.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 1, 0.5, 0, 0], 2));
    parts.push(paintGeo(flag, '#ff6a00'));
  }
  const g = new THREE.Group();
  const m = mesh(mergeGeo(parts, true), P.vcol);
  g.add(m);
  return g;
}

let sockTex = null;
/** Orange/white windsock on a pole. root.userData.windsock = yaw pivot (sock points along its local +z). */
export function makeWindsock(height = 3) {
  const P = propMaterials();
  if (!sockTex) {
    const cv = document.createElement('canvas');
    cv.width = 2; cv.height = 5;
    const c = cv.getContext('2d');
    for (let i = 0; i < 5; i++) { c.fillStyle = i % 2 ? '#ffffff' : '#ff6a1a'; c.fillRect(0, i, 2, 1); }
    sockTex = new THREE.CanvasTexture(cv);
    sockTex.colorSpace = THREE.SRGBColorSpace;
    sockTex.magFilter = THREE.NearestFilter;
    sockTex.minFilter = THREE.NearestFilter;
    sockTex.generateMipmaps = false;
  }
  P.sock ??= new THREE.MeshStandardMaterial({ map: sockTex, roughness: 0.8, side: THREE.DoubleSide });
  const root = new THREE.Group();
  root.add(mesh(mergeGeo([
    new THREE.CylinderGeometry(0.035, 0.05, height, 8).translate(0, height / 2, 0),
    new THREE.CylinderGeometry(0.06, 0.06, 0.08, 8).translate(0, height - 0.12, 0),
  ]), P.pole));
  const sock = new THREE.Group();
  sock.position.y = height - 0.12;
  const droop = new THREE.Group();
  droop.rotation.x = 0.2;
  const cone = mesh(new THREE.CylinderGeometry(0.17, 0.08, 1.0, 12, 5, true).rotateX(-Math.PI / 2).translate(0, 0, 0.58), P.sock);
  const hoop = mesh(new THREE.TorusGeometry(0.17, 0.012, 4, 16).translate(0, 0, 0.08), P.dark, false);
  droop.add(cone, hoop);
  sock.add(droop);
  root.add(sock);
  root.userData.windsock = sock;
  return root;
}

/**
 * Helicopter landing-zone marking: 4 orange L corners of a 20 x 20 m square, translucent orange ground ring
 * (r = 8 m) and a windsock on a 3 m pole at one corner. userData.windsock = sock pivot, userData.ring = ring.
 */
export function makeLZMarker() {
  const P = propMaterials();
  const g = new THREE.Group();
  const arms = [];
  const H = 10, L = 2.6, T = 0.4;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    arms.push(new THREE.BoxGeometry(L, 0.04, T).translate(sx * (H - L / 2), 0.05, sz * (H - T / 2)));
    arms.push(new THREE.BoxGeometry(T, 0.04, L - T).translate(sx * (H - T / 2), 0.05, sz * (H - T - (L - T) / 2)));
  }
  const corners = mesh(mergeGeo(arms), P.marker, false);
  corners.receiveShadow = true;
  const ring = new THREE.Mesh(new THREE.RingGeometry(7.55, 8, 64).rotateX(-Math.PI / 2).translate(0, 0.06, 0), P.ring);
  ring.renderOrder = 1;
  const sock = makeWindsock(3);
  sock.position.set(H + 0.8, 0, -H - 0.8);
  g.add(corners, ring, sock);
  g.userData.windsock = sock.userData.windsock;
  g.userData.ring = ring;
  return g;
}

/** Gold rescue blanket draped over a lying adult (~1.7 x 0.8 m); origin bottom centre, long axis along z. */
export function makeRescueBlanket() {
  const P = propMaterials();
  const geo = new THREE.PlaneGeometry(0.95, 1.85, 22, 40).rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const base = new THREE.Color('#d9a520');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const Hh = 0.15 + 0.09 * smooth01(-0.25, 0.1, z) - 0.06 * smooth01(0.62, 0.86, z) + 0.07 * Math.exp(-(((z + 0.78) / 0.07) ** 2));
    const Wd = 0.19 + 0.05 * smooth01(-0.25, 0.1, z);
    const t = Math.abs(x) / Wd;
    const fall = t < 0.55 ? 1 : t > 1.75 ? 0 : 0.5 + 0.5 * Math.cos((Math.PI * (t - 0.55)) / 1.2);
    const endFall = smooth01(0.925, 0.86, Math.abs(z)) ;
    let y = Math.max(0.012, Hh * fall * (0.35 + 0.65 * endFall));
    const edge = Math.abs(x) > 0.47 || Math.abs(z) > 0.92;
    y += (rnd() - 0.5) * (y > 0.03 ? 0.014 : 0.006);
    pos.setXYZ(i, x + (edge ? 0 : (rnd() - 0.5) * 0.008), y, z + (edge ? 0 : (rnd() - 0.5) * 0.008));
    const k = 0.82 + rnd() * 0.32;
    col[i * 3] = base.r * k; col[i * 3 + 1] = base.g * k; col[i * 3 + 2] = base.b * (0.8 + rnd() * 0.4);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const g = new THREE.Group();
  const m = mesh(geo, P.foil);
  m.receiveShadow = true;
  g.add(m);
  return g;
}

/** Orange vacuum mattress (~2.0 x 0.75 m) with raised sides and yellow straps; origin bottom centre, along z. */
export function makeVacuumMattress() {
  const P = propMaterials();
  const shell = mergeGeo([
    new RoundedBoxGeometry(0.75, 0.08, 2.0, 2, 0.035).translate(0, 0.04, 0),
    new THREE.CapsuleGeometry(0.085, 1.72, 3, 10).rotateX(Math.PI / 2).translate(0.29, 0.1, 0),
    new THREE.CapsuleGeometry(0.085, 1.72, 3, 10).rotateX(Math.PI / 2).translate(-0.29, 0.1, 0),
    new THREE.CapsuleGeometry(0.08, 0.42, 3, 10).rotateZ(Math.PI / 2).translate(0, 0.1, 0.9),
    new THREE.CapsuleGeometry(0.06, 0.4, 3, 8).rotateZ(Math.PI / 2).translate(0, 0.085, -0.93),
  ]);
  const straps = [], dark = [];
  for (const z of [0.6, 0.15, -0.35, -0.78]) {
    straps.push(new THREE.TorusGeometry(0.34, 0.012, 3, 14, Math.PI).scale(1, 0.72, 3.6).translate(0, 0.09, z));
    dark.push(new THREE.BoxGeometry(0.07, 0.04, 0.05).translate(0.12, 0.09 + 0.34 * 0.72 * Math.sin(Math.acos(0.12 / 0.34)), z));
  }
  for (const s of [-1, 1]) for (const z of [-0.65, 0, 0.65]) dark.push(new THREE.BoxGeometry(0.03, 0.04, 0.16).translate(s * 0.385, 0.06, z));
  dark.push(new THREE.CylinderGeometry(0.025, 0.025, 0.06, 8).rotateZ(Math.PI / 2).translate(0.39, 0.1, -0.85));
  const g = new THREE.Group();
  const body = mesh(shell, P.mattress);
  body.receiveShadow = true;
  g.add(body, mesh(mergeGeo(straps), P.strap), mesh(mergeGeo(dark), P.dark, false));
  return g;
}

export function makeChair() {
  const g = new THREE.Group();
  const dark = mat('#2a2f3d'), red = mat('#e63946'), steel = mat('#3a4152');
  const hanger = mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.6, 4), steel);
  hanger.position.set(0, 1.55, -0.2);
  const seat = mesh(new THREE.BoxGeometry(1.8, 0.1, 0.7), dark);
  seat.position.set(0, 0.22, 0.05);
  const back = mesh(new THREE.BoxGeometry(1.8, 0.7, 0.08), red);
  back.position.set(0, 0.6, -0.3);
  const bar = mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.8, 4).rotateZ(Math.PI / 2), steel);
  bar.position.set(0, 0.85, 0.55);
  g.add(hanger, seat, back, bar);
  return g;
}

export function makeCharge() {
  const g = new THREE.Group();
  const stickGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.34, 6);
  const red = mat('#d62f2f');
  for (let i = 0; i < 3; i++) {
    const s = mesh(stickGeo, red);
    s.position.set((i - 1) * 0.12, 0, 0);
    g.add(s);
  }
  const tape = mesh(new THREE.BoxGeometry(0.4, 0.06, 0.14), mat('#22242c'));
  g.add(tape);
  const spark = new THREE.Mesh(new THREE.IcosahedronGeometry(0.07, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 2.6, 0.8) }));
  spark.position.y = 0.26;
  g.add(spark);
  return { root: g, spark };
}

// Character portrait rendered to a data URL (for lobby lift passes). `build` returns an object with root + animate().
let portraitRenderer = null;
export function renderPortrait(build, size = 160) {
  try {
    if (!portraitRenderer) {
      portraitRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
      portraitRenderer.outputColorSpace = THREE.SRGBColorSpace;
      portraitRenderer.toneMapping = THREE.ACESFilmicToneMapping;
    }
    portraitRenderer.setSize(size, size, false);
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight('#ffffff', '#b8c8e0', 1.8));
    const d = new THREE.DirectionalLight('#fff4e2', 2.6);
    d.position.set(2, 3, 4);
    scene.add(d);
    const ch = build();
    ch.animate(0.5, { lean: 0, noSkis: true, noPoles: true, wave: true });
    ch.root.rotation.y = 0.35;
    scene.add(ch.root);
    const head = ch.boneWorld ? ch.boneWorld('Head') : new THREE.Vector3(0, 1.6, 0);
    const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
    cam.position.set(0.3, head.y + 0.25, 2.3);
    cam.lookAt(0, head.y + 0.05, 0);
    portraitRenderer.render(scene, cam);
    return portraitRenderer.domElement.toDataURL('image/png');
  } catch (e) {
    console.warn('portrait failed', e);
    return '';
  }
}
