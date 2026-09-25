
// ================= the paper crane =================
function triGeo(arr) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3)); g.computeVertexNormals(); return g; }
const crane = new THREE.Group(); scene.add(crane);
const craneModel = new THREE.Group(); craneModel.scale.setScalar(1.45); crane.add(craneModel);
const paperMat = new THREE.MeshStandardMaterial({ color: 0xfff3e2, emissive: 0xffb467, emissiveIntensity: 0.32, flatShading: true, side: THREE.DoubleSide, roughness: 0.55 });
{
  const F = [0, 0, -0.55], B = [0, 0, 0.5], T = [0, 0.32, 0], D = [0, -0.28, 0.05], L = [-0.2, 0, 0], R = [0.2, 0, 0];
  const n1 = [-0.07, 0.02, -0.38], n2 = [0.07, 0.02, -0.38], n3 = [0, -0.12, -0.42], N = [0, 0.62, -1.25], H = [0, 0.5, -1.55], Hb = [0, 0.55, -1.2];
  const t1 = [-0.07, 0.02, 0.38], t2 = [0.07, 0.02, 0.38], t3 = [0, -0.12, 0.42], TT = [0, 0.74, 1.3];
  const tris = [T, L, F, T, F, R, T, R, B, T, B, L, D, F, L, D, R, F, D, B, R, D, L, B,
    n1, n2, N, n2, n3, N, n3, n1, N, [-0.05, 0.62, -1.25], [0.05, 0.62, -1.25], H, [-0.05, 0.62, -1.25], Hb, H,
    t1, t2, TT, t2, t3, TT, t3, t1, TT];
  craneModel.add(new THREE.Mesh(triGeo(tris.flat()), paperMat));
}
const wingR = new THREE.Group(), wingL = new THREE.Group();
{
  const rf = [0, 0, -0.3], rb = [0, 0, 0.42], cr = [0.9, 0.14, -0.05], tip = [1.95, 0.25, 0.36];
  const right = [rf, cr, rb, cr, tip, rb].flat();
  const left = right.map((v, i) => i % 3 === 0 ? -v : v);
  wingR.add(new THREE.Mesh(triGeo(right), paperMat)); wingL.add(new THREE.Mesh(triGeo(left), paperMat));
  wingR.position.set(0.12, 0.12, 0); wingL.position.set(-0.12, 0.12, 0);
  craneModel.add(wingR, wingL);
}
const craneLight = new THREE.PointLight(0xffc98a, 90, 75, 1.5);
crane.add(craneLight);

// ================= wingtip ribbons =================
class Ribbon {
  constructor(n, width, col) {
    this.n = n; this.w = width; this.pts = Array.from({ length: n }, () => V3()); this.ready = false;
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(n * 6); this.al = new Float32Array(n * 2);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('alpha', new THREE.BufferAttribute(this.al, 1).setUsage(THREE.DynamicDrawUsage));
    const idx = []; for (let i = 0; i < n - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    geo.setIndex(idx);
    this.uOp = { value: 1 };
    this.mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uCol: { value: new THREE.Color(col) }, uOp: this.uOp },
      vertexShader: `attribute float alpha; varying float vA; void main(){ vA = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform vec3 uCol; uniform float uOp; varying float vA; void main(){ gl_FragColor = vec4(uCol * vA * uOp, vA * uOp); }`,
    }));
    this.mesh.frustumCulled = false; scene.add(this.mesh);
    this.geo = geo;
  }
  push(p) {
    if (!this.ready) { this.pts.forEach(q => q.copy(p)); this.ready = true; }
    const last = this.pts.pop(); last.copy(p); this.pts.unshift(last);
  }
  update(camPos) {
    const n = this.n;
    for (let i = 0; i < n; i++) {
      const p = this.pts[i], a = this.pts[Math.max(0, i - 1)], b = this.pts[Math.min(n - 1, i + 1)];
      _v1.subVectors(a, b); _v2.subVectors(camPos, p);
      _v3.crossVectors(_v1, _v2); const l = _v3.length();
      if (l > 1e-6) _v3.multiplyScalar(this.w * (1 - i / n) / l); else _v3.set(0, 0, 0);
      this.pos.set([p.x + _v3.x, p.y + _v3.y, p.z + _v3.z, p.x - _v3.x, p.y - _v3.y, p.z - _v3.z], i * 6);
      const al = Math.pow(1 - i / n, 1.6);
      this.al[i * 2] = this.al[i * 2 + 1] = al;
    }
    this.geo.attributes.position.needsUpdate = true; this.geo.attributes.alpha.needsUpdate = true;
  }
}
const ribbons = [new Ribbon(46, 0.09, 0xffc98a), new Ribbon(46, 0.09, 0xffc98a), new Ribbon(70, 0.32, 0xff9ec0)];
ribbons[0].uOp.value = ribbons[1].uOp.value = 0.75;

