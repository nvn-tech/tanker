// Tanker multiplayer server.
//  - Serves the game's static files (so one deploy = game + server).
//  - Manages rooms/lobbies over WebSocket at /ws.
//  - Relays in-game traffic: the room host's browser runs the real game and
//    broadcasts state; other players send their inputs to the host.
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer, WebSocket } = require('ws');

const PORT = Number(process.env.PORT) || 8080;
const ROOT = path.join(__dirname, '..');
const MAX_PLAYERS = 6; // per room, bots included
const MAX_TEAM = 3;
const MAX_ROOMS = 500;
const HATS = ['cap', 'wizard', 'crown', 'bunny', 'helmet', 'sprout'];
const THEMES = ['random', 'meadow', 'candy', 'snow', 'desert'];
const DIFFS = ['easy', 'normal', 'hard'];
const BOT_NAMES = ['Pip', 'Momo', 'Rusty', 'Juno', 'Biscuit', 'Nova', 'Taro', 'Ziggy', 'Mochi', 'Bolt'];
const BOT_COLORS = ['#ff5a5f', '#3fa7ff', '#ffb627', '#7bd64a', '#b77bff', '#ff7ac8'];
const BOT_HAIR = ['#5a3418', '#f2c14e', '#2b2b3a', '#d9572b', '#8b5cf6', '#ffffff'];

// ---------- static files ----------
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};
const PUBLIC = /^\/(index\.html|css\/[\w.-]+\.css|js\/[\w.-]+\.js|assets\/[\w.-]+)$/;

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  let p = decodeURIComponent(url.pathname);
  if (p === '/health') { res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end('ok'); return; }
  if (p === '/') p = '/index.html';
  if (!PUBLIC.test(p) || p.includes('..')) { res.writeHead(404); res.end('Not found'); return; }
  const file = path.join(ROOT, p);
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});

// ---------- rooms ----------
const rooms = new Map();
let nextId = 1;

function makeCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  for (let i = 0; i < 100; i++) {
    let c = '';
    for (let j = 0; j < 4; j++) c += A[Math.floor(Math.random() * A.length)];
    if (!rooms.has(c)) return c;
  }
  return null;
}

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const isColor = (c) => typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c);

function cleanProfile(p) {
  p = p && typeof p === 'object' ? p : {};
  const name = String(p.name || 'Player').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 12) || 'Player';
  return {
    name,
    hat: HATS.includes(p.hat) ? p.hat : 'cap',
    color: isColor(p.color) ? p.color : '#3fa7ff',
    hair: isColor(p.hair) ? p.hair : '#5a3418',
  };
}

function send(ws, obj) {
  if (ws.readyState === WebSocket.OPEN) ws.send(typeof obj === 'string' ? obj : JSON.stringify(obj));
}

function members(room) {
  return [...room.players.values()].map((p) => p.ws);
}

function broadcast(room, obj, except) {
  const data = typeof obj === 'string' ? obj : JSON.stringify(obj);
  for (const ws of members(room)) if (ws !== except) send(ws, data);
}

function teamCount(room, team) {
  let n = 0;
  for (const p of room.players.values()) if (p.team === team) n++;
  for (const b of room.bots) if (b.team === team) n++;
  return n;
}

function total(room) {
  return room.players.size + room.bots.length;
}

function roomInfo(room) {
  return {
    t: 'room',
    code: room.code,
    host: room.host,
    started: room.started,
    theme: room.theme,
    difficulty: room.difficulty,
    players: [...room.players.values()].map((p) => ({ id: p.id, name: p.name, team: p.team, hat: p.hat, color: p.color, hair: p.hair })),
    bots: room.bots.map((b) => ({ id: b.id, name: b.name, team: b.team, hat: b.hat, color: b.color, hair: b.hair })),
  };
}

function system(room, text) {
  broadcast(room, { t: 'chat', name: '', team: -1, text });
}

function addPlayer(room, ws, profile) {
  const team = teamCount(room, 0) <= teamCount(room, 1) ? 0 : 1;
  room.players.set(ws.id, { id: ws.id, ws, team, ...profile });
  ws.room = room;
  send(ws, { t: 'joined', you: ws.id, code: room.code });
  broadcast(room, roomInfo(room));
}

function leave(ws) {
  const room = ws.room;
  if (!room) return;
  ws.room = null;
  const p = room.players.get(ws.id);
  room.players.delete(ws.id);
  if (room.host === ws.id) {
    for (const other of members(room)) {
      other.room = null;
      send(other, { t: 'closed', reason: 'The host left the room.' });
    }
    rooms.delete(room.code);
    return;
  }
  if (room.started) broadcast(room, { t: 'left', id: ws.id, name: p ? p.name : '' });
  broadcast(room, roomInfo(room));
  if (p) system(room, `${p.name} left`);
}

