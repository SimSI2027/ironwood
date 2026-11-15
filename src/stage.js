// The studio: dark charcoal room, RoomEnvironment PMREM, soft key from upper left, cool rim,
// soft contact shadow on a faint glossy floor, ACES, brass hover outline, subtle vignette.
import * as THREE from 'three';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {OutlinePass} from 'three/addons/postprocessing/OutlinePass.js';
import {ShaderPass} from 'three/addons/postprocessing/ShaderPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import {GTAOPass} from 'three/addons/postprocessing/GTAOPass.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import {Reflector} from 'three/addons/objects/Reflector.js';

// ACES crushes the toe: #15161a would land at ~#060609 on screen. This pre-tonemap value lands
// near the CSS charcoal (#15161a-#1b1c21) once tone mapped.
export const BG = 0x272a30;
export const FLOOR_Y = -32;

const Vignette = {
  uniforms: {tDiffuse: {value: null}, uAmount: {value: 0.42}, uAspect: {value: 1}},
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uAmount; uniform float uAspect; varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      // half-float overflow (Inf) on the sharpest speculars would tone-map to black specks
      if (any(isnan(c))) c = vec4(0.0, 0.0, 0.0, 1.0);
      c.rgb = min(c.rgb, vec3(64.0));
      vec2 d = (vUv - 0.5) * vec2(uAspect, 1.0);
      float r = length(d) / length(vec2(uAspect, 1.0) * 0.5);
      c.rgb *= 1.0 - uAmount * smoothstep(0.35, 1.05, r);
      gl_FragColor = c;
    }`,
};

// Bloom high-pass keyed to warm, saturated highlights: brass blooms, white steel and clearcoat
// specular does not, dark walnut never reaches the threshold.
const BRASS_HIGHPASS = `
  uniform sampler2D tDiffuse; uniform vec3 defaultColor; uniform float defaultOpacity;
  uniform float luminosityThreshold; uniform float smoothWidth; varying vec2 vUv;
  void main(){
    vec4 t = texture2D(tDiffuse, vUv);
    // a few NaN/Inf pixels in the HDR buffer are invisible on their own, but the blur would
    // smear them over the whole frame: drop them here
    if (any(isnan(t)) || any(isinf(t))) t = vec4(0.0);
    t.rgb = min(t.rgb, vec3(32.0));
    float l = dot(t.rgb, vec3(0.299, 0.587, 0.114));
    float warm = smoothstep(0.5, 0.8, (t.r - t.b) / max(t.r, 1e-4));
    float a = smoothstep(luminosityThreshold, luminosityThreshold + smoothWidth, l) * warm;
    gl_FragColor = mix(vec4(defaultColor, defaultOpacity), t, a);
  }`;

export function createStage(canvas) {
  // antialias on: the low tier draws straight to the canvas with no composer
  const renderer = new THREE.WebGLRenderer({canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: false});
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.VSMShadowMap;
  // the light never moves: re-render (and re-blur) the shadow only when a part moves (main.js)
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BG);
  scene.fog = new THREE.Fog(BG, 320, 900);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.95;

  const camera = new THREE.PerspectiveCamera(30, 1, 1, 2500);

  // key: soft, upper left, slightly warm
  const key = new THREE.DirectionalLight(0xfff0dd, 3.0);
  key.position.set(-70, 120, 85);
  key.target.position.set(-10, -14, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, {left: -110, right: 110, top: 70, bottom: -70, near: 20, far: 400});
  key.shadow.radius = 22;
  key.shadow.blurSamples = 24;
  key.shadow.bias = -0.0006;
  key.shadow.normalBias = 0.04;
  scene.add(key, key.target);
  // cool rim from behind
  const rim = new THREE.DirectionalLight(0x9cb8ff, 3.2);
  rim.position.set(90, 55, -130);
  scene.add(rim);
  // low fill so the shadow side keeps its form
  const fill = new THREE.HemisphereLight(0xa9b4c6, 0x0c0c0e, 0.35);
  scene.add(fill);
  const under = new THREE.DirectionalLight(0xffe6c8, 0.35);
  under.position.set(30, -60, 90);
  scene.add(under);

  // dark floor that melts into the background: a faint, slightly blurred planar reflection
  // (high tier only), plus a separate catcher for the soft contact shadow
  const floorGeo = new THREE.CircleGeometry(700, 96);
  const floorU = {uBg: {value: new THREE.Color(BG)}, uBase: {value: new THREE.Color(0x30333a)}, uStrength: {value: 0.07}, uR: {value: new THREE.Vector2(60, 560)}};
  const floorR = new Reflector(floorGeo, {
      textureWidth: 1024,
      textureHeight: 1024,
      clipBias: 0.003,
      shader: {
        name: 'IronwoodFloor',
        uniforms: {color: {value: null}, tDiffuse: {value: null}, textureMatrix: {value: null}, ...floorU},
        vertexShader: `uniform mat4 textureMatrix; varying vec4 vRefl; varying vec3 vW;
          void main(){ vRefl = textureMatrix * vec4(position, 1.0); vW = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: `uniform sampler2D tDiffuse; uniform vec3 uBg; uniform vec3 uBase; uniform float uStrength; uniform vec2 uR; varying vec4 vRefl; varying vec3 vW;
          void main(){
            vec2 uv = vRefl.xy / vRefl.w; vec2 px = 1.5 / vec2(textureSize(tDiffuse, 0));
            vec3 r = (texture2D(tDiffuse, uv).rgb * 2.0 + texture2D(tDiffuse, uv + px).rgb + texture2D(tDiffuse, uv - px).rgb
              + texture2D(tDiffuse, uv + vec2(px.x, -px.y)).rgb + texture2D(tDiffuse, uv + vec2(-px.x, px.y)).rgb) / 6.0;
            float fade = 1.0 - smoothstep(uR.x, uR.y, length(vW.xz));
            gl_FragColor = vec4(mix(uBg, uBase + r * uStrength * fade, fade), 1.0);
          }`,
      },
    });
  const floorP = new THREE.Mesh(
      floorGeo,
      new THREE.ShaderMaterial({
        uniforms: floorU,
        vertexShader: 'varying vec3 vW; void main(){ vW = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: 'uniform vec3 uBg; uniform vec3 uBase; uniform vec2 uR; varying vec3 vW; void main(){ gl_FragColor = vec4(mix(uBg, uBase, 1.0 - smoothstep(uR.x, uR.y, length(vW.xz))), 1.0); }',
      }),
    );
  for (const f of [floorR, floorP]) {
    f.rotation.x = -Math.PI / 2;
    f.position.y = FLOOR_Y;
    scene.add(f);
  }
  const catcher = new THREE.Mesh(new THREE.CircleGeometry(260, 64), new THREE.ShadowMaterial({color: 0x050506, opacity: 0.55, depthWrite: false}));
  catcher.rotation.x = -Math.PI / 2;
  catcher.position.y = FLOOR_Y + 0.05;
  catcher.receiveShadow = true;
  scene.add(catcher);

  const target = new THREE.WebGLRenderTarget(4, 4, {type: THREE.HalfFloatType, samples: 4});
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  // SSAO (GTAO) on the gun only: the floors are hidden from its normal/depth pass, which also
  // keeps the Reflector from re-rendering the scene a second time inside it
  const ao = new GTAOPass(scene, camera, 4, 4);
  ao.updateGtaoMaterial({radius: 1.4, distanceExponent: 1.4, thickness: 1.5, scale: 1.0, samples: 16});
  ao.updatePdMaterial({lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16});
  ao.blendIntensity = 0.8;
  const aoRender = ao.render.bind(ao);
  ao.render = (...args) => {
    floorR.visible = floorP.visible = catcher.visible = false;
    aoRender(...args);
    showFloors();
  };
  composer.addPass(ao);
  const bloom = new UnrealBloomPass(new THREE.Vector2(4, 4), 0.55, 0.45, 0.5);
  bloom.highPassUniforms.smoothWidth.value = 0.5;
  bloom.materialHighPassFilter.fragmentShader = BRASS_HIGHPASS;
  bloom.materialHighPassFilter.needsUpdate = true;
  composer.addPass(bloom);
  const outline = new OutlinePass(new THREE.Vector2(4, 4), scene, camera);
  outline.visibleEdgeColor.set(0xe2b65c);
  outline.hiddenEdgeColor.set(0x6b5222);
  outline.edgeStrength = 4.5;
  outline.edgeThickness = 1.2;
  outline.edgeGlow = 0.0;
  composer.addPass(outline);
  const vig = new ShaderPass(Vignette);
  composer.addPass(vig);
  composer.addPass(new OutputPass());

  const size = {w: 1, h: 1};
  const resize = () => {
    const w = canvas.clientWidth || innerWidth;
    const h = canvas.clientHeight || innerHeight;
    const pr = Math.min(devicePixelRatio || 1, S.tier === 'low' ? 1.5 : 2);
    hullMat.uniforms.uK.value = (1.8 * 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) / h; // ~1.8 px
    size.w = w;
    size.h = h;
    renderer.setPixelRatio(pr);
    renderer.setSize(w, h, false);
    composer.setPixelRatio(pr);
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    vig.uniforms.uAspect.value = w / h;
  };
  const v = new THREE.Vector3();
  const project = (p) => {
    v.copy(p).project(camera);
    return {x: (v.x * 0.5 + 0.5) * size.w, y: (-v.y * 0.5 + 0.5) * size.h, visible: v.z < 1};
  };
  // --- low tier: no post. Vignette becomes a CSS overlay, the hover outline an inverted hull.
  const vigEl = document.createElement('div');
  vigEl.className = 'iw-vig';
  canvas.after(vigEl);
  const hullMat = new THREE.ShaderMaterial({
    uniforms: {uK: {value: 0.002}, uC: {value: new THREE.Color(0xe2b65c)}},
    vertexShader: `uniform float uK; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0);
      mv.xyz += normalize(normalMatrix * normal) * uK * -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: 'uniform vec3 uC; void main(){ gl_FragColor = vec4(uC, 1.0);\n#include <colorspace_fragment>\n}',
    side: THREE.BackSide,
  });
  const hulls = [];
  let sel = null;
  const select = (h) => {
    sel = h;
    outline.selectedObjects = h && S.tier === 'high' ? [h] : [];
    hulls.forEach((m) => m.removeFromParent());
    hulls.length = 0;
    if (!h || S.tier === 'high') return;
    const ms = [];
    h.traverse((o) => o.isMesh && ms.push(o));
    for (const o of ms) {
      const m = new THREE.Mesh(o.geometry, hullMat);
      m.raycast = () => {};
      o.add(m);
      hulls.push(m);
    }
  };
  function showFloors() {
    floorR.visible = S.tier === 'high';
    floorP.visible = !floorR.visible;
    catcher.visible = true;
  }
  /** high: 4096 shadow, GTAO, brass bloom, outline pass, DPR <= 2. low: 1024 shadow, no post, DPR <= 1.5. */
  const setTier = (t) => {
    S.tier = t;
    const hi = t === 'high';
    key.shadow.mapSize.set(hi ? 4096 : 1024, hi ? 4096 : 1024);
    key.shadow.radius = hi ? 40 : 22; // texels: ~2 world units of blur on high, ~5 on low
    key.shadow.blurSamples = hi ? 20 : 24;
    key.shadow.map?.dispose();
    key.shadow.mapPass?.dispose();
    key.shadow.map = key.shadow.mapPass = null;
    renderer.shadowMap.needsUpdate = true;
    showFloors();
    vigEl.classList.toggle('on', !hi);
    resize();
    select(sel);
  };
  const S = {THREE, renderer, scene, camera, composer, outline, size, resize, project, select, setTier, tier: 'high'};
  S.render = () => (S.tier === 'high' ? composer.render() : renderer.render(scene, camera));
  return S;
}
