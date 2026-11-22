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
  function isWinCounts(c, need) {
    if (sum(c) !== need * 3 + 2) return false;
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

  /* --- 向聽數（AI 用） --- */
  const SH = new Map();
  function shanten(c, need) {
    const key = String.fromCharCode.apply(null, c) + need;
    const hit = SH.get(key); if (hit !== undefined) return hit;
    let best = 2 * need + 1;
    const dfs = (i, sets, part, pair) => {
      if (best <= -1) return;
      while (i < 34 && !c[i]) i++;
      if (i >= 34) {
        const p = Math.min(part, need - sets);
        const s = 2 * (need - sets) - p - pair;
        if (s < best) best = s; return;
      }
      if (sets < need && c[i] >= 3) { c[i] -= 3; dfs(i, sets + 1, part, pair); c[i] += 3; }
      if (sets < need && i < 27 && i % 9 <= 6 && c[i + 1] && c[i + 2]) {
        c[i]--; c[i + 1]--; c[i + 2]--; dfs(i, sets + 1, part, pair); c[i]++; c[i + 1]++; c[i + 2]++;
      }
      if (c[i] >= 2) {
        c[i] -= 2;
        if (!pair) dfs(i, sets, part, 1);
        if (sets + part < need) dfs(i, sets, part + 1, pair);
        c[i] += 2;
      }
      if (sets + part < need && i < 27) {
        if (i % 9 <= 7 && c[i + 1]) { c[i]--; c[i + 1]--; dfs(i, sets, part + 1, pair); c[i]++; c[i + 1]++; }
        if (i % 9 <= 6 && c[i + 2]) { c[i]--; c[i + 2]--; dfs(i, sets, part + 1, pair); c[i]++; c[i + 2]++; }
      }
      c[i]--; dfs(i, sets, part, pair); c[i]++;
    };
    dfs(0, 0, 0, 0);
    if (SH.size > 300000) SH.clear();
    SH.set(key, best);
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

  /* ================= 遊戲 ================= */
  class Game {
    constructor(o) {
      this.dealer = o.dealer || 0; this.streak = o.streak || 0; this.roundWind = o.roundWind || 0;
      this.ctrls = o.controllers; this.delay = o.delay || (() => Promise.resolve());
      this.emit = o.onEvent || (() => { }); this.rng = o.rng || Math.random;
      this.over = false; this.players = null; this.log = [];
    }
    seatWind(s) { return (s - this.dealer + 4) % 4; }
    get live() { return Math.max(0, this.wall.length - RESERVE); }
    setup() {
      this.wall = makeWall(this.rng);
      this.players = [0, 1, 2, 3].map(s => ({ seat: s, hand: [], melds: [], flowers: [], discards: [] }));
      for (let r = 0; r < 16; r++) for (let k = 0; k < 4; k++) this.players[(this.dealer + k) % 4].hand.push(this.wall.shift());
      this.turn = this.dealer; this.lastDiscard = null; this.justDrew = null; this.kongFlag = false; this.turns = 0;
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
          await this.delay(350); fromBack = true; continue;
        }
        p.hand.push(tile); this.justDrew = { seat, id: tile.id }; this.drawn = tile;
        this.emit('draw', { seat, tile, fromBack });
        return tile;
      }
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
        else dec[s] = (await this.ctrls[s].claim(this, s, tile, opts[s])) || { type: 'pass' };
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
            d = d || { type: 'pass' };
            if ((d.type === 'hu' && !ho.hu) || (d.type === 'pon' && !ho.pon) || (d.type === 'kong' && !ho.kong) ||
              (d.type === 'chi' && !ho.chi.some(q => d.seq && q[0] === d.seq[0] && q[1] === d.seq[1]))) d = { type: 'pass' };
            dec[human] = d;
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
          this.justDrew = null; this.turn = s;
          this.emit('claim', { seat: s, type: d.type, tile, from });
          await this.delay(650);
          return { type: d.type, seat: s };
        }
      }
      const cs = (from + 1) % 4; const d = dec[cs];
      if (d && d.type === 'chi' && opts[cs] && opts[cs].chi.some(q => q[0] === d.seq[0] && q[1] === d.seq[1])) {
        const p = this.players[cs]; const take = [];
        for (const t of d.seq) { const i = p.hand.findIndex(x => x.t === t); take.push(p.hand.splice(i, 1)[0]); }
        this.players[from].discards.pop();
        const tiles = [...take, tile].sort((a, b) => a.t - b.t);
        p.melds.push({ type: 'chi', t: tiles[0].t, tiles, from, claimed: tile.id });
        this.justDrew = null; this.turn = cs;
        this.emit('claim', { seat: cs, type: 'chi', tile, from });
        await this.delay(650);
        return { type: 'chi', seat: cs };
      }
      return { type: 'none' };
    }
    score(seat, winTile, self) {
      const p = this.players[seat]; const c = countsOf(p.hand); const need = this.need(seat);
      const flags = { kong: this.kongFlag && self, haidi: self && this.wall.length <= RESERVE, hedi: !self && this.wall.length <= RESERVE };
      let best = null;
      for (const d of decompose(c, need)) {
        const items = this.taiItems(p, d, winTile, self, flags);
        const total = items.reduce((a, b) => a + b.tai, 0);
        if (!best || total > best.total) best = { items, total };
      }
      return best || { items: [], total: 0 };
    }
    taiItems(p, d, winTile, self, flags) {
      const items = []; const add = (name, tai) => items.push({ name, tai });
      const exposed = p.melds.filter(m => m.type !== 'akong');
      const menqing = exposed.length === 0;
      const sw = this.seatWind(p.seat);
      if (menqing && self) add('門清自摸', 3);
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
      if (sets.every(s => s.k === 'c') && !hasHonor && p.flowers.length === 0 && !self) add('平胡', 2);
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
      const ft = p.flowers.map(f => f.t);
      for (const g of [0, 4]) {
        const have = [0, 1, 2, 3].filter(i => ft.includes(34 + g + i));
        if (have.length === 4) add('花槓 ' + FLOWERS.slice(g, g + 4).join(''), 2);
        else if (ft.includes(34 + g + sw)) add('正花 ' + FLOWERS[g + sw], 1);
      }
      if (flags.kong) add('槓上開花', 1);
      if (flags.haidi) add('海底撈月', 1);
      if (flags.hedi) add('河底撈魚', 1);
      return items;
    }
    win(seat, from, tile) {
      this.over = true;
      const self = from === null;
      const sc = this.score(seat, tile, self);
      const dealerTai = 1 + 2 * this.streak;
      const dealerItems = [{ name: '莊家', tai: 1 }];
      if (this.streak > 0) dealerItems.push({ name: `連${this.streak}拉${this.streak}`, tai: 2 * this.streak });
      const payments = [0, 0, 0, 0]; const detail = [];
      const payers = self ? [0, 1, 2, 3].filter(s => s !== seat) : [from];
      for (const s of payers) {
        const tai = sc.total + ((seat === this.dealer || s === this.dealer) ? dealerTai : 0);
        const amt = BASE + PER * tai;
        payments[s] -= amt; payments[seat] += amt; detail.push({ seat: s, tai, amt });
      }
      const result = { type: 'win', winner: seat, loser: from, self, tile, items: sc.items, total: sc.total,
        dealer: this.dealer, dealerItems, dealerTai, payments, detail,
        kongFlower: this.kongFlag && self };
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
  const AI = {
    isHuman: false,
    chooseDiscard(g, seat) {
      const p = g.players[seat]; const c = countsOf(p.hand); const need = g.need(seat);
      const seen = g.seenCounts(seat);
      let best = null;
      const types = [...new Set(p.hand.map(x => x.t))];
      const evals = types.map(t => { c[t]--; const s = shanten(c, need); c[t]++; return { t, s }; });
      const minS = Math.min(...evals.map(e => e.s));
      for (const e of evals) {
        if (e.s > minS) continue;
        c[e.t]--;
        let uk = 0;
        for (const u of nearTypes(c)) {
          const remain = 4 - seen[u] + (u === e.t ? 1 : 0);
          if (remain <= 0 || c[u] >= 4) continue;
          c[u]++; if (shanten(c, need) < e.s) uk += remain; c[u]--;
        }
        c[e.t]++;
        const score = uk * 10 - tileValue(g, seat, e.t, c);
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
      return { type: 'discard', id: AI.chooseDiscard(g, seat) };
    },
    claim(g, seat, tile, o) {
      if (o.hu) return { type: 'hu' };
      const p = g.players[seat]; const c = countsOf(p.hand); const need = g.need(seat); const t = tile.t;
      const s0 = shanten(c, need);
      const yak = t >= 31 || t === 27 + g.roundWind || t === 27 + g.seatWind(seat);
      const open = p.melds.some(m => m.type !== 'akong');
      if (o.kong) { const c2 = c.slice(); c2[t] -= 3; if (shanten(c2, need - 1) <= s0) return { type: 'kong' }; }
      if (o.pon) {
        const c2 = c.slice(); c2[t] -= 2; const s1 = bestDiscardShanten(c2, need - 1);
        if (s1 < s0 && (yak || open || s0 <= 2)) return { type: 'pon' };
        if (yak && s1 <= s0) return { type: 'pon' };
      }
      if (o.chi.length && ((open && s0 <= 3) || s0 <= 1)) {
        let best = null;
        for (const q of o.chi) {
          const c2 = c.slice(); c2[q[0]]--; c2[q[1]]--; const s1 = bestDiscardShanten(c2, need - 1);
          if (s1 < s0 && (!best || s1 < best.s)) best = { s: s1, q };
        }
        if (best) return { type: 'chi', seq: best.q };
      }
      return { type: 'pass' };
    }
  };

  return { SUITS, NUMS, WINDS, FLOWERS, RESERVE, BASE, PER, tileName, isHonor, isFlower, isTerminal, rngFrom, makeWall,
    countsOf, isWinCounts, decompose, waits, shanten, Game, Session, AI };
})();
if (typeof module !== 'undefined') module.exports = MJ;
