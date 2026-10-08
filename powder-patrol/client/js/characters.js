// Animated characters built from the CC0 rigged models (Quaternius). Same pose interface as the old procedural skier.
import * as THREE from 'three';
import { makePatchMaterial } from './models.js';

const SKIN_TONES = ['#f1c7a5', '#e0a98a', '#c78c68', '#9a6748', '#f6d7c0'];
const NEON = ['#ff4fa3', '#38e1d4', '#ffe14d', '#7d3cff', '#ff8a00', '#46e06a', '#00b3ff', '#ffffff', '#e63946'];
const PANTS = ['#2b3550', '#1c1c24', '#3a4152', '#ff4fa3', '#38e1d4', '#7d3cff'];
const HAIR = ['#2b1d14', '#6b4423', '#c9a15b', '#1c1c1c', '#a33b1f', '#d9d4c8'];

const skiMat = new THREE.MeshStandardMaterial({ color: '#ffd23f', roughness: 0.35, metalness: 0.1 });
const skiMatTourist = [new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.35 }), new THREE.MeshStandardMaterial({ color: '#ff4fa3', roughness: 0.35 }), new THREE.MeshStandardMaterial({ color: '#38e1d4', roughness: 0.35 })];
const poleMat = new THREE.MeshStandardMaterial({ color: '#c9ced8', metalness: 0.7, roughness: 0.3 });
const darkMat = new THREE.MeshStandardMaterial({ color: '#22242c', roughness: 0.6 });

function makeSki(material) {
  const g = new THREE.Group();
  const shape = new THREE.Shape();
  shape.moveTo(-0.05, -0.8); shape.lineTo(0.05, -0.8); shape.lineTo(0.055, 0.7); shape.quadraticCurveTo(0.055, 0.86, 0, 0.88); shape.quadraticCurveTo(-0.055, 0.86, -0.055, 0.7); shape.closePath();
  const plank = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.025, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 1 }).rotateX(Math.PI / 2), material);
  plank.castShadow = true;
  const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.03, 12, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateY(Math.PI / 2), material);
  tip.position.set(0, 0.04, 0.86);
  tip.scale.set(1, 1.4, 1);
  const binding = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.22), darkMat);
  binding.position.set(0, 0.03, 0);
  g.add(plank, tip, binding);
  return g;
}
function makePole() {
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.15, 8).translate(0, -0.5, 0), poleMat);
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.02, 0.16, 8).translate(0, 0.0, 0), darkMat);
  const basket = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.012, 12), darkMat);
  basket.position.y = -0.98;
  g.add(shaft, grip, basket);
  return g;
}
function makeShovel() {
  const g = new THREE.Group();
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.75, 8).translate(0, -0.3, 0), poleMat);
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.3, 0.03), new THREE.MeshStandardMaterial({ color: '#ff6b3d', roughness: 0.4, metalness: 0.2 }));
  blade.position.y = -0.78;
  g.add(handle, blade);
  return g;
}
// reflective strip (retro-reflective look: bright, slightly emissive)
const reflectMat = new THREE.MeshStandardMaterial({ color: '#e6ebf0', roughness: 0.2, metalness: 0.5, emissive: '#5a6068', emissiveIntensity: 0.35 });
const patchGeo = new THREE.CircleGeometry(0.1, 24);
function makeBackpack(color) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.42, 0.16, 2, 2, 1), new THREE.MeshStandardMaterial({ color, roughness: 0.6 }));
  body.castShadow = true;
  // Pistenrettung emblem patch on the back (faces -z, away from the wearer)
  const patch = new THREE.Mesh(patchGeo, makePatchMaterial());
  patch.position.set(0, 0.035, -0.0815);
  patch.rotation.y = Math.PI;
  const strip = new THREE.Mesh(new THREE.BoxGeometry(0.362, 0.028, 0.006), reflectMat);
  strip.position.set(0, -0.135, -0.081);
  const lid = new THREE.Mesh(new THREE.BoxGeometry(0.37, 0.08, 0.17), darkMat);
  lid.position.y = 0.2;
  g.add(body, patch, strip, lid);
  return g;
}

