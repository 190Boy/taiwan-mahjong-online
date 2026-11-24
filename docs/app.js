'use strict';
const { WINDS, tileName, countsOf, waits, isFlower } = MJ;
const NAMES = ['你', '阿明', '小美', '阿伯']; // 由 Setup.apply() 依選角覆寫
const $ = s => document.querySelector(s);

/* ================= 牌面繪製（SVG） ================= */
const FONT = "'Noto Serif CJK TC','Noto Serif TC','Songti TC','PMingLiU','MingLiU','Noto Sans CJK TC','PingFang TC','Microsoft JhengHei',serif";
const C = { R: '#c62828', G: '#1e7d43', B: '#1f5fa8', K: '#1a2340' };
const txt = (x, y, s, size, fill) => `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" text-anchor="middle" font-family="${FONT}" font-weight="900">${s}</text>`;
const dot = (x, y, r, col) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${col}"/><circle cx="${x}" cy="${y}" r="${r * .64}" fill="#fff"/><circle cx="${x}" cy="${y}" r="${r * .36}" fill="${col}"/>`;
const stick = (x, y, col, h = 26, rot = 0) => { const w = 7.5; return `${rot ? `<g transform="rotate(${rot} ${x} ${y})">` : ''}<rect x="${x - w / 2}" y="${y - h / 2}" width="${w}" height="${h}" rx="3.6" fill="${col}"/><rect x="${x - w / 2 - .6}" y="${y - 1.3}" width="${w + 1.2}" height="2.6" rx="1" fill="#0b3d1f" opacity=".55"/><line x1="${x}" y1="${y - h / 2 + 3}" x2="${x}" y2="${y + h / 2 - 3}" stroke="#fff" stroke-width="1.3" opacity=".5"/>${rot ? '</g>' : ''}`; };
const DOTS = {
  2: [[30, 22, C.G], [30, 58, C.B]], 3: [[16, 17, C.B], [30, 40, C.R], [44, 63, C.G]],
  4: [[18, 22, C.B], [42, 22, C.G], [18, 58, C.G], [42, 58, C.B]],
  5: [[16, 18, C.B], [44, 18, C.G], [30, 40, C.R], [16, 62, C.G], [44, 62, C.B]],
  6: [[18, 15, C.G], [42, 15, C.G], [18, 42, C.R], [42, 42, C.R], [18, 65, C.R], [42, 65, C.R]],
  7: [[13, 13, C.G], [30, 21, C.G], [47, 29, C.G], [18, 50, C.R], [42, 50, C.R], [18, 69, C.R], [42, 69, C.R]],
  8: [12, 31, 50, 69].flatMap(y => [[18, y, C.B], [42, y, C.B]]),
  9: [[15, C.B], [40, C.R], [65, C.G]].flatMap(([y, c]) => [[14, y, c], [30, y, c], [46, y, c]])
};
const DOTR = { 2: 12, 3: 10, 4: 10.5, 5: 9.5, 6: 9, 7: 8, 8: 8.3, 9: 7.8 };
const STICKS = {
  2: [[30, 22, C.G], [30, 58, C.B]], 3: [[30, 22, C.G], [18, 58, C.B], [42, 58, C.B]],
  4: [[19, 22, C.G], [41, 22, C.B], [19, 58, C.B], [41, 58, C.G]],
  5: [[15, 21, C.G], [45, 21, C.B], [30, 40, C.R], [15, 59, C.B], [45, 59, C.G]],
  6: [14, 30, 46].flatMap(x => [[x, 22, C.G], [x, 58, C.B]]),
  7: [[30, 14, C.R, 20], ...[14, 30, 46].flatMap(x => [[x, 41, C.G, 20], [x, 66, C.G, 20]])],
  // 八條：上半「W」（左右兩根直的，中間兩根斜的在上方中間相接成尖頂），下半「M」（中間兩根斜的在下方中間相接成 V）
  8: [[10, 21, C.G, 30], [23.6, 21.5, C.B, 30, 21], [36.4, 21.5, C.B, 30, -21], [50, 21, C.G, 30],
      [10, 59, C.G, 30], [23.6, 58.5, C.B, 30, -21], [36.4, 58.5, C.B, 30, 21], [50, 59, C.G, 30]],
  9: [14, 30, 46].flatMap(x => [15, 40, 65].map(y => [x, y, x === 30 ? C.R : (y === 40 ? C.B : C.G), 21]))
};
const SVGC = {};
function face(t) {
  if (SVGC[t]) return SVGC[t];
  let s = '';
  if (t < 9) s = txt(30, 36, MJ.NUMS[t], 31, C.K) + txt(30, 75, '萬', 33, C.R);
  else if (t < 18) {
    const n = t - 9 + 1;
    if (n === 1) s = `<circle cx="30" cy="40" r="23" fill="${C.G}"/><circle cx="30" cy="40" r="18" fill="#fff"/><circle cx="30" cy="40" r="14" fill="${C.R}"/><circle cx="30" cy="40" r="9" fill="#fff"/><circle cx="30" cy="40" r="5" fill="${C.B}"/>` +
      [0, 1, 2, 3, 4, 5, 6, 7].map(i => { const a = i * Math.PI / 4; return `<circle cx="${30 + 16 * Math.cos(a)}" cy="${40 + 16 * Math.sin(a)}" r="1.6" fill="#fff"/>`; }).join('');
    else s = DOTS[n].map(([x, y, c]) => dot(x, y, DOTR[n], c)).join('');
  } else if (t < 27) {
    const n = t - 18 + 1;
    if (n === 1) s = `<path d="M24 58 Q14 70 10 77 M30 62 Q28 72 27 78 M36 60 Q42 70 46 77" stroke="${C.G}" stroke-width="3.5" fill="none" stroke-linecap="round"/>` +
      `<ellipse cx="30" cy="46" rx="13" ry="16" fill="${C.G}"/><path d="M22 44 Q30 36 38 44 Q30 56 22 44Z" fill="${C.B}"/>` +
      `<circle cx="31" cy="22" r="9" fill="${C.R}"/><circle cx="34" cy="20" r="2.2" fill="#fff"/><polygon points="39,21 48,22 39,26" fill="#e69500"/><path d="M28 13 L26 6 M31 13 L31 5 M34 13 L37 6" stroke="${C.R}" stroke-width="2"/>`;
    else s = STICKS[n].map(([x, y, c, h, r]) => stick(x, y, c, h || 28, r || 0)).join('');
  } else if (t < 31) s = txt(30, 57, WINDS[t - 27], 46, C.K);
  else if (t === 31) s = txt(30, 57, '中', 48, C.R);
  else if (t === 32) s = txt(30, 57, '發', 46, C.G);
  else if (t === 33) s = `<rect x="11" y="12" width="38" height="56" rx="4" fill="none" stroke="${C.B}" stroke-width="4"/><rect x="17" y="18" width="26" height="44" rx="2" fill="none" stroke="${C.B}" stroke-width="1.5"/>`;
  else {
    const i = t - 34, col = i < 4 ? '#c2185b' : '#6a1b9a';
    s = `<circle cx="47" cy="14" r="8" fill="${col}" opacity=".15"/>` + txt(11, 17, (i % 4) + 1, 13, col) + txt(30, 60, MJ.FLOWERS[i], 40, col) +
      `<path d="M8 72 Q30 64 52 72" stroke="${col}" stroke-width="2" fill="none" opacity=".5"/>`;
  }
  return SVGC[t] = `<svg viewBox="0 0 60 80" aria-hidden="true">${s}</svg>`;
}
const tileHTML = (t, cls = '', id) => `<div class="tile ${cls}" ${id !== undefined ? `data-id="${id}"` : ''} title="${tileName(t)}">${face(t)}</div>`;
const backHTML = (cls = '') => `<div class="tile back ${cls}"></div>`;

