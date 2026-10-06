// DOM user interface: screens, HUD widgets, world-anchored labels, trail map, results.
import { JACKET_COLORS, HATS, SHOP_ITEMS } from '/shared/constants.js';
import { renderPortrait } from './models.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const DANGER = ['', 'Low', 'Moderate', 'Considerable', 'High', 'Very High'];

export class UI {
  constructor() {
    this.labels = new Map();
    this.labelRoot = $('labels');
    this.toastRoot = $('toasts');
    this.portraits = new Map();
    this.bannerTimer = null;
    this.trickTimer = null;
    this.mapDirty = true;
  }

  show(screen) {
    for (const id of ['loading', 'menu', 'lobby', 'results']) $(id).classList.toggle('show', id === screen);
    $('hud').classList.toggle('hidden', screen !== 'hud' && screen !== 'results');
    if (screen !== 'hud') this.clearLabels();
  }
  modal(id, on) { $(id).classList.toggle('show', on); }
  setLoading(pct, text) {
    $('loader-fill').style.width = `${Math.round(pct * 100)}%`;
    if (text) $('loader-text').textContent = text;
  }
  error(text) {
    const e = $('error-toast');
    e.textContent = text;
    e.classList.remove('hidden');
    clearTimeout(this.errT);
    this.errT = setTimeout(() => e.classList.add('hidden'), 3500);
  }

  // ---------------------------------------------------------------- profile
  buildProfile(profile, onChange) {
    const cp = $('color-picker');
    cp.innerHTML = '';
    for (const c of JACKET_COLORS) {
      const b = document.createElement('button');
      b.className = 'swatch' + (c === profile.color ? ' on' : '');
      b.style.background = c;
      b.dataset.color = c;
      b.onclick = () => { profile.color = c; onChange(); this.buildProfile(profile, onChange); };
      cp.appendChild(b);
    }
    const hp = $('hat-picker');
    hp.innerHTML = '';
    for (const h of HATS) {
      const b = document.createElement('button');
      b.className = 'chip' + (h === profile.hat ? ' on' : '');
      b.textContent = h === 'none' ? 'no hat' : h;
      b.onclick = () => { profile.hat = h; onChange(); this.buildProfile(profile, onChange); };
      hp.appendChild(b);
    }
    $('name-input').value = profile.name;
  }

  portrait(p) {
    const key = `${p.color}|${p.hat}`;
    if (!this.portraits.has(key)) this.portraits.set(key, renderPortrait({ jacket: p.color, hat: p.hat, hatColor: p.hat === 'beanie' ? '#ffd23f' : p.color }, 220));
    return this.portraits.get(key);
  }

  // ---------------------------------------------------------------- lobby
  renderLobby(st, myId, mountainName) {
    $('room-code').textContent = st.code;
    $('lobby-mountain').textContent = mountainName || '—';
    const isHost = st.hostId === myId;
    const mt = $('mode-toggle');
    mt.classList.toggle('locked', !isHost);
    for (const b of mt.querySelectorAll('button')) b.classList.toggle('on', b.dataset.mode === st.mode);
    const wrap = $('lobby-players');
    wrap.innerHTML = '';
    const rots = [-2.5, 1.5, -1, 2.2];
    for (let i = 0; i < 4; i++) {
      const p = st.players[i];
      const d = document.createElement('div');
      d.style.setProperty('--rot', `${rots[i]}deg`);
      if (!p) {
        d.className = 'pass empty';
        d.textContent = 'waiting for a friend…';
      } else {
        d.className = 'pass';
        const img = this.portrait(p);
        d.innerHTML = `<div class="lanyard"></div>
          ${p.id === st.hostId ? '<div class="host" title="Host">★</div>' : ''}
          <div class="status ${p.ready ? 'ready' : ''}">${p.ready ? 'READY' : 'NOT READY'}</div>
          <div class="avatar" style="border-color:${p.color};background:${p.color}22">${img ? `<img src="${img}" alt="">` : ''}</div>
          <div class="pname">${esc(p.name)}${p.id === myId ? ' <span class="ptag">(you)</span>' : ''}</div>
          <div class="ptag">Season pass · Ski Patrol</div>
          <div class="barcode"></div>`;
        d.querySelector('.avatar').style.boxShadow = `0 0 0 4px ${p.color}`;
      }
      wrap.appendChild(d);
    }
    const me = st.players.find((p) => p.id === myId);
    $('btn-ready').classList.toggle('on', !!me?.ready);
    $('btn-ready').textContent = me?.ready ? 'Ready ✓' : 'Ready';
    $('btn-start').classList.toggle('hidden', !isHost);
    const allReady = st.players.every((p) => p.ready || p.id === st.hostId);
    $('btn-start').disabled = !allReady;
    $('lobby-hint').textContent = isHost
      ? (allReady ? 'Everyone is ready — start the shift!' : 'Waiting for everyone to ready up…')
      : 'Waiting for the host to start the shift…';
  }

