
// ================= trailer: sound calls are logged, then rendered offline by audio.html =================
const soundLog = [];
let soundMute = false;   // the director can wake things silently and place the sound itself
window.__soundLog = soundLog;
let _windLast = -1;
const Sound = new Proxy({}, {
  get(_, k) {
    if (k === 'ready') return true;
    return (...a) => {
      // the director owns the arrangement; the game's own level changes and UI sounds are ignored
      if (soundMute) return false;
      if (k === 'setLevel' || k === 'pause' || k === 'toggleMute' || k === 'init' || k === 'stamp' || k === 'bump') return false;
      if (k === 'wind') { const v = Math.round(a[0] * 50) / 50; if (v === _windLast) return false; _windLast = v; a = [v]; }
      soundLog.push([+G.time.value.toFixed(4), k, ...a]);
      return false;
    };
  },
});
