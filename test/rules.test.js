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
  console.log(fail ? 'FAILURES ' + fail : 'ALL RULE TESTS OK'); process.exit(fail ? 1 : 0);
})();
