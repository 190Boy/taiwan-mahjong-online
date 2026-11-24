'use strict';
/* ===== 麻將核心邏輯（無 DOM，可在 node 測試） ===== */
const MJ = (function () {
  const SUITS = ['萬', '筒', '條'];
  const NUMS = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
  const WINDS = ['東', '南', '西', '北'];
  const FLOWERS = ['春', '夏', '秋', '冬', '梅', '蘭', '竹', '菊'];
  const RESERVE = 16;      // 留牌 16 張
  const BASE = 300, PER = 100; // 底 300 / 每台 100

  function tileName(t) {
    if (t < 27) return NUMS[t % 9] + SUITS[(t / 9) | 0];
    if (t < 31) return WINDS[t - 27] + '風';
    if (t === 31) return '紅中';
    if (t === 32) return '青發';
    if (t === 33) return '白板';
    return FLOWERS[t - 34];
  }
  const isHonor = t => t >= 27 && t < 34;
  const isFlower = t => t >= 34;
  const isTerminal = t => t < 27 && (t % 9 === 0 || t % 9 === 8);

  function rngFrom(seed) { // mulberry32
    let a = seed >>> 0;
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function makeWall(rng) {
    const w = []; let id = 0;
    for (let t = 0; t < 34; t++) for (let k = 0; k < 4; k++) w.push({ id: id++, t });
    for (let f = 34; f < 42; f++) w.push({ id: id++, t: f });
    for (let i = w.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [w[i], w[j]] = [w[j], w[i]]; }
    return w;
  }
  function countsOf(tiles) { const c = new Array(34).fill(0); for (const x of tiles) if (x.t < 34) c[x.t]++; return c; }
  const sum = c => c.reduce((a, b) => a + b, 0);

  /* --- 胡牌判定：need 組面子 + 1 對眼 --- */
  function setsOnly(c, need) {
    let i = 0; while (i < 34 && !c[i]) i++;
    if (i === 34) return need === 0;
    if (need === 0) return false;
    if (c[i] >= 3) { c[i] -= 3; const ok = setsOnly(c, need - 1); c[i] += 3; if (ok) return true; }
    if (i < 27 && i % 9 <= 6 && c[i + 1] && c[i + 2]) {
      c[i]--; c[i + 1]--; c[i + 2]--; const ok = setsOnly(c, need - 1); c[i]++; c[i + 1]++; c[i + 2]++;
      if (ok) return true;
    }
    return false;
  }
  /* 嚦咕嚦咕：門清（沒有吃碰槓，連暗槓也不行 → need 一定是 5）、17 張＝7 個不同的對子＋1 個刻子；4 張一樣不算兩對 */
  function isLigu(c, need) {
    if (need !== 5) return false;
    let pairs = 0, trips = 0;
    for (let i = 0; i < 34; i++) { const n = c[i]; if (!n) continue; if (n === 2) pairs++; else if (n === 3) trips++; else return false; }
    return pairs === 7 && trips === 1;
  }
  function isWinCounts(c, need) {
    if (sum(c) !== need * 3 + 2) return false;
    if (need === 5 && isLigu(c, need)) return true;
    for (let i = 0; i < 34; i++) if (c[i] >= 2) {
      c[i] -= 2; const ok = setsOnly(c, need); c[i] += 2; if (ok) return true;
    }
    return false;
  }
  function decompose(c, need) {
    const res = [];
    for (let i = 0; i < 34; i++) if (c[i] >= 2) {
      c[i] -= 2; const sets = [];
      (function rec() {
        let j = 0; while (j < 34 && !c[j]) j++;
        if (j === 34) { if (sets.length === need) res.push({ pair: i, sets: sets.slice() }); return; }
        if (sets.length >= need) return;
        if (c[j] >= 3) { c[j] -= 3; sets.push({ k: 'p', t: j }); rec(); sets.pop(); c[j] += 3; }
        if (j < 27 && j % 9 <= 6 && c[j + 1] && c[j + 2]) {
          c[j]--; c[j + 1]--; c[j + 2]--; sets.push({ k: 'c', t: j }); rec(); sets.pop(); c[j]++; c[j + 1]++; c[j + 2]++;
        }
      })();
      c[i] += 2;
    }
    return res;
  }
  function waits(c, need) {
    const w = [];
    if (sum(c) !== need * 3 + 1) return w;
    for (let t = 0; t < 34; t++) { if (c[t] >= 4) continue; c[t]++; if (isWinCounts(c, need)) w.push(t); c[t]--; }
    return w;
  }

  /* --- 向聽數（AI 用） ---
     把手牌拆成 萬／筒／條／字 四組，各組先列出所有 (面子數, 搭子數, 有沒有眼) 的組合（同一組牌型只算一次，記起來），
     再合併四組。結果和逐張窮舉一樣，但快上百倍，AI 不會卡住伺服器。 */
  const GRP = new Map();
  function groupTuples(c, off, len, honor) {
    let key = honor ? 'h' : 's'; for (let i = 0; i < len; i++) key += c[off + i];
    let hit = GRP.get(key); if (hit) return hit;
    const a = []; for (let i = 0; i < len; i++) a.push(c[off + i]);
    const seen = new Set(); const out = [];
    const rec = (i, m, d, p) => {
      while (i < len && !a[i]) i++;
      if (i >= len) { const k = (m * 16 + d) * 2 + p; if (!seen.has(k)) { seen.add(k); out.push([m, d, p]); } return; }
      if (a[i] >= 3) { a[i] -= 3; rec(i, m + 1, d, p); a[i] += 3; }
      if (!honor && i <= 6 && a[i + 1] && a[i + 2]) { a[i]--; a[i + 1]--; a[i + 2]--; rec(i, m + 1, d, p); a[i]++; a[i + 1]++; a[i + 2]++; }
      if (a[i] >= 2) { a[i] -= 2; if (!p) rec(i, m, d, 1); rec(i, m, d + 1, p); a[i] += 2; }
      if (!honor) {
        if (i <= 7 && a[i + 1]) { a[i]--; a[i + 1]--; rec(i, m, d + 1, p); a[i]++; a[i + 1]++; }
        if (i <= 6 && a[i + 2]) { a[i]--; a[i + 2]--; rec(i, m, d + 1, p); a[i]++; a[i + 2]++; }
      }
      a[i]--; rec(i, m, d, p); a[i]++;
    };
    rec(0, 0, 0, 0);
    // 去掉被支配的組合（面子、搭子、眼都不比別人多）
    hit = out.filter(x => !out.some(y => y !== x && y[0] >= x[0] && y[0] + y[1] >= x[0] + x[1] && y[1] >= x[1] && y[2] === x[2] && (y[0] > x[0] || y[1] > x[1])));
    if (GRP.size > 50000) GRP.clear();
    GRP.set(key, hit);
    return hit;
  }
  // 嚦咕嚦咕的向聽數：挑 8 種牌，各取 2 張，其中有 3 張的那種多算 1 張；差幾張 − 1
  function liguShanten(c) {
    const v = []; let three = false;
    for (let i = 0; i < 34; i++) if (c[i]) { v.push(Math.min(2, c[i])); if (c[i] >= 3) three = true; }
    v.sort((a, b) => b - a);
    let m = 0; for (let i = 0; i < 8 && i < v.length; i++) m += v[i];
    return 17 - (m + (three ? 1 : 0)) - 1;
  }
  function shanten(c, need) {
    const s = shantenStd(c, need);
    return need === 5 && s > -1 ? Math.min(s, liguShanten(c)) : s;
  }
  function shantenStd(c, need) {
    const gs = [groupTuples(c, 0, 9, false), groupTuples(c, 9, 9, false), groupTuples(c, 18, 9, false), groupTuples(c, 27, 7, true)];
    // 逐組合併：狀態 (面子, 搭子, 眼)，面子／搭子最多算到 need
    let st = new Set([0]);
    for (const g of gs) {
      const nx = new Set();
      for (const k of st) {
        const m0 = k >> 5, d0 = (k >> 1) & 15, p0 = k & 1;
        for (const [m, d, p] of g) {
          if (p0 && p) continue;
          const M = Math.min(need, m0 + m), D = Math.min(need, d0 + d);
          nx.add((M << 5) | (D << 1) | (p0 | p));
        }
      }
      st = nx;
    }
    let best = 2 * need + 1;
    for (const k of st) {
      const M = k >> 5, D = (k >> 1) & 15, P = k & 1;
      const s = 2 * (need - M) - Math.min(D, need - M) - P;
      if (s < best) best = s;
    }
    return best;
  }
  function bestDiscardShanten(c, need) {
    let b = 99;
    for (let i = 0; i < 34; i++) if (c[i]) { c[i]--; const s = shanten(c, need); c[i]++; if (s < b) b = s; }
    return b;
  }
  function nearTypes(c) {
    const set = new Set();
    for (let i = 0; i < 34; i++) if (c[i]) {
      set.add(i);
      if (i < 27) { const n = i % 9; for (const d of [-2, -1, 1, 2]) if (n + d >= 0 && n + d <= 8) set.add(i + d); }
    }
    return [...set];
  }

  /* 吃碰槓胡的回覆一律對照「可用選項」重新整理：不合法就當作「過」；吃牌只取選項裡那兩張（避免傳 5 張吃出 6 張的組） */
  function checkClaim(d, o) {
    if (!d || typeof d !== 'object' || !o) return { type: 'pass' };
    if (d.type === 'hu' && o.hu) return { type: 'hu' };
    if (d.type === 'pon' && o.pon) return { type: 'pon' };
    if (d.type === 'kong' && o.kong) return { type: 'kong' };
    if (d.type === 'chi' && Array.isArray(d.seq) && d.seq.length === 2 && Array.isArray(o.chi)) {
      const q = o.chi.find(q => q[0] === d.seq[0] && q[1] === d.seq[1]);
      if (q) return { type: 'chi', seq: [q[0], q[1]] };
    }
    return { type: 'pass' };
  }
  /* ================= 遊戲 ================= */
  class SpecialWin { constructor(result) { this.result = result; } }
  class Game {
    constructor(o) {
      this.dealer = o.dealer || 0; this.streak = o.streak || 0; this.roundWind = o.roundWind || 0;
      this.ctrls = o.controllers; this.delay = o.delay || (() => Promise.resolve());
      this.emit = o.onEvent || (() => { }); this.rng = o.rng || Math.random; this.aiLevel = o.aiLevel || 'normal';
      this.over = false; this.players = null; this.log = [];
    }
    seatWind(s) { return (s - this.dealer + 4) % 4; }
    get live() { return Math.max(0, this.wall.length - RESERVE); }
    setup() {
      this.wall = makeWall(this.rng);
      this.players = [0, 1, 2, 3].map(s => ({ seat: s, hand: [], melds: [], flowers: [], discards: [] }));
      for (let r = 0; r < 16; r++) for (let k = 0; k < 4; k++) this.players[(this.dealer + k) % 4].hand.push(this.wall.shift());
      this.turn = this.dealer; this.lastDiscard = null; this.justDrew = null; this.kongFlag = false; this.turns = 0;
      this.draws = [0, 0, 0, 0]; this.anyCall = false; this.robFlag = false;
    }
    seenCounts(seat) {
      const c = new Array(34).fill(0);
      for (const p of this.players) {
        for (const d of p.discards) c[d.t]++;
        for (const m of p.melds) if (m.type !== 'akong' || p.seat === seat) for (const x of m.tiles) c[x.t]++;
      }
      for (const x of this.players[seat].hand) c[x.t]++;
      return c;
    }
    async initialFlowers(seat) {
      const p = this.players[seat];
      for (; ;) {
        const fl = p.hand.filter(x => isFlower(x.t));
        if (!fl.length) break;
        p.hand = p.hand.filter(x => !isFlower(x.t));
        for (const f of fl) {
          p.flowers.push(f); this.emit('flower', { seat, tile: f });
          this.checkFlowers(seat, f);
          p.hand.push(this.wall.pop());
        }
        await this.delay(250);
      }
    }
    async drawTile(seat, fromBack) {
      const p = this.players[seat];
      for (; ;) {
        if (this.wall.length <= RESERVE) return null;
        const tile = fromBack ? this.wall.pop() : this.wall.shift();
        if (isFlower(tile.t)) {
          p.flowers.push(tile); this.emit('flower', { seat, tile });
          this.checkFlowers(seat, tile);
          await this.delay(350); fromBack = true; continue;
        }
        p.hand.push(tile); this.justDrew = { seat, id: tile.id }; this.drawn = tile; this.draws[seat]++;
        this.emit('draw', { seat, tile, fromBack });
        return tile;
      }
    }
    checkFlowers(seat, tile) { // 八仙過海 / 七搶一：立即胡牌
      const p = this.players[seat];
      if (p.flowers.length === 8) throw new SpecialWin(this.settle(seat, null, tile, [{ name: '八仙過海', tai: 8 }], { special: '八仙過海' }));
      const holder = this.players.find(q => q.seat !== seat && q.flowers.length === 7);
      if (holder && p.flowers.length === 1) throw new SpecialWin(this.settle(holder.seat, seat, tile, [{ name: '七搶一', tai: 8 }], { special: '七搶一' }));
    }
    async robKong(from, tile) { // 加槓時其他家可搶槓胡
      const cands = [];
      for (let k = 1; k <= 3; k++) {
        const s = (from + k) % 4, c = countsOf(this.players[s].hand); c[tile.t]++;
        if (isWinCounts(c, this.need(s))) cands.push(s);
      }
      for (const s of cands) {
        const o = { hu: true, pon: false, kong: false, chi: [], rob: true };
        this.emit('prompt', { seat: s, tile, opts: o });
        const d = await this.ctrls[s].claim(this, s, tile, o);
        if (d && d.type === 'hu') {
          const fp = this.players[from]; fp.hand.splice(fp.hand.findIndex(x => x.id === tile.id), 1);
          this.players[s].hand.push(tile); this.robFlag = true; this.justDrew = null;
          return this.win(s, from, tile);
        }
      }
      return null;
    }
    need(seat) { return 5 - this.players[seat].melds.length; }
    turnOptions(seat, canDraw) {
      const p = this.players[seat]; const c = countsOf(p.hand); const need = this.need(seat);
      const o = { tsumo: canDraw && isWinCounts(c, need), kongs: [] };
      if (canDraw && this.wall.length > RESERVE) {
        for (let t = 0; t < 34; t++) if (c[t] === 4) o.kongs.push({ kind: 'an', t });
        for (const m of p.melds) if (m.type === 'pon' && c[m.t] >= 1) o.kongs.push({ kind: 'add', t: m.t });
      }
      return o;
    }
    async play() {
      try { return await this.playInner(); }
      catch (e) { if (e instanceof SpecialWin) return e.result; throw e; }
    }
    async playInner() {
      this.setup(); this.emit('start', {});
      await this.delay(400);
      for (let k = 0; k < 4; k++) await this.initialFlowers((this.dealer + k) % 4);
      let seat = this.dealer, mode = 'front';
      for (; ;) {
        if (++this.turns > 1000) throw new Error('too many turns');
        this.turn = seat; this.emit('turn', { seat });
        if (mode !== 'none') {
          const t = await this.drawTile(seat, mode === 'back');
          if (!t) return this.exhaust();
        }
        const r = await this.ownTurn(seat, mode !== 'none');
        if (r.type !== 'discard') return r.result;
        this.kongFlag = false;
        const cl = await this.claims(seat, r.tile);
        if (cl.type === 'win') return cl.result;
        if (cl.type === 'none') { seat = (seat + 1) % 4; mode = 'front'; }
        else { seat = cl.seat; mode = cl.type === 'kong' ? 'back' : 'none'; this.kongFlag = cl.type === 'kong'; }
      }
    }
    async ownTurn(seat, canDraw) {
      const p = this.players[seat];
      for (; ;) {
        const opts = this.turnOptions(seat, canDraw);
        const d = (await this.ctrls[seat].turn(this, seat, opts)) || {};
        if (d.type === 'tsumo' && opts.tsumo) return { type: 'win', result: this.win(seat, null, this.drawn) };
        if (d.type === 'kong') {
          const k = opts.kongs.find(k => k.t === d.t && k.kind === d.kind);
          if (k) {
            if (k.kind === 'add') {
              const rt = p.hand.find(x => x.t === k.t);
              const rob = await this.robKong(seat, rt);
              if (rob) return { type: 'win', result: rob };
            }
            this.anyCall = true;
            this.selfKong(seat, k);
            await this.delay(600);
            const t = await this.drawTile(seat, true);
            if (!t) return { type: 'exhaust', result: this.exhaust() };
            this.kongFlag = true; continue;
          }
        }
        let idx = p.hand.findIndex(x => x.id === d.id);
        if (idx < 0) idx = p.hand.length - 1;
        const tile = p.hand.splice(idx, 1)[0];
        p.discards.push(tile); this.lastDiscard = { seat, tile }; this.justDrew = null;
        this.emit('discard', { seat, tile });
        await this.delay(450);
        return { type: 'discard', tile };
      }
    }
    selfKong(seat, k) {
      const p = this.players[seat];
      if (k.kind === 'an') {
        const tiles = p.hand.filter(x => x.t === k.t);
        p.hand = p.hand.filter(x => x.t !== k.t);
        p.melds.push({ type: 'akong', t: k.t, tiles });
      } else {
        const i = p.hand.findIndex(x => x.t === k.t);
        const tile = p.hand.splice(i, 1)[0];
        const m = p.melds.find(m => m.type === 'pon' && m.t === k.t);
        m.type = 'mkong'; m.tiles.push(tile);
      }
      this.justDrew = null;
      this.emit('kong', { seat, kind: k.kind, t: k.t });
    }
    claimOptions(from, tile) {
      const t = tile.t; const out = {};
      for (let k = 1; k <= 3; k++) {
        const s = (from + k) % 4; const p = this.players[s];
        const c = countsOf(p.hand); const need = this.need(s);
        const o = { hu: false, pon: false, kong: false, chi: [] };
        c[t]++; o.hu = isWinCounts(c, need); c[t]--;
        if (need >= 1 && c[t] >= 2) o.pon = true;
        if (need >= 1 && c[t] >= 3 && this.wall.length > RESERVE) o.kong = true;
        if (k === 1 && t < 27 && need >= 1) {
          const n = t % 9;
          if (n >= 2 && c[t - 2] && c[t - 1]) o.chi.push([t - 2, t - 1]);
          if (n >= 1 && n <= 7 && c[t - 1] && c[t + 1]) o.chi.push([t - 1, t + 1]);
          if (n <= 6 && c[t + 1] && c[t + 2]) o.chi.push([t + 1, t + 2]);
        }
        if (o.hu || o.pon || o.kong || o.chi.length) out[s] = o;
      }
      return out;
    }
    async claims(from, tile) {
      const opts = this.claimOptions(from, tile);
      const order = [1, 2, 3].map(k => (from + k) % 4).filter(s => opts[s]);
      if (!order.length) return { type: 'none' };
      const dec = {}; const humans = [];
      for (const s of order) {
        if (this.ctrls[s].isHuman) humans.push(s);
        else dec[s] = checkClaim(await this.ctrls[s].claim(this, s, tile, opts[s]), opts[s]);
      }
      if (humans.length) {
        const aiHu = order.filter(s => dec[s] && dec[s].type === 'hu');
        const aiPon = order.some(s => dec[s] && (dec[s].type === 'pon' || dec[s].type === 'kong'));
        const asks = [];
        for (const human of humans) {
          let ho = opts[human]; let ask = true;
          if (aiHu.length) {
            if (ho.hu && order.indexOf(human) < order.indexOf(aiHu[0])) ho = { hu: true, pon: false, kong: false, chi: [] };
            else ask = false;
          } else if (aiPon) {
            ho = Object.assign({}, ho, { chi: [] });
            if (!ho.hu && !ho.pon && !ho.kong) ask = false;
          }
          if (!ask) continue;
          this.emit('prompt', { seat: human, tile, opts: ho });
          asks.push(Promise.resolve(this.ctrls[human].claim(this, human, tile, ho)).then(d => {
            dec[human] = checkClaim(d, ho);
          }));
        }
        await Promise.all(asks);
      }
      for (const s of order) if (dec[s] && dec[s].type === 'hu' && opts[s].hu) {
        const p = this.players[s]; this.players[from].discards.pop(); p.hand.push(tile);
        return { type: 'win', result: this.win(s, from, tile) };
      }
      for (const s of order) {
        const d = dec[s]; if (!d) continue;
        if ((d.type === 'kong' && opts[s].kong) || (d.type === 'pon' && opts[s].pon)) {
          const p = this.players[s]; const n = d.type === 'kong' ? 3 : 2;
          const take = []; p.hand = p.hand.filter(x => { if (x.t === tile.t && take.length < n) { take.push(x); return false; } return true; });
          this.players[from].discards.pop();
          p.melds.push({ type: d.type === 'kong' ? 'mkong' : 'pon', t: tile.t, tiles: [...take, tile], from, claimed: tile.id });
          this.justDrew = null; this.turn = s; this.anyCall = true;
          this.emit('claim', { seat: s, type: d.type, tile, from });
          await this.delay(650);
          return { type: d.type, seat: s };
        }
      }
      const cs = (from + 1) % 4; const d = dec[cs];
      if (d && d.type === 'chi' && opts[cs] && d.seq && opts[cs].chi.some(q => q[0] === d.seq[0] && q[1] === d.seq[1])) {
        const p = this.players[cs]; const take = [];
        for (const t of d.seq) { const i = p.hand.findIndex(x => x.t === t); take.push(p.hand.splice(i, 1)[0]); }
        this.players[from].discards.pop();
        const tiles = [...take, tile].sort((a, b) => a.t - b.t);
        p.melds.push({ type: 'chi', t: tiles[0].t, tiles, from, claimed: tile.id });
        this.justDrew = null; this.turn = cs; this.anyCall = true;
        this.emit('claim', { seat: cs, type: 'chi', tile, from });
        await this.delay(650);
        return { type: 'chi', seat: cs };
      }
      return { type: 'none' };
    }
    score(seat, winTile, self) {
      const p = this.players[seat]; const c = countsOf(p.hand); const need = this.need(seat);
      const flags = { kong: this.kongFlag && self, haidi: self && this.wall.length <= RESERVE, hedi: !self && this.wall.length <= RESERVE && !this.robFlag,
        rob: !self && this.robFlag, tian: false, di: false, single: false };
      if (self && this.draws && !this.anyCall && this.draws[seat] === 1) { if (seat === this.dealer) flags.tian = true; else flags.di = true; }
      { const c1 = c.slice(); c1[winTile.t]--; flags.single = waits(c1, need).length === 1; }
      let best = null;
      const consider = items => { const total = items.reduce((a, b) => a + b.tai, 0); if (!best || total > best.total) best = { items, total }; };
      for (const d of decompose(c, need)) consider(this.taiItems(p, d, winTile, self, flags));   // 同一手牌有多種拆法 → 取台數最高的
      if (isLigu(c, need)) consider(this.liguItems(p, c, winTile, self, flags));
      return best || { items: [], total: 0 };
    }
    taiItems(p, d, winTile, self, flags) {
      const items = []; const add = (name, tai) => items.push({ name, tai });
      const exposed = p.melds.filter(m => m.type !== 'akong');
      const menqing = exposed.length === 0;
      const sw = this.seatWind(p.seat);
      if (flags.tian) add('天胡', 24);
      else if (flags.di) add('地胡', 16);
      else if (menqing && self) add('門清自摸', 3);
      else { if (menqing) add('門清', 1); if (self) add('自摸', 1); }
      const sets = d.sets.map(s => ({ k: s.k, t: s.t, conc: true }))
        .concat(p.melds.map(m => ({ k: m.type === 'chi' ? 'c' : 'p', t: m.t, conc: m.type === 'akong' })));
      if (!self) {
        const wt = winTile.t;
        const other = d.pair === wt || d.sets.some(s => s.k === 'c' && wt >= s.t && wt <= s.t + 2);
        if (!other) { const s = sets.find(s => s.conc && s.k === 'p' && s.t === wt); if (s) s.conc = false; }
      }
      const allT = p.hand.map(x => x.t).concat(...p.melds.map(m => m.tiles.map(x => x.t)));
      const hasHonor = allT.some(isHonor);
      const suits = new Set(allT.filter(t => t < 27).map(t => (t / 9) | 0));
      const pungs = sets.filter(s => s.k === 'p');
      // 平胡：全部順子、無字、無花、不是自摸，而且要「兩面聽」：胡的那張在手上某個順子的頭或尾，
      // 而且那個順子不是 123（等 3 是邊張）或 789（等 7 是邊張）；單吊、嵌張、邊張都不算。也不能是獨聽（只聽一張）。
      const wt = winTile.t;
      const twoSided = d.sets.some(s => s.k === 'c' && ((wt === s.t && s.t % 9 !== 6) || (wt === s.t + 2 && s.t % 9 !== 0)));
      if (sets.every(s => s.k === 'c') && !hasHonor && p.flowers.length === 0 && !self && twoSided && !flags.single) add('平胡', 2);
      if (sets.every(s => s.k === 'p')) add('碰碰胡', 4);
      if (!self && p.hand.length === 2 && exposed.length === 5) add('全求人', 2);
      if (suits.size === 0) add('字一色', 16);
      else if (suits.size === 1) { if (hasHonor) add('混一色', 4); else add('清一色', 8); }
      const dp = pungs.filter(s => s.t >= 31);
      if (dp.length === 3) add('大三元', 8);
      else if (dp.length === 2 && d.pair >= 31) add('小三元', 4);
      else for (const s of dp) add('三元牌 ' + tileName(s.t), 1);
      const wp = pungs.filter(s => s.t >= 27 && s.t <= 30);
      if (wp.length === 4) add('大四喜', 16);
      else if (wp.length === 3 && d.pair >= 27 && d.pair <= 30) add('小四喜', 8);
      else {
        if (wp.some(s => s.t === 27 + this.roundWind)) add('圈風 ' + tileName(27 + this.roundWind), 1);
        if (wp.some(s => s.t === 27 + sw)) add('門風 ' + tileName(27 + sw), 1);
      }
      const cp = pungs.filter(s => s.conc).length;
      if (cp >= 5) add('五暗刻', 8); else if (cp === 4) add('四暗刻', 5); else if (cp === 3) add('三暗刻', 2);
      this.commonItems(p, flags, add);
      return items;
    }
    // 花、獨聽、搶槓、槓上開花、海底、河底（一般胡和嚦咕嚦咕共用）
    commonItems(p, flags, add) {
      const sw = this.seatWind(p.seat), ft = p.flowers.map(f => f.t);
      for (const g of [0, 4]) {
        const have = [0, 1, 2, 3].filter(i => ft.includes(34 + g + i));
        if (have.length === 4) add('花槓 ' + FLOWERS.slice(g, g + 4).join(''), 2);
        else if (ft.includes(34 + g + sw)) add('正花 ' + FLOWERS[g + sw], 1);
      }
      if (flags.single) add('獨聽', 1);
      if (flags.rob) add('搶槓', 1);
      if (flags.kong) add('槓上開花', 1);
      if (flags.haidi) add('海底撈月', 1);
      if (flags.hedi) add('河底撈魚', 1);
    }
    /* 嚦咕嚦咕 8 台：門清是成立條件，不另計門清（自摸只加自摸 1 台）；
       另可加計：天胡／地胡、混一色／清一色／字一色、刻子是三元牌或圈風／門風、花、獨聽、搶槓、槓上開花、海底、河底。
       不計平胡、碰碰胡、暗刻。 */
    liguItems(p, c, winTile, self, flags) {
      const items = []; const add = (name, tai) => items.push({ name, tai });
      const sw = this.seatWind(p.seat);
      if (flags.tian) add('天胡', 24);
      else if (flags.di) add('地胡', 16);
      else if (self) add('自摸', 1);
      add('嚦咕嚦咕', 8);
      const ts = []; for (let i = 0; i < 34; i++) if (c[i]) ts.push(i);
      const hasHonor = ts.some(isHonor), suits = new Set(ts.filter(t => t < 27).map(t => (t / 9) | 0));
      if (suits.size === 0) add('字一色', 16);
      else if (suits.size === 1) { if (hasHonor) add('混一色', 4); else add('清一色', 8); }
      const tt = ts.find(i => c[i] === 3);
      if (tt >= 31) add('三元牌 ' + tileName(tt), 1);
      if (tt === 27 + this.roundWind) add('圈風 ' + tileName(tt), 1);
      if (tt === 27 + sw) add('門風 ' + tileName(tt), 1);
      this.commonItems(p, flags, add);
      return items;
    }
    win(seat, from, tile) {
      const sc = this.score(seat, tile, from === null);
      return this.settle(seat, from, tile, sc.items, {});
    }
    settle(seat, from, tile, items, extra) {
      this.over = true;
      const self = from === null;
      const total = items.reduce((a, b) => a + b.tai, 0);
      const dealerTai = 1 + 2 * this.streak;
      const dealerItems = [{ name: '莊家', tai: 1 }];
      if (this.streak > 0) dealerItems.push({ name: `連${this.streak}拉${this.streak}`, tai: 2 * this.streak });
      const payments = [0, 0, 0, 0]; const detail = [];
      const payers = self ? [0, 1, 2, 3].filter(s => s !== seat) : [from];
      for (const s of payers) {
        const tai = total + ((seat === this.dealer || s === this.dealer) ? dealerTai : 0);
        const amt = BASE + PER * tai;
        payments[s] -= amt; payments[seat] += amt; detail.push({ seat: s, tai, amt });
      }
      const result = Object.assign({ type: 'win', winner: seat, loser: from, self, tile, items, total,
        dealer: this.dealer, dealerItems, dealerTai, payments, detail, kongFlower: this.kongFlag && self, rob: this.robFlag }, extra);
      this.result = result;
      this.emit('win', result);
      return result;
    }
    exhaust() { this.over = true; const r = { type: 'exhaust', dealer: this.dealer, payments: [0, 0, 0, 0] }; this.result = r; this.emit('exhaust', r); return r; }
  }

  class Session {
    constructor() { this.scores = [0, 0, 0, 0]; this.dealer = 0; this.streak = 0; this.roundWind = 0; this.changes = 0; this.handCount = 0; }
    newGame(o) { this.handCount++; return new Game(Object.assign({ dealer: this.dealer, streak: this.streak, roundWind: this.roundWind }, o)); }
    apply(r) {
      for (let i = 0; i < 4; i++) this.scores[i] += r.payments[i];
      if (r.type === 'exhaust' || r.winner === this.dealer) this.streak++;
      else { this.dealer = (this.dealer + 1) % 4; this.streak = 0; this.changes++; this.roundWind = Math.floor(this.changes / 4) % 4; }
      r.nextDealer = this.dealer;
    }
  }

  /* ================= AI ================= */
  function tileValue(g, seat, t, c) {
    if (isHonor(t)) {
      const yak = t >= 31 || t === 27 + g.roundWind || t === 27 + g.seatWind(seat);
      return (c[t] >= 2 ? 6 : 0) + (yak ? 1.5 : 0.5);
    }
    const n = t % 9;
    return (n === 0 || n === 8) ? 2 : (n === 1 || n === 7) ? 3 : 4;
  }
  /* --- 防守：估計對手是否聽牌、每張牌的危險度 --- */
  function threatOf(g, o) {
    const q = g.players[o];
    const open = q.melds.filter(m => m.type !== 'akong').length;
    let th = open >= 4 ? 0.95 : open === 3 ? 0.75 : open === 2 ? 0.4 : open === 1 ? 0.15 : 0.05;
    if (q.hand.length <= 4) th = Math.max(th, 0.9);
    const late = Math.max(0, (36 - g.live) / 36);           // 牌牆越少，暗手也越可能聽牌
    th = Math.min(1, th + late * 0.45);
    return th;
  }
  function dangerOf(g, o, t, seen) {
    const q = g.players[o];
    if (q.discards.some(d => d.t === t)) return 0.08;                      // 現物
    const ld = g.lastDiscard;                                                // 剛被打出、對方沒胡的牌
    if (ld && ld.seat !== o && ld.tile.t === t) return 0.15;
    if (isHonor(t)) {
      if (seen[t] >= 3) return 0.02;
      const yak = t >= 31 || t === 27 + g.roundWind || t === 27 + g.seatWind(o);
      return (seen[t] === 2 ? 0.18 : 0.35) + (yak ? 0.08 : 0);
    }
    const n = t % 9, base = t - n;
    let d = [0.42, 0.52, 0.66, 0.78, 0.8, 0.78, 0.66, 0.52, 0.42][n];
    const dis = new Set(q.discards.map(x => x.t));
    const lo = n >= 3 && dis.has(t - 3), hi = n <= 5 && dis.has(t + 3);    // 筋
    if (n <= 2) { if (hi) d *= 0.45; } else if (n >= 6) { if (lo) d *= 0.45; }
    else { if (lo && hi) d *= 0.4; else if (lo || hi) d *= 0.72; }
    if (seen[t] >= 3) d *= 0.6;                                              // 壁
    const suits = new Set(q.melds.filter(m => m.t < 27).map(m => (m.t / 9) | 0));
    const honorsOnly = q.melds.length && q.melds.every(m => m.t >= 27);
    if (q.melds.length >= 2 && suits.size === 1) d *= suits.has(base / 9) ? 1.6 : 0.35;   // 對方做清/混一色
    else if (honorsOnly) d *= 0.6;
    return d;
  }
  // 2026-11 用 test/ai-eval.js 調整（每組 4000 局配對比較）：原本的防守（slack 1）讓普通比舊版 v1 弱；
  // 改成「只在同向聽數裡挑比較安全的牌」（slack 0）後不再吃虧；困難再加上積極吃碰（ponLoose），明顯比普通強。
  const LEVEL = {
    easy: { uke: false, defense: 0, mistake: 0.18, ponLoose: true },
    normal: { uke: true, defense: 1, w: [10, 40, 110], thMin: 0.5, slack: 0, mistake: 0, ponLoose: false },
    hard: { uke: true, defense: 1, w: [10, 40, 110], thMin: 0.5, slack: 0, mistake: 0, ponLoose: true },
    v1: { uke: true, defense: 0, mistake: 0, ponLoose: false },           // 舊版（比較用）
    def1: { uke: true, defense: 1, w: [10, 40, 110], thMin: 0.5, slack: 1, mistake: 0, ponLoose: false }   // 上一版普通（比較用）
  };
  function makeAI(fixed) {
    const lv = g => LEVEL[fixed || g.aiLevel] || LEVEL.normal;
    const ai = {
      isHuman: false,
      level: fixed || null,
      chooseDiscard(g, seat) {
        const L = lv(g);
        const p = g.players[seat]; const c = countsOf(p.hand); const need = g.need(seat);
        const seen = g.seenCounts(seat);
        const types = [...new Set(p.hand.map(x => x.t))];
        const evals = types.map(t => { c[t]--; const s = shanten(c, need); c[t]++; return { t, s }; });
        const minS = Math.min(...evals.map(e => e.s));
        if (L.mistake && g.rng() < L.mistake) { const pool = evals.filter(e => e.s <= minS + 1); const pick = pool[Math.floor(g.rng() * pool.length)].t; return p.hand.find(x => x.t === pick).id; }
        // 威脅
        let threats = [];
        if (L.defense) for (let k = 1; k <= 3; k++) { const o = (seat + k) % 4, th = threatOf(g, o); if (th >= (L.thMin || 0.35)) threats.push({ o, th }); }
        const defending = threats.length > 0;
        const W = L.w || [70, 170, 330], SL = L.slack == null ? 2 : L.slack;
        const slack = defending ? Math.min(SL, minS >= 2 ? 2 : minS >= 1 ? 1 : 0) : 0;
        const wDef = L.defense * W[Math.min(2, Math.max(0, minS))];
        let best = null;
        for (const e of evals) {
          if (e.s > minS + slack) continue;
          let uk = 0;
          if (L.uke) {
            c[e.t]--;
            for (const u of nearTypes(c)) {
              const remain = 4 - seen[u] + (u === e.t ? 1 : 0);
              if (remain <= 0 || c[u] >= 4) continue;
              c[u]++; if (shanten(c, need) < e.s) uk += remain; c[u]--;
            }
            c[e.t]++;
          }
          let score = uk * 10 - tileValue(g, seat, e.t, c) - (e.s - minS) * 260;
          if (defending) { let dg = 0; for (const th of threats) dg += th.th * dangerOf(g, th.o, e.t, seen); score -= dg * wDef; }
          if (!best || score > best.score) best = { t: e.t, score };
        }
        return p.hand.find(x => x.t === best.t).id;
      },
      turn(g, seat, opts) {
        if (opts.tsumo) return { type: 'tsumo' };
        const p = g.players[seat]; const c = countsOf(p.hand); const need = g.need(seat);
        if (opts.kongs.length) {
          const s0 = bestDiscardShanten(c, need);
          for (const k of opts.kongs) {
            const c2 = c.slice();
            if (k.kind === 'an') { c2[k.t] -= 4; if (shanten(c2, need - 1) <= s0) return { type: 'kong', kind: 'an', t: k.t }; }
            else { c2[k.t] -= 1; if (shanten(c2, need) <= s0) return { type: 'kong', kind: 'add', t: k.t }; }
          }
        }
        return { type: 'discard', id: ai.chooseDiscard(g, seat) };
      },
      claim(g, seat, tile, o) {
        if (o.hu) return { type: 'hu' };
        const L = lv(g);
        const p = g.players[seat]; const c = countsOf(p.hand); const need = g.need(seat); const t = tile.t;
        const s0 = shanten(c, need);
        const yak = t >= 31 || t === 27 + g.roundWind || t === 27 + g.seatWind(seat);
        const open = p.melds.some(m => m.type !== 'akong');
        if (o.kong) { const c2 = c.slice(); c2[t] -= 3; if (shanten(c2, need - 1) <= s0) return { type: 'kong' }; }
        if (o.pon) {
          const c2 = c.slice(); c2[t] -= 2; const s1 = bestDiscardShanten(c2, need - 1);
          if (L.ponLoose && s1 < s0) return { type: 'pon' };
          if (s1 < s0 && (yak || open || s0 <= 2)) return { type: 'pon' };
          if (yak && s1 <= s0) return { type: 'pon' };
        }
        const chiOk = L.strictChi ? (open && s0 <= 2) || s0 <= 1 : (open && s0 <= 3) || s0 <= 1;
        if (o.chi.length && (chiOk || L.ponLoose)) {
          let best = null;
          for (const q of o.chi) {
            const c2 = c.slice(); c2[q[0]]--; c2[q[1]]--; const s1 = bestDiscardShanten(c2, need - 1);
            if (s1 < s0 && (!best || s1 < best.s)) best = { s: s1, q };
          }
          if (best && (!L.strictChi || best.s <= 1 || open)) return { type: 'chi', seq: best.q };
        }
        return { type: 'pass' };
      }
    };
    return ai;
  }
  const AI = makeAI(null);                       // 依 game.aiLevel（預設 普通）
  const AIS = { easy: makeAI('easy'), normal: makeAI('normal'), hard: makeAI('hard'), v1: makeAI('v1'), def1: makeAI('def1') };
  if (typeof process !== 'undefined' && process.env && process.env.MJ_TUNE) Object.assign(LEVEL.normal, JSON.parse(process.env.MJ_TUNE));
  const LEVEL_NAMES = { easy: '簡單', normal: '普通', hard: '困難' };

  /* ===== 聽牌鎖定（單機與伺服器共用） ===== */
  // 手牌 3n+1 張且有聽 → 回傳聽的牌；否則 []
  function lockWaits(g, seat) {
    const p = g.players[seat]; const need = g.need(seat);
    if (p.hand.length !== need * 3 + 1) return [];
    return waits(countsOf(p.hand), need);
  }
  // 鎖定中輪到自己：回傳 {type:'discard'} 自動打摸到的牌；{type:'tsumo'}（自動胡）；
  // null = 可以自摸，要問玩家（只給自摸、不給槓）；undefined = 鎖定已失效（應解除）
  function lockedTurn(g, seat, opts, autoHu) {
    const p = g.players[seat]; const jd = g.justDrew;
    if (!jd || jd.seat !== seat) return undefined;
    const c = countsOf(p.hand); const dt = p.hand.find(x => x.id === jd.id); if (!dt) return undefined;
    c[dt.t]--; if (!waits(c, g.need(seat)).length) return undefined;
    if (opts.tsumo) return autoHu ? { type: 'tsumo' } : null;
    return { type: 'discard', id: jd.id };
  }
  // 鎖定中別人打牌：沒得胡 → null（直接過）；有得胡 → 只留胡的選項
  function lockedClaim(opts) {
    if (!opts || !opts.hu) return null;
    return Object.assign({}, opts, { chi: [], pon: false, kong: false });
  }

  return { SUITS, NUMS, WINDS, FLOWERS, RESERVE, BASE, PER, tileName, isHonor, isFlower, isTerminal, rngFrom, makeWall,
    countsOf, isWinCounts, isLigu, decompose, waits, shanten, shantenStd, liguShanten, checkClaim, lockWaits, lockedTurn, lockedClaim, Game, Session, SpecialWin, AI, AIS, LEVEL_NAMES, makeAI };
})();
if (typeof module !== 'undefined') module.exports = MJ;
