// node test/ice.test.js — /ice 端點：各種 TURN 設定（環境變數）回傳的 iceServers 正確、金鑰不外洩、有限速、供應商掛掉時退回 STUN
const { spawn } = require('child_process');
const path = require('path');
const crypto = require('crypto');
let fail = 0; const ok = (c, m) => { if (!c) { fail++; console.log('FAIL', m); } else console.log('ok  ', m); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
let port = 3950 + Math.floor(Math.random() * 40);
async function withServer(env, fn) {
  const PORT = port++;
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env: Object.assign({}, process.env, { PORT: String(PORT) }, env), stdio: 'ignore' });
  const get = () => fetch(`http://localhost:${PORT}/ice`).then(async r => ({ status: r.status, h: r.headers, j: await r.json() }));
  for (let i = 0; i < 50; i++) { try { await fetch(`http://localhost:${PORT}/healthz`); break; } catch (e) { await sleep(100); } }
  try { await fn(get); } finally { srv.kill(); }
}
const urlsOf = j => j.iceServers.flatMap(x => [].concat(x.urls));
(async () => {
  await withServer({}, async get => {
    const { j, h } = await get(); const t = j.iceServers.find(x => x.username);
    ok(j.provider === 'openrelay' && h.get('cache-control') === 'no-store', '沒設定 → 預設免註冊的 Open Relay（static-auth），不快取');
    const exp = +t.username.split(':')[0]; ok(exp > Date.now() / 1000 + 3600 && exp < Date.now() / 1000 + 7 * 3600, '帳密 6 小時內過期');
    ok(urlsOf(j).includes('turns:staticauth.openrelay.metered.ca:443?transport=tcp') && urlsOf(j).some(u => /:80\?transport=tcp/.test(u)), '含 turns:443（TLS/TCP）和 :80 TCP');
  });
  await withServer({ TURN_URLS: 'turn:t.example.com:3478, turns:t.example.com:443?transport=tcp', TURN_SECRET: 's3cret' }, async get => {
    const { j } = await get(); const t = j.iceServers.find(x => x.username);
    const want = crypto.createHmac('sha1', 's3cret').update(t.username).digest('base64');
    ok(j.provider === 'coturn' && t.credential === want && t.urls.length === 2, '自架 coturn：TURN_URLS＋TURN_SECRET → HMAC 短效帳密正確');
    ok(!JSON.stringify(j).includes('s3cret'), '共用金鑰不會送到瀏覽器');
  });
  await withServer({ TURN_URLS: 'turns:x.example:443?transport=tcp', TURN_USERNAME: 'u', TURN_CREDENTIAL: 'p' }, async get => {
    const { j } = await get(); ok(j.provider === 'static' && j.iceServers.some(x => x.username === 'u' && x.credential === 'p'), '固定帳密：TURN_URLS＋TURN_USERNAME＋TURN_CREDENTIAL');
  });
  await withServer({ TURN_DEFAULT: 'off' }, async get => {
    const { j } = await get(); ok(j.provider === 'none' && !j.iceServers.some(x => x.username), 'TURN_DEFAULT=off → 只有 STUN');
  });
  await withServer({ METERED_DOMAIN: '127.0.0.1:1', METERED_API_KEY: 'k' }, async get => {
    const { j, status } = await get(); ok(status === 200 && j.provider === 'stun-only' && j.iceServers.length, 'TURN 供應商連不上 → 仍回 200、退回 STUN（語音不會整個壞掉）');
  });
  await withServer({ LIM_ICEIP: '3' }, async get => {
    const s = []; for (let i = 0; i < 4; i++) s.push((await get()).status);
    ok(s.slice(0, 3).every(x => x === 200) && s[3] === 429, `/ice 有限速（${s.join(',')}）`);
  });
  console.log(fail ? 'FAILURES ' + fail : 'ALL ICE TESTS OK'); process.exit(fail ? 1 : 0);
})();
