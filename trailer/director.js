
// ================= trailer director =================
// Runs inside the game module, so it can drive the real world: the crane flies on rails, cameras are
// scripted per shot, and every cut lands on the music's half-bar grid.
const FPS = 60, DT = 1 / FPS;
const HB = 60 / 76 / 2 * 8;                 // 8 eighth notes at 76 BPM ≈ 3.158 s (layers change on these lines)
const T = n => 0.3 + n * HB;                // the sequencer's first step sounds 0.3 s after init
const END = T(25) + 1.25;
window.__trailer = { fps: FPS, end: END, frames: Math.round(END * FPS) };

// ---- silence the game's own UI; the trailer draws its own ----
const flashes = [];
toast = () => {};
let flashScale = 1;
flash = (k = 0.8) => { flashes.push([G.time.value, k * flashScale]); };
showAchievements = () => {};

// ---- helpers ----
const smooth = (a, b, x) => { const k = clamp((x - a) / (b - a), 0, 1); return k * k * (3 - 2 * k); };
const easeInOut = x => x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
const polar = (c, a, r, y) => V3(c.x + Math.cos(a) * r, y, c.z + Math.sin(a) * r);
const [I0, I1, I2, I3, I4] = outer;
const topY = isl => isl.center.y + islandHeight(isl, 0, 0);
const angTo = (from, to) => Math.atan2(to.z - from.z, to.x - from.x);
const M = G.moonDir.value;

class Rail {
  // a Catmull-Rom path flown at constant speed; `tStart` is the absolute time the crane is at pts[0]
  constructor(pts, { speed = 18, tStart = 0, boost = 0 } = {}) {
    this.c = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    this.c.arcLengthDivisions = 3000;
    this.L = this.c.getLength(); this.speed = speed; this.tStart = tStart; this.boost = boost;
  }
  // time the rail so the crane is at arc-fraction u at absolute time t
  passAt(u, t) { this.tStart = t - u * this.L / this.speed; return this; }
  uNearest(p) { let best = 0, bd = 1e9; for (let k = 0; k <= 3000; k++) { const d = this.c.getPointAt(k / 3000).distanceTo(p); if (d < bd) { bd = d; best = k / 3000; } } return best; }
  uWithin(p, r) { for (let k = 0; k <= 3000; k++) if (this.c.getPointAt(k / 3000).distanceTo(p) < r) return k / 3000; return 1; }
  at(t) {
    const s = this.speed * (t - this.tStart), L = this.L;
    if (s <= 0) { const d = this.c.getTangentAt(0); return { p: this.c.getPointAt(0).addScaledVector(d, s), d }; }
    if (s >= L) { const d = this.c.getTangentAt(1); return { p: this.c.getPointAt(1).addScaledVector(d, s - L), d }; }
    return { p: this.c.getPointAt(s / L), d: this.c.getTangentAt(s / L) };
  }
}

