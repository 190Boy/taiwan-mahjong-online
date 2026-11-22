'use strict';
/* 台灣十六張麻將 — 線上房號對戰伺服器（伺服器權威：所有牌局邏輯都在這裡跑） */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const MJ = require('./docs/logic.js');

const PORT = +process.env.PORT || 3000;
const TURN_MS = +process.env.TURN_MS || 20000;     // 出牌時限
const CLAIM_MS = +process.env.CLAIM_MS || 9000;    // 吃碰槓胡時限
const DELAY_SCALE = process.env.DELAY_SCALE ? +process.env.DELAY_SCALE : 1; // 動作間隔倍率（測試用）
const IDLE_CLOSE_MS = +process.env.IDLE_CLOSE_MS || 30 * 60 * 1000;   // 房間 30 分鐘沒人操作就斷線
const ROOM_IDLE_MS = +process.env.ROOM_IDLE_MS || 10 * 60 * 1000;          // 沒人在線多久後清掉房間
const PUB = path.join(__dirname, 'docs');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };
const AI_NAMES = ['小藍', '阿明', '小美', '阿伯', '阿嬤', '王小姐', '喵喵', '小傑', '老張', '阿姨'];

/* ---------- HTTP：提供前端頁面 ---------- */
const server = http.createServer((req, res) => {
  const u = (req.url || '/').split('?')[0];
  if (u === '/health' || u === '/healthz') { res.writeHead(200, { 'content-type': 'text/plain' }); return res.end('ok'); }
  let rel = '';
  try { rel = decodeURIComponent(u === '/' ? '/index.html' : u); } catch (e) { rel = '/x'; }
  const file = path.normalize(path.join(PUB, rel));
  if (file.startsWith(PUB + path.sep) && MIME[path.extname(file)]) {
    return fs.readFile(file, (e, d) => {
      if (e) { res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }); return res.end('找不到頁面'); }
      res.writeHead(200, { 'content-type': MIME[path.extname(file)], 'cache-control': 'no-cache' });
      res.end(d);
    });
  }
  if (u === '/favicon.ico') { res.writeHead(204); return res.end(); }
  res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }); res.end('找不到頁面');
});

/* ---------- 房間 ---------- */
const rooms = new Map();
const rel = (s, me) => (s - me + 4) % 4;
const abs = (r, me) => (r + me) % 4;
const rot = (arr, me) => [0, 1, 2, 3].map(r => arr[abs(r, me)]);
const token = () => crypto.randomBytes(12).toString('hex');
function newCode() { let c; do { c = String(1000 + Math.floor(Math.random() * 9000)); } while (rooms.has(c)); return c; }
const online = (room, s) => !!(room.seats[s] && room.seats[s].ws);
const send = (ws, msg) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg)); };

const blankStat = () => ({ hands: 0, wins: 0, tsumo: 0, dealins: 0, tai: 0, pts: 0 });
const CHAT_N = 16;
function createRoom() {
  const code = newCode();
  const room = { code, seats: [null, null, null, null], session: new MJ.Session(), game: null, phase: 'lobby',
    lastActive: Date.now(), ready: new Set(), pid: 0, ai: [null, null, null, null], dead: false,
    level: 'normal', created: Date.now(), stats: [0, 1, 2, 3].map(blankStat), lastMsg: Date.now() };
  rooms.set(code, room);
  return room;
}
function fillAI(room) {
  const used = new Set(room.seats.filter(Boolean).map(x => x.ci));
  for (let s = 0; s < 4; s++) {
    if (room.seats[s]) { room.ai[s] = null; continue; }
    if (room.ai[s] && !used.has(room.ai[s].ci)) { used.add(room.ai[s].ci); continue; }
    const pool = AI_NAMES.map((_, i) => i).filter(i => !used.has(i));
    const ci = pool[Math.floor(Math.random() * pool.length)];
    used.add(ci); room.ai[s] = { ci, name: AI_NAMES[ci] };
  }
}
function seatInfo(room, s) {
  const p = room.seats[s];
  if (p) return { name: p.name, ci: p.ci, human: true, online: !!p.ws, host: !!p.host, ready: room.ready.has(s) };
  const a = room.ai[s] || { ci: s, name: AI_NAMES[s] };
  return { name: a.name, ci: a.ci, human: false, online: false, host: false, ai: true };
}
function roomMsg(room, me) {
  return { t: 'room', code: room.code, phase: room.phase, mySeat: me, seats: rot([0, 1, 2, 3].map(s => seatInfo(room, s)), me),
    absSeats: [0, 1, 2, 3].map(s => seatInfo(room, s)), isHost: !!(room.seats[me] && room.seats[me].host),
    level: room.level, created: room.created, stats: rot(room.stats, me) };
}
function broadcastRoom(room) { fillAI(room); room.seats.forEach((p, s) => p && send(p.ws, roomMsg(room, s))); }