/* ================= 音效（Web Audio + 語音） ================= */
const Snd = {
  ctx: null, master: null, on: true, voice: true, sayTile: false, vol: .7, zhVoice: null,
  init() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC(); this.master = this.ctx.createGain(); this.master.gain.value = this.vol; this.master.connect(this.ctx.destination);
      const comp = this.ctx.createDynamicsCompressor(); this.master.disconnect(); this.master.connect(comp); comp.connect(this.ctx.destination);
      if (this.ctx.state !== 'running') this.ctx.resume();
      try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { }   // iOS 17+：靜音鍵開著也能出聲
      setTimeout(() => Clips.ctxReady(), 0);
    } catch (e) { this.ctx = null; }
    if ('speechSynthesis' in window) {
      const pick = () => {
        const vs = speechSynthesis.getVoices();
        this.zhVoice = vs.find(v => /zh[-_]TW/i.test(v.lang)) || vs.find(v => /zh[-_](HK|Hant)/i.test(v.lang)) || vs.find(v => /^zh/i.test(v.lang)) || null;
      };
      pick(); speechSynthesis.onvoiceschanged = pick;
      try { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); } catch (e) { }
    }
  },
  setVol(v) { this.vol = v; if (this.master) this.master.gain.value = v; },
  ok() { return this.on && this.ctx && this.vol > 0; },
  tone(f, dur, { type = 'sine', gain = .3, when = 0, slide = 0, attack = .005 } = {}) {
    if (!this.ok()) return;
    const c = this.ctx, t0 = c.currentTime + when, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t0); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f * slide), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(gain, t0 + attack); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(this.master); o.start(t0); o.stop(t0 + dur + .05);
  },
  noise(dur, { freq = 2500, q = 1.2, gain = .5, when = 0 } = {}) {
    if (!this.ok()) return;
    const c = this.ctx, t0 = c.currentTime + when, len = Math.max(1, Math.floor(c.sampleRate * dur));
    const buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(); g.gain.value = gain;
    src.connect(f); f.connect(g); g.connect(this.master); src.start(t0);
  },
  clack() { this.noise(.06, { freq: 2200, q: 2, gain: .9 }); this.tone(1250, .05, { type: 'triangle', gain: .25 }); this.tone(620, .08, { type: 'sine', gain: .2, when: .005 }); },
  draw() { this.noise(.04, { freq: 3200, q: 1.5, gain: .35 }); },
  softDraw() { this.noise(.03, { freq: 3000, q: 1.5, gain: .12 }); },
  flower() { [1318, 1568, 2093].forEach((f, i) => this.tone(f, .35, { type: 'sine', gain: .15, when: i * .07 })); },
  chi() { this.tone(523, .12, { type: 'square', gain: .12 }); this.tone(784, .18, { type: 'square', gain: .12, when: .1 }); this.clack(); },
  pon() { this.tone(180, .25, { type: 'sine', gain: .5, slide: .5 }); this.noise(.12, { freq: 900, q: .8, gain: .8 }); this.tone(392, .25, { type: 'sawtooth', gain: .08, when: .05 }); this.tone(587, .3, { type: 'sawtooth', gain: .08, when: .05 }); },
  kong() { [0, .12, .24].forEach((w, i) => { this.noise(.08, { freq: 1500 + i * 400, q: 1.5, gain: .8, when: w }); this.tone(220 * (i + 1), .2, { type: 'triangle', gain: .2, when: w }); }); this.tone(110, .6, { type: 'sine', gain: .4, when: .3, slide: .6 }); },
  hu() { this.tone(150, .5, { type: 'sine', gain: .6, slide: .4 }); this.noise(.3, { freq: 600, q: .5, gain: .9 }); this.fanfare(.25); },
  tsumo() { this.tone(98, .7, { type: 'sine', gain: .6, slide: .5 }); this.noise(.35, { freq: 500, q: .5, gain: 1 }); [0, .08, .16].forEach(w => this.tone(1760, .2, { type: 'square', gain: .05, when: w })); this.fanfare(.3, true); },
  fanfare(w0 = 0, big) {
    const seq = big ? [[523, 0], [659, .12], [784, .24], [1047, .36], [784, .52], [1047, .64], [1319, .8]] : [[523, 0], [659, .12], [784, .24], [1047, .4]];
    seq.forEach(([f, w]) => { this.tone(f, .3, { type: 'triangle', gain: .25, when: w0 + w }); this.tone(f / 2, .3, { type: 'square', gain: .05, when: w0 + w }); });
    const end = w0 + seq[seq.length - 1][1] + .15;
    [523, 659, 784, 1047].forEach(f => this.tone(f, 1.2, { type: 'triangle', gain: .14, when: end, attack: .02 }));
  },
  alert() { this.tone(880, .12, { type: 'sine', gain: .2 }); this.tone(1175, .16, { type: 'sine', gain: .2, when: .1 }); },
  sad() { [523, 466, 415, 349].forEach((f, i) => this.tone(f, .35, { type: 'triangle', gain: .2, when: i * .22 })); },
  say(text, cancel = true, seat = 0) { this.sayAs(charOfSeat(seat), text, cancel); },
  sayAs(ci, text, cancel = true) {
    if (!this.on) return;
    if (Clips.play(ci, text, cancel)) { if (cancel && 'speechSynthesis' in window) try { speechSynthesis.cancel(); } catch (e) { } return; }
    if (!('speechSynthesis' in window)) return;
    try {                                                   // 後備：系統語音，依角色換聲音／音高／語速
      if (cancel) speechSynthesis.cancel();
      const pf = CHAR_TTS[ci] || CHAR_TTS[0], v = CharVoice.pick(ci);
      const u = new SpeechSynthesisUtterance(text); u.lang = v ? v.lang : 'zh-TW'; if (v) u.voice = v;
      u.rate = pf.rate; u.pitch = pf.pitch; u.volume = Math.min(1, this.vol * 1.3); speechSynthesis.speak(u);
    } catch (e) { }
  },
  call(word, seat = 0) { if (this.voice) this.say(word, true, seat); }
};
const charOfSeat = s => { try { return seatChar(s); } catch (e) { return 0; } };
/* ===== 角色語音 ===== */
// 系統語音後備設定（g＝想要的性別；pitch/rate 依角色形象）
const CHAR_TTS = [
  { g: 'm', pitch: 1.05, rate: 1.15 },  // 小藍：陽光大學生
  { g: 'm', pitch: 1.2, rate: 1.28 },   // 阿明：活潑少年
  { g: 'f', pitch: 1.3, rate: 1.12 },   // 小美：甜美女生
  { g: 'm', pitch: 0.6, rate: 0.85 },   // 阿伯：低沉慢
  { g: 'f', pitch: 0.75, rate: 0.8 },   // 阿嬤：慢、偏低
  { g: 'f', pitch: 1.0, rate: 1.05 },   // 王小姐：沉穩
  { g: 'f', pitch: 1.85, rate: 1.2 },   // 喵喵：尖尖可愛
  { g: 'm', pitch: 1.45, rate: 1.1 },   // 小傑：童聲
  { g: 'm', pitch: 0.8, rate: 0.95 },   // 老張：渾厚
  { g: 'f', pitch: 0.88, rate: 0.95 }   // 阿姨：溫暖稍低
];
const CharVoice = {
  list: null, map: {},
  gender(v) {
    const n = (v.name + ' ' + (v.voiceURI || '')).toLowerCase();
    if (/zhiwei|yunjhe|yunxi|yunyang|yunjian|kangkang|liang|li-mu|limu|danny|\bmale|男/.test(n)) return 'm';
    if (/meijia|mei-jia|tingting|ting-ting|sinji|sin-ji|yating|hanhan|huihui|xiaoxiao|xiaoyi|hsiaochen|hsiaoyu|yaoyao|lili|shasha|female|女|google/.test(n)) return 'f';
    return '';
  },
  refresh() {
    if (!('speechSynthesis' in window)) return;
    const vs = speechSynthesis.getVoices().filter(v => /^zh/i.test(v.lang)); if (!vs.length) return;
    const rank = v => /zh[-_]TW|Hant/i.test(v.lang) ? 0 : /zh[-_]CN|Hans/i.test(v.lang) ? 1 : 2;   // 台灣 → 大陸 → 香港（粵語）
    vs.sort((a, b) => rank(a) - rank(b) || (a.localService === b.localService ? 0 : a.localService ? -1 : 1));
    this.list = vs; this.map = {};
    const cnt = { m: 0, f: 0 };
    CHAR_TTS.forEach((p, ci) => {
      const top = vs.filter(v => rank(v) === rank(vs[0]));            // 先在同一種口音裡分配
      let pool = top.filter(v => this.gender(v) === p.g); if (!pool.length) pool = vs.filter(v => this.gender(v) === p.g);
      if (!pool.length) pool = top;
      this.map[ci] = pool[(cnt[p.g]++) % pool.length];
    });
  },
  pick(ci) { if (!this.list) this.refresh(); return this.map[ci] || null; }
};
if ('speechSynthesis' in window) { try { speechSynthesis.addEventListener('voiceschanged', () => CharVoice.refresh()); } catch (e) { } }
// 預先錄好的角色語音（docs/voices/<角色>/pNN.mp3），用 Web Audio 播放，找不到就用上面的系統語音
const Clips = {
  base: 'voices/', man: null, manP: null, raw: {}, buf: {}, loading: {}, cur: null, failed: 0,
  manifest() {
    if (!this.manP) this.manP = location.protocol === 'file:' ? Promise.resolve(null) : fetch(this.base + 'voices.json', { cache: 'force-cache' }).then(r => r.ok ? r.json() : null).then(m => (this.man = m)).catch(() => null);
    return this.manP;
  },
  load(ci) {
    if (!(ci >= 0)) return Promise.resolve();
    if (this.loading[ci]) return this.loading[ci].then(() => this.decodeAll(ci));
    this.loading[ci] = this.manifest().then(async m => {
      if (!m || !m.keys) return;
      const raw = this.raw[ci] = this.raw[ci] || {}; const keys = Object.entries(m.keys); let i = 0;
      const worker = async () => {
        while (i < keys.length) {
          const [w, k] = keys[i++];
          try { const r = await fetch(`${this.base}${ci}/${k}.mp3`, { cache: 'force-cache' }); if (r.ok) raw[w] = await r.arrayBuffer(); else this.failed++; } catch (e) { this.failed++; }
        }
      };
      await Promise.all([worker(), worker(), worker()]);
    });
    return this.loading[ci].then(() => this.decodeAll(ci));
  },
  want(cis) { for (const ci of cis) if (ci >= 0 && !this.loading[ci]) this.load(ci); },
  decodeAll(ci) {
    const ctx = Snd.ctx, raw = this.raw[ci]; if (!ctx || !raw) return Promise.resolve();
    const buf = this.buf[ci] = this.buf[ci] || {};
    return Promise.all(Object.keys(raw).map(w => new Promise(res => {
      const ab = raw[w]; if (!ab) return res(); delete raw[w];
      try { const p = ctx.decodeAudioData(ab, b => { buf[w] = b; res(); }, () => res()); if (p && p.catch) p.catch(() => res()); } catch (e) { res(); }
    })));
  },
  ctxReady() { for (const ci of Object.keys(this.raw)) this.decodeAll(+ci); },
  play(ci, text, cancel) {
    const b = this.buf[ci] && this.buf[ci][text];
    if (!b) { if (this.raw[ci] && this.raw[ci][text]) this.decodeAll(ci); return false; }
    const ctx = Snd.ctx; if (!ctx || !Snd.master) return false;
    try {
      if (ctx.state !== 'running') ctx.resume();
      if (cancel && this.cur) { try { this.cur.stop(); } catch (e) { } }
      const src = ctx.createBufferSource(), g = ctx.createGain(); src.buffer = b; g.gain.value = 1.3;
      src.connect(g); g.connect(Snd.master); src.start(); this.cur = src;
      src.onended = () => { if (this.cur === src) this.cur = null; };
      return true;
    } catch (e) { return false; }
  }
};

/* ================= 介面 ================= */
const seatChar = s => (UI.online ? UI.oChars[s] : Setup.chars[s]);
const UI = { session: new MJ.Session(), game: null, pending: null, selected: null, revealed: false, online: false, oChars: [0, 1, 2, 3], speed: 1, auto: /auto/.test(location.hash), fast: /fast/.test(location.hash) };
const Human = {
  isHuman: true,
  turn(g, seat, opts) {
    if (UI.lock) {                                         // 聽牌鎖定：摸到不能胡就自動打掉
      const r = MJ.lockedTurn(g, seat, opts, UI.lock.autoHu);
      if (r === undefined) { UI.lock = null; }
      else if (r) { render(); return new Promise(res => setTimeout(() => res(r), 600 * UI.speed * (UI.fast ? .05 : 1))); }
      else opts = Object.assign({}, opts, { kongs: [] });
    }
    return new Promise(res => { UI.pending = { kind: 'turn', opts, res }; UI.selected = null; render(); });
  },
  claim(g, seat, tile, opts) {
    if (UI.lock) {                                         // 鎖定中：吃碰槓直接過，只問胡
      const o = MJ.lockedClaim(opts);
      if (!o) return { type: 'pass' };
      if (UI.lock.autoHu) return { type: 'hu' };
      opts = o;
    }
    return new Promise(res => { UI.pending = { kind: 'claim', opts, tile, res }; Snd.alert(); render(); });
  }
};
/* ===== 聽牌鎖定 ===== */
UI.lock = null; UI.autoHu = (() => { try { return localStorage.getItem('mj16_autohu') === '1'; } catch (e) { return false; } })();
function myWaits() {
  const g = UI.game; if (!g || !g.players || g.over) return [];
  const me = g.players[0]; const need = 5 - me.melds.length;
  if (me.hand.length !== need * 3 + 1) return [];
  return waits(countsOf(me.hand), need);
}
function setLock(on) {
  if (UI.online) { Net.send({ t: 'lock', on: !!on, autoHu: UI.autoHu }); return; }
  if (on && !myWaits().length) { callout('現在不能鎖定（要在聽牌、等別人出牌時）'); render(); return; }
  UI.lock = on ? { autoHu: UI.autoHu, waits: myWaits() } : null;
  if (on) { callout('🔒 聽牌鎖定'); const pd = UI.pending; if (pd && pd.kind === 'claim' && !pd.opts.hu) { resolvePending({ type: 'pass' }); return; } }
  render();
}
function setAutoHu(v) {
  UI.autoHu = !!v; try { localStorage.setItem('mj16_autohu', v ? '1' : '0'); } catch (e) { }
  if (UI.lock) { if (UI.online) Net.send({ t: 'lock', on: true, autoHu: UI.autoHu }); else UI.lock.autoHu = UI.autoHu; }
  render();
}
function lockHTML(B) {
  const g = UI.game; if (!g || !g.players || g.over) return '';
  if (UI.lock) {
    const w = UI.lock.waits || myWaits();
    return `<span class="lockBadge">🔒 聽牌鎖定中${w.length ? '・聽 ' + w.map(t => tileHTML(t, 'mini')).join('') : ''}</span>` +
      `<label class="lockAuto"><input type="checkbox" id="autoHu" ${UI.autoHu ? 'checked' : ''}> 自動胡</label>` + B('unlock', '解除鎖定', 'pass');
  }
  const pd = UI.pending;
  if (pd && pd.kind === 'turn') {                         // 選到打了會聽的牌 → 可「打出並鎖定」
    const me = g.players[0]; const sel = me.hand.find(x => x.id === UI.selected);
    if (sel) { const c = countsOf(me.hand); c[sel.t]--; if (waits(c, 5 - me.melds.length).length) return B('lockdiscard', '打出並鎖定🔒', 'lock'); }
    return '';
  }
  const w = myWaits();
  return w.length ? B('lock', `🔒 鎖定聽牌 <small>聽 ${w.map(t => tileHTML(t, 'mini')).join('')}</small>`, 'lock') : '';
}
function resolvePending(v) { const p = UI.pending; if (!p) return; UI.pending = null; UI.selected = null; p.res(v); render(); }

const fmt = n => (n > 0 ? '+' : '') + n;
function meldHTML(m, hideAn) {
  if (m.type === 'akong') {
    if (hideAn) return `<div class="meld">${backHTML(m.cls)}${backHTML(m.cls)}${backHTML(m.cls)}${backHTML(m.cls)}</div>`;
    return `<div class="meld">${backHTML(m.cls)}${tileHTML(m.t, m.cls)}${tileHTML(m.t, m.cls)}${backHTML(m.cls)}</div>`;
  }
  return `<div class="meld">${m.tiles.map(x => tileHTML(x.t, (m.cls || '') + (x.id === m.claimed ? ' claimed' : ''))).join('')}</div>`;
}
function sortedHand(p, separateDrawn) {
  let h = p.hand.slice().sort((a, b) => a.t - b.t || a.id - b.id), d = null;
  const g = UI.game;
  if (separateDrawn && g.justDrew && g.justDrew.seat === p.seat) { const i = h.findIndex(x => x.id === g.justDrew.id); if (i >= 0) d = h.splice(i, 1)[0]; }
  return { h, d };
}
function scoreSpan(s) { const v = UI.session.scores[s]; return `<span class="sc ${v < 0 ? 'neg' : ''}">${fmt(v)}</span>`; }
function windSpan(g, s) { return `<span class="wind ${s === g.dealer ? 'dealer' : ''}" title="${s === g.dealer ? '莊家' : ''}">${WINDS[g.seatWind(s)]}</span>`; }