// ================= crane on rails =================
const craneSt = { prevYaw: null };
function poseCrane(p, d, dt, boost, speed) {
  player.pos.copy(p); player.fwd.copy(d).normalize();
  const yaw = Math.atan2(-d.x, -d.z), pitch = Math.asin(clamp(player.fwd.y, -1, 1));
  let yawRate = 0;
  if (craneSt.prevYaw !== null) yawRate = (((yaw - craneSt.prevYaw + Math.PI) % TAU + TAU) % TAU - Math.PI) / dt;
  craneSt.prevYaw = yaw;
  player.yaw = yaw; player.pitch = pitch; player.speed = speed;
  player.roll = damp(player.roll, clamp(yawRate * 0.55, -0.85, 0.85), 4, dt);
  player.boost = damp(player.boost, boost, 3, dt);
  crane.position.copy(p);
  _e.set(pitch, yaw, player.roll, 'YXZ'); crane.quaternion.setFromEuler(_e);
  const effort = clamp(0.45 + pitch * 1.2 + player.boost * 0.6, 0.08, 1.2);
  player.flap += dt * (4 + effort * 8);
  const ang = Math.sin(player.flap) * 0.62 * effort + 0.12;
  wingR.rotation.z = ang; wingL.rotation.z = -ang;
  craneModel.position.y = -Math.sin(player.flap) * 0.08 * effort;
  player.histT += dt;
  if (player.histT > 0.04) { player.histT = 0; player.hist.unshift(player.pos.clone()); if (player.hist.length > 240) player.hist.pop(); }
  crane.updateMatrixWorld(true);
  ribbons[0].push(_v1.set(2.0, 0.25, 0.36).applyMatrix4(wingR.matrixWorld));
  ribbons[1].push(_v1.set(-2.0, 0.25, 0.36).applyMatrix4(wingL.matrixWorld));
  ribbons[2].push(_v1.set(0, 0.8, 1.3).applyMatrix4(craneModel.matrixWorld));
  ribbons[2].uOp.value = damp(ribbons[2].uOp.value, 0.15 + player.boost * 0.6, 4, dt);
}
function craneAt(rail, t, dt) { const { p, d } = rail.at(t); poseCrane(p, d, dt, rail.boost, rail.speed); }
// a cut that teleports the crane: replay the last seconds so trails and followers are already in place
function preroll(rail, t) {
  ribbons.forEach(r => r.ready = false); player.hist.length = 0; player.histT = 0; craneSt.prevYaw = null;
  for (let k = 150; k >= 1; k--) craneAt(rail, t - k * DT, DT);
  let slot = 0;
  for (let i = followers.length - 1; i >= 0; i--) {
    const f = followers[i]; if (f.mode !== 'follow') continue;
    f.p.copy(player.hist[Math.min(player.hist.length - 1, 3 + slot * 2)] || player.pos); slot++;
  }
}
const PARK = V3(0, 1500, 0);

// ================= world beats the director can call =================
function collectIsland(isl, silent) {
  for (const s of seeds) if (s.alive && s.isl === isl) { s.alive = false; if (!silent) addFollower(s.p, isl.idx); }
  for (const s of seeds) if (s.alive && s.isl === BONUS) s.alive = false;
  isl.collected = SEEDS_PER; isl.state = 'ready';
}
const cues = [];
const cue = (t, fn) => cues.push({ t, fn });
const level = (t, n) => cue(t, () => soundLog.push([G.time.value, 'setLevel', n]));

// ================= cameras =================
const C = { pos: V3(0, 150, 500), look: V3(), fov: 55, roll: 0 };
function chase(S, { back = 10.5, up = 3.4, ahead = 9, fov = 62, lag = 5, side = 0, lift = 0 } = {}) {
  const right = _v2.set(-player.fwd.z, 0, player.fwd.x).normalize();
  const want = _v1.copy(player.pos).addScaledVector(player.fwd, -back).add(V3(0, up, 0)).addScaledVector(right, side);
  const look = _v3.copy(player.pos).addScaledVector(player.fwd, ahead).add(V3(0, lift, 0));
  if (S.fresh) { S.cp = want.clone(); S.cl = look.clone(); C.roll = player.roll * 0.35; }
  S.cp.lerp(want, 1 - Math.exp(-DT * lag)); S.cl.lerp(look, 1 - Math.exp(-DT * 7));
  C.pos.copy(S.cp); C.look.copy(S.cl); C.fov = fov; C.roll = damp(C.roll, player.roll * 0.35, 3, DT);
}
function aim(pos, look, fov = 55, roll = 0) { C.pos.copy(pos); C.look.copy(look); C.fov = fov; C.roll = roll; }

// ================= the shot list =================
const shots = [];
const shot = (t0, t1, o) => shots.push(Object.assign({ t0, t1 }, o));
let R = {};   // rails, built once the world exists