// ================= player state & flight =================
const player = { pos: V3(), yaw: 0, pitch: 0, roll: 0, speed: 18, boost: 0, burst: 0, flap: 0, fwd: V3(0, 0, -1), hist: [], histT: 0, bump: 0 };
const input = { x: 0, y: 0, boost: false, auto: null };
const BASE_SPEED = 18;

function resetPlayer() {
  const i0 = islands[0];
  const dir = i0.center.clone().setY(0).normalize();
  player.pos.copy(dir).multiplyScalar(OUTER_R - 105).setY(i0.center.y + 22);
  player.yaw = Math.atan2(-dir.x, -dir.z);
  player.pitch = 0; player.roll = 0; player.speed = BASE_SPEED; player.hist.length = 0;
  ribbons.forEach(r => r.ready = false);
}

const _e = new THREE.Euler(0, 0, 0, 'YXZ');
function updatePlayer(dt, t) {
  const ramp = clamp(((game.introT || 0) - 1.2) / 2.5, 0, 1);
  let sx = input.x * ramp, sy = input.y * ramp;
  if (input.auto) { const a = input.auto(); sx = a.x; sy = a.y; }
  // soft world boundary: turn back toward the archipelago
  const hd = Math.hypot(player.pos.x, player.pos.z);
  if (hd > 470) {
    const want = Math.atan2(player.pos.x, player.pos.z);
    let diff = ((want - player.yaw + Math.PI) % TAU + TAU) % TAU - Math.PI;
    sx = clamp(-diff * 1.5, -1, 1) * clamp((hd - 470) / 40, 0, 1) + sx * (1 - clamp((hd - 470) / 40, 0, 1));
  }
  player.yaw -= sx * 1.45 * dt;
  let tp = sy * 0.9;
  if (player.pos.y < SEA_Y + 18) tp = Math.max(tp, 0.45 * clamp((SEA_Y + 18 - player.pos.y) / 8, 0, 1));
  if (player.pos.y > 210) tp = Math.min(tp, -0.3);
  player.pitch = damp(player.pitch, tp, 3.2, dt);
  player.roll = damp(player.roll, -sx * 0.8, 4, dt);
  player.boost = damp(player.boost, input.boost ? 1 : 0, 3, dt);
  player.burst = Math.max(0, player.burst - dt * 12);
  const target = BASE_SPEED + player.boost * 16 + player.burst - Math.sin(player.pitch) * 6;
  player.speed = damp(player.speed, target, 2.2, dt);
  _e.set(player.pitch, player.yaw, 0, 'YXZ');
  _q1.setFromEuler(_e);
  player.fwd.set(0, 0, -1).applyQuaternion(_q1);
  player.pos.addScaledVector(player.fwd, player.speed * dt);
  collideWorld();
  crane.position.copy(player.pos);
  _e.set(player.pitch, player.yaw, player.roll, 'YXZ');
  crane.quaternion.setFromEuler(_e);
  // wing flap: glide when diving, beat hard when climbing or boosting
  const effort = clamp(0.45 + player.pitch * 1.2 + player.boost * 0.6, 0.08, 1.2);
  player.flap += dt * (4 + effort * 8);
  const ang = Math.sin(player.flap) * 0.62 * effort + 0.12;
  wingR.rotation.z = ang; wingL.rotation.z = -ang;
  craneModel.position.y = -Math.sin(player.flap) * 0.08 * effort;
  // trail history (for followers)
  player.histT += dt;
  if (player.histT > 0.04) { player.histT = 0; player.hist.unshift(player.pos.clone()); if (player.hist.length > 240) player.hist.pop(); }
  // ribbons from wingtips
  crane.updateMatrixWorld(true);
  ribbons[0].push(_v1.set(2.0, 0.25, 0.36).applyMatrix4(wingR.matrixWorld));
  ribbons[1].push(_v1.set(-2.0, 0.25, 0.36).applyMatrix4(wingL.matrixWorld));
  ribbons[2].push(_v1.set(0, 0.8, 1.3).applyMatrix4(craneModel.matrixWorld));
  ribbons[2].uOp.value = damp(ribbons[2].uOp.value, 0.15 + player.boost * 0.6 + player.burst * 0.02, 4, dt);
}