function render() {
  const g = UI.game; if (!g || !g.players) return;
  const S = UI.session;
  $('#roundInfo').textContent = `${WINDS[S.roundWind]}風圈・第 ${S.handCount} 局`;
  const showTurn = !g.over;
  for (const s of [1, 2, 3]) {
    const p = g.players[s], el = $('#p' + s), side = s !== 2;
    el.classList.toggle('active', showTurn && g.turn === s);
    const handPart = UI.revealed
      ? `<div class="row">${sortedHand(p).h.map(x => tileHTML(x.t, 'mini')).join('')}</div>`
      : `<div class="row backs">${p.hand.map(() => backHTML(side ? 'mini' : '')).join('')}</div>`;
    el.querySelector('.pbody').innerHTML = `<div class="meta">${windSpan(g, s)}<span>${NAMES[s]}${s === g.dealer && g.streak ? `<small>(連${g.streak})</small>` : ''}</span>${scoreSpan(s)}</div>` +
      handPart +
      (p.melds.length ? `<div class="melds">${p.melds.map(m => meldHTML(Object.assign({ cls: 'mini' }, m), !UI.revealed)).join('')}</div>` : '') +
      (p.flowers.length ? `<div class="flowers">${p.flowers.map(f => tileHTML(f.t, 'mini')).join('')}</div>` : '');
  }
  for (const s of [0, 1, 2, 3]) {
    const p = g.players[s]; const ld = g.lastDiscard;
    $('#r' + s).innerHTML = p.discards.map(x => tileHTML(x.t, (ld && ld.tile.id === x.id && !g.over ? 'last' : ''))).join('');
  }
  // info
  const me = g.players[0];
  let ting = '';
  const need = 5 - me.melds.length, c = countsOf(me.hand);
  if (UI.pending && UI.pending.kind === 'turn' && UI.selected !== null) {
    const sel = me.hand.find(x => x.id === UI.selected);
    if (sel) { c[sel.t]--; const w = waits(c, need); ting = w.length ? `打${tileName(sel.t)}聽：${w.map(tileName).join('、')}` : ''; }
  } else if (me.hand.length === need * 3 + 1) { const w = waits(c, need); if (w.length) ting = '聽牌：' + w.map(tileName).join('、'); }
  $('#info').innerHTML = `<div>${WINDS[g.roundWind]}風圈　莊：${NAMES[g.dealer]}${g.streak ? ' 連' + g.streak : ''}</div>
   <div>剩餘 <span class="big">${g.live}</span> 張</div>
   <div class="turn">${g.over ? '本局結束' : (g.turn === 0 ? '▼ 輪到你出牌' : '輪到：' + NAMES[g.turn])}</div>
   ${ting ? `<div class="ting">${ting}</div>` : ''}`;
  // me
  $('#p0').classList.toggle('active', showTurn && g.turn === 0);
  $('#myTopBody').innerHTML = `<div class="meta">${windSpan(g, 0)}<span>${NAMES[0]}</span>${scoreSpan(0)}</div>` +
    (me.melds.length ? `<div class="melds">${me.melds.map(m => meldHTML(m, false)).join('')}</div>` : '') +
    (me.flowers.length ? `<div class="flowers">${me.flowers.map(f => tileHTML(f.t, 'mini')).join('')}</div>` : '');
  const myTurn = UI.pending && UI.pending.kind === 'turn';
  const { h, d } = sortedHand(me, true);
  const hand = $('#hand');
  hand.className = myTurn ? 'myturn' : 'wait';
  const winId = g.result && g.result.winner === 0 ? g.result.tile.id : -1;
  hand.innerHTML = h.map(x => tileHTML(x.t, (UI.selected === x.id ? 'sel' : '') + (x.id === winId ? ' win' : ''), x.id)).join('') +
    (d ? tileHTML(d.t, 'drawn ' + (UI.selected === d.id ? 'sel' : '') + (d.id === winId ? ' win' : ''), d.id) : '');
  renderActions();
}
function preloadVoices() { try { Clips.want([0, 1, 2, 3].map(charOfSeat)); } catch (e) { } }
function renderActions() {
  preloadVoices();
  const a = $('#actions'), pd = UI.pending; let h = '';
  const B = (act, label, cls) => `<button class="act ${cls}" data-act="${act}">${label}</button>`;
  if (pd && pd.kind === 'turn') {
    if (pd.opts.tsumo) h += B('tsumo', '自摸', 'hu');
    pd.opts.kongs.forEach((k, i) => h += B('kong:' + i, `${k.kind === 'an' ? '暗槓' : '加槓'} ${tileHTML(k.t, 'mini')}`, 'kong'));
    h += UI.lock ? `<span class="hint">${pd.opts.tsumo ? '摸到胡牌了！按「自摸」，或點摸到的牌打掉' : '自動打牌中…'}</span>` : `<span class="hint">${pd.opts.tsumo ? '可以自摸！或' : ''}點選一張牌，再點一次打出</span>`;
  } else if (pd && pd.kind === 'claim') {
    const o = pd.opts, t = pd.tile.t;
    if (o.hu) h += B('hu', o.rob ? '搶槓胡！' : '胡', 'hu');
    if (o.kong) h += B('mkong', '槓', 'kong');
    if (o.pon) h += B('pon', '碰', 'pon');
    o.chi.forEach((q, i) => { const tiles = [q[0], q[1], t].sort((x, y) => x - y); h += B('chi:' + i, '吃 ' + tiles.map(x => tileHTML(x, 'mini' + (x === t ? ' last' : ''))).join(''), 'chi'); });
    h += B('pass', '過', 'pass');
  }
  h += lockHTML(B);
  a.innerHTML = h;
  const ah = $('#autoHu'); if (ah) ah.onchange = e => setAutoHu(e.target.checked);
}
$('#actions').addEventListener('click', e => {
  const b0 = e.target.closest('[data-act]'); if (!b0) return;
  if (b0.dataset.act === 'lock') return setLock(true);
  if (b0.dataset.act === 'unlock') return setLock(false);
  if (b0.dataset.act === 'lockdiscard') { const id = UI.selected; if (UI.pending && UI.pending.kind === 'turn' && id !== null) { const me = UI.game.players[0]; const c = countsOf(me.hand); c[me.hand.find(x => x.id === id).t]--; const w = waits(c, 5 - me.melds.length);
    if (UI.online) { resolvePending({ type: 'discard', id }); setLock(true); } else { UI.lock = { autoHu: UI.autoHu, waits: w }; callout('🔒 聽牌鎖定'); resolvePending({ type: 'discard', id }); } } return; }
  const b = b0; if (!UI.pending) return;
  const act = b.dataset.act, pd = UI.pending;
  if (pd.kind === 'turn') {
    if (act === 'tsumo') resolvePending({ type: 'tsumo' });
    else if (act.startsWith('kong:')) { const k = pd.opts.kongs[+act.slice(5)]; resolvePending({ type: 'kong', kind: k.kind, t: k.t }); }
  } else {
    if (act === 'hu') resolvePending({ type: 'hu' });
    else if (act === 'mkong') resolvePending({ type: 'kong' });
    else if (act === 'pon') resolvePending({ type: 'pon' });
    else if (act.startsWith('chi:')) resolvePending({ type: 'chi', seq: pd.opts.chi[+act.slice(4)] });
    else resolvePending({ type: 'pass' });
  }
});
$('#hand').addEventListener('click', e => {
  const el = e.target.closest('.tile'); if (!el || !UI.pending || UI.pending.kind !== 'turn') return;
  const id = +el.dataset.id;
  if (UI.lock && !el.classList.contains('drawn')) { callout('鎖定中只能打摸到的牌'); return; }
  if (UI.selected === id) resolvePending({ type: 'discard', id });
  else { UI.selected = id; Snd.tone(1400, .04, { type: 'sine', gain: .08 }); render(); }
});
$('#hand').addEventListener('dblclick', e => {
  const el = e.target.closest('.tile'); if (!el || !UI.pending || UI.pending.kind !== 'turn') return;
  if (UI.lock && !el.classList.contains('drawn')) return;
  resolvePending({ type: 'discard', id: +el.dataset.id });
});

function callout(text) {
  const el = $('#callout'); el.textContent = text; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
}
const CALL = { chi: '吃', pon: '碰', kong: '槓' };
function onEvent(type, d) {
  const g = UI.game;
  switch (type) {
    case 'draw': if (d.seat === 0) Snd.draw(); else Snd.softDraw(); break;
    case 'discard': Snd.clack(); if (Snd.sayTile) Snd.say(tileName(d.tile.t), true, d.seat); break;
    case 'flower': Snd.flower(); break;
    case 'claim': Avatars.react(d.seat); Snd[d.type](); Snd.call(CALL[d.type], d.seat); callout(`${NAMES[d.seat]}${d.seat === 0 ? '' : ' '}${CALL[d.type]}！`); break;
    case 'kong': Avatars.react(d.seat); Snd.kong(); Snd.call('槓', d.seat); callout(`${NAMES[d.seat]} ${d.kind === 'an' ? '暗槓' : '加槓'}！`); break;
    case 'win': Avatars.setAll([0, 1, 2, 3].map(s => s === d.winner ? 'happy' : (d.self || s === d.loser) ? 'sad' : 'idle')); Avatars.celebrate(d.winner); if (d.self) { Snd.tsumo(); Snd.call('自摸', d.winner); callout(`${NAMES[d.winner]} 自摸！`); } else { Snd.hu(); Snd.call('胡', d.winner); callout(`${NAMES[d.winner]} 胡！`); } UI.revealed = true; break;
    case 'exhaust': Avatars.setAll(['sad', 'sad', 'sad', 'sad']); Snd.sad(); Snd.call('流局', d.dealer || 0); callout('流局'); UI.revealed = true; break;
  }
  render();
}

function showResult(r) {
  const g = UI.game, S = UI.session;
  let h = '';
  if (r.type === 'exhaust') {
    h += `<h1>流局</h1><p>牌牆剩下 16 張，本局無人胡牌。${NAMES[r.dealer]}連莊。</p>`;
  } else {
    const w = r.winner, p = g.players[w];
    h += `<h1>${w === 0 ? '🎉 ' : ''}${NAMES[w]}${r.self ? ' 自摸！' : ' 胡牌！'}</h1>`;
    h += `<p>${r.self ? '自摸，三家都要付' : `${NAMES[r.loser]}放槍`}　胡：${tileName(r.tile.t)}</p>`;
    const { h: hs } = sortedHand(p);
    h += `<div class="whand">${p.melds.map(m => meldHTML(m, false)).join('')}<div class="meld">${hs.map(x => tileHTML(x.t, x.id === r.tile.id ? 'win' : '')).join('')}</div>${p.flowers.length ? `<div class="meld">${p.flowers.map(f => tileHTML(f.t, 'mini')).join('')}</div>` : ''}</div>`;
    h += `<table class="tai">${r.items.map(i => `<tr><td>${i.name}</td><td>${i.tai} 台</td></tr>`).join('') || '<tr><td>無台（屁胡）</td><td>0 台</td></tr>'}`;
    const dealerInvolved = r.detail.some(x => x.seat === r.dealer) || w === r.dealer;
    if (dealerInvolved) h += r.dealerItems.map(i => `<tr><td>${i.name}（${NAMES[r.dealer]}）</td><td>${i.tai} 台</td></tr>`).join('');
    h += `<tr class="tot"><td>牌型合計</td><td>${r.total} 台</td></tr></table>`;
    h += `<p>${r.detail.map(x => `${NAMES[x.seat]} 付 ${x.amt}（${x.tai} 台）`).join('；')}<br><small>底 ${MJ.BASE}、每台 ${MJ.PER}；莊家台只算在莊家與對方之間</small></p>`;
  }
  h += `<div class="pay">${[0, 1, 2, 3].map(s => `<div>${avatarHTML(seatChar(s), Avatars.expr[s])}${NAMES[s]}<b class="${r.payments[s] > 0 ? 'plus' : r.payments[s] < 0 ? 'minus' : ''}">${fmt(r.payments[s])}</b>總分 ${fmt(S.scores[s])}</div>`).join('')}</div>`;
  h += `<p>下一局莊家：${NAMES[S.dealer]}${S.streak ? `（連${S.streak}）` : ''}　${WINDS[S.roundWind]}風圈</p>`;
  h += `<button class="big-btn" id="againBtn">再來一局</button> <button class="big-btn" id="viewBtn" style="background:linear-gradient(#90a4ae,#546e7a);color:#fff;box-shadow:0 4px 0 #37474f">看牌桌</button>`;
  $('#resultBox').innerHTML = h;
  $('#resultOv').classList.remove('hidden');
  $('#againBtn').onclick = () => againAction();
  $('#viewBtn').onclick = () => { $('#resultOv').classList.add('hidden'); showAgainFloating(); };
}
function showAgainFloating() {
  $('#actions').innerHTML = `<button class="act hu" id="again2">再來一局</button><button class="act pass" id="res2">結算</button>`;
  $('#again2').onclick = () => { $('#actions').innerHTML = ''; againAction(); if (UI.online) $('#resultOv').classList.remove('hidden'); };
  $('#res2').onclick = () => $('#resultOv').classList.remove('hidden');
}
async function newHand() {
  Avatars.setAll(['idle', 'idle', 'idle', 'idle']);
  UI.revealed = false; UI.pending = null; UI.selected = null; UI.lock = null;
  const ctrls = [UI.auto ? MJ.AI : Human, MJ.AI, MJ.AI, MJ.AI];
  const g = UI.session.newGame({ aiLevel: Prefs.level, controllers: ctrls, onEvent, delay: ms => new Promise(r => setTimeout(r, ms * UI.speed * (UI.fast ? .05 : 1))) });
  UI.game = g; window.__game = g;
  let r;
  try { r = await g.play(); } catch (e) { console.error(e); alert('發生錯誤：' + e.message); return; }
  UI.session.apply(r); window.__results = (window.__results || 0) + 1; Stats.recordOffline(r);
  render();
  await new Promise(res => setTimeout(res, UI.fast ? 50 : 1400));
  showResult(r);
  if (UI.auto && window.__autoNext !== false) { await new Promise(res => setTimeout(res, UI.fast ? 50 : 1500)); $('#resultOv').classList.add('hidden'); newHand(); }
}