function buildRails() {
  // S3 — hero orbit: the crane flies away from the moon toward the cherry isle
  const hDir = V3(-M.x, 0, -M.z).normalize(), hLat = V3(-hDir.z, 0, hDir.x);
  const H0 = I0.center.clone().addScaledVector(hDir, -235).setY(44);
  R.hero = new Rail([
    H0.clone().addScaledVector(hDir, -60),
    H0.clone(),
    H0.clone().addScaledVector(hDir, 55).addScaledVector(hLat, 3).add(V3(0, 1.5, 0)),
    H0.clone().addScaledVector(hDir, 115).addScaledVector(hLat, -2),
    H0.clone().addScaledVector(hDir, 190).add(V3(0, -3, 0)),
  ], { speed: 17 });
  R.hero.passAt(R.hero.uNearest(H0), T(4));

  // S4 — gameplay: the starter seeds lead to the cherry isle
  const start = player.pos.clone(), dir0 = player.fwd.clone();
  const bonus = seeds.filter(s => s.isl === BONUS).map(s => s.home.clone());
  const s0 = seeds.filter(s => s.isl === I0);
  R.seeds = new Rail([start.clone().addScaledVector(dir0, -40), start, ...bonus, s0[2].home.clone(), s0[3].home.clone(), s0[4].home.clone()], { speed: 18, tStart: T(6) - 40 / 18 + 0.2 });

  // S5 — boost through the three light rings between the cherry and maple isles
  const A = I0.center.clone().add(V3(0, 16, 0)), B = I1.center.clone().add(V3(0, 16, 0));
  const arc = t => A.clone().lerp(B, t).add(V3(0, Math.sin(t * Math.PI) * 22 + smooth(0.78, 1, t) * 14, 0));
  const rp = []; for (let k = 0; k <= 24; k++) rp.push(arc(lerp(-0.1, 1.15, k / 24)));
  R.rings = new Rail(rp, { speed: 36, boost: 0.55 });
  R.rings.passAt(R.rings.uNearest(rings[0].p), T(8) + 1.55);

  // S6 — under the great sky whale, overtaking it from tail to head
  const W = whales[0];
  const wa = t => 0.022 * t;
  const whaleY = a => W.h + Math.sin(a * 3) * 10;
  const wp = []; const ta = T(10) - 1, tb = T(12) + 1;
  for (let k = 0; k <= 16; k++) {
    const t = lerp(ta, tb, k / 16), a = wa(T(10)) - 0.105 + (t - T(10)) * (15.5 / 318);
    wp.push(V3(Math.cos(a) * 318, whaleY(wa(t)) - 4 + Math.sin(k * 0.7) * 1.5, Math.sin(a) * 318));
  }
  R.whale = new Rail(wp, { speed: 15.5, tStart: ta });
  R.wa = wa; R.whaleY = whaleY;

  // S7/S8 — dive into the cherry isle's light pillar, burst out the far side
  const h0 = I0.heart.clone(), out0 = V3(I0.center.x, 0, I0.center.z).normalize(), lat0 = V3(-out0.z, 0, out0.x);
  R.dive = new Rail([
    h0.clone().addScaledVector(out0, 95).add(V3(0, 42, 0)).addScaledVector(lat0, -24),
    h0.clone().addScaledVector(out0, 45).add(V3(0, 18, 0)).addScaledVector(lat0, -10),
    h0.clone().addScaledVector(out0, 16).add(V3(0, 4, 0)),
    h0.clone(),
    h0.clone().addScaledVector(out0, -38).add(V3(0, 10, 0)).addScaledVector(lat0, 8),
    h0.clone().addScaledVector(out0, -110).add(V3(0, 34, 0)).addScaledVector(lat0, 30),
  ], { speed: 21 });
  // reach the heart's 9 m trigger radius right on the cut (10.5 leaves room for its bob and pull)
  R.dive.passAt(R.dive.uWithin(h0, 10.5), T(13));

  // S10 — spiral up the sleeping world tree to its heart
  const hc = centerIsle.heart.clone(), a10 = 0.2;
  R.tree = new Rail([
    polar(hc, a10, 62, 16), polar(hc, a10 + 0.55, 46, 28), polar(hc, a10 + 1.1, 32, 42),
    polar(hc, a10 + 1.6, 16, hc.y - 7), hc.clone(), hc.clone().add(V3(0, 26, 0)),
  ], { speed: 24 });
  R.tree.passAt(R.tree.uWithin(hc, 10.5), T(18));

  // S12 — out of the blossoms, toward the sunrise
  const sun = V3(0.86, 0, 0.5).normalize(), sLat = V3(-sun.z, 0, sun.x);
  const c12 = V3(0, 58, 0);
  R.dawn = new Rail([
    c12.clone().addScaledVector(sun, 18).addScaledVector(sLat, -10),
    c12.clone().addScaledVector(sun, 60).addScaledVector(sLat, -4).add(V3(0, -6, 0)),
    c12.clone().addScaledVector(sun, 110).addScaledVector(sLat, 6).add(V3(0, -12, 0)),
    c12.clone().addScaledVector(sun, 170).addScaledVector(sLat, 2).add(V3(0, -16, 0)),
  ], { speed: 18.5, tStart: T(20) - 0.4 });
}

