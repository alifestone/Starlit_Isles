// Records the Starlit Isles trailer frame by frame in headless Chromium, then renders its music offline.
//   node record.mjs stills [--every 0.5] [--at 1,2.5,...] [--to 30]   → review stills (960×540 JPEG)
//   node record.mjs full [--scale 1.5]                                  → out/starlit-isles-trailer.mp4
import { spawn, spawnSync } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BUILD = path.join(HERE, 'build');
const OUT = path.join(HERE, 'out');
const WORK = process.env.TRAILER_WORK || path.join(OUT, 'work');
const argv = process.argv.slice(2);
const mode = argv[0] || 'stills';
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
fs.mkdirSync(WORK, { recursive: true });

// ---- static server for build/ ----
const server = http.createServer((req, res) => {
  const f = path.join(BUILD, decodeURIComponent(req.url.split('?')[0]));
  if (!f.startsWith(BUILD) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

// ---- chromium ----
const full = mode === 'full';
const W = 1920, H = 1080, SCALE = full ? +opt('scale', 1) : argv.includes('--hd') ? 1 : 0.5;   // stills keep the real layout, at half resolution unless --hd
const port = 9300 + Math.floor(Math.random() * 500);
const chrome = spawn('chromium', ['--headless=new', '--no-sandbox', '--use-angle=vulkan', '--enable-features=Vulkan', '--ignore-gpu-blocklist', '--enable-gpu',
  `--remote-debugging-port=${port}`, `--window-size=${W},${H}`, '--hide-scrollbars', '--mute-audio', '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
chrome.stderr.on('data', () => {});
const cleanup = () => { try { chrome.kill('SIGKILL'); } catch {} server.close(); };
process.on('exit', cleanup);

let target;
for (let i = 0; i < 100 && !target; i++) {
  await new Promise(r => setTimeout(r, 150));
  try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t => t.type === 'page'); } catch {}
}
if (!target) throw new Error('chromium did not start');
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let nextId = 0; const pending = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); }
  else if (m.method === 'Runtime.exceptionThrown') console.error('[page exception]', m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  else if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(m.params.type)) console.error('[page ' + m.params.type + ']', m.params.args.map(a => a.value ?? a.description).join(' '));
};
const send = (method, params = {}) => new Promise((res, rej) => { const id = ++nextId; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); });
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
};
await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: SCALE, mobile: false });

// frame clock: the page only advances when we say so
await send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => {
  let q = [], vnow = 0;
  window.requestAnimationFrame = cb => { q.push(cb); return q.length; };
  window.cancelAnimationFrame = () => {};
  performance.now = () => vnow;
  Object.defineProperty(document, 'hidden', { get: () => false });
  Object.defineProperty(document, 'visibilityState', { get: () => 'visible' });
  window.__step = (ms) => { vnow += ms; const cbs = q; q = []; for (const cb of cbs) cb(vnow); };
})();` });

await send('Page.navigate', { url: `${base}/video.html` });
for (let i = 0; ; i++) {
  await new Promise(r => setTimeout(r, 200));
  try { if (await evaluate('!!window.__trailerReady')) break; } catch {}
  if (i > 300) throw new Error('video page never became ready');
}
const info = await evaluate('window.__trailer');
const frames = Math.min(info.frames, Math.round(+opt('to', 1e9) * info.fps));
console.log(`video page ready: ${info.frames} frames @ ${info.fps} fps (${info.end.toFixed(2)} s), rendering ${frames}`);
const shoot = async (quality = 92) => Buffer.from((await send('Page.captureScreenshot', { format: 'jpeg', quality, optimizeForSpeed: true })).data, 'base64');

const t0 = Date.now();
if (mode === 'stills') {
  const every = +opt('every', 0.5);
  const at = opt('at') ? opt('at').split(',').map(Number) : null;
  const want = new Set();
  if (at) at.forEach(t => want.add(Math.round(t * info.fps)));
  else for (let t = 0; t * info.fps < frames; t += every) want.add(Math.round(t * info.fps));
  const dir = path.join(WORK, 'stills'); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  const last = Math.max(...want);
  for (let f = 0; f <= last; f++) {
    await evaluate(`__step(${1000 / info.fps})`);
    if (want.has(f)) fs.writeFileSync(path.join(dir, `t${(f / info.fps).toFixed(2).padStart(6, '0')}.jpg`), await shoot(85));
  }
  console.log(`stills → ${dir} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
} else {
  const vid = path.join(WORK, 'video.mp4');
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(info.fps), '-c:v', 'mjpeg', '-i', '-',
    ...(SCALE !== 1 ? ['-vf', 'scale=1920:1080:flags=lanczos'] : []),
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-pix_fmt', 'yuv420p', '-r', String(info.fps), vid], { stdio: ['pipe', 'inherit', 'inherit'] });
  for (let f = 0; f < frames; f++) {
    await evaluate(`__step(${1000 / info.fps})`);
    const img = await shoot(95);
    if (!ff.stdin.write(img)) await new Promise(r => ff.stdin.once('drain', r));
    if (f % 300 === 0) console.log(`frame ${f}/${frames}  ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }
  ff.stdin.end();
  await new Promise(r => ff.on('close', r));
  console.log(`video → ${vid} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
}

// ---- music: replay the sound log through the real engine, offline ----
const log = await evaluate('window.__soundLog');
fs.writeFileSync(path.join(WORK, 'sound-log.json'), JSON.stringify(log));
const dur = frames / info.fps;
if (mode === 'full' || argv.includes('--audio')) {
  await send('Page.navigate', { url: `${base}/audio.html` });
  for (let i = 0; i < 100; i++) { await new Promise(r => setTimeout(r, 100)); try { if (await evaluate('typeof renderTrailerAudio === "function"')) break; } catch {} }
  const r = await evaluate(`renderTrailerAudio(${JSON.stringify(log)}, ${dur})`);
  const parts = [];
  for (let i = 0; i < r.chunks; i++) parts.push(Buffer.from(await evaluate(`__wav[${i}]`), 'base64'));
  const wav = path.join(WORK, 'music.wav');
  fs.writeFileSync(wav, Buffer.concat(parts));
  console.log(`music → ${wav} (${r.events} events, peak ${r.peak.toFixed(3)})`);

  if (mode === 'full') {
    // bring the mix to -15 LUFS, catch the finale's peaks with a limiter, fade under the end card, mux
    const m = spawnSync('ffmpeg', ['-hide_banner', '-i', wav, '-af', 'ebur128', '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
    const I = +m.slice(m.lastIndexOf('Integrated loudness')).match(/I:\s+(-?[\d.]+)/)[1];
    const gain = (-15 - I).toFixed(2);
    fs.mkdirSync(OUT, { recursive: true });
    const final = path.join(OUT, 'starlit-isles-trailer.mp4');
    const af = `volume=${gain}dB,alimiter=limit=0.84:attack=3:release=80:level=0,afade=t=out:st=${(dur - 3.1).toFixed(2)}:d=3`;
    const mux = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', path.join(WORK, 'video.mp4'), '-i', wav, '-af', af,
      '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-movflags', '+faststart', '-shortest', final], { stdio: 'inherit' });
    if (mux.status) throw new Error('mux failed');
    spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-ss', '77', '-i', final, '-frames:v', '1', '-q:v', '2', path.join(OUT, 'poster.jpg')]);
    console.log(`trailer → ${final}  (music ${I} LUFS, +${gain} dB)`);
  }
}
cleanup();
process.exit(0);