function collideWorld() {
  const p = player.pos;
  for (const isl of islands) {
    const lx = p.x - isl.center.x, ly = p.y - isl.center.y, lz = p.z - isl.center.z;
    const r = Math.hypot(lx, lz);
    if (r > isl.R * 1.18) continue;
    const top = r < isl.R * 0.95 ? islandHeight(isl, lx, lz) : 0;
    const bottom = -isl.R * 1.35 * Math.max(0, 1 - r / (isl.R * 1.12));
    if (ly < top + 1.6 && ly > bottom - 1) {
      if (ly > -3) { p.y = isl.center.y + top + 1.6; player.pitch = Math.max(player.pitch, 0.22); }
      else { const k = (isl.R * 1.14) / Math.max(r, 0.01); p.x = isl.center.x + lx * k; p.z = isl.center.z + lz * k; player.bump = 1; }
    }
  }
  // world-tree trunk
  const c = centerIsle.center, tx = p.x - c.x, tz = p.z - c.z, tr = Math.hypot(tx, tz);
  if (tr < 7.5 && p.y < c.y + 46) { const k = 7.5 / Math.max(tr, 0.01); p.x = c.x + tx * k; p.z = c.z + tz * k; player.bump = 1; }
}

// ================= camera =================
const cam = { pos: V3(), look: V3(), roll: 0, fov: 62, mode: 'title', blend: 0, orbit: 0 };
function updateChaseCamera(dt) {
  _v1.copy(player.pos).addScaledVector(player.fwd, -10.5).add(_v2.set(0, 3.4, 0));
  _v3.copy(player.pos).addScaledVector(player.fwd, 9);
  if (_v1.y < SEA_Y + 4) _v1.y = SEA_Y + 4;
  cam.pos.lerp(_v1, 1 - Math.exp(-dt * 5));
  cam.look.lerp(_v3, 1 - Math.exp(-dt * 7));
  cam.roll = damp(cam.roll, player.roll * 0.35, 3, dt);
  cam.fov = damp(cam.fov, 62 + player.boost * 14 + Math.min(player.burst, 30) * 0.4, 3, dt);
}

// ================= followers: collected light that trails the crane =================
const FOL_MAX = 72;
const folPts = makePoints(FOL_MAX + 1);
const followers = [];
function addFollower(from, tag) { if (followers.length < FOL_MAX) followers.push({ p: from.clone(), tag, mode: 'follow', ph: rand() * TAU, target: null, cb: null }); }
function deliverFollowers(tag, target, onArrive) {
  let k = 0;
  followers.forEach(f => { if (f.mode === 'follow' && (tag === 'all' || f.tag === tag)) { f.mode = 'deliver'; f.target = target; f.delay = k++ * 0.08; f.cb = onArrive; } });
  return k;
}
function updateFollowers(t, dt) {
  const H = player.hist;
  let slot = 0;
  for (let i = followers.length - 1; i >= 0; i--) {
    const f = followers[i];
    if (f.mode === 'follow') {
      const hp = H[Math.min(H.length - 1, 3 + slot * 2)] || player.pos;
      slot++;
      _v1.set(Math.sin(t * 2.2 + f.ph) * 1.4, Math.cos(t * 1.7 + f.ph) * 1.0, Math.cos(t * 2.2 + f.ph) * 1.4).add(hp);
      f.p.lerp(_v1, 1 - Math.exp(-dt * 5));
    } else {
      f.delay -= dt;
      if (f.delay < 0) {
        _v1.subVectors(f.target, f.p); const d = _v1.length();
        f.p.addScaledVector(_v1, Math.min(1, dt * 3.2 + 24 * dt / Math.max(d, 1)));
        if (d < 1.2) { emit(f.p, 6, { color: 0xffe0a0, speed: 8, life: 0.6, size: 0.7 }); if (f.cb) f.cb(); followers.splice(i, 1); }
      }
    }
  }
  // index 0 is the crane's own halo
  folPts.pos.set([player.pos.x, player.pos.y + 0.2, player.pos.z], 0);
  folPts.col.set([0.9, 0.62, 0.35], 0); folPts.size[0] = 1.6 + player.boost * 1.2;
  for (let i = 0; i < FOL_MAX; i++) {
    const j = i + 1, f = followers[i];
    if (!f) { folPts.size[j] = 0; continue; }
    folPts.pos[j * 3] = f.p.x; folPts.pos[j * 3 + 1] = f.p.y; folPts.pos[j * 3 + 2] = f.p.z;
    const tw = 1.4 + Math.sin(t * 6 + f.ph) * 0.5;
    folPts.col[j * 3] = 2.0 * tw; folPts.col[j * 3 + 1] = 1.5 * tw; folPts.col[j * 3 + 2] = 0.6 * tw;
    folPts.size[j] = 1.0;
  }
  folPts.flush();
}

