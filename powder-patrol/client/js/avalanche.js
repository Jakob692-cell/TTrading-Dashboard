// Avalanche visuals: a rolling powder front following the slide path, then a debris field.
import * as THREE from 'three';
import { avalancheFront, pointAlong } from '/shared/mountain.js';

const blockGeo = new THREE.DodecahedronGeometry(1, 0);
const blockMat = new THREE.MeshStandardMaterial({ color: '#eef4fb', flatShading: true, roughness: 0.9 });
const tmp = new THREE.Object3D();

export class Slide {
  constructor(scene, mountain, zone, t0, effects) {
    this.scene = scene;
    this.m = mountain;
    this.a = mountain.avalanches[zone];
    this.zone = zone;
    this.t0 = t0;
    this.fx = effects;
    this.done = false;
    this.debrisAt = 0;
    this.maxDebris = 260;
    this.debris = new THREE.InstancedMesh(blockGeo, blockMat, this.maxDebris);
    this.debris.count = 0;
    this.debris.castShadow = true;
    this.debris.receiveShadow = true;
    this.debris.frustumCulled = false;
    scene.add(this.debris);
    // the rolling "wave" of big snow balls
    this.wave = new THREE.Group();
    for (let i = 0; i < 9; i++) {
      const b = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: '#ffffff', flatShading: true, roughness: 1, emissive: '#dfe9f6', emissiveIntensity: 0.3 }));
      b.castShadow = true;
      b.userData.off = (i / 8 - 0.5);
      this.wave.add(b);
    }
    scene.add(this.wave);
    this.caughtMe = false;
  }

  front(serverNow) { return avalancheFront(serverNow - this.t0); }

  update(dt, serverNow, time) {
    const a = this.a, m = this.m;
    const f = this.front(serverNow);
    const active = f < a.length + 30;
    this.wave.visible = active && f > 0;
    if (active && f > 0) {
      const p = pointAlong(a.path, Math.min(f, a.length));
      const lx = -p.dz, lz = p.dx;
      const speed = Math.min(26, 7 * (serverNow - this.t0));
      this.emitAcc = (this.emitAcc || 0) + dt * (90 + speed * 14);
      const n = Math.min(60, Math.floor(this.emitAcc));
      this.emitAcc -= n;
      for (let i = 0; i < n; i++) {
        const off = (Math.random() - 0.5) * a.width;
        const x = p.x + lx * off + p.dx * (Math.random() * 6 - 4), z = p.z + lz * off + p.dz * (Math.random() * 6 - 4);
        const y = m.heightAt(x, z);
        const s = 2 + Math.random() * 3.5 * (0.4 + speed / 26);
        this.fx.puff.emit(x, y + s * 0.6, z, p.dx * speed * 0.6 + (Math.random() - 0.5) * 4, 2 + Math.random() * 6, p.dz * speed * 0.6 + (Math.random() - 0.5) * 4, s, 1.8 + Math.random() * 1.6, '#ffffff');
      }
      for (const b of this.wave.children) {
        const off = b.userData.off * a.width * 0.9;
        const x = p.x + lx * off, z = p.z + lz * off;
        const wob = Math.sin(time * 9 + off) * 0.6;
        const s = (2.4 + Math.abs(Math.sin(off * 3 + time * 4)) * 1.6) * Math.min(1, f / 30 + 0.3);
        b.position.set(x, m.heightAt(x, z) + s * 0.7 + wob, z);
        b.scale.setScalar(s);
        b.rotation.x += dt * speed * 0.3;
      }
      // leave debris behind
      while (this.debrisAt < f - 8 && this.debrisAt < a.length && this.debris.count < this.maxDebris) {
        const q = pointAlong(a.path, this.debrisAt);
        const frac = this.debrisAt / a.length;
        const count = frac > 0.45 ? 4 : 1;
        for (let k = 0; k < count && this.debris.count < this.maxDebris; k++) {
          const off = (Math.random() - 0.5) * a.width * (0.5 + frac * 0.5);
          const x = q.x - q.dz * off, z = q.z + q.dx * off;
          const s = 0.5 + Math.random() * (frac > 0.6 ? 1.8 : 0.9);
          tmp.position.set(x, m.heightAt(x, z) + s * 0.2, z);
          tmp.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
          tmp.scale.set(s * 1.3, s * 0.7, s);
          tmp.updateMatrix();
          this.debris.setMatrixAt(this.debris.count++, tmp.matrix);
        }
        this.debrisAt += 3;
      }
      this.debris.instanceMatrix.needsUpdate = true;
    } else if (f > a.length + 30) {
      this.done = true;
    }
    return f;
  }

  // distance along/away from the path for "am I being caught?" checks
  dispose() {
    this.scene.remove(this.debris);
    this.scene.remove(this.wave);
  }
}
