
// ================= heart crystals (心燈) =================
const SEEDS_PER = 8;
const heartGeo = new THREE.OctahedronGeometry(2.3, 0).scale(1, 1.65, 1);
const beadGeo = new THREE.IcosahedronGeometry(0.42, 1);
const beamMat = (col) => new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  uniforms: { uTime: G.time, uOn: { value: 0 }, uCol: { value: new THREE.Color(col) } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform float uTime, uOn; uniform vec3 uCol; varying vec2 vUv;
    void main(){
      float a = pow(1.0 - vUv.y, 1.6) * (0.55 + 0.45 * sin(vUv.y * 60.0 - uTime * 7.0)) * uOn;
      a *= 0.5 + 0.5 * pow(abs(sin(vUv.x * 3.14159 * 2.0)), 0.5);
      gl_FragColor = vec4(uCol * a * 1.8, a);
    }`,
});
function makeHeart(isl, n) {
  const mat = new THREE.MeshStandardMaterial({ color: 0x1a1d3a, emissive: new THREE.Color(0x3a4ab0), emissiveIntensity: 0.7, flatShading: true, roughness: 0.25 });
  const mesh = new THREE.Mesh(heartGeo, mat); mesh.position.copy(isl.heart); scene.add(mesh);
  const beads = new THREE.InstancedMesh(beadGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }), n);
  beads.frustumCulled = false; scene.add(beads);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 3.2, 480, 20, 1, true).translate(0, 240, 0), beamMat(0xffd98a));
  beam.position.copy(isl.heart); beam.visible = false; scene.add(beam);
  isl.hm = { mesh, mat, beads, beam, n, pulse: 0 };
}
islands.forEach(isl => makeHeart(isl, isl.idx < 0 ? 5 : SEEDS_PER));

const HEART_SLEEP = new THREE.Color(0x3a4ab0), HEART_READY = new THREE.Color(0xffc060);
function updateHeart(isl, dt, t) {
  const h = isl.hm;
  h.mesh.rotation.y += dt * (isl.state === 'ready' ? 2.2 : 0.6);
  h.mesh.position.y = isl.heart.y + Math.sin(t * 1.3 + isl.seed) * 0.6;
  h.pulse = Math.max(0, h.pulse - dt * 1.5);
  if (isl.state === 'sleep') { h.mat.emissive.copy(HEART_SLEEP); h.mat.emissiveIntensity = 0.6 + 0.25 * Math.sin(t * 2) + h.pulse * 3; }
  else if (isl.state === 'ready') { h.mat.emissive.copy(HEART_READY); h.mat.emissiveIntensity = 3.2 + 1.6 * Math.sin(t * 5) + h.pulse * 3; }
  else { h.mat.emissive.set(isl.def.crystal); h.mat.emissiveIntensity = 2.2 + 0.6 * Math.sin(t * 1.5); }
  h.beam.visible = isl.state === 'ready';
  h.beam.material.uniforms.uOn.value = damp(h.beam.material.uniforms.uOn.value, isl.state === 'ready' ? 1 : 0, 3, dt);
  const lit = isl.idx < 0 ? islands.filter(i => i.idx >= 0 && i.state === 'awake').length : isl.collected;
  const fade = isl.state === 'awake' ? Math.max(0, 1 - (t - isl.awakeClock) * 0.5) : 1;
  for (let i = 0; i < h.n; i++) {
    const a = i / h.n * TAU + t * 0.8;
    _v1.set(Math.cos(a) * 4.6, Math.sin(t * 2 + i) * 0.4, Math.sin(a) * 4.6).add(h.mesh.position);
    const s = (i < lit ? 1.25 : 0.8) * fade + 0.0001;
    _m1.compose(_v1, _q1.identity(), _v2.set(s, s, s));
    h.beads.setMatrixAt(i, _m1);
    if (isl.idx < 0 && i < lit) h.beads.setColorAt(i, _c1.set(ISLE_DEFS[i].crystal).multiplyScalar(3));
    else h.beads.setColorAt(i, i < lit ? _c1.setRGB(3, 2.2, 1.0) : _c1.setRGB(0.18, 0.2, 0.42));
  }
  h.beads.instanceMatrix.needsUpdate = true; h.beads.instanceColor.needsUpdate = true;
}

// ================= waterfalls =================
function makeWaterfall(isl, seg, col) {
  const H = 150, W = 4.2;
  const geo = new THREE.PlaneGeometry(W, H, 1, 24);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const f = H / 2 - p.getY(i);
    p.setZ(i, f * 0.12 + f * f * 0.0022);
    p.setX(i, p.getX(i) * (1 + f * 0.012));
  }
  geo.translate(0, -H / 2, 0);
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uTime: G.time, uOn: { value: 0 }, uCol: { value: new THREE.Color(col) } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform float uTime, uOn; uniform vec3 uCol; varying vec2 vUv;
      ${GLSL_NOISE}
      void main(){
        float edge = smoothstep(0.0, 0.3, vUv.x) * smoothstep(1.0, 0.7, vUv.x);
        float s = n3(vec3(vUv.x * 12.0, vUv.y * 9.0 + uTime * 2.4, 0.0)) * 0.6 + n3(vec3(vUv.x * 28.0, vUv.y * 22.0 + uTime * 4.0, 5.0)) * 0.4;
        float a = edge * smoothstep(0.0, 0.45, vUv.y) * smoothstep(1.0, 0.97, vUv.y) * (0.25 + s * 0.95) * uOn;
        gl_FragColor = vec4(uCol * a * 1.5, a);
      }`,
  });
  const m = new THREE.Mesh(geo, mat);
  const a = (seg + 0.5) / isl.segs * TAU, r = isl.edge[seg] + 0.2;
  m.position.set(Math.cos(a) * r, 0.2, Math.sin(a) * r);
  m.rotation.y = Math.PI / 2 - a;
  isl.group.add(m);
  (isl.falls ||= []).push(mat);
  (isl.fallMeshes ||= []).push(m);
}
islands.forEach(isl => {
  const n = isl.idx < 0 ? 3 : 2;
  for (let k = 0; k < n; k++) makeWaterfall(isl, Math.floor((k / n + 0.13 * isl.seed % 1) * isl.segs) % isl.segs, 0xcff4ff);
});

