// node test/ai-sim.js <levelA> <levelB> <hands> [seed] — 兩種 AI 交叉坐，統計胡牌率 / 放槍率 / 分數
const MJ = require('../docs/logic.js');
const [A, B] = [process.argv[2] || 'v1', process.argv[3] || 'normal']; const N = +process.argv[4] || 200; const seed = +process.argv[5] || 1;
const st = {}; for (const L of [A, B]) st[L] = { seats: 0, win: 0, tsumo: 0, dealin: 0, pts: 0 };
let ex = 0, special = 0; const t0 = Date.now(); let maxMs = 0;
(async () => {
  const S = new MJ.Session();
  for (let h = 0; h < N; h++) {
    const lv = h % 2 ? [A, B, A, B] : [B, A, B, A];
    const ctrls = lv.map(L => { const ai = MJ.AIS[L]; return { isHuman: false, turn: (...a) => { const t = Date.now(); const r = ai.turn(...a); maxMs = Math.max(maxMs, Date.now() - t); return r; }, claim: ai.claim }; });
    const g = S.newGame({ controllers: ctrls, rng: MJ.rngFrom(seed * 100000 + h) });
    const r = await g.play();
    lv.forEach((L, s) => { st[L].seats++; st[L].pts += r.payments[s]; });
    if (r.type === 'win') { st[lv[r.winner]].win++; if (r.self) st[lv[r.winner]].tsumo++; else st[lv[r.loser]].dealin++; if (r.special) special++; }
    else ex++;
    S.apply(r);
  }
  const pct = (a, b) => (100 * a / b).toFixed(1) + '%';
  for (const L of [A, B]) { const x = st[L]; console.log(`${L.padEnd(6)} 胡牌率 ${pct(x.win, x.seats)}  自摸 ${pct(x.tsumo, x.seats)}  放槍率 ${pct(x.dealin, x.seats)}  每局平均 ${(x.pts / x.seats).toFixed(0)} 分`); }
  console.log(`hands ${N}  流局 ${pct(ex, N)}  特殊花胡 ${special}  avg ${((Date.now() - t0) / N).toFixed(0)} ms/hand  slowest AI turn ${maxMs} ms`);
})();
