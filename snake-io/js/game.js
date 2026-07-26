/* ============================================================================
 *  game.js
 *  Spielkern: Welt, Simulationsschleife, Kollisionen, Spawns, Zustaende.
 *
 *  Zeitmodell: fester Simulationsschritt (1/60 s) mit Akkumulator, gerendert
 *  wird jeder Frame. Damit ist die Physik unabhaengig von der Bildrate –
 *  kein Tunneling, keine Unterschiede zwischen 60 und 144 Hz.
 * ==========================================================================*/
(function (global) {
  'use strict';

  const SNK = global.SNK || (global.SNK = {});
  const Utils = SNK.Utils;

  /** Simulationsschritt in Sekunden. */
  const STEP = 1 / 60;
  /** Maximale Nachholschritte pro Frame (verhindert Endlosschleifen). */
  const MAX_STEPS = 5;
  /** Anzahl der KI-Gegner. */
  const AI_COUNT = 30;
  /** Auswaehlbare Zoomstufen. */
  const ZOOM_STEPS = [0.8, 1.0, 1.2, 1.45];

  class Game {
    constructor() {
      this.world = { width: 4400, height: 4400, pad: 110 };

      this.snakes = [];
      this.player = null;
      this.leaderboard = [];      // Top-Eintraege fuer die Anzeige
      this.ranking = [];          // vollstaendige Rangliste
      this.playerRank = 0;        // 1-basiert, 0 = nicht im Rennen

      this.state = 'boot';            // boot|menu|countdown|playing|paused|dying|dead
      this.time = 0;                  // Simulationszeit
      this.clock = 0;                 // Echtzeit (laeuft auch in Menues)
      this.acc = 0;
      this.fps = 60;

      this.countdown = 0;
      this.hideCountdownIn = 0;
      this.deathTimer = 0;
      this.globalSpeedScale = 1;
      this.eventScale = 1;
      this.foodTarget = 1400;

      this._lastTs = 0;
      this._hudTimer = 0;
      this._respawnQueue = [];
      this._deathFocus = { x: 0, y: 0, radius: 12, angle: 0, speed: 0 };
      this._spectator = null;

      /* Wiederverwendete Puffer */
      this._entries = [];
      this._cq = [];
      this._deaths = [];
      this._tmp = { x: 0, y: 0 };
      this._tmpScreen = { x: 0, y: 0 };

      this._frame = this.frame.bind(this);
    }

    /* ----------------------------------------------------------------- Init */

    init() {
      SNK.Settings.load();
      SNK.Stats.load();

      const canvas = global.document.getElementById('game');
      const minimap = global.document.getElementById('minimap');

      this.audio = new SNK.AudioManager(SNK.Settings);
      this.camera = new SNK.Camera();
      this.camera.setUserZoom(SNK.Settings.data.zoom);
      this.particles = new SNK.ParticleSystem(SNK.Settings.preset.maxParticles);
      this.food = new SNK.FoodManager(this);
      this.events = new SNK.EventManager(this);
      this.bodyHash = new SNK.SpatialHash(120);
      this.renderer = new SNK.Renderer(canvas, minimap, this);
      this.input = new SNK.Input(canvas);
      this.ui = new SNK.UI(this);

      this._applyQuality();
      this._wireInput();

      const self = this;
      global.addEventListener('resize', function () { self.renderer.resize(); });
      global.document.addEventListener('visibilitychange', function () {
        if (global.document.hidden && self.state === 'playing') self.setPaused(true);
      });

      this.renderer.resize();
      this.ui.setTouchMode(Utils.isTouchDevice());

      // Welt fuer den Menue-Hintergrund aufbauen (lebendige Kulisse).
      this.resetWorld();
      this.state = 'menu';
      this.ui.showScreen('menu');

      global.requestAnimationFrame(this._frame);
      return this;
    }

    _wireInput() {
      const self = this;
      const input = this.input;
      input.attach();

      input.onFirstInteraction = function () { self.audio.unlock(); };

      input.onPause = function () {
        if (self.state === 'playing') self.setPaused(true);
        else if (self.state === 'paused') self.setPaused(false);
      };

      input.onConfirm = function () {
        if (self.state === 'menu' || self.state === 'dead') self.startGame();
        else if (self.state === 'paused') self.setPaused(false);
      };

      input.onZoom = function (dir) {
        const cur = SNK.Settings.data.zoom;
        let idx = 1;
        let bestD = Infinity;
        for (let i = 0; i < ZOOM_STEPS.length; i++) {
          const d = Math.abs(ZOOM_STEPS[i] - cur);
          if (d < bestD) { bestD = d; idx = i; }
        }
        idx = Utils.clamp(idx + dir, 0, ZOOM_STEPS.length - 1);
        self.setZoom(ZOOM_STEPS[idx]);
        self.ui.syncSettings();
      };

      input.onJoystickChange = function (inp) { self.ui.updateJoystick(inp); };
    }

    /* ----------------------------------------------------------- Qualitaet */

    _applyQuality() {
      const q = SNK.Settings.preset;
      this.particles.setMax(q.maxParticles);
      this.foodTarget = q.foodTarget;
      this.eventScale = q.foodTarget / 1400;
    }

    setQuality(name) {
      if (!SNK.QUALITY[name]) return;
      SNK.Settings.set('quality', name);
      this._applyQuality();
      this.renderer.resize();
      // Ueberschuss abbauen, falls die Zielmenge gesunken ist.
      const list = this.food.list;
      while (this.food.count > this.foodTarget && list.length > 0) {
        this.food.remove(list[list.length - 1]);
      }
      this.food.fill(this.foodTarget);
    }

    setZoom(z) {
      SNK.Settings.set('zoom', z);
      this.camera.setUserZoom(z);
    }

    /* --------------------------------------------------------------- Welt */

    resetWorld() {
      for (let i = 0; i < this.snakes.length; i++) this.snakes[i].dispose();
      this.snakes.length = 0;
      this.player = null;
      this.leaderboard.length = 0;
      this.ranking.length = 0;
      this.playerRank = 0;
      this._respawnQueue.length = 0;
      this._spectator = null;

      this.food.reset();
      this.particles.clear();
      this.events.reset();
      this.globalSpeedScale = 1;
      this.time = 0;
      this.acc = 0;

      this.food.fill(this.foodTarget);
      this.spawnAI(AI_COUNT, false);

      this.bodyHash.clear();
      this._buildBodyHash();
      this._updateLeaderboard();

      // Kamera auf eine Schlange setzen, damit das Menue nicht leer wirkt.
      const s = this.leaderboard[0];
      if (s) {
        this._spectator = s;
        this.camera.snapTo(s.x, s.y, s.radius);
      } else {
        this.camera.snapTo(this.world.width * 0.5, this.world.height * 0.5, 9);
      }
    }

    /**
     * Freie Spawnposition suchen.
     * Geprueft wird direkt gegen die Koerper aller Schlangen – das Gitter
     * taugt hier nicht, weil frisch gespawnte (unverwundbare) Schlangen
     * bewusst nicht darin stehen.
     */
    findSafeSpawn(out) {
      const w = this.world;
      const margin = 420;
      const minD = 260;
      const minD2 = minD * minD;
      const snakes = this.snakes;
      let bestX = 0, bestY = 0, bestD2 = -1;

      for (let attempt = 0; attempt < 30; attempt++) {
        const x = Utils.rand(margin, w.width - margin);
        const y = Utils.rand(margin, w.height - margin);
        let worst = Infinity;
        for (let i = 0; i < snakes.length && worst > minD2; i++) {
          const sn = snakes[i];
          if (!sn.alive) continue;
          const nodes = sn.nodes;
          for (let k = 0; k < sn.liveNodes; k += 3) {
            const dx = nodes[k].x - x, dy = nodes[k].y - y;
            const d2 = dx * dx + dy * dy;
            if (d2 < worst) { worst = d2; if (worst <= minD2) break; }
          }
        }
        if (worst > minD2) { out.x = x; out.y = y; return out; }
        if (worst > bestD2) { bestD2 = worst; bestX = x; bestY = y; }
      }
      // Notfall: der freieste der gepruefeten Punkte.
      out.x = bestX; out.y = bestY;
      return out;
    }

    /** KI-Schlangen erzeugen. */
    spawnAI(count, announce) {
      const C = SNK.Snake.C;
      for (let i = 0; i < count; i++) {
        const pos = this.findSafeSpawn(this._tmp);

        // Groessenverteilung: viele kleine, wenige richtig grosse.
        const roll = Math.random();
        let factor;
        if (roll < 0.62) factor = Utils.rand(1.0, 2.4);
        else if (roll < 0.94) factor = Utils.rand(2.4, 6.0);
        else factor = Utils.rand(6.0, 12.0);

        const sn = new SNK.Snake(this, {
          name: Utils.randomName(),
          skin: Utils.pick(SNK.SKINS),
          speedFactor: Utils.rand(0.9, 1.14)
        });
        sn.ai = new SNK.AIController(sn);
        sn.spawn(pos.x, pos.y, Utils.rand(-Math.PI, Math.PI), C.START_MASS * factor);
        sn.invuln = 2.2;
        this.snakes.push(sn);

        if (announce) {
          this.particles.burst(pos.x, pos.y, sn.skin.glow, 16, 220, 5);
        }
      }
    }

    /* ------------------------------------------------------------ Ablauf */

    startGame() {
      this.audio.unlock();

      const name = Utils.sanitizeName(SNK.Settings.data.name, 'Spieler');
      SNK.Settings.set('name', name);
      const skin = SNK.skinByIndex(SNK.Settings.data.skin);

      this.resetWorld();

      const p = new SNK.Snake(this, { name: name, skin: skin, isPlayer: true });
      const pos = this.findSafeSpawn(this._tmp);
      p.spawn(pos.x, pos.y, Utils.rand(-Math.PI, Math.PI));
      p.invuln = 4.4;
      this.player = p;
      this.snakes.push(p);
      this._spectator = null;

      this.camera.snapTo(p.x, p.y, p.radius);
      this._buildBodyHash();
      this._updateLeaderboard();

      this.state = 'countdown';
      this.countdown = 3;
      this.hideCountdownIn = 0;
      this.ui.showScreen(null);
      this.ui.showCountdown('3', false);
      this.audio.playTick(false);
      this.audio.resume();
      this.particles.burst(p.x, p.y, skin.glow, 26, 260, 6);
    }

    quitToMenu() {
      this.audio.stopBoost();
      this.input.releaseAll();
      this.resetWorld();
      this.state = 'menu';
      this.ui.hideCountdown();
      this.ui.showScreen('menu');
      this.audio.resume();
    }

    setPaused(on) {
      if (on) {
        if (this.state !== 'playing' && this.state !== 'countdown') return;
        this._prevState = this.state;
        this.state = 'paused';
        this.input.releaseAll();
        this.audio.stopBoost();
        this.audio.suspend();
        this.ui.showScreen('pause');
      } else {
        if (this.state !== 'paused') return;
        this.state = this._prevState || 'playing';
        this.acc = 0;
        this.audio.resume();
        this.ui.showScreen(null);
      }
    }

    /* --------------------------------------------------------- Hauptschleife */

    frame(ts) {
      global.requestAnimationFrame(this._frame);

      if (!this._lastTs) this._lastTs = ts;
      let raw = (ts - this._lastTs) / 1000;
      this._lastTs = ts;
      if (raw > 0.25) raw = 0.25;            // nach Tab-Wechsel nicht nachrechnen
      if (raw < 0) raw = 0;

      // FPS geglaettet (nur Anzeige)
      const inst = raw > 0.00001 ? 1 / raw : 240;
      this.fps += (inst - this.fps) * 0.08;

      this.clock += raw;

      /* Simulation mit festem Schritt */
      if (this.state !== 'paused' && this.state !== 'boot') {
        this.acc += raw;
        let steps = 0;
        while (this.acc >= STEP && steps < MAX_STEPS) {
          this.step(STEP);
          this.acc -= STEP;
          steps++;
        }
        if (this.acc > STEP * MAX_STEPS) this.acc = 0;
      }

      this._timers(raw);

      this.camera.update(raw, this._camTarget());
      this.particles.update(raw);
      this.renderer.render(raw);

      this.ui.updateFast(raw);
      this._hudTimer -= raw;
      if (this._hudTimer <= 0) {
        this._hudTimer = 0.1;
        // Direkt vor der Anzeige sortieren: sonst kann die Liste sichtbar
        // "unsortiert" wirken, weil sich Punkte zwischen Sortierung und
        // Darstellung schon wieder geaendert haben.
        this._updateLeaderboard();
        this.ui.updateSlow();
      }
    }

    /** Zeitgesteuerte Zustandswechsel (Countdown, Todesanimation). */
    _timers(dt) {
      if (this.state === 'countdown') {
        const prev = Math.ceil(this.countdown);
        this.countdown -= dt;
        const now = Math.ceil(this.countdown);
        if (now !== prev && now > 0) {
          this.ui.showCountdown(String(now), false);
          this.audio.playTick(false);
        }
        if (this.countdown <= 0) {
          this.state = 'playing';
          this.ui.showCountdown('LOS!', true);
          this.audio.playTick(true);
          this.hideCountdownIn = 0.75;
          const touch = this.input.touchMode || Utils.isTouchDevice();
          this.ui.showHint(
            touch
              ? 'Ziehen zum Lenken · Boost-Button halten'
              : 'Maus zum Lenken · Linke Maustaste = Boost · P = Pause',
            5
          );
        }
      }

      if (this.hideCountdownIn > 0) {
        this.hideCountdownIn -= dt;
        if (this.hideCountdownIn <= 0) this.ui.hideCountdown();
      }

      if (this.state === 'dying') {
        this.deathTimer -= dt;
        if (this.deathTimer <= 0) this._finishGame();
      }
    }

    /* ------------------------------------------------------ Simulationsschritt */

    step(dt) {
      this.time += dt;

      const snakes = this.snakes;
      const countdownActive = this.state === 'countdown';

      /* 1. KI denkt (nutzt den Hash vom Ende des letzten Schritts) */
      for (let i = 0; i < snakes.length; i++) {
        const sn = snakes[i];
        if (sn.alive && sn.ai) sn.ai.update(dt);
      }

      /* 2. Spielereingabe */
      const p = this.player;
      if (p && p.alive) {
        const sp = this.camera.worldToScreen(p.x, p.y, this._tmpScreen);
        const a = this.input.desiredAngle(sp.x, sp.y);
        if (a !== null) p.targetAngle = a;
        p.boostRequested = (this.state === 'playing') && this.input.boosting;
      }

      /* 3. Tempo-Modifikatoren */
      for (let i = 0; i < snakes.length; i++) {
        const sn = snakes[i];
        sn.speedScale = this.globalSpeedScale *
          (sn.isPlayer && countdownActive ? 0.5 : 1);
      }

      /* 4. Bewegung */
      for (let i = 0; i < snakes.length; i++) {
        const sn = snakes[i];
        if (sn.alive) sn.update(dt);
      }

      /* 5. Arenagrenze */
      const w = this.world;
      for (let i = 0; i < snakes.length; i++) {
        const sn = snakes[i];
        if (!sn.alive || sn.invuln > 0) continue;
        if (sn.x < 0 || sn.y < 0 || sn.x > w.width || sn.y > w.height) {
          this.killSnake(sn, null);
        }
      }

      /* 6. Kollisionsgitter mit aktuellen Positionen */
      this._buildBodyHash();

      /* 7. Fressen */
      for (let i = 0; i < snakes.length; i++) {
        const sn = snakes[i];
        if (sn.alive) sn.eat(dt);
      }

      /* 8. Kollisionen */
      this._checkCollisions();

      /* 9. Boost-Effekte */
      this._boostEffects(dt);

      /* 10. Aufraeumen & Nachschub */
      this._removeDead();
      this._processRespawns();

      if (this.food.count < this.foodTarget) this.food.refill(this.foodTarget, 6);
      else this._trimFood();
      this.food.update(dt, this.time);

      this.events.update(dt);
    }

    /* ------------------------------------------------------------ Kollision */

    /**
     * Koerpersegmente in das Gitter schreiben. Es wird nur jedes zweite
     * Segment eingetragen – die Segmente ueberlappen stark, dadurch bleibt
     * die Trefferpruefung exakt und halbiert die Arbeit.
     */
    _buildBodyHash() {
      const hash = this.bodyHash;
      hash.clear();
      const entries = this._entries;
      const snakes = this.snakes;
      let n = 0;

      for (let i = 0; i < snakes.length; i++) {
        const sn = snakes[i];
        if (!sn.alive || sn.invuln > 0) continue;
        const nodes = sn.nodes;
        const cnt = sn.liveNodes;
        const r = sn.radius;
        for (let k = 0; k < cnt; k += 2) {
          let e = entries[n];
          if (e === undefined) { e = { sn: null, x: 0, y: 0, r: 0 }; entries[n] = e; }
          const nd = nodes[k];
          e.sn = sn; e.x = nd.x; e.y = nd.y; e.r = r;
          hash.insert(nd.x, nd.y, e);
          n++;
        }
      }
      this._entryCount = n;
    }

    /**
     * Kopf gegen fremde Koerper. Erst alle Treffer sammeln, dann anwenden –
     * so sterben bei einem Kopf-an-Kopf-Treffer korrekt beide Schlangen.
     */
    _checkCollisions() {
      const snakes = this.snakes;
      const deaths = this._deaths;
      deaths.length = 0;
      const MAX_R = 48;

      for (let i = 0; i < snakes.length; i++) {
        const sn = snakes[i];
        if (!sn.alive || sn.invuln > 0) continue;
        const r = sn.radius;
        const list = this.bodyHash.query(sn.x, sn.y, r + MAX_R, this._cq);
        for (let k = 0; k < list.length; k++) {
          const e = list[k];
          if (e.sn === sn || !e.sn.alive) continue;
          const dx = e.x - sn.x, dy = e.y - sn.y;
          const lim = r * 0.72 + e.r * 0.88;
          if (dx * dx + dy * dy < lim * lim) {
            deaths.push(sn, e.sn);
            break;
          }
        }
      }

      for (let i = 0; i < deaths.length; i += 2) {
        this.killSnake(deaths[i], deaths[i + 1]);
      }
      deaths.length = 0;
    }

    /** Tod einer Schlange: Nahrung verstreuen, Effekte, Punkte. */
    killSnake(victim, killer) {
      if (!victim.alive) return;

      const scale = Utils.clamp(victim.radius / 12, 0.7, 2.3);
      this.food.scatterFromSnake(victim);
      this.particles.explosion(victim.x, victim.y, victim.skin.glow, scale);
      victim.kill(killer);

      if (killer && killer.alive) {
        killer.kills++;
        killer.score += 220 + victim.mass * 2;
      }

      if (victim === this.player) {
        this.audio.stopBoost();
        this.audio.playDeath();
        this.camera.addShake(20);
        this._onPlayerDeath();
      } else if (killer === this.player) {
        this.audio.playKill();
        this.camera.addShake(7);
        this.ui.showHint(victim.name + ' erledigt!  +' + Math.round(220 + victim.mass * 2), 2);
      } else if (this._nearView(victim.x, victim.y, 250)) {
        this.audio.playPop(scale / 2.3);
      }

      victim.dispose();
    }

    _onPlayerDeath() {
      const p = this.player;
      this.state = 'dying';
      this.deathTimer = 1.35;
      this.input.releaseAll();

      // Platzierung im Moment des Todes festhalten (vor dem Ausscheiden).
      let rank = 1;
      for (let i = 0; i < this.snakes.length; i++) {
        const sn = this.snakes[i];
        if (sn !== p && sn.alive && sn.score > p.score) rank++;
      }
      this.playerRank = rank;
      this._result = {
        score: Math.floor(p.score),
        maxLength: p.maxNodes,
        time: p.aliveTime(this.time),
        rank: rank,
        kills: p.kills,
        killer: p.killedBy ? p.killedBy.name : null
      };

      this._deathFocus.x = p.x;
      this._deathFocus.y = p.y;
      this._deathFocus.radius = p.radius;
      this._deathFocus.angle = p.angle;
      this._deathFocus.speed = 0;
    }

    _finishGame() {
      this.state = 'dead';
      const r = this._result || { score: 0, maxLength: 0, time: 0, rank: '-', kills: 0, killer: null };
      r.isRecord = SNK.Stats.submit(r.score, r.maxLength, r.time, r.kills);
      this.ui.showGameOver(r);
    }

    /* ------------------------------------------------------------- Helfer */

    _boostEffects(dt) {
      const q = SNK.Settings.preset;
      if (q.particleScale <= 0) return;
      const snakes = this.snakes;
      for (let i = 0; i < snakes.length; i++) {
        const sn = snakes[i];
        if (!sn.alive || !sn.boosting) continue;
        if (Math.random() > 0.55 * q.particleScale) continue;
        const tail = sn.nodes[sn.liveNodes - 1];
        if (!tail || !this._nearView(tail.x, tail.y, 150)) continue;
        this.particles.boostTrail(
          tail.x, tail.y, sn.skin.glow, sn.radius,
          -Math.cos(sn.angle), -Math.sin(sn.angle)
        );
      }
    }

    _removeDead() {
      const snakes = this.snakes;
      for (let i = snakes.length - 1; i >= 0; i--) {
        const sn = snakes[i];
        if (sn.alive || sn === this.player) continue;
        snakes.splice(i, 1);
        if (this._spectator === sn) this._spectator = null;
        this._respawnQueue.push(this.time + Utils.rand(1.5, 4.5));
      }
    }

    _processRespawns() {
      const q = this._respawnQueue;
      for (let i = q.length - 1; i >= 0; i--) {
        if (this.time >= q[i]) {
          q.splice(i, 1);
          this.spawnAI(1, false);
        }
      }
    }

    /**
     * Zu viel Nahrung (nach Events oder vielen Toden) sanft abbauen –
     * immer nur weit ausserhalb des Sichtfelds, damit nichts "verschwindet".
     */
    _trimFood() {
      const cap = this.foodTarget * 1.9;
      if (this.food.count <= cap) return;
      const list = this.food.list;
      // Deutlich ueber dem Ziel darf auch wertvolle Nahrung weg.
      const anyValue = this.food.count > this.foodTarget * 2.4;
      for (let k = 0; k < 12 && this.food.count > cap; k++) {
        const f = list[(Math.random() * list.length) | 0];
        if (!f) break;
        if ((anyValue || f.value <= 3) && !this._nearView(f.x, f.y, 900)) {
          this.food.remove(f);
        }
      }
    }

    /**
     * Vollstaendige Rangliste bilden. `leaderboard` enthaelt danach die
     * Top-Eintraege fuer die Anzeige, `playerRank` den echten Platz des
     * Spielers – auch wenn er (noch) nicht in den Top 10 steht.
     */
    _updateLeaderboard() {
      const rank = this.ranking;
      rank.length = 0;
      const snakes = this.snakes;
      for (let i = 0; i < snakes.length; i++) {
        if (snakes[i].alive) rank.push(snakes[i]);
      }
      rank.sort(function (a, b) { return b.score - a.score; });

      this.playerRank = 0;
      const p = this.player;
      if (p && p.alive) {
        for (let i = 0; i < rank.length; i++) {
          if (rank[i] === p) { this.playerRank = i + 1; break; }
        }
      }

      const arr = this.leaderboard;
      arr.length = 0;
      const n = Math.min(12, rank.length);
      for (let i = 0; i < n; i++) arr.push(rank[i]);
    }

    _camTarget() {
      const p = this.player;
      if (p && p.alive) return p;
      if (this.state === 'dying' || this.state === 'dead') return this._deathFocus;

      // Menue: einer lebenden Schlange zuschauen.
      if (!this._spectator || !this._spectator.alive) {
        const pool = this.leaderboard.length ? this.leaderboard : this.snakes;
        const pick = pool[Utils.randInt(0, Math.min(5, pool.length - 1))] || null;
        this._spectator = pick;
        if (pick) this.camera.snapTo(pick.x, pick.y, pick.radius);
      }
      return this._spectator;
    }

    /** Liegt der Punkt (mit Rand) im Sichtbereich? */
    _nearView(x, y, pad) {
      const v = this.renderer.view;
      return x > v.x0 - pad && x < v.x1 + pad && y > v.y0 - pad && y < v.y1 + pad;
    }

    /* -------------------------------------------------------- Callbacks */

    /** Von Snake.eat() aufgerufen. */
    onFoodEaten(sn, f) {
      const q = SNK.Settings.preset;
      if (q.particleScale > 0 && this._nearView(f.x, f.y, 120)) {
        this.particles.eat(f.x, f.y, f.color, Math.min(1, f.value / 8) * q.particleScale);
      }
      if (sn === this.player) {
        if (f.value >= 10) this.audio.playBigEat();
        else this.audio.playEat(Math.min(1, f.value / 8));
      }
    }

    /** Von Snake.update() aufgerufen, wenn der Spieler-Boost umschaltet. */
    onPlayerBoostChanged(on) {
      if (on) this.audio.startBoost();
      else this.audio.stopBoost();
    }

    get aliveCount() {
      let n = 0;
      for (let i = 0; i < this.snakes.length; i++) if (this.snakes[i].alive) n++;
      return n;
    }
  }

  Game.STEP = STEP;
  Game.ZOOM_STEPS = ZOOM_STEPS;
  SNK.Game = Game;

})(typeof window !== 'undefined' ? window : this);
