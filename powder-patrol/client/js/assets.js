// Loads the CC0 model packs (see client/assets/CREDITS.md) and offers helpers for instancing and snow-covering them.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

const BASE = 'assets/';
export const PLAYER_CHARS = ['sam', 'lis', 'matt', 'shaun'];
export const TOURISTS = ['casual_male', 'casual_female', 'casual2_male', 'casual2_female', 'casual3_male', 'casual3_female',
  'worker_male', 'doctor_male_young', 'chef_male', 'cowboy_male', 'suit_male', 'oldclassy_male'];

/** Adds a world-up snow layer to any standard material (used for trees, rocks, roofs, vehicles). */
export function addSnowCover(material, { amount = 1, lo = 0.35, hi = 0.75 } = {}) {
  if (material.userData.snowy) return material;
  material.userData.snowy = true;
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, r) => {
    prev?.(shader, r);
    shader.uniforms.uSnow = { value: amount };
    shader.uniforms.uSnowLo = { value: lo };
    shader.uniforms.uSnowHi = { value: hi };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uSnow, uSnowLo, uSnowHi;')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        vec3 snowWN = normalize((vec4(normal, 0.0) * viewMatrix).xyz);
        float snowAmt = smoothstep(uSnowLo, uSnowHi, snowWN.y) * uSnow;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.92, 0.95, 1.0), snowAmt);
        roughnessFactor = mix(roughnessFactor, 0.75, snowAmt);
      `);
  };
  material.customProgramCacheKey = () => 'snow' + amount + lo + hi;
  material.needsUpdate = true;
  return material;
}

export class Assets {
  constructor() {
    this.loader = new GLTFLoader();
    this.nature = new Map();
    this.village = new Map();
    this.chars = {};
    this.tourists = {};
    this.vehicles = {};
    this.tex = {};
  }

  async load(onProgress = () => {}) {
    const jobs = [];
    const add = (p) => { jobs.push(p); return p; };
    let done = 0;
    const step = (p) => p.then((v) => { done++; onProgress(done / jobs.length); return v; });
    const glb = (name) => step(add(this.loader.loadAsync(BASE + name)));
    const texLoader = new THREE.TextureLoader();
    const tex = (name, srgb) => step(add(texLoader.loadAsync(BASE + name).then((t) => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = 8;
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      return t;
    })));

    const pNature = glb('nature.glb');
    const pVillage = glb('village.glb');
    const pChars = PLAYER_CHARS.map((n) => glb(`char_${n}.glb`));
    const pTour = TOURISTS.map((n) => glb(`tourist_${n}.glb`));
    const pDog = glb('dog.glb');
    const pVeh = ['pickup', 'truck'].map((n) => glb(`vehicle_${n}.glb`));
    const pTex = [tex('snow_color.webp', true), tex('snow_normal.webp'), tex('rock_color.webp', true), tex('rock_normal.webp')];

    const nature = await pNature;
    for (const child of nature.scene.children) this.nature.set(child.name, child);
    const village = await pVillage;
    for (const child of village.scene.children) this.village.set(child.name, child);
    const chars = await Promise.all(pChars);
    PLAYER_CHARS.forEach((n, i) => { this.chars[n] = chars[i].scene; });
    this.charClips = chars[PLAYER_CHARS.indexOf('lis')].animations;
    const tours = await Promise.all(pTour);
    TOURISTS.forEach((n, i) => { this.tourists[n] = tours[i].scene; });
    this.touristClips = tours[0].animations;
    const dog = await pDog;
    this.dog = dog.scene;
    this.dogClips = dog.animations;
    const veh = await Promise.all(pVeh);
    this.vehicles.pickup = veh[0].scene;
    this.vehicles.truck = veh[1].scene;
    const [snowColor, snowNormal, rockColor, rockNormal] = await Promise.all(pTex);
    Object.assign(this.tex, { snowColor, snowNormal, rockColor, rockNormal });

    // snow on everything that lives outdoors
    for (const lib of [this.nature, this.village]) {
      for (const obj of lib.values()) {
        obj.traverse((m) => {
          if (!m.isMesh) return;
          const name = m.material.name || '';
          const amount = name.includes('Leaves') ? 0.85 : name.includes('Rock') || name.includes('Bark') ? 0.9 : name.includes('Tiles') || name.includes('Wood') ? 0.8 : 0.5;
          addSnowCover(m.material, { amount, lo: name.includes('Leaves') ? 0.15 : 0.4, hi: name.includes('Leaves') ? 0.6 : 0.8 });
          if (name === 'Rocks') m.material.color.set('#9aa1ad');
        });
      }
    }
    for (const v of Object.values(this.vehicles)) v.traverse((m) => { if (m.isMesh) addSnowCover(m.material, { amount: 0.6, lo: 0.75, hi: 0.95 }); });
    return this;
  }

  /** Flattens a template into [{geometry, material, matrix}] relative to the template root. */
  parts(template) {
    if (template.userData.parts) return template.userData.parts;
    const out = [];
    template.updateWorldMatrix(true, true);
    const inv = new THREE.Matrix4().copy(template.matrixWorld).invert();
    template.traverse((m) => {
      if (!m.isMesh) return;
      out.push({ geometry: m.geometry, material: m.material, matrix: new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld) });
    });
    template.userData.parts = out;
    return out;
  }

  /** Builds InstancedMeshes for a template placed at many transforms (array of Matrix4). */
  instanced(template, matrices, { castShadow = true, receiveShadow = true } = {}) {
    const group = new THREE.Group();
    if (!matrices.length) return group;
    const tmp = new THREE.Matrix4();
    for (const part of this.parts(template)) {
      const im = new THREE.InstancedMesh(part.geometry, part.material, matrices.length);
      matrices.forEach((mtx, i) => im.setMatrixAt(i, tmp.multiplyMatrices(mtx, part.matrix)));
      im.castShadow = castShadow;
      im.receiveShadow = receiveShadow;
      im.computeBoundingSphere();
      group.add(im);
    }
    return group;
  }

  cloneChar(name) { return cloneSkinned(this.chars[name] || this.chars.sam); }
  cloneTourist(name) { return cloneSkinned(this.tourists[name] || this.tourists.casual_male); }
  cloneDog() { return cloneSkinned(this.dog); }
  cloneVehicle(name) {
    const v = this.vehicles[name].clone(true);
    v.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    return v;
  }
}
