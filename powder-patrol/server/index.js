import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { Room } from './room.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT) || 3000;

// URL prefix -> folder on disk
const MOUNTS = [
  ['/vendor/three/', path.join(ROOT, 'node_modules/three/')],
  ['/fonts/lilita/', path.join(ROOT, 'node_modules/@fontsource/lilita-one/files/')],
  ['/fonts/nunito/', path.join(ROOT, 'node_modules/@fontsource/nunito/files/')],
  ['/shared/', path.join(ROOT, 'shared/')],
  ['/', path.join(ROOT, 'client/')],
];
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff',
  '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  let url = decodeURIComponent((req.url || '/').split('?')[0]);
  if (url === '/') url = '/index.html';
  for (const [prefix, dir] of MOUNTS) {
    if (!url.startsWith(prefix)) continue;
    const file = path.resolve(dir, '.' + url.slice(prefix.length - 1));
    if (!file.startsWith(dir)) break;
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) { res.writeHead(404); res.end('not found'); return; }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      fs.createReadStream(file).pipe(res);
    });
    return;
  }
  res.writeHead(404); res.end('not found');
});

const rooms = new Map();
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
function newCode() {
  for (;;) {
    let c = '';
    for (let i = 0; i < 4; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    if (!rooms.has(c)) return c;
  }
}

let nextId = 1;
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 16 * 1024 });
wss.on('connection', (ws) => {
  const id = nextId++;
  let room = null;
  ws.on('message', (data) => {
    let msg;
    try { msg = JSON.parse(data); } catch { return; }
    if (!room) {
      if (msg.t === 'create') {
        const code = newCode();
        room = new Room(code, (c) => rooms.delete(c));
        rooms.set(code, room);
        room.addPlayer(ws, id, msg.profile);
      } else if (msg.t === 'join') {
        const r = rooms.get(String(msg.code || '').toUpperCase().trim());
        if (!r) { ws.send(JSON.stringify({ t: 'error', text: 'No patrol with that code.' })); return; }
        if (!r.addPlayer(ws, id, msg.profile)) { ws.send(JSON.stringify({ t: 'error', text: 'That patrol is full or already on shift.' })); return; }
        room = r;
      } else if (msg.t === 'sync') {
        ws.send(JSON.stringify({ t: 'sync', ct: msg.ct, st: performance.now() / 1000 }));
      }
      return;
    }
    room.handle(id, msg);
  });
  ws.on('close', () => { if (room) room.removePlayer(id); });
});

server.listen(PORT, () => {
  console.log(`\n  ⛷  POWDER PATROL server running → http://localhost:${PORT}\n`);
});