  // ---------------------------------------------------------------- HUD
  updateHud(h) {
    $('clock').textContent = h.clock;
    $('money').textContent = `$${h.money}`;
    $('quota').textContent = `$${h.quota}`;
    $('quota-fill').style.width = `${Math.max(0, Math.min(100, (h.money / h.quota) * 100))}%`;
    $('speed').textContent = Math.round(h.speed * 3.6);
    $('charges').textContent = h.charges;
    $('gear-charges').classList.toggle('has', h.charges > 0);
    $('sled-status').textContent = h.sled;
    $('gear-sled').classList.toggle('has', h.sled !== '—');
    if (this.lastDanger !== h.danger) {
      const d = $('danger');
      d.className = `danger lv${h.danger}` + (this.lastDanger && h.danger > this.lastDanger ? ' flash' : '');
      $('danger-num').innerHTML = `<span>${h.danger}</span>`;
      $('danger-label').textContent = DANGER[h.danger];
      this.lastDanger = h.danger;
    }
  }

  compass(yaw, markers) {
    const strip = $('compass-strip');
    const w = strip.clientWidth || 600;
    const fov = Math.PI * 0.9;
    let html = '';
    const dirs = [['DOWNHILL', 0], ['EAST', -Math.PI / 2], ['SUMMIT', Math.PI], ['WEST', Math.PI / 2]];
    const place = (ang) => {
      let d = Math.atan2(Math.sin(ang - yaw), Math.cos(ang - yaw));
      if (Math.abs(d) > fov / 2) return null;
      return w / 2 - (d / (fov / 2)) * (w / 2);
    };
    for (const [n, a] of dirs) {
      const x = place(a);
      if (x !== null) html += `<div class="cmark dir" style="left:${x}px">${n}</div>`;
    }
    for (const m of markers) {
      const x = place(m.ang);
      if (x === null) continue;
      html += `<div class="cmark ${m.cls || ''}" style="left:${x}px;${m.color ? `color:${m.color}` : ''}"><span class="ci">${m.icon}</span>${m.dist !== undefined ? `${Math.round(m.dist)}m` : ''}</div>`;
    }
    strip.innerHTML = html;
  }

  radio(calls) {
    const key = calls.map((c) => `${c.id}:${c.state}:${Math.round(c.condition / 5)}:${Math.round(c.dist / 10)}`).join('|');
    if (key === this.radioKey) return;
    this.radioKey = key;
    $('radio').innerHTML = calls.slice(0, 4).map((c) => `
      <div class="call ${c.cls}">
        <div class="ct">${esc(c.title)}</div><div class="cd">${Math.round(c.dist)}m</div>
        <div class="cs">${esc(c.sub)}</div>
        <div class="cbar"><i style="width:${c.condition}%;background:${c.condition > 50 ? '#2e9e5b' : c.condition > 25 ? '#f39c12' : '#e63946'}"></i></div>
      </div>`).join('');
  }

  prompt(text, key = 'E', progress = null) {
    const p = $('prompt');
    if (!text) { p.classList.add('hidden'); return; }
    p.classList.remove('hidden');
    $('prompt-key').textContent = key;
    $('prompt-key').classList.toggle('hidden', !key);
    $('prompt-text').textContent = text;
    p.classList.toggle('progress', progress !== null);
    if (progress !== null) p.querySelector('#prompt-bar i').style.width = `${Math.min(100, progress * 100)}%`;
  }

  banner(text, sub = '', cls = '', dur = 2.5) {
    const b = $('banner');
    b.className = cls;
    b.innerHTML = `${esc(text)}${sub ? `<small>${esc(sub)}</small>` : ''}`;
    // restart animation
    void b.offsetWidth;
    clearTimeout(this.bannerTimer);
    if (dur > 0) this.bannerTimer = setTimeout(() => b.classList.add('hidden'), dur * 1000);
  }
  hideBanner() { $('banner').classList.add('hidden'); }

