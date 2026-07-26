/* ============================================================================
 *  particles.js
 *  Gepooltes Partikelsystem. Alle Partikel liegen in einem festen Array;
 *  toter Platz wird durch Swap-Pop wiederverwendet – keine Allokationen
 *  im laufenden Spiel.
 * ==========================================================================*/
(function (global) {
  'use strict';

  const SNK = global.SNK || (global.SNK = {});
  const Utils = SNK.Utils;
  const TAU = Utils.TAU;

  /** Partikeltypen bestimmen das Zeichenverhalten. */
  const TYPE = { SPARK: 0, GLOW: 1, RING: 2, SHARD: 3 };

  class Particle {
    constructor() {
      this.x = 0; this.y = 0;
      this.vx = 0; this.vy = 0;
      this.life = 0; this.maxLife = 1;
      this.r = 2; this.r0 = 2;
      this.color = '#ffffff';
      this.drag = 2;
      this.type = TYPE.SPARK;
      this.spin = 0;
      this.grow = 0;
    }
  }

  class ParticleSystem {
    constructor(maxParticles) {
      this.max = maxParticles || 600;
      this.pool = new SNK.Pool(function () { return new Particle(); }, null, 128);
      this.active = [];
    }

    setMax(n) { this.max = n; }

    /** Freien Partikel holen oder – bei vollem System – null. */
    _acquire() {
      if (this.active.length >= this.max) return null;
      const p = this.pool.obtain();
      this.active.push(p);
      return p;
    }

    /* ------------------------------------------------------------- Emitter */

    /** Kleiner Funkenblitz beim Fressen. */
    eat(x, y, color, power) {
      const n = 3 + Math.round((power || 0) * 5);
      for (let i = 0; i < n; i++) {
        const p = this._acquire();
        if (!p) return;
        const a = Math.random() * TAU;
        const s = Utils.rand(30, 130);
        p.x = x; p.y = y;
        p.vx = Math.cos(a) * s; p.vy = Math.sin(a) * s;
        p.maxLife = p.life = Utils.rand(0.22, 0.48);
        p.r = p.r0 = Utils.rand(1.4, 3.4);
        p.color = color; p.drag = 3.6;
        p.type = TYPE.SPARK; p.grow = 0;
      }
    }

    /** Explosion beim Tod einer Schlange. */
    explosion(x, y, color, scale) {
      const s = scale || 1;

      // Druckwelle
      const ring = this._acquire();
      if (ring) {
        ring.x = x; ring.y = y; ring.vx = 0; ring.vy = 0;
        ring.maxLife = ring.life = 0.55;
        ring.r = ring.r0 = 8 * s;
        ring.grow = 320 * s;
        ring.color = color; ring.drag = 0;
        ring.type = TYPE.RING;
      }

      // Zentraler Blitz
      const flash = this._acquire();
      if (flash) {
        flash.x = x; flash.y = y; flash.vx = 0; flash.vy = 0;
        flash.maxLife = flash.life = 0.3;
        flash.r = flash.r0 = 34 * s;
        flash.grow = 60 * s;
        flash.color = '#ffffff'; flash.drag = 0;
        flash.type = TYPE.GLOW;
      }

      const n = Math.round(26 * s);
      for (let i = 0; i < n; i++) {
        const p = this._acquire();
        if (!p) return;
        const a = Math.random() * TAU;
        const sp = Utils.rand(60, 420) * s;
        p.x = x; p.y = y;
        p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp;
        p.maxLife = p.life = Utils.rand(0.4, 1.1);
        p.r = p.r0 = Utils.rand(2, 6) * s;
        p.color = Math.random() < 0.25 ? '#ffffff' : color;
        p.drag = Utils.rand(1.4, 2.8);
        p.type = Math.random() < 0.3 ? TYPE.GLOW : TYPE.SHARD;
        p.spin = Utils.rand(-8, 8);
        p.grow = 0;
      }
    }

    /** Boost-Schweif hinter dem Schwanz. */
    boostTrail(x, y, color, radius, dirX, dirY) {
      const p = this._acquire();
      if (!p) return;
      p.x = x + Utils.rand(-radius, radius) * 0.4;
      p.y = y + Utils.rand(-radius, radius) * 0.4;
      p.vx = dirX * Utils.rand(20, 70) + Utils.rand(-30, 30);
      p.vy = dirY * Utils.rand(20, 70) + Utils.rand(-30, 30);
      p.maxLife = p.life = Utils.rand(0.2, 0.42);
      p.r = p.r0 = radius * Utils.rand(0.25, 0.5);
      p.color = color;
      p.drag = 2.6;
      p.type = TYPE.GLOW;
      p.grow = 0;
    }

    /** Aufblitzen beim Spawn / bei Events. */
    burst(x, y, color, count, speed, size) {
      for (let i = 0; i < count; i++) {
        const p = this._acquire();
        if (!p) return;
        const a = Math.random() * TAU;
        const s = Utils.rand(speed * 0.3, speed);
        p.x = x; p.y = y;
        p.vx = Math.cos(a) * s; p.vy = Math.sin(a) * s;
        p.maxLife = p.life = Utils.rand(0.3, 0.8);
        p.r = p.r0 = Utils.rand(size * 0.4, size);
        p.color = color; p.drag = 2.2;
        p.type = TYPE.GLOW; p.grow = 0;
      }
    }

    /* -------------------------------------------------------------- Update */

    update(dt) {
      const a = this.active;
      for (let i = a.length - 1; i >= 0; i--) {
        const p = a[i];
        p.life -= dt;
        if (p.life <= 0) {
          a[i] = a[a.length - 1];
          a.pop();
          this.pool.release(p);
          continue;
        }
        const damp = Math.exp(-p.drag * dt);
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= damp;
        p.vy *= damp;
        if (p.grow !== 0) p.r += p.grow * dt;
      }
    }

    clear() {
      const a = this.active;
      for (let i = 0; i < a.length; i++) this.pool.release(a[i]);
      a.length = 0;
    }

    get count() { return this.active.length; }
  }

  SNK.ParticleSystem = ParticleSystem;
  SNK.PARTICLE_TYPE = TYPE;

})(typeof window !== 'undefined' ? window : this);
