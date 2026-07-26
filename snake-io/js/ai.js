/* ============================================================================
 *  ai.js
 *  Steuerung der Gegner-Schlangen.
 *
 *  Verhalten entsteht aus gewichteten Richtungsvektoren (Steering):
 *    Wandern  – ruhige Grundbewegung
 *    Fressen  – naechstliegende, lohnende Nahrung ansteuern
 *    Jagen    – kleinere Schlangen abschneiden
 *    Fluechten – vor groesseren Schlangen ausweichen
 *    Weichen  – fremden Koerpern und der Arenagrenze ausweichen
 *
 *  Entschieden wird nur ~8x pro Sekunde (gestaffelt pro Schlange); zwischen
 *  den Entscheidungen laeuft nur noch die weiche Drehung. Das haelt 30 KI-
 *  Schlangen praktisch kostenlos.
 * ==========================================================================*/
(function (global) {
  'use strict';

  const SNK = global.SNK || (global.SNK = {});
  const Utils = SNK.Utils;

  class AIController {
    constructor(snake) {
      this.s = snake;

      /* Persoenlichkeit – sorgt fuer sichtbar unterschiedliches Verhalten. */
      this.aggression = Utils.rand(0.2, 1.0);
      this.caution = Utils.rand(0.55, 1.5);
      this.greed = Utils.rand(0.6, 1.4);
      this.interval = Utils.rand(0.085, 0.16);

      this.timer = Utils.rand(0, this.interval);
      this.wander = snake.angle;
      this.wanderSeed = Utils.rand(0, 1000);

      this.state = 'wander';
      this.boostTimer = 0;
      this.boostCooldown = Utils.rand(1, 6);

      this._fq = [];
      this._bq = [];
    }

    update(dt) {
      if (this.boostTimer > 0) this.boostTimer -= dt;
      this.timer -= dt;
      if (this.timer <= 0) {
        this.timer = this.interval;
        this.decide();
      }
    }

    /* ------------------------------------------------------------ Entscheiden */

    decide() {
      const s = this.s;
      if (!s.alive) return;
      const g = s.game;
      const w = g.world;

      let wx = 0, wy = 0;          // gewichteter Wunschvektor
      let danger = 0;              // 0..n, Naehe fremder Koerper
      this.state = 'wander';

      /* --- 1. Wandern ---------------------------------------------------- */
      this.wander = Utils.normAngle(
        this.wander +
        Math.sin(g.time * 0.55 + this.wanderSeed) * 0.09 +
        Utils.rand(-0.09, 0.09)
      );
      wx += Math.cos(this.wander) * 0.45;
      wy += Math.sin(this.wander) * 0.45;

      /* --- 2. Nahrung ---------------------------------------------------- */
      const foodR = 340 + s.radius * 8;
      const food = g.food.grid.query(s.x, s.y, foodR, this._fq);
      let bestF = null, bestScore = -Infinity;
      const fx = Math.cos(s.angle), fy = Math.sin(s.angle);
      // Bei sehr vielen Treffern nur jeden zweiten pruefen (rein kosmetisch).
      const stride = food.length > 90 ? 2 : 1;
      for (let i = 0; i < food.length; i += stride) {
        const f = food[i];
        if (!f.alive) continue;
        const dx = f.x - s.x, dy = f.y - s.y;
        const d = Math.sqrt(dx * dx + dy * dy) + 1;
        // Wert hoch, Weg kurz, moeglichst in Blickrichtung.
        const ahead = (dx * fx + dy * fy) / d;
        const sc = f.value * 34 * this.greed - d + ahead * 90;
        if (sc > bestScore) { bestScore = sc; bestF = f; }
      }
      if (bestF) {
        const dx = bestF.x - s.x, dy = bestF.y - s.y;
        const d = Math.sqrt(dx * dx + dy * dy) + 0.001;
        wx += (dx / d) * 1.15;
        wy += (dy / d) * 1.15;
        this.state = 'feed';
      }

      /* --- 3. Andere Schlangen ------------------------------------------- */
      const snakes = g.snakes;
      let pred = null, predD2 = Infinity;
      let prey = null, preyD2 = Infinity;
      const SCAN2 = 760 * 760;
      for (let i = 0; i < snakes.length; i++) {
        const o = snakes[i];
        if (o === s || !o.alive) continue;
        const dx = o.x - s.x, dy = o.y - s.y;
        const d2 = dx * dx + dy * dy;
        if (d2 > SCAN2) continue;
        if (o.mass > s.mass * 1.12) {
          if (d2 < predD2) { predD2 = d2; pred = o; }
        } else if (o.mass < s.mass * 0.8) {
          // Sehr kleine Schlangen sind die Jagd nicht wert. Das gibt frisch
          // gestarteten Spielern Luft zum Wachsen (wie im Original).
          if (o.mass < 26 && d2 > 190 * 190) continue;
          if (d2 < preyD2) { preyD2 = d2; prey = o; }
        }
      }

      /* Fluechten */
      if (pred) {
        const d = Math.sqrt(predD2);
        const t = Utils.clamp(1 - d / 700, 0, 1);
        const wgt = 2.4 * t * t * this.caution;
        if (wgt > 0.06) {
          const dx = (s.x - pred.x) / (d + 0.001);
          const dy = (s.y - pred.y) / (d + 0.001);
          wx += dx * wgt;
          wy += dy * wgt;
          // Seitwaerts-Anteil: nicht stur geradeaus, sondern wegdrehen.
          wx += -dy * wgt * 0.55;
          wy += dx * wgt * 0.55;
          if (t > 0.35) this.state = 'flee';
        }
      }

      /* Jagen – vor die Beute schneiden, damit sie in den Koerper laeuft. */
      if (prey && preyD2 < 560 * 560 && !(this.state === 'flee')) {
        const d = Math.sqrt(preyD2);
        const lead = Math.min(d * 0.8, prey.speed * 1.4 + prey.radius * 4);
        const tx = prey.x + Math.cos(prey.angle) * lead;
        const ty = prey.y + Math.sin(prey.angle) * lead;
        const dx = tx - s.x, dy = ty - s.y;
        const dd = Math.sqrt(dx * dx + dy * dy) + 0.001;
        const wgt = 1.7 * this.aggression * Utils.clamp(1 - d / 620, 0, 1);
        wx += (dx / dd) * wgt;
        wy += (dy / dd) * wgt;
        if (wgt > 0.5) this.state = 'hunt';
      }

      /* --- 4. Koerper ausweichen ---------------------------------------- */
      const avoidR = s.radius * 9 + 70;
      const bodies = g.bodyHash.query(s.x, s.y, avoidR, this._bq);
      let ax = 0, ay = 0;
      for (let i = 0; i < bodies.length; i++) {
        const e = bodies[i];
        if (e.sn === s) continue;
        const dx = s.x - e.x, dy = s.y - e.y;
        const d2 = dx * dx + dy * dy;
        if (d2 > avoidR * avoidR) continue;
        const d = Math.sqrt(d2) + 0.001;
        const t = 1 - d / avoidR;
        const wgt = t * t;
        ax += (dx / d) * wgt;
        ay += (dy / d) * wgt;
        danger += wgt;
      }
      if (danger > 0.001) {
        const al = Math.sqrt(ax * ax + ay * ay) + 0.001;
        const wgt = 3.6 * this.caution * Utils.clamp(danger * 0.7, 0.2, 1.6);
        wx += (ax / al) * wgt;
        wy += (ay / al) * wgt;
        if (danger > 0.8) this.state = 'avoid';
      }

      /* --- 5. Vorwaerts-Sonde: an Hindernissen vorbei statt hinein ------- */
      const probe = s.radius * 7 + 55;
      const probeR = s.radius * 2.8;
      const cf = g.bodyHash.countNear(
        s.x + fx * probe, s.y + fy * probe, probeR, s);
      if (cf > 0) {
        const la = s.angle - 0.62, ra = s.angle + 0.62;
        const cl = g.bodyHash.countNear(
          s.x + Math.cos(la) * probe, s.y + Math.sin(la) * probe, probeR, s);
        const cr = g.bodyHash.countNear(
          s.x + Math.cos(ra) * probe, s.y + Math.sin(ra) * probe, probeR, s);
        const dir = (cl <= cr) ? -1 : 1;
        const ta = s.angle + dir * 1.15;
        const wgt = 3.2 * this.caution;
        wx += Math.cos(ta) * wgt;
        wy += Math.sin(ta) * wgt;
        this.state = 'avoid';
      }

      /* --- 6. Arenagrenze ------------------------------------------------ */
      const m = 260 + s.radius * 5;
      let bx = 0, by = 0;
      if (s.x < m) bx += (m - s.x) / m;
      else if (s.x > w.width - m) bx -= (s.x - (w.width - m)) / m;
      if (s.y < m) by += (m - s.y) / m;
      else if (s.y > w.height - m) by -= (s.y - (w.height - m)) / m;
      if (bx !== 0 || by !== 0) {
        const bl = Math.sqrt(bx * bx + by * by) + 0.001;
        const strength = Utils.clamp(bl, 0, 1);
        const wgt = 5.5 * strength * strength + 1.2 * strength;
        wx += (bx / bl) * wgt;
        wy += (by / bl) * wgt;
        if (strength > 0.6) this.state = 'wall';
      }

      /* --- 7. Zielwinkel ------------------------------------------------- */
      if (wx !== 0 || wy !== 0) {
        s.targetAngle = Math.atan2(wy, wx);
      }

      /* --- 8. Boost ------------------------------------------------------ */
      let boost = false;
      if (this.state === 'hunt' && s.mass > 46 && preyD2 < 420 * 420) boost = true;
      if (this.state === 'flee' && s.mass > 34 && predD2 < 300 * 300) boost = true;
      if (danger > 1.3) boost = false;                 // nie in die Gefahr sprinten

      this.boostCooldown -= this.interval;
      if (!boost && this.boostTimer <= 0 && s.mass > 70 &&
          this.boostCooldown <= 0 && Math.random() < 0.07) {
        this.boostTimer = Utils.rand(0.5, 1.7);
        this.boostCooldown = Utils.rand(3, 10);
      }
      if (this.boostTimer > 0 && danger < 1.0) boost = true;

      s.boostRequested = boost;
    }
  }

  SNK.AIController = AIController;

})(typeof window !== 'undefined' ? window : this);
