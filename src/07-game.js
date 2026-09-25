
// ================= game state =================
const game = { phase: 'title', start: 0, seeds: 0, rings: 0, combo: 0, lastCollect: -9, awakened: 0, shake: 0, bumpCool: 0, auroraT: 0.12 };
const finale = { on: false, t0: 0, cine: false, shown: false };
const timers = [];
const after = (s, fn) => timers.push({ at: G.time.value + s, fn });
const $ = (id) => document.getElementById(id);
const outer = islands.filter(i => i.idx >= 0);

// ================= achievements (revealed on the ending screen) =================
const ach = {};
const ACH_KEY = 'starlit-isles-ach';
function loadAch() { try { const v = JSON.parse(localStorage.getItem(ACH_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; } }
function saveAch(ids) { try { localStorage.setItem(ACH_KEY, JSON.stringify([...new Set(loadAch().concat(ids))])); } catch (e) { /* storage unavailable */ } }
let achBefore = [], achStored = new Set(), achSaveT = 0;
function resetAch() {
  achBefore = loadAch(); achStored = new Set(achBefore);
  Object.assign(ach, { maxCombo: 0, ringSet: new Set(), whaleSet: new Set(), lowT: 0, maxAlt: -1e9, maxSpeed: 0, dist: 0, bumps: 0,
    order: [], treeAng: 0, treePrev: null, treeLoop: false, fall: false, moonT: 0, finishTime: 1e9 });
}
resetAch();
const ACH = [
  { id: 'first', seal: '翅', name: '初次振翅', desc: '收集第一顆星種', ok: () => game.seeds >= 1 },
  { id: 'awake', finishOnly: true, seal: '醒', name: '天空醒了', desc: '喚醒世界樹，完成旅程', ok: () => finale.on },
  { id: 'combo', seal: '連', name: '流星連珠', desc: '一口氣連續收集 6 顆星種', ok: () => ach.maxCombo >= 5 },
  { id: 'rings10', seal: '環', name: '光環穿梭者', desc: '穿過光環 10 次', ok: () => game.rings >= 10 },
  { id: 'ringsAll', seal: '虹', name: '全環制霸', desc: `穿過全部 ${rings.length} 個不同的光環`, ok: () => ach.ringSet.size >= rings.length },
  { id: 'fast', seal: '疾', name: '疾風之翼', desc: '邊加速邊穿過光環，飛出極速', ok: () => ach.maxSpeed >= 44 },
  { id: 'whale', seal: '鯨', name: '鯨歌知音', desc: '聽三隻天鯨都唱過歌', ok: () => ach.whaleSet.size >= whales.length },
  { id: 'tree', seal: '樹', name: '環繞世界樹', desc: '在世界樹甦醒前，繞著它飛一整圈', ok: () => ach.treeLoop },
  { id: 'low', seal: '雲', name: '雲海掠影', desc: '貼著雲海低飛 5 秒', ok: () => ach.lowT >= 5 },
  { id: 'high', seal: '星', name: '摘星', desc: '飛上 170 米以上的高空', ok: () => ach.maxAlt >= 170 },
  { id: 'moon', seal: '月', name: '奔月', desc: '在黎明前朝著月亮飛 3 秒', ok: () => ach.moonT >= 3 },
  { id: 'fall', seal: '瀑', name: '水簾穿越', desc: '穿過甦醒浮島的瀑布', ok: () => ach.fall },
  { id: 'order', seal: '序', name: '順風而行', desc: '依櫻、楓、螢、紫苑、金穗的順序喚醒浮島', ok: () => ach.order.join() === '0,1,2,3,4' },
  { id: 'feather', finishOnly: true, seal: '羽', name: '輕如羽毛', desc: '整趟旅程沒有撞到任何東西', ok: () => ach.bumps === 0 },
  { id: 'swift', finishOnly: true, seal: '速', name: '星夜急行', desc: '7 分鐘內完成旅程', ok: () => ach.finishTime <= 420 },
  { id: 'far', seal: '遊', name: '天空漫遊者', desc: '累計飛行 9000 米', ok: () => ach.dist >= 9000 },
];
function trackAch(dt) {
  const p = player.pos;
  if (p.y < SEA_Y + 22) ach.lowT += dt;
  ach.maxAlt = Math.max(ach.maxAlt, p.y);
  ach.maxSpeed = Math.max(ach.maxSpeed, player.speed);
  ach.dist += player.speed * dt;
  // a full lap around the world tree (the finale autopilot doesn't count)
  const r = Math.hypot(p.x, p.z);
  if (!finale.on && r < 115 && r > 8) {
    const a = Math.atan2(p.z, p.x);
    if (ach.treePrev !== null) ach.treeAng += ((a - ach.treePrev + Math.PI) % TAU + TAU) % TAU - Math.PI;
    ach.treePrev = a;
    if (Math.abs(ach.treeAng) >= TAU) ach.treeLoop = true;
  } else { ach.treePrev = null; ach.treeAng = 0; }
  if (!ach.fall) for (const isl of islands) {
    if (isl.state !== 'awake' || !isl.fallMeshes) continue;
    if (!isl.fallPts) {
      isl.fallPts = [];
      for (const m of isl.fallMeshes) { m.updateMatrixWorld(true); for (let f = 4; f <= 140; f += 6) isl.fallPts.push(m.localToWorld(V3(0, -f, f * 0.12 + f * f * 0.0022))); }
    }
    if (isl.fallPts.some(q => q.distanceTo(p) < 5)) ach.fall = true;
  }
  if (player.fwd.dot(G.moonDir.value) > 0.96 && G.dawn.value < 0.5) ach.moonT += dt;
  else if (ach.moonT < 3) ach.moonT = 0;
  achSaveT += dt;
  if (achSaveT > 1) {
    achSaveT = 0;
    const fresh = ACH.filter(a => !a.finishOnly && !achStored.has(a.id) && a.ok()).map(a => a.id);
    if (fresh.length) { fresh.forEach(id => achStored.add(id)); saveAch(fresh); }
  }
}
function showAchievements() {
  const got = ACH.filter(a => a.ok());
  saveAch(got.map(a => a.id));
  const ever = new Set(loadAch().concat([...achStored], got.map(a => a.id)).filter(id => ACH.some(a => a.id === id)));
  const grid = $('achGrid');
  grid.textContent = '';
  let k = 0;
  for (const a of ACH) {
    const now = a.ok(), past = !now && ever.has(a.id), el = document.createElement('div');
    el.className = 'a' + (now || past ? ' on' : '') + (past ? ' past' : '');
    const tag = now && !achBefore.includes(a.id) ? '<em class="new">NEW</em>' : past ? '<em class="old">過往</em>' : '';
    el.innerHTML = `<i class="s">${now || past ? a.seal : '？'}</i><div><b>${a.name}${tag}</b><span>${a.desc}</span></div>`;
    if (now) { const i = k++; el.style.setProperty('--d', (0.7 + i * 0.16) + 's'); setTimeout(() => Sound.stamp(i), 700 + i * 160); }
    grid.appendChild(el);
  }
  $('achCount').textContent = `本次 ${got.length} · 累計 ${ever.size} / ${ACH.length}`;
  $('stAch').textContent = `${ever.size}/${ACH.length}`;
}

// ---- HUD ----
outer.forEach(isl => { const i = document.createElement('i'); i.style.color = isl.def.hud; i.title = isl.def.name; $('isles').appendChild(i); isl.dot = i; });
let toastTimer = 0;
function toast(h, p, dur = 3.6) {
  $('toastH').textContent = h; $('toastP').textContent = p; $('toast').classList.add('on');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('on'), dur * 1000);
}
function flash(k = 0.8) { const f = $('flash'); f.style.transition = 'none'; f.style.opacity = k; requestAnimationFrame(() => { f.style.transition = 'opacity 1.8s ease'; f.style.opacity = 0; }); }

function currentTarget() {
  const ready = islands.find(i => i.state === 'ready');
  if (ready) return { p: ready.hm.mesh.position, text: ready.idx < 0 ? '飛向世界樹頂端的心燈' : `飛進發光的心燈，喚醒${ready.def.name}` };
  const bonus = seeds.find(s => s.alive && s.isl === BONUS);
  if (bonus && game.seeds < 3) return { p: bonus.p, text: '跟著金色星光飛行' };
  let best = null, bd = 1e9;
  for (const isl of outer) {
    if (isl.state !== 'sleep') continue;
    const d = isl.center.distanceTo(player.pos) - isl.collected * 40;
    if (d < bd) { bd = d; best = isl; }
  }
  if (!best) return null;
  let sp = null, sd = 1e9;
  for (const s of seeds) if (s.alive && s.isl === best) { const d = s.p.distanceTo(player.pos); if (d < sd) { sd = d; sp = s; } }
  return { p: sp ? sp.p : best.heart, text: `收集${best.def.name}的星種 ${best.collected}/${SEEDS_PER}` };
}
const markerEl = $('marker'), arrowEl = $('markerArrow'), distEl = $('markerDist');
let lastObjective = '';
function updateHUD() {
  $('seedCount').textContent = game.seeds;
  const tg = game.phase === 'play' ? currentTarget() : null;
  const txt = tg ? tg.text : (game.phase === 'free' ? '自由飛翔中，整片天空都是你的' : '');
  if (txt !== lastObjective) { $('objective').textContent = txt; lastObjective = txt; }
  if (!tg || finale.cine) { markerEl.style.opacity = 0; return; }
  markerEl.style.opacity = 1;
  _v1.copy(tg.p).applyMatrix4(camera.matrixWorldInverse);
  const behind = _v1.z > 0;
  _v2.copy(tg.p).project(camera);
  let x = _v2.x, y = _v2.y;
  if (behind) { x = -x; y = -y; if (Math.hypot(x, y) < 1e-3) y = -1; }
  const on = !behind && Math.abs(x) < 0.86 && Math.abs(y) < 0.8;
  if (!on) {
    const a = Math.atan2(y, x), m = Math.max(Math.abs(Math.cos(a)) / 0.86, Math.abs(Math.sin(a)) / 0.78);
    x = Math.cos(a) / m; y = Math.sin(a) / m;
    arrowEl.style.display = ''; arrowEl.setAttribute('transform', `rotate(${90 - a * 180 / Math.PI})`);
  } else arrowEl.style.display = 'none';
  markerEl.style.transform = `translate(${(x * 0.5 + 0.5) * innerWidth}px, ${(-y * 0.5 + 0.5) * innerHeight}px)`;
  const d = tg.p.distanceTo(player.pos);
  distEl.textContent = d > 18 ? `${Math.round(d)} 米` : '';
}

// ================= events =================
function collectSeed(s, t) {
  s.alive = false;
  game.combo = t - game.lastCollect < 2.4 ? game.combo + 1 : 0; game.lastCollect = t;
  Sound.collect(game.combo);
  ach.maxCombo = Math.max(ach.maxCombo, game.combo);
  game.seeds++;
  emit(s.p, 26, { color: 0xffd98a, speed: 12, life: 0.9, size: 0.9 });
  addFollower(s.p, s.isl.idx);
  if (s.isl !== BONUS) {
    const isl = s.isl; isl.collected++; isl.hm.pulse = 1;
    if (isl.collected >= SEEDS_PER && isl.state === 'sleep') {
      isl.state = 'ready'; Sound.chime();
      toast(isl.def.name, '心燈亮起來了，飛進光柱裡');
    }
  }
}

function awakenIsland(isl, t) {
  isl.state = 'awake'; isl.awakeClock = t;
  ach.order.push(isl.idx);
  game.awakened++; Sound.awaken(); Sound.setLevel(game.awakened);
  game.auroraT = 0.12 + game.awakened * 0.17;
  flash(0.55); game.shake = 1.2;
  toast(isl.def.name, `${isl.def.sub}\n♪ ${['', '低音加入了樂曲', '琶音加入了樂曲', '鼓聲加入了樂曲', '主旋律響起來了', '合唱與和聲加入，樂曲完整了'][game.awakened]}`, 4.5);
  if (isl.dot) isl.dot.classList.add('lit');
  deliverFollowers(isl.idx, isl.hm.mesh.position);
  const cols = isl.def.leaf.concat(isl.def.flower);
  for (let k = 0; k < 6; k++) emit(isl.hm.mesh.position, 40, { color: cols[k % cols.length], speed: 34, life: 1.8, size: 1.2, drag: 1.4 });
  for (let k = 0; k < 26; k++) after(0.6 + k * 0.22, () => {
    const a = rand() * TAU, r = Math.sqrt(rand()) * isl.R * 0.8;
    spawnLantern(V3(isl.center.x + Math.cos(a) * r, isl.center.y + islandHeight(isl, Math.cos(a) * r, Math.sin(a) * r) + 1, isl.center.z + Math.sin(a) * r));
  });
  if (outer.every(i => i.state === 'awake')) after(4.5, () => {
    if (centerIsle.state !== 'sleep') return;
    centerIsle.state = 'ready'; Sound.chime();
    toast('世界樹在呼喚你', '五道光已經匯集到天空中央', 4.5);
  });
}

function startFinale(t) {
  centerIsle.state = 'awake'; centerIsle.awakeClock = t;
  ach.finishTime = t - game.start;
  finale.on = true; finale.t0 = t; finale.cine = true;
  Sound.finale(); Sound.setFinale(true); Sound.setLevel(5);
  flash(0.9); game.shake = 1.6;
  deliverFollowers('all', centerIsle.hm.mesh.position);
  toast('世界樹', '整片天空，正在醒來', 5);
  const c = centerIsle.center, orbitR = 88, orbitY = worldTree.top.y + 14;
  input.auto = () => {
    const dx = player.pos.x - c.x, dz = player.pos.z - c.z, r = Math.hypot(dx, dz) || 1;
    const k = clamp((r - orbitR) / orbitR, -1, 1) * 1.6;
    const wx = -dz / r - dx / r * k, wz = dx / r - dz / r * k;
    const want = Math.atan2(-wx, -wz);
    const diff = ((want - player.yaw + Math.PI) % TAU + TAU) % TAU - Math.PI;
    return { x: clamp(-diff * 2.2, -1, 1), y: clamp((orbitY - player.pos.y) * 0.05, -0.6, 0.6) };
  };
  for (let k = 0; k < 340; k++) after(1.5 + k * 0.04, () => {
    const a = rand() * TAU, r = rr(20, 330);
    spawnLantern(V3(Math.cos(a) * r, rr(-30, 40), Math.sin(a) * r));
  });
  const fwCols = [0xffd24a, 0xff9ec0, 0x6ff2d2, 0xb98cff, 0xff8a3d, 0xffffff];
  for (let k = 0; k < 30; k++) after(3.5 + k * 0.62 + rand() * 0.3, () => {
    const a = rand() * TAU, r = rr(45, 130);
    const p = V3(Math.cos(a) * r, rr(70, 135), Math.sin(a) * r);
    const col = fwCols[k % fwCols.length];
    emit(p, lowPower ? 110 : 180, { color: col, speed: 30, life: 2.4, size: 1.4, drag: 1.1, grav: 5, jitter: 0.3 });
    emit(p, 30, { color: 0xffffff, speed: 10, life: 0.8, size: 1.8, drag: 2 });
    Sound.firework(clamp(120 / p.distanceTo(player.pos), 0.25, 1));
  });
  after(13, () => { finale.cine = false; input.auto = null; });
  after(15, () => {
    const s = Math.round(t - game.start);
    $('stTime').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    $('stSeeds').textContent = game.seeds; $('stRings').textContent = game.rings;
    showAchievements();
    $('hud').classList.remove('on');
    $('ending').classList.add('on'); finale.shown = true;
    $('freeBtn').focus({ preventScroll: true });
  });
}

function resetGame() {
  islands.forEach(isl => {
    isl.state = 'sleep'; isl.collected = 0; isl.awakeClock = -1; isl.U.awake.value = 0;
    setIslandGrowth(isl, -1, true); (isl.falls || []).forEach(m => m.uniforms.uOn.value = 0);
    if (isl.dot) isl.dot.classList.remove('lit');
  });
  for (let i = seeds.length - 1; i >= 0; i--) { if (seeds[i].isl === BONUS) seeds.splice(i, 1); else { seeds[i].alive = true; seeds[i].p.copy(seeds[i].home); } }
  followers.length = 0; lanterns.forEach(L => L.alive = false); timers.length = 0;
  lanterns.forEach((L, i) => { _m1.makeScale(0, 0, 0); lanternMesh.setMatrixAt(i, _m1); });
  G.dawn.value = 0; G.aurora.value = 0.12; decorU.awake.value = 0; setTreeBloom(-1);
  Object.assign(finale, { on: false, cine: false, shown: false });
  Object.assign(game, { phase: 'play', start: G.time.value, seeds: 0, rings: 0, combo: 0, awakened: 0, auroraT: 0.12 });
  input.auto = null; Sound.setLevel(0); Sound.setFinale(false); resetAch();
  resetPlayer(); layStarterSeeds();
  cam.pos.copy(player.pos).add(V3(0, 6, 14)); cam.look.copy(player.pos);
  $('ending').classList.remove('on'); $('hud').classList.add('on');
}

// ================= per-frame game logic =================
const prevPos = V3();
function gameLogic(dt, t) {
  // seeds: bob, magnet, collect
  for (const s of seeds) {
    if (!s.alive) continue;
    const d = s.p.distanceTo(player.pos);
    if (d < 9) { s.pull = Math.min(1, s.pull + dt * 3); s.p.lerp(player.pos, s.pull * dt * 9); }
    else { s.pull = 0; s.p.copy(s.home); s.p.y += Math.sin(t * 1.8 + s.ph) * 0.6; }
    if (d < 2.6) collectSeed(s, t);
  }
  // heart crystals
  for (const isl of islands) {
    if (isl.state !== 'ready') continue;
    const hp = isl.hm.mesh.position, d = hp.distanceTo(player.pos);
    if (d < 22) { _v1.subVectors(hp, player.pos).multiplyScalar(dt * 1.2); player.pos.add(_v1); }
    if (d < 9) isl.idx < 0 ? startFinale(t) : awakenIsland(isl, t);
  }
  // rings: detect crossing the ring plane close to its centre
  for (const r of rings) {
    if (r.cool > 0) continue;
    const a = _v1.subVectors(prevPos, r.p).dot(r.n), b = _v2.subVectors(player.pos, r.p).dot(r.n);
    if ((a < 0) !== (b < 0) && player.pos.distanceTo(r.p) < 6.2) {
      r.cool = 8; r.flash = 1; player.burst = 26; game.rings++; ach.ringSet.add(rings.indexOf(r)); Sound.ring(); game.shake = 0.5;
      emit(r.p, 60, { color: 0x6ff2d2, speed: 16, life: 1.1, size: 1.0, spread: player.fwd.clone().multiplyScalar(20) });
    }
  }
  prevPos.copy(player.pos);
  // whales sing when you fly close
  for (const W of whales) {
    W.songCool -= dt;
    const d = W.m.position.distanceTo(player.pos);
    if (d < 45 * W.scale + 30 && W.songCool <= 0) { W.songCool = 16 + rand() * 8; ach.whaleSet.add(whales.indexOf(W)); Sound.whale(clamp(1.4 - d / 120, 0.3, 1)); }
  }
  game.bumpCool -= dt;
  if (player.bump) { if (game.bumpCool <= 0) { ach.bumps++; Sound.bump(); game.shake = 0.4; game.bumpCool = 0.5; } player.bump = 0; }
  Sound.wind(clamp((player.speed - 12) / 32, 0, 1));
  trackAch(dt);
}

// ================= input =================
const keys = new Set();
let joyId = null, joyO = { x: 0, y: 0 }, touchBoost = new Set(), mouseBoost = false;
const joyEl = $('joy'), knob = joyEl.querySelector('b');
if (isTouch) { $('pzKeys').innerHTML = '<dt>拖曳畫面</dt><dd>控制方向</dd><dt>加速鈕</dt><dd>加速</dd><dt>右上角 ❙❙</dt><dd>暫停或繼續</dd>'; }
if (isTouch) { document.body.classList.add('touch'); $('ctrlNote').textContent = '手指拖曳畫面控制方向，按住右下角按鈕加速。建議開啟聲音，戴耳機更好。'; $('hint').textContent = '拖曳畫面控制方向 · 按住「加速」衝刺'; }
function syncBoost() { input.boost = mouseBoost || touchBoost.size > 0 || keys.has('Space') || keys.has('ShiftLeft') || keys.has('ShiftRight'); }
canvas.addEventListener('pointerdown', (e) => {
  if (game.phase === 'title' || paused) return;
  if (e.pointerType === 'mouse') { if (e.button === 0) { mouseBoost = true; syncBoost(); } return; }
  if (joyId === null) { joyId = e.pointerId; joyO = { x: e.clientX, y: e.clientY }; joyEl.style.display = 'block'; joyEl.style.left = e.clientX + 'px'; joyEl.style.top = e.clientY + 'px'; knob.style.transform = ''; }
  else { touchBoost.add(e.pointerId); syncBoost(); }
});
addEventListener('pointermove', (e) => {
  if (game.phase === 'title') return;
  if (e.pointerType === 'mouse') {
    const dz = (v) => Math.abs(v) < 0.05 ? 0 : clamp((v - Math.sign(v) * 0.05) * 1.35, -1, 1);
    input.x = dz(e.clientX / innerWidth * 2 - 1); input.y = dz(-(e.clientY / innerHeight * 2 - 1));
  } else if (e.pointerId === joyId) {
    let dx = e.clientX - joyO.x, dy = e.clientY - joyO.y; const l = Math.hypot(dx, dy), m = 50;
    if (l > m) { dx *= m / l; dy *= m / l; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    input.x = dx / m; input.y = -dy / m;
  }
});
const release = (e) => {
  if (e.pointerType === 'mouse') { mouseBoost = false; syncBoost(); return; }
  if (e.pointerId === joyId) { joyId = null; input.x = 0; input.y = 0; joyEl.style.display = 'none'; }
  touchBoost.delete(e.pointerId); syncBoost();
};
addEventListener('pointerup', release); addEventListener('pointercancel', release);
document.addEventListener('mouseleave', () => { input.x *= 0.3; input.y *= 0.3; });
const boostBtn = $('boostBtn');
boostBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); touchBoost.add('btn'); syncBoost(); });
['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => boostBtn.addEventListener(ev, () => { touchBoost.delete('btn'); syncBoost(); }));
addEventListener('keydown', (e) => {
  if (e.code === 'KeyM') return toggleMute();
  if (e.code === 'KeyP' || e.code === 'Escape') { e.preventDefault(); return setPaused(!paused); }
  if (paused) return;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code) && (e.target === document.body || e.target === canvas)) e.preventDefault();
  keys.add(e.code); syncBoost();
});
addEventListener('keyup', (e) => { keys.delete(e.code); syncBoost(); });
addEventListener('blur', () => { keys.clear(); mouseBoost = false; touchBoost.clear(); syncBoost(); });
function keyboardSteer(dt) {
  const kx = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
  const ky = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
  if (kx || ky || game.kbd) { game.kbd = !!(kx || ky); input.x = damp(input.x, kx, 6, dt); input.y = damp(input.y, ky * 0.9, 6, dt); }
}

