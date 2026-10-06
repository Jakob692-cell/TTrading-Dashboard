// Builds the visual mountain from the shared generator: terrain, forest, lift, huts, decorations.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { WORLD, distToPolyline } from '/shared/mountain.js';
import { mulberry32, hashString, makeNoise2D } from '/shared/rng.js';
import { mat } from './models.js';

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

function pineGeometry(snowy) {
  const parts = [];
  parts.push(vcolor(new THREE.CylinderGeometry(0.16, 0.24, 1.4, 5).translate(0, 0.7, 0), '#5b3a29'));
  const green = snowy ? '#e9f0f8' : '#2c5a47';
  const tiers = [[1.7, 2.6, 2.1], [1.3, 2.2, 3.4], [0.9, 1.8, 4.6], [0.5, 1.2, 5.6]];
  for (const [r, h, y] of tiers) {
    parts.push(vcolor(new THREE.ConeGeometry(r, h, 7).translate(0, y, 0), green));
    parts.push(vcolor(new THREE.ConeGeometry(r * 0.62, h * 0.42, 7).translate(0, y + h * 0.3, 0), '#f4f8fc'));
  }
  return mergeGeometries(parts);
}

function rockGeometry(seed) {
  const r = mulberry32(seed);
  const g = new THREE.DodecahedronGeometry(1, 0);
  const pos = g.attributes.position;
  const jit = new Map();
  for (let i = 0; i < pos.count; i++) {
    const k = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
    if (!jit.has(k)) jit.set(k, 0.75 + r() * 0.5);
    const s = jit.get(k);
    pos.setXYZ(i, pos.getX(i) * s, pos.getY(i) * s * 0.75, pos.getZ(i) * s);
  }
  g.computeVertexNormals();
  const col = new Float32Array(pos.count * 3);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i); b.fromBufferAttribute(pos, i + 1); c.fromBufferAttribute(pos, i + 2);
    n.subVectors(c, b).cross(a.clone().sub(b)).normalize();
    const snow = n.y > 0.55;
    const cc = new THREE.Color(snow ? '#f2f6fb' : (r() < 0.5 ? '#767d8c' : '#6a7180'));
    for (let k = 0; k < 3; k++) { col[(i + k) * 3] = cc.r; col[(i + k) * 3 + 1] = cc.g; col[(i + k) * 3 + 2] = cc.b; }
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.deleteAttribute('uv');
  return g;
}

function makeSnowMaterial() {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.78, metalness: 0 });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uSparkle = { value: 1 };
    m.userData.shader = shader;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aPiste;\nvarying float vPiste;\nvarying vec3 vWorldP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPiste = aPiste;\nvWorldP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uSparkle;\nvarying float vPiste;\nvarying vec3 vWorldP;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        float cord = 0.5 + 0.5 * sin(vWorldP.x * 5.5 + sin(vWorldP.z * 0.05) * 3.0);
        diffuseColor.rgb *= 1.0 - vPiste * cord * 0.045;
      `)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        vec3 cellP = floor(vWorldP * 5.0);
        float hh = fract(sin(dot(cellP, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
        float tw = fract(sin(dot(cellP + floor(cameraPosition * 0.8), vec3(39.3468, 11.1351, 83.155))) * 24634.6345);
        float camDist = length(vWorldP - cameraPosition);
        float sparkle = step(0.9965, hh) * step(0.55, tw) * smoothstep(55.0, 6.0, camDist) * uSparkle;
        totalEmissiveRadiance += vec3(sparkle * 3.0);
      `);
  };
  return m;
}

export class World {
  constructor(renderer, mountain) {
    this.r = renderer;
    this.m = mountain;
    this.group = new THREE.Group();
    this.animated = [];
    this.cornices = [];
    this.flags = [];
    this.windows = [];
    this.smokeSources = [];
    this.buildTerrain();
    this.buildForest();
    this.buildKickers();
    this.buildLift();
    this.buildBuildings();
    this.buildMarkers();
    this.buildBackdrop();
    renderer.scene.add(this.group);
  }