/* ================= 角色與頭像（純 SVG，表情以切換圖層實作，Safari 也支援） ================= */
const CHARS = [
  { id: 'boy', name: '小藍', skin: '#f6c9a0', hair: '#3e2723', style: 'cap', shirt: '#1e88e5' },
  { id: 'ming', name: '阿明', skin: '#f1bf92', hair: '#1b1b1b', style: 'spiky', shirt: '#ef6c00' },
  { id: 'mei', name: '小美', skin: '#fbd3b5', hair: '#5d2f1a', style: 'long', shirt: '#d81b60' },
  { id: 'uncle', name: '阿伯', skin: '#e8b48a', hair: '#bdbdbd', style: 'bald', shirt: '#6d4c41', glasses: true, mustache: true },
  { id: 'grandma', name: '阿嬤', skin: '#f0c4a0', hair: '#e0e0e0', style: 'bun', shirt: '#7b1fa2', glasses: true },
  { id: 'ol', name: '王小姐', skin: '#fcd5bb', hair: '#2b1a12', style: 'bob', shirt: '#37474f', earrings: true },
  { id: 'cat', name: '喵喵', skin: '#ffb74d', hair: '#ef8f2b', style: 'cat', shirt: '#26a69a' },
  { id: 'student', name: '小傑', skin: '#f8cfa8', hair: '#212121', style: 'student', shirt: '#eceff1', tie: true, glasses: true },
  { id: 'zhang', name: '老張', skin: '#d9a27a', hair: '#424242', style: 'beard', shirt: '#2e7d32' },
  { id: 'auntie', name: '阿姨', skin: '#f3c39d', hair: '#6d3b1f', style: 'curly', shirt: '#c62828', earrings: true }
];
const SEAT_LABEL = ['你（下方）', '下家（右）', '對家（上）', '上家（左）'];

/* 3D 渲染頭像（每角色 一般／開心／難過，內嵌 data URI，256px） */
/* 頭部圖層（脖子以上，搖頭晃腦時只有這層會動；身體層不動） */
function avatarSVG(ci, expr) {
  const e = expr || 'idle';
  const set = AVATAR_IMG[ci] || AVATAR_IMG[0];
  const hset = AVATAR_HEAD[ci] || AVATAR_HEAD[0];
  const src = (set && (set[e] || set.idle)) || '';
  const hsrc = (hset && (hset[e] || hset.idle)) || '';
  return `<img class="av-base" src="${src}" alt="" draggable="false"><img class="av-head" src="${hsrc}" alt="" draggable="false">`;
}const avatarHTML = (ci, expr = 'idle', cls = '') => `<div class="av ${cls} e-${expr}">${avatarSVG(ci, expr)}</div>`;

/* --- 設定（存在 localStorage） --- */
const Setup = {
  KEY: 'mj16_avatars_v1',
  chars: [0, 1, 2, 3], names: ['你', '阿明', '小美', '阿伯'],
  load() {
    try {
      const d = JSON.parse(localStorage.getItem(this.KEY) || 'null');
      if (d && Array.isArray(d.chars) && d.chars.length === 4 && d.chars.every(c => CHARS[c])) { this.chars = d.chars; if (Array.isArray(d.names)) this.names = d.names.map((n, i) => (n || '').trim() || this.names[i]); }
    } catch (e) { }
  },
  save() { try { localStorage.setItem(this.KEY, JSON.stringify({ chars: this.chars, names: this.names })); } catch (e) { } },
  apply() { for (let s = 0; s < 4; s++) NAMES[s] = (this.names[s] || '').trim().slice(0, 6) || (s === 0 ? '你' : CHARS[this.chars[s]].name); Avatars.refresh(); }
};

/* --- 頭像動畫：眨眼 + 不定時搖頭晃腦 + 表情 --- */
const Avatars = {
  moves: ['a-tiltL', 'a-tiltR', 'a-bob', 'a-sway', 'a-shake', 'a-nod'],
  expr: ['idle', 'idle', 'idle', 'idle'],
  rand: (a, b) => a + Math.random() * (b - a),
  el: s => document.getElementById('av' + s),
  init() {
    for (let s = 0; s < 4; s++) {
      const el = this.el(s);
      el.style.setProperty('--br', this.rand(2.8, 4.2).toFixed(2) + 's');
      el.style.setProperty('--bd', (-this.rand(0, 4)).toFixed(2) + 's');
      setTimeout(() => this.blinkLoop(el), this.rand(300, 3500) + s * 700);
      setTimeout(() => this.moveLoop(el), this.rand(800, 5000) + s * 1300);
    }
    this.refresh();
  },
  refresh() { for (let s = 0; s < 4; s++) { const el = this.el(s); el.innerHTML = avatarSVG(seatChar(s), this.expr[s]); el.title = NAMES[s]; this.paint(s); } },
  paint(s) { const el = this.el(s); el.classList.remove('e-idle', 'e-happy', 'e-sad'); el.classList.add('e-' + this.expr[s]); const base = el.querySelector('img.av-base'), head = el.querySelector('img.av-head'); const set = AVATAR_IMG[seatChar(s)], hset = AVATAR_HEAD[seatChar(s)]; if (base && set && set[this.expr[s]]) base.src = set[this.expr[s]]; if (head && hset && hset[this.expr[s]]) head.src = hset[this.expr[s]]; },
  set(s, e) { const el = this.el(s); clearTimeout(el._f); el.classList.remove('e-flash'); this.expr[s] = e; this.paint(s); },
  setAll(list) { list.forEach((e, s) => this.set(s, e)); },
  blinkLoop(el) {
    const blink = () => { el.classList.add('blink'); setTimeout(() => el.classList.remove('blink'), 120); };
    blink(); if (Math.random() < .25) setTimeout(blink, 260);
    setTimeout(() => this.blinkLoop(el), this.rand(1800, 6000));
  },
  play(el, cls, ms = 2600) {
    this.moves.concat('a-happy').forEach(c => el.classList.remove(c)); void el.offsetWidth;
    el.classList.add(cls);
    clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove(cls), ms);
  },
  moveLoop(el) {
    if (!el.classList.contains('a-happy')) this.play(el, this.moves[Math.floor(Math.random() * this.moves.length)]);
    setTimeout(() => this.moveLoop(el), this.rand(3000, 9000));
  },
  react(s) { // 吃碰槓：短暫開心
    const el = this.el(s); if (!el || this.expr[s] !== 'idle') return;
    this.play(el, 'a-happy', 1900); el.classList.add('e-flash');
    clearTimeout(el._f); el._f = setTimeout(() => el.classList.remove('e-flash'), 1700);
  },
  celebrate(s) { const el = this.el(s); this.play(el, 'a-happy', 2600); }
};
for (const s of [1, 2, 3]) $('#p' + s).innerHTML = `<div class="av" id="av${s}"></div><div class="pbody"></div>`;

/* --- 開局角色選擇 --- */
const Picker = {
  slot: 0,
  render() {
    $('#pkSeats').innerHTML = [0, 1, 2, 3].map(s => `<div class="pkSeat ${s === this.slot ? 'on' : ''}" data-slot="${s}">
      ${avatarHTML(Setup.chars[s], 'idle', 'pk')}<div class="pkLab">${SEAT_LABEL[s]}</div>
      <input class="pkName" data-slot="${s}" maxlength="6" value="${(Setup.names[s] || '').replace(/"/g, '')}" placeholder="${s === 0 ? '你' : CHARS[Setup.chars[s]].name}"></div>`).join('');
    $('#pkChars').innerHTML = CHARS.map((c, i) => {
      const used = Setup.chars.indexOf(i);
      return `<button class="pkChar ${used === this.slot ? 'on' : ''}" data-ci="${i}" title="${c.name}">${avatarHTML(i, 'idle', 'pk')}<span class="pkTry" data-try="${i}" title="試聽${c.name}的聲音">🔊</span><span>${c.name}${used >= 0 && used !== this.slot ? `<small>（${['你', '下家', '對家', '上家'][used]}）</small>` : ''}</span></button>`;
    }).join('');
    $('#pkHint').textContent = `正在選：${SEAT_LABEL[this.slot]}　點下方角色指定（已被選走的會互換）`;
  },
  pick(ci) {
    const s = this.slot, other = Setup.chars.indexOf(ci);
    const oldName = c => CHARS[c].name;
    if (other >= 0 && other !== s) {
      const tmp = Setup.chars[s]; Setup.chars[other] = tmp;
      if (other !== 0 && (!Setup.names[other] || Setup.names[other] === oldName(ci))) Setup.names[other] = oldName(tmp);
    }
    const prev = Setup.chars[s]; Setup.chars[s] = ci;
    if (s !== 0 && (!Setup.names[s] || Setup.names[s] === oldName(prev))) Setup.names[s] = oldName(ci);
    this.slot = Math.min(3, s + 1) === s ? s : (s + 1) % 4;
    this.render(); Snd.tone && Snd.tone(1200, .05, { gain: .1 });
  },
  random() {
    const pool = CHARS.map((_, i) => i).filter(i => i !== Setup.chars[0]);
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    for (let s = 1; s < 4; s++) { Setup.chars[s] = pool[s - 1]; Setup.names[s] = CHARS[pool[s - 1]].name; }
    this.render();
  },
  init() {
    $('#pkSeats').addEventListener('click', e => { if (e.target.closest('input')) return; const d = e.target.closest('[data-slot]'); if (d) { this.slot = +d.dataset.slot; this.render(); } });
    $('#pkSeats').addEventListener('input', e => { if (e.target.classList.contains('pkName')) Setup.names[+e.target.dataset.slot] = e.target.value; });
    $('#pkSeats').addEventListener('focusin', e => { if (e.target.classList.contains('pkName')) { e.target.select(); const s = +e.target.dataset.slot; if (s !== this.slot) { this.slot = s; $('#pkHint').textContent = `正在選：${SEAT_LABEL[s]}`; document.querySelectorAll('.pkSeat').forEach(x => x.classList.toggle('on', +x.dataset.slot === s)); } } });
    $('#pkChars').addEventListener('click', e => { const b = e.target.closest('[data-ci]'); if (b) this.pick(+b.dataset.ci); });
    $('#rndBtn').onclick = () => this.random();
    $('#resetBtn').onclick = () => { Setup.chars = [0, 1, 2, 3]; Setup.names = ['你', '阿明', '小美', '阿伯']; this.slot = 0; this.render(); };
    this.render();
  }
};
Setup.load(); Setup.apply(); Avatars.init(); Picker.init();