/* ---------- 給每個玩家的視角（只看得到自己的手牌） ---------- */
const hid = { id: -1, t: -1 };
function viewFor(room, me) {
  const g = room.game; if (!g || !g.players) return null;
  const S = room.session, reveal = g.over;
  const players = [0, 1, 2, 3].map(r => {
    const s = abs(r, me), p = g.players[s], mine = s === me;
    return {
      seat: r,
      hand: (mine || reveal) ? p.hand.map(x => ({ id: x.id, t: x.t })) : p.hand.map(() => hid),
      melds: p.melds.map(m => (m.type === 'akong' && !mine && !reveal)
        ? { type: 'akong', t: -1, tiles: [hid, hid, hid, hid] }
        : { type: m.type, t: m.t, tiles: m.tiles.map(x => ({ id: x.id, t: x.t })), claimed: m.claimed }),
      flowers: p.flowers.map(x => ({ id: x.id, t: x.t })),
      discards: p.discards.map(x => ({ id: x.id, t: x.t }))
    };
  });
  return {
    players, dealer: rel(g.dealer, me), streak: g.streak, roundWind: g.roundWind, turn: rel(g.turn, me), over: g.over,
    live: g.live, lastDiscard: g.lastDiscard ? { seat: rel(g.lastDiscard.seat, me), tile: g.lastDiscard.tile } : null,
    justDrew: g.justDrew ? (g.justDrew.seat === me ? { seat: 0, id: g.justDrew.id } : { seat: rel(g.justDrew.seat, me), id: -1 }) : null,
    result: g.result ? relResult(g.result, me) : null,
    session: sessionFor(S, me)
  };
}
function sessionFor(S, me) { return { scores: rot(S.scores, me), dealer: rel(S.dealer, me), streak: S.streak, roundWind: S.roundWind, handCount: S.handCount }; }
function relResult(r, me) {
  const o = { type: r.type, dealer: rel(r.dealer, me), payments: rot(r.payments, me) };
  if (r.type === 'win') Object.assign(o, { winner: rel(r.winner, me), loser: r.loser === null ? null : rel(r.loser, me), self: r.self,
    tile: r.tile, items: r.items, total: r.total, dealerItems: r.dealerItems, dealerTai: r.dealerTai,
    detail: r.detail.map(d => ({ seat: rel(d.seat, me), tai: d.tai, amt: d.amt })) });
  return o;
}
function relEvent(ev, d, me) {
  switch (ev) {
    case 'turn': return { seat: rel(d.seat, me) };
    case 'draw': return { seat: rel(d.seat, me), fromBack: d.fromBack, tile: d.seat === me ? d.tile : null };
    case 'flower': case 'discard': return { seat: rel(d.seat, me), tile: d.tile };
    case 'claim': return { seat: rel(d.seat, me), type: d.type, tile: d.tile, from: rel(d.from, me) };
    case 'kong': return { seat: rel(d.seat, me), kind: d.kind, t: (d.kind === 'an' && d.seat !== me) ? -1 : d.t };
    case 'win': case 'exhaust': return relResult(d, me);
    default: return {};
  }
}
function onGameEvent(room, ev, d) {
  if (ev === 'prompt') return;
  room.seats.forEach((p, s) => p && p.ws && send(p.ws, { t: 'state', ev, data: relEvent(ev, d, s), view: viewFor(room, s) }));
}

/* ---------- 玩家控制器：在線就問玩家（有時限），離線/超時由 AI 代打 ---------- */
function ask(room, s, kind, payload, ms, fallback) {
  return new Promise(resolve => {
    const seat = room.seats[s]; const pid = ++room.pid;
    const done = v => {
      if (!seat.pending || seat.pending.pid !== pid) return;
      clearTimeout(seat.pending.timer); seat.pending = null;
      send(seat.ws, { t: 'promptEnd', pid }); resolve(v);
    };
    seat.pending = { pid, kind, payload, deadline: Date.now() + ms, done, fallback,
      timer: setTimeout(() => done(fallback()), ms) };
    sendPrompt(seat);
  });
}
function sendPrompt(seat) {
  const p = seat.pending; if (!p) return;
  send(seat.ws, { t: 'prompt', pid: p.pid, kind: p.kind, opts: p.payload.opts, tile: p.payload.tile || null, ms: Math.max(0, p.deadline - Date.now()) });
}
function makeCtrl(room, s) {
  return {
    get isHuman() { return online(room, s); },
    turn(g, seat, opts) {
      if (room.dead) throw new Error('room closed');
      if (!online(room, s)) return MJ.AI.turn(g, seat, opts);
      return ask(room, s, 'turn', { opts }, TURN_MS, () => MJ.AI.turn(g, seat, opts));
    },
    claim(g, seat, tile, opts) {
      if (room.dead) throw new Error('room closed');
      if (!online(room, s)) return MJ.AI.claim(g, seat, tile, opts);
      return ask(room, s, 'claim', { opts, tile }, CLAIM_MS, () => ({ type: 'pass' }));
    }
  };
}
const sleep = (room, ms) => new Promise((res, rej) => setTimeout(() => room.dead ? rej(new Error('room closed')) : res(), ms * DELAY_SCALE));