  buildTerrain() {
    const m = this.m;
    const { nx, nz, cell, heights } = m;
    const tris = (nx - 1) * (nz - 1) * 2;
    const pos = new Float32Array(tris * 9);
    const col = new Float32Array(tris * 9);
    const pis = new Float32Array(tris * 3);
    const rnd = mulberry32(hashString('terrain' + m.seed));
    const snowA = new THREE.Color('#f4f8fd'), snowB = new THREE.Color('#dde8f5'), rock = new THREE.Color('#717887'), rock2 = new THREE.Color('#5f6676');
    const groomed = new THREE.Color('#fbfdff');
    const c = new THREE.Color();
    const near = [];
    let p = 0, q = 0;
    const H = (ix, iz) => heights[iz * nx + ix];
    const addTri = (ax, ay, az, bx, by, bz, cx, cy, cz) => {
      // face normal
      const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az;
      let nxv = uy * vz - uz * vy, nyv = uz * vx - ux * vz, nzv = ux * vy - uy * vx;
      const l = Math.hypot(nxv, nyv, nzv) || 1;
      nyv /= l;
      const mx = (ax + bx + cx) / 3, mz = (az + bz + cz) / 3;
      const piste = m.pisteAt(mx, mz) > 0;
      if (nyv < 0.66) c.copy(rnd() < 0.5 ? rock : rock2);
      else if (nyv < 0.76) c.copy(rock).lerp(snowB, (nyv - 0.66) / 0.1 * 0.9);
      else if (piste) c.copy(groomed).lerp(snowB, rnd() * 0.15);
      else c.copy(snowA).lerp(snowB, rnd() * 0.55 + (1 - nyv) * 0.8);
      // blob AO under trees
      m.collidersNear(mx, mz, near);
      let ao = 1;
      for (const o of near) {
        if (o.kind !== 'tree') continue;
        const d = Math.hypot(o.x - mx, o.z - mz);
        if (d < 4.2) ao = Math.min(ao, 0.8 + 0.2 * (d / 4.2));
      }
      c.multiplyScalar(ao);
      pos[p] = ax; pos[p + 1] = ay; pos[p + 2] = az;
      pos[p + 3] = bx; pos[p + 4] = by; pos[p + 5] = bz;
      pos[p + 6] = cx; pos[p + 7] = cy; pos[p + 8] = cz;
      for (let k = 0; k < 3; k++) { col[p + k * 3] = c.r; col[p + k * 3 + 1] = c.g; col[p + k * 3 + 2] = c.b; pis[q + k] = piste ? 1 : 0; }
      p += 9; q += 3;
    };
    for (let iz = 0; iz < nz - 1; iz++) {
      const z0 = WORLD.minZ + iz * cell, z1 = z0 + cell;
      for (let ix = 0; ix < nx - 1; ix++) {
        const x0 = WORLD.minX + ix * cell, x1 = x0 + cell;
        const h00 = H(ix, iz), h10 = H(ix + 1, iz), h01 = H(ix, iz + 1), h11 = H(ix + 1, iz + 1);
        // same diagonal split as mountain.terrainAt (u > v -> A,B,C)
        addTri(x0, h00, z0, x1, h11, z1, x1, h10, z0);
        addTri(x0, h00, z0, x0, h01, z1, x1, h11, z1);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aPiste', new THREE.BufferAttribute(pis, 1));
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    this.snowMat = makeSnowMaterial();
    const terrain = new THREE.Mesh(geo, this.snowMat);
    terrain.receiveShadow = true;
    terrain.castShadow = true;
    this.terrain = terrain;
    this.group.add(terrain);

    // valley floor beyond the map
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000, 1, 1).rotateX(-Math.PI / 2), mat('#e8eff8'));
    floor.position.set(0, 3, 900);
    floor.receiveShadow = true;
    this.group.add(floor);
  }

  buildForest() {
    const m = this.m;
    const kinds = [pineGeometry(false), pineGeometry(true)];
    for (let k = 0; k < 2; k++) {
      const list = m.trees.filter((t) => t.type === k);
      const im = new THREE.InstancedMesh(kinds[k], vmat, Math.max(1, list.length));
      im.count = list.length;
      const col = new THREE.Color();
      list.forEach((t, i) => {
        tmpQ.setFromAxisAngle(UP, t.rot);
        tmpS.set(t.s, t.s * (0.9 + (t.rot % 0.3)), t.s);
        tmpP.set(t.x, t.y - 0.3, t.z);
        tmpM.compose(tmpP, tmpQ, tmpS);
        im.setMatrixAt(i, tmpM);
        const v = 0.85 + ((t.rot * 1000) % 1) * 0.3;
        col.setRGB(v, v * (0.95 + ((t.rot * 77) % 1) * 0.1), v);
        im.setColorAt(i, col);
      });
      im.castShadow = true;
      im.receiveShadow = true;
      im.computeBoundingSphere();
      this.group.add(im);
    }
    // rocks
    const rg = rockGeometry(hashString(m.seed));
    const rim = new THREE.InstancedMesh(rg, vmat, m.rocks.length || 1);
    rim.count = m.rocks.length;
    m.rocks.forEach((r, i) => {
      tmpQ.setFromEuler(new THREE.Euler(r.rot * 0.3, r.rot, r.rot * 0.2));
      tmpS.set(r.s * 1.2, r.s, r.s * 1.1);
      tmpP.set(r.x, r.y - r.s * 0.25, r.z);
      tmpM.compose(tmpP, tmpQ, tmpS);
      rim.setMatrixAt(i, tmpM);
    });
    rim.castShadow = true;
    rim.receiveShadow = true;
    rim.computeBoundingSphere();
    this.group.add(rim);
  }

