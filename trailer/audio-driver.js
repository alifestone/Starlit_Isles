
// ================= trailer: render the game's music offline, replaying the video pass's sound log =================
// Sound schedules everything against ctx.currentTime, so it runs unmodified against a proxy whose clock we move.
window.renderTrailerAudio = async function (log, dur, sr = 48000) {
  const off = new OfflineAudioContext({ numberOfChannels: 2, length: Math.ceil(dur * sr), sampleRate: sr });
  let vnow = 0;
  const proxy = new Proxy(off, {
    get(target, k) {
      if (k === 'currentTime') return vnow;
      const v = Reflect.get(target, k, target);
      return typeof v === 'function' ? v.bind(target) : v;
    },
  });
  window.AudioContext = function () { return proxy; };
  let seed = 20260926;
  Math.random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  let tick = null;
  const realSetInterval = window.setInterval;
  window.setInterval = (fn) => { tick = fn; return 0; };
  Sound.init();
  window.setInterval = realSetInterval;

  const ev = log.filter(e => e[1] !== 'init');
  const TICK = 0.03;
  let vt = 0, ei = 0;
  function advance(to) {
    while (vt < to - 1e-9) {
      const next = Math.min(vt + TICK, to);
      while (ei < ev.length && ev[ei][0] <= next) { const [t, k, ...a] = ev[ei++]; vnow = Math.max(t, vt); Sound[k](...a); }
      vnow = next; tick(); vt = next;
    }
  }
  const CH = 0.2, n = Math.floor(dur / CH);
  advance(CH);
  for (let k = 1; k < n; k++) {
    const at = (k * CH * sr) / sr;
    off.suspend(at).then(() => { advance(Math.min(at + CH, dur)); off.resume(); });
  }
  const buf = await off.startRendering();

  // 32-bit float WAV, split into base64 chunks small enough for the DevTools protocol
  const L = buf.getChannelData(0), Rt = buf.getChannelData(1), N = L.length;
  const bytes = new Uint8Array(44 + N * 8), dv = new DataView(bytes.buffer);
  const w4 = (o, s) => { for (let i = 0; i < 4; i++) bytes[o + i] = s.charCodeAt(i); };
  w4(0, 'RIFF'); dv.setUint32(4, 36 + N * 8, true); w4(8, 'WAVE'); w4(12, 'fmt ');
  dv.setUint32(16, 16, true); dv.setUint16(20, 3, true); dv.setUint16(22, 2, true); dv.setUint32(24, sr, true);
  dv.setUint32(28, sr * 8, true); dv.setUint16(32, 8, true); dv.setUint16(34, 32, true); w4(36, 'data'); dv.setUint32(40, N * 8, true);
  let peak = 0;
  for (let i = 0; i < N; i++) { dv.setFloat32(44 + i * 8, L[i], true); dv.setFloat32(48 + i * 8, Rt[i], true); peak = Math.max(peak, Math.abs(L[i]), Math.abs(Rt[i])); }
  const chunks = [], CS = 3 * 1024 * 1024;
  for (let o = 0; o < bytes.length; o += CS) {
    const sl = bytes.subarray(o, o + CS); let s = '';
    for (let i = 0; i < sl.length; i += 0x8000) s += String.fromCharCode.apply(null, sl.subarray(i, i + 0x8000));
    chunks.push(btoa(s));
  }
  window.__wav = chunks;
  return { chunks: chunks.length, peak, events: ev.length };
};