function buildShots() {
  // ---- ACT I · night ----
  shot(0, T(2), { // high approach over the sea of clouds toward the sleeping archipelago
    cam(t, lt) {
      const k = easeInOut(clamp(lt / (T(2) + 0.3), 0, 1)), tilt = easeInOut(smooth(0.6, 5.6, lt));
      const pos = V3(lerp(-10, -26, k), lerp(150, 112, k), lerp(600, 470, k));
      const up = _v1.copy(M).add(V3(0, 0.12, 0)).normalize(), down = _v2.set(-52, 58, 0).sub(pos).normalize();
      aim(pos, pos.clone().add(up.lerp(down, tilt).multiplyScalar(100)), 48);
    },
  });
  shot(T(2), T(4), { // the world tree, dormant under the moon
    cam(t, lt) {
      const k = easeInOut(clamp(lt / (2 * HB), 0, 1)), a = Math.atan2(-M.z, -M.x) + lerp(0.1, -0.06, k);
      aim(polar(V3(), a, lerp(98, 66, k), lerp(15, 9, k)), V3(0, lerp(27, 31, k), 0), 50);
    },
  });
  // ---- the crane ----
  shot(T(4), T(6), {
    crane: () => R.hero,
    cam(t, lt) {
      const k = easeInOut(clamp(lt / (2 * HB), 0, 1)), th = lerp(0.12, 2.75, k), d = lerp(6.5, 10, k);
      const f = V3().copy(player.fwd).setY(0).normalize(), r = V3(-f.z, 0, f.x);
      const pos = player.pos.clone().addScaledVector(f, Math.cos(th) * d).addScaledVector(r, Math.sin(th) * d).add(V3(0, lerp(-1.3, 2.2, k), 0));
      aim(pos, player.pos.clone().addScaledVector(f, lerp(0, 7, k)), lerp(46, 54, k));
    },
  });
  shot(T(6), T(8), { crane: () => R.seeds, cam(t, lt, S) { chase(S, { back: 11, up: 3.2, fov: 60 }); } });
  // ---- speed ----
  shot(T(8), T(9), { // side-tracking through the first two rings
    crane: () => R.rings,
    cam(t, lt) {
      const q = R.rings.at(t + lerp(0.62, 0.5, lt / HB)), right = V3(-q.d.z, 0, q.d.x).normalize();
      aim(q.p.addScaledVector(right, 9).add(V3(0, 2.6, 0)), player.pos.clone().addScaledVector(player.fwd, -2), 50);
    },
  });
  shot(T(9), T(10), { crane: () => R.rings, cam(t, lt, S) { chase(S, { back: 9, up: 2.6, fov: 78 + rings[2].flash * 10, lag: 7 }); } });
  shot(T(10), T(12), { // the whale pod passes over the moonlit clouds
    crane: () => R.whale,
    cam(t, lt) {
      const a = R.wa(t) + 0.01, y = R.whaleY(R.wa(t));
      const p = V3(Math.cos(a) * 352, y - 15, Math.sin(a) * 352);
      const l = whales[0].m.position.clone().lerp(player.pos, 0.45);
      aim(p, l, 46);
    },
  });
  // ---- ACT II · awakening ----
  shot(T(12), T(13), {
    crane: () => R.dive,
    enter() { collectIsland(I0); Sound.chime(); },
    cam(t, lt, S) { chase(S, { back: 12, up: 2.6, fov: 58, ahead: 14 }); },
  });
  shot(T(13), T(15), { // the colour wave rolls across the cherry isle
    crane: () => R.dive,
    enter(t) { if (I0.state === 'ready') awakenIsland(I0, t); },
    cam(t, lt) {
      const c = I0.center, a = angTo(c, V3()) + 1.95 + lt * 0.07, r = lerp(70, 84, lt / (2 * HB));
      aim(polar(c, a, r, topY(I0) + lerp(26, 30, lt / (2 * HB))), c.clone().add(V3(0, 4, 0)), 50);
    },
  });
  // montage: four more isles, one every two beats
  const mont = [
    { isl: I1, abs: Math.atan2(-M.z, -M.x), r: 1.3, h: 3.5, look: 7, fov: 54, orbit: 0.06, push: 3 },   // low, the wave rolls toward us
    { isl: I2, rel: -2.3, r: 1.8, h: 46, look: 0, fov: 50, orbit: 0.1, push: 2 },                         // high three-quarter
    { isl: I3, rel: 2.5, r: 2.3, h: -6, look: -4, fov: 48, orbit: -0.08, push: 5 },                       // side-on, rock and falls
    { isl: I4, rel: Math.PI + 0.35, r: 2.9, h: 20, look: 6, fov: 50, orbit: 0.05, push: 4 },              // wide, world tree behind
  ];
  mont.forEach((m, i) => {
    const tc = T(15 + i * 0.5);
    cue(tc - 0.9, () => { collectIsland(m.isl, true); flashScale = 0; soundMute = true; awakenIsland(m.isl, G.time.value); soundMute = false; flashScale = 1; });
    cue(tc - 0.3, () => soundLog.push([G.time.value, 'awaken']));
    shot(tc, tc + HB / 2, {
      cam(t, lt) {
        const c = m.isl.center, a = (m.abs ?? angTo(c, V3()) + m.rel) + lt * m.orbit, r = m.r * m.isl.R - lt * m.push;
        aim(polar(c, a, r, topY(m.isl) + m.h), c.clone().add(V3(0, m.look, 0)), m.fov);
      },
    });
  });
  // ---- ACT III · the world tree ----
  shot(T(17), T(18), {
    crane: () => R.tree,
    enter() { centerIsle.state = 'ready'; Sound.chime(); },
    cam(t, lt, S) {
      const base = worldTree.base;
      if (S.fresh) S.l = player.pos.clone();
      S.l.lerp(player.pos.clone().add(V3(0, 3, 0)), 1 - Math.exp(-DT * 4));
      aim(polar(base, 1.35 + lt * 0.03, 92, base.y + 24 + lt * 3), S.l, 50);
    },
  });
  shot(T(18), T(20), { // the tree blooms, lanterns everywhere
    crane: () => R.tree,
    enter(t) { if (centerIsle.state === 'ready') startFinale(t); },
    cam(t, lt) {
      const k = easeInOut(clamp(lt / (2 * HB), 0, 1));
      const a = 1.25 + lt * 0.045, r = lerp(80, 158, k);
      aim(polar(V3(), a, r, lerp(34, 66, k)), V3(0, lerp(36, 64, k), 0), 54);
    },
  });
  shot(T(20), T(22), { // toward the sunrise
    crane: () => R.dawn,
    cam(t, lt, S) { chase(S, { back: 6.5, side: -4.2, up: 0.5, ahead: 22, lift: 4, fov: 50, lag: 6 }); },
  });
  shot(T(22), END + 1, { // end card
    park: 'cam',
    cam(t, lt) {
      const a = Math.atan2(0.5, 0.86) + 0.42 + lt * 0.012, r = lerp(300, 282, lt / 10);
      aim(polar(V3(), a, r, lerp(98, 90, lt / 10)), V3(-10, 52, 0), 50);
    },
  });
}

