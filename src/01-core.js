import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// ================= utilities =================
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (a, b, l, dt) => lerp(a, b, 1 - Math.exp(-l * dt));
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const rand = mulberry32(20260925);
const rr = (a, b) => a + (b - a) * rand();
function hash2(x, y) { const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return h - Math.floor(h); }
function noise2(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  return lerp(lerp(hash2(xi, yi), hash2(xi + 1, yi), u), lerp(hash2(xi, yi + 1), hash2(xi + 1, yi + 1), u), v);
}
function fbm2(x, y) { let s = 0, a = 0.5, f = 1; for (let i = 0; i < 4; i++) { s += a * noise2(x * f, y * f); f *= 2.03; a *= 0.5; } return s; }
function easeOutElastic(x) { const c4 = TAU / 3; return x <= 0 ? 0 : x >= 1 ? 1 : Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * c4) + 1; }
function easeOutBack(x) { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); }
const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const _v1 = V3(), _v2 = V3(), _v3 = V3(), _q1 = new THREE.Quaternion(), _m1 = new THREE.Matrix4(), _c1 = new THREE.Color();

const GLSL_NOISE = /* glsl */`
float h13(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.yzx + 33.33); return fract((p.x + p.y) * p.z); }
float n3(vec3 p){ vec3 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(h13(i),h13(i+vec3(1,0,0)),f.x),mix(h13(i+vec3(0,1,0)),h13(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(h13(i+vec3(0,0,1)),h13(i+vec3(1,0,1)),f.x),mix(h13(i+vec3(0,1,1)),h13(i+vec3(1,1,1)),f.x),f.y),f.z); }
float fbm3(vec3 p){ float s = 0.0, a = 0.5; for(int i = 0; i < 5; i++){ s += a * n3(p); p *= 2.02; a *= 0.5; } return s; }
`;

// ================= renderer / scene =================
const canvas = document.getElementById('c');
const isTouch = matchMedia('(pointer: coarse)').matches;
const lowPower = isTouch || (navigator.hardwareConcurrency || 8) <= 4;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, lowPower ? 1.25 : 1.6));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.3, 4000);
camera.position.set(0, 120, 320);
const FOG_NIGHT = new THREE.Color(0x221a4e), FOG_DAWN = new THREE.Color(0xe8a890);
scene.fog = new THREE.FogExp2(FOG_NIGHT.clone(), 0.0019);

// global shared uniforms
const G = {
  time: { value: 0 },
  dawn: { value: 0 },
  aurora: { value: 0.12 },
  moonDir: { value: V3(-0.42, 0.42, -0.8).normalize() },
  sunDir: { value: V3(0.86, -0.12, 0.5).normalize() },
  fogCol: { value: scene.fog.color },
  cam: { value: camera.position },
};

// ================= composer (bloom) =================
const rt = new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType, samples: lowPower ? 0 : 4 });
const composer = new EffectComposer(renderer, rt);
composer.setPixelRatio(renderer.getPixelRatio());
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.85, 0.55, 0.82);
composer.addPass(bloom);
composer.addPass(new OutputPass());

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight);
});

// ================= lights =================
const hemi = new THREE.HemisphereLight(0x7a82e0, 0x2a1840, 0.95);
scene.add(hemi);
const sunLight = new THREE.DirectionalLight(0xaab8ff, 1.25);
sunLight.position.copy(G.moonDir.value).multiplyScalar(200);
scene.add(sunLight);
const HEMI_SKY_N = new THREE.Color(0x7a82e0), HEMI_SKY_D = new THREE.Color(0xffd6bc);
const HEMI_GND_N = new THREE.Color(0x2a1840), HEMI_GND_D = new THREE.Color(0x7a5a86);
const SUN_N = new THREE.Color(0xaab8ff), SUN_D = new THREE.Color(0xffc48a);