/* controls */
$('#bSound').onclick = e => { Snd.on = !Snd.on; e.currentTarget.classList.toggle('off', !Snd.on); if (!Snd.on && 'speechSynthesis' in window) speechSynthesis.cancel(); };
$('#vol').oninput = e => Snd.setVol(e.target.value / 100);
$('#bVoice').onclick = e => { Snd.voice = !Snd.voice; e.currentTarget.classList.toggle('off', !Snd.voice); };
$('#bSay').onclick = e => { Snd.sayTile = !Snd.sayTile; e.currentTarget.classList.toggle('off', !Snd.sayTile); };
$('#speed').onchange = e => UI.speed = +e.target.value;
$('#startBtn').onclick = () => {
  Setup.save(); Setup.apply(); $('#startOv').classList.add('hidden');
  if (!UI.started) { UI.started = true; Snd.init(); newHand(); } else render();
};
$('#bChar').onclick = () => { Picker.render(); $('#startBtn').textContent = UI.started ? '套用' : '開始遊戲'; $('#startOv').classList.remove('hidden'); };
document.addEventListener('visibilitychange', () => { if (!document.hidden && Snd.ctx && Snd.ctx.state !== 'running') Snd.ctx.resume(); });
/* iOS Safari 只在 touchend / click 等手勢裡允許開聲音，所以多綁幾個事件 */
const unlockAudio = () => { if (!Snd.ctx) Snd.init(); else if (Snd.ctx.state !== 'running') Snd.ctx.resume(); };
['touchend', 'click', 'keydown'].forEach(ev => document.addEventListener(ev, unlockAudio, { passive: true }));
/* ================= 線上對戰（房號制） ================= */
const RENDER_WS = 'wss://mahjong-online-wee6.onrender.com/ws';
const SERVER_WS = (() => {
  const q = new URLSearchParams(location.search).get('server');
  if (q) return /^wss?:\/\//.test(q) ? q : 'wss://' + q.replace(/^https?:\/\//, '').replace(/\/$/, '') + '/ws';
  if (window.MJ_SERVER) return window.MJ_SERVER;
  if (location.protocol === 'file:' || /\.github\.io$/.test(location.hostname)) return RENDER_WS;   // GitHub Pages / 本機檔案 → 連 Render
  return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';             // 由伺服器提供頁面 → 同網域
})();
const ONLINE_OK = true;
UI.online = false; UI.room = null; UI.oChars = [0, 1, 2, 3];
const Profile = {
  KEY: 'mj16_profile_v1', SKEY: 'mj16_online_v1',
  name: '', ci: 0,
  load() { try { const d = JSON.parse(localStorage.getItem(this.KEY) || 'null'); if (d) { this.name = d.name || ''; this.ci = CHARS[d.ci] ? d.ci : 0; } else { this.ci = Setup.chars[0]; this.name = Setup.names[0] === '你' ? '' : Setup.names[0]; } } catch (e) { } },
  save() { try { localStorage.setItem(this.KEY, JSON.stringify({ name: this.name, ci: this.ci })); } catch (e) { } },
  sess() { try { return JSON.parse(localStorage.getItem(this.SKEY) || 'null'); } catch (e) { return null; } },
  setSess(v) { try { v ? localStorage.setItem(this.SKEY, JSON.stringify(v)) : localStorage.removeItem(this.SKEY); } catch (e) { } }
};
Profile.load();

/* --- 連線（自動重連，冷啟動時顯示「伺服器喚醒中」） --- */
const Net = {
  ws: null, want: false, tries: 0, queue: [], slowT: null, pingT: null,
  url() { return SERVER_WS; },
  connect() {
    this.want = true;
    if (this.ws && this.ws.readyState <= 1) return;
    showConn(this.tries ? '連線中斷，重新連線中…' : '連線中…', this.tries ? `第 ${this.tries} 次重試` : '');
    clearTimeout(this.slowT);
    this.slowT = setTimeout(() => showConn('伺服器喚醒中…', '免費主機閒置一陣子會睡著，第一次連線約需 30–60 秒，請稍候'), 2500);
    let ws;
    try { ws = new WebSocket(this.url()); } catch (e) { return this.retry(); }
    this.ws = ws;
    ws.onopen = () => {
      clearTimeout(this.slowT); this.tries = 0; hideConn();
      const s = Profile.sess();
      // 使用者剛按了「開房／加入」→ 只送那個動作，不先自動回到舊房間（否則舊座位會一直被當成在線）
      const explicit = this.queue.some(m => m.t === 'create' || m.t === 'join');
      if (!explicit && s && s.code && s.token) ws.send(JSON.stringify({ t: 'join', code: s.code, token: s.token, name: Profile.name, ci: Profile.ci }));
      this.queue.splice(0).forEach(m => ws.send(JSON.stringify(m)));
    };
    ws.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch (x) { return; } onNet(m); };
    ws.onclose = () => { clearInterval(this.pingT); if (this.ws === ws) this.ws = null; if (this.want) this.retry(); else hideConn(); };
    ws.onerror = () => { };
  },
  retry() {
    this.tries++;
    clearTimeout(this.slowT);
    showConn(this.tries > 3 ? '伺服器喚醒中…' : '連線中斷，重新連線中…', `第 ${this.tries} 次重試（免費主機睡著時需 30–60 秒喚醒）`);
    setTimeout(() => { if (this.want) this.connect(); }, Math.min(5000, 600 * this.tries));
  },
  send(m) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(m)); else { this.queue.push(m); this.connect(); } },
  close() { this.want = false; this.queue = []; clearTimeout(this.slowT); if (this.ws) try { this.ws.close(); } catch (e) { } hideConn(); }
};
function showConn(t, sub) { $('#connTxt').textContent = t; $('#connSub').textContent = sub || ''; $('#connOv').classList.remove('hidden'); }
function hideConn() { $('#connOv').classList.add('hidden'); }
const ov = (id, on) => $(id).classList.toggle('hidden', !on);
function lbMsg(t) { $('#lbMsg').textContent = t || ''; }

/* --- 大廳 --- */
const Lobby = {
  render() {
    $('#lbAv').innerHTML = avatarHTML(Profile.ci, 'idle', 'pk');
    $('#lbName').value = Profile.name;
    $('#lbChars').innerHTML = CHARS.map((c, i) => `<button class="pkChar ${i === Profile.ci ? 'on' : ''}" data-ci="${i}" title="${c.name}">${avatarHTML(i, 'idle', 'pk')}<span class="pkTry" data-try="${i}" title="試聽${c.name}的聲音">🔊</span><span>${c.name}</span></button>`).join('');
    const q = new URLSearchParams(location.search).get('room'); if (q && !$('#lbCode').value) $('#lbCode').value = q.replace(/\D/g, '').slice(0, 4);
    $('#lbCreate').disabled = $('#lbJoinBtn').disabled = !ONLINE_OK;

  },
  profileOk() {
    Profile.name = ($('#lbName').value || '').trim().slice(0, 8);
    if (!Profile.name) { lbMsg('請先輸入你的名字'); $('#lbName').focus(); return false; }
    Profile.save(); return true;
  },
  init() {
    $('#lbChars').addEventListener('click', e => { const b = e.target.closest('[data-ci]'); if (!b) return; Profile.ci = +b.dataset.ci; Profile.name = $('#lbName').value; Profile.save(); this.render(); });
    $('#lbCreate').onclick = () => { if (!this.profileOk()) return; Snd.ctx || Snd.init(); Profile.setSess(null); lbMsg('建立房間中…'); Net.send({ t: 'create', name: Profile.name, ci: Profile.ci }); };
    $('#lbJoinBtn').onclick = () => {
      if (!this.profileOk()) return; const code = ($('#lbCode').value || '').replace(/\D/g, '');
      if (code.length !== 4) { lbMsg('請輸入 4 位數房號'); return; }
      Snd.ctx || Snd.init(); const s = Profile.sess();
      if (s && s.code !== code) Profile.setSess(null);          // 換到別的房間：舊房間的座位就放掉（伺服器也會改由電腦代打）
      lbMsg('加入房間中…');
      Net.send({ t: 'join', code, name: Profile.name, ci: Profile.ci, token: s && s.code === code ? s.token : undefined });
    };
    $('#lbCode').addEventListener('keydown', e => { if (e.key === 'Enter') $('#lbJoinBtn').click(); });
    $('#lbSolo').onclick = () => {
      Net.close(); Profile.setSess(null); UI.online = false; UI.room = null;
      if (!(UI.session instanceof MJ.Session)) UI.session = new MJ.Session();
      Setup.apply(); ov('#lobbyOv', false); Picker.render(); $('#startBtn').textContent = '開始遊戲'; ov('#startOv', true); $('#bChar').style.display = '';
    };
    this.render();
  }
};