function startHand(room) {
  if (room.phase === 'playing' || room.dead) return;
  fillAI(room);
  room.phase = 'playing'; room.ready.clear();
  const g = room.session.newGame({ aiLevel: room.level, controllers: [0, 1, 2, 3].map(s => makeCtrl(room, s)),
    onEvent: (ev, d) => onGameEvent(room, ev, d), delay: ms => sleep(room, ms) });
  room.game = g;
  broadcastRoom(room);
  g.play().then(r => {
    room.session.apply(r);
    for (let s = 0; s < 4; s++) {
      const st = room.stats[s]; st.hands++; st.pts += r.payments[s];
      if (r.type === 'win') { if (r.winner === s) { st.wins++; st.tai += r.total || 0; if (r.self) st.tsumo++; } else if (r.loser === s) st.dealins++; }
    }
    room.phase = 'result';
    setTimeout(() => {
      if (room.dead) return;
      room.seats.forEach((p, s) => p && send(p.ws, { t: 'result', result: relResult(r, s), session: sessionFor(room.session, s), view: viewFor(room, s) }));
      broadcastRoom(room);
      if (!room.seats.some(p => p && p.ws)) room.phase = 'result';
    }, 1400 * Math.max(DELAY_SCALE, 0.05));
  }).catch(e => { if (!room.dead) { console.error('game error', e); room.phase = 'lobby'; broadcastRoom(room); } });
}
function maybeAgain(room) {
  if (room.phase !== 'result') return;
  const humans = room.seats.map((p, s) => p && p.ws ? s : -1).filter(s => s >= 0);
  if (humans.length && humans.every(s => room.ready.has(s))) startHand(room);
  else broadcastRoom(room);
}

