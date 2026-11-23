// node test/ai-bench.js [hands] [seed] — 量 AI 單次思考時間（turn / claim），看會不會卡住伺服器
const MJ = require('../docs/logic.js');
const N = +process.argv[2] || 100, seed = +process.argv[3] || 1;
const times = []; let worst = null;
const { performance } = require('perf_hooks');
(async () => {
  const S = new MJ.Session();
  for (let h = 0; h < N; h++) {
    const lv = ['hard', 'normal', 'easy', 'v1'];
    const ctrls = lv.map(L => { const ai = MJ.AIS[L]; const wrap = k => (...a) => { const t = performance.now(); const r = ai[k](...a); const d = performance.now() - t; times.push(d); if (!worst || d > worst.d) worst = { d, k, L, hand: a[0].players[a[1]].hand.length }; return r; }; return { isHuman: false, turn: wrap('turn'), claim: wrap('claim') }; });
    const g = S.newGame({ controllers: ctrls, rng: MJ.rngFrom(seed * 100000 + h) });
    S.apply(await g.play());
  }
  times.sort((a, b) => a - b); const q = p => times[Math.min(times.length - 1, Math.floor(p * times.length))].toFixed(2);
  console.log(`calls ${times.length}  p50 ${q(.5)} ms  p99 ${q(.99)} ms  p99.9 ${q(.999)} ms  max ${times[times.length - 1].toFixed(1)} ms  (worst: ${worst.L} ${worst.k}, ${worst.hand} tiles)`);
})();