/* --- 房間畫面 --- */
const LBL = ['你', '下家（右）', '對家（上）', '上家（左）'];
function renderRoom() {
  const r = UI.room; if (!r) return;
  const seats = r.seats.map((p, i) => `<div class="rmSeat ${i === 0 ? 'mine' : ''}" data-vs="${i}">${avatarHTML(p.ci, 'idle', 'pk')}<div class="nm">${p.name}</div>
    <div class="rmTags">${p.host ? '<span class="tag host">房主</span>' : ''}${p.human ? (p.online ? '<span class="tag ok">已連線</span>' : '<span class="tag off">離線</span>') : '<span class="tag ai">空位・電腦</span>'}${p.voice ? (p.voice.muted ? '<span class="tag vc">🔇 靜音</span>' : '<span class="tag vc">🎤 語音中</span>') : ''}</div><small>${LBL[i]}</small></div>`).join('');
  const humans = r.seats.filter(p => p.human).length;
  const srvQ = new URLSearchParams(location.search).get('server'); const xq = srvQ ? '&server=' + encodeURIComponent(srvQ) : '';
  const link = location.origin + location.pathname + '?room=' + r.code + xq;
  $('#roomBox').innerHTML = `<h2>房號</h2><div class="rmCode">${r.code}</div>
    <p>請朋友打開這個網址、輸入房號加入（目前 ${humans}/4 位玩家）</p>
    <div class="rmSeats">${seats}</div>
    <div class="rmLv">電腦難度：${r.isHost ? `<select id="rmLevel">${['easy', 'normal', 'hard'].map(k => `<option value="${k}" ${r.level === k ? 'selected' : ''}>${MJ.LEVEL_NAMES[k]}</option>`).join('')}</select>` : `<b>${MJ.LEVEL_NAMES[r.level || 'normal']}</b>`}</div>
    <div class="rmBtns">${r.isHost ? `<button class="big-btn" id="rmStart">▶ 開始（空位由電腦代打）</button>` : '<p>等待房主開始遊戲…</p>'}</div>
    <div class="rmBtns"><button class="smallbtn" id="rmVoice">🎤 加入語音</button><button class="smallbtn" id="rmCopy">📋 複製邀請連結</button><button class="smallbtn" id="rmLeave">🚪 離開牌桌</button>${r.isHost ? '<button class="smallbtn danger" id="rmDissolve">💥 解散牌桌</button>' : ''}</div>`;
  if ($('#rmLevel')) $('#rmLevel').onchange = e => Net.send({ t: 'level', v: e.target.value });
  if ($('#rmStart')) $('#rmStart').onclick = () => { Snd.ctx || Snd.init(); Net.send({ t: 'start' }); };
  $('#rmCopy').onclick = () => { const done = () => { $('#rmCopy').textContent = '✅ 已複製'; }; if (navigator.clipboard) navigator.clipboard.writeText(link).then(done, () => prompt('複製這個連結：', link)); else prompt('複製這個連結：', link); };
  $('#rmLeave').onclick = () => leaveRoom();
  if ($('#rmDissolve')) $('#rmDissolve').onclick = () => dissolveTable();
  $('#rmVoice').onclick = () => { if (Voice.on) Voice.leave(); else Voice.join(); };
  if (typeof Voice !== 'undefined') Voice.render();
}
/* 確認視窗（取代 confirm()，手機上比較好看） */
function confirmBox(title, msg, okText, danger) {
  return new Promise(res => {
    const o = $('#cfmOv'); $('#cfmTitle').textContent = title; $('#cfmMsg').textContent = msg;
    const ok = $('#cfmOk'), no = $('#cfmNo'); ok.textContent = okText || '確定'; no.textContent = '取消'; $('#cfmX').style.display = 'none'; ok.classList.toggle('danger', !!danger);
    const done = v => { o.classList.add('hidden'); ok.onclick = no.onclick = null; res(v); };
    ok.onclick = () => done(true); no.onclick = () => done(false); o.classList.remove('hidden');
  });
}
function backToLobby(msg) {
  Voice.leave(true); try { sessionStorage.removeItem(Voice.KEY); } catch (e) { }
  Profile.setSess(null); Net.close();
  UI.online = false; UI.room = null; UI.game = null; UI.pending = null; UI.lock = null;
  $('#bChat').style.display = 'none'; $('#bLeave').style.display = 'none'; $('#aiLevel').style.display = ''; $('#bChar').style.display = '';
  ov('#roomOv', false); ov('#resultOv', false); ov('#chatPal', false); ov('#lobbyOv', true); Lobby.render(); lbMsg(msg || ''); render();
  try { const sq = new URLSearchParams(location.search).get('server'); history.replaceState(null, '', location.pathname + (sq ? '?server=' + encodeURIComponent(sq) : '')); } catch (e) { }
}
// 離開牌桌：牌局中你的座位改由電腦代打到結束；大廳中座位空出來。通行碼作廢，不能再回到這個座位。
async function leaveRoom() {
  const r = UI.room; const playing = r && r.phase !== 'lobby';
  if (playing && !await confirmBox('離開牌桌？', '牌局進行中。離開後你的座位會由電腦代打，之後不能再回到這個座位。' + (r.isHost ? '房主會交給其他玩家。' : ''), '🚪 離開', true)) return;
  if (Voice.on) Net.send({ t: 'vleave' });
  Net.send({ t: 'leave' });
  setTimeout(() => backToLobby('你已離開牌桌'), 150);
}
// 解散牌桌（房主）：所有人回到大廳、房間刪除、語音關閉
async function dissolveTable() {
  if (!UI.room || !UI.room.isHost) return;
  if (!await confirmBox('解散牌桌？', '所有玩家都會被送回大廳，這個房間會被刪除（牌局中也會立刻結束）。', '💥 解散', true)) return;
  Net.send({ t: 'dissolve' });
  setTimeout(() => { if (UI.online) backToLobby('你已解散牌桌'); }, 2500);
}
async function tableMenu() {
  if (!UI.room) return;
  if (UI.room.isHost) {
    const o = $('#cfmOv'); $('#cfmTitle').textContent = '牌桌'; $('#cfmMsg').textContent = '你是房主：可以自己離開（房主交給其他玩家），或解散整個牌桌。';
    const ok = $('#cfmOk'), no = $('#cfmNo'), x = $('#cfmX');
    ok.textContent = '💥 解散牌桌'; ok.classList.add('danger'); no.textContent = '🚪 離開牌桌'; x.style.display = '';
    const close = () => { o.classList.add('hidden'); ok.onclick = no.onclick = x.onclick = null; x.style.display = 'none'; };
    ok.onclick = () => { close(); dissolveTable(); }; no.onclick = () => { close(); leaveRoom(); }; x.onclick = close;
    o.classList.remove('hidden');
  } else leaveRoom();
}
function applyRoomSeats() {
  const r = UI.room; if (!r) return;
  r.seats.forEach((p, i) => { NAMES[i] = i === 0 ? p.name : p.name; UI.oChars[i] = p.ci; });
  Avatars.refresh();
}
function mkView(v) { v.seatWind = s => (s - v.dealer + 4) % 4; return v; }
function exprFromResult(r) {
  if (!r) return ['idle', 'idle', 'idle', 'idle'];
  if (r.type === 'exhaust') return ['sad', 'sad', 'sad', 'sad'];
  return [0, 1, 2, 3].map(s => s === r.winner ? 'happy' : (r.self || s === r.loser) ? 'sad' : 'idle');
}
function updateAgainBtn() {
  const b = $('#againBtn'); if (!b || !UI.online || !UI.room) return;
  const hs = UI.room.seats.filter(p => p.human && p.online), rd = hs.filter(p => p.ready).length;
  if (UI.room.seats[0].ready) { b.disabled = true; b.textContent = `已準備（${rd}/${hs.length}）等待其他玩家…`; }
}
function againAction() {
  if (UI.online) { Net.send({ t: 'again' }); const b = $('#againBtn'); if (b) { b.disabled = true; b.textContent = '已準備，等待其他玩家…'; } return; }
  $('#resultOv').classList.add('hidden'); newHand();
}

function onNet(m) {
  switch (m.t) {
    case 'joined':
      UI.online = true; Profile.setSess({ code: m.code, token: m.token });
      ov('#lobbyOv', false); ov('#startOv', false); $('#bChar').style.display = 'none'; $('#bChat').style.display = ''; $('#bLeave').style.display = ''; $('#aiLevel').style.display = 'none'; lbMsg('');
      try { { const sq = new URLSearchParams(location.search).get('server'); history.replaceState(null, '', location.pathname + '?room=' + m.code + (sq ? '&server=' + encodeURIComponent(sq) : '')); } } catch (e) { }
      setTimeout(() => Voice.onJoined(), 300);
      break;
    case 'room':
      UI.room = m; UI.online = true; applyRoomSeats();
      if (m.phase === 'lobby') { renderRoom(); ov('#roomOv', true); } else ov('#roomOv', false);
      updateAgainBtn(); render(); Voice.sync();
      break;
    case 'state': {
      UI.online = true; ov('#lobbyOv', false); ov('#roomOv', false);
      const v = mkView(m.view); UI.game = v; UI.session = v.session;
      if (m.ev === 'start') { Avatars.setAll(['idle', 'idle', 'idle', 'idle']); UI.revealed = false; UI.pending = null; UI.selected = null; UI.lock = null; ov('#resultOv', false); }
      if (m.ev === 'sync') { UI.revealed = !!v.over; Avatars.setAll(v.over ? exprFromResult(v.result) : ['idle', 'idle', 'idle', 'idle']); if (!v.over) ov('#resultOv', false); render(); }
      else onEvent(m.ev, m.data);
      break;
    }
    case 'prompt':
      UI.pending = { kind: m.kind, opts: m.opts, tile: m.tile, pid: m.pid, deadline: Date.now() + m.ms, res: d => Net.send({ t: 'act', pid: m.pid, d }) };
      UI.selected = null; if (m.kind === 'claim') Snd.alert(); render();
      break;
    case 'promptEnd': if (UI.pending && UI.pending.pid === m.pid) { UI.pending = null; UI.selected = null; render(); } break;
    case 'result': {
      const v = mkView(m.view); UI.game = v; UI.session = m.session; UI.revealed = true;
      Avatars.setAll(exprFromResult(m.result)); render(); showResult(m.result); updateAgainBtn();
      Stats.recordOnline(m.result, UI.room && UI.room.code, m.session.handCount);
      break;
    }
    case 'err':
      if (m.code === 'noroom' || (m.code === 'full' && !UI.room)) { Profile.setSess(null); UI.online = false; ov('#roomOv', false); ov('#lobbyOv', true); Lobby.render(); }
      lbMsg(m.msg || '發生錯誤'); if (!$('#lobbyOv').classList.contains('hidden')) { } else callout(m.msg || '錯誤');
      break;
    case 'kicked': Voice.leave(true); Net.close(); UI.online = false; ov('#lobbyOv', true); Lobby.render(); lbMsg(m.msg); break;
    case 'left': break;
    case 'dissolved': if ($('#lbCode')) $('#lbCode').value = ''; backToLobby(m.msg ? m.msg + '，大家都回到大廳了' : '牌桌已解散'); break;
    case 'chat': Chat.show(m.seat, m.i); break;
    case 'rtc': Voice.onSignal(m); break;
    case 'lock': { const was = !!UI.lock; UI.lock = m.on ? { autoHu: !!m.autoHu, waits: m.waits || null } : null; if (m.on && !was) callout('🔒 聽牌鎖定'); if (!m.on && m.why) callout(m.why); render(); break; }
    case 'idle': Voice.leave(true); Net.close(); UI.sleeping = true; showConn('閒置太久，已暫時斷線', '點一下畫面任何地方就會重新連線'); break;
  }
}

/* --- 包裝既有畫面函式：倒數計時、房號、離線標示 --- */
const _renderActions = renderActions;
renderActions = function () {
  _renderActions();
  const pd = UI.pending;
  if (pd && pd.deadline) $('#actions').insertAdjacentHTML('beforeend', `<span class="cd" data-dl="${pd.deadline}"></span>`);
  tickCd();
};
function tickCd() {
  const el = document.querySelector('#actions .cd'); if (!el) return;
  const left = Math.max(0, Math.ceil((+el.dataset.dl - Date.now()) / 1000));
  el.textContent = '⏱ ' + left + ' 秒'; el.classList.toggle('warn', left <= 3);
}
setInterval(tickCd, 250);
const _render = render;
render = function () {
  _render();
  if (!UI.online || !UI.room || !UI.game) return;
  $('#roundInfo').textContent += `・房號 ${UI.room.code}`;
  for (const s of [1, 2, 3]) {
    const p = UI.room.seats[s], meta = document.querySelector('#p' + s + ' .meta'); if (!meta || !p) continue;
    if (!p.human) meta.insertAdjacentHTML('beforeend', '<span class="otag ai">電腦</span>');
    else if (!p.online) meta.insertAdjacentHTML('beforeend', '<span class="otag">離線・電腦代打</span>');
  }
};
document.addEventListener('pointerdown', () => {
  if (UI.sleeping) { UI.sleeping = false; const sv = Profile.sess(); if (sv && sv.code) Net.connect(); else hideConn(); } if (!Snd.ctx) Snd.init(); else if (Snd.ctx.state === 'suspended') Snd.ctx.resume(); }, { once: false, passive: true });

/* --- 啟動 --- */
Lobby.init();
if (/autostart/.test(location.hash)) { ov('#lobbyOv', false); }
else {
  ov('#startOv', false);
  const sv = Profile.sess();
  if (ONLINE_OK && sv && sv.code) { ov('#lobbyOv', false); UI.online = true; Net.connect(); }   // 重新整理後自動回到原座位
}



/* ================= 偏好設定（電腦難度） ================= */
const Prefs = {
  level: (() => { try { return localStorage.getItem('mj16_level') || 'normal'; } catch (e) { return 'normal'; } })(),
  setLevel(v) { this.level = MJ.LEVEL_NAMES[v] ? v : 'normal'; try { localStorage.setItem('mj16_level', this.level); } catch (e) { } if (UI.game && UI.game.aiLevel !== undefined && !UI.online) UI.game.aiLevel = this.level; }
};
$('#aiLevel').value = Prefs.level;
$('#aiLevel').onchange = e => Prefs.setLevel(e.target.value);

/* ================= 戰績統計（localStorage，不用資料庫） ================= */
const Stats = {
  KEY: 'mj16_stats_v1', MY: 'mj16_mystats_v1',
  blank: () => ({ hands: 0, wins: 0, tsumo: 0, dealins: 0, tai: 0, pts: 0 }),
  load(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } },
  save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } },
  add(rec, r, s) {
    rec.hands++; rec.pts += r.payments[s] || 0;
    if (r.type === 'win') { if (r.winner === s) { rec.wins++; rec.tai += r.total || 0; if (r.self) rec.tsumo++; } else if (r.loser === s) rec.dealins++; }
  },
  recordOffline(r) {
    const all = this.load(this.KEY) || {};
    for (let s = 0; s < 4; s++) {
      const key = NAMES[s] + '|' + Setup.chars[s];
      const rec = all[key] || Object.assign(this.blank(), { name: NAMES[s], ci: Setup.chars[s], me: s === 0 });
      this.add(rec, r, s); rec.me = rec.me || s === 0; all[key] = rec;
    }
    this.save(this.KEY, all);
  },
  recordOnline(r, code, handNo) {
    const my = this.load(this.MY) || Object.assign(this.blank(), { seen: [] });
    const tag = code + ':' + handNo + ':' + (UI.room ? UI.room.created : '');
    if (my.seen.includes(tag)) return;                 // 重新連線不重複計算
    my.seen = my.seen.concat(tag).slice(-60);
    this.add(my, r, 0); this.save(this.MY, my);
  },
  table(rows, cols) {
    return `<table class="stt"><tr>${cols.map(c => `<th>${c[0]}</th>`).join('')}</tr>${rows.map(r => `<tr>${cols.map(c => `<td>${c[1](r)}</td>`).join('')}</tr>`).join('')}</table>`;
  },
  pct: (a, b) => b ? Math.round(100 * a / b) + '%' : '-',
  open() {
    let h = '<h1>📊 戰績</h1>';
    const P = this.pct;
    const cols = [['', r => avatarHTML(r.ci, 'idle', 'pk')], ['玩家', r => r.name + (r.me ? ' ⭐' : '')], ['局數', r => r.hands], ['胡', r => `${r.wins}（${P(r.wins, r.hands)}）`], ['自摸', r => r.tsumo], ['放槍', r => `${r.dealins}（${P(r.dealins, r.hands)}）`], ['總台', r => r.tai], ['總分', r => fmt(r.pts)]];
    if (UI.online && UI.room && UI.room.stats) {
      const rows = UI.room.seats.map((p, i) => Object.assign({ name: p.name, ci: p.ci, me: i === 0 }, UI.room.stats[i] || this.blank()));
      h += `<h2>本房間（房號 ${UI.room.code}）</h2>` + this.table(rows, cols);
    }
    const my = this.load(this.MY);
    if (my && my.hands) h += '<h2>我的線上生涯（這台裝置）</h2>' + this.table([Object.assign({ name: Profile.name || '我', ci: Profile.ci, me: true }, my)], cols);
    const all = Object.values(this.load(this.KEY) || {}).sort((a, b) => b.pts - a.pts);
    if (all.length) h += '<h2>單機戰績（依玩家／角色）</h2>' + this.table(all, cols);
    if (!(UI.online && UI.room) && !all.length && !(my && my.hands)) h += '<p>還沒有紀錄，先打一局吧！</p>';
    h += `<div class="rmBtns"><button class="big-btn" id="stClose">關閉</button><button class="smallbtn" id="stReset">清除單機紀錄</button></div>`;
    $('#statsBox').innerHTML = h; ov('#statsOv', true);
    $('#stClose').onclick = () => ov('#statsOv', false);
    $('#stReset').onclick = () => { if (confirm('確定清除這台裝置的單機戰績？')) { try { localStorage.removeItem(this.KEY); } catch (e) { } this.open(); } };
  }
};
$('#bStats').onclick = () => Stats.open();

