/* ============================================================================
 *  camera.js
 *  Weich folgende Kamera mit automatischer Zoomanpassung an die Schlangen-
 *  groesse, Nutzer-Zoomstufen und Screenshake.
 * ==========================================================================*/
(function (global) {
  'use strict';

  const SNK = global.SNK || (global.SNK = {});
  const Utils = SNK.Utils;

  class Camera {
    constructor() {
      this.x = 0; this.y = 0;
      this.zoom = 1;
      this.targetZoom = 1;
      this.userZoom = 1;         // aus den Einstellungen / Mausrad
      this.baseScale = 1;        // aus der Fenstergroesse
      this.shake = 0;
      this.shakeX = 0;
      this.shakeY = 0;
      this.viewW = 1; this.viewH = 1;
    }

    /** Basiszoom aus der Canvasgroesse: gleiches Spielgefuehl auf allen Geraeten. */
    resize(w, h) {
      this.viewW = w; this.viewH = h;
      this.baseScale = Utils.clamp(Math.sqrt(w * h) / 1250, 0.6, 1.45);
    }

    setUserZoom(z) { this.userZoom = Utils.clamp(z, 0.7, 1.6); }

    /** Kamera hart auf ein Ziel setzen (Rundenstart). */
    snapTo(x, y, radius) {
      this.x = x; this.y = y;
      this.zoom = this.targetZoom = this._fit(radius);
    }

    _fit(radius) {
      // Je dicker die Schlange, desto weiter der Blick.
      const fit = 1 / (1 + Math.max(0, radius - 9) * 0.021);
      return Utils.clamp(this.baseScale * fit * this.userZoom, 0.3, 2.2);
    }

    addShake(amount) {
      this.shake = Math.min(28, this.shake + amount);
    }

    /**
     * @param dt      echte Frame-Zeit (nicht der Simulationsschritt)
     * @param target  Objekt mit x/y/radius (kann null sein)
     */
    update(dt, target) {
      if (target) {
        // Etwas Vorausschau in Blickrichtung wirkt aufgeraeumter.
        const lead = Math.min(120, target.speed ? target.speed * 0.22 : 0);
        const tx = target.x + Math.cos(target.angle) * lead * 0.25;
        const ty = target.y + Math.sin(target.angle) * lead * 0.25;
        this.x = Utils.damp(this.x, tx, 7.5, dt);
        this.y = Utils.damp(this.y, ty, 7.5, dt);
        this.targetZoom = this._fit(target.radius);
      }
      this.zoom = Utils.damp(this.zoom, this.targetZoom, 3.2, dt);

      if (this.shake > 0.05) {
        this.shake = Utils.damp(this.shake, 0, 7, dt);
        const a = Math.random() * Utils.TAU;
        this.shakeX = Math.cos(a) * this.shake;
        this.shakeY = Math.sin(a) * this.shake;
      } else {
        this.shake = 0;
        this.shakeX = 0; this.shakeY = 0;
      }
    }

    /** Sichtbarer Weltbereich (mit Rand fuer Culling). */
    viewBounds(pad, out) {
      const hw = (this.viewW * 0.5) / this.zoom + pad;
      const hh = (this.viewH * 0.5) / this.zoom + pad;
      out.x0 = this.x - hw; out.x1 = this.x + hw;
      out.y0 = this.y - hh; out.y1 = this.y + hh;
      return out;
    }

    screenToWorld(sx, sy, out) {
      out.x = (sx - this.viewW * 0.5) / this.zoom + this.x;
      out.y = (sy - this.viewH * 0.5) / this.zoom + this.y;
      return out;
    }

    worldToScreen(wx, wy, out) {
      out.x = (wx - this.x) * this.zoom + this.viewW * 0.5;
      out.y = (wy - this.y) * this.zoom + this.viewH * 0.5;
      return out;
    }
  }

  SNK.Camera = Camera;

})(typeof window !== 'undefined' ? window : this);