// ================= captions =================
const caps = [
  { t0: T(2) + 0.5, t1: T(4) - 0.12, text: '天空群島沉睡了太久。' },
  { t0: T(4) + 0.5, t1: T(6) - 0.12, text: '你是一隻會發光的紙鶴。' },
  { t0: T(6) + 0.5, t1: T(8) - 0.12, text: '收集散落的星種，' },
  { t0: T(13) + 0.9, t1: T(15) - 0.1, text: '把光送回每一座浮島，' },
  { t0: T(15) + 0.2, t1: T(17) - 0.1, text: '每喚醒一座島，天空的樂曲就多一個聲部', sub: true },
  { t0: T(18) + 1.0, t1: T(20) - 0.12, text: '讓整片天空，' },
  { t0: T(20) + 0.5, t1: T(22) - 0.12, text: '迎來第一道黎明。' },
];
const capEl = $('trCap'), subEl = $('trSub');
let capOn = null;
function drawCaption(t) {
  const c = caps.find(c => t >= c.t0 - 0.01 && t < c.t1) || null;
  if (c !== capOn) {
    capEl.textContent = ''; subEl.textContent = '';
    if (c) for (const ch of c.text) { const s = document.createElement('span'); s.textContent = ch; (c.sub ? subEl : capEl).appendChild(s); }
    capOn = c;
  }
  if (!c) return;
  const spans = (c.sub ? subEl : capEl).children, out = smooth(c.t1 - 0.75, c.t1, t);
  for (let i = 0; i < spans.length; i++) {
    const k = smooth(0, 1, (t - c.t0 - i * (c.sub ? 0.035 : 0.075)) / 0.85);
    const o = k * (1 - out);
    spans[i].style.opacity = o.toFixed(3);
    spans[i].style.filter = `blur(${((1 - k) * 9 + out * 5).toFixed(2)}px)`;
    spans[i].style.transform = `translateY(${((1 - k) * 14 - out * 6).toFixed(2)}px)`;
  }
}