function toggleMute() { const m = Sound.toggleMute(); $('muteWave').style.display = m ? 'none' : ''; }
$('muteBtn').addEventListener('click', toggleMute);

// ---- pause ----
let paused = false;
function setPaused(on) {
  if (game.phase === 'title' || on === paused) return;
  paused = on;
  $('pause').classList.toggle('on', on); document.body.classList.toggle('paused', on);
  $('pauseBtn').setAttribute('aria-label', on ? '繼續' : '暫停');
  Sound.pause(on);
  keys.clear(); mouseBoost = false; touchBoost.clear(); joyId = null; joyEl.style.display = 'none'; syncBoost();
  if (on) $('resumeBtn').focus({ preventScroll: true });
  else { input.x = input.y = 0; last = performance.now(); canvas.focus({ preventScroll: true }); }
}
$('pauseBtn').addEventListener('click', () => setPaused(!paused));
$('resumeBtn').addEventListener('click', () => setPaused(false));
$('restartBtn').addEventListener('click', () => { setPaused(false); resetGame(); toast('星嶼', '再一次，把光帶回天空'); });
document.addEventListener('visibilitychange', () => { if (document.hidden) setPaused(true); });
$('fsBtn').addEventListener('click', () => { const d = document.documentElement; if (!document.fullscreenElement) d.requestFullscreen?.().catch(() => {}); else document.exitFullscreen?.().catch(() => {}); });
$('startBtn').addEventListener('click', () => {
  Sound.init();
  $('title').classList.add('gone'); $('hud').classList.add('on');
  resetGame();
  cam.pos.copy(camera.position); cam.look.set(0, 20, 0);
  game.phase = 'play'; game.introT = 0;
  document.body.classList.add('playing');
  canvas.focus({ preventScroll: true });
  after(1.2, () => toast('星嶼', '跟著金色的星光飛吧'));
  after(9, () => $('hint').classList.add('gone'));
});
$('freeBtn').addEventListener('click', () => { $('ending').classList.remove('on'); $('hud').classList.add('on'); game.phase = 'free'; canvas.focus({ preventScroll: true }); });
$('againBtn').addEventListener('click', () => { resetGame(); toast('星嶼', '再一次，把光帶回天空'); });

