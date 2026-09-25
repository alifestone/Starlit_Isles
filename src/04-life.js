
// ================= glowing point sprites (sparks, fireflies, halos) =================
const PT_SCALE = { value: 400 };
function makePoints(count, sizeMul = 1) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3), col = new Float32Array(count * 3), size = new Float32Array(count);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('acol', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('asize', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uScale: PT_SCALE, uMul: { value: sizeMul } },
    vertexShader: `attribute float asize; attribute vec3 acol; varying vec3 vC; uniform float uScale, uMul;
      void main(){ vC = acol; vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = min(asize * uMul * uScale / max(-mv.z, 0.5), 256.0); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying vec3 vC; void main(){ float r = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, r); a = a * a * 0.55 + smoothstep(0.14, 0.0, r) * 0.9;
        gl_FragColor = vec4(vC * a, a); }`,
  });
  const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; scene.add(pts);
  return {
    pts, pos, col, size, count,
    flush() { geo.attributes.position.needsUpdate = true; geo.attributes.acol.needsUpdate = true; geo.attributes.asize.needsUpdate = true; },
  };
}

// ---- spark particles ----
const SPARK_N = lowPower ? 1400 : 2600;
const sparks = makePoints(SPARK_N);
const spk = { v: new Float32Array(SPARK_N * 3), life: new Float32Array(SPARK_N), max: new Float32Array(SPARK_N), base: new Float32Array(SPARK_N * 3), sz: new Float32Array(SPARK_N), drag: new Float32Array(SPARK_N), grav: new Float32Array(SPARK_N), cursor: 0 };
function emit(p, n, { color = 0xffd98a, speed = 10, life = 1.2, size = 0.8, drag = 1.5, grav = 0, spread = null, jitter = 0.2 } = {}) {
  const c = _c1.set(color);
  for (let k = 0; k < n; k++) {
    const i = spk.cursor; spk.cursor = (spk.cursor + 1) % SPARK_N;
    sparks.pos[i * 3] = p.x; sparks.pos[i * 3 + 1] = p.y; sparks.pos[i * 3 + 2] = p.z;
    let x = rand() * 2 - 1, y = rand() * 2 - 1, z = rand() * 2 - 1; const l = Math.hypot(x, y, z) || 1;
    const sp = speed * (0.35 + rand() * 0.65);
    if (spread) { spk.v[i * 3] = spread.x + x / l * sp; spk.v[i * 3 + 1] = spread.y + y / l * sp; spk.v[i * 3 + 2] = spread.z + z / l * sp; }
    else { spk.v[i * 3] = x / l * sp; spk.v[i * 3 + 1] = y / l * sp; spk.v[i * 3 + 2] = z / l * sp; }
    spk.life[i] = spk.max[i] = life * (0.6 + rand() * 0.8);
    const j = 1 + (rand() - 0.5) * jitter * 2;
    spk.base[i * 3] = c.r * j; spk.base[i * 3 + 1] = c.g * j; spk.base[i * 3 + 2] = c.b * j;
    spk.sz[i] = size * (0.6 + rand() * 0.8); spk.drag[i] = drag; spk.grav[i] = grav;
  }
}
function updateSparks(dt) {
  const P = sparks.pos, C = sparks.col, S = sparks.size;
  for (let i = 0; i < SPARK_N; i++) {
    if (spk.life[i] <= 0) { if (S[i] !== 0) S[i] = 0; continue; }
    spk.life[i] -= dt;
    const d = Math.exp(-spk.drag[i] * dt);
    spk.v[i * 3] *= d; spk.v[i * 3 + 1] = spk.v[i * 3 + 1] * d - spk.grav[i] * dt; spk.v[i * 3 + 2] *= d;
    P[i * 3] += spk.v[i * 3] * dt; P[i * 3 + 1] += spk.v[i * 3 + 1] * dt; P[i * 3 + 2] += spk.v[i * 3 + 2] * dt;
    const k = Math.max(0, spk.life[i] / spk.max[i]), b = k * (1.5 + Math.sin(i + spk.life[i] * 30) * 0.4);
    C[i * 3] = spk.base[i * 3] * b; C[i * 3 + 1] = spk.base[i * 3 + 1] * b; C[i * 3 + 2] = spk.base[i * 3 + 2] * b;
    S[i] = spk.sz[i] * (0.4 + 0.6 * k);
  }
  sparks.flush();
}