// ================= star seeds (星種) =================
const seeds = [];
function addSeed(p, isl) { seeds.push({ p: p.clone(), home: p.clone(), isl, alive: true, ph: rand() * TAU, pull: 0 }); }
islands.filter(i => i.idx >= 0).forEach(isl => {
  const top = isl.center.y + islandHeight(isl, 0, 0);
  const toC = Math.atan2(-isl.center.z, -isl.center.x);
  const dir = isl.idx % 2 ? 1 : -1;
  for (let k = 0; k < SEEDS_PER; k++) {
    const t = k / (SEEDS_PER - 1);
    const a = toC + dir * t * Math.PI * 1.55;
    const r = lerp(isl.R + 12, isl.R * 0.72, t);
    const lx = Math.cos(a) * r, lz = Math.sin(a) * r;
    const ground = r < isl.R * 0.95 ? isl.center.y + islandHeight(isl, lx, lz) : -1e3;
    addSeed(V3(isl.center.x + lx, Math.max(top + 4 + t * 9 + Math.sin(t * Math.PI) * 4, ground + 6), isl.center.z + lz), isl);
  }
});
const BONUS = { idx: -2 };
function layStarterSeeds() {
  const i0 = islands[0];
  const A = player.pos.clone(), B = i0.center.clone().add(V3(0, 12, 0));
  const side = V3(-(B.z - A.z), 0, B.x - A.x).normalize();
  for (let k = 1; k <= 6; k++) {
    const t = k / 8;
    addSeed(A.clone().lerp(B, t).addScaledVector(side, Math.sin(t * Math.PI * 2) * 6).add(V3(0, Math.sin(t * Math.PI) * 5, 0)), BONUS);
  }
}
const seedMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.55, 1), new THREE.MeshBasicMaterial({ color: new THREE.Color(3.4, 2.5, 1.1), fog: false }), 80);
seedMesh.frustumCulled = false; scene.add(seedMesh);
const seedHalo = makePoints(80);
function updateSeedVisuals(t) {
  for (let i = 0; i < 80; i++) {
    const s = seeds[i];
    if (!s || !s.alive) { _m1.makeScale(0, 0, 0); seedMesh.setMatrixAt(i, _m1); seedHalo.size[i] = 0; continue; }
    const sc = 1 + Math.sin(t * 4 + s.ph) * 0.15;
    _m1.compose(s.p, _q1.setFromEuler(_e.set(t + s.ph, t * 1.3, 0)), _v2.set(sc, sc, sc));
    seedMesh.setMatrixAt(i, _m1);
    seedHalo.pos.set([s.p.x, s.p.y, s.p.z], i * 3);
    seedHalo.col.set([1.6, 1.1, 0.45], i * 3);
    seedHalo.size[i] = 4.2 * sc;
  }
  seedMesh.instanceMatrix.needsUpdate = true; seedHalo.flush();
}