// ================= the World Tree =================
const worldTree = { blobs: [], bloomT: -1 };
{
  const parts = [];
  const up = V3(0, 1, 0);
  const limb = (a, b, r1, r2, radial = 7) => {
    const len = a.distanceTo(b);
    const g = new THREE.CylinderGeometry(r2, r1, len * 1.04, radial, 1).translate(0, len / 2, 0);
    g.applyQuaternion(_q1.setFromUnitVectors(up, _v1.subVectors(b, a).normalize()));
    g.translate(a.x, a.y, a.z);
    parts.push(g);
  };
  const trunk = [];
  for (let i = 0; i <= 8; i++) trunk.push(V3(Math.sin(i * 0.8) * 1.6, i * 5.2, Math.cos(i * 0.55) * 1.4));
  for (let i = 0; i < 8; i++) limb(trunk[i], trunk[i + 1], lerp(6, 1.6, i / 8), lerp(6, 1.6, (i + 1) / 8), 9);
  for (let i = 0; i < 7; i++) {
    const a = i / 7 * TAU + 0.4;
    limb(V3(Math.cos(a) * 2, 3, Math.sin(a) * 2), V3(Math.cos(a) * 11, -1.5, Math.sin(a) * 11), 2.4, 0.5, 6);
  }
  const tips = [];
  for (let i = 0; i < 9; i++) {
    const a = i / 9 * TAU + rr(-0.2, 0.2), h0 = rr(20, 36);
    let p = trunk[Math.round(h0 / 5.2)].clone(), r = lerp(2.4, 1.2, h0 / 40);
    const dir = V3(Math.cos(a), rr(0.35, 0.8), Math.sin(a)).normalize();
    for (let k = 0; k < 3; k++) {
      const q = p.clone().addScaledVector(dir, rr(5.5, 7.5));
      limb(p, q, r, r * 0.62, 6); p = q; r *= 0.62;
      dir.y += 0.25; dir.normalize();
    }
    tips.push(p);
  }
  tips.push(trunk[8].clone().add(V3(0, 3, 0)));
  const geo = mergeGeos(parts);
  const base = V3(0, islandHeight(centerIsle, 0, 0) - 1.5, 0);
  const trunkMesh = new THREE.Mesh(geo, awakeMat({ color: 0x8a6a5a }, centerIsle.U, 0.05));
  trunkMesh.position.copy(base); centerIsle.group.add(trunkMesh);
  // canopy blobs clustered around each branch tip
  const blobGeo = new THREE.IcosahedronGeometry(1, 1);
  const pts = [];
  tips.forEach(tp => { for (let k = 0; k < 9; k++) pts.push(tp.clone().add(V3(rr(-6, 6), rr(-2.5, 4.5), rr(-6, 6)))); });
  const canopy = new THREE.InstancedMesh(blobGeo, awakeMat({ color: 0xffffff, roughness: 0.6 }, centerIsle.U, 0.45), pts.length);
  canopy.frustumCulled = false;
  pts.forEach((p, i) => {
    worldTree.blobs.push({ p: p.add(base), s: rr(2.6, 4.6), d: p.y + rr(0, 6) });
    canopy.setColorAt(i, _c1.set(CENTER_DEF.leaf[i % 3]));
  });
  centerIsle.group.add(canopy);
  worldTree.canopy = canopy; worldTree.base = base.clone().add(centerIsle.center);
  worldTree.top = V3(0, 50, 0).add(worldTree.base);
}
function setTreeBloom(t) {
  worldTree.blobs.forEach((b, i) => {
    const k = t < 0 ? 0 : easeOutElastic(clamp((t - b.d * 0.05) / 2.2, 0, 1));
    const s = b.s * lerp(0.28, 1, k);
    _m1.compose(b.p, _q1.identity(), _v2.set(s, s * 0.85, s));
    worldTree.canopy.setMatrixAt(i, _m1);
  });
  worldTree.canopy.instanceMatrix.needsUpdate = true;
}
setTreeBloom(-1);
