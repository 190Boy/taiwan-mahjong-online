// node test/server.test.js — 線上伺服器的安全／狀態回歸測試（啟動一個本機伺服器，用 ws 客戶端連）
//  1. 斷線玩家的座位不能用「房號＋名字」搶走（只認 token）
//  2. 同一條連線加入第二個房間時，第一個房間的座位會放開（不會害那房每次等 20 秒）
//  3. 吃牌 seq 帶多餘的牌不會吃出 6 張；各種亂七八糟的訊息不會弄壞伺服器
//  4. 猜房號（加入失敗）有次數限制
const { spawn } = require('child_process');
const path = require('path');
const WebSocket = require('ws');
let fail = 0; const ok = (c, m) => { if (!c) { fail++; console.log('FAIL', m); } else console.log('ok  ', m); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const PORT = 3600 + Math.floor(Math.random() * 300);
const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
  env: Object.assign({}, process.env, { PORT: String(PORT), DELAY_SCALE: '0.02', TURN_MS: '20000', CLAIM_MS: '20000', LOBBY_RECLAIM_MS: '400', LIM_CREATEIP: '50', LIM_JOINIP: '200' }),
  stdio: ['ignore', 'ignore', 'pipe'] });
let srvErr = ''; srv.stderr.on('data', d => { srvErr += d; });

function client(name) {
  return new Promise((res, rej) => {
    const ws = new WebSocket(`ws://localhost:${PORT}/ws`); const c = { ws, name, msgs: [], waiters: [] };
    c.send = m => ws.send(typeof m === 'string' ? m : JSON.stringify(m));
    c.wait = (pred, ms = 5000) => new Promise((r, j) => {
      const hit = c.msgs.find(pred); if (hit) return r(hit);
      const w = { pred, r }; c.waiters.push(w);
      setTimeout(() => { const i = c.waiters.indexOf(w); if (i >= 0) { c.waiters.splice(i, 1); r(null); } }, ms);
    });
    c.next = (pred, ms) => { c.msgs = []; return c.wait(pred, ms); };
    ws.on('message', raw => { const m = JSON.parse(raw); c.msgs.push(m); for (const w of c.waiters.slice()) if (w.pred(m)) { c.waiters.splice(c.waiters.indexOf(w), 1); w.r(m); } });
    ws.on('open', () => res(c)); ws.on('error', rej);
    c.close = () => new Promise(r => { ws.once('close', r); ws.close(); });
  });
}
const joined = c => c.wait(m => m.t === 'joined' || m.t === 'err');
// 自動玩：輪到就打最後一張、有人打牌就過
function autoplay(c) {
  c.ws.on('message', raw => { const m = JSON.parse(raw); if (m.t === 'prompt') c.send({ t: 'act', pid: m.pid, d: m.kind === 'turn' ? (m.opts.tsumo ? { type: 'tsumo' } : { type: 'discard', id: -1 }) : { type: 'pass' } }); });
}

