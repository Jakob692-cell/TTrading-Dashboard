// Procedural low-poly models: patrollers, tourists, toboggans, helicopter, charges.
import * as THREE from 'three';

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
    // white patrol cross on the back + little backpack
    const pack = mesh(new THREE.BoxGeometry(0.34, 0.38, 0.14), mat('#b51f2c'));
    pack.position.set(0, 0.36, -0.28);
    const cv = mesh(new THREE.BoxGeometry(0.06, 0.2, 0.02), mat('#ffffff'));
    cv.position.set(0, 0.38, -0.36);
    const ch = mesh(new THREE.BoxGeometry(0.2, 0.06, 0.02), mat('#ffffff'));
    ch.position.set(0, 0.38, -0.36);
    hips.add(pack, cv, ch);
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

export function makeToboggan() {
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  const shell = mat('#ff5a2c');
  const tub = withOutline(mesh(new THREE.BoxGeometry(0.78, 0.28, 2.1), shell), 1.04);
  tub.position.y = 0.2;
  const inner = mesh(new THREE.BoxGeometry(0.62, 0.05, 1.9), mat('#3a2a26'));
  inner.position.y = 0.33;
  const nose = mesh(new THREE.CylinderGeometry(0.39, 0.39, 0.78, 8, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateX(Math.PI / 2), shell);
  nose.position.set(0, 0.2, 1.05);
  nose.scale.set(1, 0.7, 0.6);
  const crossV = mesh(new THREE.BoxGeometry(0.02, 0.18, 0.06), mat('#ffffff'));
  crossV.position.set(0.4, 0.22, 0);
  const crossH = mesh(new THREE.BoxGeometry(0.02, 0.06, 0.18), mat('#ffffff'));
  crossH.position.set(0.4, 0.22, 0);
  const crossV2 = crossV.clone(); crossV2.position.x = -0.4;
  const crossH2 = crossH.clone(); crossH2.position.x = -0.4;
  const handleMat = mat('#c9ced8', { metalness: 0.6, roughness: 0.3 });
  const hl = mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.4, 4).rotateX(Math.PI / 2), handleMat);
  hl.position.set(0.3, 0.45, 1.6);
  hl.rotation.y = -0.12;
  const hr = hl.clone(); hr.position.x = -0.3; hr.rotation.y = 0.12;
  body.add(tub, inner, nose, crossV, crossH, crossV2, crossH2, hl, hr);
  const seat = new THREE.Group();
  seat.position.set(0, 0.36, -0.1);
  body.add(seat);
  return { root: g, body, seat };
}

export function makeHelicopter() {
  const g = new THREE.Group();
  const red = mat('#e63946');
  const white = mat('#f6f9fd');
  const cabin = withOutline(mesh(new THREE.SphereGeometry(1.4, 10, 7), red), 1.03);
  cabin.scale.set(1, 0.9, 1.5);
  cabin.position.y = 1.5;
  const glass = mesh(new THREE.SphereGeometry(1.1, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat('#9fd4ff', { roughness: 0.1, metalness: 0.3 }));
  glass.rotation.x = Math.PI / 2.4;
  glass.position.set(0, 1.75, 1.2);
  glass.scale.set(1, 1, 0.8);
  const boom = mesh(new THREE.CylinderGeometry(0.18, 0.32, 4.2, 6).rotateX(Math.PI / 2), white);
  boom.position.set(0, 1.9, -3.4);
  const fin = mesh(new THREE.BoxGeometry(0.1, 1.2, 0.8), red);
  fin.position.set(0, 2.4, -5.3);
  const tailRotor = mesh(new THREE.BoxGeometry(0.05, 1.3, 0.12), mat('#22242c'));
  tailRotor.position.set(0.18, 2.4, -5.3);
  const mast = mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.5, 5), mat('#22242c'));
  mast.position.y = 2.9;
  const rotor = new THREE.Group();
  rotor.position.y = 3.15;
  const blade = mesh(new THREE.BoxGeometry(9, 0.05, 0.3), mat('#22242c'));
  const blade2 = blade.clone(); blade2.rotation.y = Math.PI / 2;
  rotor.add(blade, blade2);
  const skidMat = mat('#9aa3b2', { metalness: 0.6, roughness: 0.3 });
  const skidL = mesh(new THREE.CylinderGeometry(0.06, 0.06, 3.4, 4).rotateX(Math.PI / 2), skidMat);
  skidL.position.set(0.9, 0.1, 0.2);
  const skidR = skidL.clone(); skidR.position.x = -0.9;
  const crossV = mesh(new THREE.BoxGeometry(0.02, 0.6, 0.2), white);
  crossV.position.set(1.42, 1.5, 0);
  const crossH = mesh(new THREE.BoxGeometry(0.02, 0.2, 0.6), white);
  crossH.position.set(1.42, 1.5, 0);
  const cv2 = crossV.clone(); cv2.position.x = -1.42;
  const ch2 = crossH.clone(); ch2.position.x = -1.42;
  const rope = mesh(new THREE.CylinderGeometry(0.02, 0.02, 1, 3).translate(0, -0.5, 0), mat('#ffd23f'), false);
  rope.position.y = 0.4;
  rope.visible = false;
  g.add(cabin, glass, boom, fin, tailRotor, mast, rotor, skidL, skidR, crossV, crossH, cv2, ch2, rope);
  return { root: g, rotor, tailRotor, rope };
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
