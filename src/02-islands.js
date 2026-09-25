
// ================= "awakening" material: grey-blue until the wave of colour passes =================
function awakeMat(opts, U, glow = 0) {
  const m = new THREE.MeshStandardMaterial(Object.assign({ flatShading: true, roughness: 0.88, metalness: 0 }, opts));
  const uGlow = { value: glow };
  m.userData.glow = uGlow;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uAwake = U.awake; sh.uniforms.uCenter = U.center; sh.uniforms.uGlow = uGlow;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vAW;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        vec4 aw = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          aw = instanceMatrix * aw;
        #endif
        vAW = (modelMatrix * aw).xyz;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vAW; uniform float uAwake, uGlow; uniform vec3 uCenter;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        float adist = length(vAW - uCenter);
        float awk = smoothstep(uAwake, uAwake - 12.0, adist);
        float lum = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
        diffuseColor.rgb = mix(vec3(lum) * vec3(0.46, 0.5, 0.82) * 0.8, diffuseColor.rgb, awk);
        float front = smoothstep(6.0, 0.0, abs(adist - uAwake + 4.0)) * step(0.5, uAwake);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += vec3(1.0, 0.72, 0.38) * front * 2.4 + diffuseColor.rgb * uGlow * awk;`);
  };
  return m;
}

function mergeGeos(list) {
  const arrs = list.map(g => (g.index ? g.toNonIndexed() : g).attributes.position.array);
  const out = new Float32Array(arrs.reduce((n, a) => n + a.length, 0));
  let o = 0; for (const a of arrs) { out.set(a, o); o += a.length; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(out, 3)); g.computeVertexNormals();
  return g;
}

// shared prop geometries
const GEO = {
  trunk: new THREE.CylinderGeometry(0.22, 0.42, 3.2, 5).translate(0, 1.6, 0),
  blob: mergeGeos([
    new THREE.IcosahedronGeometry(1.7, 0).translate(0, 3.9, 0),
    new THREE.IcosahedronGeometry(1.15, 0).translate(0.95, 4.7, 0.35),
    new THREE.IcosahedronGeometry(1.0, 0).translate(-0.85, 4.4, -0.5),
  ]),
  cone: mergeGeos([
    new THREE.ConeGeometry(1.9, 2.6, 6).translate(0, 3.3, 0),
    new THREE.ConeGeometry(1.45, 2.2, 6).translate(0, 4.6, 0),
    new THREE.ConeGeometry(0.95, 1.8, 6).translate(0, 5.8, 0),
  ]),
  flower: new THREE.IcosahedronGeometry(0.42, 0).scale(1, 0.7, 1),
  crystal: new THREE.OctahedronGeometry(0.8, 0).scale(0.6, 2.2, 0.6).translate(0, 1.3, 0),
};

// ================= island terrain =================
function islandHeight(isl, x, z) {
  const d = Math.min(Math.hypot(x, z) / isl.R, 1);
  const hill = Math.max(0, fbm2(x * 0.055 + isl.seed, z * 0.055 - isl.seed) - 0.38) * isl.R * 0.34;
  return hill * (1 - d * d * d) + 1.6 * (1 - d * d);
}

function buildIslandArrays(isl, pal, segs) {
  const R = isl.R, seed = isl.seed, TOP = 7, BOT = 7;
  const edge = [];
  for (let s = 0; s < segs; s++) { const a = s / segs * TAU; edge.push(R * (0.86 + 0.28 * noise2(Math.cos(a) * 1.8 + seed, Math.sin(a) * 1.8 - seed))); }
  const rings = [[V3(0, islandHeight(isl, 0, 0), 0)]];
  for (let r = 1; r <= TOP; r++) {
    const t = r / TOP, ring = [];
    for (let s = 0; s < segs; s++) {
      const a = (s + (r % 2) * 0.5) / segs * TAU, rad = edge[s] * t;
      const x = Math.cos(a) * rad, z = Math.sin(a) * rad;
      ring.push(V3(x, r === TOP ? -0.4 : islandHeight(isl, x, z), z));
    }
    rings.push(ring);
  }
  const depth = R * (1.2 + 0.3 * hash2(seed, 3));
  for (let k = 1; k <= BOT; k++) {
    const t = k / BOT, ring = [];
    for (let s = 0; s < segs; s++) {
      const a = (s + ((TOP + k) % 2) * 0.5) / segs * TAU;
      const jit = 0.78 + 0.44 * hash2(s * 3.1 + seed, k * 7.7);
      const rad = edge[s] * Math.pow(1 - t, 1.15) * (k === 1 ? 0.97 : jit);
      ring.push(V3(Math.cos(a) * rad, -depth * Math.pow(t, 0.95) - (k === 1 ? 1.2 : hash2(s + seed, k) * R * 0.12), Math.sin(a) * rad));
    }
    rings.push(ring);
  }
  rings.push([V3(0, -depth * 1.25, 0)]);

  const pos = [], col = [];
  const O = V3(0, -depth * 0.3, 0), n = V3(), e1 = V3(), e2 = V3(), cen = V3();
  const grass = new THREE.Color(pal.grass), grass2 = new THREE.Color(pal.grass2), soil = new THREE.Color(pal.soil), rock = new THREE.Color(pal.rock);
  const tri = (a, b, c, ringIdx) => {
    e1.subVectors(b, a); e2.subVectors(c, a); n.crossVectors(e1, e2);
    cen.copy(a).add(b).add(c).multiplyScalar(1 / 3);
    if (n.dot(_v1.subVectors(cen, O)) < 0) { const t = b; b = c; c = t; }
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    if (ringIdx < TOP) {
      _c1.copy(grass).lerp(grass2, clamp(noise2(cen.x * 0.12 + seed, cen.z * 0.12) * 1.4 - 0.2, 0, 1));
      _c1.offsetHSL(0, 0, (hash2(cen.x, cen.z) - 0.5) * 0.06 + clamp(cen.y * 0.012, 0, 0.1));
    } else {
      const t = clamp((ringIdx - TOP) / BOT, 0, 1);
      _c1.copy(soil).lerp(rock, Math.pow(t, 0.7));
      _c1.offsetHSL((hash2(cen.y, cen.x) - 0.5) * 0.03, 0, (hash2(cen.x * 1.3, cen.y) - 0.5) * 0.08 + (Math.sin(cen.y * 0.9) > 0.6 ? 0.04 : 0));
    }
    for (let i = 0; i < 3; i++) col.push(_c1.r, _c1.g, _c1.b);
  };
  for (let r = 0; r < rings.length - 1; r++) {
    const A = rings[r], B = rings[r + 1];
    if (A.length === 1) { for (let s = 0; s < segs; s++) tri(A[0], B[s], B[(s + 1) % segs], r); }
    else if (B.length === 1) { for (let s = 0; s < segs; s++) tri(A[s], A[(s + 1) % segs], B[0], r); }
    else for (let s = 0; s < segs; s++) {
      const s1 = (s + 1) % segs;
      tri(A[s], B[s], B[s1], r); tri(A[s], B[s1], A[s1], r);
    }
  }
  return { pos, col, edge };
}

function arraysToGeo(pos, col) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

// ================= island definitions =================
const ISLE_DEFS = [
  { name: '櫻之島', sub: '粉色的花雨回來了', grass: 0x86d46e, grass2: 0xc6e07a, soil: 0x7a5244, rock: 0x3a2e52, leaf: [0xffa6c9, 0xffc4dc, 0xff8fb8], flower: [0xffffff, 0xffd1e6, 0xff7fb0], crystal: 0xff9ecf, tree: 'blob', hud: '#ff9ec0' },
  { name: '楓之島', sub: '秋天的火焰點亮了', grass: 0xb9c85a, grass2: 0xe3b54f, soil: 0x7e4a36, rock: 0x3e2c46, leaf: [0xff6a3d, 0xffa53d, 0xff8b2e], flower: [0xffe066, 0xff9f43, 0xfff3b0], crystal: 0xffa04a, tree: 'blob', hud: '#ff8a3d' },
  { name: '螢之島', sub: '森林開始呼吸了', grass: 0x45c98f, grass2: 0x2fae86, soil: 0x4a5a58, rock: 0x223a4a, leaf: [0x2fd4b0, 0x49e8c8, 0x1fb8a6], flower: [0x9dfff0, 0x6fe8ff, 0xfaffc4], crystal: 0x5ff5e6, tree: 'cone', hud: '#5ff5e6' },
  { name: '紫苑之島', sub: '薰衣草的香氣飄起來了', grass: 0x92c97c, grass2: 0xa7b8e8, soil: 0x6a4a6e, rock: 0x2c2750, leaf: [0xb98cff, 0x9f7bff, 0xd4b4ff], flower: [0xc9a4ff, 0xffffff, 0x8f7bff], crystal: 0xb48cff, tree: 'cone', hud: '#b98cff' },
  { name: '金穗之島', sub: '麥浪在風裡唱歌', grass: 0xd8c85e, grass2: 0xf0dc7a, soil: 0x8a5e3a, rock: 0x4a3440, leaf: [0xffd24a, 0xffe27a, 0xffbf2e], flower: [0xfff4c2, 0xffcf5a, 0xff9e5e], crystal: 0xffe07a, tree: 'blob', hud: '#ffd24a' },
];
const CENTER_DEF = { name: '世界樹', sub: '', grass: 0x8fd67a, grass2: 0xbfe88a, soil: 0x7a5a48, rock: 0x3a3060, leaf: [0xffd6f0, 0xffe9a8, 0xfff2ff], flower: [0xffffff, 0xffe28a, 0xff9ec0], crystal: 0xfff0c0, tree: 'blob', hud: '#fff2c4' };

const islands = [];
function makeIsland(def, center, R, seed, idx) {
  const isl = { def, idx, R, seed, center: center.clone(), state: 'sleep', seeds: [], collected: 0, awakeT: -1, trees: [], flowers: [], crystals: [] };
  isl.U = { awake: { value: 0 }, center: { value: V3() } };
  const segs = lowPower ? 22 : 30;
  const { pos, col, edge } = buildIslandArrays(isl, def, segs);
  isl.edge = edge; isl.segs = segs;
  const g = new THREE.Group(); g.position.copy(center); scene.add(g); isl.group = g;
  const terrain = new THREE.Mesh(arraysToGeo(pos, col), awakeMat({ vertexColors: true }, isl.U));
  g.add(terrain); isl.terrain = terrain;
  const topY = islandHeight(isl, 0, 0);
  isl.heart = center.clone().add(V3(0, topY + (idx < 0 ? 64 : 10), 0));
  isl.U.center.value.copy(isl.heart);

  // scatter props on the grass
  const pts = [];
  const place = (count, maxR, minGap, tries = 400) => {
    const out = [];
    for (let i = 0; i < tries && out.length < count; i++) {
      const a = rand() * TAU, r = Math.sqrt(rand()) * maxR;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (idx < 0 && Math.hypot(x, z) < 14) continue;
      if (pts.some(p => Math.hypot(p.x - x, p.z - z) < minGap)) continue;
      const p = V3(x, islandHeight(isl, x, z) - 0.25, z); pts.push(p); out.push(p);
    }
    return out;
  };
  const treeGeo = def.tree === 'cone' ? GEO.cone : GEO.blob;
  const tp = place(Math.round(R * 0.95), R * 0.74, 3.6);
  const trunks = new THREE.InstancedMesh(GEO.trunk, awakeMat({ color: 0x70503e }, isl.U), tp.length);
  const leaves = new THREE.InstancedMesh(treeGeo, awakeMat({ color: 0xffffff }, isl.U, 0.12), tp.length);
  tp.forEach((p, i) => {
    isl.trees.push({ p, rot: rand() * TAU, s: 0.75 + rand() * 0.6, d: p.length() });
    leaves.setColorAt(i, _c1.set(def.leaf[i % def.leaf.length]).offsetHSL((rand() - 0.5) * 0.03, 0, (rand() - 0.5) * 0.08));
  });
  trunks.frustumCulled = leaves.frustumCulled = false;
  g.add(trunks, leaves); isl.trunks = trunks; isl.leaves = leaves;

  const fp = place(Math.round(R * 2), R * 0.84, 1.2);
  const flowers = new THREE.InstancedMesh(GEO.flower, awakeMat({ color: 0xffffff }, isl.U, 0.55), fp.length);
  fp.forEach((p, i) => { isl.flowers.push({ p, rot: rand() * TAU, s: 0.7 + rand() * 0.8, d: p.length() }); flowers.setColorAt(i, _c1.set(def.flower[i % def.flower.length])); });
  flowers.frustumCulled = false;
  g.add(flowers); isl.flowerMesh = flowers;

  const cp = place(7, R * 0.9, 2.5);
  const crystals = new THREE.InstancedMesh(GEO.crystal, awakeMat({ color: def.crystal, roughness: 0.3 }, isl.U, 1.4), cp.length);
  cp.forEach((p, i) => {
    const s = 0.8 + rand() * 1.1;
    isl.crystals.push({ p, s, d: p.length() });
    _m1.compose(p, _q1.setFromEuler(new THREE.Euler(rr(-0.3, 0.3), rand() * TAU, rr(-0.3, 0.3))), V3(s, s, s));
    crystals.setMatrixAt(i, _m1);
  });
  g.add(crystals);
  isl.growT = 0;
  setIslandGrowth(isl, 0, true);
  islands.push(isl);
  return isl;
}

// grow trees & flowers as the colour wave passes (t = seconds since awakening, -1 = asleep)
function setIslandGrowth(isl, t, force) {
  if (!force && (t < 0 || t > 12)) return;
  const wave = 26; // units per second
  isl.trees.forEach((tr, i) => {
    const k = t < 0 ? 0 : easeOutElastic(clamp((t - tr.d / wave) / 1.8, 0, 1));
    const s = tr.s * lerp(0.42, 1, k);
    _m1.compose(tr.p, _q1.setFromAxisAngle(_v1.set(0, 1, 0), tr.rot), _v2.set(s, s * lerp(0.7, 1, k), s));
    isl.trunks.setMatrixAt(i, _m1);
    _v3.set(s * lerp(0.35, 1, k), s * lerp(0.35, 1, k), s * lerp(0.35, 1, k));
    _m1.compose(tr.p, _q1, _v3);
    isl.leaves.setMatrixAt(i, _m1);
  });
  isl.flowers.forEach((f, i) => {
    const k = t < 0 ? 0 : easeOutBack(clamp((t - f.d / wave - 0.3) / 0.7, 0, 1));
    const s = Math.max(0.0001, f.s * k);
    _m1.compose(f.p, _q1.setFromAxisAngle(_v1.set(0, 1, 0), f.rot), _v2.set(s, s, s));
    isl.flowerMesh.setMatrixAt(i, _m1);
  });
  isl.trunks.instanceMatrix.needsUpdate = true; isl.leaves.instanceMatrix.needsUpdate = true; isl.flowerMesh.instanceMatrix.needsUpdate = true;
}

// ---- place the archipelago ----
const OUTER_R = 215;
ISLE_DEFS.forEach((def, i) => {
  const a = i / ISLE_DEFS.length * TAU + 0.35;
  const y = [14, -6, 26, 2, 18][i];
  makeIsland(def, V3(Math.cos(a) * OUTER_R, y, Math.sin(a) * OUTER_R), [30, 27, 33, 28, 31][i], 11 + i * 17, i);
});
const centerIsle = makeIsland(CENTER_DEF, V3(0, -4, 0), 50, 5, -1);

// ---- decorative rocks (awakened by the finale wave from the world tree) ----
const decorU = { awake: { value: 0 }, center: { value: V3(0, 40, 0) } };
{
  const P = [], C = [];
  const rocks = [];
  for (let i = 0; i < 34; i++) {
    let p;
    for (let k = 0; k < 40; k++) {
      const a = rand() * TAU, r = rr(80, 420);
      p = V3(Math.cos(a) * r, rr(-45, 90), Math.sin(a) * r);
      if (islands.every(is => p.distanceTo(is.center) > is.R + 28) && rocks.every(q => p.distanceTo(q) > 26)) break;
    }
    rocks.push(p);
    const fake = { R: rr(3, 9), seed: 100 + i * 7 };
    const pal = ISLE_DEFS[i % 5];
    const { pos, col } = buildIslandArrays(fake, pal, 12);
    for (let j = 0; j < pos.length; j += 3) { P.push(pos[j] + p.x, pos[j + 1] + p.y, pos[j + 2] + p.z); }
    C.push(...col);
  }
  const m = new THREE.Mesh(arraysToGeo(P, C), awakeMat({ vertexColors: true }, decorU));
  scene.add(m);
  var decorRocks = rocks;
}