// ---- fireflies ----
const FF_N = lowPower ? 320 : 600;
const fireflies = makePoints(FF_N);
const ffData = [];
for (let i = 0; i < FF_N; i++) {
  const isl = i < FF_N * 0.85 ? islands[i % islands.length] : null;
  const a = rand() * TAU, r = isl ? Math.sqrt(rand()) * (isl.R + 14) : rr(40, 420);
  const home = isl ? V3(Math.cos(a) * r, islandHeight(isl, 0, 0) + rr(1.5, isl.idx < 0 ? 40 : 18), Math.sin(a) * r).add(isl.center) : V3(Math.cos(a) * r, rr(-40, 110), Math.sin(a) * r);
  ffData.push({ home, isl, ph: rand() * 100, sp: rr(0.3, 0.9), amp: rr(1.5, 4), b: 0 });
}
function updateFireflies(t, dt) {
  for (let i = 0; i < FF_N; i++) {
    const f = ffData[i];
    const awake = f.isl ? f.isl.state === 'awake' : finale.on;
    f.b = damp(f.b, awake ? 1 : 0.18, 1.2, dt);
    const tt = t * f.sp + f.ph;
    fireflies.pos[i * 3] = f.home.x + Math.sin(tt) * f.amp + Math.sin(tt * 2.3) * 0.8;
    fireflies.pos[i * 3 + 1] = f.home.y + Math.sin(tt * 1.3 + 1) * f.amp * 0.5;
    fireflies.pos[i * 3 + 2] = f.home.z + Math.cos(tt * 0.9) * f.amp;
    const blink = 0.55 + 0.45 * Math.sin(tt * 4.0);
    _c1.set(f.isl ? f.isl.def.crystal : 0xfff0b0).lerp(_c2.setRGB(0.8, 1, 0.55), 0.4);
    const b = f.b * blink * 1.8;
    fireflies.col[i * 3] = _c1.r * b; fireflies.col[i * 3 + 1] = _c1.g * b; fireflies.col[i * 3 + 2] = _c1.b * b;
    fireflies.size[i] = 0.45 + f.b * 0.35;
  }
  fireflies.flush();
}
const _c2 = new THREE.Color();

// ================= low-poly clouds =================
const cloudGroup = new THREE.Group(); scene.add(cloudGroup);
{
  const puffs = [];
  for (let c = 0; c < (lowPower ? 22 : 34); c++) {
    const a = rand() * TAU, r = rr(70, 560);
    const cen = V3(Math.cos(a) * r, rr(-35, 115), Math.sin(a) * r);
    if (islands.some(is => cen.distanceTo(is.center) < is.R + 22)) continue;
    const n = 4 + Math.floor(rand() * 5), ang = rand() * TAU;
    for (let k = 0; k < n; k++) {
      const off = (k - n / 2) * rr(3.5, 5.5);
      puffs.push({ p: cen.clone().add(V3(Math.cos(ang) * off, rr(-1, 2), Math.sin(ang) * off + rr(-2, 2))), s: rr(3.5, 8.5) * (1 - Math.abs(k - n / 2) / n * 0.8) });
    }
  }
  const mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ color: 0xcfc8ff, emissive: 0x1c1846, flatShading: true, roughness: 1 }), puffs.length);
  puffs.forEach((p, i) => { _m1.compose(p.p, _q1.setFromEuler(new THREE.Euler(rand(), rand(), rand())), _v1.set(p.s * 1.25, p.s * 0.7, p.s)); mesh.setMatrixAt(i, _m1); });
  mesh.frustumCulled = false;
  cloudGroup.add(mesh);
}

