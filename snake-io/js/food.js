/* ============================================================================
 *  food.js
 *  Nahrungsverwaltung.
 *
 *  Performance-Kern: Der Glow jeder Kugel wird EINMAL pro Farbe in ein
 *  Offscreen-Canvas gerendert. Im Spiel ist jede Kugel dann nur noch ein
 *  drawImage() – damit sind >1000 leuchtende Punkte problemlos moeglich.
 *  Zusaetzlich liegt alles in einem Gitter (IndexedHash), sodass Renderer
 *  und Kollision nur die relevanten Zellen anfassen.
 * ==========================================================================*/
(function (global) {
  'use strict';

  const SNK = global.SNK || (global.SNK = {});
  const Utils = SNK.Utils;

  /** Neon-Palette der Nahrungskugeln. */
  const FOOD_COLORS = [
    '#22e7ff', '#2ff3c8', '#a86bff', '#ff5bd1', '#4d7cff', '#a6ff4d',
    '#ffd84d', '#ff9b3d', '#ff6b8a', '#5effc2', '#7c5cff', '#ff4d5e',
    '#6fd6ff', '#ff8fb1', '#3ff0e0', '#d4ff3f', '#ffb84d', '#8affd6'
  ];

  /** Groessenklassen: [Radius, Naehrwert, Gewichtung]. */
  const TIERS = [
    { r: 4.6, value: 1.0, w: 0.60 },
    { r: 7.0, value: 2.4, w: 0.26 },
    { r: 10.5, value: 6.0, w: 0.11 },
    { r: 15.5, value: 18.0, w: 0.03 }   // Gold-Kugel
  ];

  /** Aufsummierte Gewichte fuer die Ziehung. */
  const TIER_CUM = (function () {
    const out = [];
    let s = 0;
    for (let i = 0; i < TIERS.length; i++) { s += TIERS[i].w; out.push(s); }
    for (let i = 0; i < out.length; i++) out[i] /= s;
    return out;
  })();

  /** Aufloesung des Sprites (Pixel) und Glow-Ausdehnung (x Radius). */
  const SPRITE_PX = 96;
  const GLOW_FACTOR = 2.6;

  class Food {
    constructor() {
      this.x = 0; this.y = 0;
      this.r = 4.6;
      this.value = 1;
      this.ci = 0;
      this.color = FOOD_COLORS[0];
      this.phase = 0;
      this.alive = false;
      this._hk = -1;
      // Nur fuer Todes-Nahrung: kurze Ausbreitungsbewegung.
      this.vx = 0; this.vy = 0; this.settle = 0;
    }
  }

  class FoodManager {
    constructor(game) {
      this.game = game;
      this.grid = new SNK.IndexedHash(150);
      this.pool = new SNK.Pool(function () { return new Food(); }, null, 512);
      this.list = [];                // alle lebenden Kugeln (fuer Update/Minimap)
      this.sprites = [];             // pro Farbe ein Offscreen-Canvas
      this.spritesFlat = [];         // Variante ohne breiten Glow (Qualitaet niedrig)
      this._q = [];                  // wiederverwendeter Abfragepuffer
      this.valueMultiplier = 1;      // wird von Events (Doppelte Nahrung) genutzt
      this.buildSprites();
    }

    /* -------------------------------------------------------------- Sprites */

    buildSprites() {
      this.sprites.length = 0;
      this.spritesFlat.length = 0;
      for (let i = 0; i < FOOD_COLORS.length; i++) {
        this.sprites.push(this._makeSprite(FOOD_COLORS[i], true));
        this.spritesFlat.push(this._makeSprite(FOOD_COLORS[i], false));
      }
    }

    _makeSprite(color, withGlow) {
      const size = SPRITE_PX;
      const c = global.document.createElement('canvas');
      c.width = c.height = size;
      const g = c.getContext('2d');
      const mid = size / 2;
      // Kernradius im Sprite: der Rest ist Glow-Reserve.
      const core = mid / GLOW_FACTOR;

      if (withGlow) {
        const grad = g.createRadialGradient(mid, mid, 0, mid, mid, mid);
        grad.addColorStop(0.00, '#ffffff');
        grad.addColorStop(0.16, Utils.tint(color, 0.55));
        grad.addColorStop(0.34, color);
        grad.addColorStop(0.42, Utils.rgba(color, 0.55));
        grad.addColorStop(0.68, Utils.rgba(color, 0.16));
        grad.addColorStop(1.00, Utils.rgba(color, 0));
        g.fillStyle = grad;
        g.fillRect(0, 0, size, size);
      } else {
        const grad = g.createRadialGradient(mid, mid, 0, mid, mid, core * 1.5);
        grad.addColorStop(0.0, '#ffffff');
        grad.addColorStop(0.45, color);
        grad.addColorStop(1.0, Utils.rgba(color, 0));
        g.fillStyle = grad;
        g.beginPath();
        g.arc(mid, mid, core * 1.5, 0, Utils.TAU);
        g.fill();
      }
      return c;
    }

    /* --------------------------------------------------------------- Spawn */

    /** Zufaellige Groessenklasse ziehen. */
    _randomTier() {
      const u = Math.random();
      for (let i = 0; i < TIER_CUM.length; i++) {
        if (u <= TIER_CUM[i]) return TIERS[i];
      }
      return TIERS[0];
    }

    /**
     * Neue Kugel erzeugen.
     * @param opts {r, value, colorIndex, vx, vy}
     */
    spawn(x, y, opts) {
      const f = this.pool.obtain();
      f.x = x; f.y = y;

      if (opts && opts.r !== undefined) {
        f.r = opts.r;
        f.value = opts.value !== undefined ? opts.value : 1;
      } else {
        const t = this._randomTier();
        f.r = t.r * Utils.rand(0.9, 1.12);
        f.value = t.value;
      }
      f.value *= this.valueMultiplier;
      f.ci = (opts && opts.colorIndex !== undefined)
        ? opts.colorIndex % FOOD_COLORS.length
        : (Math.random() * FOOD_COLORS.length) | 0;
      f.color = FOOD_COLORS[f.ci];
      f.phase = Math.random() * Utils.TAU;
      f.vx = (opts && opts.vx) || 0;
      f.vy = (opts && opts.vy) || 0;
      f.settle = (f.vx !== 0 || f.vy !== 0) ? 0.7 : 0;
      f.alive = true;

      this.list.push(f);
      this.grid.add(f);
      return f;
    }

    /** Kugel entfernen und in den Pool zuruecklegen. */
    remove(food) {
      if (!food.alive) return;
      food.alive = false;
      this.grid.remove(food);
      const i = this.list.indexOf(food);
      if (i >= 0) {
        this.list[i] = this.list[this.list.length - 1];
        this.list.pop();
      }
      this.pool.release(food);
    }

    /** Zufaellige Position innerhalb der Karte (mit Rand-Abstand). */
    randomPoint(out) {
      const w = this.game.world;
      out.x = Utils.rand(w.pad, w.width - w.pad);
      out.y = Utils.rand(w.pad, w.height - w.pad);
      return out;
    }

    /** Auf Zielmenge auffuellen (gestaffelt, damit kein Ruckler entsteht). */
    refill(target, maxPerCall) {
      let added = 0;
      const limit = maxPerCall === undefined ? 40 : maxPerCall;
      const p = { x: 0, y: 0 };
      while (this.list.length < target && added < limit) {
        this.randomPoint(p);
        this.spawn(p.x, p.y, null);
        added++;
      }
      return added;
    }

    /** Sofort komplett fuellen (Rundenstart). */
    fill(target) {
      const p = { x: 0, y: 0 };
      while (this.list.length < target) {
        this.randomPoint(p);
        this.spawn(p.x, p.y, null);
      }
    }

    /** Kugelregen als Event (leichte Streuung um Zufallszentren). */
    rain(count) {
      const w = this.game.world;
      let clusters = Math.max(1, Math.round(count / 26));
      let left = count;
      for (let c = 0; c < clusters && left > 0; c++) {
        const cx = Utils.rand(w.pad, w.width - w.pad);
        const cy = Utils.rand(w.pad, w.height - w.pad);
        const n = Math.min(left, Utils.randInt(14, 34));
        for (let i = 0; i < n; i++) {
          const a = Math.random() * Utils.TAU;
          const d = Math.sqrt(Math.random()) * 260;
          this.spawn(
            Utils.clamp(cx + Math.cos(a) * d, w.pad, w.width - w.pad),
            Utils.clamp(cy + Math.sin(a) * d, w.pad, w.height - w.pad),
            null
          );
        }
        left -= n;
      }
    }

    /** Gold-Kugeln als Event. */
    goldRush(count) {
      const w = this.game.world;
      for (let i = 0; i < count; i++) {
        this.spawn(
          Utils.rand(w.pad, w.width - w.pad),
          Utils.rand(w.pad, w.height - w.pad),
          { r: Utils.rand(15, 19), value: 26, colorIndex: 6 }
        );
      }
    }

    /**
     * Gestorbene Schlange in Nahrung verwandeln.
     * Die Anzahl der Kugeln ist begrenzt – bei riesigen Schlangen werden
     * stattdessen wertvollere Kugeln erzeugt (Performance-Schutz).
     */
    scatterFromSnake(snake) {
      const nodes = snake.nodes;
      const n = snake.liveNodes;
      if (n < 1) return;

      // Etwas weniger als die Masse des Opfers: bremst das Aufschaukeln
      // der Rangliste, ohne den Kill-Anreiz zu nehmen.
      const totalValue = Math.max(4, snake.mass * 0.62);
      const orbCount = Utils.clamp(Math.round(n / 2.6), 6, 110);
      const perOrb = totalValue / orbCount;
      const r = Utils.clamp(4.4 + Math.sqrt(perOrb) * 2.3, 4.6, 21);
      const w = this.game.world;
      const step = n / orbCount;
      const ci = snake.foodColorIndex;

      for (let i = 0; i < orbCount; i++) {
        const node = nodes[Math.min(n - 1, Math.floor(i * step))];
        const a = Math.random() * Utils.TAU;
        const jitter = snake.radius * 0.5;
        const sp = Utils.rand(20, 90);
        this.spawn(
          Utils.clamp(node.x + Math.cos(a) * jitter, w.pad * 0.5, w.width - w.pad * 0.5),
          Utils.clamp(node.y + Math.sin(a) * jitter, w.pad * 0.5, w.height - w.pad * 0.5),
          {
            r: r * Utils.rand(0.85, 1.15),
            value: perOrb,
            colorIndex: (Math.random() < 0.75) ? ci : undefined,
            vx: Math.cos(a) * sp,
            vy: Math.sin(a) * sp
          }
        );
      }
    }

    /* -------------------------------------------------------------- Update */

    update(dt, time) {
      const list = this.list;
      // Nur die frisch verstreuten Kugeln brauchen Bewegung.
      for (let i = 0; i < list.length; i++) {
        const f = list[i];
        if (f.settle > 0) {
          f.settle -= dt;
          const damp = Math.exp(-3.4 * dt);
          f.x += f.vx * dt;
          f.y += f.vy * dt;
          f.vx *= damp; f.vy *= damp;
          // Gitterzelle kann sich aendern -> neu einsortieren.
          this.grid.remove(f);
          this.grid.add(f);
          if (f.settle <= 0) { f.vx = 0; f.vy = 0; }
        }
      }
    }

    /** Kugeln im Umkreis (wiederverwendeter Puffer). */
    queryNear(x, y, r) {
      return this.grid.query(x, y, r, this._q);
    }

    /** Kugeln in einem Rechteck (fuer den Renderer). */
    queryRect(x0, y0, x1, y1, out) {
      return this.grid.queryRect(x0, y0, x1, y1, out);
    }

    reset() {
      const list = this.list;
      for (let i = 0; i < list.length; i++) {
        list[i].alive = false;
        this.pool.release(list[i]);
      }
      list.length = 0;
      this.grid.clear();
      this.valueMultiplier = 1;
    }

    get count() { return this.list.length; }
  }

  SNK.FoodManager = FoodManager;
  SNK.FOOD_COLORS = FOOD_COLORS;
  SNK.FOOD_GLOW_FACTOR = GLOW_FACTOR;

})(typeof window !== 'undefined' ? window : this);