/* ================= 快捷聊天（只有固定句子／表情，伺服器限速） ================= */
const CHAT = [
  { t: '快一點啦！' }, { t: '好牌！', e: 'happy' }, { t: '哎呀～', e: 'sad' }, { t: '謝謝！', e: 'happy' },
  { t: '不好意思～', e: 'sad' }, { t: '厲害厲害', e: 'happy' }, { t: '我聽牌了喔', e: 'happy' }, { t: '再來一局！', e: 'happy' },
  { t: '😂', e: 'happy', emo: 1 }, { t: '👍', e: 'happy', emo: 1 }, { t: '🎉', e: 'happy', emo: 1 }, { t: '🙏', emo: 1 },
  { t: '😭', e: 'sad', emo: 1 }, { t: '😱', e: 'sad', emo: 1 }, { t: '😡', e: 'sad', emo: 1 }, { t: '🤔', emo: 1 }
];
const Chat = {
  last: 0,
  toggle() {
    const el = $('#chatPal');
    if (!el.innerHTML) el.innerHTML = CHAT.map((c, i) => `<button class="chq ${c.emo ? 'emo' : ''}" data-i="${i}">${c.t}</button>`).join('');
    el.classList.toggle('hidden');
  },
  send(i) {
    const now = Date.now(); if (now - this.last < 1200) return; this.last = now;
    Net.send({ t: 'chat', i }); $('#chatPal').classList.add('hidden');
  },
  show(seat, i) {
    const c = CHAT[i]; const av = Avatars.el(seat); if (!c || !av) return;
    const r = av.getBoundingClientRect();
    const b = document.createElement('div'); b.className = 'bubble' + (c.emo ? ' emo' : '') + (seat === 0 ? ' up' : ''); b.textContent = c.t;
    document.body.appendChild(b);
    const bw = b.offsetWidth, x = Math.min(window.innerWidth - bw - 6, Math.max(6, r.left + r.width / 2 - bw / 2));
    b.style.left = x + 'px'; b.style.top = Math.max(4, r.top - b.offsetHeight - 6) + 'px';
    setTimeout(() => b.classList.add('out'), 2600); setTimeout(() => b.remove(), 3100);
    if (c.e) Avatars.flash(seat, c.e, 1800);
    if (!c.emo && Snd.voice) Snd.say(c.t, false, seat);
    Snd.tone(990, .06, { gain: .08 });
  }
};
$('#bChat').onclick = e => { e.stopPropagation(); Chat.toggle(); };
$('#chatPal').addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (b) Chat.send(+b.dataset.i); });
document.addEventListener('click', e => { if (!e.target.closest('#chatPal') && !e.target.closest('#bChat')) $('#chatPal').classList.add('hidden'); });
Avatars.flash = function (s, e, ms) {
  const el = this.el(s); if (!el) return;
  const set = AVATAR_IMG[seatChar(s)], hset = AVATAR_HEAD[seatChar(s)];
  const base = el.querySelector('img.av-base'), head = el.querySelector('img.av-head');
  if (base && set && set[e]) base.src = set[e]; if (head && hset && hset[e]) head.src = hset[e];
  if (e === 'happy') this.play(el, 'a-happy', 1600); else this.play(el, 'a-nod', 1400);
  clearTimeout(el._fl); el._fl = setTimeout(() => this.paint(s), ms);
};

/* 分頁切到背景超過 10 分鐘就斷線（不讓閒置分頁一直佔用免費主機），回來時自動重連 */
let hideT = null;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { clearTimeout(hideT); hideT = setTimeout(() => { if (Net.ws) { Net.close(); UI.sleeping = true; } }, 10 * 60 * 1000); }
  else { clearTimeout(hideT); if (UI.sleeping) { UI.sleeping = false; const sv = Profile.sess(); if (sv && sv.code) Net.connect(); } }
});


