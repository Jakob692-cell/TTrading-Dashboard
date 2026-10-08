// Builds the visual mountain: textured smooth terrain, CC0 model forests, chalets built from modular kit pieces,
// lift, markers and a surrounding mountain range.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { WORLD, distToPolyline } from '/shared/mountain.js';
import { mulberry32, hashString, makeNoise2D } from '/shared/rng.js';
import { DANGER_DE } from '/shared/constants.js';
import { mat, drawEmblem, makeEmblemTexture, makeToboggan, makeWindsock, afterFonts, BRAND } from './models.js';

const SIGN_FONT = '"Lilita One", "Arial Black", sans-serif';
// avalanche danger level colours (European scale) and our bulletin hint lines
const DANGER_COLORS = ['#cccccc', '#9bd54a', '#ffe14a', '#ff9a2e', '#ff3b30', '#b0002a'];
const DANGER_HINTS = ['', 'Allgemein sichere Verhältnisse', 'Steilhänge vorsichtig befahren', 'Steilhänge über 30° meiden',
  'Nur mäßig steiles Gelände, Auslauf beachten', 'Verzicht auf Skitouren'];

const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3(), tmpP = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

function vcolor(geo, color) {
  geo = geo.index ? geo.toNonIndexed() : geo;
  const c = new THREE.Color(color);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  if (geo.attributes.uv) geo.deleteAttribute('uv');
  return geo;
}
const vmat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.85 });

// Cheap far-LOD pine (a few cones) matching the silhouette of the CC0 pines.
function farPineGeometry() {
  const parts = [vcolor(new THREE.CylinderGeometry(0.2, 0.3, 1.6, 5).translate(0, 0.8, 0), '#5b3a29')];
  for (const [r, h, y] of [[2.2, 3.2, 2.6], [1.7, 2.8, 4.2], [1.1, 2.4, 5.7]]) {
    parts.push(vcolor(new THREE.ConeGeometry(r, h, 7).translate(0, y, 0), '#3d6b42'));
    parts.push(vcolor(new THREE.ConeGeometry(r * 0.7, h * 0.4, 7).translate(0, y + h * 0.28, 0), '#eef3f9'));
  }
  return mergeGeometries(parts);
}