/* ---------- WebSocket ---------- */
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 8 * 1024 });
wss.on('connection', ws => {
  ws.isAlive = true; ws.on('pong', () => { ws.isAlive = true; });
  ws.ctx = null; // { room, seat }
  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw); } catch (e) { return; }
    try { handle(ws, m); } catch (e) { console.error('handle error', e); send(ws, { t: 'err', msg: '伺服器錯誤' }); }
  });
  ws.on('close', () => detach(ws));
});
function cleanName(n) { return String(n || '').replace(/[<>&"]/g, '').trim().slice(0, 8) || '玩家'; }
function cleanCi(ci) { ci = +ci; return Number.isInteger(ci) && ci >= 0 && ci < AI_NAMES.length ? ci : 0; }
function attach(ws, room, s, isNew) {
  const p = room.seats[s];
  if (p.ws && p.ws !== ws) { send(p.ws, { t: 'kicked', msg: '你在別的分頁連線了' }); p.ws.ctx = null; try { p.ws.close(); } catch (e) { } }
  p.ws = ws; ws.ctx = { room, seat: s }; room.lastActive = room.lastMsg = Date.now();
  send(ws, { t: 'joined', code: room.code, seat: s, token: p.token, rejoin: !isNew });
  broadcastRoom(room);
  if (room.game && room.game.players) send(ws, { t: 'state', ev: 'sync', data: {}, view: viewFor(room, s) });
  if (room.phase === 'result' && room.game && room.game.result) send(ws, { t: 'result', result: relResult(room.game.result, s), session: sessionFor(room.session, s), view: viewFor(room, s) });
  if (p.pending) sendPrompt(p);
}
function detach(ws) {
  const c = ws.ctx; if (!c) return; ws.ctx = null;
  const { room, seat } = c; const p = room.seats[seat];
  if (!p || p.ws !== ws) return;
  p.ws = null; room.lastActive = Date.now(); room.ready.delete(seat);
  if (p.pending) { const pd = p.pending; pd.done(pd.kind === 'turn' ? pd.fallback() : MJ.AI.claim(room.game, seat, pd.payload.tile, pd.payload.opts)); }
  broadcastRoom(room); maybeAgain(room);
}
function handle(ws, m) {
  const c = ws.ctx;
  switch (m.t) {
    case 'ping': return send(ws, { t: 'pong' });
    case 'create': {
      if (c) detachSeat(ws);
      const room = createRoom();
      room.seats[0] = { name: cleanName(m.name), ci: cleanCi(m.ci), token: token(), ws: null, host: true, pending: null };
      return attach(ws, room, 0, true);
    }
    case 'join': {
      const room = rooms.get(String(m.code || '').trim());
      if (!room) return send(ws, { t: 'err', code: 'noroom', msg: '找不到這個房號（可能已過期）' });
      let s = m.token ? room.seats.findIndex(p => p && p.token === m.token) : -1;
      if (s < 0) s = room.seats.findIndex(p => p && !p.ws && p.name === cleanName(m.name));
      if (s >= 0) { if (m.ci !== undefined && room.phase === 'lobby') room.seats[s].ci = cleanCi(m.ci); return attach(ws, room, s, false); }
      s = room.seats.findIndex(p => !p);
      if (s < 0) return send(ws, { t: 'err', code: 'full', msg: '房間已滿（4 人）' });
      const hasHost = room.seats.some(p => p && p.host);
      room.seats[s] = { name: cleanName(m.name), ci: cleanCi(m.ci), token: token(), ws: null, host: !hasHost, pending: null };
      room.stats[s] = blankStat();
      if (room.ai[s] && room.ai[s].ci === room.seats[s].ci) room.ai[s] = null;
      return attach(ws, room, s, true);
    }
  }
  if (!c) return send(ws, { t: 'err', msg: '尚未加入房間' });
  const { room, seat } = c; const p = room.seats[seat]; room.lastActive = Date.now(); if (m.t !== 'ping') room.lastMsg = Date.now();
  switch (m.t) {
    case 'start': if (p.host && room.phase === 'lobby') startHand(room); break;
    case 'act': if (p.pending && p.pending.pid === m.pid) p.pending.done(m.d || {}); break;
    case 'again': room.ready.add(seat); if (p.host && m.force) startHand(room); else maybeAgain(room); break;
    case 'level': if (p.host && room.phase === 'lobby' && MJ.LEVEL_NAMES[m.v]) { room.level = m.v; broadcastRoom(room); } break;
    case 'chat': {
      const i = +m.i; if (!Number.isInteger(i) || i < 0 || i >= CHAT_N) break;
      const now = Date.now(); p.chatLog = (p.chatLog || []).filter(t => now - t < 20000);
      if (p.chatLog.length >= 6 || (p.chatLog.length && now - p.chatLog[p.chatLog.length - 1] < 1000)) { send(ws, { t: 'err', code: 'slow', msg: '聊天太快了，休息一下～' }); break; }
      p.chatLog.push(now);
      room.seats.forEach((q, s) => q && q.ws && send(q.ws, { t: 'chat', seat: rel(seat, s), i }));
      break;
    }
    case 'profile': if (room.phase === 'lobby') { p.name = cleanName(m.name); p.ci = cleanCi(m.ci); broadcastRoom(room); } break;
    case 'leave': detachSeat(ws, true); send(ws, { t: 'left' }); break;
  }
}
function detachSeat(ws, leaving) {
  const c = ws.ctx; if (!c) return;
  const { room, seat } = c; const p = room.seats[seat];
  detach(ws);
  if (leaving && room.seats[seat] === p) {
    room.seats[seat] = null; room.ready.delete(seat);
    if (p.host) { const n = room.seats.find(x => x && x.ws) || room.seats.find(Boolean); if (n) n.host = true; }
    broadcastRoom(room); maybeAgain(room);
  }
}
/* 心跳 + 清理空房 */
setInterval(() => {
  wss.clients.forEach(ws => { if (!ws.isAlive) return ws.terminate(); ws.isAlive = false; try { ws.ping(); } catch (e) { } });
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (room.seats.some(p => p && p.ws)) {
      if (now - room.lastMsg > IDLE_CLOSE_MS) { for (const p of room.seats) if (p && p.ws) { send(p.ws, { t: 'idle' }); try { p.ws.close(); } catch (e) { } } }
      else { room.lastActive = now; continue; }
    }
    if (now - room.lastActive > ROOM_IDLE_MS) {
      room.dead = true;
      for (const p of room.seats) if (p && p.pending) { clearTimeout(p.pending.timer); p.pending = null; }
      rooms.delete(code); console.log('room cleaned', code);
    }
  }
}, +process.env.SWEEP_MS || 25000);

server.listen(PORT, () => console.log(`麻將伺服器啟動：http://localhost:${PORT}  (rooms via /ws)`));
module.exports = { rooms, server };