// ================= sky dome =================
const sky = new THREE.Mesh(
  new THREE.SphereGeometry(1800, 48, 24),
  new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uTime: G.time, uDawn: G.dawn, uAurora: G.aurora, uMoonDir: G.moonDir, uSunDir: G.sunDir },
    vertexShader: /* glsl */`varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform float uTime, uDawn, uAurora; uniform vec3 uMoonDir, uSunDir; varying vec3 vDir;
      ${GLSL_NOISE}
      void main(){
        vec3 d = normalize(vDir); float h = d.y;
        vec3 night = mix(vec3(0.24,0.12,0.36), vec3(0.05,0.035,0.15), smoothstep(0.0, 0.25, h));
        night = mix(night, vec3(0.008,0.012,0.05), smoothstep(0.2, 0.85, h));
        night = mix(night, vec3(0.09,0.05,0.2), smoothstep(0.0, -0.3, h));
        vec3 dawn = mix(vec3(1.0,0.6,0.42), vec3(0.62,0.6,0.86), smoothstep(0.0, 0.3, h));
        dawn = mix(dawn, vec3(0.17,0.32,0.66), smoothstep(0.25, 0.9, h));
        dawn = mix(dawn, vec3(0.8,0.52,0.56), smoothstep(0.0, -0.3, h));
        vec3 col = mix(night, dawn, uDawn);
        float sd = max(dot(d, uSunDir), 0.0);
        col += uDawn * (vec3(1.0,0.5,0.22) * pow(sd, 6.0) * 0.7 + vec3(1.0,0.85,0.55) * smoothstep(0.9985, 0.9992, sd) * 8.0);
        float md = max(dot(d, uMoonDir), 0.0);
        float disk = smoothstep(0.99925, 0.9995, md);
        float crater = fbm3(d * 90.0);
        col += (1.0 - uDawn * 0.85) * (vec3(0.95,0.95,1.0) * disk * (2.6 - crater * 1.6)
             + vec3(0.4,0.45,0.9) * pow(md, 90.0) * 0.5 + vec3(0.3,0.22,0.6) * pow(md, 7.0) * 0.14);
        vec3 sp = d * 380.0; vec3 ci = floor(sp); vec3 cf = fract(sp) - 0.5;
        float r = h13(ci);
        if (r > 0.982) {
          vec3 off = vec3(h13(ci + 1.7), h13(ci + 3.1), h13(ci + 5.3)) - 0.5;
          float dd = length(cf - off * 0.6);
          float tw = 0.55 + 0.45 * sin(uTime * (1.2 + r * 5.0) + r * 300.0);
          float s = smoothstep(0.22, 0.0, dd) * tw * (r - 0.982) * 55.0;
          s *= smoothstep(-0.02, 0.18, h) * (1.0 - uDawn);
          col += mix(vec3(0.7,0.8,1.0), vec3(1.0,0.85,0.62), h13(ci + 9.0)) * s * 2.4;
        }
        float band = exp(-pow(dot(d, normalize(vec3(0.3, 0.55, -0.78))) * 3.0, 2.0));
        col += vec3(0.28,0.18,0.5) * band * fbm3(d * 7.0) * 0.5 * (1.0 - uDawn) * smoothstep(0.0, 0.3, h);
        if (h > 0.02) {
          vec2 ap = d.xz / (h + 0.3);
          float a = 0.0;
          for (int i = 0; i < 3; i++) {
            float fi = float(i);
            float w = sin(ap.x * 1.1 + fi * 1.9 + uTime * 0.06 + fbm3(vec3(ap * 0.7, uTime * 0.04 + fi)) * 3.0);
            float cur = smoothstep(0.4, 0.0, abs(-ap.y - w * 0.5 - 0.8 - fi * 0.45));
            a += cur * (0.35 + 0.65 * fbm3(vec3(ap.x * 5.0, ap.y * 0.4, uTime * 0.25 + fi)));
          }
          vec3 ac = mix(vec3(0.15,1.0,0.7), vec3(0.65,0.3,1.0), smoothstep(0.12, 0.6, h));
          col += ac * a * uAurora * smoothstep(0.02, 0.25, h) * (1.0 - uDawn * 0.75) * 0.65;
        }
        gl_FragColor = vec4(col, 1.0);
      }`,
  })
);
sky.renderOrder = -10;
scene.add(sky);

// ================= sea of clouds =================
const SEA_Y = -70;
const seaMat = new THREE.ShaderMaterial({
  fog: false,
  uniforms: { uTime: G.time, uDawn: G.dawn, uFogCol: G.fogCol, uCam: G.cam, uMoonDir: G.moonDir, uSunDir: G.sunDir },
  vertexShader: /* glsl */`varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
  fragmentShader: /* glsl */`
    uniform float uTime, uDawn; uniform vec3 uFogCol, uCam, uMoonDir, uSunDir; varying vec3 vW;
    ${GLSL_NOISE}
    void main(){
      vec3 p = vec3(vW.xz * 0.0065, uTime * 0.012);
      float n = fbm3(p + vec3(uTime * 0.004, 0.0, 0.0));
      float n2 = fbm3(p * 2.6 + vec3(0.0, uTime * 0.01, 3.0));
      float c = smoothstep(0.3, 0.85, n * 0.75 + n2 * 0.45);
      vec3 lo = mix(vec3(0.05,0.04,0.16), vec3(0.62,0.4,0.5), uDawn);
      vec3 hi = mix(vec3(0.36,0.33,0.7), vec3(1.0,0.8,0.72), uDawn);
      vec3 col = mix(lo, hi, c);
      vec3 v = normalize(vW - uCam);
      vec3 rf = reflect(v, vec3(0.0, 1.0, 0.0));
      vec3 ld = normalize(mix(uMoonDir, uSunDir, uDawn));
      col += mix(vec3(0.5,0.55,1.0), vec3(1.0,0.7,0.4), uDawn) * pow(max(dot(rf, ld), 0.0), 24.0) * (0.25 + c * 0.6);
      float dist = length(vW.xz - uCam.xz);
      col = mix(col, uFogCol, clamp(1.0 - exp(-dist * 0.0014), 0.0, 1.0));
      gl_FragColor = vec4(col, 1.0);
    }`,
});
const sea = new THREE.Mesh(new THREE.PlaneGeometry(5000, 5000, 1, 1).rotateX(-Math.PI / 2), seaMat);
sea.position.y = SEA_Y;
sea.renderOrder = -9;
scene.add(sea);
