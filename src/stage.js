// The studio: dark charcoal room, RoomEnvironment PMREM, soft key from upper left, cool rim,
// soft contact shadow on a faint glossy floor, ACES, brass hover outline, subtle vignette.
import * as THREE from 'three';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {OutlinePass} from 'three/addons/postprocessing/OutlinePass.js';
import {ShaderPass} from 'three/addons/postprocessing/ShaderPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
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
      vec2 d = (vUv - 0.5) * vec2(uAspect, 1.0);
      float r = length(d) / length(vec2(uAspect, 1.0) * 0.5);
      c.rgb *= 1.0 - uAmount * smoothstep(0.35, 1.05, r);
      gl_FragColor = c;
    }`,
};

export function createStage(canvas) {
  const renderer = new THREE.WebGLRenderer({canvas, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: false});
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.VSMShadowMap;

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
  // (skipped on phones to hold frame rate), plus a separate catcher for the soft contact shadow
  const coarse = matchMedia('(pointer: coarse)').matches;
  const floorGeo = new THREE.CircleGeometry(700, 96);
  const floorU = {uBg: {value: new THREE.Color(BG)}, uBase: {value: new THREE.Color(0x30333a)}, uStrength: {value: 0.07}, uR: {value: new THREE.Vector2(60, 560)}};
  let floor;
  if (!coarse) {
    floor = new Reflector(floorGeo, {
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
  } else {
    floor = new THREE.Mesh(
      floorGeo,
      new THREE.ShaderMaterial({
        uniforms: floorU,
        vertexShader: 'varying vec3 vW; void main(){ vW = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: 'uniform vec3 uBg; uniform vec3 uBase; uniform vec2 uR; varying vec3 vW; void main(){ gl_FragColor = vec4(mix(uBg, uBase, 1.0 - smoothstep(uR.x, uR.y, length(vW.xz))), 1.0); }',
      }),
    );
  }
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = FLOOR_Y;
  scene.add(floor);
  const catcher = new THREE.Mesh(new THREE.CircleGeometry(260, 64), new THREE.ShadowMaterial({color: 0x050506, opacity: 0.55, depthWrite: false}));
  catcher.rotation.x = -Math.PI / 2;
  catcher.position.y = FLOOR_Y + 0.05;
  catcher.receiveShadow = true;
  scene.add(catcher);

  const target = new THREE.WebGLRenderTarget(4, 4, {type: THREE.HalfFloatType, samples: 4});
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
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
    const pr = Math.min(devicePixelRatio || 1, 1.75);
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
  return {THREE, renderer, scene, camera, composer, outline, size, resize, project, render: () => composer.render()};
}
