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
const LOCK_MS = +process.env.LOCK_MS || 600;   // 鎖定時自動打牌的間隔
const IDLE_CLOSE_MS = +process.env.IDLE_CLOSE_MS || 30 * 60 * 1000;   // 房間 30 分鐘沒人操作就斷線
const ROOM_IDLE_MS = +process.env.ROOM_IDLE_MS || 10 * 60 * 1000;          // 沒人在線多久後清掉房間
const PUB = path.join(__dirname, 'docs');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.mp3': 'audio/mpeg' };
const AI_NAMES = ['小藍', '阿明', '小美', '阿伯', '阿嬤', '王小姐', '喵喵', '小傑', '老張', '阿姨'];

/* ---------- HTTP：提供前端頁面 ---------- */
const server = http.createServer((req, res) => {
  const u = (req.url || '/').split('?')[0];
  if (u === '/health' || u === '/healthz') { res.writeHead(200, { 'content-type': 'text/plain' }); return res.end('ok'); }
  if (u === '/ice') return serveIce(req, res);
  let rel = '';
  try { rel = decodeURIComponent(u === '/' ? '/index.html' : u); } catch (e) { rel = '/x'; }
  const file = path.normalize(path.join(PUB, rel));
  if (file.startsWith(PUB + path.sep) && MIME[path.extname(file)]) {
    return fs.readFile(file, (e, d) => {
      if (e) { res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }); return res.end('找不到頁面'); }
      res.writeHead(200, { 'content-type': MIME[path.extname(file)], 'cache-control': path.extname(file) === '.mp3' ? 'public, max-age=604800' : 'no-cache' });
      res.end(d);
    });
  }
  if (u === '/favicon.ico') { res.writeHead(204); return res.end(); }
  res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }); res.end('找不到頁面');
});

/* ---------- 語音的 ICE 伺服器（STUN＋TURN 中繼） ----------
   聲音優先點對點；雙方網路無法直連（公司防火牆、只開 443、Wi-Fi/有線分開的網段…）才走 TURN 中繼。
   TURN 帳密在伺服器這邊產生「短效」的，金鑰不會送到瀏覽器。依環境變數選一種（都沒設就用 Open Relay 的公開 static-auth）：
   1. CF_TURN_KEY_ID + CF_TURN_API_TOKEN       Cloudflare Realtime TURN（免費額度，需 Cloudflare 帳號）
   2. METERED_DOMAIN + METERED_SECRET_KEY 或 METERED_API_KEY   metered.ca Open Relay 免費方案（需註冊）
   3. TURN_URLS + TURN_SECRET                    自架 coturn（use-auth-secret，HMAC 短效帳密）
   4. TURN_URLS + TURN_USERNAME + TURN_CREDENTIAL 固定帳密
   TURN_DEFAULT=off 可以關掉預設的公開 static-auth 中繼。 */