(async () => {
  for (let i = 0; i < 50; i++) { try { const c = await client('probe'); await c.close(); break; } catch (e) { await sleep(100); } }

  /* ---------- 1. 用名字搶座位 ---------- */
  {
    const A = await client('A'); A.send({ t: 'create', name: 'Alice', ci: 1 }); const ja = await joined(A);
    const code = ja.code;
    const B = await client('B'); B.send({ t: 'join', code, name: 'Bob', ci: 2 }); const jb = await joined(B);
    ok(jb.t === 'joined' && jb.seat === 1, '大廳：Bob 加入拿到座位 1');
    await B.close(); await sleep(100);
    const X = await client('X'); X.send({ t: 'join', code, name: 'Bob', ci: 2 }); const jx = await joined(X);
    ok(jx.t === 'joined' && jx.seat !== jb.seat && jx.token !== jb.token, `大廳：別人用 Bob 的名字加入 → 拿到別的座位 ${jx.seat}（不是 Bob 的座位、也沒有 Bob 的 token）`);
    const B2 = await client('B2'); B2.send({ t: 'join', code, token: jb.token, name: 'whatever' }); const jb2 = await joined(B2);
    ok(jb2.t === 'joined' && jb2.seat === jb.seat && jb2.rejoin, 'Bob 用自己的 token 重連 → 回到原座位');
    // 牌局中：四個座位都是真人，Bob 斷線，有人用 Bob 的名字（沒有 token）→ 不能進來
    const D = await client('D'); D.send({ t: 'join', code, name: 'Dan' }); const jd = await joined(D);
    ok(jd.t === 'joined', '第 4 位加入');
    [A, B2, X, D].forEach(autoplay);
    A.send({ t: 'start' }); await A.wait(m => m.t === 'state', 5000);
    await B2.close(); await sleep(150);
    const Y = await client('Y'); Y.send({ t: 'join', code, name: 'Bob', ci: 2 }); const jy = await joined(Y);
    ok(jy.t === 'err' && jy.code === 'full', '牌局中：用斷線玩家的名字加入 → 被拒絕（' + (jy.msg || jy.t) + '），看不到他的手牌、拿不到 token');
    ok(!Y.msgs.some(m => m.t === 'state'), '牌局中：被拒絕的連線沒有收到任何牌局畫面');
    const Y2 = await client('Y2'); Y2.send({ t: 'join', code, name: 'Bob', token: 'f'.repeat(24) }); const jy2 = await joined(Y2);
    ok(jy2.t === 'err', '牌局中：亂猜 token 也進不來');
    const B3 = await client('B3'); B3.send({ t: 'join', code, token: jb.token }); const jb3 = await joined(B3);
    const st = await B3.wait(m => m.t === 'state' && m.ev === 'sync');
    ok(jb3.t === 'joined' && jb3.seat === jb.seat && st && st.view.players[0].hand.every(x => x.t >= 0), '牌局中：Bob 用 token 重連 → 回到原座位、看到自己的手牌');
    for (const c of [A, X, D, Y, Y2, B3]) await c.close();
    // 大廳遞補：房間滿了、有人離線超過 LOBBY_RECLAIM_MS → 新玩家拿到「新的」token
    const P = await client('P'); P.send({ t: 'create', name: 'P' }); const jp = await joined(P);
    const others = []; for (const n of ['Q', 'R', 'S']) { const q = await client(n); q.send({ t: 'join', code: jp.code, name: n }); others.push([q, await joined(q)]); }
    await others[2][0].close(); await sleep(600);
    const T = await client('T'); T.send({ t: 'join', code: jp.code, name: 'S' }); const jt = await joined(T);
    ok(jt.t === 'joined' && jt.seat === others[2][1].seat && jt.token !== others[2][1].token && !jt.rejoin, '大廳：房間滿了才遞補離線超過時限的座位，而且給新 token（舊 token 作廢）');
    const S2 = await client('S2'); S2.send({ t: 'join', code: jp.code, token: others[2][1].token }); const js2 = await joined(S2);
    ok(js2.t === 'err', '被遞補後，舊 token 不能再進來');
    for (const c of [P, others[0][0], others[1][0], T, S2]) await c.close();
  }

  /* ---------- 2. 同一條連線加入第二個房間 ---------- */
  {
    const H = await client('H'); H.send({ t: 'create', name: 'Host' }); const jh = await joined(H);
    const Z = await client('Z'); Z.send({ t: 'join', code: jh.code, name: 'Zoe' }); await joined(Z); autoplay(Z);
    const O = await client('O'); O.send({ t: 'create', name: 'Other' }); const jo = await joined(O);
    H.send({ t: 'start' });
    const pr = await H.wait(m => m.t === 'prompt' && m.kind === 'turn', 8000);   // H 是莊家，先輪到他
    ok(!!pr, '房間 1：輪到 H 出牌（伺服器在等他，時限 20 秒）');
    const t0 = Date.now(); Z.msgs = [];
    H.send({ t: 'join', code: jo.code, name: 'Host' }); const jh2 = await H.wait(m => m.t === 'joined' && m.code === jo.code);
    ok(!!jh2, 'H 用同一條連線加入房間 2');
    const disc = await Z.wait(m => m.t === 'state' && m.ev === 'discard', 6000);
    ok(disc && Date.now() - t0 < 3000, `房間 1：H 的座位立刻改由電腦代打（${Date.now() - t0} ms 就打出牌，不用等 20 秒逾時）`);
    const rm = await Z.wait(m => m.t === 'room' && m.absSeats[0].online === false, 3000);
    ok(!!rm, '房間 1：其他人看到 H 已離線');
    for (const c of [H, Z, O]) await c.close();
  }

  /* ---------- 3. 不合法的訊息 ---------- */
  {
    const A = await client('A'); A.send({ t: 'create', name: 'Junk' }); const ja = await joined(A);
    for (const m of ['null', '[]', '5', '"x"', '{"t":5}', '{"t":"act","pid":"x","d":"str"}', '{"t":"act","d":[1,2]}', '{"t":"rtc","to":"x","d":null}', '{"t":"vmute"}', '{"t":"lock","on":{}}', '{"t":"chat","i":1e9}', '{"t":"join","code":{"a":1}}', '{"t":"profile","name":{"x":1},"ci":"9999"}'])
      A.send(m);
    await sleep(200);
    A.send({ t: 'ping' }); const pong = await A.wait(m => m.t === 'pong', 2000);
    ok(!!pong && !/handle error|TypeError/.test(srvErr), '各種亂傳的訊息都被忽略，伺服器沒有出錯');
    // 吃牌帶多餘的牌：用 act 傳 seq 長度 5 → 伺服器整理成「過」，不會吃出 6 張
    let seen = 0; let bad = false;
    A.ws.on('message', raw => {
      const m = JSON.parse(raw);
      if (m.t === 'prompt') {
        if (m.kind === 'claim' && m.opts.chi && m.opts.chi.length) { seen++; const q = m.opts.chi[0]; A.send({ t: 'act', pid: m.pid, d: { type: 'chi', seq: [q[0], q[1], 20, 21, 22] } }); }
        else A.send({ t: 'act', pid: m.pid, d: m.kind === 'turn' ? { type: 'discard', id: -1 } : { type: 'pass' } });
      }
      if (m.t === 'state' && m.view) for (const p of m.view.players) if (p.melds.some(x => x.tiles.length > 4) || p.hand.length > 17) bad = true;
      if (m.t === 'state' && m.view && m.view.players[0].melds.some(x => x.type === 'chi')) bad = true;
    });
    A.send({ t: 'start' });
    for (let i = 0; i < 3; i++) { const r = await A.next(m => m.t === 'result', 20000); if (!r) break; A.send({ t: 'again' }); }
    ok(seen > 0 && !bad, `吃牌傳 5 張的 seq（試了 ${seen} 次）→ 一律當作「過」，沒有出現 6 張的組、手牌數正常`);
    await A.close();
  }

  /* ---------- 4. 猜房號的次數限制 ---------- */
  {
    const G = await client('G'); let slow = 0, noroom = 0;
    for (let i = 0; i < 10; i++) { G.msgs = []; G.send({ t: 'join', code: String(1000 + i), name: 'g' }); const r = await joined(G); if (r.code === 'slow') slow++; else if (r.code === 'noroom') noroom++; }
    ok(noroom === 8 && slow === 2, `同一條連線一分鐘最多試 8 次（找不到 ${noroom} 次、被擋 ${slow} 次）`);
    await G.close();
    let blocked = false;
    for (let k = 0; k < 4 && !blocked; k++) {
      const G2 = await client('G2');
      for (let i = 0; i < 8; i++) { G2.msgs = []; G2.send({ t: 'join', code: String(2000 + k * 10 + i), name: 'g' }); const r = await joined(G2); if (r.code === 'slow') { blocked = true; break; } }
      await G2.close();
    }
    ok(blocked, '換新連線繼續猜，同一個 IP 10 分鐘找不到房號超過 12 次就被擋');
  }

  console.log(fail ? 'FAILURES ' + fail : 'ALL SERVER TESTS OK');
  if (/handle error|game error/.test(srvErr)) console.log(srvErr.slice(0, 2000));
  srv.kill(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); srv.kill(); process.exit(1); });