// ================= end card =================
const E0 = T(22);
const endEls = [['eN1', 0.35, 1.3, 1.1], ['eN2', 0.75, 1.3, 1.1], ['eSub', 1.3, 1.2, 0], ['eEye', 2.5, 0.9, 0], ['eLede', 2.85, 1.1, 0], ['eNote', 3.5, 1.1, 0], ['eCta', 4.2, 1.0, 0]]
  .map(([id, at, dur, grow]) => ({ el: $(id), at, dur, grow }));
const sealEl = $('eSeal'), SEAL_AT = 1.95;
let sealStamped = false;
function drawEnd(t) {
  const lt = t - E0;
  $('trEnd').style.opacity = lt < 0 ? 0 : 1;
  if (lt < 0) return;
  for (const e of endEls) {
    const k = smooth(0, 1, (lt - e.at) / e.dur);
    e.el.style.opacity = k.toFixed(3);
    e.el.style.filter = `blur(${((1 - k) * 12).toFixed(2)}px)`;
    e.el.style.transform = e.grow ? `scale(${(1 + (1 - k) * 0.08).toFixed(4)})` : `translateY(${((1 - k) * 16).toFixed(2)}px)`;
  }
  const s = clamp((lt - SEAL_AT) / 0.5, 0, 1), b = s <= 0 ? 0 : easeOutBack(s);
  sealEl.style.opacity = s > 0 ? Math.min(1, s * 3).toFixed(3) : 0;
  sealEl.style.transform = `scale(${lerp(2.3, 1, b).toFixed(4)}) rotate(${lerp(-14, -4, b).toFixed(3)}deg)`;
  if (!sealStamped && lt >= SEAL_AT + 0.12) { sealStamped = true; soundLog.push([G.time.value, 'stamp', 3]); }
}

// ================= per-frame =================
let cur = null, curRail = null;
function shotAt(t) { for (const s of shots) if (t >= s.t0 && t < s.t1) return s; return shots[shots.length - 1]; }
updatePlayer = function railPlayer(dt, t) {
  while (cues.length && cues[0].t <= t) cues.shift().fn();
  const S = shotAt(t);
  if (S !== cur) {
    cur = S; S.fresh = true;
    if (S.enter) S.enter(t);
    const rail = S.crane ? S.crane() : null;
    if (rail && rail !== curRail) preroll(rail, t);
    curRail = rail;
  }
  if (curRail) craneAt(curRail, t, dt);
  else { player.pos.copy(S.park === 'cam' ? C.pos : PARK); player.speed = 14; }
};

