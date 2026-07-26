/* ============================================================================
 *  renderer.js
 *  Canvas-Rendering.
 *
 *  Alles wird in WELTKOORDINATEN gezeichnet: die Kameratransformation liegt
 *  direkt in der Canvas-Matrix (setTransform). Das ist schneller als eigene
 *  Projektion in JS und haelt den Code kurz.
 *
 *  Culling: Nahrung kommt nur aus den sichtbaren Gitterzellen, Schlangen
 *  werden per Bounding-Box und pro Farbband geprueft.
 * ==========================================================================*/
(function (global) {
  'use strict';

  const SNK = global.SNK || (global.SNK = {});
  const Utils = SNK.Utils;
  const TAU = Utils.TAU;
  const PT = SNK.PARTICLE_TYPE;

  /** Bis zu wie vielen Segmenten der Glow ueber den ganzen Koerper geht. */
  const GLOW_NODE_LIMIT = 160;

  const GRID_FINE = 64;
  const GRID_COARSE = 320;

  class Renderer {
    constructor(canvas, minimapCanvas, game) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d', { alpha: false });
      this.mini = minimapCanvas;
      this.miniCtx = minimapCanvas ? minimapCanvas.getContext('2d') : null;
      this.game = game;

      this.w = 0; this.h = 0;
      this.dpr = 1;

      this.bg = null;              // gecachter Hintergrundgradient
      this.vignette = null;
      this.motes = [];
      this.view = { x0: 0, y0: 0, x1: 0, y1: 0 };

      this._foodBuf = [];
      this._miniTimer = 0;
      this._flash = 0;
      this._flashColor = '#ffffff';
    }

    /* --------------------------------------------------------------- Setup */

    resize() {
      const q = SNK.Settings.preset;
      const cssW = this.canvas.clientWidth || global.innerWidth;
      const cssH = this.canvas.clientHeight || global.innerHeight;

      // Geraete-Pixelverhaeltnis, aber mit Pixelbudget: auf 4K-/Retina-
      // Displays waere dpr 2 reine Fuellraten-Verschwendung. Kleine Screens
      // bekommen die volle Schaerfe, grosse werden sanft begrenzt.
      const budget = q.pixelBudget || 4.0e6;
      const fit = Math.sqrt(budget / Math.max(1, cssW * cssH));
      const dpr = Math.max(1, Math.min(global.devicePixelRatio || 1, q.dprCap, fit));

      this.dpr = dpr;
      this.w = cssW;
      this.h = cssH;
      this.canvas.width = Math.max(1, Math.round(cssW * dpr));
      this.canvas.height = Math.max(1, Math.round(cssH * dpr));

      this._buildBackground();
      this.game.camera.resize(cssW, cssH);
      this.buildMotes();

      if (this.mini) {
        const s = this.mini.clientWidth || 150;
        this.mini.width = Math.round(s * Math.min(dpr, 2));
        this.mini.height = Math.round(s * Math.min(dpr, 2));
        this.miniSize = this.mini.width;
      }
    }

    _buildBackground() {
      const ctx = this.ctx;
      const g = ctx.createLinearGradient(0, 0, this.w * 0.6, this.h);
      g.addColorStop(0, '#0b1020');
      g.addColorStop(0.45, '#080c16');
      g.addColorStop(1, '#05070e');
      this.bg = g;

      const v = ctx.createRadialGradient(
        this.w * 0.5, this.h * 0.5, Math.min(this.w, this.h) * 0.28,
        this.w * 0.5, this.h * 0.5, Math.max(this.w, this.h) * 0.78
      );
      v.addColorStop(0, 'rgba(0,0,0,0)');
      v.addColorStop(1, 'rgba(0,0,0,0.55)');
      this.vignette = v;

      // Warnstreifen an den Bildschirmkanten (Naehe zur Arenagrenze).
      const band = Math.min(this.w, this.h) * 0.24;
      const mk = function (x0, y0, x1, y1) {
        const gr = ctx.createLinearGradient(x0, y0, x1, y1);
        gr.addColorStop(0, 'rgba(255,50,85,0.42)');
        gr.addColorStop(0.45, 'rgba(255,40,80,0.12)');
        gr.addColorStop(1, 'rgba(255,40,80,0)');
        return gr;
      };
      this.danger = {
        band: band,
        left: mk(0, 0, band, 0),
        right: mk(this.w, 0, this.w - band, 0),
        top: mk(0, 0, 0, band),
        bottom: mk(0, this.h, 0, this.h - band)
      };
    }

    /** Schwebende Hintergrundpartikel neu aufbauen (Qualitaetswechsel/Resize). */
    buildMotes() {
      const q = SNK.Settings.preset;
      const n = q.motes;
      const cam = this.game.camera;
      const spanX = this.w / cam.zoom + 300;
      const spanY = this.h / cam.zoom + 300;
      this.motes.length = 0;
      for (let i = 0; i < n; i++) {
        this.motes.push({
          x: cam.x + Utils.rand(-spanX * 0.5, spanX * 0.5),
          y: cam.y + Utils.rand(-spanY * 0.5, spanY * 0.5),
          vx: Utils.rand(-9, 9),
          vy: Utils.rand(-9, 9),
          r: Utils.rand(0.8, 2.6),
          a: Utils.rand(0.06, 0.3),
          hue: Math.random() < 0.5 ? '#2ff3c8' : '#7c5cff'
        });
      }
    }

    /** Kurzer Vollbild-Blitz (Events). */
    flash(color) {
      this._flash = 0.55;
      this._flashColor = color || '#ffffff';
    }

    /* -------------------------------------------------------------- Render */

    render(dt) {
      const g = this.game;
      const cam = g.camera;
      const ctx = this.ctx;
      const q = SNK.Settings.preset;
      const dpr = this.dpr;

      /* --- Hintergrund (Bildschirmraum) --------------------------------- */
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = this.bg;
      ctx.fillRect(0, 0, this.w, this.h);

      /* --- Weltraum-Transformation -------------------------------------- */
      const z = cam.zoom;
      const ox = (this.w * 0.5 - cam.x * z) + cam.shakeX;
      const oy = (this.h * 0.5 - cam.y * z) + cam.shakeY;
      ctx.setTransform(z * dpr, 0, 0, z * dpr, ox * dpr, oy * dpr);

      cam.viewBounds(80, this.view);
      const view = this.view;

      this._drawGrid(ctx, view, z, q);
      if (q.motes > 0) this._drawMotes(ctx, dt, view);
      this._drawBounds(ctx, view, z, g.world);
      this._drawFood(ctx, view, q, g);
      this._drawSnakes(ctx, view, q, g);
      this._drawParticles(ctx, view, g);

      /* --- Bildschirm-Overlays ------------------------------------------ */
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (q.vignette) {
        ctx.fillStyle = this.vignette;
        ctx.fillRect(0, 0, this.w, this.h);
      }
      this._drawDanger(ctx, g);
      if (this._flash > 0) {
        this._flash = Math.max(0, this._flash - dt * 1.6);
        ctx.globalAlpha = this._flash * 0.35;
        ctx.fillStyle = this._flashColor;
        ctx.fillRect(0, 0, this.w, this.h);
        ctx.globalAlpha = 1;
      }

      /* --- Minimap (gedrosselt) ----------------------------------------- */
      this._miniTimer -= dt;
      if (this._miniTimer <= 0) {
        this._miniTimer = 1 / 20;
        this._drawMinimap();
      }
    }

    /* ---------------------------------------------------------------- Grid */

    _drawGrid(ctx, view, zoom, q) {
      // Feines Gitter nur zeichnen, wenn die Linien noch auseinanderliegen.
      if (q.fineGrid && GRID_FINE * zoom > 13) {
        ctx.beginPath();
        const x0 = Math.floor(view.x0 / GRID_FINE) * GRID_FINE;
        const y0 = Math.floor(view.y0 / GRID_FINE) * GRID_FINE;
        for (let x = x0; x <= view.x1; x += GRID_FINE) {
          ctx.moveTo(x, view.y0); ctx.lineTo(x, view.y1);
        }
        for (let y = y0; y <= view.y1; y += GRID_FINE) {
          ctx.moveTo(view.x0, y); ctx.lineTo(view.x1, y);
        }
        ctx.lineWidth = 1 / zoom;
        ctx.strokeStyle = 'rgba(90,150,190,0.055)';
        ctx.stroke();
      }

      ctx.beginPath();
      const cx0 = Math.floor(view.x0 / GRID_COARSE) * GRID_COARSE;
      const cy0 = Math.floor(view.y0 / GRID_COARSE) * GRID_COARSE;
      for (let x = cx0; x <= view.x1; x += GRID_COARSE) {
        ctx.moveTo(x, view.y0); ctx.lineTo(x, view.y1);
      }
      for (let y = cy0; y <= view.y1; y += GRID_COARSE) {
        ctx.moveTo(view.x0, y); ctx.lineTo(view.x1, y);
      }
      ctx.lineWidth = 1.4 / zoom;
      ctx.strokeStyle = 'rgba(60,220,220,0.075)';
      ctx.stroke();
    }

    _drawMotes(ctx, dt, view) {
      const cam = this.game.camera;
      const spanX = this.w / cam.zoom + 300;
      const spanY = this.h / cam.zoom + 300;
      const motes = this.motes;
      const t = this.game.clock;

      for (let i = 0; i < motes.length; i++) {
        const m = motes[i];
        m.x += m.vx * dt;
        m.y += m.vy * dt;
        // Weiches Umwickeln um die Kamera – Partikel bleiben immer in Sicht.
        const rx = m.x - cam.x;
        if (rx > spanX * 0.5) m.x -= spanX;
        else if (rx < -spanX * 0.5) m.x += spanX;
        const ry = m.y - cam.y;
        if (ry > spanY * 0.5) m.y -= spanY;
        else if (ry < -spanY * 0.5) m.y += spanY;

        const a = m.a * (0.6 + 0.4 * Math.sin(t * 1.4 + i));
        ctx.globalAlpha = a;
        ctx.fillStyle = m.hue;
        ctx.beginPath();
        ctx.arc(m.x, m.y, m.r, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    /* -------------------------------------------------------------- Grenze */

    _drawBounds(ctx, view, zoom, world) {
      const W = world.width, H = world.height;

      // Bereich ausserhalb der Arena abdunkeln + rot einfaerben.
      ctx.fillStyle = 'rgba(120,14,34,0.20)';
      const ix0 = Math.max(view.x0, 0), ix1 = Math.min(view.x1, W);
      if (view.x0 < 0) ctx.fillRect(view.x0, view.y0, -view.x0, view.y1 - view.y0);
      if (view.x1 > W) ctx.fillRect(W, view.y0, view.x1 - W, view.y1 - view.y0);
      if (view.y0 < 0 && ix1 > ix0) ctx.fillRect(ix0, view.y0, ix1 - ix0, -view.y0);
      if (view.y1 > H && ix1 > ix0) ctx.fillRect(ix0, H, ix1 - ix0, view.y1 - H);

      ctx.fillStyle = 'rgba(4,6,12,0.62)';
      if (view.x0 < 0) ctx.fillRect(view.x0, view.y0, -view.x0, view.y1 - view.y0);
      if (view.x1 > W) ctx.fillRect(W, view.y0, view.x1 - W, view.y1 - view.y0);
      if (view.y0 < 0 && ix1 > ix0) ctx.fillRect(ix0, view.y0, ix1 - ix0, -view.y0);
      if (view.y1 > H && ix1 > ix0) ctx.fillRect(ix0, H, ix1 - ix0, view.y1 - H);

      // Nur zeichnen, wenn die Grenze ueberhaupt im Bild ist.
      if (view.x1 < -60 || view.x0 > W + 60 || view.y1 < -60 || view.y0 > H + 60) return;

      const pulse = 0.55 + 0.45 * Math.sin(this.game.clock * 2.2);
      ctx.lineWidth = 22 / zoom;
      ctx.strokeStyle = 'rgba(255,60,90,' + (0.05 + 0.05 * pulse).toFixed(3) + ')';
      ctx.strokeRect(0, 0, W, H);
      ctx.lineWidth = 8 / zoom;
      ctx.strokeStyle = 'rgba(255,70,110,' + (0.16 + 0.12 * pulse).toFixed(3) + ')';
      ctx.strokeRect(0, 0, W, H);
      ctx.lineWidth = 2.4 / zoom;
      ctx.strokeStyle = 'rgba(255,150,180,' + (0.55 + 0.25 * pulse).toFixed(3) + ')';
      ctx.strokeRect(0, 0, W, H);
    }

    /* ------------------------------------------------------------ Nahrung */

    _drawFood(ctx, view, q, g) {
      const fm = g.food;
      const buf = fm.queryRect(view.x0 - 50, view.y0 - 50, view.x1 + 50, view.y1 + 50, this._foodBuf);
      const sprites = q.glow ? fm.sprites : fm.spritesFlat;
      const gf = SNK.FOOD_GLOW_FACTOR;
      const t = g.clock;
      const pulse = q.foodPulse;

      for (let i = 0; i < buf.length; i++) {
        const f = buf[i];
        if (!f.alive) continue;
        let s = f.r * gf;
        if (pulse) s *= 1 + 0.11 * Math.sin(t * 3.1 + f.phase);
        ctx.drawImage(sprites[f.ci], f.x - s, f.y - s, s * 2, s * 2);
      }
    }

    /* ------------------------------------------------------------ Schlangen */

    _drawSnakes(ctx, view, q, g) {
      const snakes = g.snakes;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      // Sichtbare Schlangen einmal sammeln und ihren Pfad EINMAL bauen –
      // Schatten- und Koerperdurchgang teilen sich dasselbe Path2D.
      const vis = this._vis || (this._vis = []);
      const paths = this._paths || (this._paths = []);
      vis.length = 0;
      for (let i = 0; i < snakes.length; i++) {
        const sn = snakes[i];
        if (!sn.alive || sn.liveNodes < 1 || !this._visible(sn, view)) continue;
        paths[vis.length] = this._bodyPath(sn);
        vis.push(sn);
      }

      // Erst alle Schatten, dann alle Koerper -> keine Schatten auf Koerpern.
      if (q.shadows) {
        for (let i = 0; i < vis.length; i++) this._drawShadow(ctx, vis[i], paths[i]);
      }
      for (let i = 0; i < vis.length; i++) {
        this._drawSnake(ctx, vis[i], paths[i], view, q, g);
      }
      // Namen zuletzt, damit sie nie verdeckt werden.
      for (let i = 0; i < snakes.length; i++) {
        const sn = snakes[i];
        if (sn.alive && sn.liveNodes > 0 && this._headVisible(sn, view)) {
          this._drawName(ctx, sn, g.camera.zoom);
        }
      }
    }

    _visible(sn, view) {
      const pad = sn.radius * 2 + 30;
      return !(sn.maxX < view.x0 - pad || sn.minX > view.x1 + pad ||
        sn.maxY < view.y0 - pad || sn.minY > view.y1 + pad);
    }

    _headVisible(sn, view) {
      const h = sn.nodes[0];
      const pad = sn.radius * 3 + 40;
      return h.x > view.x0 - pad && h.x < view.x1 + pad &&
        h.y > view.y0 - pad && h.y < view.y1 + pad;
    }

    /** Polyline des Koerpers als wiederverwendbares Path2D. */
    _bodyPath(sn, limit) {
      const nodes = sn.nodes;
      const n = limit ? Math.min(limit, sn.liveNodes) : sn.liveNodes;
      const p = new global.Path2D();
      p.moveTo(nodes[0].x, nodes[0].y);
      for (let i = 1; i < n; i++) p.lineTo(nodes[i].x, nodes[i].y);
      return p;
    }

    /**
     * Schatten. Absichtlich schmaler als der Koerper: sichtbar ist ohnehin
     * nur der versetzte Rand, das spart aber deutlich Fuellrate.
     */
    _drawShadow(ctx, sn, path) {
      const r = sn.radius;
      ctx.save();
      ctx.translate(r * 0.32, r * 0.44);
      ctx.lineWidth = r * 1.5;
      ctx.strokeStyle = 'rgba(0,0,0,0.34)';
      ctx.stroke(path);
      ctx.restore();
    }

    _drawSnake(ctx, sn, path, view, q, g) {
      const nodes = sn.nodes;
      const n = sn.liveNodes;
      const r = sn.radius;
      const skin = sn.skin;
      const offset = skin.scroll ? Math.floor(sn.skinTime * skin.scroll) : 0;

      // Unverwundbar = blinkend halbtransparent.
      if (sn.invuln > 0) {
        ctx.globalAlpha = 0.45 + 0.3 * Math.abs(Math.sin(sn.invuln * 14));
      }

      /* Aussenleuchten.
         Jeder Strich kostet die volle Koerperflaeche an Fuellrate, deshalb
         bekommt nur der Spieler bzw. eine boostende Schlange den doppelten,
         weiten Glow – alle anderen einen einzelnen, engen. */
      if (q.glow) {
        // Bei sehr langen Koerpern leuchtet nur der vordere Abschnitt.
        // Optisch faellt das nicht auf (der Kopfbereich traegt den Effekt),
        // spart aber bei Riesenschlangen eine komplette Bildschirmfuellung.
        const glowPath = (n > GLOW_NODE_LIMIT)
          ? this._bodyPath(sn, GLOW_NODE_LIMIT)
          : path;
        const strong = sn.isPlayer || sn.boosting;
        if (strong) {
          const boost = sn.boosting ? 1 : 0;
          ctx.lineWidth = r * 2 + 16 + boost * 12;
          ctx.strokeStyle = Utils.rgba(skin.glow, 0.06 + boost * 0.075);
          ctx.stroke(glowPath);
          ctx.lineWidth = r * 2 + 7 + boost * 6;
          ctx.strokeStyle = Utils.rgba(skin.glow, 0.11 + boost * 0.14);
          ctx.stroke(glowPath);
        } else {
          ctx.lineWidth = r * 2 + 9;
          ctx.strokeStyle = Utils.rgba(skin.glow, 0.10);
          ctx.stroke(glowPath);
        }
      }

      /* Umrandung */
      ctx.lineWidth = r * 2 + 3.4;
      ctx.strokeStyle = skin.outline;
      ctx.stroke(path);

      /* Farbbaender */
      ctx.lineWidth = r * 2;
      let i = 0;
      const vx0 = view.x0 - r * 2, vx1 = view.x1 + r * 2;
      const vy0 = view.y0 - r * 2, vy1 = view.y1 + r * 2;
      while (i < n - 1) {
        const c = SNK.skinColorAt(skin, i, offset);
        let j = i + 1;
        while (j < n - 1 && SNK.skinColorAt(skin, j, offset) === c) j++;
        const last = Math.min(j + 1, n - 1);

        // Bandweises Culling: lange Schlangen kosten nur den sichtbaren Teil.
        let bx0 = Infinity, bx1 = -Infinity, by0 = Infinity, by1 = -Infinity;
        for (let k = i; k <= last; k++) {
          const nd = nodes[k];
          if (nd.x < bx0) bx0 = nd.x;
          if (nd.x > bx1) bx1 = nd.x;
          if (nd.y < by0) by0 = nd.y;
          if (nd.y > by1) by1 = nd.y;
        }
        if (bx1 >= vx0 && bx0 <= vx1 && by1 >= vy0 && by0 <= vy1) {
          ctx.beginPath();
          ctx.moveTo(nodes[i].x, nodes[i].y);
          for (let k = i + 1; k <= last; k++) ctx.lineTo(nodes[k].x, nodes[k].y);
          ctx.strokeStyle = c;
          ctx.stroke();
        }
        i = j;
      }

      /* Kopf */
      this._drawHead(ctx, sn, offset, q);

      ctx.globalAlpha = 1;
    }

    _drawHead(ctx, sn, offset, q) {
      const h = sn.nodes[0];
      const r = sn.radius;
      const skin = sn.skin;
      const a = sn.angle;
      const ex = Math.cos(a), ey = Math.sin(a);
      const px = -ey, py = ex;

      // Kopfkugel
      ctx.beginPath();
      ctx.arc(h.x, h.y, r, 0, TAU);
      ctx.fillStyle = SNK.skinColorAt(skin, 0, offset);
      ctx.fill();
      ctx.lineWidth = 3.2;
      ctx.strokeStyle = skin.outline;
      ctx.stroke();

      // Glanzlicht
      if (q.glow) {
        ctx.beginPath();
        ctx.arc(h.x - ex * r * 0.15 + px * r * 0.2, h.y - ey * r * 0.15 + py * r * 0.2,
          r * 0.42, 0, TAU);
        ctx.fillStyle = 'rgba(255,255,255,0.14)';
        ctx.fill();
      }

      // Augen
      const eo = r * 0.46, ef = r * 0.4, er = Math.max(1.6, r * 0.3);
      for (let s = -1; s <= 1; s += 2) {
        const cx = h.x + ex * ef + px * eo * s;
        const cy = h.y + ey * ef + py * eo * s;
        ctx.beginPath();
        ctx.arc(cx, cy, er, 0, TAU);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx + ex * er * 0.45, cy + ey * er * 0.45, er * 0.52, 0, TAU);
        ctx.fillStyle = '#0a0d16';
        ctx.fill();
      }
    }

    _drawName(ctx, sn, zoom) {
      const h = sn.nodes[0];
      const r = sn.radius;
      const px = Utils.clamp(12 + r * 0.32, 12, 22);   // konstante Bildschirmgroesse
      const size = px / zoom;
      ctx.font = '700 ' + size.toFixed(2) + 'px "Segoe UI", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      const y = h.y - r - 9 / zoom;

      ctx.lineWidth = 3.2 / zoom;
      ctx.strokeStyle = 'rgba(3,5,10,0.85)';
      ctx.strokeText(sn.name, h.x, y);
      ctx.fillStyle = sn.isPlayer ? '#eaffff' : 'rgba(226,238,255,0.86)';
      ctx.fillText(sn.name, h.x, y);
    }

    /* -------------------------------------------------------- Randwarnung */

    /**
     * Rot pulsierende Bildschirmkante, wenn der Spieler der toedlichen
     * Arenagrenze zu nahe kommt.
     */
    _drawDanger(ctx, g) {
      const p = g.player;
      if (!p || !p.alive || !this.danger) return;
      const D = 520;
      const w = g.world;
      const d = this.danger;
      const pulse = 0.72 + 0.28 * Math.sin(g.clock * 7);

      const strip = function (dist, style, x, y, sw, sh) {
        if (dist >= D) return;
        const t = 1 - dist / D;
        ctx.globalAlpha = t * t * pulse;
        ctx.fillStyle = style;
        ctx.fillRect(x, y, sw, sh);
      };

      strip(p.x, d.left, 0, 0, d.band, this.h);
      strip(w.width - p.x, d.right, this.w - d.band, 0, d.band, this.h);
      strip(p.y, d.top, 0, 0, this.w, d.band);
      strip(w.height - p.y, d.bottom, 0, this.h - d.band, this.w, d.band);
      ctx.globalAlpha = 1;
    }

    /* ----------------------------------------------------------- Partikel */

    _drawParticles(ctx, view, g) {
      const list = g.particles.active;
      if (list.length === 0) return;
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < list.length; i++) {
        const p = list[i];
        if (p.x < view.x0 - 60 || p.x > view.x1 + 60 ||
          p.y < view.y0 - 60 || p.y > view.y1 + 60) continue;
        const t = p.life / p.maxLife;

        if (p.type === PT.RING) {
          ctx.globalAlpha = t * 0.55;
          ctx.lineWidth = Math.max(1, p.r * 0.09);
          ctx.strokeStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, TAU);
          ctx.stroke();
        } else if (p.type === PT.SHARD) {
          const len = Math.min(18, Math.sqrt(p.vx * p.vx + p.vy * p.vy) * 0.045);
          ctx.globalAlpha = t * 0.9;
          ctx.lineWidth = p.r * 0.9;
          ctx.strokeStyle = p.color;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - p.vx * 0.012 * len, p.y - p.vy * 0.012 * len);
          ctx.stroke();
        } else {
          ctx.globalAlpha = p.type === PT.GLOW ? t * 0.55 : t * 0.95;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r * (p.type === PT.GLOW ? (0.5 + t * 0.9) : t), 0, TAU);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }

    /* ------------------------------------------------------------ Minimap */

    _drawMinimap() {
      const ctx = this.miniCtx;
      if (!ctx) return;
      const g = this.game;
      const size = this.miniSize;
      const world = g.world;
      const s = size / world.width;

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, size, size);

      // Hintergrund
      ctx.fillStyle = 'rgba(6,10,18,0.55)';
      ctx.fillRect(0, 0, size, size);
      ctx.strokeStyle = 'rgba(47,243,200,0.30)';
      ctx.lineWidth = 1;
      ctx.strokeRect(0.5, 0.5, size - 1, size - 1);

      // Goldkugeln als Orientierungspunkte
      const food = g.food.list;
      ctx.fillStyle = 'rgba(255,210,70,0.85)';
      for (let i = 0; i < food.length; i++) {
        const f = food[i];
        if (f.value < 12) continue;
        ctx.fillRect(f.x * s - 1, f.y * s - 1, 2.5, 2.5);
      }

      // Sichtfeld
      const cam = g.camera;
      const vw = (this.w / cam.zoom) * s;
      const vh = (this.h / cam.zoom) * s;
      ctx.strokeStyle = 'rgba(255,255,255,0.20)';
      ctx.lineWidth = 1;
      ctx.strokeRect(cam.x * s - vw * 0.5, cam.y * s - vh * 0.5, vw, vh);

      // Schlangen
      const snakes = g.snakes;
      for (let i = 0; i < snakes.length; i++) {
        const sn = snakes[i];
        if (!sn.alive || sn.isPlayer) continue;
        const r = Utils.clamp(1.4 + sn.mass * 0.0035, 1.4, 4);
        ctx.fillStyle = sn.skin.glow;
        ctx.globalAlpha = 0.8;
        ctx.beginPath();
        ctx.arc(sn.x * s, sn.y * s, r, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // Spieler
      const p = g.player;
      if (p && p.alive) {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(p.x * s, p.y * s, 3.4, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = 'rgba(47,243,200,0.9)';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(p.x * s, p.y * s, 6.2, 0, TAU);
        ctx.stroke();
      }
    }
  }

  SNK.Renderer = Renderer;

})(typeof window !== 'undefined' ? window : this);