/* ================= 語音通話（WebRTC 點對點；伺服器只轉送信令，聲音不經過伺服器） ================= */
const VOICE_STUN = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
// ICE 伺服器（STUN＋TURN 中繼）向遊戲伺服器的 /ice 拿短效帳密；拿不到就只用 STUN。window.MJ_ICE 只給測試用。
const IceCfg = {
  v: null, at: 0,
  url() { try { const u = new URL(SERVER_WS.replace(/^ws/, 'http')); u.pathname = u.pathname.replace(/\/ws$/, '') + '/ice'; u.search = ''; return u.href; } catch (e) { return null; } },
  async get() {
    if (window.MJ_ICE) return { iceServers: window.MJ_ICE, provider: 'test' };
    if (this.v && Date.now() - this.at < 30 * 60 * 1000) return this.v;
    try {
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 6000);
      const r = await fetch(this.url(), { signal: ctl.signal, cache: 'no-store' }); clearTimeout(t);
      const j = await r.json(); if (!Array.isArray(j.iceServers)) throw new Error('bad');
      this.v = j; this.at = Date.now();
    } catch (e) { this.v = { iceServers: VOICE_STUN, provider: 'stun-only', error: 'fetch' }; this.at = Date.now() - 25 * 60 * 1000; }
    return this.v;
  },
  hasRelay(v) { return !!(v && v.iceServers.some(x => [].concat(x.urls || []).some(u => /^turns?:/.test(u)))); }
};
const candType = c => { const m = /\btyp (\w+)/.exec(c || ''); return m ? m[1] : '?'; };
const Voice = {
  on: false, joining: false, stream: null, muted: false, myVid: null, myN: 0, peers: {}, meters: {}, speak: {}, localMutes: {}, needTap: false,
  KEY: 'mj16_voice',
  supported() { return !!(window.isSecureContext !== false && navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.RTCPeerConnection); },
  async join() {
    if (this.on || this.joining || !UI.online) return;
    if (!this.supported()) { callout(window.isSecureContext === false ? '語音需要 https 網址' : '這個瀏覽器不支援語音'); return; }
    this.joining = true; this.render();
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
    } catch (e) {
      this.joining = false; this.render();
      const n = e && e.name;
      callout(n === 'NotAllowedError' || n === 'SecurityError' ? '麥克風權限被拒絕（請到瀏覽器網址列旁的設定允許麥克風）' : n === 'NotFoundError' ? '找不到麥克風' : n === 'NotReadableError' ? '麥克風被其他程式占用' : '沒有取得麥克風（' + (n || '未知錯誤') + '）');
      return;
    }
    this.ice = await IceCfg.get();
    console.info('[voice] ICE provider:', this.ice.provider, '中繼(TURN)：', IceCfg.hasRelay(this.ice) ? '有' : '沒有');
    this.joining = false; this.on = true; this.muted = false;
    try { sessionStorage.setItem(this.KEY, '1'); } catch (e) { }
    this.audioSession(true);
    if (!Snd.ctx) Snd.init();
    this.addMeter(0, this.stream);
    Net.send({ t: 'vjoin', muted: false });
    callout('🎤 已加入語音'); this.render();
  },
  leave(silent) {
    for (const s of Object.keys(this.peers)) this.closePeer(+s);
    if (this.stream) this.stream.getTracks().forEach(t => t.stop());
    const was = this.on;
    this.stream = null; this.on = false; this.joining = false; this.myVid = null; this.staleVid = null; this.meters = {}; this.speak = {};
    if (!silent) { if (was) Net.send({ t: 'vleave' }); try { sessionStorage.removeItem(this.KEY); } catch (e) { } }
    this.audioSession(false); this.render();
  },
  toggleMute() {
    if (!this.on) return;
    this.muted = !this.muted; this.stream.getAudioTracks().forEach(t => { t.enabled = !this.muted; });
    Net.send({ t: 'vmute', muted: this.muted }); this.render();
  },
  audioSession(on) {          // iOS 17+：通話時交給系統決定（播放＋錄音），離開後恢復成「播放」讓靜音鍵不影響音效
    try { if (navigator.audioSession) navigator.audioSession.type = on ? 'play-and-record' : 'playback'; } catch (e) { }
  },
  onJoined() {
    if (this.on || this.joining) return;
    let want = false; try { want = sessionStorage.getItem(this.KEY) === '1'; } catch (e) { }
    if (!want) return;
    const ask = () => callout('點「🎤 加入語音」重新開啟語音');
    if (navigator.permissions && navigator.permissions.query) navigator.permissions.query({ name: 'microphone' }).then(p => { if (p.state === 'granted') this.join(); else ask(); }, ask);
    else ask();
  },
  sync() {
    const r = UI.room; if (!r || !r.seats) return;
    const me = r.seats[0];
    if (this.on) {
      if (me && me.voice && me.voice.id === this.staleVid) return this.render();   // 重試中：等伺服器給新的語音編號
      if (me && me.voice) { this.myVid = me.voice.id; this.myN = me.voice.n; this.staleVid = null; }
      else if (this.myVid) {                        // 伺服器那邊掉了（重新連線）→ 重新加入
        this.myVid = null; for (const s of Object.keys(this.peers)) this.closePeer(+s);
        Net.send({ t: 'vjoin', muted: this.muted });
      }
    }
    for (let s = 1; s < 4; s++) {
      const v = r.seats[s] && r.seats[s].voice; const pe = this.peers[s];
      if (!this.on || !this.myVid || !v) { if (pe) this.closePeer(s); continue; }
      if (pe && pe.vid !== v.id) this.closePeer(s);
      if (!this.peers[s]) this.makePeer(s, v, this.myN > v.n);   // 後加入的人發起連線，避免雙方同時 offer
    }
    this.render();
  },
  makePeer(s, v, offerer) {
    const ice = this.ice || { iceServers: window.MJ_ICE || VOICE_STUN, provider: 'stun-only' };
    let pc; try { pc = new RTCPeerConnection({ iceServers: ice.iceServers }); } catch (e) { console.warn('[voice] RTCPeerConnection', e); return; }
    const pe = { pc, vid: v.id, state: 'connecting', q: [], audio: null, remoteSet: false, localMute: !!this.localMutes[v.id],
      diag: { local: {}, remote: {}, errors: [], relayCfg: IceCfg.hasRelay(ice), provider: ice.provider, gathered: false, t0: Date.now() } };
    this.peers[s] = pe;
    this.stream.getTracks().forEach(t => pc.addTrack(t, this.stream));
    pc.onicecandidate = e => {
      if (!e.candidate) { pe.diag.gathered = true; return; }
      const ty = candType(e.candidate.candidate); pe.diag.local[ty] = (pe.diag.local[ty] || 0) + 1;
      this.sig(s, { type: 'ice', c: e.candidate.toJSON ? e.candidate.toJSON() : e.candidate });
    };
    pc.onicecandidateerror = e => { if (pe.diag.errors.length < 8) pe.diag.errors.push((e.url || '') + ' ' + e.errorCode + ' ' + (e.errorText || '')); };
    pc.ontrack = e => {
      const st = (e.streams && e.streams[0]) || new MediaStream([e.track]);
      if (!pe.audio) { const a = document.createElement('audio'); a.autoplay = true; a.setAttribute('playsinline', ''); a.className = 'vcAudio'; a.dataset.seat = s; document.body.appendChild(a); pe.audio = a; }
      pe.audio.srcObject = st; pe.audio.muted = pe.localMute;
      const pl = pe.audio.play(); if (pl && pl.catch) pl.catch(() => { this.needTap = true; callout('點一下畫面開始播放語音'); });
      this.addMeter(s, st);
    };
    const upd = () => {
      if (this.peers[s] !== pe) return;
      const cs = pc.connectionState || '', is = pc.iceConnectionState || '';
      if (cs === 'connected' || is === 'connected' || is === 'completed') { pe.state = 'connected'; clearTimeout(pe.timer); }
      else if (cs === 'failed' || is === 'failed') { if (pe.state !== 'failed') { pe.state = 'failed'; this.diagnose(s, pe); } }
      else if (cs === 'disconnected' || is === 'disconnected') pe.state = 'connecting';
      this.render();
    };
    pc.onconnectionstatechange = upd; pc.oniceconnectionstatechange = upd;
    pe.timer = setTimeout(() => { if (this.peers[s] === pe && pe.state !== 'connected') { pe.state = 'failed'; this.diagnose(s, pe); this.render(); } }, 25000);
    if (offerer) (async () => {
      try { const o = await pc.createOffer(); await pc.setLocalDescription(o); this.sig(s, { type: 'offer', sdp: pc.localDescription.sdp }); }
      catch (e) { pe.state = 'failed'; this.render(); }
    })();
  },
  sig(s, d) { const pe = this.peers[s]; if (pe) Net.send({ t: 'rtc', to: s, vid: pe.vid, d }); },
  async onSignal(m) {
    if (!this.on || !this.myVid) return;
    const s = m.from, d = m.d || {}; let pe = this.peers[s];
    if (!pe || pe.vid !== m.vid) {
      const v = UI.room && UI.room.seats[s] && UI.room.seats[s].voice;
      if (!v || v.id !== m.vid || d.type !== 'offer') return;
      if (pe) this.closePeer(s);
      this.makePeer(s, v, false); pe = this.peers[s]; if (!pe) return;
    }
    const pc = pe.pc;
    try {
      if (d.type === 'offer') {
        await pc.setRemoteDescription({ type: 'offer', sdp: d.sdp }); pe.remoteSet = true; await this.flush(pe);
        const a = await pc.createAnswer(); await pc.setLocalDescription(a); this.sig(s, { type: 'answer', sdp: pc.localDescription.sdp });
      } else if (d.type === 'answer') {
        if (pc.signalingState !== 'have-local-offer') return;
        await pc.setRemoteDescription({ type: 'answer', sdp: d.sdp }); pe.remoteSet = true; await this.flush(pe);
      } else if (d.type === 'ice' && d.c) {
        const ty = candType(d.c.candidate); pe.diag.remote[ty] = (pe.diag.remote[ty] || 0) + 1;
        if (pe.remoteSet) await pc.addIceCandidate(d.c); else pe.q.push(d.c);
      }
    } catch (e) { console.warn('voice signal', e && e.message); }
  },
  // 連不上時判斷原因（畫面顯示一句話，細節寫到 console）
  diagnose(s, pe) {
    const d = pe.diag, L = d.local, R = d.remote, n = o => Object.values(o).reduce((a, b) => a + b, 0);
    let why;
    if (!n(R)) why = '沒收到對方的連線資訊（對方可能網路斷線或瀏覽器擋住）';
    else if (!L.srflx && !L.relay) why = '你的網路擋住了語音（UDP／STUN 被擋，可能是公司防火牆）';
    else if (!d.relayCfg) why = '雙方網路無法直接連線，而且沒有中繼伺服器（TURN）可用';
    else if (!L.relay && !R.relay) why = '中繼伺服器（TURN）也連不上，網路可能只允許特定連線';
    else if (!L.relay) why = '你這邊連不上中繼伺服器（TURN）';
    else if (!R.relay) why = '對方連不上中繼伺服器（TURN）';
    else why = '雙方網路無法互通（連中繼也失敗）';
    pe.why = why;
    const info = { seat: s, why, provider: d.provider, relayConfigured: d.relayCfg, localCandidates: L, remoteCandidates: R, iceErrors: d.errors, seconds: Math.round((Date.now() - d.t0) / 1000), connectionState: pe.pc.connectionState, iceConnectionState: pe.pc.iceConnectionState };
    console.warn('[voice] 連線失敗', JSON.stringify(info));
    callout(`${NAMES[s] || ''} 語音連線失敗：${why}`);
    this.lastDiag = info;
  },
  retry() {                                   // 點「語音連線失敗」→ 重新加入語音（重新協商所有連線）
    if (!this.on) return;
    for (const k of Object.keys(this.peers)) this.closePeer(+k);
    this.staleVid = this.myVid; this.myVid = null; IceCfg.v = null;
    IceCfg.get().then(v => { this.ice = v; Net.send({ t: 'vjoin', muted: this.muted }); });
    callout('重新連線語音…');
  },
  async flush(pe) { for (const c of pe.q.splice(0)) { try { await pe.pc.addIceCandidate(c); } catch (e) { } } },
  closePeer(s) {
    const pe = this.peers[s]; if (!pe) return;
    delete this.peers[s]; clearTimeout(pe.timer);
    try { pe.pc.close(); } catch (e) { }
    if (pe.audio) { try { pe.audio.srcObject = null; } catch (e) { } pe.audio.remove(); }
    const mt = this.meters[s]; if (mt) { try { mt.src.disconnect(); } catch (e) { } delete this.meters[s]; }
    delete this.speak[s];
  },
  toggleLocalMute(s) {
    const pe = this.peers[s]; if (!pe) return;
    pe.localMute = !pe.localMute; this.localMutes[pe.vid] = pe.localMute; if (pe.audio) pe.audio.muted = pe.localMute;
    callout(pe.localMute ? '已在你這邊關掉這位的聲音' : '恢復這位的聲音'); this.render();
  },
  addMeter(s, stream) {
    const ctx = Snd.ctx; if (!ctx || !stream.getAudioTracks().length) return;
    try {
      const old = this.meters[s]; if (old) try { old.src.disconnect(); } catch (e) { }
      const src = ctx.createMediaStreamSource(stream), an = ctx.createAnalyser(); an.fftSize = 512; src.connect(an);
      this.meters[s] = { src, an, buf: new Uint8Array(an.fftSize), hold: 0 };
    } catch (e) { }
  },
  tick() {
    const now = Date.now();
    const key = [UI.online && !!UI.room, this.on, this.muted, this.joining].join();
    if (key !== this._key) { this._key = key; this.render(); }
    for (const k of Object.keys(this.meters)) {
      const s = +k, m = this.meters[k]; m.an.getByteTimeDomainData(m.buf);
      let sum = 0; for (let i = 0; i < m.buf.length; i++) { const x = (m.buf[i] - 128) / 128; sum += x * x; }
      const rms = Math.sqrt(sum / m.buf.length); m.rms = rms;
      if (rms > 0.035) m.hold = now + 350;
      let sp = m.hold > now;
      if (s === 0 && this.muted) sp = false;
      const pe = this.peers[s]; if (pe && pe.localMute) sp = false;
      const v = UI.room && UI.room.seats[s] && UI.room.seats[s].voice; if (s !== 0 && v && v.muted) sp = false;
      this.speak[s] = sp;
    }
    this.paintSeats();
  },
  status(s) {
    const r = UI.room; const v = r && r.seats && r.seats[s] && r.seats[s].voice; if (!v) return null;
    if (s === 0) return this.on ? (this.muted ? 'muted' : 'on') : null;
    const pe = this.peers[s];
    if (!this.on) return v.muted ? 'muted' : 'on';           // 自己沒加入也看得到別人在語音裡
    if (!pe) return 'connecting';
    if (pe.state === 'failed') return 'failed';
    if (v.muted) return 'muted';
    if (pe.localMute) return 'local';
    return pe.state === 'connected' ? 'on' : 'connecting';
  },
  paintSeats() {
    const show = UI.online && UI.room && UI.game && $('#roomOv').classList.contains('hidden');
    for (let s = 0; s < 4; s++) {
      const av = Avatars.el(s); const st = show ? this.status(s) : null;
      if (av) { av.classList.toggle('vc-speak', !!(st && this.speak[s])); av.classList.toggle('vc-in', !!st); }
      let b = document.getElementById('vcb' + s);
      if (!st) { if (b) b.style.display = 'none'; continue; }
      if (!b) { b = document.createElement('button'); b.id = 'vcb' + s; b.className = 'vcBadge'; b.onclick = e => { e.stopPropagation(); if (s === 0) return this.toggleMute(); const pe = this.peers[s]; if (pe && pe.state === 'failed') { callout('語音連線失敗：' + (pe.why || '網路無法連線') + '。再試一次…'); this.retry(); } else this.toggleLocalMute(s); }; document.body.appendChild(b); }
      const txt = { on: '🎤', muted: '🔇', local: '🔈✕', connecting: '🎤…', failed: '⚠️ 語音連線失敗' }[st];
      if (b.dataset.st !== st) { b.textContent = txt; b.dataset.st = st; b.className = 'vcBadge ' + st + (b.classList.contains('sm') ? ' sm' : ''); b.title = s === 0 ? '點一下切換靜音' : st === 'failed' ? '點一下看原因並重試' : '點一下在你這邊關掉／打開這位的聲音'; }
      if (st === 'failed') { const pe = this.peers[s]; const t = '語音連線失敗：' + ((pe && pe.why) || '') + '（點一下重試）'; if (b.title !== t) b.title = t; }
      const r = av.getBoundingClientRect();
      if (!r.width) { b.style.display = 'none'; continue; }
      const small = r.width < 44; b.classList.toggle('sm', small);
      b.style.display = ''; b.style.left = Math.round(r.right - (small ? 0 : 12)) + 'px'; b.style.top = Math.round(r.bottom - (small ? 2 : 14)) + 'px';
    }
    // 房間大廳的座位
    document.querySelectorAll('.rmSeat[data-vs]').forEach(el => { const s = +el.dataset.vs; const st = this.status(s); el.classList.toggle('vc-speak', !!(st && this.speak[s])); });
  },
  render() {
    const on = UI.online && !!UI.room;
    const j = $('#bVc'), mu = $('#bVcMute'), lv = $('#bVcLeave');
    if (j) { j.style.display = on && !this.on ? '' : 'none'; j.disabled = this.joining; }
    if (mu) { mu.style.display = on && this.on ? '' : 'none'; mu.innerHTML = this.muted ? '🔇<span class="lbl"> 取消靜音</span>' : '🎙️<span class="lbl"> 靜音</span>'; mu.classList.toggle('off', this.muted); }
    if (lv) lv.style.display = on && this.on ? '' : 'none';
    const rb = $('#rmVoice'); if (rb) rb.textContent = this.on ? '📴 離開語音' : (this.joining ? '🎤 連線中…' : '🎤 加入語音');
    this.paintSeats();
  }
};
$('#bVc').onclick = () => Voice.join();
$('#bLeave').onclick = () => tableMenu();
$('#bVcMute').onclick = () => Voice.toggleMute();
$('#bVcLeave').onclick = () => Voice.leave();
setInterval(() => { try { Voice.tick(); } catch (e) { } }, 120);
document.addEventListener('pointerdown', () => {
  if (!Voice.needTap) return; Voice.needTap = false;
  for (const pe of Object.values(Voice.peers)) if (pe.audio) pe.audio.play().catch(() => { });
}, { passive: true });
window.addEventListener('pagehide', () => { if (Voice.on) Voice.leave(true); });

/* 選角色時的「🔊 試聽」 */
const TRY_WORDS = ['碰', '槓', '自摸', '胡', '好牌！', '再來一局！'];
let tryN = 0;
document.addEventListener('click', e => {
  const t = e.target.closest('[data-try]'); if (!t) return;
  e.stopPropagation(); e.preventDefault();
  const ci = +t.dataset.try; if (!Snd.ctx) Snd.init(); else if (Snd.ctx.state !== 'running') Snd.ctx.resume();
  const w = TRY_WORDS[tryN++ % TRY_WORDS.length];
  t.classList.add('on'); setTimeout(() => t.classList.remove('on'), 600);
  Clips.load(ci).then(() => Snd.sayAs(ci, w), () => Snd.sayAs(ci, w));
}, true);
if (/autostart/.test(location.hash)) $('#startBtn').click();