const _render = composer.render.bind(composer);
composer.render = function (d) {
  const t = G.time.value, S = cur || shots[0];
  S.cam(t, t - S.t0, S); S.fresh = false;
  camera.position.copy(C.pos); camera.up.set(0, 1, 0); camera.lookAt(C.look);
  if (C.roll) camera.rotateZ(C.roll);
  camera.fov = C.fov; camera.updateProjectionMatrix();
  sky.position.copy(camera.position); sea.position.set(camera.position.x, SEA_Y, camera.position.z);
  const show = !!curRail;
  crane.visible = show; ribbons.forEach(r => { r.mesh.visible = show; r.update(camera.position); }); folPts.pts.visible = show || followers.some(f => f.mode !== 'follow');
  // a quicker dawn than the game's, so it fits the trailer
  if (finale.on) {
    const ft = t - finale.t0;
    G.dawn.value = Math.pow(clamp((ft - 2.2) / 13, 0, 1), 1.1);
    const dawn = G.dawn.value;
    G.sunDir.value.set(0.86, lerp(-0.12, 0.2, dawn), 0.5).normalize();
    hemi.color.lerpColors(HEMI_SKY_N, HEMI_SKY_D, dawn); hemi.groundColor.lerpColors(HEMI_GND_N, HEMI_GND_D, dawn);
    sunLight.color.lerpColors(SUN_N, SUN_D, dawn); sunLight.intensity = lerp(1.25, 2.6, dawn);
    sunLight.position.copy(_v1.copy(G.moonDir.value).lerp(G.sunDir.value, dawn).normalize().multiplyScalar(200));
    scene.fog.color.lerpColors(FOG_NIGHT, FOG_DAWN, dawn);
    bloom.strength = lerp(0.85, 0.55, dawn);
  }
  PT_SCALE.value = renderer.domElement.height * 0.5 / Math.tan(camera.fov * Math.PI / 360);
  for (let i = 0; i < FF_N; i++) {
    const dx = fireflies.pos[i * 3] - camera.position.x, dy = fireflies.pos[i * 3 + 1] - camera.position.y, dz = fireflies.pos[i * 3 + 2] - camera.position.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz); if (d < 14) fireflies.size[i] *= smooth(4, 14, d);
  }
  fireflies.flush();
  const near = smooth(5, 18, camera.position.distanceTo(player.pos));
  folPts.size[0] = (1.6 + player.boost * 1.2) * lerp(0.25, 1, near); folPts.flush();
  craneLight.intensity = 90 * lerp(0.4, 1, near);
  canvas.style.filter = G.dawn.value > 0.01 ? `contrast(${(1 + G.dawn.value * 0.14).toFixed(3)}) saturate(${(1 + G.dawn.value * 0.2).toFixed(3)})` : '';
  // overlays
  let fl = 0; for (const [ft, k] of flashes) if (t >= ft) fl += k * Math.exp(-(t - ft) * 2.4) * smooth(0, 0.06, t - ft);
  $('trFlash').style.opacity = Math.min(1, fl).toFixed(3);
  $('trBlack').style.opacity = Math.max(1 - smooth(0.15, 2.6, t), smooth(END - 1.3, END - 0.1, t)).toFixed(3);
  drawCaption(t); drawEnd(t);
  _render(d);
};

// ================= go =================
resetGame();
game.introT = 10;
buildRails(); buildShots();
level(T(4) - 1.2, 1); level(T(6) - 1.2, 2); level(T(8) - 1.2, 3); level(T(13) - 1.2, 4); level(T(16) - 1.2, 5);
cues.sort((a, b) => a.t - b.t);
soundLog.length = 0; soundLog.push([0, 'init']);
G.time.value = -DT;
Promise.all([
  document.fonts.load('500 46px "Noto Serif TC"', caps.map(c => c.text).join('') + '紙鶴與沉睡的天空一隻紙鶴，五座沉睡的浮島，一場由你點亮的黎明。'),
  document.fonts.load('900 236px "Noto Serif TC"', '星嶼'),
  document.fonts.load('500 21px "Noto Serif TC"', '光之旅'),
  document.fonts.load('500 26px "Noto Sans TC"', caps[4].text),
  document.fonts.load('400 19px "Noto Sans TC"', $('eNote').textContent + $('eCta').textContent),
  document.fonts.load('700 23px "Noto Sans TC"', 'STARLIT ISLES啟程'),
]).then(() => document.fonts.ready).then(() => { window.__trailerReady = true; });
