/* ============================================================================
 *  ui.js
 *  Alles DOM-basierte: Menues, HUD, Leaderboard, Countdown, Banner, Joystick.
 *  Textknoten werden gedrosselt aktualisiert (10 Hz), damit das Rendering
 *  nicht durch Layout-Arbeit gebremst wird.
 * ==========================================================================*/
(function (global) {
  'use strict';

  const SNK = global.SNK || (global.SNK = {});
  const Utils = SNK.Utils;
  const doc = global.document;

  const $ = function (id) { return doc.getElementById(id); };

  const LB_ROWS = 10;

  class UI {
    constructor(game) {
      this.game = game;
      this.el = {};
      this.lbRows = [];
      this._hudTimer = 0;
      this._settingsFrom = 'menu';
      this._cache = { score: -1, len: -1, alive: -1, fps: -1 };
      this._cacheEls();
      this._buildSkins();
      this._buildLeaderboard();
      this._bind();
      this.syncSettings();
    }

    _cacheEls() {
      const ids = [
        'overlay', 'screen-menu', 'screen-settings', 'screen-pause', 'screen-over',
        'nameInput', 'skinGrid', 'skinName', 'playBtn', 'settingsBtn',
        'menuHighscore', 'menuBestLen', 'menuGames',
        'setMusic', 'setSfx', 'setQuality', 'setZoom', 'fullscreenBtn', 'settingsBack',
        'resumeBtn', 'pauseSettingsBtn', 'quitBtn',
        'overScore', 'overLength', 'overTime', 'overRank', 'overKiller',
        'overBest', 'overRecord', 'retryBtn', 'overMenuBtn',
        'hud', 'fps', 'aliveCount', 'score', 'lengthVal', 'boostFill', 'boostWrap',
        'leaderboard', 'lbList', 'minimap', 'minimapWrap',
        'countdown', 'eventBanner', 'eventTitle', 'eventSub', 'eventChip',
        'joystick', 'joyBase', 'joyKnob', 'boostBtn', 'pauseBtn', 'hint', 'kills'
      ];
      for (let i = 0; i < ids.length; i++) this.el[ids[i]] = $(ids[i]);
    }

    /* ------------------------------------------------------------- Aufbau */

    _buildSkins() {
      const grid = this.el.skinGrid;
      if (!grid) return;
      const self = this;
      grid.textContent = '';
      SNK.SKINS.forEach(function (skin, i) {
        const b = doc.createElement('button');
        b.type = 'button';
        b.className = 'skin';
        b.style.background = SNK.skinPreview(skin);
        b.title = skin.name;
        b.setAttribute('aria-label', skin.name);
        b.dataset.index = String(i);
        b.addEventListener('click', function () { self.selectSkin(i, true); });
        grid.appendChild(b);
      });
    }

    _buildLeaderboard() {
      const list = this.el.lbList;
      if (!list) return;
      list.textContent = '';
      this.lbRows.length = 0;
      for (let i = 0; i < LB_ROWS; i++) {
        const row = doc.createElement('div');
        row.className = 'lb-row';
        const rank = doc.createElement('span');
        rank.className = 'lb-rank';
        rank.textContent = String(i + 1);
        const name = doc.createElement('span');
        name.className = 'lb-name';
        const score = doc.createElement('span');
        score.className = 'lb-score';
        row.appendChild(rank); row.appendChild(name); row.appendChild(score);
        list.appendChild(row);
        this.lbRows.push({
          row: row, rank: rank, name: name, score: score,
          cachedRank: String(i + 1), cachedName: '', cachedScore: ''
        });
      }
    }

    _bind() {
      const g = this.game;
      const self = this;

      const click = function (el, fn) {
        if (!el) return;
        el.addEventListener('click', function (e) {
          e.preventDefault();
          g.audio.unlock();
          g.audio.playClick();
          fn(e);
        });
      };

      click(this.el.playBtn, function () { g.startGame(); });
      click(this.el.settingsBtn, function () { self.openSettings('menu'); });
      click(this.el.settingsBack, function () { self.closeSettings(); });
      click(this.el.resumeBtn, function () { g.setPaused(false); });
      click(this.el.pauseSettingsBtn, function () { self.openSettings('pause'); });
      click(this.el.quitBtn, function () { g.quitToMenu(); });
      click(this.el.retryBtn, function () { g.startGame(); });
      click(this.el.overMenuBtn, function () { g.quitToMenu(); });
      click(this.el.pauseBtn, function () { g.setPaused(true); });

      click(this.el.setMusic, function () {
        g.audio.setMusic(!SNK.Settings.data.music);
        self.syncSettings();
      });
      click(this.el.setSfx, function () {
        g.audio.setSfx(!SNK.Settings.data.sfx);
        self.syncSettings();
      });
      click(this.el.fullscreenBtn, function () { self.toggleFullscreen(); });

      // Qualitaet & Zoom als Segment-Buttons
      const segs = doc.querySelectorAll('#setQuality [data-q]');
      for (let i = 0; i < segs.length; i++) {
        (function (btn) {
          btn.addEventListener('click', function () {
            g.audio.playClick();
            g.setQuality(btn.dataset.q);
            self.syncSettings();
          });
        })(segs[i]);
      }
      const zooms = doc.querySelectorAll('#setZoom [data-z]');
      for (let i = 0; i < zooms.length; i++) {
        (function (btn) {
          btn.addEventListener('click', function () {
            g.audio.playClick();
            g.setZoom(parseFloat(btn.dataset.z));
            self.syncSettings();
          });
        })(zooms[i]);
      }

      // Namensfeld
      if (this.el.nameInput) {
        this.el.nameInput.addEventListener('change', function () {
          SNK.Settings.set('name', self.el.nameInput.value.slice(0, 14));
        });
        this.el.nameInput.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') {
            e.preventDefault();
            self.el.nameInput.blur();
            g.startGame();
          }
        });
      }

      // Boost-Button (Touch)
      const bb = this.el.boostBtn;
      if (bb) {
        const down = function (e) {
          g.input.btnBoost = true;
          bb.classList.add('active');
          e.preventDefault();
        };
        const up = function (e) {
          g.input.btnBoost = false;
          bb.classList.remove('active');
          if (e) e.preventDefault();
        };
        bb.addEventListener('touchstart', down, { passive: false });
        bb.addEventListener('touchend', up, { passive: false });
        bb.addEventListener('touchcancel', up, { passive: false });
        bb.addEventListener('mousedown', down);
        global.addEventListener('mouseup', up);
      }

      // Vollbildwechsel spiegeln
      doc.addEventListener('fullscreenchange', function () { self.syncSettings(); });
    }

    /* ---------------------------------------------------------- Einstellungen */

    syncSettings() {
      const s = SNK.Settings.data;

      if (this.el.setMusic) {
        this.el.setMusic.classList.toggle('on', !!s.music);
        this.el.setMusic.querySelector('.sw-state').textContent = s.music ? 'AN' : 'AUS';
      }
      if (this.el.setSfx) {
        this.el.setSfx.classList.toggle('on', !!s.sfx);
        this.el.setSfx.querySelector('.sw-state').textContent = s.sfx ? 'AN' : 'AUS';
      }
      const segs = doc.querySelectorAll('#setQuality [data-q]');
      for (let i = 0; i < segs.length; i++) {
        segs[i].classList.toggle('on', segs[i].dataset.q === s.quality);
      }
      const zooms = doc.querySelectorAll('#setZoom [data-z]');
      for (let i = 0; i < zooms.length; i++) {
        zooms[i].classList.toggle('on', Math.abs(parseFloat(zooms[i].dataset.z) - s.zoom) < 0.01);
      }
      if (this.el.fullscreenBtn) {
        const fs = !!doc.fullscreenElement;
        this.el.fullscreenBtn.querySelector('.sw-state').textContent = fs ? 'AN' : 'AUS';
        this.el.fullscreenBtn.classList.toggle('on', fs);
      }

      if (this.el.nameInput && doc.activeElement !== this.el.nameInput) {
        this.el.nameInput.value = s.name || '';
      }
      this.selectSkin(s.skin, false);
      this.refreshRecords();
    }

    selectSkin(index, persist) {
      const skins = SNK.SKINS;
      const i = ((index % skins.length) + skins.length) % skins.length;
      const grid = this.el.skinGrid;
      if (grid) {
        const kids = grid.children;
        for (let k = 0; k < kids.length; k++) kids[k].classList.toggle('sel', k === i);
      }
      if (this.el.skinName) this.el.skinName.textContent = skins[i].name;
      if (persist) {
        SNK.Settings.set('skin', i);
        this.game.audio.playSoft();
      }
    }

    refreshRecords() {
      const st = SNK.Stats.data;
      if (this.el.menuHighscore) this.el.menuHighscore.textContent = Utils.formatNum(st.highscore);
      if (this.el.menuBestLen) this.el.menuBestLen.textContent = Utils.formatNum(st.bestLength);
      if (this.el.menuGames) this.el.menuGames.textContent = Utils.formatNum(st.games);
    }

    toggleFullscreen() {
      const root = doc.documentElement;
      if (!doc.fullscreenElement) {
        const p = root.requestFullscreen ? root.requestFullscreen() : null;
        if (p && p.catch) p.catch(function () { /* vom Browser abgelehnt */ });
      } else if (doc.exitFullscreen) {
        doc.exitFullscreen();
      }
    }

    /* --------------------------------------------------------------- Screens */

    /** @param name 'menu' | 'settings' | 'pause' | 'over' | null */
    showScreen(name) {
      const map = {
        menu: this.el['screen-menu'],
        settings: this.el['screen-settings'],
        pause: this.el['screen-pause'],
        over: this.el['screen-over']
      };
      for (const k in map) {
        if (map[k]) map[k].classList.toggle('show', k === name);
      }
      if (this.el.overlay) this.el.overlay.classList.toggle('show', name !== null);
      if (this.el.hud) this.el.hud.classList.toggle('dim', name !== null && name !== 'pause');
    }

    openSettings(from) {
      this._settingsFrom = from || 'menu';
      this.showScreen('settings');
    }

    closeSettings() {
      this.showScreen(this._settingsFrom === 'pause' ? 'pause' : 'menu');
    }

    /* ------------------------------------------------------------------ HUD */

    /** Jeden Frame: nur billige Style-Updates. */
    updateFast(dt) {
      const g = this.game;
      const p = g.player;

      // Boost-Reserve: Masse ueber der Boost-Schwelle.
      if (this.el.boostFill && p) {
        const C = SNK.Snake.C;
        const t = Utils.clamp((p.mass - C.MIN_BOOST_MASS) / 55, 0, 1);
        this.el.boostFill.style.transform = 'scaleX(' + t.toFixed(3) + ')';
        if (this.el.boostWrap) {
          this.el.boostWrap.classList.toggle('active', !!p.boosting);
          this.el.boostWrap.classList.toggle('empty', t <= 0.001);
        }
      }
    }

    /** 10 Hz: Textknoten. */
    updateSlow() {
      const g = this.game;
      const p = g.player;
      const c = this._cache;

      const fps = Math.round(g.fps);
      if (fps !== c.fps) {
        c.fps = fps;
        if (this.el.fps) this.el.fps.textContent = String(fps);
      }
      const alive = g.aliveCount;
      if (alive !== c.alive) {
        c.alive = alive;
        if (this.el.aliveCount) this.el.aliveCount.textContent = String(alive);
      }
      if (p) {
        const sc = Math.floor(p.score);
        if (sc !== c.score) {
          c.score = sc;
          if (this.el.score) this.el.score.textContent = Utils.formatNum(sc);
        }
        const len = p.length;
        if (len !== c.len) {
          c.len = len;
          if (this.el.lengthVal) this.el.lengthVal.textContent = Utils.formatNum(len);
        }
        if (this.el.kills) this.el.kills.textContent = String(p.kills);
      }

      this.updateLeaderboard();
      this.updateEventChip();
    }

    /**
     * Top-10-Liste. Steht der Spieler nicht in den Top 10, wird die letzte
     * Zeile durch seine echte Platzierung ersetzt – so sieht man den eigenen
     * Rang immer (io-Standard).
     */
    updateLeaderboard() {
      const g = this.game;
      const board = g.leaderboard;
      const rows = this.lbRows;
      const player = g.player;
      const pRank = g.playerRank;
      const pinPlayer = !!(player && player.alive && pRank > rows.length);
      // Flag fuer das CSS: auf kleinen Screens bleibt die angepinnte
      // Spielerzeile sichtbar, auch wenn die Mitte ausgeblendet wird.
      if (this.el.lbList) this.el.lbList.classList.toggle('pinned', pinPlayer);

      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const last = (i === rows.length - 1);
        const sn = (pinPlayer && last) ? player : board[i];
        const rankNo = (pinPlayer && last) ? pRank : (i + 1);

        if (!sn) {
          if (r.cachedName !== '') {
            r.cachedName = '';
            r.name.textContent = '—';
            r.score.textContent = '';
            r.row.classList.remove('me');
          }
          continue;
        }
        const rankTxt = String(rankNo);
        if (r.cachedRank !== rankTxt) {
          r.cachedRank = rankTxt;
          r.rank.textContent = rankTxt;
        }
        if (r.cachedName !== sn.name) {
          r.cachedName = sn.name;
          r.name.textContent = sn.name;
        }
        const sc = Utils.formatNum(sn.score);
        if (r.cachedScore !== sc) {
          r.cachedScore = sc;
          r.score.textContent = sc;
        }
        r.row.classList.toggle('me', sn === player);
      }
    }

    updateEventChip() {
      const chip = this.el.eventChip;
      if (!chip) return;
      const st = this.game.events.status;
      if (!st) {
        chip.classList.remove('show');
        return;
      }
      chip.classList.add('show');
      chip.style.color = st.color;
      chip.style.borderColor = Utils.rgba(st.color, 0.5);
      chip.textContent = st.title + '  ' + Math.ceil(st.remaining) + 's';
    }

    /* -------------------------------------------------------------- Effekte */

    showCountdown(text, big) {
      const el = this.el.countdown;
      if (!el) return;
      el.textContent = text;
      el.classList.toggle('go', !!big);
      el.classList.remove('pop');
      void el.offsetWidth;              // Reflow erzwingen -> Animation neu starten
      el.classList.add('pop');
      el.classList.add('show');
    }

    hideCountdown() {
      const el = this.el.countdown;
      if (el) { el.classList.remove('show'); el.classList.remove('pop'); }
    }

    showEventBanner(title, sub, color) {
      const b = this.el.eventBanner;
      if (!b) return;
      if (this.el.eventTitle) this.el.eventTitle.textContent = title;
      if (this.el.eventSub) this.el.eventSub.textContent = sub;
      b.style.setProperty('--ev', color);
      b.classList.remove('play');
      void b.offsetWidth;
      b.classList.add('play');
      this.flash(color);
    }

    flash(color) {
      if (this.game.renderer) this.game.renderer.flash(color);
    }

    showHint(text, seconds) {
      const el = this.el.hint;
      if (!el) return;
      el.textContent = text;
      el.classList.add('show');
      const self = this;
      global.clearTimeout(this._hintTimer);
      this._hintTimer = global.setTimeout(function () {
        el.classList.remove('show');
      }, (seconds || 4) * 1000);
    }

    /* ------------------------------------------------------------ Game Over */

    showGameOver(res) {
      if (this.el.overScore) this.el.overScore.textContent = Utils.formatNum(res.score);
      if (this.el.overLength) this.el.overLength.textContent = Utils.formatNum(res.maxLength);
      if (this.el.overTime) this.el.overTime.textContent = Utils.formatTime(res.time);
      if (this.el.overRank) this.el.overRank.textContent = '#' + res.rank;
      if (this.el.overKiller) {
        this.el.overKiller.textContent = res.killer
          ? ('Erledigt von ' + res.killer)
          : 'An der Arenagrenze gestorben';
      }
      if (this.el.overBest) this.el.overBest.textContent = Utils.formatNum(SNK.Stats.data.highscore);
      if (this.el.overRecord) this.el.overRecord.classList.toggle('show', !!res.isRecord);
      this.refreshRecords();
      this.showScreen('over');
    }

    /* ------------------------------------------------------------- Joystick */

    setTouchMode(on) {
      doc.body.classList.toggle('touch', !!on);
    }

    updateJoystick(input) {
      const j = this.el.joystick;
      if (!j) return;
      if (!input.joyActive) {
        j.classList.remove('show');
        return;
      }
      j.classList.add('show');
      const base = this.el.joyBase, knob = this.el.joyKnob;
      if (base) {
        base.style.left = input.joyBaseX + 'px';
        base.style.top = input.joyBaseY + 'px';
      }
      if (knob) {
        knob.style.left = input.joyX + 'px';
        knob.style.top = input.joyY + 'px';
        knob.classList.toggle('max', input.joyMag > 0.93);
      }
    }
  }

  SNK.UI = UI;

})(typeof window !== 'undefined' ? window : this);
