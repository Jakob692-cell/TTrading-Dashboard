// Low-poly particle systems (instanced, scale-faded), ski trails and snowfall.
import * as THREE from 'three';

const dummy = new THREE.Object3D();

export class Particles {
  constructor(scene, { capacity = 500, geometry, material, gravity = -9, drag = 0.5, grow = 0, shadows = false }) {
    this.cap = capacity;
    this.gravity = gravity;
    this.drag = drag;
    this.grow = grow;
    this.mesh = new THREE.InstancedMesh(geometry, material, capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = shadows;
    this.colors = new Float32Array(capacity * 3).fill(1);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(this.colors, 3);
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.p = new Float32Array(capacity * 3);
    this.v = new Float32Array(capacity * 3);
    this.life = new Float32Array(capacity);
    this.max = new Float32Array(capacity);
    this.size = new Float32Array(capacity);
    this.rot = new Float32Array(capacity);
    this.n = 0;
    scene.add(this.mesh);
  }

  emit(x, y, z, vx, vy, vz, size, life, color) {
    let i;
    if (this.n < this.cap) i = this.n++;
    else i = Math.floor(Math.random() * this.cap);
    this.p[i * 3] = x; this.p[i * 3 + 1] = y; this.p[i * 3 + 2] = z;
    this.v[i * 3] = vx; this.v[i * 3 + 1] = vy; this.v[i * 3 + 2] = vz;
    this.life[i] = 0; this.max[i] = life; this.size[i] = size; this.rot[i] = Math.random() * 6;
    const c = color instanceof THREE.Color ? color : _c.set(color);
    this.colors[i * 3] = c.r; this.colors[i * 3 + 1] = c.g; this.colors[i * 3 + 2] = c.b;
  }

  update(dt) {
    const damp = Math.exp(-this.drag * dt);
    let i = 0;
    while (i < this.n) {
      this.life[i] += dt;
      if (this.life[i] >= this.max[i]) {
        // swap-remove
        const last = --this.n;
        if (i !== last) {
          for (let k = 0; k < 3; k++) {
            this.p[i * 3 + k] = this.p[last * 3 + k];
            this.v[i * 3 + k] = this.v[last * 3 + k];
            this.colors[i * 3 + k] = this.colors[last * 3 + k];
          }
          this.life[i] = this.life[last]; this.max[i] = this.max[last]; this.size[i] = this.size[last]; this.rot[i] = this.rot[last];
        }
        continue;
      }
      this.v[i * 3 + 1] += this.gravity * dt;
      this.v[i * 3] *= damp; this.v[i * 3 + 1] *= damp; this.v[i * 3 + 2] *= damp;
      this.p[i * 3] += this.v[i * 3] * dt; this.p[i * 3 + 1] += this.v[i * 3 + 1] * dt; this.p[i * 3 + 2] += this.v[i * 3 + 2] * dt;
      const t = this.life[i] / this.max[i];
      const s = this.size[i] * (1 + this.grow * t) * (t < 0.15 ? t / 0.15 : 1 - Math.pow((t - 0.15) / 0.85, 2));
      dummy.position.set(this.p[i * 3], this.p[i * 3 + 1], this.p[i * 3 + 2]);
      dummy.rotation.set(this.rot[i] + t * 2, this.rot[i] * 1.3, 0);
      dummy.scale.setScalar(Math.max(0.0001, s));
      dummy.updateMatrix();
      this.mesh.setMatrixAt(i, dummy.matrix);
      i++;
    }
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
  }

  clear() { this.n = 0; this.mesh.count = 0; }
}
const _c = new THREE.Color();

export class Effects {
  constructor(scene) {
    this.scene = scene;
    const ico = new THREE.IcosahedronGeometry(1, 0);
    this.spray = new Particles(scene, {
      capacity: 900, geometry: ico, gravity: -12, drag: 1.6,
      material: new THREE.MeshStandardMaterial({ color: '#ffffff', flatShading: true, roughness: 1, emissive: '#cfe0f5', emissiveIntensity: 0.25 }),
    });
    this.puff = new Particles(scene, {
      capacity: 1400, geometry: ico, gravity: 0.6, drag: 0.9, grow: 1.6,
      material: new THREE.MeshStandardMaterial({ color: '#ffffff', flatShading: true, roughness: 1, emissive: '#dfe9f6', emissiveIntensity: 0.35 }),
    });
    this.smoke = new Particles(scene, {
      capacity: 900, geometry: ico, gravity: 2.2, drag: 0.4, grow: 2.2,
      material: new THREE.MeshStandardMaterial({ color: '#ffffff', flatShading: true, roughness: 1, emissive: '#ff5a5a', emissiveIntensity: 0.25 }),
    });
    this.fire = new Particles(scene, {
      capacity: 300, geometry: ico, gravity: 3, drag: 2.5, grow: 1.2,
      material: new THREE.MeshBasicMaterial({ color: '#ffffff' }),
    });
    this.trails = new Trails(scene);
    this.snow = new Snowfall(scene);
  }

