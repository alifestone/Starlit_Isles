
// ================= generative music & sound (Web Audio, no files) =================
const Sound = (() => {
  let ctx = null, master, dryBus, wetBus, delayIn, noiseBuf, windGain, windFilter, timer = null;
  let muted = false, paused = false, step = 0, nextTime = 0, level = 0, pendingLevel = 0, finaleMode = false;
  const BPM = 76, E8 = 60 / BPM / 2;
  // Dmaj9 · Bm11 · Gmaj9 · A6/9sus — every chord sits inside D major pentatonic
  const CHORDS = [[50, 57, 61, 64, 66], [47, 54, 57, 62, 64], [43, 50, 54, 59, 64], [45, 52, 59, 62, 66]];
  const PENTA = [62, 64, 66, 69, 71, 74, 76, 78, 81, 83, 86, 88, 90, 93, 95, 98];
  let curChord = CHORDS[0];
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

  function makeIR(sec, decay) {
    const len = Math.floor(ctx.sampleRate * sec), b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay); }
    return b;
  }
  function init() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 3.5; comp.connect(ctx.destination);
    master = ctx.createGain(); master.gain.setValueAtTime(0, ctx.currentTime); master.connect(comp);
    master.gain.linearRampToValueAtTime(muted ? 0 : 0.85, ctx.currentTime + 2.5);
    const rev = ctx.createConvolver(); rev.buffer = makeIR(3.6, 2.4);
    wetBus = ctx.createGain(); wetBus.gain.value = 0.6; wetBus.connect(rev); rev.connect(master);
    dryBus = ctx.createGain(); dryBus.connect(master);
    const dl = ctx.createDelay(1.5); dl.delayTime.value = E8 * 3; const fb = ctx.createGain(); fb.gain.value = 0.38;
    const dlf = ctx.createBiquadFilter(); dlf.type = 'lowpass'; dlf.frequency.value = 2600;
    delayIn = ctx.createGain(); delayIn.connect(dl); dl.connect(dlf); dlf.connect(fb); fb.connect(dl); dlf.connect(dryBus); dlf.connect(wetBus);
    mkLayers(); fadeLayers(ctx.currentTime, true);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const nd = noiseBuf.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    const wn = ctx.createBufferSource(); wn.buffer = noiseBuf; wn.loop = true;
    windFilter = ctx.createBiquadFilter(); windFilter.type = 'bandpass'; windFilter.Q.value = 0.7; windFilter.frequency.value = 400;
    windGain = ctx.createGain(); windGain.gain.value = 0;
    wn.connect(windFilter); windFilter.connect(windGain); windGain.connect(dryBus); wn.start();
    nextTime = ctx.currentTime + 0.3;
    timer = setInterval(tick, 30);
    document.addEventListener('visibilitychange', () => { if (!ctx) return; document.hidden ? ctx.suspend() : (!paused && ctx.resume()); });
  }
  function env(when, a, peak, dur, rel = 0.05) {
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(peak, when + a);
    g.gain.exponentialRampToValueAtTime(0.0001, when + a + dur + rel);
    return g;
  }
  // ---- layers: every island unlocks one; each layer has its own sends so it can fade in on a bar line ----
  const LAYER_AT = { bass: 1, arp: 2, perc: 3, lead: 4, choir: 5, spark: 99 };
  const LY = {};
  function mkLayers() {
    for (const k in LAYER_AT) {
      const L = { dry: ctx.createGain(), wet: ctx.createGain(), dly: ctx.createGain() };
      L.dry.connect(dryBus); L.wet.connect(wetBus); L.dly.connect(delayIn);
      for (const g of [L.dry, L.wet, L.dly]) g.gain.value = 0;
      LY[k] = L;
    }
  }
  function fadeLayers(when, fast) {
    for (const k in LAYER_AT) {
      const on = k === 'spark' ? finaleMode : level >= LAYER_AT[k];
      for (const g of [LY[k].dry, LY[k].wet, LY[k].dly]) { g.gain.cancelScheduledValues(when); g.gain.setTargetAtTime(on ? 1 : 0, when, on ? (fast ? 0.05 : 1.1) : 0.25); }
    }
  }
  function route(node, dry = 1, wet = 0.4, delay = 0, L = null) {
    const D = L ? L.dry : dryBus, W = L ? L.wet : wetBus, Y = L ? L.dly : delayIn;
    if (dry) { const g = ctx.createGain(); g.gain.value = dry; node.connect(g); g.connect(D); }
    if (wet) { const g = ctx.createGain(); g.gain.value = wet; node.connect(g); g.connect(W); }
    if (delay) { const g = ctx.createGain(); g.gain.value = delay; node.connect(g); g.connect(Y); }
  }
  function osc(type, f, when, stop) { const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, when); o.start(when); o.stop(stop); return o; }

  // ---- instruments ----
  function bell(m, when, vol = 0.2, dur = 2.2, wet = 0.6, delay = 0.25, L = null) {
    const f = mtof(m), end = when + dur + 0.2;
    const car = osc('sine', f, when, end), mod = osc('sine', f * 3.5, when, end);
    const mg = ctx.createGain(); mg.gain.setValueAtTime(f * 2.2, when); mg.gain.exponentialRampToValueAtTime(f * 0.05, when + dur);
    mod.connect(mg); mg.connect(car.frequency);
    const g = env(when, 0.004, vol, dur); car.connect(g);
    const h = osc('sine', f * 2.01, when, end), hg = env(when, 0.003, vol * 0.25, dur * 0.5); h.connect(hg); hg.connect(g);
    route(g, 1, wet, delay, L);
  }
  function lead(m, when, len, vol = 0.1, L = null) {
    const f = mtof(m), end = when + len + 0.6;
    const o = osc('sine', f, when, end), o2 = osc('triangle', f, when, end);
    const vib = osc('sine', 5.2, when, end), vg = ctx.createGain();
    vg.gain.setValueAtTime(0, when); vg.gain.linearRampToValueAtTime(f * 0.006, when + Math.min(len, 0.6));
    vib.connect(vg); vg.connect(o.frequency); vg.connect(o2.frequency);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400;
    const g2 = ctx.createGain(); g2.gain.value = 0.35; o2.connect(g2); g2.connect(lp); o.connect(lp);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, when); g.gain.exponentialRampToValueAtTime(vol, when + 0.035);
    g.gain.exponentialRampToValueAtTime(vol * 0.7, when + 0.3); g.gain.setValueAtTime(vol * 0.7, when + len);
    g.gain.exponentialRampToValueAtTime(0.0001, when + len + 0.5);
    lp.connect(g); route(g, 0.9, 0.55, 0.18, L);
  }
  function pluck(m, when, vol = 0.08, L = null) {
    const f = mtof(m), end = when + 0.9;
    const o = osc('triangle', f, when, end), o2 = osc('sawtooth', f * 1.003, when, end);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(4200, when); lp.frequency.exponentialRampToValueAtTime(500, when + 0.4);
    const g2 = ctx.createGain(); g2.gain.value = 0.25; o2.connect(g2); g2.connect(lp); o.connect(lp);
    const g = env(when, 0.005, vol, 0.55); lp.connect(g); route(g, 0.8, 0.35, 0.5, L);
  }
  function pad(chord, when, dur, vol = 0.035, bright = 700) {
    for (const m of chord) for (const det of [-7, 7]) {
      const o = osc('sawtooth', mtof(m), when, when + dur + 2.5); o.detune.value = det + (Math.random() - 0.5) * 4;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = bright; lp.Q.value = 0.5;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, when);
      g.gain.exponentialRampToValueAtTime(vol, when + 1.8); g.gain.setValueAtTime(vol, when + dur);
      g.gain.exponentialRampToValueAtTime(0.0001, when + dur + 2.4);
      o.connect(lp); lp.connect(g); route(g, 0.7, 0.8);
    }
  }
  function choir(chord, when, dur, L = null) {
    for (const m of chord.slice(1)) {
      const o = osc('triangle', mtof(m + 12), when, when + dur + 2.5);
      const lfo = osc('sine', 4.8 + Math.random(), when, when + dur + 2.5), lg = ctx.createGain(); lg.gain.value = 6; lfo.connect(lg); lg.connect(o.detune);
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 1.2;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, when); g.gain.exponentialRampToValueAtTime(0.05, when + 2.2);
      g.gain.setValueAtTime(0.05, when + dur); g.gain.exponentialRampToValueAtTime(0.0001, when + dur + 2.4);
      o.connect(bp); bp.connect(g); route(g, 0.5, 1.0, 0, L);
    }
  }
  function bass(m, when, len, L = null) {
    const f = mtof(m - 12), o = osc('sine', f, when, when + len + 0.3), o2 = osc('triangle', f * 2, when, when + len + 0.3);
    const g = env(when, 0.02, 0.2, len * 0.8, 0.2), g2 = ctx.createGain(); g2.gain.value = 0.18;
    o.connect(g); o2.connect(g2); g2.connect(g); route(g, 1, 0.1, 0, L);
  }
  function noise(when, dur, type, freq, vol, q = 1, wet = 0.2, L = null) {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.start(when, Math.random()); s.stop(when + dur + 0.05);
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, when); f.Q.value = q;
    const g = env(when, 0.002, vol, dur, 0.02); s.connect(f); f.connect(g); route(g, 1, wet, 0, L); return f;
  }
  function kick(when, vol = 0.35, L = null) {
    const o = osc('sine', 120, when, when + 0.4); o.frequency.exponentialRampToValueAtTime(42, when + 0.25);
    const g = env(when, 0.003, vol, 0.3); o.connect(g); route(g, 1, 0.05, 0, L);
  }

  // ---- the theme (one phrase per chord: [step, note, length in eighths]) ----
  const MELODY = [
    [[0, 69, 2], [2, 74, 2], [4, 76, 2], [6, 78, 6], [12, 76, 2], [14, 74, 2]],
    [[0, 78, 4], [4, 76, 2], [6, 74, 2], [8, 71, 6], [14, 69, 2]],
    [[0, 71, 2], [2, 74, 2], [4, 79, 4], [8, 78, 2], [10, 76, 2], [12, 74, 4]],
    [[0, 76, 6], [6, 78, 2], [8, 76, 4], [12, 71, 4]],
  ];
  const MELODY_END = [[0, 76, 4], [4, 74, 2], [6, 76, 2], [8, 81, 8]];
  const THIRD_BELOW = { 1: -4, 2: -3, 4: -3, 6: -4, 7: -3, 9: -3, 11: -4 };

  // ---- sequencer ----
  function tick() {
    if (!ctx) return;
    while (nextTime < ctx.currentTime + 0.14) { schedule(step, nextTime); nextTime += E8; step++; }
  }
  function schedule(s, when) {
    const blk = Math.floor(s / 16), w = s % 16, ci = blk % 4, chord = CHORDS[ci];
    if (w % 8 === 0 && pendingLevel !== level) { level = pendingLevel; fadeLayers(when); }
    const lv = level, F = finaleMode;
    curChord = chord;
    if (w === 0) {
      const voicing = lv >= 1 || F ? chord : [chord[0], chord[1], chord[4]];
      pad(voicing, when, 16 * E8, F ? 0.042 : [0.026, 0.03, 0.032, 0.033, 0.034, 0.036][lv], F ? 1500 : [480, 700, 880, 1000, 1120, 1280][lv]);
      if (lv >= 5) choir(chord, when, 16 * E8, LY.choir);
      if (F) noise(when, 2.2, 'highpass', 5200, 0.07, 0.5, 0.8, LY.spark);
    }
    // night twinkles: sparse at first, they make room once the melody arrives
    if (w % 2 === 0 && Math.random() < (lv >= 4 ? 0.035 : 0.09)) bell(chord[1 + Math.floor(Math.random() * 4)] + 24, when, 0.03, 2.6, 1.1, 0);
    // bass: long held roots, then a pulse, then octave pickups
    if (lv === 1 && w === 0) bass(chord[0], when, 14 * E8, LY.bass);
    if (lv >= 2 && (w === 0 || w === 7 || w === 8 || w === 14)) bass(chord[0] + (lv >= 5 && w === 14 ? 12 : 0), when, w % 8 === 0 ? E8 * 5 : E8 * 1.2, LY.bass);
    // arpeggio: quarter notes, then eighths, then an echo an octave up
    if (lv >= 2 && (lv >= 3 || w % 2 === 0)) { const pat = [1, 2, 3, 4, 3, 2, 4, 1]; pluck(chord[pat[w % 8]] + 12, when, w % 2 ? 0.045 : 0.07, LY.arp); }
    if (lv >= 5 && w % 4 === 2) pluck(chord[(w / 2 | 0) % 5] + 24, when, 0.03, LY.arp);
    // drums grow one piece at a time
    if (lv >= 3) {
      if (w === 0 || w === 8) kick(when, 0.32, LY.perc);
      if (lv >= 5 && w === 11) kick(when, 0.2, LY.perc);
      if (w % 2) noise(when, 0.05, 'highpass', 7500, 0.05, 0.7, 0.05, LY.perc);
      if (lv >= 4 && (w === 4 || w === 12)) noise(when, 0.12, 'bandpass', 1900, 0.09, 1.5, 0.4, LY.perc);
      if ((lv >= 5 || F) && w % 4 === 2) noise(when, 0.03, 'highpass', 9000, 0.03, 0.7, 0.05, LY.perc);
    }
    // the theme arrives with the fourth island, gets a harmony with the fifth, and is doubled in the finale
    if (lv >= 4) {
      const phrase = ci === 3 && Math.floor(blk / 4) % 2 ? MELODY_END : MELODY[ci];
      const n = phrase.find(x => x[0] === w);
      if (n) {
        const len = n[2] * E8;
        lead(n[1], when, len, 0.1, LY.lead);
        bell(n[1] + 12, when, 0.035, len + 0.8, 0.7, 0.1, LY.lead);
        if (lv >= 5) lead(n[1] + THIRD_BELOW[n[1] % 12], when, len, 0.05, LY.lead);
        if (F) bell(n[1] + 24, when, 0.03, len + 1, 0.9, 0.2, LY.spark);
      }
    }
    // finale: sparkling sixteenth-note arpeggios
    if (F) for (let k = 0; k < 2; k++) bell(chord[(w * 2 + k) % 5] + 24 + k * 12, when + k * E8 / 2, 0.022, 0.6, 0.8, 0, LY.spark);
  }

  return {
    init,
    get ready() { return !!ctx; },
    // new layers wait for the next bar line; going back down (a restart) is immediate
    setLevel(n) { pendingLevel = n; if (!ctx || n < level) { level = n; if (ctx) fadeLayers(ctx.currentTime, true); } },
    setFinale(on) { finaleMode = on; if (ctx) fadeLayers(ctx.currentTime, false); },
    pause(on) { paused = on; if (ctx) on ? ctx.suspend() : ctx.resume(); },
    toggleMute() { muted = !muted; if (ctx) { master.gain.cancelScheduledValues(ctx.currentTime); master.gain.setTargetAtTime(muted ? 0 : 0.85, ctx.currentTime, 0.15); } return muted; },
    wind(v) { if (!ctx) return; windGain.gain.setTargetAtTime(0.015 + v * 0.09, ctx.currentTime, 0.2); windFilter.frequency.setTargetAtTime(280 + v * 1600, ctx.currentTime, 0.2); },
    collect(combo) {
      if (!ctx) return; const t = ctx.currentTime;
      // climb through the tones of whatever chord is playing, so a chain of seeds becomes part of the song
      const tones = [...new Set(curChord.flatMap(m => [m + 12, m + 24, m + 36]))].filter(m => m >= 64 && m <= 100).sort((a, b) => a - b);
      const m = tones[Math.min(combo, tones.length - 1)];
      bell(m, t, 0.24, 1.6, 0.5, 0.2);
      bell(m + 12, t + 0.03, 0.05, 0.7, 0.6, 0);
    },
    ring() {
      if (!ctx) return; const t = ctx.currentTime;
      [0, 2, 4, 5, 7].forEach((k, i) => bell(PENTA[k + 2], t + i * 0.045, 0.1, 0.8, 0.6, 0));
      const f = noise(t, 0.7, 'bandpass', 500, 0.25, 1.2, 0.3); f.frequency.exponentialRampToValueAtTime(3500, t + 0.6);
    },
    stamp(i) { if (!ctx) return; const t = ctx.currentTime; noise(t, 0.07, 'lowpass', 520, 0.3, 0.7, 0.15); bell(PENTA[3 + (i % 9)], t + 0.02, 0.09, 1.3, 0.6, 0); },
    chime() { if (!ctx) return; const t = ctx.currentTime; bell(81, t, 0.22, 2.5); bell(86, t + 0.18, 0.22, 3); bell(93, t + 0.36, 0.12, 3); },
    awaken() {
      if (!ctx) return; const t = ctx.currentTime;
      const o = osc('sine', 70, t, t + 3.2); o.frequency.exponentialRampToValueAtTime(30, t + 2.8);
      const g = env(t, 0.01, 0.5, 2.8); o.connect(g); route(g, 1, 0.3);
      const f = noise(t, 2.6, 'bandpass', 300, 0.22, 0.8, 0.8); f.frequency.exponentialRampToValueAtTime(6000, t + 2.4);
      const c = CHORDS[0].concat(CHORDS[0].map(m => m + 12), [86, 90, 93]);
      c.forEach((m, i) => bell(m + 12, t + 0.35 + i * 0.085, 0.1, 3.2, 0.9, 0.1));
      pad(CHORDS[0].map(m => m + 12), t, 3, 0.03, 2200);
    },
    finale() {
      if (!ctx) return; const t = ctx.currentTime;
      pad([38, 50, 57, 62, 66, 69, 74], t, 8, 0.05, 1800);
      [74, 78, 81, 86, 90, 93, 98, 93, 90, 86, 81, 86, 90, 93, 98, 102].forEach((m, i) => bell(m, t + 0.8 + i * 0.13, 0.11, 3.5, 0.9, 0.15));
      const o = osc('sine', 55, t, t + 5); o.frequency.exponentialRampToValueAtTime(27, t + 4.5);
      const g = env(t, 0.02, 0.6, 4.5); o.connect(g); route(g, 1, 0.4);
    },
    firework(vol = 1) {
      if (!ctx) return; const t = ctx.currentTime;
      noise(t, 0.35, 'lowpass', 900, 0.35 * vol, 0.8, 0.6);
      for (let i = 0; i < 7; i++) noise(t + 0.25 + Math.random() * 0.6, 0.02, 'highpass', 4000, 0.06 * vol, 0.7, 0.5);
    },
    whale(vol = 1) {
      if (!ctx) return; const t = ctx.currentTime, d = 4.2;
      for (const [ratio, amp] of [[1, 0.12], [1.5, 0.05], [2.01, 0.03]]) {
        const o = osc('sine', 190 * ratio, t, t + d + 0.5);
        o.frequency.setValueAtTime(190 * ratio, t);
        o.frequency.exponentialRampToValueAtTime(310 * ratio, t + d * 0.35);
        o.frequency.exponentialRampToValueAtTime(240 * ratio, t + d * 0.6);
        o.frequency.exponentialRampToValueAtTime(150 * ratio, t + d);
        const l = osc('sine', 5.5, t, t + d + 0.5), lg = ctx.createGain(); lg.gain.value = 9 * ratio; l.connect(lg); lg.connect(o.frequency);
        const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(amp * vol, t + 0.9);
        g.gain.setValueAtTime(amp * vol, t + d - 1); g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.4);
        o.connect(g); route(g, 0.35, 1.3);
      }
    },
    bump() { if (!ctx) return; const t = ctx.currentTime; const o = osc('sine', 90, t, t + 0.3); o.frequency.exponentialRampToValueAtTime(40, t + 0.2); const g = env(t, 0.003, 0.3, 0.2); o.connect(g); route(g, 1, 0.1); },
  };
})();
