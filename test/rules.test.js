// node test/rules.test.js — 規則單元測試（搶槓、加槓時機、天胡、地胡、八仙過海、七搶一、獨聽）
const MJ = require('../docs/logic.js');
let fail = 0; const ok = (c, m) => { if (!c) { fail++; console.log('FAIL', m); } else console.log('ok  ', m); };
let ID = 5000;
function T(str) { const out = []; let buf = []; for (const ch of str) { if (/\d/.test(ch)) buf.push(+ch); else { const base = { m: 0, p: 9, s: 18, z: 27, f: 34 }[ch]; for (const n of buf) out.push({ id: ID++, t: base + n - 1 }); buf = []; } } return out; }
const script = (fn) => ({ isHuman: false, turn: fn.turn || MJ.AI.turn, claim: fn.claim || MJ.AI.claim });
function game(ctrls) {
  const g = new MJ.Game({ controllers: ctrls || [MJ.AI, MJ.AI, MJ.AI, MJ.AI], rng: MJ.rngFrom(7) });
  g.setup(); for (const p of g.players) { p.hand = []; p.flowers = []; }
  g.wall = T('2345678m2345678p2345678s1234567z2345678m2345678p2345678s'); // 49 張非花
  return g;
}
(async () => {
  // 1. 加槓時機：之前碰的牌，之後摸到也能加槓；沒摸牌（吃碰後）不能
  {
    const g = game(); const p = g.players[0];
    p.melds = [{ type: 'pon', t: 4, tiles: T('555m') }]; p.hand = T('123p456p789p11s23s9s5m');
    const o1 = g.turnOptions(0, true), o2 = g.turnOptions(0, false);
    ok(o1.kongs.some(k => k.kind === 'add' && k.t === 4), '加槓：之後的回合摸到第 4 張可以加槓');
    ok(o2.kongs.length === 0, '吃碰後（沒摸牌）不提供槓');
    p.hand = T('123p456p789p11s9999s'); ok(g.turnOptions(0, true).kongs.some(k => k.kind === 'an' && k.t === 26), '暗槓：手上 4 張隨時可槓');
  }
  // 2. 搶槓
  {
    let robAsked = null;
    const c0 = script({ turn: (g, s, o) => { const k = o.kongs.find(k => k.kind === 'add'); return k ? { type: 'kong', kind: 'add', t: k.t } : MJ.AI.turn(g, s, o); } });
    const c1 = script({ claim: (g, s, tile, o) => { robAsked = o; return { type: 'hu' }; } });
    const g = game([c0, c1, MJ.AI, MJ.AI]); g.draws = [1, 1, 1, 1]; g.anyCall = true;
    const p0 = g.players[0], p1 = g.players[1];
    p0.melds = [{ type: 'pon', t: 4, tiles: T('555m') }]; p0.hand = T('123p456p789p11s23s9s5m');
    p1.hand = T('123m46m789p123s456s11z'); // 聽 5m（嵌張）
    const r = await g.ownTurn(0, true);
    ok(r.type === 'win' && r.result.winner === 1 && r.result.loser === 0, '搶槓：下家搶 5 萬胡牌，加槓者放槍');
    ok(robAsked && robAsked.rob === true && robAsked.hu, '搶槓：只問胡（opts.rob）');
    ok(r.result.items.some(i => i.name === '搶槓'), '搶槓：計 搶槓 1 台 → ' + r.result.items.map(i => i.name + i.tai).join(' '));
    ok(r.result.items.some(i => i.name === '獨聽'), '搶槓：嵌張 → 獨聽');
    ok(p0.melds[0].type === 'pon' && p0.hand.every(x => x.t !== 4), '搶槓：被搶後不成槓、牌已移走');
  }
  // 3. 不能搶時正常加槓並補牌
  {
    const c0 = script({ turn: (g, s, o) => { const k = o.kongs.find(k => k.kind === 'add'); return k ? { type: 'kong', kind: 'add', t: k.t } : { type: 'discard', id: g.players[s].hand[0].id }; } });
    const g = game([c0, MJ.AI, MJ.AI, MJ.AI]); const p0 = g.players[0];
    p0.melds = [{ type: 'pon', t: 4, tiles: T('555m') }]; p0.hand = T('123p456p789p11s23s9s5m');
    g.players[1].hand = T('123m789m789p123s456s11z');
    const n0 = g.wall.length; const r = await g.ownTurn(0, true);
    ok(r.type === 'discard' && p0.melds[0].type === 'mkong' && p0.melds[0].tiles.length === 4 && g.wall.length === n0 - 1, '加槓成功：變成明槓並從牌尾補一張');
  }
  // 4. 天胡 / 地胡
  {
    const g = game(); g.dealer = 0; g.draws = [1, 0, 0, 0]; g.anyCall = false;
    const p = g.players[0]; p.hand = T('123m456m789m123p456p11s'); const r = g.win(0, null, p.hand[p.hand.length - 1]);
    ok(r.items.some(i => i.name === '天胡' && i.tai === 24) && !r.items.some(i => i.name === '門清自摸'), '天胡 24 台（取代門清自摸）');
    const g2 = game(); g2.dealer = 0; g2.draws = [1, 1, 0, 0]; g2.anyCall = false;
    g2.players[1].hand = T('123m456m789m123p456p11s'); const r2 = g2.win(1, null, g2.players[1].hand[16]);
    ok(r2.items.some(i => i.name === '地胡' && i.tai === 16), '地胡 16 台');
    const g3 = game(); g3.dealer = 0; g3.draws = [2, 1, 0, 0]; g3.anyCall = true;
    g3.players[1].hand = T('123m456m789m123p456p11s'); const r3 = g3.win(1, null, g3.players[1].hand[16]);
    ok(!r3.items.some(i => /天胡|地胡/.test(i.name)), '有人吃碰過 → 不算地胡');
  }
  // 5. 八仙過海 / 七搶一
  {
    const g = game(); g.players[0].flowers = T('1234567f'); g.wall.unshift({ id: ID++, t: 41 });
    let res = null; try { await g.drawTile(0, false); } catch (e) { if (e instanceof MJ.SpecialWin) res = e.result; else throw e; }
    ok(res && res.winner === 0 && res.self && res.items[0].name === '八仙過海' && res.payments[0] === 3 * (MJ.BASE + MJ.PER * 9), '八仙過海：8 張花自摸 8 台（莊家另加 1）');
    const g2 = game(); g2.players[2].flowers = T('1234567f'); g2.wall.unshift({ id: ID++, t: 41 });
    res = null; try { await g2.drawTile(1, false); } catch (e) { if (e instanceof MJ.SpecialWin) res = e.result; else throw e; }
    ok(res && res.winner === 2 && res.loser === 1 && res.items[0].name === '七搶一', '七搶一：有 7 張花的人搶第 8 張，摸到的人付');
    // 完整 play() 也會正確結束
    const g3 = new MJ.Game({ controllers: [MJ.AI, MJ.AI, MJ.AI, MJ.AI], rng: MJ.rngFrom(3) });
    const orig = g3.setup.bind(g3); g3.setup = function () { orig(); const fl = []; for (const p of this.players) for (const x of p.hand) if (x.t >= 34) fl.push(x); this.wall = this.wall.filter(x => { if (x.t >= 34) { fl.push(x); return false; } return true; }); for (const p of this.players) p.hand = p.hand.filter(x => x.t < 34); for (const p of this.players) while (p.hand.length < 16) p.hand.push(this.wall.pop()); this.wall.unshift(fl[0]); this.wall.push(...fl.slice(1)); };
    const r3 = await g3.play(); ok(r3.type === 'win' && /八仙過海|七搶一/.test(r3.items[0].name), 'play() 中觸發花牌特殊胡：' + r3.items[0].name);
  }
  // 6. 獨聽 / 非獨聽
  {
    const g = game(); g.draws = [3, 3, 3, 3]; g.anyCall = true;
    g.players[1].hand = T('123m456m789m123p456p11s'); // 單吊 1s
    let r = g.win(1, 0, g.players[1].hand[16]); ok(r.items.some(i => i.name === '獨聽'), '單吊 → 獨聽');
    const g2 = game(); g2.draws = [3, 3, 3, 3]; g2.anyCall = true;
    g2.players[1].hand = T('123m456m789m123p55s23s4s'); /* 2-3 條兩面聽 1/4 條 */ r = g2.win(1, 0, g2.players[1].hand[16]);
    ok(!r.items.some(i => i.name === '獨聽'), '兩面聽（1-4 條）→ 不算獨聽 ' + r.items.map(i=>i.name).join(','));
  }
  // 8. 聽牌鎖定
  {
    const g = game(); const p = g.players[0]; g.draws = [1, 1, 1, 1];
    p.hand = T('123m456m789m123p11s23s'); // 聽 1/4 條
    ok(MJ.lockWaits(g, 0).map(MJ.tileName).join() === '一條,四條', '鎖定：可鎖定，聽 ' + MJ.lockWaits(g, 0).map(MJ.tileName).join('、'));
    g.wall.unshift(...T('5z')); const d1 = await g.drawTile(0, false);
    let r = MJ.lockedTurn(g, 0, g.turnOptions(0, true), false);
    ok(r && r.type === 'discard' && r.id === d1.id, '鎖定：摸到不能胡的牌 → 自動打掉摸到的那張');
    p.hand = p.hand.filter(x => x.id !== d1.id);
    g.wall.unshift(...T('4s')); const d2 = await g.drawTile(0, false); const o2 = g.turnOptions(0, true);
    ok(o2.tsumo && MJ.lockedTurn(g, 0, o2, false) === null, '鎖定：摸到胡牌 → 不自動胡，要問玩家（自摸按鈕）');
    ok(MJ.lockedTurn(g, 0, o2, true).type === 'tsumo', '鎖定＋自動胡：直接自摸');
    // 可暗槓的牌也只打掉
    const g3 = game(); g3.draws = [1, 1, 1, 1]; const p3 = g3.players[0]; p3.hand = T('123m456m789m123p111z4s');
    g3.wall.unshift(...T('1z')); const d3 = await g3.drawTile(0, false); const o3 = g3.turnOptions(0, true);
    const r3 = MJ.lockedTurn(g3, 0, o3, false);
    ok(o3.kongs.length > 0 && r3.type === 'discard' && r3.id === d3.id, '鎖定：摸到可暗槓的牌也不槓，直接打掉');
    // 手牌已不聽（例如斷線時被電腦碰牌）→ 失效
    const g4 = game(); g4.draws = [1, 1, 1, 1]; g4.players[0].hand = T('159m159p159s1234z5z6z7z');
    g4.wall.unshift(...T('2m')); await g4.drawTile(0, false);
    ok(MJ.lockedTurn(g4, 0, g4.turnOptions(0, true), false) === undefined, '鎖定：手牌已經不聽 → 鎖定失效');
    ok(MJ.lockedClaim({ hu: false, pon: true, kong: true, chi: [[1, 2]] }) === null, '鎖定：別人打牌只能吃碰槓 → 自動過');
    const lc = MJ.lockedClaim({ hu: true, pon: true, kong: false, chi: [[1, 2]], rob: true });
    ok(lc && lc.hu && !lc.pon && !lc.chi.length && lc.rob, '鎖定：可以胡（含搶槓）→ 只問胡');
  }
  // 10. 吃牌回覆驗證：seq 一定要剛好 2 張、而且是選項裡的那兩張（不能吃出 6 張的組）
  {
    const o = { hu: false, pon: false, kong: false, chi: [[1, 2]] };
    ok(MJ.checkClaim({ type: 'chi', seq: [1, 2, 20, 21, 22] }, o).type === 'pass', '吃牌：seq 帶 5 張 → 當作過');
    ok(MJ.checkClaim({ type: 'chi', seq: [1] }, o).type === 'pass' && MJ.checkClaim({ type: 'chi', seq: '12' }, o).type === 'pass' && MJ.checkClaim({ type: 'chi' }, o).type === 'pass', '吃牌：seq 太短／不是陣列／沒有 → 當作過');
    ok(MJ.checkClaim({ type: 'chi', seq: [2, 3] }, o).type === 'pass', '吃牌：不在選項裡的組合 → 當作過');
    const v = MJ.checkClaim({ type: 'chi', seq: [1, 2], extra: 1 }, o); ok(v.type === 'chi' && v.seq.length === 2 && v.seq[0] === 1 && v.seq !== o.chi[0], '吃牌：合法 → 只留選項裡的兩張');
    ok(MJ.checkClaim({ type: 'pon' }, o).type === 'pass' && MJ.checkClaim({ type: 'hu' }, o).type === 'pass' && MJ.checkClaim(null, o).type === 'pass' && MJ.checkClaim('x', o).type === 'pass', '沒有的選項（碰／胡）或亂傳 → 當作過');
    // 整個 claims 流程：真人下家傳 5 張的 seq
    for (const seq of [[1, 2, 19, 20, 21], [1, 2]]) {
      const human = { isHuman: true, turn: MJ.AI.turn, claim: () => ({ type: 'chi', seq }) };
      const g = game([MJ.AI, human, MJ.AI, MJ.AI]); g.draws = [2, 2, 2, 2];
      g.players[1].hand = T('23m11p234p567p99s'); const handBefore = g.players[1].hand.length;
      const tile = { id: ID++, t: 0 }; g.players[0].discards.push(tile); g.lastDiscard = { seat: 0, tile };
      const r = await g.claims(0, tile); const p1 = g.players[1];
      if (seq.length === 5) ok(r.type === 'none' && p1.melds.length === 0 && p1.hand.length === handBefore && g.players[0].discards.length === 1, '整局：下家傳 5 張的 seq 吃牌 → 不成立，手牌不變');
      else ok(r.type === 'chi' && p1.melds[0].tiles.length === 3 && p1.hand.length === handBefore - 2, '整局：正常吃牌 → 3 張的順子、手牌少 2 張');
    }
  }
  // 11. 快速向聽數（分組計算）和逐張窮舉的結果完全一樣
  {
    function ref(c, need) {
        let best = 2 * need + 1;
        const dfs = (i, sets, part, pair) => {
          if (best <= -1) return;
          while (i < 34 && !c[i]) i++;
          if (i >= 34) { const p = Math.min(part, need - sets); const s = 2 * (need - sets) - p - pair; if (s < best) best = s; return; }
          if (sets < need && c[i] >= 3) { c[i] -= 3; dfs(i, sets + 1, part, pair); c[i] += 3; }
          if (sets < need && i < 27 && i % 9 <= 6 && c[i + 1] && c[i + 2]) { c[i]--; c[i + 1]--; c[i + 2]--; dfs(i, sets + 1, part, pair); c[i]++; c[i + 1]++; c[i + 2]++; }
          if (c[i] >= 2) { c[i] -= 2; if (!pair) dfs(i, sets, part, 1); if (sets + part < need) dfs(i, sets, part + 1, pair); c[i] += 2; }
          if (sets + part < need && i < 27) {
            if (i % 9 <= 7 && c[i + 1]) { c[i]--; c[i + 1]--; dfs(i, sets, part + 1, pair); c[i]++; c[i + 1]++; }
            if (i % 9 <= 6 && c[i + 2]) { c[i]--; c[i + 2]--; dfs(i, sets, part + 1, pair); c[i]++; c[i + 2]++; }
          }
          c[i]--; dfs(i, sets, part, pair); c[i]++;
        };
        dfs(0, 0, 0, 0); return best;
    }
    const rng = MJ.rngFrom(42); let bad = 0; const N = 3000;
    for (let k = 0; k < N; k++) {
      const need = 1 + Math.floor(rng() * 5), len = need * 3 + 1 + (rng() < .5 ? 1 : 0), narrow = rng() < .4; const c = new Array(34).fill(0);
      for (let got = 0; got < len;) { const t = narrow ? Math.floor(rng() * 9) + 9 * Math.floor(rng() * 2) : Math.floor(rng() * 34); if (c[t] < 4) { c[t]++; got++; } }
      if (ref(c.slice(), need) !== MJ.shanten(c.slice(), need)) bad++;
    }
    ok(bad === 0, `向聽數：${N} 手隨機牌和逐張窮舉比對，不一致 ${bad} 手`);
  }
  // 9. 聽牌鎖定整局模擬：鎖定後手牌只有摸到的牌會進出，胡牌一定有問玩家
  {
    let games = 0, lockedHands = 0, autoDiscards = 0, tsumoPrompts = 0, ronPrompts = 0, bad = 0;
    const SIM = +process.env.SIM_HANDS || 40; process.stdout.write(`     （聽牌鎖定整局模擬 ${SIM} 局，SIM_HANDS=數字 可調整）`);
    for (let k = 0; k < SIM; k++) {
      if (k % 10 === 0) process.stdout.write(' ' + k);
      let locked = false, snapshot = null;
      const ctrl0 = {
        isHuman: true,
        turn(g, s, opts) {
          if (locked) {
            const r = MJ.lockedTurn(g, s, opts, false);
            if (r === null) { tsumoPrompts++; return { type: 'tsumo' }; }
            if (!r) { bad++; locked = false; return MJ.AI.turn(g, s, opts); }
            const before = g.players[s].hand.filter(x => x.id !== g.justDrew.id).map(x => x.id).sort().join();
            if (before !== snapshot) bad++;
            autoDiscards++; return r;
          }
          const d = MJ.AI.turn(g, s, opts);
          if (d.type === 'discard') {
            const p = g.players[s]; const c = MJ.countsOf(p.hand); const t = p.hand.find(x => x.id === d.id).t; c[t]--;
            if (MJ.waits(c, g.need(s)).length) { locked = true; lockedHands++; snapshot = p.hand.filter(x => x.id !== d.id).map(x => x.id).sort().join(); }
          }
          return d;
        },
        claim(g, s, tile, opts) {
          if (locked) { const o = MJ.lockedClaim(opts); if (!o) return { type: 'pass' }; ronPrompts++; return { type: 'hu' }; }
          return MJ.AI.claim(g, s, tile, opts);
        }
      };
      const g = new MJ.Game({ controllers: [ctrl0, MJ.AI, MJ.AI, MJ.AI], rng: MJ.rngFrom(900 + k) });
      await g.play(); games++;
    }
    process.stdout.write(' ' + SIM + '\n');
    ok(bad === 0 && lockedHands > Math.min(5, SIM / 8) && autoDiscards > Math.min(20, SIM / 2), `鎖定模擬：${games} 局、鎖定 ${lockedHands} 次、自動打牌 ${autoDiscards} 次、自摸提示 ${tsumoPrompts}、胡牌提示 ${ronPrompts}、異常 ${bad}`);
  }
  console.log(fail ? 'FAILURES ' + fail : 'ALL RULE TESTS OK'); process.exit(fail ? 1 : 0);
})();