  buildKickers() {
    const m = this.m;
    const snow = mat('#f8fbff');
    for (const k of m.kickers) {
      const seg = 6, lseg = 8;
      const verts = [];
      const lat = (u) => (u / seg - 0.5) * 2 * k.w;
      const pt = (u, v, top) => {
        const along = -k.len + (v / lseg) * (k.len + 0.05);
        const l = lat(u);
        const x = k.x + k.dx * along - k.dz * l;
        const z = k.z + k.dz * along + k.dx * l;
        const y = top ? m.heightAt(x, z) : m.terrainAt(x, z) - 0.2;
        return [x, y, z];
      };
      const quad = (a, b, c, d) => { verts.push(...a, ...b, ...c, ...a, ...c, ...d); };
      for (let v = 0; v < lseg; v++) for (let u = 0; u < seg; u++) quad(pt(u, v, true), pt(u, v + 1, true), pt(u + 1, v + 1, true), pt(u + 1, v, true));
      for (let u = 0; u < seg; u++) quad(pt(u, lseg, true), pt(u, lseg, false), pt(u + 1, lseg, false), pt(u + 1, lseg, true));
      for (let v = 0; v < lseg; v++) {
        quad(pt(0, v, false), pt(0, v + 1, false), pt(0, v + 1, true), pt(0, v, true));
        quad(pt(seg, v, true), pt(seg, v + 1, true), pt(seg, v + 1, false), pt(seg, v, false));
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
      g.computeVertexNormals();
      const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: '#f8fbff', flatShading: true, roughness: 0.7, side: THREE.DoubleSide }));
      mesh.receiveShadow = true;
      mesh.castShadow = false; // double-sided ramps would shadow themselves (acne)
      this.group.add(mesh);
      // lip markers
      for (const s of [-1, 1]) {
        const x = k.x - k.dz * k.w * s, z = k.z + k.dx * k.w * s;
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.4, 4), mat('#ff6b3d'));
        pole.position.set(x, m.heightAt(x, z) + 0.7, z);
        this.group.add(pole);
      }
    }
    void snow;
  }

  buildLift() {
    const m = this.m;
    const lift = m.lift;
    const steel = mat('#8a93a5', { metalness: 0.5, roughness: 0.45 });
    const dark = mat('#3a4152');
    const dx = lift.top.x - lift.bottom.x, dz = lift.top.z - lift.bottom.z;
    const len = Math.hypot(dx, dz);
    const fx = dx / len, fz = dz / len;
    const lx = -fz, lz = fx; // lateral
    this.liftDir = { fx, fz, lx, lz };
    const yaw = Math.atan2(fx, fz);
    for (const t of lift.towers) {
      const h = t.top - t.ground;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, h + 1, 6), steel);
      pole.position.set(t.x, t.ground + h / 2 - 0.5, t.z);
      pole.castShadow = true;
      const arm = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.35, 0.5), steel);
      arm.position.set(t.x, t.top + 0.3, t.z);
      arm.rotation.y = yaw;
      arm.castShadow = true;
      this.group.add(pole, arm);
    }
    // cables
    const cableMat = new THREE.LineBasicMaterial({ color: '#2a2f3d' });
    for (const side of [1, -1]) {
      const pts = lift.towers.map((t) => new THREE.Vector3(t.x + lx * 2.4 * side, t.top + 0.2, t.z + lz * 2.4 * side));
      const g = new THREE.BufferGeometry().setFromPoints(pts);
      this.group.add(new THREE.Line(g, cableMat));
    }
    // stations
    for (const [s, end] of [[lift.bottom, 0], [lift.top, 1]]) {
      const ground = m.heightAt(s.x, s.z);
      const house = new THREE.Mesh(new THREE.BoxGeometry(9, 4, 6), mat('#e8e2d4'));
      const off = end === 0 ? -5 : 5;
      house.position.set(s.x - fx * off, ground + 2, s.z - fz * off);
      house.rotation.y = yaw;
      house.castShadow = true;
      const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 6.2, 2.2, 4, 1).rotateY(Math.PI / 4), mat('#2f6fd6'));
      roof.scale.set(1.15, 1, 0.8);
      roof.position.set(house.position.x, ground + 5.1, house.position.z);
      roof.rotation.y = yaw;
      roof.castShadow = true;
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 0.4, 14), dark);
      const t = end === 0 ? lift.towers[0] : lift.towers[lift.towers.length - 1];
      wheel.position.set(t.x, t.top + 0.2, t.z);
      this.animated.push((dt, time) => { wheel.rotation.y = time * 0.6 * (end ? -1 : 1); });
      this.group.add(house, roof, wheel);
    }
    // loading mat at the bottom
    const lb = lift.bottom;
    const matMesh = new THREE.Mesh(new THREE.BoxGeometry(5, 0.08, 4), mat('#2f6fd6'));
    matMesh.position.set(lb.x + lx * 2.4 + fx * 3, m.heightAt(lb.x + lx * 2.4 + fx * 3, lb.z + lz * 2.4 + fz * 3) + 0.05, lb.z + lz * 2.4 + fz * 3);
    matMesh.rotation.y = yaw;
    this.group.add(matMesh);
    this.liftLoad = { x: matMesh.position.x, z: matMesh.position.z };

    // chairs (instanced, looping)
    const chairParts = [
      vcolor(new THREE.CylinderGeometry(0.04, 0.04, 2.6, 4).translate(0, 1.3, 0), '#3a4152'),
      vcolor(new THREE.BoxGeometry(1.8, 0.1, 0.7).translate(0, 0, 0.15), '#2a2f3d'),
      vcolor(new THREE.BoxGeometry(1.8, 0.7, 0.08).translate(0, 0.38, -0.2), '#e63946'),
      vcolor(new THREE.CylinderGeometry(0.03, 0.03, 1.8, 4).rotateZ(Math.PI / 2).translate(0, 0.6, 0.55), '#3a4152'),
    ];
    const chairGeo = mergeGeometries(chairParts);
    const n = Math.max(12, Math.round((len * 2) / 34));
    const chairs = new THREE.InstancedMesh(chairGeo, vmat, n);
    chairs.castShadow = true;
    chairs.frustumCulled = false;
    this.group.add(chairs);
    const loopLen = 2;
    this.animated.push((dt, time) => {
      for (let i = 0; i < n; i++) {
        let s = ((time / 20) + i / n * loopLen) % loopLen; // 20s per side, matches ride time
        let up = s < 1;
        const tt = up ? s : 2 - s;
        const p = lift.at(tt);
        const side = up ? 1 : -1;
        tmpP.set(p.x + lx * 2.4 * side, p.y, p.z + lz * 2.4 * side);
        tmpQ.setFromAxisAngle(UP, yaw + (up ? Math.PI : 0));
        tmpS.set(1, 1, 1);
        tmpM.compose(tmpP, tmpQ, tmpS);
        chairs.setMatrixAt(i, tmpM);
      }
      chairs.instanceMatrix.needsUpdate = true;
    });
  }

  buildBuildings() {
    const m = this.m;
    const S = m.sites;
    const wood = mat('#8a5a3c'), woodDark = mat('#5f3c28'), roofRed = mat('#c0392b'), snow = mat('#f4f8fc');
    const windowMat = new THREE.MeshStandardMaterial({ color: '#ffcf7a', emissive: '#ffb347', emissiveIntensity: 0.6, flatShading: true });
    this.windowMat = windowMat;
    const cabin = (x, z, w, h, d, yaw, roofColor = roofRed, wallMat = wood) => {
      const g = new THREE.Group();
      const y = m.heightAt(x, z);
      const walls = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
      walls.position.y = h / 2 - 0.3;
      walls.castShadow = walls.receiveShadow = true;
      const roofGeo = new THREE.CylinderGeometry(0.01, 1, 1, 4, 1).rotateY(Math.PI / 4);
      const roof = new THREE.Mesh(roofGeo, roofColor);
      roof.scale.set(w * 0.8, h * 0.75, d * 0.8);
      roof.position.y = h - 0.3 + h * 0.37;
      roof.castShadow = true;
      const roofSnow = new THREE.Mesh(roofGeo, snow);
      roofSnow.scale.set(w * 0.76, h * 0.62, d * 0.76);
      roofSnow.position.y = h - 0.3 + h * 0.47;
      g.add(walls, roof, roofSnow);
      for (let i = 0; i < Math.max(1, Math.floor(w / 4)); i++) {
        const win = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, 0.12), windowMat);
        win.position.set(-w / 2 + 2 + i * 4, h * 0.5, d / 2 + 0.02);
        g.add(win);
      }
      const door = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.1, 0.12), woodDark);
      door.position.set(w / 2 - 1.5, 0.75, d / 2 + 0.03);
      g.add(door);
      g.position.set(x, y, z);
      g.rotation.y = yaw;
      this.group.add(g);
      return g;
    };
    // patrol hut on the summit
    const hut = cabin(S.hut.x, S.hut.z, 11, 4.2, 8, 0);
    const flagPole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 9, 5), mat('#c9ced8'));
    flagPole.position.set(6.5, 4.2, 4.5);
    hut.add(flagPole);
    const flag = this.makeFlag('#e63946', true);
    flag.position.set(6.5, 7.6, 4.5);
    hut.add(flag);
    // sign over the door
    hut.add(this.signMesh('SKI PATROL', '#e63946', 5, 1.1, [0, 3.4, 4.08]));

    // sled rack
    const rack = new THREE.Group();
    const ry = m.heightAt(S.rack.x, S.rack.z);
    for (const sx of [-4, 4]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.25, 1.6, 0.25), woodDark);
      post.position.set(sx, 0.8, -1.8);
      rack.add(post);
    }
    const bar = new THREE.Mesh(new THREE.BoxGeometry(8.4, 0.25, 0.25), woodDark);
    bar.position.set(0, 1.5, -1.8);
    rack.add(bar, this.signMesh('TOBOGGANS', '#ff5a2c', 4, 0.8, [0, 2.3, -1.8]));
    rack.position.set(S.rack.x, ry, S.rack.z);
    this.group.add(rack);

    // charge crate
    const crate = new THREE.Group();
    const box = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.1, 1.2), mat('#e67e22'));
    box.position.y = 0.45;
    box.castShadow = true;
    for (const yy of [0.2, 0.75]) {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.82, 0.12, 1.22), mat('#22242c'));
      stripe.position.y = yy;
      crate.add(stripe);
    }
    crate.add(box, this.signMesh('AVALANCHE CHARGES', '#22242c', 4.4, 0.8, [0, 2.0, 0]));
    const cpole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.6, 4), woodDark);
    cpole.position.set(0, 1.0, -0.1);
    crate.add(cpole);
    crate.position.set(S.crate.x, m.heightAt(S.crate.x, S.crate.z), S.crate.z);
    this.group.add(crate);

    // base lodge
    const lodge = cabin(S.lodge.x, S.lodge.z, 22, 7, 14, 0.15, mat('#3d2f2a'), mat('#a8754f'));
    lodge.add(this.signMesh('BASE LODGE · KAFFEE & KUCHEN', '#2e9e5b', 12, 1.4, [0, 6.2, 7.1]));
    const chimney = new THREE.Mesh(new THREE.BoxGeometry(1.4, 4, 1.4), mat('#7d7f86'));
    chimney.position.set(-6, 10, -2);
    lodge.add(chimney);
    this.smokeSources.push({ obj: chimney, offset: new THREE.Vector3(0, 2.2, 0), color: '#d8dde6', rate: 3 });

    // clinic + helipad
    const clinic = new THREE.Group();
    const cy = m.heightAt(S.clinic.x - 10, S.clinic.z + 8);
    const cw = new THREE.Mesh(new THREE.BoxGeometry(12, 4.4, 8), mat('#f6f9fd'));
    cw.position.y = 2;
    cw.castShadow = cw.receiveShadow = true;
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(12.05, 0.6, 8.05), mat('#e63946'));
    stripe.position.y = 3.2;
    const crossMat = new THREE.MeshStandardMaterial({ color: '#ff3b47', emissive: '#ff1f2d', emissiveIntensity: 1.2 });
    const cxv = new THREE.Mesh(new THREE.BoxGeometry(0.8, 2.4, 0.3), crossMat);
    cxv.position.set(0, 6, 0);
    const cxh = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.8, 0.3), crossMat);
    cxh.position.set(0, 6, 0);
    const door = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.6, 0.2), mat('#9fd4ff', { roughness: 0.15 }));
    door.position.set(0, 1.1, 4.05);
    clinic.add(cw, stripe, cxv, cxh, door, this.signMesh('FIRST AID', '#e63946', 5, 1, [0, 3.95, 4.08]));
    clinic.position.set(S.clinic.x - 10, cy, S.clinic.z + 8);
    clinic.rotation.y = 0.5;
    this.group.add(clinic);
    // drop-off zone ring
    const ring = new THREE.Mesh(new THREE.RingGeometry(S.clinicRadius - 0.8, S.clinicRadius, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#e63946', transparent: true, opacity: 0.55, depthWrite: false }));
    ring.position.set(S.clinic.x, m.heightAt(S.clinic.x, S.clinic.z) + 0.15, S.clinic.z);
    this.group.add(ring);
    this.clinicRing = ring;
    const pad = new THREE.Mesh(new THREE.CircleGeometry(5, 24).rotateX(-Math.PI / 2), mat('#3a4152'));
    const padX = S.clinic.x + 22, padZ = S.clinic.z + 10;
    pad.position.set(padX, m.heightAt(padX, padZ) + 0.1, padZ);
    const H = this.signMesh('H', '#3a4152', 3, 3, [0, 0, 0], '#ffffff');
    H.rotation.x = -Math.PI / 2;
    H.position.copy(pad.position).add(new THREE.Vector3(0, 0.03, 0));
    this.group.add(pad, H);
    this.helipad = pad.position.clone();

    // village in the valley
    const r = mulberry32(hashString('village' + m.seed));
    for (let i = 0; i < 22; i++) {
      const x = (r() - 0.5) * 520, z = 1010 + r() * 260;
      const hh = cabin(x, z, 6 + r() * 6, 3.5 + r() * 2, 6 + r() * 4, r() * 6, mat(['#c0392b', '#3d2f2a', '#2f6fd6', '#5f3c28'][i % 4]), mat(['#e8dcc4', '#a8754f', '#f0e6d6'][i % 3]));
      hh.position.y = 9;
    }
    // piste signpost at the summit
    const post = new THREE.Group();
    const sp = m.sites.spawn;
    const ppole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 3.6, 5), woodDark);
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
  }

  signMesh(text, bg, w, h, at, fg = '#ffffff') {
    const cv = document.createElement('canvas');
    const px = 64;
    cv.width = Math.min(2048, Math.round(w * px)); cv.height = Math.round(h * px);
    const ctx = cv.getContext('2d');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 5;
    ctx.strokeRect(6, 6, cv.width - 12, cv.height - 12);
    ctx.fillStyle = fg;
    ctx.font = `${Math.round(cv.height * 0.55)}px "Lilita One", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, cv.width / 2, cv.height / 2 + 2, cv.width - 20);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.08), [mat(bg), mat(bg), mat(bg), mat(bg), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 }), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 })]);
    m.position.set(at[0], at[1], at[2]);
    m.castShadow = true;
    return m;
  }

  makeFlag(color, cross) {
    const g = new THREE.BufferGeometry();
    const W = 2.4, Hh = 1.5, seg = 8;
    const verts = [], cols = [];
    const c = new THREE.Color(color), w = new THREE.Color('#ffffff');
    for (let i = 0; i < seg; i++) {
      const x0 = (i / seg) * W, x1 = ((i + 1) / seg) * W;
      for (const tri of [[x0, 0, x1, 0, x1, Hh], [x0, 0, x1, Hh, x0, Hh]]) {
        for (let k = 0; k < 3; k++) {
          const x = tri[k * 2], y = tri[k * 2 + 1];
          verts.push(x, y - Hh / 2, 0);
          const inCross = cross && ((Math.abs(x - W * 0.5) < 0.18 && Math.abs(y - Hh / 2) < 0.5) || (Math.abs(y - Hh / 2) < 0.18 && Math.abs(x - W * 0.5) < 0.5));
          const cc = inCross ? w : c;
          cols.push(cc.r, cc.g, cc.b);
        }
      }
    }
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    g.computeVertexNormals();
    const base = g.attributes.position.array.slice();
    const flag = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide, roughness: 0.8 }));
    flag.castShadow = true;
    this.animated.push((dt, time) => {
      const a = g.attributes.position.array;
      for (let i = 0; i < a.length; i += 3) {
        const x = base[i];
        a[i + 2] = Math.sin(time * 5 + x * 2.2) * 0.18 * (x / W);
      }
      g.attributes.position.needsUpdate = true;
      g.computeVertexNormals();
    });
    return flag;
  }

  buildMarkers() {
    const m = this.m;
    // piste edge poles
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
      vcolor(new THREE.CylinderGeometry(0.06, 0.06, 1.8, 4).translate(0, 0.9, 0), '#ffffff'),
      vcolor(new THREE.CylinderGeometry(0.2, 0.2, 0.12, 8).rotateX(Math.PI / 2).translate(0, 1.8, 0), '#ffffff'),
    ]);
    for (const k of Object.keys(byColor)) {
      const { color, list } = byColor[k];
      const im = new THREE.InstancedMesh(poleGeo, new THREE.MeshStandardMaterial({ color, flatShading: true }), list.length);
      list.forEach(([x, y, z], i) => { tmpM.makeTranslation(x, y, z); im.setMatrixAt(i, tmpM); });
      im.castShadow = true;
      this.group.add(im);
    }
    // avalanche zones: striped poles, warning sign and a cornice
    for (const a of m.avalanches) {
      const g = new THREE.Group();
      const rel = a.release;
      const p0 = a.path[0], p1 = a.path[Math.min(3, a.path.length - 1)];
      const dl = Math.hypot(p1.x - p0.x, p1.z - p0.z) || 1;
      const fx = (p1.x - p0.x) / dl, fz = (p1.z - p0.z) / dl;
      for (let i = -2; i <= 2; i++) {
        const x = rel.x - fz * i * a.width * 0.22 - fx * 18, z = rel.z + fx * i * a.width * 0.22 - fz * 18;
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.2, 4), mat(i % 2 ? '#1b1f2a' : '#f39c12'));
        pole.position.set(x, m.heightAt(x, z) + 1.1, z);
        g.add(pole);
      }
      const sx = rel.x - fx * 22 + fz * a.width * 0.6, sz = rel.z - fz * 22 - fx * a.width * 0.6;
      const sign = this.signMesh('⚠ AVALANCHE ZONE', '#f39c12', 4.6, 0.9, [sx, m.heightAt(sx, sz) + 2.2, sz], '#1b1f2a');
      sign.rotation.y = Math.atan2(fx, fz) + Math.PI;
      g.add(sign);
      // cornice: lumpy snow lip on the ridge above the slide
      const corn = new THREE.Group();
      for (let i = -3; i <= 3; i++) {
        const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(2.6 + Math.abs(i % 2) * 0.6, 0), mat('#f7fbff'));
        const x = rel.x - fz * i * 4.2 - fx * 12, z = rel.z + fx * i * 4.2 - fz * 12;
        blob.position.set(x, m.heightAt(x, z) + 1.2, z);
        blob.scale.set(1.3, 0.75, 1.0);
        blob.rotation.y = i;
        blob.castShadow = true;
        corn.add(blob);
      }
      g.add(corn);
      this.cornices[a.id] = corn;
      this.group.add(g);
    }
  }

  buildBackdrop() {
    const m = this.m;
    const r = mulberry32(hashString('peaks' + m.seed));
    const noise = makeNoise2D(hashString('range' + m.seed));
    const W = WORLD;
    // a seamless mountain range around the play area: heights blend from the terrain edge into ridged peaks
    const cell = 40, x0 = -1800, x1 = 1800, z0 = -1400, z1 = 2400;
    const nxv = Math.round((x1 - x0) / cell) + 1, nzv = Math.round((z1 - z0) / cell) + 1;
    const hgt = new Float32Array(nxv * nzv);
    const inside = new Uint8Array(nxv * nzv);
    for (let iz = 0; iz < nzv; iz++) {
      for (let ix = 0; ix < nxv; ix++) {
        const x = x0 + ix * cell, z = z0 + iz * cell;
        const cx = Math.max(W.minX, Math.min(W.maxX, x)), cz = Math.max(W.minZ, Math.min(W.maxZ, z));
        const d = Math.hypot(x - cx, z - cz);
        inside[iz * nxv + ix] = d < 1 ? 1 : 0;
        const edge = m.terrainAt(cx, cz);
        let ridged = 0, amp = 1, f = 0.0021, norm = 0;
        for (let o = 0; o < 4; o++) { const n = 1 - Math.abs(noise(x * f + o * 17, z * f)); ridged += n * n * amp; norm += amp; amp *= 0.5; f *= 2.1; }
        ridged /= norm;
        let peak = 140 + ridged * 520 + (z < 0 ? 140 * Math.min(1, -z / 600) : 0);
        // keep the valley below the base lodge open
        const valley = z > 940 ? 1 - Math.min(1, Math.max(0, (Math.abs(x) - 260 - (z - 940) * 0.35) / 380)) : 0;
        peak = peak * (1 - valley) + 10 * valley;
        const t = Math.min(1, d / 260);
        const k = t * t * (3 - 2 * t);
        hgt[iz * nxv + ix] = (edge - 12) * (1 - k) + peak * k * (1 - 0.35 * Math.min(1, Math.max(0, (d - 900) / 600)));
      }
    }
    const pos = [], col = [];
    const rock = new THREE.Color('#6f7689'), rock2 = new THREE.Color('#7f8699'), snow = new THREE.Color('#f2f6fc'), forest = new THREE.Color('#33503f');
    const c = new THREE.Color();
    const tri = (ax, ay, az, bx, by, bz, cx2, cy, cz) => {
      const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx2 - ax, vy = cy - ay, vz = cz - az;
      const ny = uz * vx - ux * vz;
      const l = Math.hypot(uy * vz - uz * vy, ny, ux * vy - uy * vx) || 1;
      const nyN = ny / l;
      const yAvg = (ay + by + cy) / 3;
      if (nyN < 0.55) c.copy(r() < 0.5 ? rock : rock2);
      else if (yAvg < 150 && nyN > 0.75) c.copy(forest).lerp(snow, 0.15 + r() * 0.15);
      else c.copy(snow).multiplyScalar(0.93 + r() * 0.07);
      pos.push(ax, ay, az, bx, by, bz, cx2, cy, cz);
      for (let k = 0; k < 3; k++) col.push(c.r, c.g, c.b);
    };
    for (let iz = 0; iz < nzv - 1; iz++) {
      for (let ix = 0; ix < nxv - 1; ix++) {
        const i00 = iz * nxv + ix, i10 = i00 + 1, i01 = i00 + nxv, i11 = i01 + 1;
        if (inside[i00] && inside[i10] && inside[i01] && inside[i11]) continue;
        const xa = x0 + ix * cell, xb = xa + cell, za = z0 + iz * cell, zb = za + cell;
        tri(xa, hgt[i00], za, xb, hgt[i11], zb, xb, hgt[i10], za);
        tri(xa, hgt[i00], za, xa, hgt[i01], zb, xb, hgt[i11], zb);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    const range = new THREE.Mesh(g, vmat);
    range.receiveShadow = true;
    this.group.add(range);
    // low-poly clouds
    const cloudMat = new THREE.MeshStandardMaterial({ color: '#ffffff', flatShading: true, roughness: 1, emissive: '#ffffff', emissiveIntensity: 0.12 });
    this.clouds = new THREE.Group();
    for (let i = 0; i < 16; i++) {
      const c = new THREE.Group();
      const n = 4 + Math.floor(r() * 4);
      for (let k = 0; k < n; k++) {
        const b = new THREE.Mesh(new THREE.IcosahedronGeometry(14 + r() * 16, 0), cloudMat);
        b.position.set(k * 18 - n * 9, r() * 8, r() * 14);
        b.scale.y = 0.55;
        c.add(b);
      }
      c.position.set((r() - 0.5) * 1600, 380 + r() * 160, -300 + r() * 1700);
      c.userData.v = 2 + r() * 3;
      this.clouds.add(c);
    }
    this.group.add(this.clouds);
  }

  update(dt, time, tod) {
    for (const f of this.animated) f(dt, time);
    for (const c of this.clouds.children) {
      c.position.x += c.userData.v * dt;
      if (c.position.x > 900) c.position.x = -900;
    }
    if (this.windowMat) this.windowMat.emissiveIntensity = 0.4 + Math.max(0, tod - 0.6) * 4;
    if (this.clinicRing) this.clinicRing.material.opacity = 0.35 + Math.sin(time * 3) * 0.2;
  }

  setCornice(id, visible) { if (this.cornices[id]) this.cornices[id].visible = visible; }

  // Ray march against the heightfield (for pings and charge aiming)
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
      if (o.geometry) o.geometry.dispose();
    });
  }
}

export { distToPolyline };