const STUN = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
const ICE_TTL = 6 * 3600;
const OPENRELAY = { urls: ['turn:staticauth.openrelay.metered.ca:80', 'turn:staticauth.openrelay.metered.ca:80?transport=tcp', 'turn:staticauth.openrelay.metered.ca:443', 'turns:staticauth.openrelay.metered.ca:443?transport=tcp'], secret: 'openrelayprojectsecret' };
let iceCache = null;
function hmacTurn(urls, secret) {
  const username = `${Math.floor(Date.now() / 1000) + ICE_TTL}:mj${crypto.randomBytes(3).toString('hex')}`;
  return { urls, username, credential: crypto.createHmac('sha1', secret).update(username).digest('base64') };
}
const splitUrls = v => String(v || '').split(',').map(x => x.trim()).filter(Boolean);
async function iceServers() {
  const E = process.env;
  if (E.CF_TURN_KEY_ID && E.CF_TURN_API_TOKEN) {
    if (iceCache && iceCache.until > Date.now()) return iceCache.v;
    const r = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(E.CF_TURN_KEY_ID)}/credentials/generate-ice-servers`, {
      method: 'POST', headers: { authorization: 'Bearer ' + E.CF_TURN_API_TOKEN, 'content-type': 'application/json' }, body: JSON.stringify({ ttl: ICE_TTL }) });
    if (!r.ok) throw new Error('cloudflare ' + r.status);
    const j = await r.json(); const list = Array.isArray(j.iceServers) ? j.iceServers : [j.iceServers];
    const v = { provider: 'cloudflare', iceServers: STUN.concat(list.filter(Boolean)) };
    iceCache = { v, until: Date.now() + (ICE_TTL - 600) * 1000 }; return v;
  }
  if (E.METERED_DOMAIN && (E.METERED_SECRET_KEY || E.METERED_API_KEY)) {
    if (iceCache && iceCache.until > Date.now()) return iceCache.v;
    const q = E.METERED_API_KEY ? 'apiKey=' + encodeURIComponent(E.METERED_API_KEY) : 'secretKey=' + encodeURIComponent(E.METERED_SECRET_KEY);
    const r = await fetch(`https://${E.METERED_DOMAIN.replace(/^https?:\/\//, '')}/api/v1/turn/credentials?${q}`);
    if (!r.ok) throw new Error('metered ' + r.status);
    const v = { provider: 'metered', iceServers: STUN.concat(await r.json()) };
    iceCache = { v, until: Date.now() + 3600 * 1000 }; return v;
  }
  if (E.TURN_URLS && E.TURN_SECRET) return { provider: 'coturn', iceServers: STUN.concat([hmacTurn(splitUrls(E.TURN_URLS), E.TURN_SECRET)]) };
  if (E.TURN_URLS && E.TURN_USERNAME) return { provider: 'static', iceServers: STUN.concat([{ urls: splitUrls(E.TURN_URLS), username: E.TURN_USERNAME, credential: E.TURN_CREDENTIAL || '' }]) };
  if (E.TURN_DEFAULT === 'off') return { provider: 'none', iceServers: STUN };
  return { provider: 'openrelay', iceServers: STUN.concat([hmacTurn(OPENRELAY.urls, OPENRELAY.secret)]) };
}
function serveIce(req, res) {
  const hd = { 'content-type': 'application/json', 'cache-control': 'no-store', 'access-control-allow-origin': '*' };
  const now = Date.now();
  if (over(ipLog(clientIp(req)).ice, LIM.iceIp, now)) { res.writeHead(429, hd); return res.end('{"error":"slow"}'); }
  iceServers().then(v => { res.writeHead(200, hd); res.end(JSON.stringify(Object.assign({ ttl: ICE_TTL }, v))); },
    e => { console.error('ice', e.message); res.writeHead(200, hd); res.end(JSON.stringify({ ttl: 600, provider: 'stun-only', error: 'turn unavailable', iceServers: STUN })); });
}

/* ---------- 房間 ---------- */
const rooms = new Map();
const rel = (s, me) => (s - me + 4) % 4;
const abs = (r, me) => (r + me) % 4;
const rot = (arr, me) => [0, 1, 2, 3].map(r => arr[abs(r, me)]);
const token = () => crypto.randomBytes(12).toString('hex');
function newCode() { let c; do { c = String(1000 + crypto.randomInt(9000)); } while (rooms.has(c)); return c; }   // 房間數有上限（MAX_ROOMS），不會無限迴圈
const online = (room, s) => !!(room.seats[s] && room.seats[s].ws);
const send = (ws, msg) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg)); };

