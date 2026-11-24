// node test/server.test.js — 線上伺服器的安全／狀態回歸測試（啟動一個本機伺服器，用 ws 客戶端連）
//  1. 斷線玩家的座位不能用「房號＋名字」搶走（只認 token）
//  2. 同一條連線加入第二個房間時，第一個房間的座位會放開（不會害那房每次等 20 秒）
//  3. 吃牌 seq 帶多餘的牌不會吃出 6 張；各種亂七八糟的訊息不會弄壞伺服器
//  4. 猜房號（加入失敗）有次數限制
//  5. 離開牌桌／解散牌桌  6. 語音信令轉送  7. /ice（TURN 短效帳密）
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
    for (let i = 0; i < 12 && (i < 3 || !seen); i++) { const r = await A.next(m => m.t === 'result', 20000); if (!r) break; A.send({ t: 'again' }); }   // 隨機牌局不一定有吃牌機會：最多打到 12 局
    ok(seen > 0 && !bad, `吃牌傳 5 張的 seq（試了 ${seen} 次）→ 一律當作「過」，沒有出現 6 張的組、手牌數正常`);
    await A.close();
  }

  /* ---------- 5. 離開牌桌／解散牌桌 ---------- */
  {
    const H = await client('H'); H.send({ t: 'create', name: 'Host' }); const jh = await joined(H); const code = jh.code;
    const M = await client('M'); M.send({ t: 'join', code, name: 'Mem' }); const jm = await joined(M);
    const N = await client('N'); N.send({ t: 'join', code, name: 'Nina' }); const jn = await joined(N);
    // 大廳：成員離開 → 座位空出、token 作廢
    M.send({ t: 'leave' }); const lm = await M.wait(m => m.t === 'left');
    const rm1 = await H.wait(m => m.t === 'room' && !m.absSeats[jm.seat].human, 3000);
    ok(!!lm && !!rm1, '大廳：成員離開牌桌 → 座位空出來（變成電腦空位）');
    const M2 = await client('M2'); M2.send({ t: 'join', code, token: jm.token }); const jm2 = await joined(M2);
    ok(jm2.t === 'joined' && jm2.seat !== undefined && jm2.token !== jm.token && !jm2.rejoin, '離開後舊 token 作廢（再用舊 token 只會當新玩家加入）');
    M2.send({ t: 'leave' }); await M2.wait(m => m.t === 'left');
    // 牌局中：成員離開 → 座位改由電腦代打、牌局繼續
    [H, N].forEach(autoplay);
    H.send({ t: 'start' }); await H.wait(m => m.t === 'state', 5000);
    N.msgs = []; N.send({ t: 'leave' }); await N.wait(m => m.t === 'left');
    const rm2 = await H.wait(m => m.t === 'room' && m.absSeats[jn.seat].ai && /電腦/.test(m.absSeats[jn.seat].name), 3000);
    ok(!!rm2, '牌局中：成員離開 → 座位交給電腦代打（顯示「Nina(電腦)」）');
    H.msgs = []; const st = await H.wait(m => m.t === 'state' && m.data && m.data.seat === 1, 8000);
    ok(!!st, '牌局中：離開後牌局繼續進行');
    const N2 = await client('N2'); N2.send({ t: 'join', code, token: jn.token }); const jn2 = await joined(N2);
    ok(jn2.t === 'joined' ? jn2.seat !== jn.seat || !jn2.rejoin : true, '離開後不能用舊 token 回到原座位');
    await N2.close();
    // 房主離開 → 房主交給其他真人
    const P = await client('P'); P.send({ t: 'create', name: 'P' }); const jp = await joined(P);
    const Q = await client('Q'); Q.send({ t: 'join', code: jp.code, name: 'Q' }); const jq = await joined(Q);
    Q.msgs = []; P.send({ t: 'leave' }); const rq = await Q.wait(m => m.t === 'room' && m.isHost, 3000);
    ok(!!rq, '房主離開 → 房主交給另一位真人');
    Q.send({ t: 'leave' }); await Q.wait(m => m.t === 'left'); await sleep(100);
    const Z = await client('Z'); Z.send({ t: 'join', code: jp.code, name: 'Z' }); const jz = await joined(Z);
    ok(jz.t === 'err' && jz.code === 'noroom', '最後一位真人離開 → 房間直接刪除');
    // 解散：只有房主可以；所有人收到 dissolved、房間刪除
    const D = await client('D'); D.send({ t: 'create', name: 'D' }); const jd = await joined(D);
    const E = await client('E'); E.send({ t: 'join', code: jd.code, name: 'E' }); await joined(E);
    E.send({ t: 'dissolve' }); await sleep(200);
    const F = await client('F'); F.send({ t: 'join', code: jd.code, name: 'F' }); const jf = await joined(F);
    ok(jf.t === 'joined', '非房主送「解散」→ 沒有效果');
    E.send({ t: 'vjoin' }); await sleep(100);
    [D, E, F].forEach(autoplay); D.send({ t: 'start' }); await D.wait(m => m.t === 'state', 5000);
    D.send({ t: 'dissolve' });
    const dd = await Promise.all([D, E, F].map(c => c.wait(m => m.t === 'dissolved', 3000)));
    ok(dd.every(Boolean) && /解散/.test(dd[1].msg), '房主解散（牌局中）→ 所有人收到「房主解散了牌桌」');
    const G = await client('G'); G.send({ t: 'join', code: jd.code, token: 'x' }); const jg = await joined(G);
    ok(jg.t === 'err' && jg.code === 'noroom', '解散後房間刪除，加入會「找不到房號」');
    E.msgs = []; E.send({ t: 'chat', i: 1 }); const e2 = await E.wait(m => m.t === 'err', 1500);
    ok(e2 && /尚未加入/.test(e2.msg), '解散後原本的連線不再屬於任何房間');
    await sleep(300); ok(!/game error|handle error/.test(srvErr), '解散進行中的牌局，伺服器沒有出錯');
    for (const c of [H, M, M2, N, P, Q, Z, D, E, F, G]) try { await c.close(); } catch (e) { }
  }

  /* ---------- 6. 語音信令轉送：offer／answer／ICE 原樣送到、一次幾十個 ICE 不會被限速擋掉 ---------- */
  {
    const A = await client('A'); A.send({ t: 'create', name: 'VA' }); const ja = await joined(A);
    const B = await client('B'); B.send({ t: 'join', code: ja.code, name: 'VB' }); await joined(B);
    A.send({ t: 'vjoin' }); B.send({ t: 'vjoin' }); await sleep(300);
    const ra = A.msgs.filter(m => m.t === 'room').pop(), rb = B.msgs.filter(m => m.t === 'room').pop();
    const vidA = ra.seats[0].voice.id, vidB = rb.seats[0].voice.id;
    const relB = rb.seats.findIndex(x => x.voice && x.voice.id === vidA), relA = ra.seats.findIndex(x => x.voice && x.voice.id === vidB);
    const sdp = 'v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\n' + 'a=x\r\n'.repeat(400);
    B.send({ t: 'rtc', to: relB, vid: vidA, d: { type: 'offer', sdp } });
    const cands = []; for (let i = 0; i < 60; i++) { const c = { candidate: `candidate:${i} 1 udp 2122260223 10.0.0.${i} 5${i}000 typ ${i % 3 ? 'srflx raddr 0.0.0.0 rport 0' : 'host'} generation 0`, sdpMid: '0', sdpMLineIndex: 0, usernameFragment: 'abcd' }; cands.push(c); B.send({ t: 'rtc', to: relB, vid: vidA, d: { type: 'ice', c } }); }
    B.send({ t: 'rtc', to: relB, vid: vidA, d: { type: 'ice', c: { candidate: 'candidate:9 1 tcp 1 1.2.3.4 443 typ relay raddr 0.0.0.0 rport 0', sdpMid: null, sdpMLineIndex: null } } });
    await sleep(500);
    const got = A.msgs.filter(m => m.t === 'rtc');
    const off = got.find(m => m.d.type === 'offer'), ices = got.filter(m => m.d.type === 'ice');
    ok(off && off.d.sdp === sdp && off.from === relA && off.vid === vidB, 'offer 原樣轉送（含發送者座位、語音編號）');
    ok(ices.length === 61 && ices.slice(0, 60).every((m, i) => m.d.c.candidate === cands[i].candidate && m.d.c.sdpMid === '0' && m.d.c.sdpMLineIndex === 0), `一次 61 個 ICE 候選全部依序轉送（收到 ${ices.length}）`);
    ok(ices[60] && ices[60].d.c.sdpMid === null && /typ relay/.test(ices[60].d.c.candidate), 'relay 候選、sdpMid=null 也正確轉送');
    A.send({ t: 'rtc', to: relA, vid: vidB, d: { type: 'answer', sdp: 'v=0 answer' } }); const ans = await B.wait(m => m.t === 'rtc' && m.d.type === 'answer', 2000);
    ok(ans && ans.d.sdp === 'v=0 answer', 'answer 轉送回去');
    A.msgs = []; B.send({ t: 'rtc', to: relB, vid: 'stale', d: { type: 'ice', c: cands[0] } }); await sleep(200);
    ok(!A.msgs.some(m => m.t === 'rtc'), '舊的語音編號（對方已重新加入）→ 信令丟掉');
    for (const c of [A, B]) await c.close();
  }

  /* ---------- 7. /ice：回傳 STUN＋TURN 短效帳密，不含金鑰 ---------- */
  {
    const r = await fetch(`http://localhost:${PORT}/ice`); const j = await r.json();
    const turn = j.iceServers.filter(x => [].concat(x.urls).some(u => /^turns?:/.test(u)));
    const urls = turn.flatMap(x => [].concat(x.urls));
    ok(r.headers.get('access-control-allow-origin') === '*' && j.iceServers.some(x => [].concat(x.urls).some(u => /^stun:/.test(u))), '/ice 有 STUN、允許 GitHub Pages 跨網域讀取');
    ok(turn.length && turn.every(x => /^\d+:/.test(x.username) && x.credential) && urls.some(u => /^turns:.*:443/.test(u)) && urls.some(u => /transport=tcp/.test(u)), `/ice 有 TURN（${j.provider}）：短效帳密、含 turns:443 與 TCP（公司網路只開 443 也能走）`);
    ok(!JSON.stringify(j).includes('openrelayprojectsecret'), '/ice 不會把 TURN 金鑰送給瀏覽器');
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