export class Character {
  /**
   * @param assets  Assets instance
   * @param opts    { kind: 'player'|'tourist', model, color, look }
   */
  constructor(assets, { kind = 'player', model = 'sam', color = '#e63946', look = 0 } = {}) {
    this.kind = kind;
    this.root = new THREE.Group();
    this.lean = new THREE.Group();
    this.root.add(this.lean);
    const tourist = kind === 'tourist';
    this.body = tourist ? assets.cloneTourist(model) : assets.cloneChar(model);
    const scale = tourist ? 0.9 : 1.36;
    this.body.scale.setScalar(scale);
    this.lean.add(this.body);
    this.bones = {};
    this.body.traverse((o) => {
      if (o.isBone) this.bones[o.name] = o;
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        o.frustumCulled = false;
      }
    });
    if (tourist) this.recolor(look);
    this.mixer = new THREE.AnimationMixer(this.body);
    this.clips = tourist ? assets.touristClips : assets.charClips;
    this.actions = new Map();
    this.weights = new Map();
    this.state = '';
    this.body.updateMatrixWorld(true);
    this.attachProps(tourist ? skiMatTourist[look % 3] : skiMat, color);
    this.phase = Math.random() * 10;
  }

  recolor(look) {
    const pick = (arr, k) => arr[(look >> k) % arr.length];
    this.body.traverse((o) => {
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      const out = mats.map((m) => {
        const c = m.clone();
        const n = m.name || '';
        if (n === 'Skin') c.color.set(pick(SKIN_TONES, 0));
        else if (n === 'Shirt' || n === 'Jacket' || n === 'Top') c.color.set(pick(NEON, 1));
        else if (n === 'Pants') c.color.set(pick(PANTS, 3));
        else if (n === 'Hair') c.color.set(pick(HAIR, 4));
        c.roughness = 0.65;
        return c;
      });
      o.material = Array.isArray(o.material) ? out : out[0];
    });
  }

  // Attach a prop to a bone so that, in the bind pose, it has the given model-space transform.
  attach(boneName, prop, pos, quat = new THREE.Quaternion()) {
    const bone = this.bones[boneName];
    if (!bone) return null;
    const rootInv = new THREE.Matrix4().copy(this.root.matrixWorld).invert();
    const boneM = new THREE.Matrix4().multiplyMatrices(rootInv, bone.matrixWorld);
    const desired = new THREE.Matrix4().compose(pos, quat, new THREE.Vector3(1, 1, 1));
    const local = new THREE.Matrix4().multiplyMatrices(boneM.invert(), desired);
    local.decompose(prop.position, prop.quaternion, prop.scale);
    bone.add(prop);
    return prop;
  }

  boneWorld(name) {
    const b = this.bones[name];
    if (!b) return new THREE.Vector3();
    this.root.updateMatrixWorld(true);
    return new THREE.Vector3().setFromMatrixPosition(b.matrixWorld).applyMatrix4(new THREE.Matrix4().copy(this.root.matrixWorld).invert());
  }

  attachProps(skiMaterial, color) {
    this.root.updateMatrixWorld(true);
    // skis flat under the feet, pointing forward (+z)
    this.skis = [];
    for (const side of ['L', 'R']) {
      const f = this.boneWorld('Foot' + side);
      const ski = makeSki(skiMaterial);
      this.attach('Foot' + side, ski, new THREE.Vector3(f.x, 0.02, f.z + 0.08));
      this.skis.push(ski);
    }
    // poles in the hands, pointing along the arm in bind pose (so they hang down when arms relax)
    this.poles = [];
    for (const side of ['L', 'R']) {
      const handName = this.bones['Middle1' + side] ? 'Middle1' + side : 'Fist' + side;
      const hand = this.boneWorld(handName);
      const elbow = this.boneWorld('LowerArm' + side);
      // bias the pole downwards so it hangs naturally once the arms relax from the bind pose
      const dir = hand.clone().sub(elbow).normalize().add(new THREE.Vector3(0, -0.9, 0.15)).normalize();
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
      const pole = makePole();
      this.attach(this.bones[handName] ? handName : 'LowerArm' + side, pole, hand, q);
      this.poles.push(pole);
    }
    // shovel in the right hand (only visible while digging)
    {
      const handName = this.bones.Middle1R ? 'Middle1R' : 'FistR';
      const hand = this.boneWorld(handName);
      const elbow = this.boneWorld('LowerArmR');
      const dir = hand.clone().sub(elbow).normalize();
      this.shovel = makeShovel();
      this.attach(handName, this.shovel, hand, new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir));
      this.shovel.visible = false;
    }
    if (this.kind === 'player') {
      const t = this.boneWorld('Torso');
      const pack = makeBackpack(color);
      this.attach('Torso', pack, new THREE.Vector3(t.x, t.y + 0.05, t.z - 0.32));
      this.backpack = pack;
    }
  }

  action(name, once = false) {
    if (this.actions.has(name)) return this.actions.get(name);
    const clip = this.clips.find((c) => c.name === name);
    if (!clip) return null;
    const a = this.mixer.clipAction(clip);
    if (once) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
    a.enabled = true;
    a.setEffectiveWeight(0);
    a.play();
    this.actions.set(name, a);
    this.weights.set(name, 0);
    return a;
  }

  /** pose: { speed, lean, tuck, plough, air, crash, sit, drive, dig, wave, skate, lie, noPoles, noSkis, hit } */
  animate(dt, pose) {
    const P = this.kind === 'player';
    const targets = {};
    let state;
    if (pose.crash) state = 'crash';
    else if (pose.lie) state = 'lie';
    else if (pose.dig) state = 'dig';
    else if (pose.drive || pose.sit) state = 'sit';
    else if (pose.air) state = 'air';
    else if (pose.wave) state = 'wave';
    else if (pose.skate) state = 'skate';
    else state = 'ski';
    if (P) {
      switch (state) {
        case 'crash': case 'lie': targets.Death = 1; break;
        case 'dig': targets.Stab = 1; break;
        case 'sit': targets.Duck = 1; break;
        case 'air': targets.Jump_Idle = 1; break;
        case 'wave': targets.Wave = 1; break;
        case 'skate': targets.Run = 1; break;
        default: {
          const t = Math.max(pose.tuck || 0, pose.plough ? 0.3 : 0);
          targets.Duck = 0.45 + t * 0.55;
          targets.Idle = 1 - targets.Duck;
        }
      }
    } else {
      switch (state) {
        case 'crash': case 'lie': targets.Death = 1; break;
        case 'sit': targets.SitDown = 1; break;
        case 'air': targets.Jump = 1; break;
        case 'wave': targets.Victory = 1; break;
        case 'skate': targets.Walk = 1; break;
        case 'dig': targets.PickUp = 1; break;
        default: targets.Idle = 1;
      }
    }
    if (state !== this.state) {
      // restart one-shot clips when entering their state
      for (const n of ['Death', 'SitDown', 'Jump']) {
        if (targets[n]) { const a = this.action(n, true); a.reset(); a.play(); }
      }
      this.state = state;
    }
    for (const name of Object.keys(targets)) this.action(name, ['Death', 'SitDown', 'Jump'].includes(name));
    const k = Math.min(1, dt * 9);
    for (const [name, a] of this.actions) {
      const w = this.weights.get(name) + ((targets[name] || 0) - this.weights.get(name)) * k;
      this.weights.set(name, w);
      a.setEffectiveWeight(w);
    }
    this.mixer.update(dt);

    // procedural layers on top of the clips
    const lean = THREE.MathUtils.clamp(pose.lean || 0, -1, 1);
    this.lean.rotation.z = THREE.MathUtils.lerp(this.lean.rotation.z, state === 'ski' ? lean * 0.42 : 0, Math.min(1, dt * 8));
    const tuck = state === 'ski' ? pose.tuck || 0 : 0;
    if (this.bones.Torso) this.bones.Torso.rotation.x += tuck * 0.5;
    if (state === 'sit' && pose.drive) {
      for (const s of ['L', 'R']) {
        const ua = this.bones['UpperArm' + s];
        if (ua) ua.rotation.x -= 0.9;
      }
    }
    if (state === 'crash') {
      this.phase += dt * 8;
      this.lean.rotation.x = Math.sin(this.phase) * 0.25;
    } else this.lean.rotation.x = THREE.MathUtils.lerp(this.lean.rotation.x, 0, Math.min(1, dt * 8));
    // plough: toes in
    for (let i = 0; i < 2; i++) {
      const ski = this.skis[i];
      ski.visible = !pose.noSkis && !pose.drive;
      ski.rotation.y = THREE.MathUtils.lerp(ski.rotation.y, (pose.plough || 0) * (i === 0 ? -0.3 : 0.3), Math.min(1, dt * 8));
    }
    const polesOn = !pose.noPoles && !pose.dig && !pose.drive && state !== 'wave' && state !== 'crash' && state !== 'lie';
    for (const p of this.poles) p.visible = polesOn;
    this.shovel.visible = state === 'dig';
    this.root.updateMatrixWorld(true);
  }
}
