/* ============================================================================
 *  events.js
 *  Zufaellige Welt-Events. Jedes Event hat einen Start-, einen optionalen
 *  Dauer- und einen Endeffekt und meldet sich per Banner im HUD.
 * ==========================================================================*/
(function (global) {
  'use strict';

  const SNK = global.SNK || (global.SNK = {});
  const Utils = SNK.Utils;

  /**
   * Event-Definitionen.
   *  duration : Sekunden (0 = Einmaleffekt)
   *  start/end: Callbacks mit dem Spielobjekt
   */
  const EVENTS = [
    {
      id: 'double',
      title: 'DOPPELTE NAHRUNG',
      sub: 'Alle Kugeln zaehlen doppelt',
      color: '#ffd84d',
      duration: 22,
      weight: 1.0,
      start(g) { g.food.valueMultiplier = 2; },
      end(g) { g.food.valueMultiplier = 1; }
    },
    {
      id: 'rain',
      title: 'KUGELREGEN',
      sub: 'Nahrung regnet auf die Arena',
      color: '#2ff3c8',
      duration: 0,
      weight: 0.9,
      start(g) {
        g.food.rain(Math.round(280 * g.eventScale));
        g.ui.flash('#2ff3c8');
      }
    },
    {
      id: 'gold',
      title: 'GOLDRAUSCH',
      sub: 'Wertvolle Goldkugeln erschienen',
      color: '#ffc22e',
      duration: 0,
      weight: 0.7,
      start(g) {
        g.food.goldRush(Math.round(34 * g.eventScale));
        g.ui.flash('#ffc22e');
      }
    },
    {
      id: 'frenzy',
      title: 'SPEED FRENZY',
      sub: 'Alle Schlangen sind schneller',
      color: '#ff5bd1',
      duration: 16,
      weight: 0.8,
      start(g) { g.globalSpeedScale = 1.28; },
      end(g) { g.globalSpeedScale = 1; }
    },
    {
      id: 'swarm',
      title: 'SCHWARM',
      sub: 'Neue Herausforderer betreten die Arena',
      color: '#a86bff',
      duration: 0,
      weight: 0.5,
      start(g) {
        const n = Utils.randInt(3, 5);
        for (let i = 0; i < n; i++) g.spawnAI(1, true);
      }
    }
  ];

  class EventManager {
    constructor(game) {
      this.game = game;
      this.active = null;
      this.remaining = 0;
      this.nextIn = Utils.rand(35, 55);
      this.enabled = true;
    }

    reset() {
      if (this.active && this.active.end) this.active.end(this.game);
      this.active = null;
      this.remaining = 0;
      this.nextIn = Utils.rand(35, 55);
      this.game.globalSpeedScale = 1;
      this.game.food.valueMultiplier = 1;
    }

    update(dt) {
      if (!this.enabled) return;

      if (this.active) {
        this.remaining -= dt;
        if (this.remaining <= 0) {
          if (this.active.end) this.active.end(this.game);
          this.active = null;
          this.nextIn = Utils.rand(38, 68);
        }
        return;
      }

      this.nextIn -= dt;
      if (this.nextIn <= 0) this.trigger();
    }

    /** Gewichtete Zufallsauswahl. */
    _pick() {
      let total = 0;
      for (let i = 0; i < EVENTS.length; i++) total += EVENTS[i].weight;
      let u = Math.random() * total;
      for (let i = 0; i < EVENTS.length; i++) {
        u -= EVENTS[i].weight;
        if (u <= 0) return EVENTS[i];
      }
      return EVENTS[0];
    }

    trigger(forceId) {
      const ev = forceId
        ? (EVENTS.filter(function (e) { return e.id === forceId; })[0] || this._pick())
        : this._pick();

      if (ev.start) ev.start(this.game);
      this.game.ui.showEventBanner(ev.title, ev.sub, ev.color);
      this.game.audio.playEvent();

      if (ev.duration > 0) {
        this.active = ev;
        this.remaining = ev.duration;
      } else {
        this.nextIn = Utils.rand(38, 68);
      }
    }

    /** Restlaufzeit fuer die HUD-Anzeige (oder null). */
    get status() {
      if (!this.active) return null;
      return { title: this.active.title, color: this.active.color, remaining: this.remaining };
    }
  }

  SNK.EventManager = EventManager;
  /** Nach aussen gelegt, damit neue Events leicht ergaenzt werden koennen. */
  SNK.EVENT_LIST = EVENTS;

})(typeof window !== 'undefined' ? window : this);