  trick(text) {
    const t = $('trick');
    t.textContent = text;
    t.classList.remove('hidden');
    void t.offsetWidth;
    t.style.animation = 'none'; void t.offsetWidth; t.style.animation = '';
    clearTimeout(this.trickTimer);
    this.trickTimer = setTimeout(() => t.classList.add('hidden'), 1400);
  }

  toast(text, kind = 'info', dur = 3.5) {
    const t = document.createElement('div');
    t.className = `toast ${kind}`;
    t.textContent = text;
    this.toastRoot.prepend(t);
    while (this.toastRoot.children.length > 5) this.toastRoot.lastChild.remove();
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 700); }, dur * 1000);
  }

  chatLine(name, color, text) {
    const log = $('chat-log');
    const d = document.createElement('div');
    d.className = 'chat-line';
    d.innerHTML = `<b style="color:${color}">${esc(name)}</b>${esc(text)}`;
    log.appendChild(d);
    while (log.children.length > 8) log.firstChild.remove();
    setTimeout(() => d.classList.add('fade'), 9000);
  }
  openChat(on) {
    $('chat').classList.toggle('open', on);
    const i = $('chat-input');
    if (on) { i.value = ''; i.focus(); } else i.blur();
  }

  beacon(state) {
    const b = $('beacon');
    if (!state) { b.classList.add('hidden'); return; }
    b.classList.remove('hidden');
    $('beacon-dist').textContent = state.dist === null ? '--' : `${Math.round(state.dist)}m`;
    $('beacon-sub').textContent = state.dist === null ? 'SEARCHING…' : state.dist < 3 ? 'DIG HERE!' : 'SIGNAL';
    const arrow = $('beacon-arrow');
    arrow.style.visibility = state.dist === null ? 'hidden' : 'visible';
    arrow.style.transform = `rotate(${state.rel}rad)`;
    const leds = b.querySelectorAll('.beacon-leds i');
    leds.forEach((l, i) => l.classList.toggle('on', state.dist !== null && state.flash && i === (state.flashIdx % 3)));
  }

  buried(on, air = 0, max = 75) {
    $('buried').classList.toggle('hidden', !on);
    if (on) {
      $('air-fill').style.width = `${Math.max(0, (air / max) * 100)}%`;
      $('air-text').textContent = Math.max(0, Math.ceil(air));
    }
  }

  hurt(on) { $('vignette-hurt').classList.toggle('on', on); }

  // ---------------------------------------------------------------- world labels
  label(key, x, y, html, cls = 'tag', style = '') {
    let e = this.labels.get(key);
    if (!e) {
      e = document.createElement('div');
      this.labelRoot.appendChild(e);
      this.labels.set(key, e);
      e._html = null;
    }
    e._seen = true;
    if (e.className !== cls) e.className = cls;
    if (e._html !== html) { e.innerHTML = html; e._html = html; }
    if (e._style !== style) { e.setAttribute('style', style); e._style = style; }
    e.style.left = `${x}px`;
    e.style.top = `${y}px`;
  }
  beginLabels() { for (const e of this.labels.values()) e._seen = false; }
  endLabels() {
    for (const [k, e] of this.labels) if (!e._seen) { e.remove(); this.labels.delete(k); }
  }
  clearLabels() { for (const e of this.labels.values()) e.remove(); this.labels.clear(); }

  // ---------------------------------------------------------------- trail map
  showMap(on) { $('map').classList.toggle('hidden', !on); }
  prepareMap(m, name) {
    $('map-name').textContent = `Trail Map — ${name}`;
    const cv = document.createElement('canvas');
    const W = 640, H = 1020;
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(W, H);
    const sx = (x) => ((x - m.world.minX) / (m.world.maxX - m.world.minX)) * W;
    const sz = (z) => ((z - m.world.minZ) / (m.world.maxZ - m.world.minZ)) * H;
    this.mapTx = { sx, sz, W, H };
    for (let py = 0; py < H; py++) {
      for (let px = 0; px < W; px++) {
        const x = m.world.minX + (px / W) * (m.world.maxX - m.world.minX);
        const z = m.world.minZ + (py / H) * (m.world.maxZ - m.world.minZ);
        const h = m.terrainAt(x, z);
        const hx = m.terrainAt(x + 2, z) - h, hz = m.terrainAt(x, z + 2) - h;
        // hillshade from upper-left
        let shade = 0.82 + (-hx * 0.55 + hz * 0.25) * 0.5;
        shade = Math.max(0.45, Math.min(1.08, shade));
        const steep = Math.hypot(hx, hz) / 2;
        let r = 236, g = 242, b = 250;
        if (steep > 1.1) { r = 150; g = 155; b = 168; }
        const k = (py * W + px) * 4;
        img.data[k] = r * shade; img.data[k + 1] = g * shade; img.data[k + 2] = b * shade; img.data[k + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    // trees
    ctx.fillStyle = 'rgba(44,90,71,0.55)';
    for (const t of m.trees) { ctx.beginPath(); ctx.arc(sx(t.x), sz(t.z), 1.6 * t.s, 0, Math.PI * 2); ctx.fill(); }
    // avalanche zones
    ctx.save();
    for (const a of m.avalanches) {
      ctx.strokeStyle = 'rgba(243,156,18,0.55)';
      ctx.lineWidth = a.width * (W / 640) * 0.9;
      ctx.lineCap = 'round';
      ctx.setLineDash([4, 5]);
      ctx.beginPath();
      a.path.forEach((p, i) => (i ? ctx.lineTo(sx(p.x), sz(p.z)) : ctx.moveTo(sx(p.x), sz(p.z))));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#1b1f2a';
      ctx.font = '900 11px Nunito';
      ctx.fillText(`⚠ ${a.name}`, sx(a.release.x) - 30, sz(a.release.z) - 8);
    }
    ctx.restore();
    // pistes
    for (const p of m.pistes) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 9;
      ctx.lineJoin = ctx.lineCap = 'round';
      ctx.beginPath();
      p.points.forEach((q, i) => (i ? ctx.lineTo(sx(q.x), sz(q.z)) : ctx.moveTo(sx(q.x), sz(q.z))));
      ctx.stroke();
      ctx.strokeStyle = p.difficulty === 'black' ? '#1b1f2a' : p.color;
      ctx.lineWidth = 5;
      ctx.stroke();
      const mid = p.points[Math.floor(p.points.length * 0.45)];
      ctx.font = '400 15px "Lilita One"';
      ctx.lineWidth = 4; ctx.strokeStyle = '#fff';
      ctx.strokeText(p.name, sx(mid.x) + 10, sz(mid.z));
      ctx.fillStyle = p.difficulty === 'black' ? '#1b1f2a' : p.color;
      ctx.fillText(p.name, sx(mid.x) + 10, sz(mid.z));
    }
    // lift
    ctx.strokeStyle = '#1c2741';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 4]);
    ctx.beginPath();
    ctx.moveTo(sx(m.lift.bottom.x), sz(m.lift.bottom.z));
    ctx.lineTo(sx(m.lift.top.x), sz(m.lift.top.z));
    ctx.stroke();
    ctx.setLineDash([]);
    for (const t of m.towers) { ctx.fillStyle = '#1c2741'; ctx.fillRect(sx(t.x) - 2, sz(t.z) - 2, 4, 4); }
    const lbl = (txt, x, z, bg, fg = '#fff') => {
      ctx.font = '900 12px Nunito';
      const w = ctx.measureText(txt).width + 12;
      ctx.fillStyle = bg;
      ctx.fillRect(sx(x) - w / 2, sz(z) - 10, w, 20);
      ctx.fillStyle = fg;
      ctx.textAlign = 'center';
      ctx.fillText(txt, sx(x), sz(z) + 4);
      ctx.textAlign = 'left';
    };
    lbl('SUMMIT LIFT', m.lift.top.x + 20, m.lift.top.z + 14, '#2f6fd6');
    lbl('✚ PATROL HUT', m.sites.hut.x, m.sites.hut.z - 4, '#e63946');
    lbl('✚ CLINIC', m.sites.clinic.x, m.sites.clinic.z, '#e63946');
    lbl('LIFT', m.lift.bottom.x, m.lift.bottom.z + 6, '#2f6fd6');
    lbl('BASE LODGE', m.sites.lodge.x - 10, m.sites.lodge.z + 16, '#5f3c28');
    this.mapBase = cv;
  }

  drawMap(players, patients, pings) {
    if (!this.mapBase) return;
    const cv = $('map-canvas');
    const { sx, sz, W, H } = this.mapTx;
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    ctx.drawImage(this.mapBase, 0, 0);
    for (const p of patients) {
      ctx.save();
      ctx.translate(sx(p.x), sz(p.z));
      ctx.fillStyle = p.state === 'buried' ? '#f39c12' : '#e63946';
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.fillRect(-2, -6, 4, 12); ctx.fillRect(-6, -2, 12, 4);
      ctx.restore();
    }
    for (const p of pings) {
      ctx.strokeStyle = p.color; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(sx(p.x), sz(p.z), 12, 0, Math.PI * 2); ctx.stroke();
    }
    for (const p of players) {
      ctx.save();
      ctx.translate(sx(p.x), sz(p.z));
      ctx.rotate(-p.yaw);
      ctx.fillStyle = p.color;
      ctx.strokeStyle = '#1c2741';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(0, 12); ctx.lineTo(8, -8); ctx.lineTo(0, -3); ctx.lineTo(-8, -8); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.restore();
      ctx.font = '900 12px Nunito';
      ctx.fillStyle = '#1c2741';
      ctx.fillText(p.name, sx(p.x) + 12, sz(p.z) - 8);
    }
  }

  // ---------------------------------------------------------------- results
  showResults(r, myId, isHost, money, upgrades, mountainName, onBuy) {
    $('res-day').textContent = r.day;
    $('res-mountain').textContent = mountainName;
    const stamp = $('res-stamp');
    stamp.textContent = r.passed ? 'QUOTA MET' : 'FIRED!';
    stamp.classList.toggle('fail', !r.passed);
    stamp.style.animation = 'none'; void stamp.offsetWidth; stamp.style.animation = '';
    $('res-earned').textContent = `$${r.earned}`;
    $('res-quota').textContent = `$${r.quota}`;
    $('res-delivered').textContent = r.delivered;
    $('res-airlift').textContent = r.airlifted;
    $('res-controlled').textContent = r.controlled;
    $('res-awards').innerHTML = r.players.map((p, i) => {
      const s = p.stats;
      const avg = s.rescues ? Math.round(s.conditionSum / s.rescues) : 0;
      return `<div class="award" style="animation-delay:${0.15 * i + 0.4}s">
        <div class="patch" style="background:${p.color}">${esc(p.award.title[0])}</div>
        <div>
          <div class="an">${esc(p.name)}${p.id === myId ? ' (you)' : ''}</div>
          <div class="at">${esc(p.award.title)}</div>
          <div class="ad">${esc(p.award.desc)}</div>
          <div class="as">${s.rescues} rescues · ${s.crashes} crashes · ${Math.round(s.topSpeed * 3.6)} km/h top${s.rescues ? ` · ${avg}% avg condition` : ''}</div>
        </div></div>`;
    }).join('');
    $('shop').classList.toggle('hidden', !r.passed);
    this.renderShop(money, upgrades, onBuy);
    $('btn-next').classList.toggle('hidden', !(isHost && r.passed));
    $('btn-res-lobby').classList.toggle('hidden', !isHost);
    $('res-wait').textContent = isHost ? (r.passed ? 'Spend your cash, then head out again.' : 'The patrol was fired. Try again!') : 'Waiting for the host…';
    this.show('results');
  }

  renderShop(money, upgrades, onBuy) {
    $('res-money').textContent = `$${money}`;
    const wrap = $('shop-items');
    wrap.innerHTML = '';
    for (const [key, it] of Object.entries(SHOP_ITEMS)) {
      const owned = upgrades[key] || 0;
      const b = document.createElement('button');
      b.className = 'item' + (owned >= it.max ? ' owned' : '');
      b.innerHTML = `<b>${esc(it.name)}</b><span>${esc(it.desc)}</span><div class="price">${owned >= it.max ? 'OWNED' : `$${it.price}`}${it.max > 1 ? ` <small>(${owned}/${it.max})</small>` : ''}</div>`;
      b.disabled = owned >= it.max || money < it.price;
      b.onclick = () => onBuy(key);
      wrap.appendChild(b);
    }
  }
}
