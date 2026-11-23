#!/usr/bin/env python3
"""產生 10 位角色的喊牌語音（edge-tts 免費神經語音，用預設語速音高取得 → ffmpeg 調音高／語速、去頭尾靜音、轉 32kbps 單聲道 mp3）。
用法：python3 -m venv venv && venv/bin/pip install edge-tts && venv/bin/python tools/gen_voices.py
輸出：docs/voices/<角色編號>/<key>.mp3 與 docs/voices/voices.json"""
import asyncio, json, os, subprocess, tempfile
import edge_tts

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'docs', 'voices')
# 依角色形象挑聲音（編號＝CHARS 的順序）
PROFILES = [
    dict(name='小藍',   voice='zh-TW-YunJheNeural',   semi=+0.6, tempo=1.06,  desc='戴藍帽穿帽T的陽光大學生：台灣年輕男聲，稍快稍亮'),
    dict(name='阿明',   voice='zh-CN-YunxiNeural',    semi=+1.0, tempo=1.14, desc='刺蝟頭橘色帽T的活潑少年：有活力的少年聲，講話快'),
    dict(name='小美',   voice='zh-TW-HsiaoYuNeural',  semi=+1.6, tempo=1.06,  desc='長髮別花的甜美女生：台灣甜美女聲，偏高'),
    dict(name='阿伯',   voice='zh-TW-YunJheNeural',   semi=-3.2, tempo=0.86, desc='光頭戴眼鏡留八字鬍的阿伯：壓低、放慢的台灣男聲'),
    dict(name='阿嬤',   voice='zh-TW-HsiaoChenNeural',semi=-2.6, tempo=0.80, desc='灰髮包頭戴眼鏡的阿嬤：慢慢講、偏低的台灣女聲'),
    dict(name='王小姐', voice='zh-TW-HsiaoChenNeural',semi=-0.4, tempo=1.0,  desc='黑色鮑伯頭的上班族小姐：沉穩俐落的台灣女聲'),
    dict(name='喵喵',   voice='zh-CN-XiaoyiNeural',   semi=+4.5, tempo=1.10, desc='穿帽T的橘貓：卡通感、尖尖的可愛聲'),
    dict(name='小傑',   voice='zh-CN-YunxiaNeural',   semi=+0.0, tempo=1.04,  desc='戴眼鏡打領帶的國中生：童聲男孩'),
    dict(name='老張',   voice='zh-CN-YunjianNeural',  semi=-1.6, tempo=0.94,  desc='落腮鬍、綠 polo 的中年大叔：渾厚有勁的男聲'),
    dict(name='阿姨',   voice='zh-CN-XiaoxiaoNeural', semi=-1.5, tempo=0.95,  desc='捲髮紅衣、戴耳環的阿姨：溫暖、稍低的熟女聲'),
]
TILES = ["一萬","二萬","三萬","四萬","五萬","六萬","七萬","八萬","九萬","一筒","二筒","三筒","四筒","五筒","六筒","七筒","八筒","九筒",
         "一條","二條","三條","四條","五條","六條","七條","八條","九條","東風","南風","西風","北風","紅中","青發","白板"]
CALLS = {'吃': '吃！', '碰': '碰！', '槓': '槓！', '自摸': '自摸！', '胡': '胡了！', '流局': '流局～'}
CHAT = ['快一點啦！', '好牌！', '哎呀～', '謝謝！', '不好意思～', '厲害厲害', '我聽牌了喔', '再來一局！']
PHRASES = {}
for w, txt in CALLS.items(): PHRASES[w] = txt
for t in TILES: PHRASES[t] = t
for c in CHAT: PHRASES[c] = c
KEYS = {w: 'p%02d' % i for i, w in enumerate(PHRASES)}   # 檔名用編號，避免中文檔名

RAW = {}
FAILED = []
async def fetch_raw(voice, text, sem):
    k = (voice, text)
    if k not in RAW:
        RAW[k] = asyncio.ensure_future(_fetch(voice, text, sem))
    return await RAW[k]
S2T = str.maketrans('風發點來聽萬條這個囉', '风发点来听万条这个啰')
def variants(text):
    """zh-TW-YunJheNeural 對某些字串會固定回傳「沒有音訊」，改用去標點／簡體字等同音寫法再試。"""
    bare = text.rstrip('！～。')
    out = []
    for t in (text, bare, text.translate(S2T), bare.translate(S2T), bare + '。', bare.translate(S2T) + '。'):
        if t and t not in out: out.append(t)
    return out
FALLBACK = {'zh-TW-YunJheNeural': 'zh-CN-YunxiNeural'}
async def _fetch(voice, text, sem):
    async with sem:
        with tempfile.NamedTemporaryFile(suffix='.mp3', delete=False) as f: raw = f.name
        for v in (voice, FALLBACK.get(voice)):
            if not v: continue
            for t in variants(text):
                for attempt in range(2):
                    try:
                        await edge_tts.Communicate(t, v).save(raw)
                        if os.path.getsize(raw) > 500:
                            if (v, t) != (voice, text): print('  用替代', v, t, flush=True)
                            return raw
                    except Exception:
                        pass
                    await asyncio.sleep(1.0)
        raise RuntimeError('no audio ' + text)

async def one(ci, prof, word, sem):
    out = os.path.join(ROOT, str(ci), KEYS[word] + '.mp3')
    if os.path.exists(out) and os.path.getsize(out) > 500: return
    try: raw = await fetch_raw(prof['voice'], PHRASES[word], sem)
    except Exception as e:
        print('FAIL', ci, word, type(e).__name__, flush=True); FAILED.append((ci, word)); return
    f = 2 ** (prof['semi'] / 12)                       # 音高倍率（同時會改速度，再用 atempo 補回並套用語速）
    tempo = prof['tempo'] / f
    chain = []
    while tempo < 0.5: chain.append('atempo=0.5'); tempo /= 0.5
    while tempo > 2.0: chain.append('atempo=2.0'); tempo /= 2.0
    chain.append('atempo=%.4f' % tempo)
    af = ('asetrate=24000*%.5f,aresample=24000,' % f) + ','.join(chain) + \
         ',silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.02,areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.05,areverse'
    await asyncio.to_thread(subprocess.run, ['ffmpeg', '-loglevel', 'error', '-y', '-i', raw, '-af', af,
                    '-ac', '1', '-ar', '24000', '-b:a', '32k', out], check=True)

async def main():
    sem = asyncio.Semaphore(1); jobs = []
    for ci, prof in enumerate(PROFILES):
        os.makedirs(os.path.join(ROOT, str(ci)), exist_ok=True)
        for w in PHRASES: jobs.append(one(ci, prof, w, sem))
    await asyncio.gather(*jobs)
    manifest = {'v': 1, 'keys': KEYS, 'chars': [{k: p[k] for k in ('name', 'voice', 'semi', 'tempo')} for p in PROFILES]}
    with open(os.path.join(ROOT, 'voices.json'), 'w', encoding='utf-8') as f: json.dump(manifest, f, ensure_ascii=False, separators=(',', ':'))
    if FAILED: print('failed', len(FAILED), '— 再跑一次可補齊'); raise SystemExit(1)
    print('ok', len(jobs), 'clips')

asyncio.run(main())