const blankStat = () => ({ hands: 0, wins: 0, tsumo: 0, dealins: 0, tai: 0, pts: 0 });
const CHAT_N = 16;
let voiceSeq = 0;
const RTC_MAX = 300, RTC_WIN = 20000;
/* ---------- 防濫用：加入房間次數限制（防止猜 4 位數房號）、開房次數、訊息頻率 ---------- */
const LIM = {
  joinConn: [8, 60 * 1000],          // 每條連線每分鐘最多試 8 次加入
  joinIp: [30, 10 * 60 * 1000],      // 每個 IP 10 分鐘最多 30 次加入
  failIp: [12, 10 * 60 * 1000],      // 每個 IP 10 分鐘最多 12 次「找不到房號」
  createIp: [12, 10 * 60 * 1000],    // 每個 IP 10 分鐘最多開 12 間房
  msgConn: [400, 10 * 1000],         // 每條連線 10 秒最多 400 則訊息（超過就斷線）
  bcastConn: [40, 10 * 1000],        // 會廣播給全房的動作（語音狀態、改名、準備…）10 秒最多 40 次
  iceIp: [60, 10 * 60 * 1000]        // /ice（語音中繼帳密）每個 IP 10 分鐘 60 次
};
Object.keys(LIM).forEach(k => { const e = process.env['LIM_' + k.toUpperCase()]; if (e) LIM[k] = [+e, LIM[k][1]]; });   // 測試用
const MAX_ROOMS = +process.env.MAX_ROOMS || 2000;
const LOBBY_RECLAIM_MS = +process.env.LOBBY_RECLAIM_MS || 60 * 1000;   // 大廳裡離線超過 1 分鐘的座位，房間滿時可讓新玩家遞補（給新 token，不沿用舊的）
const ipLogs = new Map();            // ip → { join:[], fail:[], create:[] }
function over(log, [max, win], now) { while (log.length && now - log[0] > win) log.shift(); if (log.length >= max) return true; log.push(now); return false; }
function ipLog(ip) { let l = ipLogs.get(ip); if (!l) ipLogs.set(ip, l = { join: [], fail: [], create: [], ice: [], t: 0 }); l.t = Date.now(); return l; }
function clientIp(req) {
  const h = req.headers || {};
  const v = h['cf-connecting-ip'] || h['true-client-ip'] || String(h['x-forwarded-for'] || '').split(',')[0].trim() || (req.socket && req.socket.remoteAddress) || '?';
  return String(v).slice(0, 64);
}   // 語音信令：每個座位 20 秒最多 300 則（ICE 候選會比較多）
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
    if (room.ai[s] && (room.ai[s].stand || !used.has(room.ai[s].ci))) { used.add(room.ai[s].ci); continue; }
    const pool = AI_NAMES.map((_, i) => i).filter(i => !used.has(i));
    const ci = pool[Math.floor(Math.random() * pool.length)];
    used.add(ci); room.ai[s] = { ci, name: AI_NAMES[ci] };
  }
}
function seatInfo(room, s) {
  const p = room.seats[s];
  if (p) return { name: p.name, ci: p.ci, human: true, online: !!p.ws, host: !!p.host, ready: room.ready.has(s),
    voice: p.voice && p.ws ? { id: p.voice.id, n: p.voice.n, muted: p.voice.muted } : null };
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
      const p = room.seats[s];
      if (p && p.lock) {                       // 聽牌鎖定：伺服器自己打摸到的牌（不靠玩家分頁）
        const r = MJ.lockedTurn(g, seat, opts, p.lock.autoHu);
        if (r === undefined) setLock(room, s, false, '聽牌已改變，已解除鎖定');
        else if (r) return sleep(room, LOCK_MS).then(() => r);
        else if (online(room, s)) return ask(room, s, 'turn', { opts: Object.assign({}, opts, { kongs: [] }) }, TURN_MS, () => ({ type: 'tsumo' }));
      }
      if (!online(room, s)) return aiThink(room, () => MJ.AI.turn(g, seat, opts));
      return ask(room, s, 'turn', { opts }, TURN_MS, () => MJ.AI.turn(g, seat, opts));
    },
    claim(g, seat, tile, opts) {
      if (room.dead) throw new Error('room closed');
      const p = room.seats[s];
      if (p && p.lock) {
        if (!MJ.lockWaits(g, seat).length) setLock(room, s, false, '聽牌已改變，已解除鎖定');
        else {
          const o = MJ.lockedClaim(opts);
          if (!o) return { type: 'pass' };
          if (p.lock.autoHu || !online(room, s)) return { type: 'hu' };
          return ask(room, s, 'claim', { opts: o, tile }, CLAIM_MS, () => ({ type: 'hu' }));
        }
      }
      if (!online(room, s)) return aiThink(room, () => MJ.AI.claim(g, seat, tile, opts));
      return ask(room, s, 'claim', { opts, tile }, CLAIM_MS, () => ({ type: 'pass' }));
    }
  };
}
// 電腦思考前先讓出事件迴圈（setImmediate），別的房間的訊息可以先處理
const aiThink = (room, fn) => new Promise((res, rej) => setImmediate(() => { if (room.dead) return rej(new Error('room closed')); try { res(fn()); } catch (e) { rej(e); } }));
function setLock(room, s, on, why, autoHu, retry) {
  const p = room.seats[s]; if (!p) return;
  const g = room.game;
  if (on && p.lock) p.lock.autoHu = !!autoHu;
  else if (on) {
    const w = g && g.players && !g.over ? MJ.lockWaits(g, s) : [];
    if (!w.length) {
      if (retry) return setImmediate(() => setLock(room, s, on, why, autoHu, false));   // 「打出並鎖定」：等這張牌打出去再判斷
      send(p.ws, { t: 'lock', on: false, why: '現在沒有聽牌，不能鎖定' }); return;
    }
    p.lock = { autoHu: !!autoHu, waits: w };
  } else p.lock = null;
  send(p.ws, { t: 'lock', on: !!p.lock, autoHu: p.lock ? p.lock.autoHu : false, waits: p.lock ? p.lock.waits : null, why: why || '' });
  if (p.lock && p.pending && p.pending.kind === 'claim' && !p.pending.payload.opts.hu) p.pending.done({ type: 'pass' });
}
const sleep = (room, ms) => new Promise((res, rej) => setTimeout(() => room.dead ? rej(new Error('room closed')) : res(), ms * DELAY_SCALE));

