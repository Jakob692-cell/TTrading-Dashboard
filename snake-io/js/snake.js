/* ============================================================================
 *  snake.js
 *  Die Schlange.
 *
 *  Koerpermodell: Der Kopf schreibt seine Spur in einen Pfadpuffer. Die
 *  Koerpersegmente werden daraus per Bogenlaenge abgetastet (fixer Abstand).
 *  Dadurch bleibt der Koerper unabhaengig von Geschwindigkeit, Boost und
 *  Framerate exakt gleich dick und gleich lang – klassisches Slither-Modell.
 * ==========================================================================*/
(function (global) {
  'use strict';

  const SNK = global.SNK || (global.SNK = {});
  const Utils = SNK.Utils;

  /* ------------------------------------------------------------ Konstanten */
  const C = {
    START_MASS: 15,          // Startmasse == Startlaenge in Segmenten
    MAX_NODES: 520,          // Renderobergrenze fuer Segmente
    PATH_RES: 4,             // Abstand der Pfadpunkte in Welteinheiten
    BASE_RADIUS: 9,
    MAX_RADIUS: 46,
    BASE_SPEED: 168,
    BOOST_MULT: 1.95,
    // Masse pro Sekunde waehrend des Boosts. Muss deutlich ueber dem
    // liegen, was man bei doppelter Geschwindigkeit zusaetzlich
    // einsammelt – sonst waere Boosten gratis.
    BOOST_DRAIN: 11.0,
    MIN_BOOST_MASS: 22,      // darunter ist kein Boost moeglich
    BOOST_DROP_STEP: 2.6,    // je X verlorene Masse fliegt eine Kugel heraus
    SPACING: 0.6,            // Segmentabstand als Faktor des Radius
    GROWTH_EXP: 0.215,       // Radiuswachstum (bewusst flach)
    NODES_PER_MASS: 0.42
  };

  /** Pfadpunkte werden global gepoolt – alle Schlangen teilen den Pool. */
  const PATH_POOL = new SNK.Pool(function () { return { x: 0, y: 0, d: 0 }; }, null, 4096);

  let NEXT_ID = 1;

  class Snake {
    /**
     * @param game  Spielinstanz
     * @param opts  {name, skin, isPlayer, speedFactor}
     */
    constructor(game, opts) {
      opts = opts || {};
      this.game = game;
      this.id = NEXT_ID++;
      this.name = opts.name || 'Snake';
      this.skin = opts.skin || SNK.SKINS[0];
      this.isPlayer = !!opts.isPlayer;

      /* Position & Ausrichtung */
      this.x = 0; this.y = 0;
      this.angle = 0;
      this.targetAngle = 0;

      /* Statistik */
      this.mass = C.START_MASS;
      this.score = 0;
      this.kills = 0;
      this.maxNodes = C.START_MASS;
      this.birthTime = 0;
      this.deathTime = 0;
      this.killedBy = null;

      /* Zustand */
      this.alive = true;
      this.boostRequested = false;
      this.boosting = false;
      this.invuln = 0;
      this.speedFactor = opts.speedFactor || 1;
      this.speedScale = 1;
      this.boostDrop = 0;
      this.skinTime = Math.random() * 10;
      this.foodColorIndex = (Math.random() * SNK.FOOD_COLORS.length) | 0;
      this.ai = null;

      /* Pfad (aeltester Punkt bei `start`, neuester am Ende) */
      this.path = [];
      this.start = 0;
      this.pathTotal = 0;

      /* Koerpersegmente */
      this.nodes = [];
      this.liveNodes = 0;

      /* Bounding-Box fuer schnelles Culling */
      this.minX = 0; this.minY = 0; this.maxX = 0; this.maxY = 0;

      /* Wiederverwendeter Abfragepuffer (keine Allokation im Frame) */
      this._fq = [];

      this.updateSize();
    }

    /* --------------------------------------------------------------- Spawn */

    /**
     * Setzt die Schlange an eine Position und legt eine Startspur an.
     * @param mass optionale Startmasse (Standard: C.START_MASS)
     */
    spawn(x, y, angle, mass) {
      this.x = x; this.y = y;
      this.angle = angle;
      this.targetAngle = angle;
      this.mass = (typeof mass === 'number' && mass > 0) ? mass : C.START_MASS;
      this.score = 0;
      this.kills = 0;
      this.alive = true;
      this.boosting = false;
      this.boostRequested = false;
      this.boostDrop = 0;
      this.killedBy = null;
      this.speedScale = 1;
      this.birthTime = this.game ? this.game.time : 0;
      this.updateSize();
      this.maxNodes = this.nodeCount;

      this._releasePath();

      // Spur nach hinten vorbelegen, damit die Schlange sofort vollstaendig
      // sichtbar ist (statt sich erst "auszurollen"). Die Spur wird leicht
      // gekruemmt angelegt: dadurch bleibt selbst ein sehr langer Koerper in
      // der Naehe des Spawnpunkts und ragt nicht aus der Arena heraus.
      const need = this.bodyLength + C.PATH_RES * 3 + 10;
      const turnRadius = Math.max(130, this.bodyLength / 6);
      const curl = (Math.random() < 0.5 ? -1 : 1) * (C.PATH_RES / turnRadius);

      const pts = [];
      let ang = angle + Math.PI;                 // rueckwaerts laufen
      let px = x, py = y;
      let dist = 0;
      while (dist <= need) {
        pts.push(px, py);
        px += Math.cos(ang) * C.PATH_RES;
        py += Math.sin(ang) * C.PATH_RES;
        ang += curl;
        dist += C.PATH_RES;
      }
      // Aeltester Punkt zuerst einfuegen -> am Ende liegt der neueste (Kopf).
      for (let i = pts.length - 2; i >= 0; i -= 2) {
        const p = PATH_POOL.obtain();
        p.x = pts[i]; p.y = pts[i + 1];
        p.d = (i === pts.length - 2) ? 0 : C.PATH_RES;
        this.path.push(p);
        this.pathTotal += p.d;
      }
      this._sampleNodes();
      return this;
    }

    /* -------------------------------------------------- Abgeleitete Werte */

    /** Muss nach jeder Massenaenderung laufen (cached alle Hot-Loop-Werte). */
    updateSize() {
      const m = Math.max(1, this.mass);
      this.radius = Math.min(
        C.MAX_RADIUS,
        C.BASE_RADIUS * Math.pow(m / C.START_MASS, C.GROWTH_EXP)
      );
      this.spacing = this.radius * C.SPACING;
      this.nodeCount = Utils.clamp(
        Math.round(C.START_MASS + (m - C.START_MASS) * C.NODES_PER_MASS),
        6, C.MAX_NODES
      );
      this.bodyLength = this.nodeCount * this.spacing;

      // Grosse Schlangen sind langsamer und traeger – das macht Groesse
      // zu einem echten Trade-off.
      const big = Utils.clamp((this.radius - C.BASE_RADIUS) / 34, 0, 1);
      this.speed = C.BASE_SPEED * (1 - big * 0.34) * this.speedFactor;
      this.turnRate = 4.7 - big * 2.5;

      if (this.nodeCount > this.maxNodes) this.maxNodes = this.nodeCount;

      // Segment-Objekte bei Bedarf nachlegen.
      const nodes = this.nodes;
      while (nodes.length < this.nodeCount) nodes.push({ x: this.x, y: this.y });
    }

    addMass(v) {
      if (v <= 0) return;
      this.mass += v;
      this.score += v * 10;
      this.updateSize();
    }

    /** Anzeigewert "Laenge". */
    get length() { return this.nodeCount; }

    get head() { return this.nodes[0]; }

    /* -------------------------------------------------------------- Update */

    /**
     * Ein Simulationsschritt mit fester Schrittweite.
     * @param dt Sekunden (konstant, siehe Game.STEP)
     */
    update(dt) {
      if (!this.alive) return;

      /* --- Boost --------------------------------------------------------- */
      const wasBoosting = this.boosting;
      this.boosting = this.boostRequested && this.mass > C.MIN_BOOST_MASS;
      if (this.boosting) {
        const drain = C.BOOST_DRAIN * dt;
        this.mass = Math.max(C.MIN_BOOST_MASS, this.mass - drain);
        this.boostDrop += drain;
        this.updateSize();
      }
      if (wasBoosting !== this.boosting && this.isPlayer) {
        this.game.onPlayerBoostChanged(this.boosting);
      }

      /* --- Lenkung ------------------------------------------------------- */
      const maxTurn = this.turnRate * dt * (this.boosting ? 0.82 : 1);
      this.angle = Utils.approachAngle(this.angle, this.targetAngle, maxTurn);

      /* --- Bewegung ------------------------------------------------------ */
      const spd = this.speed * (this.boosting ? C.BOOST_MULT : 1) * this.speedScale;
      this.x += Math.cos(this.angle) * spd * dt;
      this.y += Math.sin(this.angle) * spd * dt;

      /* --- Koerper ------------------------------------------------------- */
      this._recordPath();
      this._sampleNodes();

      /* --- Boost-Kugeln hinter dem Schwanz ------------------------------- */
      if (this.boostDrop >= C.BOOST_DROP_STEP) {
        this.boostDrop -= C.BOOST_DROP_STEP;
        const tail = this.nodes[this.liveNodes - 1];
        if (tail) {
          this.game.food.spawn(tail.x, tail.y, {
            r: 6.2,
            value: C.BOOST_DROP_STEP * 0.55,
            colorIndex: this.foodColorIndex
          });
        }
      }

      if (this.invuln > 0) this.invuln -= dt;
      this.skinTime += dt;
    }

    /* Pfadpunkt anhaengen und hinten kuerzen. */
    _recordPath() {
      const path = this.path;
      const last = path.length > this.start ? path[path.length - 1] : null;

      if (last) {
        const dx = this.x - last.x, dy = this.y - last.y;
        const d2 = dx * dx + dy * dy;
        if (d2 >= C.PATH_RES * C.PATH_RES) {
          const p = PATH_POOL.obtain();
          p.x = this.x; p.y = this.y; p.d = Math.sqrt(d2);
          path.push(p);
          this.pathTotal += p.d;
        }
      } else {
        const p = PATH_POOL.obtain();
        p.x = this.x; p.y = this.y; p.d = 0;
        path.push(p);
      }

      // Ueberschuessige Spur am Schwanz freigeben.
      const need = this.bodyLength + C.PATH_RES * 3 + 12;
      while (path.length - this.start > 3) {
        const nextD = path[this.start + 1].d;
        if (this.pathTotal - nextD < need) break;
        this.pathTotal -= nextD;
        PATH_POOL.release(path[this.start]);
        path[this.start] = null;
        this.start++;
      }

      // Gelegentlich kompaktieren, damit das Array nicht unbegrenzt waechst.
      if (this.start > 256 && this.start * 2 > path.length) {
        path.splice(0, this.start);
        this.start = 0;
      }
    }

    /* Segmentpositionen entlang der Spur abtasten. */
    _sampleNodes() {
      const nodes = this.nodes;
      const spacing = this.spacing;
      const count = this.nodeCount;
      const path = this.path;

      let n0 = nodes[0];
      n0.x = this.x; n0.y = this.y;

      let minX = this.x, maxX = this.x, minY = this.y, maxY = this.y;
      let ni = 1;
      let target = spacing;
      let acc = 0;
      let px = this.x, py = this.y;

      for (let i = path.length - 1; i >= this.start && ni < count; i--) {
        const p = path[i];
        const dx = p.x - px, dy = p.y - py;
        const seg = Math.sqrt(dx * dx + dy * dy);
        if (seg > 1e-6) {
          while (acc + seg >= target && ni < count) {
            const t = (target - acc) / seg;
            const nx = px + dx * t, ny = py + dy * t;
            const nd = nodes[ni];
            nd.x = nx; nd.y = ny;
            if (nx < minX) minX = nx; else if (nx > maxX) maxX = nx;
            if (ny < minY) minY = ny; else if (ny > maxY) maxY = ny;
            ni++;
            target += spacing;
          }
          acc += seg;
        }
        px = p.x; py = p.y;
      }

      // Falls die Spur (noch) zu kurz ist: Rest auf den letzten Punkt legen.
      while (ni < count) {
        const nd = nodes[ni];
        nd.x = px; nd.y = py;
        ni++;
      }

      this.liveNodes = count;
      this.minX = minX; this.maxX = maxX;
      this.minY = minY; this.maxY = maxY;
    }

    /* ---------------------------------------------------------- Fressen */

    /**
     * Nahrung einsammeln.
     *
     * Wie im Original zieht der Kopf Kugeln in einem groesseren Umkreis an
     * ("Magnetismus"): das sieht gut aus und macht das Sammeln fluessig,
     * ohne die Trefferflaeche des Kopfes selbst aufzublasen.
     *
     * @returns die aufgenommene Masse
     */
    eat(dt) {
      const fm = this.game.food;
      const r = this.radius;
      const pull = r * 3.1 + 34;                 // Anziehungsradius
      const eatR = r * 0.95;                     // Schluckradius (+ Kugelradius)
      const list = fm.grid.query(this.x, this.y, pull + 4, this._fq);
      if (list.length === 0) return 0;

      let gained = 0;
      for (let i = 0; i < list.length; i++) {
        const f = list[i];
        if (!f.alive) continue;
        const dx = this.x - f.x, dy = this.y - f.y;
        const d2 = dx * dx + dy * dy;
        const rr = eatR + f.r * 0.7;

        if (d2 <= rr * rr) {
          gained += f.value;
          this.game.onFoodEaten(this, f);
          fm.remove(f);
          continue;
        }
        if (d2 < pull * pull) {
          const d = Math.sqrt(d2) || 0.001;
          const speed = 900 * (1 - d / pull) + 140;
          const step = Math.min(d, speed * dt);
          f.x += (dx / d) * step;
          f.y += (dy / d) * step;
          f.settle = 0;                          // Streubewegung beenden
          f.vx = 0; f.vy = 0;
          fm.grid.update(f);
        }
      }
      if (gained > 0) this.addMass(gained);
      return gained;
    }

    /* ------------------------------------------------------------ Sterben */

    /** Nur Zustandswechsel – Nahrung/Effekte erledigt das Spiel. */
    kill(killer) {
      if (!this.alive) return;
      this.alive = false;
      this.boosting = false;
      this.boostRequested = false;
      this.killedBy = killer;
      this.deathTime = this.game ? this.game.time : 0;
    }

    /** Pfadpunkte in den Pool zuruecklegen. */
    _releasePath() {
      const path = this.path;
      for (let i = this.start; i < path.length; i++) {
        if (path[i]) PATH_POOL.release(path[i]);
      }
      path.length = 0;
      this.start = 0;
      this.pathTotal = 0;
    }

    /** Vollstaendiges Aufraeumen (Respawn/Rundenende). */
    dispose() {
      this._releasePath();
      this.liveNodes = 0;
    }

    /** Ueberlebenszeit in Sekunden. */
    aliveTime(now) {
      return Math.max(0, (this.alive ? now : this.deathTime) - this.birthTime);
    }
  }

  Snake.C = C;
  SNK.Snake = Snake;
  SNK.PATH_POOL = PATH_POOL;

})(typeof window !== 'undefined' ? window : this);