// ================= main loop =================
let last = performance.now(), firstFrame = true;
function frame(now) {
  requestAnimationFrame(frame);
  if (paused) { last = now; return; }
  const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000)); last = now;
  const t = (G.time.value += dt);
  for (let i = timers.length - 1; i >= 0; i--) if (timers[i].at <= t) { const f = timers[i].fn; timers.splice(i, 1); f(); }

  if (game.phase !== 'title') {
    keyboardSteer(dt);
    updatePlayer(dt, t);
    gameLogic(dt, t);
  }
  // islands wake up in a travelling wave of colour
  for (const isl of islands) {
    if (isl.state !== 'awake') continue;
    const ta = t - isl.awakeClock;
    isl.U.awake.value = Math.min(ta * 26, 600);
    setIslandGrowth(isl, ta);
    (isl.falls || []).forEach(m => m.uniforms.uOn.value = clamp((ta - 1.5) * 0.5, 0, 1));
  }
  if (finale.on) {
    const ft = t - finale.t0;
    if (ft < 12) setTreeBloom(ft - 0.8);
    decorU.awake.value = Math.min(ft * 38, 2000);
    G.dawn.value = clamp((ft - 3) / 16, 0, 1) ** 1.2;
    game.auroraT = ft < 9 ? 1.1 : 0.4;
    if (ft > 1 && ft < 60 && rand() < 0.6) {
      const b = worldTree.blobs[Math.floor(rand() * worldTree.blobs.length)];
      emit(_v1.copy(b.p).add(centerIsle.center), 1, { color: rand() < 0.5 ? 0xffc4e4 : 0xffe9a8, speed: 1.5, life: 6, size: 0.9, drag: 0.4, grav: 0.8 });
    }
  }
  G.aurora.value = damp(G.aurora.value, game.auroraT, 0.6, dt);
  islands.forEach(isl => updateHeart(isl, dt, t));
  updateRings(t, dt); updateWhales(t, dt); updateLanterns(t, dt); updateSparks(dt); updateFireflies(t, dt);
  updateSeedVisuals(t);
  if (game.phase !== 'title') updateFollowers(t, dt);
  cloudGroup.rotation.y += dt * 0.004;

  // ---- camera ----
  if (game.phase === 'title') {
    const a = t * 0.045;
    camera.position.set(Math.cos(a) * 285, 92 + Math.sin(t * 0.2) * 12, Math.sin(a) * 285);
    camera.lookAt(0, 22, 0); camera.fov = 58;
    crane.visible = false;
  } else {
    crane.visible = true;
    game.introT += dt;
    const k = clamp(game.introT / 3, 0, 1);
    updateChaseCamera(dt * lerp(0.2, 1, k * k));
    cam.blend = damp(cam.blend, finale.cine ? 1 : 0, 0.9, dt);
    camera.position.copy(cam.pos); _v3.copy(cam.look);
    if (cam.blend > 0.001) {
      const a = (t - finale.t0) * 0.1 + Math.atan2(player.pos.z, player.pos.x) * 0 + 0.6;
      _v1.set(Math.cos(a) * 165, worldTree.top.y + 22, Math.sin(a) * 165);
      camera.position.lerp(_v1, cam.blend);
      _v3.lerp(_v2.copy(worldTree.base).add(V3(0, 36, 0)), cam.blend);
    }
    game.shake = Math.max(0, game.shake - dt * 2);
    if (game.shake > 0) camera.position.add(_v1.set(rand() - 0.5, rand() - 0.5, rand() - 0.5).multiplyScalar(game.shake * 0.9));
    camera.lookAt(_v3);
    camera.rotateZ(cam.roll * (1 - cam.blend));
    camera.fov = lerp(cam.fov, 55, cam.blend);
  }
  camera.updateProjectionMatrix();
  ribbons.forEach(r => r.update(camera.position));
  ribbons.forEach(r => r.mesh.visible = game.phase !== 'title');

  // ---- sky, dawn, lights ----
  const dawn = G.dawn.value;
  sky.position.copy(camera.position);
  sea.position.set(camera.position.x, SEA_Y, camera.position.z);
  G.sunDir.value.set(0.86, lerp(-0.12, 0.2, dawn), 0.5).normalize();
  hemi.color.lerpColors(HEMI_SKY_N, HEMI_SKY_D, dawn); hemi.groundColor.lerpColors(HEMI_GND_N, HEMI_GND_D, dawn);
  sunLight.color.lerpColors(SUN_N, SUN_D, dawn); sunLight.intensity = lerp(1.25, 2.6, dawn);
  sunLight.position.copy(_v1.copy(G.moonDir.value).lerp(G.sunDir.value, dawn).normalize().multiplyScalar(200));
  scene.fog.color.lerpColors(FOG_NIGHT, FOG_DAWN, dawn);
  bloom.strength = lerp(0.85, 0.55, dawn);
  PT_SCALE.value = renderer.domElement.height * 0.5 / Math.tan(camera.fov * Math.PI / 360);

  if (game.phase !== 'title') updateHUD();
  composer.render();
  if (firstFrame) { firstFrame = false; $('loading').classList.add('gone'); }
}
resetPlayer();
requestAnimationFrame(frame);
