/* ============================================================================
 *  input.js
 *  Eingaben fuer Maus, Tastatur und Touch.
 *
 *  PC     : Maus zeigt die Richtung, linke Maustaste (oder Leertaste) boostet.
 *  Handy  : Virtueller Joystick (erscheint am Beruehrpunkt) + Boost-Button.
 *           Joystick voll ausgelenkt oder zweiter Finger boostet ebenfalls.
 * ==========================================================================*/
(function (global) {
  'use strict';

  const SNK = global.SNK || (global.SNK = {});

  /** Auslenkung des Joysticks in CSS-Pixeln bis Anschlag. */
  const JOY_RADIUS = 62;

  class Input {
    constructor(canvas) {
      this.canvas = canvas;

      /* Maus / Zeiger */
      this.pointerX = 0;
      this.pointerY = 0;
      this.hasPointer = false;
      this.mouseBoost = false;

      /* Tastatur */
      this.keys = Object.create(null);
      this.keyBoost = false;

      /* Touch */
      this.touchMode = false;
      this.joyActive = false;
      this.joyId = -1;
      this.joyBaseX = 0; this.joyBaseY = 0;
      this.joyX = 0; this.joyY = 0;        // Knopfposition (begrenzt)
      this.joyDX = 0; this.joyDY = 0;      // normierte Richtung
      this.joyMag = 0;
      this.extraTouches = 0;
      this.btnBoost = false;

      /* Callbacks, vom Spiel gesetzt */
      this.onPause = null;
      this.onConfirm = null;
      this.onZoom = null;
      this.onFirstInteraction = null;
      this.onJoystickChange = null;

      this._interacted = false;
      this._bound = false;
    }

    /** true, wenn irgendeine Boost-Quelle aktiv ist. */
    get boosting() {
      return this.mouseBoost || this.keyBoost || this.btnBoost ||
        this.extraTouches > 0 || (this.joyActive && this.joyMag > 0.93);
    }

    /* ------------------------------------------------------------- Bindung */

    attach() {
      if (this._bound) return;
      this._bound = true;
      const el = this.canvas;
      const self = this;

      /* --- Maus ---------------------------------------------------------- */
      el.addEventListener('mousemove', function (e) {
        if (self.touchMode) return;
        const r = el.getBoundingClientRect();
        self.pointerX = e.clientX - r.left;
        self.pointerY = e.clientY - r.top;
        self.hasPointer = true;
      }, { passive: true });

      el.addEventListener('mousedown', function (e) {
        self._touch();
        if (self.touchMode) return;
        const r = el.getBoundingClientRect();
        self.pointerX = e.clientX - r.left;
        self.pointerY = e.clientY - r.top;
        self.hasPointer = true;
        if (e.button === 0) self.mouseBoost = true;
        e.preventDefault();
      });

      global.addEventListener('mouseup', function (e) {
        if (e.button === 0) self.mouseBoost = false;
      });

      global.addEventListener('blur', function () {
        self.mouseBoost = false;
        self.keyBoost = false;
        self.btnBoost = false;
        self.extraTouches = 0;
        self.keys = Object.create(null);
        self._releaseJoy();
      });

      el.addEventListener('contextmenu', function (e) { e.preventDefault(); });

      /* --- Mausrad = Zoomstufe ------------------------------------------- */
      el.addEventListener('wheel', function (e) {
        e.preventDefault();
        if (self.onZoom) self.onZoom(e.deltaY < 0 ? 1 : -1);
      }, { passive: false });

      /* --- Touch --------------------------------------------------------- */
      el.addEventListener('touchstart', function (e) {
        self.touchMode = true;
        self._touch();
        const r = el.getBoundingClientRect();
        for (let i = 0; i < e.changedTouches.length; i++) {
          const t = e.changedTouches[i];
          if (!self.joyActive) {
            self.joyActive = true;
            self.joyId = t.identifier;
            self.joyBaseX = t.clientX - r.left;
            self.joyBaseY = t.clientY - r.top;
            self.joyX = self.joyBaseX;
            self.joyY = self.joyBaseY;
            self.joyDX = 0; self.joyDY = 0; self.joyMag = 0;
            self._emitJoy();
          } else if (t.identifier !== self.joyId) {
            self.extraTouches++;
          }
        }
        e.preventDefault();
      }, { passive: false });

      el.addEventListener('touchmove', function (e) {
        const r = el.getBoundingClientRect();
        for (let i = 0; i < e.changedTouches.length; i++) {
          const t = e.changedTouches[i];
          if (self.joyActive && t.identifier === self.joyId) {
            const px = t.clientX - r.left;
            const py = t.clientY - r.top;
            let dx = px - self.joyBaseX;
            let dy = py - self.joyBaseY;
            const len = Math.sqrt(dx * dx + dy * dy);
            if (len > 0.0001) {
              const clamped = Math.min(len, JOY_RADIUS);
              self.joyDX = dx / len;
              self.joyDY = dy / len;
              self.joyMag = clamped / JOY_RADIUS;
              self.joyX = self.joyBaseX + self.joyDX * clamped;
              self.joyY = self.joyBaseY + self.joyDY * clamped;
            }
            self._emitJoy();
          }
        }
        e.preventDefault();
      }, { passive: false });

      const endTouch = function (e) {
        for (let i = 0; i < e.changedTouches.length; i++) {
          const t = e.changedTouches[i];
          if (self.joyActive && t.identifier === self.joyId) {
            self._releaseJoy();
          } else if (self.extraTouches > 0) {
            self.extraTouches--;
          }
        }
        e.preventDefault();
      };
      el.addEventListener('touchend', endTouch, { passive: false });
      el.addEventListener('touchcancel', endTouch, { passive: false });

      /* --- Tastatur ------------------------------------------------------ */
      global.addEventListener('keydown', function (e) {
        const k = e.key;
        const lower = typeof k === 'string' ? k.toLowerCase() : '';

        if (k === 'Escape' || lower === 'p') {
          if (self.onPause) self.onPause();
          e.preventDefault();
          return;
        }
        if (k === 'Enter') {
          if (self.onConfirm) self.onConfirm();
          return;
        }
        // Bei Texteingabe keine Spielsteuerung ausloesen.
        const tag = e.target && e.target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;

        if (k === ' ' || k === 'Spacebar') {
          self.keyBoost = true;
          self._touch();
          e.preventDefault();
        }
        if (lower === '+' || k === '=') { if (self.onZoom) self.onZoom(1); }
        if (lower === '-') { if (self.onZoom) self.onZoom(-1); }
        self.keys[lower] = true;
        self.keys[k] = true;
        if (k.indexOf('Arrow') === 0) e.preventDefault();
      });

      global.addEventListener('keyup', function (e) {
        const k = e.key;
        const lower = typeof k === 'string' ? k.toLowerCase() : '';
        if (k === ' ' || k === 'Spacebar') self.keyBoost = false;
        self.keys[lower] = false;
        self.keys[k] = false;
      });
    }

    _touch() {
      if (this._interacted) return;
      this._interacted = true;
      if (this.onFirstInteraction) this.onFirstInteraction();
    }

    _releaseJoy() {
      this.joyActive = false;
      this.joyId = -1;
      this.joyMag = 0;
      this.joyDX = 0; this.joyDY = 0;
      this._emitJoy();
    }

    _emitJoy() {
      if (this.onJoystickChange) this.onJoystickChange(this);
    }

    /** Richtungsvektor aus WASD / Pfeiltasten, oder null. */
    _keyVector(out) {
      const k = this.keys;
      let x = 0, y = 0;
      if (k['a'] || k['ArrowLeft'] || k['arrowleft']) x -= 1;
      if (k['d'] || k['ArrowRight'] || k['arrowright']) x += 1;
      if (k['w'] || k['ArrowUp'] || k['arrowup']) y -= 1;
      if (k['s'] || k['ArrowDown'] || k['arrowdown']) y += 1;
      if (x === 0 && y === 0) return null;
      out.x = x; out.y = y;
      return out;
    }

    /**
     * Gewuenschter Blickwinkel der Schlange.
     * @param px,py  Bildschirmposition des Schlangenkopfes
     * @returns Winkel in Radiant oder null (Richtung beibehalten)
     */
    desiredAngle(px, py) {
      if (this.joyActive && this.joyMag > 0.14) {
        return Math.atan2(this.joyDY, this.joyDX);
      }
      const kv = this._keyVector(_tmpVec);
      if (kv) return Math.atan2(kv.y, kv.x);
      if (this.hasPointer && !this.touchMode) {
        const dx = this.pointerX - px;
        const dy = this.pointerY - py;
        if (dx * dx + dy * dy > 144) return Math.atan2(dy, dx);
      }
      return null;
    }

    /** Alle Boost-Quellen loesen (z. B. beim Pausieren). */
    releaseAll() {
      this.mouseBoost = false;
      this.keyBoost = false;
      this.btnBoost = false;
      this.extraTouches = 0;
      this._releaseJoy();
    }

    get joyRadius() { return JOY_RADIUS; }
  }

  const _tmpVec = { x: 0, y: 0 };

  SNK.Input = Input;

})(typeof window !== 'undefined' ? window : this);
