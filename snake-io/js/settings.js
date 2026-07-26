/* ============================================================================
 *  settings.js
 *  Persistente Einstellungen + Highscore-Speicher (localStorage, fehlertolerant).
 * ==========================================================================*/
(function (global) {
  'use strict';

  const SNK = global.SNK || (global.SNK = {});
  const Utils = SNK.Utils;

  /* --------------------------------------------------------------------------
   * Grafik-Presets. Jede Stufe steuert Renderdetails und Partikelmengen.
   * ------------------------------------------------------------------------*/
  SNK.QUALITY = {
    low: {
      label: 'Niedrig',
      dprCap: 1,
      pixelBudget: 1.3e6,
      glow: false,
      shadows: false,
      motes: 0,
      foodPulse: false,
      particleScale: 0.35,
      maxParticles: 160,
      foodTarget: 800,
      fineGrid: false,
      vignette: false
    },
    medium: {
      label: 'Mittel',
      dprCap: 1.5,
      pixelBudget: 2.0e6,
      glow: true,
      shadows: true,
      motes: 70,
      foodPulse: true,
      particleScale: 0.7,
      maxParticles: 380,
      foodTarget: 1100,
      fineGrid: true,
      vignette: true
    },
    high: {
      label: 'Hoch',
      dprCap: 2,
      pixelBudget: 2.6e6,
      glow: true,
      shadows: true,
      motes: 160,
      foodPulse: true,
      particleScale: 1,
      maxParticles: 800,
      foodTarget: 1400,
      fineGrid: true,
      vignette: true
    }
  };

  const STORE_KEY = 'snakeio.settings.v1';
  const STATS_KEY = 'snakeio.stats.v1';

  /** Sicheres localStorage (Private Mode / deaktivierte Speicher werfen). */
  const safeStore = {
    get(key) {
      try { return global.localStorage.getItem(key); } catch (e) { return null; }
    },
    set(key, val) {
      try { global.localStorage.setItem(key, val); return true; } catch (e) { return false; }
    }
  };

  /* --------------------------------------------------------------------------
   * Settings
   * ------------------------------------------------------------------------*/
  const Settings = {
    data: {
      name: '',
      skin: 0,
      music: true,
      sfx: true,
      quality: 'high',
      zoom: 1
    },

    load() {
      // Auf Touch-Geraeten ist "Mittel" der sinnvollere Startwert.
      if (Utils.isTouchDevice()) this.data.quality = 'medium';

      const raw = safeStore.get(STORE_KEY);
      if (raw) {
        try {
          const p = JSON.parse(raw);
          if (typeof p.name === 'string') this.data.name = p.name;
          if (typeof p.skin === 'number') this.data.skin = p.skin;
          if (typeof p.music === 'boolean') this.data.music = p.music;
          if (typeof p.sfx === 'boolean') this.data.sfx = p.sfx;
          if (SNK.QUALITY[p.quality]) this.data.quality = p.quality;
          if (typeof p.zoom === 'number') this.data.zoom = Utils.clamp(p.zoom, 0.7, 1.6);
        } catch (e) { /* beschaedigte Daten ignorieren */ }
      }
      return this;
    },

    save() { safeStore.set(STORE_KEY, JSON.stringify(this.data)); },

    set(key, value) {
      this.data[key] = value;
      this.save();
    },

    /** Aktuelles Grafik-Preset. */
    get preset() { return SNK.QUALITY[this.data.quality] || SNK.QUALITY.high; }
  };

  /* --------------------------------------------------------------------------
   * Stats – Highscore & Rekorde
   * ------------------------------------------------------------------------*/
  const Stats = {
    data: { highscore: 0, bestLength: 0, bestTime: 0, games: 0, totalKills: 0 },

    load() {
      const raw = safeStore.get(STATS_KEY);
      if (raw) {
        try {
          const p = JSON.parse(raw);
          for (const k in this.data) {
            if (typeof p[k] === 'number' && isFinite(p[k])) this.data[k] = p[k];
          }
        } catch (e) { /* ignorieren */ }
      }
      return this;
    },

    save() { safeStore.set(STATS_KEY, JSON.stringify(this.data)); },

    /**
     * Ergebnis einer Runde verbuchen.
     * @returns {boolean} true, wenn ein neuer Highscore erreicht wurde.
     */
    submit(score, length, time, kills) {
      const isRecord = score > this.data.highscore;
      if (isRecord) this.data.highscore = Math.floor(score);
      if (length > this.data.bestLength) this.data.bestLength = Math.floor(length);
      if (time > this.data.bestTime) this.data.bestTime = time;
      this.data.games++;
      this.data.totalKills += kills || 0;
      this.save();
      return isRecord;
    }
  };

  SNK.Settings = Settings;
  SNK.Stats = Stats;

})(typeof window !== 'undefined' ? window : this);
