// WebSocket client with server-time sync and a snapshot buffer for interpolation.
import { INTERP_DELAY } from '/shared/constants.js';

export class Net {
  constructor() {
    this.ws = null;
    this.handlers = {};
    this.offset = 0;
    this.bestRtt = Infinity;
    this.snaps = [];
    this.id = null;
    this.connected = false;
  }

  on(type, fn) { this.handlers[type] = fn; }

  connect() {
    return new Promise((resolve, reject) => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      const ws = new WebSocket(`${proto}://${location.host}/ws`);
      this.ws = ws;
      ws.onopen = () => {
        this.connected = true;
        this.syncTimer = setInterval(() => this.sync(), 2000);
        this.sync();
        resolve();
      };
      ws.onerror = () => reject(new Error('Could not reach the patrol server.'));
      ws.onclose = () => {
        this.connected = false;
        clearInterval(this.syncTimer);
        this.handlers.close?.();
      };
      ws.onmessage = (e) => {
        let msg;
        try { msg = JSON.parse(e.data); } catch { return; }
        if (msg.t === 'sync') {
          const nowC = performance.now() / 1000;
          const rtt = nowC - msg.ct;
          if (rtt < this.bestRtt * 1.3 || this.snaps.length === 0) {
            this.bestRtt = Math.min(this.bestRtt, rtt);
            const off = msg.st - (msg.ct + rtt / 2);
            this.offset = this.offsetInit ? this.offset * 0.7 + off * 0.3 : off;
            this.offsetInit = true;
          }
          this.rtt = rtt;
          return;
        }
        if (msg.t === 'snap') {
          this.snaps.push(msg);
          if (this.snaps.length > 40) this.snaps.shift();
        }
        if (msg.t === 'welcome') this.id = msg.id;
        this.handlers[msg.t]?.(msg);
      };
    });
  }

  sync() { this.send({ t: 'sync', ct: performance.now() / 1000 }); }
  send(msg) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(msg)); }
  close() { try { this.ws?.close(); } catch { /* ignore */ } this.snaps = []; }

  serverNow() { return performance.now() / 1000 + this.offset; }

  // Returns {a, b, t} bracketing the render time, or null
  bracket() {
    const s = this.snaps;
    if (!s.length) return null;
    const rt = this.serverNow() - INTERP_DELAY;
    for (let i = s.length - 1; i > 0; i--) {
      if (s[i - 1].st <= rt) {
        const a = s[i - 1], b = s[i];
        const t = Math.min(1.5, (rt - a.st) / Math.max(0.001, b.st - a.st));
        return { a, b, t };
      }
    }
    return { a: s[0], b: s[0], t: 0 };
  }

  latest() { return this.snaps[this.snaps.length - 1] || null; }
}