  burst(x, y, z, n, speed, size, color = '#ffffff', up = 3) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * speed;
      this.spray.emit(x, y, z, Math.cos(a) * r, up + Math.random() * up, Math.sin(a) * r, size * (0.5 + Math.random()), 0.5 + Math.random() * 0.6, color);
    }
  }

  explosion(x, y, z) {
    const hot = new THREE.Color(6, 3, 0.8), warm = new THREE.Color(4, 1.4, 0.3);
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2, e = Math.random() * 1.2, s = 6 + Math.random() * 10;
      this.fire.emit(x, y + 0.5, z, Math.cos(a) * Math.cos(e) * s, Math.sin(e) * s + 2, Math.sin(a) * Math.cos(e) * s, 0.8 + Math.random() * 1.2, 0.35 + Math.random() * 0.3, i % 2 ? hot : warm);
    }
    for (let i = 0; i < 50; i++) {
      const a = Math.random() * Math.PI * 2, s = 3 + Math.random() * 9;
      this.puff.emit(x, y + 1, z, Math.cos(a) * s, 2 + Math.random() * 8, Math.sin(a) * s, 1.4 + Math.random() * 1.8, 1.4 + Math.random() * 1.6, i % 3 ? '#ffffff' : '#c7cbd3');
    }
    this.burst(x, y, z, 60, 14, 0.35, '#ffffff', 8);
  }

  update(dt, camPos, weather) {
    this.spray.update(dt);
    this.puff.update(dt);
    this.smoke.update(dt);
    this.fire.update(dt);
    this.snow.update(dt, camPos, weather);
  }

  clear() { this.spray.clear(); this.puff.clear(); this.smoke.clear(); this.fire.clear(); this.trails.clear(); }
}

// Ski tracks: ring buffer of thin quads laid on the snow.
class Trails {
  constructor(scene) {
    this.cap = 9000;
    this.pos = new Float32Array(this.cap * 6 * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    this.geo = g;
    this.mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: '#c9d7ea', roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
    scene.add(this.mesh);
    this.head = 0;
    this.used = 0;
    this.last = new Map();
  }
  // add a segment for skier `id` (one ski line) between last point and (x,y,z)
  add(id, x, y, z, width = 0.09) {
    const prev = this.last.get(id);
    this.last.set(id, { x, y, z });
    if (!prev) return;
    const dx = x - prev.x, dz = z - prev.z;
    const l = Math.hypot(dx, dz);
    if (l < 0.05 || l > 3) return;
    const nx = -dz / l * width, nz = dx / l * width;
    const i = this.head * 18;
    const a = this.pos;
    const y0 = prev.y + 0.04, y1 = y + 0.04;
    a.set([prev.x - nx, y0, prev.z - nz, x - nx, y1, z - nz, x + nx, y1, z + nz, prev.x - nx, y0, prev.z - nz, x + nx, y1, z + nz, prev.x + nx, y0, prev.z + nz], i);
    this.head = (this.head + 1) % this.cap;
    this.used = Math.min(this.used + 1, this.cap);
    this.geo.setDrawRange(0, this.used * 6);
    this.geo.attributes.position.needsUpdate = true;
  }
  cut(id) { this.last.delete(id); }
  clear() { this.used = 0; this.head = 0; this.last.clear(); this.geo.setDrawRange(0, 0); }
}

class Snowfall {
  constructor(scene) {
    this.n = 2600;
    this.box = 60;
    const pos = new Float32Array(this.n * 3);
    for (let i = 0; i < this.n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * this.box;
      pos[i * 3 + 1] = Math.random() * this.box * 0.6;
      pos[i * 3 + 2] = (Math.random() - 0.5) * this.box;
    }
    this.offsets = pos;
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(pos.slice(), 3).setUsage(THREE.DynamicDrawUsage));
    this.points = new THREE.Points(this.geo, new THREE.PointsMaterial({ color: '#ffffff', size: 0.11, transparent: true, opacity: 0.9, depthWrite: false }));
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.t = 0;
  }
  update(dt, cam, weather) {
    this.t += dt;
    const a = this.geo.attributes.position.array;
    const o = this.offsets;
    const visible = Math.floor(this.n * Math.min(1, 0.15 + weather));
    const B = this.box, H = B * 0.6;
    const wind = 2 + weather * 6;
    for (let i = 0; i < visible; i++) {
      o[i * 3 + 1] -= dt * (1.4 + (i % 7) * 0.15);
      o[i * 3] += dt * (wind * 0.3 + Math.sin(this.t + i) * 0.3);
      if (o[i * 3 + 1] < 0) o[i * 3 + 1] += H;
      const wx = ((o[i * 3] - cam.x) % B + B * 1.5) % B - B / 2;
      const wz = ((o[i * 3 + 2] - cam.z) % B + B * 1.5) % B - B / 2;
      a[i * 3] = cam.x + wx;
      a[i * 3 + 1] = cam.y - H * 0.4 + o[i * 3 + 1];
      a[i * 3 + 2] = cam.z + wz;
    }
    this.geo.setDrawRange(0, visible);
    this.geo.attributes.position.needsUpdate = true;
  }
}