// ================= sky lanterns (天燈) =================
const LANTERN_MAX = 460;
const lanternMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.62, 0.42, 1.15, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false }), LANTERN_MAX);
lanternMesh.frustumCulled = false; scene.add(lanternMesh);
const lanterns = [];
for (let i = 0; i < LANTERN_MAX; i++) {
  lanterns.push({ p: V3(), v: 0, ph: rand() * TAU, alive: false });
  _m1.makeScale(0, 0, 0); lanternMesh.setMatrixAt(i, _m1);
  lanternMesh.setColorAt(i, _c1.setRGB(2.8, 1.15 + rand() * 0.35, 0.3 + rand() * 0.2));
}
let lanternCursor = 0;
function spawnLantern(p) {
  const L = lanterns[lanternCursor]; lanternCursor = (lanternCursor + 1) % LANTERN_MAX;
  L.p.copy(p); L.v = rr(2.2, 4.2); L.alive = true; L.age = 0;
}
function updateLanterns(t, dt) {
  for (let i = 0; i < LANTERN_MAX; i++) {
    const L = lanterns[i];
    if (!L.alive) continue;
    L.age += dt;
    L.p.y += L.v * dt; L.p.x += Math.sin(t * 0.35 + L.ph) * 0.6 * dt; L.p.z += Math.cos(t * 0.3 + L.ph) * 0.6 * dt;
    let s = Math.min(1, L.age * 1.5) * (0.95 + 0.08 * Math.sin(t * 6 + L.ph));
    if (L.p.y > 360) { L.alive = false; s = 0; }
    _m1.compose(L.p, _q1.setFromAxisAngle(_v1.set(0, 1, 0), L.ph + t * 0.2), _v2.set(s, s, s));
    lanternMesh.setMatrixAt(i, _m1);
  }
  lanternMesh.instanceMatrix.needsUpdate = true;
}