function startHand(room) {
  if (room.phase === 'playing' || room.dead) return;
  fillAI(room);
  for (const p of room.seats) if (p) p.lock = null;
  room.phase = 'playing'; room.ready.clear();
  const g = room.session.newGame({ aiLevel: room.level, controllers: [0, 1, 2, 3].map(s => makeCtrl(room, s)),
    onEvent: (ev, d) => onGameEvent(room, ev, d), delay: ms => sleep(room, ms) });
  room.game = g;
  broadcastRoom(room);
  g.play().then(r => {
    for (const p of room.seats) if (p) p.lock = null;
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
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 24 * 1024 });
wss.on('connection', (ws, req) => {
  ws.isAlive = true; ws.on('pong', () => { ws.isAlive = true; });
  ws.ctx = null; // { room, seat }
  ws.ip = clientIp(req); ws.lim = { join: [], msg: [], bcast: [] };
  ws.on('message', raw => {
    if (over(ws.lim.msg, LIM.msgConn, Date.now())) { try { ws.close(1008, 'too many messages'); } catch (e) { } return; }
    let m; try { m = JSON.parse(raw); } catch (e) { return; }
    if (!m || typeof m !== 'object' || Array.isArray(m) || typeof m.t !== 'string') return;
    try { handle(ws, m); } catch (e) { console.error('handle error', e); send(ws, { t: 'err', msg: '伺服器錯誤' }); }
  });
  ws.on('close', () => detach(ws));
});
const BCAST = new Set(['start', 'again', 'lock', 'vjoin', 'vleave', 'vmute', 'level', 'profile', 'leave', 'dissolve']);
// 玩家回覆只留下需要的欄位、型別正確（牌局邏輯還會再對照可用選項驗證一次）
function cleanAct(d) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return {};
  const o = {}; const int = v => Number.isInteger(v) ? v : undefined;
  if (['discard', 'tsumo', 'kong', 'hu', 'pon', 'chi', 'pass'].includes(d.type)) o.type = d.type;
  if (int(d.id) !== undefined) o.id = d.id;
  if (d.kind === 'an' || d.kind === 'add') o.kind = d.kind;
  if (int(d.t) !== undefined) o.t = d.t;
  if (Array.isArray(d.seq) && d.seq.length === 2 && d.seq.every(v => Number.isInteger(v) && v >= 0 && v < 27)) o.seq = [d.seq[0], d.seq[1]];
  return o;
}
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
  if (p.lock) send(ws, { t: 'lock', on: true, autoHu: p.lock.autoHu, waits: p.lock.waits });
  if (p.pending) sendPrompt(p);
}
function detach(ws) {
  const c = ws.ctx; if (!c) return; ws.ctx = null;
  const { room, seat } = c; const p = room.seats[seat];
  if (!p || p.ws !== ws) return;
  p.ws = null; p.voice = null; p.offAt = Date.now(); room.lastActive = Date.now(); room.ready.delete(seat);
  if (p.pending) { const pd = p.pending; pd.done(pd.kind === 'turn' ? pd.fallback() : MJ.AI.claim(room.game, seat, pd.payload.tile, pd.payload.opts)); }
  broadcastRoom(room); maybeAgain(room);
}
function handle(ws, m) {
  const c = ws.ctx;
  switch (m.t) {
    case 'ping': return send(ws, { t: 'pong' });
    case 'create': {
      const now = Date.now();
      if (over(ipLog(ws.ip).create, LIM.createIp, now)) return send(ws, { t: 'err', code: 'slow', msg: '開房太頻繁了，請稍後再試' });
      if (rooms.size >= MAX_ROOMS) return send(ws, { t: 'err', code: 'busy', msg: '伺服器房間已滿，請稍後再試' });
      if (c) detachSeat(ws);
      const room = createRoom();
      room.seats[0] = { name: cleanName(m.name), ci: cleanCi(m.ci), token: token(), ws: null, host: true, pending: null };
      return attach(ws, room, 0, true);
    }
    case 'join': {
      const now = Date.now(), il = ipLog(ws.ip);
      const slow = () => send(ws, { t: 'err', code: 'slow', msg: '嘗試加入太多次了，請稍後再試' });
      if (over(ws.lim.join, LIM.joinConn, now) || il.fail.filter(t => now - t < LIM.failIp[1]).length >= LIM.failIp[0]) return slow();
      const room = rooms.get(String(m.code || '').trim().slice(0, 8));
      if (!room) { over(il.fail, LIM.failIp, now); return send(ws, { t: 'err', code: 'noroom', msg: '找不到這個房號（可能已過期）' }); }
      // 斷線重連只認 token（不再用名字比對，避免別人用名字搶座位、看手牌、拿到 token）
      const tok = typeof m.token === 'string' && /^[0-9a-f]{24}$/.test(m.token) ? m.token : null;
      let s = tok ? room.seats.findIndex(p => p && p.token === tok) : -1;
      if (c && !(c.room === room && c.seat === s)) detachSeat(ws);   // 這條連線原本在別的房間／座位 → 先放開，那邊改由電腦代打
      if (s >= 0) { if (m.ci !== undefined && room.phase === 'lobby') room.seats[s].ci = cleanCi(m.ci); return attach(ws, room, s, false); }
      if (over(il.join, LIM.joinIp, now)) return slow();          // 新座位才算（同一個 Wi-Fi 好幾人斷線重連不受影響）
      s = room.seats.findIndex(p => !p);
      if (s < 0 && room.phase === 'lobby') s = room.seats.findIndex(p => p && !p.ws && p.offAt && now - p.offAt > LOBBY_RECLAIM_MS);   // 大廳：遞補離線很久的座位（新 token）
      if (s < 0) return send(ws, { t: 'err', code: 'full', msg: room.phase === 'lobby' ? '房間已滿（4 人）' : '房間已滿或牌局進行中' });
      const hasHost = room.seats.some((p, i) => p && p.host && i !== s);
      room.seats[s] = { name: cleanName(m.name), ci: cleanCi(m.ci), token: token(), ws: null, host: !hasHost, pending: null };
      room.stats[s] = blankStat(); room.ready.delete(s);
      if (room.ai[s] && room.ai[s].ci === room.seats[s].ci) room.ai[s] = null;
      return attach(ws, room, s, true);
    }
  }
  if (!c) return send(ws, { t: 'err', msg: '尚未加入房間' });
  const { room, seat } = c; const p = room.seats[seat]; if (!p) return; room.lastActive = Date.now(); if (m.t !== 'ping') room.lastMsg = Date.now();
  if (BCAST.has(m.t) && over(ws.lim.bcast, LIM.bcastConn, Date.now())) return send(ws, { t: 'err', code: 'slow', msg: '操作太頻繁了，休息一下～' });
  switch (m.t) {
    case 'start': if (p.host && room.phase === 'lobby') startHand(room); break;
    case 'act': if (p.pending && p.pending.pid === m.pid) p.pending.done(cleanAct(m.d)); break;
    case 'again': room.ready.add(seat); if (p.host && m.force) startHand(room); else maybeAgain(room); break;
    case 'lock': if (room.phase === 'playing') setLock(room, seat, !!m.on, '', !!m.autoHu, true); break;
    case 'vjoin': p.voice = { id: crypto.randomBytes(4).toString('hex'), n: ++voiceSeq, muted: !!m.muted }; broadcastRoom(room); break;
    case 'vleave': if (p.voice) { p.voice = null; broadcastRoom(room); } break;
    case 'vmute': if (p.voice) { p.voice.muted = !!m.muted; broadcastRoom(room); } break;
    case 'rtc': {                                   // 只轉送 offer / answer / ice 給同房、也在語音裡的玩家；聲音本身是 P2P，不經過伺服器
      if (!p.voice) break;
      const to = abs(+m.to, seat); const q = room.seats[to];
      const d = m.d || {}; if (to === seat || !q || !q.ws || !q.voice || !['offer', 'answer', 'ice'].includes(d.type)) break;
      if (m.vid !== q.voice.id) break;              // 對方已經換了一次語音連線 → 丟掉舊的信令
      const now = Date.now(); p.rtcLog = (p.rtcLog || []).filter(t => now - t < RTC_WIN);
      if (p.rtcLog.length >= RTC_MAX) break; p.rtcLog.push(now);
      const out = { type: d.type };
      if (d.type === 'ice') out.c = d.c && typeof d.c === 'object' ? { candidate: String(d.c.candidate || '').slice(0, 1000), sdpMid: d.c.sdpMid == null ? null : String(d.c.sdpMid).slice(0, 32), sdpMLineIndex: d.c.sdpMLineIndex == null ? null : +d.c.sdpMLineIndex } : null;
      else out.sdp = String(d.sdp || '').slice(0, 15000);
      send(q.ws, { t: 'rtc', from: rel(seat, to), vid: p.voice.id, d: out });
      break;
    }
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
    case 'leave': detachSeat(ws, true); send(ws, { t: 'left' }); break;      // 離開牌桌：座位交給電腦（牌局中）或空出（大廳），token 作廢
    case 'dissolve': if (p.host) dissolveRoom(room, '房主解散了牌桌'); break;
  }
}
function detachSeat(ws, leaving) {
  const c = ws.ctx; if (!c) return;
  const { room, seat } = c; const p = room.seats[seat];
  detach(ws);
  if (leaving && room.seats[seat] === p) {
    room.seats[seat] = null; room.ready.delete(seat); p.lock = null;
    if (room.phase !== 'lobby') room.ai[seat] = { ci: p.ci, name: p.name.slice(0, 5) + '(電腦)', stand: true };   // 牌局中：同一個頭像改由電腦代打
    if (!room.seats.some(Boolean)) return dissolveRoom(room, '');            // 沒有真人了 → 房間直接收掉
    if (p.host) { const n = room.seats.find(x => x && x.ws) || room.seats.find(Boolean); if (n) n.host = true; }   // 房主離開 → 交給其他真人
    broadcastRoom(room); maybeAgain(room);
  }
}
function dissolveRoom(room, msg) {
  if (room.dead) return;
  room.dead = true; rooms.delete(room.code);
  for (const q of room.seats) {
    if (!q) continue;
    if (q.pending) { clearTimeout(q.pending.timer); q.pending = null; }
    if (q.ws) { send(q.ws, { t: 'dissolved', msg }); q.ws.ctx = null; }
    q.ws = null; q.token = null;
  }
  console.log('room dissolved', room.code);
}
/* 心跳 + 清理空房 */
setInterval(() => {
  wss.clients.forEach(ws => { if (!ws.isAlive) return ws.terminate(); ws.isAlive = false; try { ws.ping(); } catch (e) { } });
  const now = Date.now();
  for (const [ip, l] of ipLogs) if (now - l.t > 15 * 60 * 1000) ipLogs.delete(ip);
  for (const [code, room] of rooms) {
    if (room.seats.some(p => p && p.ws)) {
      const talking = room.seats.filter(p => p && p.ws && p.voice).length >= 2;   // 正在語音聊天的房間不算閒置
      if (!talking && now - room.lastMsg > IDLE_CLOSE_MS) { for (const p of room.seats) if (p && p.ws) { send(p.ws, { t: 'idle' }); try { p.ws.close(); } catch (e) { } } }
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