/** Terrain material: tiled snow with normal map, triplanar rock on steep slopes, groomed corduroy, sparkles. */
function makeTerrainMaterial(tex, { pistes = true } = {}) {
  const m = new THREE.MeshStandardMaterial({
    map: tex.snowColor, normalMap: tex.snowNormal, normalScale: new THREE.Vector2(0.55, 0.55),
    roughness: 0.78, metalness: 0, color: '#ffffff',
  });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.tRock = { value: tex.rockColor };
    shader.uniforms.uSparkle = { value: 1 };
    m.userData.shader = shader;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aPiste;\nattribute float aAO;\nvarying float vPiste;\nvarying float vAO;\nvarying vec3 vWorldP;\nvarying vec3 vWorldN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPiste = aPiste;\nvAO = aAO;\nvWorldP = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvWorldN = normalize(mat3(modelMatrix) * objectNormal);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D tRock;
        uniform float uSparkle;
        varying float vPiste;
        varying float vAO;
        varying vec3 vWorldP;
        varying vec3 vWorldN;
        float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
        vec3 triRock(vec3 p, vec3 n) {
          vec3 w = pow(abs(n), vec3(4.0)); w /= (w.x + w.y + w.z);
          return texture2D(tRock, p.zy * 0.11).rgb * w.x + texture2D(tRock, p.xz * 0.11).rgb * w.y + texture2D(tRock, p.xy * 0.11).rgb * w.z;
        }
      `)
      .replace('#include <map_fragment>', `#include <map_fragment>
        float slope = 1.0 - clamp(vWorldN.y, 0.0, 1.0);
        float nz = vnoise(vWorldP.xz * 0.07) * 0.6 + vnoise(vWorldP.xz * 0.31) * 0.4;
        float rockAmt = smoothstep(0.30, 0.42, slope + (nz - 0.5) * 0.16);
        // soft drifts: slightly bluer snow in hollows, warmer on crests
        diffuseColor.rgb *= mix(vec3(0.90, 0.94, 1.02), vec3(1.03, 1.02, 1.0), nz);
        float isPiste = step(0.5, vPiste) * (1.0 - step(1.5, vPiste));
        float isRoad = step(1.5, vPiste);
        float cord = 0.5 + 0.5 * sin(vWorldP.x * 5.0 + sin(vWorldP.z * 0.05) * 3.0);
        diffuseColor.rgb *= 1.0 - isPiste * cord * 0.05;
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.86, 0.86, 0.88), isRoad * (0.6 + 0.4 * step(0.5, fract(vWorldP.x * 0.6))));
        vec3 rockC = triRock(vWorldP, vWorldN) * vec3(1.05, 1.02, 1.0);
        diffuseColor.rgb = mix(diffuseColor.rgb, rockC, rockAmt);
        diffuseColor.rgb *= vAO;
      `)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.92, rockAmt);
        roughnessFactor = mix(roughnessFactor, 0.6, isPiste * 0.5);
      `)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        vec3 cellP = floor(vWorldP * 6.0);
        float hh = fract(sin(dot(cellP, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
        float tw = fract(sin(dot(cellP + floor(cameraPosition * 0.8), vec3(39.3468, 11.1351, 83.155))) * 24634.6345);
        float camDist = length(vWorldP - cameraPosition);
        float sparkle = step(0.9972, hh) * step(0.55, tw) * smoothstep(45.0, 5.0, camDist) * uSparkle * (1.0 - rockAmt);
        totalEmissiveRadiance += vec3(sparkle * 2.5);
      `);
  };
  m.customProgramCacheKey = () => 'terrain' + pistes;
  return m;
}

export class World {
  constructor(renderer, mountain, assets) {
    this.r = renderer;
    this.m = mountain;
    this.a = assets;
    this.group = new THREE.Group();
    this.animated = [];
    this.cornices = [];
    this.smokeSources = [];
    this.lodTimer = 0;
    this.batch = [];
    this.terrainMat = makeTerrainMaterial(assets.tex);
    this.buildTerrain();
    this.buildForest();
    this.buildKickers();
    this.buildLift();
    this.buildBuildings();
    this.buildMarkers();
    this.buildBackdrop();
    this.setBulletin(1);
    renderer.scene.add(this.group);
  }

  // ------------------------------------------------------------------ terrain (smooth, textured)
  buildTerrain() {
    const m = this.m;
    const { nx, nz, cell, heights } = m;
    const pos = new Float32Array(nx * nz * 3);
    const uv = new Float32Array(nx * nz * 2);
    const piste = new Float32Array(nx * nz);
    const ao = new Float32Array(nx * nz).fill(1);
    const near = [];
    for (let iz = 0; iz < nz; iz++) {
      for (let ix = 0; ix < nx; ix++) {
        const i = iz * nx + ix;
        const x = WORLD.minX + ix * cell, z = WORLD.minZ + iz * cell;
        pos[i * 3] = x; pos[i * 3 + 1] = heights[i]; pos[i * 3 + 2] = z;
        uv[i * 2] = x / 7; uv[i * 2 + 1] = z / 7;
        piste[i] = m.pisteGrid[i] > 0 ? 1 : 0;
        m.collidersNear(x, z, near);
        let a = 1;
        for (const o of near) {
          if (o.kind !== 'tree') continue;
          const d = Math.hypot(o.x - x, o.z - z);
          if (d < 5) a = Math.min(a, 0.78 + 0.22 * (d / 5));
        }
        ao[i] = a;
      }
    }
    const idx = new Uint32Array((nx - 1) * (nz - 1) * 6);
    let k = 0;
    for (let iz = 0; iz < nz - 1; iz++) {
      for (let ix = 0; ix < nx - 1; ix++) {
        const a = iz * nx + ix, b = a + 1, c = a + nx, d = c + 1;
        // same diagonal split as mountain.terrainAt
        idx[k++] = a; idx[k++] = d; idx[k++] = b;
        idx[k++] = a; idx[k++] = c; idx[k++] = d;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setAttribute('aPiste', new THREE.BufferAttribute(piste, 1));
    geo.setAttribute('aAO', new THREE.BufferAttribute(ao, 1));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    const terrain = new THREE.Mesh(geo, this.terrainMat);
    terrain.receiveShadow = true;
    this.terrain = terrain;
    this.group.add(terrain);
  }

  // ------------------------------------------------------------------ forest with distance LOD
  buildForest() {
    const m = this.m, A = this.a;
    const pines = ['Pine_1', 'Pine_2', 'Pine_3', 'Pine_4', 'Pine_5'];
    this.forest = [];
    const r = mulberry32(hashString('forest' + m.seed));
    const byKind = new Map();
    for (const t of m.trees) {
      const kind = t.type === 1 ? `DeadTree_${1 + Math.floor(r() * 3)}` : pines[Math.floor(r() * pines.length)];
      if (!byKind.has(kind)) byKind.set(kind, []);
      const s = t.s * (kind.startsWith('Dead') ? 0.55 : 0.95);
      tmpQ.setFromAxisAngle(UP, t.rot);
      tmpS.set(s, s * (0.9 + (t.rot % 0.3)), s);
      tmpP.set(t.x, t.y - 0.25, t.z);
      byKind.get(kind).push({ x: t.x, z: t.z, matrix: new THREE.Matrix4().compose(tmpP, tmpQ, tmpS) });
    }
    const farGeo = farPineGeometry();
    for (const [kind, list] of byKind) {
      const template = A.nature.get(kind);
      if (!template) continue;
      const near = A.instanced(template, list.map((t) => t.matrix));
      for (const im of near.children) { im.userData.base = []; }
      this.group.add(near);
      let far = null;
      if (!kind.startsWith('Dead')) {
        far = new THREE.InstancedMesh(farGeo, vmat, list.length);
        far.castShadow = false;
        far.receiveShadow = true;
        this.group.add(far);
      }
      const parts = A.parts(template).map((p) => p.matrix);
      this.forest.push({ list, near, far, parts });
    }
    this.updateForestLod(new THREE.Vector3(0, 300, 0), true);

    // rocks (with snow caps from the shared snow shader)
    const rocks = ['Rock_Medium_1', 'Rock_Medium_2', 'Rock_Medium_3'];
    const rockLists = rocks.map(() => []);
    m.rocks.forEach((rk, i) => {
      tmpQ.setFromEuler(new THREE.Euler(rk.rot * 0.2, rk.rot, rk.rot * 0.15));
      const s = rk.s * 0.75;
      tmpS.set(s * 1.1, s * 0.9, s);
      tmpP.set(rk.x, rk.y - rk.s * 0.35, rk.z);
      rockLists[i % 3].push(new THREE.Matrix4().compose(tmpP, tmpQ, tmpS));
    });
    rocks.forEach((n, i) => this.group.add(A.instanced(A.nature.get(n), rockLists[i])));
  }

  updateForestLod(cam, force = false) {
    const R2 = 170 * 170;
    const tmp = new THREE.Matrix4();
    for (const f of this.forest) {
      let n = 0, fn = 0;
      for (const t of f.list) {
        const dx = t.x - cam.x, dz = t.z - cam.z;
        const close = dx * dx + dz * dz < (f.far ? R2 : R2 * 0.6);
        if (close) {
          f.near.children.forEach((im, pi) => im.setMatrixAt(n, tmp.multiplyMatrices(t.matrix, f.parts[pi])));
          n++;
        } else if (f.far) {
          f.far.setMatrixAt(fn++, t.matrix);
        }
      }
      for (const im of f.near.children) { im.count = n; im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); }
      if (f.far) { f.far.count = fn; f.far.instanceMatrix.needsUpdate = true; f.far.computeBoundingSphere(); }
    }
    void force;
  }

  // ------------------------------------------------------------------ kickers
  buildKickers() {
    const m = this.m;
    const snowMat = new THREE.MeshStandardMaterial({ map: this.a.tex.snowColor, normalMap: this.a.tex.snowNormal, roughness: 0.6, side: THREE.DoubleSide });
    for (const k of m.kickers) {
      const seg = 6, lseg = 8;
      const verts = [], uvs = [];
      const lat = (u) => (u / seg - 0.5) * 2 * k.w;
      const pt = (u, v, top) => {
        const along = -k.len + (v / lseg) * (k.len + 0.05);
        const l = lat(u);
        const x = k.x + k.dx * along - k.dz * l;
        const z = k.z + k.dz * along + k.dx * l;
        const y = top ? m.heightAt(x, z) + 0.02 : m.terrainAt(x, z) - 0.2;
        return [x, y, z];
      };
      const quad = (a, b, c, d) => { verts.push(...a, ...b, ...c, ...a, ...c, ...d); for (const p of [a, b, c, a, c, d]) uvs.push(p[0] / 3, p[2] / 3); };
      for (let v = 0; v < lseg; v++) for (let u = 0; u < seg; u++) quad(pt(u, v, true), pt(u, v + 1, true), pt(u + 1, v + 1, true), pt(u + 1, v, true));
      for (let u = 0; u < seg; u++) quad(pt(u, lseg, true), pt(u, lseg, false), pt(u + 1, lseg, false), pt(u + 1, lseg, true));
      for (let v = 0; v < lseg; v++) {
        quad(pt(0, v, false), pt(0, v + 1, false), pt(0, v + 1, true), pt(0, v, true));
        quad(pt(seg, v, true), pt(seg, v + 1, true), pt(seg, v + 1, false), pt(seg, v, false));
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      g.computeVertexNormals();
      const mesh = new THREE.Mesh(g, snowMat);
      mesh.receiveShadow = true;
      this.group.add(mesh);
      for (const s of [-1, 1]) {
        const x = k.x - k.dz * k.w * s, z = k.z + k.dx * k.w * s;
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.4, 6), mat('#ff6b3d'));
        pole.position.set(x, m.heightAt(x, z) + 0.7, z);
        this.group.add(pole);
      }
    }
  }

  // ------------------------------------------------------------------ chairlift
  buildLift() {
    const m = this.m;
    const lift = m.lift;
    const steel = new THREE.MeshStandardMaterial({ color: '#8a93a5', metalness: 0.6, roughness: 0.4 });
    const dark = new THREE.MeshStandardMaterial({ color: '#3a4152', metalness: 0.4, roughness: 0.5 });
    const dx = lift.top.x - lift.bottom.x, dz = lift.top.z - lift.bottom.z;
    const len = Math.hypot(dx, dz);
    const fx = dx / len, fz = dz / len;
    const lx = -fz, lz = fx;
    this.liftDir = { fx, fz, lx, lz };
    const yaw = Math.atan2(fx, fz);
    for (const t of lift.towers) {
      const h = t.top - t.ground;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.45, h + 1, 10), steel);
      pole.position.set(t.x, t.ground + h / 2 - 0.5, t.z);
      pole.castShadow = true;
      const arm = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.35, 0.5), steel);
      arm.position.set(t.x, t.top + 0.3, t.z);
      arm.rotation.y = yaw;
      arm.castShadow = true;
      this.group.add(pole, arm);
      for (const side of [1, -1]) {
        const sheave = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.18, 12).rotateZ(Math.PI / 2), dark);
        sheave.position.set(t.x + lx * 2.4 * side, t.top + 0.1, t.z + lz * 2.4 * side);
        sheave.rotation.y = yaw;
        this.group.add(sheave);
      }
    }
    const cableMat = new THREE.LineBasicMaterial({ color: '#2a2f3d' });
    for (const side of [1, -1]) {
      const pts = lift.towers.map((t) => new THREE.Vector3(t.x + lx * 2.4 * side, t.top + 0.2, t.z + lz * 2.4 * side));
      this.group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), cableMat));
    }
    // stations: wooden huts from the kit with a bullwheel
    for (const [s, end] of [[lift.bottom, 0], [lift.top, 1]]) {
      const off = end === 0 ? -6 : 6;
      this.chalet({ x: s.x - fx * off, z: s.z - fz * off, w: 2, d: 3, floors: 1, yaw, roof: 'Roof_RoundTiles_4x4', base: 'plaster', door: false });
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 0.4, 24), dark);
      const t = end === 0 ? lift.towers[0] : lift.towers[lift.towers.length - 1];
      wheel.position.set(t.x, t.top + 0.2, t.z);
      wheel.castShadow = true;
      this.animated.push((dt, time) => { wheel.rotation.y = time * 0.6 * (end ? -1 : 1); });
      this.group.add(wheel);
    }
    const lb = lift.bottom;
    const matMesh = new THREE.Mesh(new THREE.BoxGeometry(5, 0.08, 4), mat('#2f6fd6'));
    const mx = lb.x + lx * 2.4 + fx * 3, mz = lb.z + lz * 2.4 + fz * 3;
    matMesh.position.set(mx, m.heightAt(mx, mz) + 0.05, mz);
    matMesh.rotation.y = yaw;
    this.group.add(matMesh);
    this.liftLoad = { x: mx, z: mz };

    const chairParts = [
      new THREE.CylinderGeometry(0.04, 0.04, 2.6, 6).translate(0, 1.3, 0),
      new THREE.BoxGeometry(1.8, 0.1, 0.7).translate(0, 0, 0.15),
      new THREE.BoxGeometry(1.8, 0.7, 0.08).translate(0, 0.38, -0.2),
      new THREE.CylinderGeometry(0.03, 0.03, 1.8, 6).rotateZ(Math.PI / 2).translate(0, 0.6, 0.55),
    ].map((g, i) => vcolor(g, ['#3a4152', '#2a2f3d', '#e63946', '#3a4152'][i]));
    const chairGeo = mergeGeometries(chairParts);
    const n = Math.max(12, Math.round((len * 2) / 34));
    const chairs = new THREE.InstancedMesh(chairGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }), n);
    chairs.castShadow = true;
    chairs.frustumCulled = false;
    this.group.add(chairs);
    this.animated.push((dt, time) => {
      for (let i = 0; i < n; i++) {
        const s = ((time / 20) + (i / n) * 2) % 2;
        const up = s < 1;
        const p = lift.at(up ? s : 2 - s);
        const side = up ? 1 : -1;
        tmpP.set(p.x + lx * 2.4 * side, p.y, p.z + lz * 2.4 * side);
        tmpQ.setFromAxisAngle(UP, yaw + (up ? Math.PI : 0));
        tmpS.set(1, 1, 1);
        chairs.setMatrixAt(i, tmpM.compose(tmpP, tmpQ, tmpS));
      }
      chairs.instanceMatrix.needsUpdate = true;
    });
  }

  // ------------------------------------------------------------------ chalets from the modular village kit
  /**
   * Adds a chalet built from kit pieces (2m wall modules) to the current building batch.
   * w,d = footprint in modules; floors = storeys; base = 'stone' | 'plaster'
   */
  chalet({ x, z, y, w = 3, d = 4, floors = 2, yaw = 0, roof, base = 'stone', door = true, balcony = false, chimney = true, white = false }) {
    const V = this.a.village;
    const gy = y ?? this.m.heightAt(x, z) - 0.15;
    const root = new THREE.Matrix4().compose(new THREE.Vector3(x, gy, z), new THREE.Quaternion().setFromAxisAngle(UP, yaw), new THREE.Vector3(1, 1, 1));
    const W = w * 2, D = d * 2, FH = 3.12;
    const put = (name, lx, ly, lz, ry = 0, s = 1) => {
      const t = V.get(name);
      if (!t) return;
      const local = new THREE.Matrix4().compose(new THREE.Vector3(lx, ly, lz), new THREE.Quaternion().setFromAxisAngle(UP, ry), new THREE.Vector3(s, s, s));
      this.batch.push({ template: t, matrix: new THREE.Matrix4().multiplyMatrices(root, local) });
    };
    const wallSet = (f) => {
      const ground = f === 0;
      const stone = ground && base === 'stone';
      return {
        plain: stone ? 'Wall_UnevenBrick_Straight' : (f % 2 ? 'Wall_Plaster_WoodGrid' : 'Wall_Plaster_Straight'),
        window: stone ? 'Wall_UnevenBrick_Window_Wide_Round' : (white ? 'Wall_Plaster_Window_Wide_Round' : 'Wall_Plaster_Window_Thin_Round'),
        door: stone ? 'Wall_UnevenBrick_Door_Round' : 'Wall_Plaster_Door_Round',
      };
    };
    for (let f = 0; f < floors; f++) {
      const ws = wallSet(f);
      const yy = f * FH;
      for (let i = 0; i < w; i++) {
        const lx = -W / 2 + 1 + i * 2;
        const front = f === 0 && door && i === Math.floor(w / 2) ? ws.door : (i % 2 === 0 ? ws.window : ws.plain);
        put(front, lx, yy, D / 2, 0);
        put(i % 2 ? ws.window : ws.plain, lx, yy, -D / 2, Math.PI);
      }
      for (let i = 0; i < d; i++) {
        const lz = -D / 2 + 1 + i * 2;
        put(i % 2 ? ws.window : ws.plain, W / 2, yy, lz, Math.PI / 2);
        put(i % 2 === 0 ? ws.window : ws.plain, -W / 2, yy, lz, -Math.PI / 2);
      }
      const corner = 'Corner_Exterior_Wood'; // the brick corner piece is ~3k tris, too heavy to repeat
      for (const [cx, cz, r] of [[W / 2, D / 2, 0], [-W / 2, D / 2, -Math.PI / 2], [W / 2, -D / 2, Math.PI / 2], [-W / 2, -D / 2, Math.PI]]) put(corner, cx, yy, cz, r);
      if (balcony && f === 1) for (let i = 0; i < w; i++) put('Balcony_Cross_Straight', -W / 2 + 1 + i * 2, yy, D / 2, 0);
    }
    const roofName = roof || `Roof_RoundTiles_${W}x${D}`;
    put(roofName, 0, floors * FH, 0, 0);
    if (chimney) put('Prop_Chimney', W / 2 - 1.2, floors * FH + 0.8, -D / 4, 0);
    // collision footprint
    this.m.addCollider(x, z, Math.max(W, D) * 0.55, 'building');
    return { x, z, y: gy, W, D, H: floors * FH };
  }

  flushBatch(castShadow = true) {
    // merge every placed kit piece into one mesh per material
    const byMat = new Map();
    for (const { template, matrix } of this.batch) {
      for (const part of this.a.parts(template)) {
        const g = part.geometry.clone();
        for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
        if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
        g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(matrix, part.matrix));
        if (!g.index) g.setIndex([...Array(g.attributes.position.count).keys()]);
        if (!byMat.has(part.material)) byMat.set(part.material, []);
        byMat.get(part.material).push(g);
      }
    }
    for (const [material, geos] of byMat) {
      const merged = mergeGeometries(geos);
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, material);
      mesh.castShadow = castShadow;
      mesh.receiveShadow = true;
      this.group.add(mesh);
    }
    this.batch = [];
  }

  buildBuildings() {
    const m = this.m, S = m.sites, A = this.a;
    const windowMat = new THREE.MeshStandardMaterial({ color: '#ffcf7a', emissive: '#ffb347', emissiveIntensity: 0.5 });
    this.windowMat = windowMat;

    // --- summit: patrol hut, garage shed
    const hut = this.chalet({ x: S.hut.x, z: S.hut.z, w: 3, d: 3, floors: 2, yaw: 0, roof: 'Roof_RoundTiles_6x6', balcony: true });
    this.chalet({ x: S.garageTop.x, z: S.garageTop.z - 6, w: 3, d: 2, floors: 1, yaw: 0, roof: 'Roof_RoundTiles_6x6', base: 'plaster', door: false, chimney: false });
    // --- base: lodge, clinic, garage, a few chalets
    const lodge = this.chalet({ x: S.lodge.x, z: S.lodge.z, w: 4, d: 5, floors: 3, yaw: 0.15, roof: 'Roof_RoundTiles_8x10', balcony: true });
    const cx = S.clinic.x - 12, cz = S.clinic.z + 12;
    const clinic = this.chalet({ x: cx, z: cz, w: 3, d: 4, floors: 2, yaw: 0.5, roof: 'Roof_RoundTiles_6x8', base: 'plaster', white: true, chimney: false });
    this.chalet({ x: S.garageBase.x, z: S.garageBase.z - 8, w: 3, d: 2, floors: 1, yaw: 0, roof: 'Roof_RoundTiles_6x6', base: 'plaster', door: false, chimney: false });
    const rr = mulberry32(hashString('chalets' + m.seed));
    const spots = [[-150, 940], [120, 950], [165, 905], [-190, 905], [-120, 960], [95, 975]];
    for (const [x, z] of spots) {
      if (m.heightAt(x, z) > 40) continue;
      const big = rr() < 0.4;
      this.chalet({ x, z, w: big ? 3 : 2, d: big ? 4 : 2, floors: big ? 2 : 2, yaw: (rr() - 0.5) * 0.8, roof: big ? 'Roof_RoundTiles_6x8' : 'Roof_RoundTiles_4x4', balcony: big });
    }
    // --- valley village (beyond the base, on the flat valley floor)
    for (let i = 0; i < 16; i++) {
      const x = (rr() - 0.5) * 460, z = 1015 + rr() * 230;
      const big = rr() < 0.5;
      this.chalet({ x, z, y: 9.6, w: big ? 3 : 2, d: big ? 4 : 2, floors: big ? 2 : 1 + Math.floor(rr() * 2), yaw: rr() * 6.28, roof: big ? 'Roof_RoundTiles_6x8' : 'Roof_RoundTiles_4x4', balcony: big && rr() < 0.5 });
    }
    // props: fences, crates, wagon near the lodge
    const prop = (name, x, z, ry = 0, s = 1) => {
      const t = A.village.get(name);
      if (!t) return;
      this.batch.push({ template: t, matrix: new THREE.Matrix4().compose(new THREE.Vector3(x, m.heightAt(x, z) - 0.05, z), new THREE.Quaternion().setFromAxisAngle(UP, ry), new THREE.Vector3(s, s, s)) });
    };
    for (let i = 0; i < 10; i++) prop('Prop_WoodenFence_Single', S.lodge.x - 30 + i * 2.05, S.lodge.z - 16, 0);
    prop('Prop_Wagon', S.lodge.x + 16, S.lodge.z - 4, 1.2);
    prop('Prop_Crate', S.crate.x + 1.5, S.crate.z + 1.2, 0.3);
    prop('Prop_Crate', S.hut.x + 6, S.hut.z + 5, 0.8);
    prop('Prop_Crate', S.hut.x + 7, S.hut.z + 6.2, 0.2, 0.8);
    this.flushBatch(true);

    // rescue station: sign, radio mast, old wooden akja on the wall, avalanche bulletin board
    this.buildStation(hut);
    this.flushBatch(true);
    const lodgeSign = this.signMesh('BASE LODGE · KAFFEE & KUCHEN', '#2e9e5b', 12, 1.4, [0, 0, 0]);
    lodgeSign.position.set(S.lodge.x + Math.sin(0.15) * 5.4, lodge.y + 7.0, S.lodge.z + Math.cos(0.15) * 5.4);
    lodgeSign.rotation.y = 0.15;
    this.group.add(lodgeSign);
    // Pistenrettung flag on the station
    const flagPole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 10, 8), mat('#c9ced8', { metalness: 0.6, roughness: 0.3 }));
    flagPole.position.set(S.hut.x + 5, hut.y + 5, S.hut.z + 5);
    this.group.add(flagPole);
    const flag = this.makeFlag();
    flag.position.set(S.hut.x + 5, hut.y + 9, S.hut.z + 5);
    this.group.add(flag);

    // clinic (Unfallambulanz): big round emblem sign on the gable, slightly emissive so it reads at dusk
    const emTex = makeEmblemTexture(512);
    this.emblemMat = new THREE.MeshStandardMaterial({ map: emTex, emissive: '#ffffff', emissiveMap: emTex, emissiveIntensity: 0.35, transparent: true, alphaTest: 0.3, roughness: 0.5 });
    const badge = new THREE.Group();
    const badgeBack = new THREE.Mesh(new THREE.CylinderGeometry(1.42, 1.42, 0.14, 40).rotateX(Math.PI / 2), mat(BRAND.petrol, { flatShading: false, roughness: 0.5 }));
    badgeBack.castShadow = true;
    const badgeFace = new THREE.Mesh(new THREE.CircleGeometry(1.4, 48), this.emblemMat);
    badgeFace.position.z = 0.075;
    badge.add(badgeBack, badgeFace);
    badge.position.set(cx + Math.sin(0.5) * 4.5, clinic.y + 8.4, cz + Math.cos(0.5) * 4.5);
    badge.rotation.y = 0.5;
    this.group.add(badge);
    const clinicSign = this.signMesh('UNFALLAMBULANZ', BRAND.petrol, 6, 1, [0, 0, 0]);
    clinicSign.position.set(cx + Math.sin(0.5) * 4.4, clinic.y + 3.6, cz + Math.cos(0.5) * 4.4);
    clinicSign.rotation.y = 0.5;
    this.group.add(clinicSign);
    const ring = new THREE.Mesh(new THREE.RingGeometry(S.clinicRadius - 0.8, S.clinicRadius, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#e63946', transparent: true, opacity: 0.55, depthWrite: false }));
    ring.position.set(S.clinic.x, m.heightAt(S.clinic.x, S.clinic.z) + 0.15, S.clinic.z);
    this.group.add(ring);
    this.clinicRing = ring;
    // helipad: white "H" inside a circle, perimeter lights, orange windsock
    const padX = S.clinic.x + 22, padZ = S.clinic.z + 10;
    const pad = new THREE.Mesh(new THREE.CircleGeometry(5.5, 48).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: this.helipadTexture(), roughness: 0.8 }));
    pad.position.set(padX, m.heightAt(padX, padZ) + 0.1, padZ);
    pad.receiveShadow = true;
    this.padLightMat = new THREE.MeshStandardMaterial({ color: '#fff6d8', emissive: '#ffd36a', emissiveIntensity: 0.4 });
    const lamps = [];
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      lamps.push(new THREE.CylinderGeometry(0.09, 0.11, 0.12, 8).translate(padX + Math.cos(a) * 5.75, pad.position.y + 0.02, padZ + Math.sin(a) * 5.75));
    }
    this.group.add(pad, new THREE.Mesh(mergeGeometries(lamps), this.padLightMat));
    this.helipad = pad.position.clone();
    const sock = makeWindsock(4);
    const wsx = padX + 6.5, wsz = padZ - 4.5;
    sock.position.set(wsx, m.heightAt(wsx, wsz) - 0.05, wsz);
    this.group.add(sock);
    this.helipadWindsock = sock.userData.windsock;
    this.animated.push((dt, time) => {
      const w = this.helipadWindsock;
      w.rotation.y = 2.2 + Math.sin(time * 0.23) * 0.35 + Math.sin(time * 1.7) * 0.05;
      w.children[0].rotation.x = 0.2 + Math.sin(time * 2.3) * 0.05;
    });

    // sled rack + charge crate at the summit
    const woodDark = new THREE.MeshStandardMaterial({ color: '#5f3c28', roughness: 0.8 });
    const rack = new THREE.Group();
    for (const sx of [-4, 4]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.25, 1.6, 0.25), woodDark); post.position.set(sx, 0.8, -1.8); rack.add(post); }
    const bar = new THREE.Mesh(new THREE.BoxGeometry(8.4, 0.25, 0.25), woodDark);
    bar.position.set(0, 1.5, -1.8);
    rack.add(bar, this.signMesh('AKJA', BRAND.orange, 4, 0.8, [0, 2.3, -1.8]));
    rack.position.set(S.rack.x, m.heightAt(S.rack.x, S.rack.z), S.rack.z);
    this.group.add(rack);
    const crate = new THREE.Group();
    const box = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.1, 1.2), new THREE.MeshStandardMaterial({ color: '#e67e22', roughness: 0.6 }));
    box.position.y = 0.45;
    box.castShadow = true;
    for (const yy of [0.2, 0.75]) { const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.82, 0.12, 1.22), mat('#22242c')); stripe.position.y = yy; crate.add(stripe); }
    crate.add(box, this.signMesh('AVALANCHE CHARGES', '#22242c', 4.4, 0.8, [0, 2.0, 0]));
    crate.position.set(S.crate.x, m.heightAt(S.crate.x, S.crate.z), S.crate.z);
    this.group.add(crate);
    // garage signs
    for (const g of [S.garageTop, S.garageBase]) {
      const sign = this.signMesh('PATROL VEHICLES', '#2f6fd6', 5, 0.9, [g.x, m.heightAt(g.x, g.z) + 4.2, g.z - 3.4]);
      this.group.add(sign);
    }
    // piste signpost at the summit
    const post = new THREE.Group();
    const sp = m.sites.spawn;
    const ppole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 3.6, 8), woodDark);
    ppole.position.y = 1.8;
    post.add(ppole);
    m.pistes.forEach((pi, i) => {
      const board = this.signMesh(pi.name.toUpperCase(), pi.difficulty === 'black' ? '#1b1f2a' : pi.color, 3.4, 0.55, [0, 3.2 - i * 0.7, 0]);
      const dir = Math.atan2(pi.points[6].x - sp.x, pi.points[6].z - sp.z);
      board.rotation.y = dir - Math.PI / 2;
      board.position.x = Math.sin(dir) * 1.6;
      board.position.z = Math.cos(dir) * 1.6;
      post.add(board);
    });
    post.position.set(sp.x + 4, m.heightAt(sp.x + 4, sp.z), sp.z);
    this.group.add(post);
    // chimney smoke sources
    this.smokeSources.push({ x: lodge.x + 2.8, y: lodge.y + lodge.H + 4.2, z: lodge.z - 2.5 });
    this.smokeSources.push({ x: hut.x + 1.8, y: hut.y + hut.H + 4.2, z: hut.z - 1.5 });
  }

  /**
   * Board with a canvas face on front and back (2 draw calls: sides + faces).
   * draw(ctx, W, H) paints the face; it is repainted once the web font has loaded.
   */
  signCanvas(w, h, draw, bg, { depth = 0.08, px = 64, emissive = 0 } = {}) {
    const cv = document.createElement('canvas');
    cv.width = Math.min(2048, Math.round(w * px)); cv.height = Math.min(1024, Math.round(h * px));
    const ctx = cv.getContext('2d');
    const paint = () => { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height); draw(ctx, cv.width, cv.height); };
    paint();
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    afterFonts(() => { paint(); tex.needsUpdate = true; });
    const side = new THREE.MeshStandardMaterial({ color: bg, roughness: 0.6 });
    const face = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 });
    if (emissive) { face.emissive.set('#ffffff'); face.emissiveMap = tex; face.emissiveIntensity = emissive; }
    const geo = new THREE.BoxGeometry(w, h, depth);
    geo.clearGroups();
    geo.addGroup(0, 24, 0); // +x, -x, +y, -y
    geo.addGroup(24, 12, 1); // front + back
    const m = new THREE.Mesh(geo, [side, face]);
    m.castShadow = true;
    m.userData.canvas = { cv, ctx, tex, repaint: paint };
    return m;
  }

  signMesh(text, bg, w, h, at, fg = '#ffffff') {
    const m = this.signCanvas(w, h, (ctx, W, H) => {
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 5;
      ctx.strokeRect(6, 6, W - 12, H - 12);
      ctx.fillStyle = fg;
      ctx.font = `${Math.round(H * 0.55)}px ${SIGN_FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, W / 2, H / 2 + 2, W - 20);
    }, bg);
    m.position.set(at[0], at[1], at[2]);
    return m;
  }

  // ------------------------------------------------------------------ rescue station (Rettungswache)
  buildStation(hut) {
    const m = this.m, S = m.sites, A = this.a;
    const hx = S.hut.x, hz = S.hut.z, gy = hut.y;
    // main sign over the door: emblem + RETTUNGSWACHE / PISTENRETTUNG HINTERECK
    const sign = this.signCanvas(6.4, 1.5, (c, W, H) => {
      c.fillStyle = BRAND.petrol; c.fillRect(0, 0, W, H);
      c.fillStyle = BRAND.orange; c.fillRect(0, H * 0.9, W, H * 0.1);
      c.strokeStyle = 'rgba(255,255,255,0.9)'; c.lineWidth = 6; c.strokeRect(7, 7, W - 14, H - 14);
      drawEmblem(c, H * 0.56, H * 0.47, H * 0.38);
      c.textAlign = 'center'; c.textBaseline = 'middle';
      const tx = H * 0.98 + (W - H * 0.98) / 2, tw = W - H * 1.15;
      c.fillStyle = '#ffffff';
      c.font = `${Math.round(H * 0.42)}px ${SIGN_FONT}`;
      c.fillText('RETTUNGSWACHE', tx, H * 0.36, tw);
      c.fillStyle = '#ffc08a';
      c.font = `${Math.round(H * 0.2)}px ${SIGN_FONT}`;
      c.fillText('PISTENRETTUNG HINTERECK', tx, H * 0.7, tw);
    }, BRAND.petrol, { px: 128 });
    sign.position.set(hx, gy + 3.6, hz + 3.4);
    this.group.add(sign);

    const steel = new THREE.MeshStandardMaterial({ color: '#9aa3b2', metalness: 0.6, roughness: 0.35 });
    const glassfibre = new THREE.MeshStandardMaterial({ color: '#f2f2ee', roughness: 0.5 });
    const warn = new THREE.MeshStandardMaterial({ color: '#ff3a2a', emissive: '#ff2010', emissiveIntensity: 1.6 });
    const wood = new THREE.MeshStandardMaterial({ color: '#7a5034', roughness: 0.85 });
    const woodDark = new THREE.MeshStandardMaterial({ color: '#5f3c28', roughness: 0.85 });
    const bake = (meshes, matrix) => {
      const tpl = new THREE.Group();
      for (const [geo, material] of meshes) tpl.add(new THREE.Mesh(geo, material));
      this.batch.push({ template: tpl, matrix });
    };
    // radio antenna mast on the roof ridge (Bergfunk): pipe, side arm with a whip, collinear on top, warning light
    const roofTpl = A.village.get('Roof_RoundTiles_6x6');
    const mlx = 1.4, mlz = -1.2;
    const roofY = gy + hut.H + (roofTpl ? this.templateHeightAt(roofTpl, mlx, mlz) : 2.5);
    const mastH = 4.2;
    bake([
      [new THREE.BoxGeometry(0.34, 0.5, 0.34).translate(0, 0.05, 0), steel],
      [new THREE.CylinderGeometry(0.05, 0.06, mastH, 8).translate(0, mastH / 2, 0), steel],
      [new THREE.BoxGeometry(0.62, 0.05, 0.05).translate(0.31, mastH - 1.3, 0), steel],
      [new THREE.CylinderGeometry(0.022, 0.03, 1.0, 6).translate(0.6, mastH - 1.3 + 0.5, 0), glassfibre],
      [new THREE.CylinderGeometry(0.025, 0.04, 1.7, 8).translate(0, mastH + 0.85, 0), glassfibre],
      [new THREE.SphereGeometry(0.07, 8, 6).translate(0, mastH + 1.75, 0), warn],
    ], new THREE.Matrix4().makeTranslation(hx + mlx, roofY - 0.25, hz + mlz));
    // old wooden akja hung upright on the east wall (bottom against the wall, bow up)
    const akja = makeToboggan({ wood: true }).root;
    const wallX = hx + hut.W / 2 + 0.32, wallZ = hz - 2;
    const akM = new THREE.Matrix4().compose(new THREE.Vector3(wallX, gy + 0.55 + 1.13, wallZ),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, -Math.PI / 2, 0, 'YXZ')), new THREE.Vector3(1, 1, 1));
    this.batch.push({ template: akja, matrix: akM });
    bake([
      [new THREE.BoxGeometry(0.12, 0.08, 0.5).translate(-0.04, 0.0, 0), woodDark],
      [new THREE.BoxGeometry(0.12, 0.08, 0.5).translate(-0.04, 1.75, 0), woodDark],
    ], new THREE.Matrix4().makeTranslation(wallX, gy + 0.55, wallZ));
    // avalanche bulletin board (Lawinenlagebericht) by the entrance: two posts, backing board, little roof
    const bx = hx - 3.7, bz = hz + 4.7, by = m.heightAt(bx, bz) - 0.05, byaw = 0.35;
    const bM = new THREE.Matrix4().compose(new THREE.Vector3(bx, by, bz), new THREE.Quaternion().setFromAxisAngle(UP, byaw), new THREE.Vector3(1, 1, 1));
    bake([
      [new THREE.BoxGeometry(0.12, 2.55, 0.12).translate(-0.98, 1.27, -0.02), wood],
      [new THREE.BoxGeometry(0.12, 2.55, 0.12).translate(0.98, 1.27, -0.02), wood],
      [new THREE.BoxGeometry(1.92, 1.42, 0.07).translate(0, 1.6, -0.02), woodDark],
      [new THREE.BoxGeometry(1.16, 0.05, 0.5).rotateZ(0.42).translate(-0.53, 2.56, 0.0), woodDark],
      [new THREE.BoxGeometry(1.16, 0.05, 0.5).rotateZ(-0.42).translate(0.53, 2.56, 0.0), woodDark],
    ], bM);
    this.bulletin = this.makeBulletinFace();
    this.bulletin.position.set(0, 1.6, 0.022);
    const bg = new THREE.Group();
    bg.add(this.bulletin);
    bg.position.set(bx, by, bz);
    bg.rotation.y = byaw;
    this.group.add(bg);
  }

  // height of a kit template's surface at local (lx, lz) (raycast against its parts)
  templateHeightAt(template, lx, lz) {
    const rc = new THREE.Raycaster(new THREE.Vector3(lx, 50, lz), new THREE.Vector3(0, -1, 0));
    let best = 0;
    for (const part of this.a.parts(template)) {
      const probe = new THREE.Mesh(part.geometry);
      probe.matrixAutoUpdate = false;
      probe.matrix.copy(part.matrix);
      probe.matrixWorld.copy(part.matrix);
      const hit = rc.intersectObject(probe, false)[0];
      if (hit) best = Math.max(best, hit.point.y);
    }
    return best;
  }

  makeBulletinFace() {
    const cv = document.createElement('canvas');
    cv.width = 512; cv.height = 376;
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(1.74, 1.28), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.75 }));
    face.userData = { cv, ctx: cv.getContext('2d'), tex };
    return face;
  }

  /** Redraws the avalanche bulletin board for danger level 1..5 (European scale, German names). */
  setBulletin(level) {
    const lv = Math.max(1, Math.min(5, Math.round(level) || 1));
    this.bulletinLevel = lv;
    if (!this.bulletin) return;
    const { cv, ctx: c, tex } = this.bulletin.userData;
    const W = cv.width, H = cv.height;
    const paint = () => {
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.fillStyle = '#f6f2e6'; c.fillRect(0, 0, W, H);
      // header
      c.fillStyle = BRAND.petrol; c.fillRect(0, 0, W, 70);
      c.fillStyle = BRAND.orange; c.fillRect(0, 70, W, 6);
      drawEmblem(c, 40, 36, 27);
      c.fillStyle = '#ffffff'; c.textAlign = 'left'; c.textBaseline = 'middle';
      c.font = `38px ${SIGN_FONT}`;
      c.fillText('LAWINENLAGEBERICHT', 78, 30, W - 92);
      c.font = '800 15px Nunito, sans-serif';
      c.fillStyle = '#d6eef0';
      c.fillText('Pistenrettung Hintereck · heute', 80, 58, W - 92);
      // level square with our own icon: mountain silhouette + number
      const col = DANGER_COLORS[lv];
      const sx = 22, sy = 96, sz = 168;
      c.fillStyle = BRAND.ink; c.fillRect(sx - 4, sy - 4, sz + 8, sz + 8);
      c.fillStyle = col; c.fillRect(sx, sy, sz, sz);
      const ink = lv >= 4 ? '#ffffff' : BRAND.ink;
      c.fillStyle = lv >= 4 ? 'rgba(255,255,255,0.28)' : 'rgba(29,42,68,0.2)';
      c.beginPath(); c.moveTo(sx, sy + sz); c.lineTo(sx + sz * 0.38, sy + sz * 0.58); c.lineTo(sx + sz * 0.55, sy + sz * 0.72);
      c.lineTo(sx + sz * 0.78, sy + sz * 0.48); c.lineTo(sx + sz, sy + sz * 0.7); c.lineTo(sx + sz, sy + sz); c.closePath(); c.fill();
      c.fillStyle = ink; c.textAlign = 'center';
      c.font = `128px ${SIGN_FONT}`;
      c.fillText(String(lv), sx + sz / 2, sy + sz * 0.47);
      // text block
      const tx = sx + sz + 24, tw = W - tx - 18;
      c.textAlign = 'left'; c.fillStyle = '#5b6474';
      c.font = '800 20px Nunito, sans-serif';
      c.fillText(`Gefahrenstufe ${lv} von 5`, tx, sy + 14, tw);
      const name = DANGER_DE[lv] || '';
      c.fillStyle = BRAND.ink;
      c.font = `52px ${SIGN_FONT}`;
      c.fillText(name.charAt(0).toUpperCase() + name.slice(1), tx, sy + 62, tw);
      // hint, wrapped to two lines
      c.font = '800 21px Nunito, sans-serif';
      c.fillStyle = '#2b3550';
      const words = (DANGER_HINTS[lv] || '').split(' ');
      const lines = [''];
      for (const wd of words) {
        const t = lines[lines.length - 1] ? lines[lines.length - 1] + ' ' + wd : wd;
        if (c.measureText(t).width > tw && lines[lines.length - 1]) lines.push(wd); else lines[lines.length - 1] = t;
      }
      lines.slice(0, 3).forEach((ln, i) => c.fillText(ln, tx, sy + 112 + i * 26, tw));
      // scale bar 1..5
      const by = H - 66, bw = (W - 44) / 5;
      for (let k = 1; k <= 5; k++) {
        const x = 22 + (k - 1) * bw;
        const on = k === lv;
        c.fillStyle = DANGER_COLORS[k];
        c.fillRect(x + 2, on ? by - 8 : by, bw - 4, on ? 42 : 34);
        if (on) { c.strokeStyle = BRAND.ink; c.lineWidth = 4; c.strokeRect(x + 2, by - 8, bw - 4, 42); }
        c.fillStyle = k >= 4 ? '#ffffff' : BRAND.ink;
        c.textAlign = 'center';
        c.font = `${on ? 26 : 20}px ${SIGN_FONT}`;
        c.fillText(String(k), x + bw / 2, by + (on ? 13 : 17));
      }
      c.textAlign = 'left';
      c.fillStyle = '#7a8291';
      c.font = '800 13px Nunito, sans-serif';
      c.fillText('Leitstelle Talheim · Bergfunk Kanal 7', 22, H - 12);
      tex.needsUpdate = true;
    };
    paint();
    if (!this.bulletinFontHook) { this.bulletinFontHook = true; afterFonts(() => this.setBulletin(this.bulletinLevel)); }
  }

  helipadTexture() {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 512;
    const c = cv.getContext('2d');
    c.fillStyle = '#3a4152'; c.fillRect(0, 0, 512, 512);
    c.strokeStyle = '#ffffff';
    c.lineWidth = 10;
    c.setLineDash([34, 20]);
    c.beginPath(); c.arc(256, 256, 236, 0, Math.PI * 2); c.stroke();
    c.setLineDash([]);
    c.lineWidth = 18;
    c.beginPath(); c.arc(256, 256, 172, 0, Math.PI * 2); c.stroke();
    c.fillStyle = '#ffffff';
    c.fillRect(178, 150, 40, 212); // H: two posts + bar
    c.fillRect(294, 150, 40, 212);
    c.fillRect(218, 236, 76, 40);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    return tex;
  }

  // Pistenrettung flag: orange field, petrol hoist band, our badge
  makeFlag() {
    const W = 2.4, Hh = 1.5;
    const g = new THREE.PlaneGeometry(W, Hh, 12, 2).translate(W / 2, 0, 0);
    const cv = document.createElement('canvas');
    cv.width = 384; cv.height = 240;
    const c = cv.getContext('2d');
    const paint = () => {
      c.fillStyle = BRAND.orange; c.fillRect(0, 0, 384, 240);
      c.fillStyle = BRAND.petrol; c.fillRect(0, 0, 86, 240);
      c.fillStyle = '#ffffff'; c.fillRect(86, 0, 8, 240);
      drawEmblem(c, 236, 120, 96);
    };
    paint();
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    afterFonts(() => { paint(); tex.needsUpdate = true; });
    const base = g.attributes.position.array.slice();
    const flag = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.8 }));
    flag.castShadow = true;
    this.animated.push((dt, time) => {
      const a = g.attributes.position.array;
      for (let i = 0; i < a.length; i += 3) a[i + 2] = Math.sin(time * 5 + base[i] * 2.2) * 0.18 * (base[i] / W);
      g.attributes.position.needsUpdate = true;
      g.computeVertexNormals();
    });
    return flag;
  }

  // ------------------------------------------------------------------ piste poles, avalanche zones
  buildMarkers() {
    const m = this.m;
    const byColor = {};
    for (const p of m.pistes) {
      const key = p.difficulty;
      byColor[key] = byColor[key] || { color: p.difficulty === 'black' ? '#1b1f2a' : p.color, list: [] };
      let acc = 0;
      for (let i = 1; i < p.points.length; i++) {
        const a = p.points[i - 1], b = p.points[i];
        const l = Math.hypot(b.x - a.x, b.z - a.z);
        acc += l;
        if (acc < 26) continue;
        acc = 0;
        const dx = (b.x - a.x) / l, dz = (b.z - a.z) / l;
        for (const s of [-1, 1]) {
          const x = b.x - dz * (p.width / 2 + 1) * s, z = b.z + dx * (p.width / 2 + 1) * s;
          byColor[key].list.push([x, m.heightAt(x, z), z]);
        }
      }
    }
    const poleGeo = mergeGeometries([
      new THREE.CylinderGeometry(0.06, 0.06, 1.8, 8).translate(0, 0.9, 0),
      new THREE.CylinderGeometry(0.2, 0.2, 0.12, 16).rotateX(Math.PI / 2).translate(0, 1.8, 0),
    ]);
    for (const k of Object.keys(byColor)) {
      const { color, list } = byColor[k];
      const im = new THREE.InstancedMesh(poleGeo, new THREE.MeshStandardMaterial({ color, roughness: 0.5 }), list.length);
      list.forEach(([x, y, z], i) => { tmpM.makeTranslation(x, y, z); im.setMatrixAt(i, tmpM); });
      im.castShadow = true;
      this.group.add(im);
    }
    const snowMat = new THREE.MeshStandardMaterial({ map: this.a.tex.snowColor, normalMap: this.a.tex.snowNormal, roughness: 0.75 });
    for (const a of m.avalanches) {
      const g = new THREE.Group();
      const rel = a.release;
      const p0 = a.path[0], p1 = a.path[Math.min(3, a.path.length - 1)];
      const dl = Math.hypot(p1.x - p0.x, p1.z - p0.z) || 1;
      const fx = (p1.x - p0.x) / dl, fz = (p1.z - p0.z) / dl;
      for (let i = -2; i <= 2; i++) {
        const x = rel.x - fz * i * a.width * 0.22 - fx * 18, z = rel.z + fx * i * a.width * 0.22 - fz * 18;
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.2, 8), mat(i % 2 ? '#1b1f2a' : '#f39c12'));
        pole.position.set(x, m.heightAt(x, z) + 1.1, z);
        g.add(pole);
      }
      const sx = rel.x - fx * 22 + fz * a.width * 0.6, sz = rel.z - fz * 22 - fx * a.width * 0.6;
      const sign = this.signMesh('⚠ AVALANCHE ZONE', '#f39c12', 4.6, 0.9, [sx, m.heightAt(sx, sz) + 2.2, sz], '#1b1f2a');
      sign.rotation.y = Math.atan2(fx, fz) + Math.PI;
      g.add(sign);
      // cornice: smooth overhanging snow lip
      const corn = new THREE.Group();
      for (let i = -3; i <= 3; i++) {
        const blob = new THREE.Mesh(new THREE.SphereGeometry(2.8 + Math.abs(i % 2) * 0.6, 14, 10), snowMat);
        const x = rel.x - fz * i * 4.2 - fx * 12, z = rel.z + fx * i * 4.2 - fz * 12;
        blob.position.set(x, m.heightAt(x, z) + 0.9, z);
        blob.scale.set(1.3, 0.6, 1.0);
        blob.rotation.y = i;
        blob.castShadow = true;
        blob.receiveShadow = true;
        corn.add(blob);
      }
      g.add(corn);
      this.cornices[a.id] = corn;
      this.group.add(g);
    }
  }

  // ------------------------------------------------------------------ surrounding range + valley
  buildBackdrop() {
    const m = this.m;
    const noise = makeNoise2D(hashString('range' + m.seed));
    const W = WORLD;
    const cell = 30, x0 = -1800, x1 = 1800, z0 = -1400, z1 = 2400;
    const nxv = Math.round((x1 - x0) / cell) + 1, nzv = Math.round((z1 - z0) / cell) + 1;
    const pos = new Float32Array(nxv * nzv * 3), uv = new Float32Array(nxv * nzv * 2);
    const inside = new Uint8Array(nxv * nzv);
    for (let iz = 0; iz < nzv; iz++) {
      for (let ix = 0; ix < nxv; ix++) {
        const i = iz * nxv + ix;
        const x = x0 + ix * cell, z = z0 + iz * cell;
        const cx = Math.max(W.minX, Math.min(W.maxX, x)), cz = Math.max(W.minZ, Math.min(W.maxZ, z));
        const d = Math.hypot(x - cx, z - cz);
        inside[i] = d < 1 ? 1 : 0;
        const edge = m.terrainAt(cx, cz);
        let ridged = 0, amp = 1, f = 0.0021, norm = 0;
        for (let o = 0; o < 4; o++) { const n = 1 - Math.abs(noise(x * f + o * 17, z * f)); ridged += n * n * amp; norm += amp; amp *= 0.5; f *= 2.1; }
        ridged /= norm;
        let peak = 140 + ridged * 520 + (z < 0 ? 140 * Math.min(1, -z / 600) : 0);
        const valley = z > 940 ? 1 - Math.min(1, Math.max(0, (Math.abs(x) - 260 - (z - 940) * 0.35) / 380)) : 0;
        peak = peak * (1 - valley) + 10 * valley;
        const t = Math.min(1, d / 260);
        const k = t * t * (3 - 2 * t);
        const h = (edge - 12) * (1 - k) + peak * k * (1 - 0.35 * Math.min(1, Math.max(0, (d - 900) / 600)));
        pos[i * 3] = x; pos[i * 3 + 1] = h; pos[i * 3 + 2] = z;
        uv[i * 2] = x / 7; uv[i * 2 + 1] = z / 7;
      }
    }
    const idx = [];
    for (let iz = 0; iz < nzv - 1; iz++) {
      for (let ix = 0; ix < nxv - 1; ix++) {
        const a = iz * nxv + ix, b = a + 1, c = a + nxv, d = c + 1;
        if (inside[a] && inside[b] && inside[c] && inside[d]) continue;
        idx.push(a, d, b, a, c, d);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('aPiste', new THREE.BufferAttribute(new Float32Array(nxv * nzv), 1));
    g.setAttribute('aAO', new THREE.BufferAttribute(new Float32Array(nxv * nzv).fill(1), 1));
    g.setIndex(idx);
    g.computeVertexNormals();
    const range = new THREE.Mesh(g, this.terrainMat);
    range.receiveShadow = true;
    this.group.add(range);
    this.valleyHeight = 10;

    // forest on the lower slopes of the range (far LOD only)
    const r = mulberry32(hashString('rangeforest' + m.seed));
    const farGeo = farPineGeometry();
    const mats = [];
    for (let n = 0; n < 6000 && mats.length < 2600; n++) {
      const ix = Math.floor(r() * (nxv - 1)), iz = Math.floor(r() * (nzv - 1));
      const i = iz * nxv + ix;
      if (inside[i]) continue;
      const y = pos[i * 3 + 1];
      if (y > 170 || y < 6) continue;
      const x = pos[i * 3] + (r() - 0.5) * cell, z = pos[i * 3 + 2] + (r() - 0.5) * cell;
      if (z > 1000 && Math.abs(x) < 300) continue;
      const s = 1 + r() * 0.8;
      mats.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y - 1, z), tmpQ.setFromAxisAngle(UP, r() * 6), new THREE.Vector3(s, s, s)));
    }
    const im = new THREE.InstancedMesh(farGeo, vmat, mats.length);
    mats.forEach((mm, i) => im.setMatrixAt(i, mm));
    im.computeBoundingSphere();
    this.group.add(im);

    // soft clouds
    const cloudMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, emissive: '#ffffff', emissiveIntensity: 0.18, transparent: true, opacity: 0.92 });
    this.clouds = new THREE.Group();
    for (let i = 0; i < 18; i++) {
      const c = new THREE.Group();
      const n = 5 + Math.floor(r() * 5);
      for (let k = 0; k < n; k++) {
        const b = new THREE.Mesh(new THREE.SphereGeometry(14 + r() * 18, 12, 8), cloudMat);
        b.position.set(k * 16 - n * 8, r() * 8, r() * 16);
        b.scale.y = 0.5;
        c.add(b);
      }
      c.position.set((r() - 0.5) * 1800, 420 + r() * 180, -300 + r() * 1800);
      c.userData.v = 2 + r() * 3;
      this.clouds.add(c);
    }
    this.group.add(this.clouds);
  }

  update(dt, time, tod, cam) {
    for (const f of this.animated) f(dt, time);
    for (const c of this.clouds.children) {
      c.position.x += c.userData.v * dt;
      if (c.position.x > 1000) c.position.x = -1000;
    }
    if (this.windowMat) this.windowMat.emissiveIntensity = 0.3 + Math.max(0, tod - 0.6) * 4;
    if (this.emblemMat) this.emblemMat.emissiveIntensity = 0.3 + Math.max(0, tod - 0.55) * 2.2;
    if (this.padLightMat) this.padLightMat.emissiveIntensity = 0.4 + Math.max(0, tod - 0.6) * 6;
    if (this.clinicRing) this.clinicRing.material.opacity = 0.35 + Math.sin(time * 3) * 0.2;
    this.lodTimer -= dt;
    if (cam && this.lodTimer <= 0) {
      this.lodTimer = 0.35;
      this.updateForestLod(cam);
    }
  }

  setCornice(id, visible) { if (this.cornices[id]) this.cornices[id].visible = visible; }

  raycast(origin, dir, maxDist = 400) {
    const p = origin.clone();
    const step = 1.5;
    for (let d = 0; d < maxDist; d += step) {
      p.addScaledVector(dir, step);
      if (p.y <= this.m.heightAt(p.x, p.z)) return p;
    }
    return null;
  }

  dispose() {
    this.r.scene.remove(this.group);
    this.group.traverse((o) => {
      if (o.geometry && !o.isInstancedMesh) o.geometry.dispose();
    });
  }
}

export { distToPolyline };