// ================= light rings (光環) =================
const rings = [];
{
  const ringGeo = new THREE.TorusGeometry(4.4, 0.3, 8, 44);
  const discGeo = new THREE.CircleGeometry(4.2, 32);
  const add = (p, look) => {
    const g = new THREE.Group(); g.position.copy(p); g.lookAt(look);
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.35, 2.4, 2.0), fog: false });
    const disc = new THREE.Mesh(discGeo, new THREE.MeshBasicMaterial({ color: 0x3ff2d0, transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    g.add(new THREE.Mesh(ringGeo, mat), disc); scene.add(g);
    rings.push({ g, mat, disc, p: p.clone(), n: _v1.subVectors(look, p).normalize().clone(), cool: 0, flash: 0 });
  };
  const outer = islands.filter(i => i.idx >= 0);
  outer.forEach((a, i) => {
    const b = outer[(i + 1) % outer.length];
    const A = a.center.clone().add(V3(0, 16, 0)), B = b.center.clone().add(V3(0, 16, 0));
    for (let k = 1; k <= 3; k++) {
      const t = 0.2 + k * 0.15;
      const p = A.clone().lerp(B, t); p.y += Math.sin(t * Math.PI) * 22;
      const q = A.clone().lerp(B, t + 0.02); q.y += Math.sin((t + 0.02) * Math.PI) * 22;
      add(p, q);
    }
  });
  for (let k = 0; k < 5; k++) {
    const a = k / 5 * TAU;
    const p = V3(Math.cos(a) * 100, 40 + Math.sin(a * 2) * 10, Math.sin(a) * 100);
    add(p, p.clone().add(V3(-Math.sin(a), 0, Math.cos(a))));
  }
}
function updateRings(t, dt) {
  for (const r of rings) {
    r.cool = Math.max(0, r.cool - dt); r.flash = Math.max(0, r.flash - dt * 1.4);
    const on = r.cool <= 0 ? 1 : 0.15;
    const s = 1 + r.flash * 0.8 + Math.sin(t * 2 + r.p.x) * 0.03;
    r.g.scale.setScalar(s);
    r.mat.color.setRGB(0.35 * on + r.flash * 2, 2.4 * on + r.flash * 1.5, 2.0 * on + r.flash * 0.5);
    r.disc.material.opacity = 0.07 * on + r.flash * 0.35;
  }
}

// ================= sky whales (天鯨) =================
const whales = [];
{
  const prof = [[0, -12], [0.6, -10], [1.3, -7], [2.3, -4], [3.2, -1], [3.8, 2], [3.9, 5], [3.4, 8], [2.4, 10.4], [1.1, 11.7], [0, 12.1]].map(([r, y]) => new THREE.Vector2(r, y));
  const body = new THREE.LatheGeometry(prof, 16).rotateX(Math.PI / 2).scale(1, 0.8, 1);
  const tri = (arr) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3)); return g; };
  const flukes = tri([0, 0, -10.5, 5.8, 0.5, -14.8, 1.8, 0, -12.9, 0, 0, -10.5, -1.8, 0, -12.9, -5.8, 0.5, -14.8, 0, 0, -10.5, 1.8, 0, -12.9, -1.8, 0, -12.9]);
  const fins = tri([3.1, -1.2, 4.2, 9.2, -3.4, 0.4, 3.3, -1.5, 0.6, -3.1, -1.2, 4.2, -3.3, -1.5, 0.6, -9.2, -3.4, 0.4]);
  const geo = mergeGeos([body, flukes, fins]);
  const mk = (R, h, w, ph, scale, glowCol) => {
    const uni = { uPhase: { value: ph }, uGlow: { value: 0.6 }, uGlowCol: { value: new THREE.Color(glowCol) } };
    const mat = new THREE.MeshStandardMaterial({ color: 0x2c3c8e, roughness: 0.65, flatShading: true, side: THREE.DoubleSide });
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, uni, { uTime: G.time });
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime, uPhase; varying vec3 vL;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vL = position;
          float bend = smoothstep(4.0, -15.0, position.z);
          transformed.y += sin(position.z * 0.2 - uTime * 1.3 + uPhase) * 1.9 * bend;
          transformed.y += sin(uTime * 0.9 + uPhase) * smoothstep(1.0, 9.5, abs(position.x)) * 1.2;`);
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uGlow, uTime; uniform vec3 uGlowCol; varying vec3 vL;')
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          float side = abs(vL.x);
          vec2 g = vec2(fract(vL.z * 0.42) - 0.5, (side - 2.6) * 1.2 + vL.y * 0.4);
          float dots = smoothstep(0.32, 0.06, length(g)) * step(-8.5, vL.z) * step(vL.z, 9.0);
          float belly = smoothstep(-1.2, -3.0, vL.y) * (0.5 + 0.5 * sin(vL.z * 2.4)) * 0.4;
          float pulse = 0.7 + 0.3 * sin(uTime * 2.0 - vL.z * 0.4);
          totalEmissiveRadiance += uGlowCol * (dots * 2.8 + belly) * uGlow * pulse;`);
    };
    const m = new THREE.Mesh(geo, mat); m.scale.setScalar(scale); scene.add(m);
    whales.push({ m, R, h, w, a: ph, uni, scale, songCool: 3 + rand() * 5 });
  };
  mk(300, 78, 0.022, 0.0, 1.6, 0x6ff2ff);
  mk(300, 70, 0.022, 0.0, 0.62, 0xa7f5ff);
  mk(380, 42, -0.016, 2.4, 1.9, 0xc59cff);
  whales[1].follow = whales[0];
}
function updateWhales(t, dt) {
  for (const W of whales) {
    W.a += W.w * dt;
    let px, py, pz, a = W.a;
    const R = W.follow ? W.R - 16 : W.R, hh = W.follow ? W.h - 6 : W.h;
    if (W.follow) a = W.follow.a - 0.03 * Math.sign(W.w);
    px = Math.cos(a) * R; pz = Math.sin(a) * R; py = hh + Math.sin(a * 3) * 10;
    W.m.position.set(px, py, pz);
    const a2 = a + 0.05 * Math.sign(W.w);
    _v1.set(Math.cos(a2) * R, hh + Math.sin(a2 * 3) * 10, Math.sin(a2) * R);
    W.m.lookAt(_v1);
    W.uni.uGlow.value = damp(W.uni.uGlow.value, finale.on ? 1.6 : 0.6, 0.5, dt);
  }
}