function handle(ws, msg) {
  const room = ws.room;
  const isHost = room && room.host === ws.id;
  switch (msg.t) {
    case 'create': {
      if (room) return;
      if (rooms.size >= MAX_ROOMS) return send(ws, { t: 'error', text: 'Server is full, try again later.' });
      const code = makeCode();
      if (!code) return send(ws, { t: 'error', text: 'Could not create a room.' });
      const r = { code, host: ws.id, players: new Map(), bots: [], started: false, theme: 'random', difficulty: 'normal', botSeq: 0 };
      rooms.set(code, r);
      addPlayer(r, ws, cleanProfile(msg.profile));
      return;
    }
    case 'join': {
      if (room) return;
      const r = rooms.get(String(msg.code || '').toUpperCase().trim());
      if (!r) return send(ws, { t: 'error', text: 'Room not found. Check the code.' });
      if (r.started) return send(ws, { t: 'error', text: 'That game already started. Wait for it to end.' });
      if (total(r) >= MAX_PLAYERS) return send(ws, { t: 'error', text: 'Room is full.' });
      const prof = cleanProfile(msg.profile);
      addPlayer(r, ws, prof);
      system(r, `${prof.name} joined`);
      return;
    }
    case 'leave':
      leave(ws);
      return;
  }
  if (!room) return;

  switch (msg.t) {
    case 'team': {
      if (room.started) return;
      const team = msg.team === 1 ? 1 : 0;
      const p = room.players.get(ws.id);
      if (!p || p.team === team || teamCount(room, team) >= MAX_TEAM) return;
      p.team = team;
      broadcast(room, roomInfo(room));
      return;
    }
    case 'addbot': {
      if (!isHost || room.started || total(room) >= MAX_PLAYERS) return;
      const team = msg.team === 1 ? 1 : 0;
      if (teamCount(room, team) >= MAX_TEAM) return;
      const used = new Set(room.bots.map((b) => b.name));
      const name = 'Bot ' + (BOT_NAMES.find((n) => !used.has('Bot ' + n)) || 'X');
      room.bots.push({ id: 'b' + ++room.botSeq, name, team, hat: pick(HATS), color: pick(BOT_COLORS), hair: pick(BOT_HAIR) });
      broadcast(room, roomInfo(room));
      return;
    }
    case 'removebot': {
      if (!isHost || room.started) return;
      room.bots = room.bots.filter((b) => b.id !== msg.id);
      broadcast(room, roomInfo(room));
      return;
    }
    case 'settings': {
      if (!isHost || room.started) return;
      if (THEMES.includes(msg.theme)) room.theme = msg.theme;
      if (DIFFS.includes(msg.difficulty)) room.difficulty = msg.difficulty;
      broadcast(room, roomInfo(room));
      return;
    }
    case 'start': {
      if (!isHost || room.started) return;
      if (teamCount(room, 0) === 0 || teamCount(room, 1) === 0) return send(ws, { t: 'error', text: 'Both teams need at least one player or bot.' });
      room.started = true;
      const roster = [
        ...[...room.players.values()].map((p) => ({ pid: p.id, name: p.name, team: p.team, hat: p.hat, color: p.color, hair: p.hair, bot: false })),
        ...room.bots.map((b) => ({ pid: null, name: b.name, team: b.team, hat: b.hat, color: b.color, hair: b.hair, bot: true })),
      ];
      broadcast(room, { t: 'start', host: room.host, seed: Math.floor(Math.random() * 1e9), theme: room.theme, difficulty: room.difficulty, roster });
      broadcast(room, roomInfo(room));
      return;
    }
    case 'end': {
      if (!isHost) return;
      room.started = false;
      broadcast(room, roomInfo(room));
      return;
    }
    case 'state': {
      // host -> everyone else, passed through untouched
      if (!isHost || !room.started) return;
      broadcast(room, ws.lastRaw, ws);
      return;
    }
    case 'input': {
      if (isHost || !room.started) return;
      const host = room.players.get(room.host);
      if (host) send(host.ws, { t: 'input', from: ws.id, d: msg.d });
      return;
    }
    case 'chat': {
      const p = room.players.get(ws.id);
      const text = String(msg.text || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 140);
      if (!p || !text) return;
      const now = Date.now();
      if (now - (ws.lastChat || 0) < 400) return;
      ws.lastChat = now;
      broadcast(room, { t: 'chat', name: p.name, team: p.team, text });
      return;
    }
  }
}

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 64 * 1024 });

wss.on('connection', (ws) => {
  ws.id = nextId++;
  ws.room = null;
  ws.alive = true;
  ws.budget = { t: Date.now(), n: 0 };
  ws.on('pong', () => { ws.alive = true; });
  ws.on('message', (data) => {
    // simple flood protection
    const now = Date.now();
    if (now - ws.budget.t > 1000) ws.budget = { t: now, n: 0 };
    if (++ws.budget.n > 120) return;
    let msg;
    try { msg = JSON.parse(data.toString()); } catch (e) { return; }
    if (!msg || typeof msg.t !== 'string') return;
    ws.lastRaw = data.toString();
    handle(ws, msg);
  });
  ws.on('close', () => leave(ws));
  ws.on('error', () => {});
  send(ws, { t: 'hello', id: ws.id });
});

setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.alive) { ws.terminate(); continue; }
    ws.alive = false;
    try { ws.ping(); } catch (e) { /* closing */ }
  }
}, 25000);

server.listen(PORT, () => {
  console.log(`Tanker server on http://localhost:${PORT}  (WebSocket: /ws)`);
});
