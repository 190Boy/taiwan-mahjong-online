// node test/ai-eval.js [handsPerSeed] [seeds] [levels] — 不同難度同桌輪流換位，統計胡牌率／放槍率／每局平均分數（95% 信賴區間）
// 例：node test/ai-eval.js 1000 4 easy,normal,hard,v1 [第一個 seed]
const MJ = require('../docs/logic.js');
const N = +process.argv[2] || 500, SEEDS = +process.argv[3] || 4;
const LV = (process.argv[4] || 'easy,normal,hard,v1').split(','); const SEED0 = +process.argv[5] || 1;
if (LV.length !== 4 && LV.length !== 2) throw new Error('需要 2 或 4 種難度');
const diff = []; const st = {}; for (const L of LV) st[L] = { n: 0, win: [], deal: [], pts: [] };
const ci = a => { const n = a.length, m = a.reduce((x, y) => x + y, 0) / n, v = a.reduce((x, y) => x + (y - m) ** 2, 0) / (n - 1); return [m, 1.96 * Math.sqrt(v / n)]; };
(async () => {
  const t0 = Date.now(); let hands = 0;
  for (let sd = SEED0; sd < SEED0 + SEEDS; sd++) {
    const S = new MJ.Session();
    for (let h = 0; h < N; h++) {
      const base = LV.length === 4 ? LV : [LV[0], LV[1], LV[0], LV[1]];
      const lv = [0, 1, 2, 3].map(s => base[(s + h) % 4]);       // 每局換位，每種難度都坐過每個位置
      const g = S.newGame({ controllers: lv.map(L => MJ.AIS[L]), rng: MJ.rngFrom(sd * 1000003 + h) });
      const r = await g.play(); S.apply(r); hands++;
      if (LV.length === 2) { let a = 0, b = 0; lv.forEach((L, s) => { if (L === LV[0]) a += r.payments[s]; else b += r.payments[s]; }); diff.push((a - b) / 2); }
      lv.forEach((L, s) => { const x = st[L]; x.n++; x.pts.push(r.payments[s]); x.win.push(r.type === 'win' && r.winner === s ? 1 : 0); x.deal.push(r.type === 'win' && r.loser === s ? 1 : 0); });
    }
    process.stderr.write(`seed ${sd - SEED0 + 1}/${SEEDS} 完成（${hands} 局，${((Date.now() - t0) / 1000).toFixed(0)} 秒）\n`);
  }
  const f = ([m, e], pct) => pct ? `${(100 * m).toFixed(1)}% ±${(100 * e).toFixed(1)}` : `${m.toFixed(0)} ±${e.toFixed(0)}`;
  console.log(`${hands} 局（${SEEDS} 個 seed × ${N}），每種難度 ${st[LV[0]].n} 個座位`);
  console.log('難度     胡牌率          放槍率          每局平均分數');
  for (const L of [...new Set(LV)]) { const x = st[L]; console.log(`${L.padEnd(7)}  ${f(ci(x.win), 1).padEnd(14)}  ${f(ci(x.deal), 1).padEnd(14)}  ${f(ci(x.pts))}`); }
  if (diff.length) console.log(`${LV[0]} − ${LV[1]}：每局平均分數差 ${f(ci(diff))}（同一局配對比較，>0 表示 ${LV[0]} 較強）`);
})();
