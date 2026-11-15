// Materials. makeMaterials() is called once per assembly so each assembly can be dimmed on its own.
import * as THREE from 'three';

const NOISE = /* glsl */ `
float wHash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float wNoise(vec3 x){
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(wHash(i + vec3(0,0,0)), wHash(i + vec3(1,0,0)), f.x), mix(wHash(i + vec3(0,1,0)), wHash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(wHash(i + vec3(0,0,1)), wHash(i + vec3(1,0,1)), f.x), mix(wHash(i + vec3(0,1,1)), wHash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float wFbm(vec3 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++){ s += a * wNoise(p); p = p * 2.03 + 11.7; a *= 0.5; } return s; }
`;

/**
 * Oiled walnut: long grain along the part's local X, two brown tones and dark figure.
 * opt.dark tints it (checkered panels), opt.seed shifts the figure between parts.
 */
export function walnut({seed = 0, dark = 0, bump = null, bumpScale = 0} = {}) {
  const m = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.5,
    metalness: 0,
    clearcoat: 0.3,
    clearcoatRoughness: 0.22,
    sheen: 0.25,
    sheenRoughness: 0.6,
    sheenColor: new THREE.Color(0x5a2c12),
    bumpMap: bump,
    bumpScale,
  });
  m.userData.seed = seed;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uSeed = {value: new THREE.Vector3(seed * 7.13, seed * 3.71, seed * 5.29)};
    sh.uniforms.uDark = {value: dark};
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWood;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWood = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vWood;\nuniform vec3 uSeed;\nuniform float uDark;\n${NOISE}`)
      .replace(
        '#include <map_fragment>',
        `
        vec3 wp = vWood + uSeed;
        // slow wandering of the growth rings: uneven spacing, long along X
        float warp = wFbm(wp * vec3(0.03, 0.22, 0.22)) * 4.0;
        float rp = (wp.y * 1.1 + wp.z * 0.4 + warp * 2.6) * 2.6;
        rp += 0.9 * sin(rp * 0.37 + warp);
        float ring = 0.5 + 0.5 * sin(rp);
        ring = smoothstep(0.35, 1.0, ring) * 0.6 + smoothstep(0.75, 1.0, 0.5 + 0.5 * sin(rp * 3.1 + 1.7)) * 0.18;
        // long pores: fine dark dashes along the grain
        float pores = wFbm(wp * vec3(0.1, 10.0, 10.0));
        float dash = smoothstep(0.62, 0.8, wNoise(wp * vec3(0.9, 22.0, 22.0)));
        float streak = smoothstep(0.35, 0.75, wFbm(wp * vec3(0.05, 2.0, 2.0) + 5.0));
        // dark figure: flame and mineral streaks
        float fig = smoothstep(0.5, 0.8, wFbm(wp * vec3(0.08, 0.8, 0.8) + vec3(3.0, 1.0, 7.0)));
        vec3 light = vec3(0.43, 0.27, 0.155);
        vec3 mid   = vec3(0.255, 0.15, 0.085);
        vec3 deep  = vec3(0.085, 0.048, 0.032);
        vec3 wc = mix(mid, light, ring * 0.7 + streak * 0.3);
        wc = mix(wc, deep, fig * 0.65);
        wc *= (0.88 + 0.18 * pores) * (1.0 - 0.28 * dash);
        wc *= 1.0 - uDark;
        diffuseColor.rgb *= pow(wc, vec3(2.2));
        float woodPore = pores;
        `,
      )
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp(roughnessFactor * (0.8 + 0.45 * woodPore) + fig * 0.08, 0.05, 1.0);');
  };
  m.customProgramCacheKey = () => 'walnut';
  return m;
}

let checkerTex = null;
/** Diamond checkering tile, drawn once in code. */
export function checkerTexture() {
  if (checkerTex) return checkerTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  // pyramids: bright centre, dark V grooves along both diagonals
  const img = g.createImageData(128, 128);
  for (let y = 0; y < 128; y++)
    for (let x = 0; x < 128; x++) {
      const u = x / 128;
      const v = y / 128;
      const d1 = Math.abs(((u + v) % 0.5) - 0.25) / 0.25; // 1 at ridge centre
      const d2 = Math.abs(((u - v + 1) % 0.5) - 0.25) / 0.25;
      const h = Math.min(d1, d2);
      const val = Math.round(255 * Math.pow(h, 0.7));
      const i = (y * 128 + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = val;
      img.data[i + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  checkerTex = new THREE.CanvasTexture(c);
  checkerTex.wrapS = checkerTex.wrapT = THREE.RepeatWrapping;
  checkerTex.colorSpace = THREE.NoColorSpace;
  checkerTex.anisotropy = 8;
  return checkerTex;
}

let ribTex = null;
/** Fine lengthwise lines (matted rib, serrations). */
export function lineTexture() {
  if (ribTex) return ribTex;
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 64;
  const g = c.getContext('2d');
  for (let y = 0; y < 64; y++) {
    const v = 0.5 + 0.5 * Math.cos((y / 64) * Math.PI * 2 * 4);
    g.fillStyle = `rgb(${v * 255},${v * 255},${v * 255})`;
    g.fillRect(0, y, 4, 1);
  }
  ribTex = new THREE.CanvasTexture(c);
  ribTex.wrapS = ribTex.wrapT = THREE.RepeatWrapping;
  ribTex.colorSpace = THREE.NoColorSpace;
  return ribTex;
}

/**
 * Worn finish for metal: bright bare steel on convex edges (curvature from screen-space normal
 * derivatives, so every bevel wears, at any zoom) and a faint satin unevenness in roughness.
 */
function worn(m, {wear = 1, bare = 0x8d949c, mottle = 0.22} = {}) {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uWear = {value: wear};
    sh.uniforms.uBare = {value: new THREE.Color(bare)};
    sh.uniforms.uMottle = {value: mottle};
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vMetal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMetal = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vMetal;\nuniform float uWear;\nuniform vec3 uBare;\nuniform float uMottle;\n${NOISE}`)
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        {
          vec3 gN = normalize(vNormal);
          float curv = length(fwidth(gN)) / max(length(fwidth(vViewPosition)), 1e-4);
          float n1 = wNoise(vMetal * 5.0);
          float edge = smoothstep(3.5, 11.0, curv) * smoothstep(0.25, 0.65, n1 + 0.15) * uWear;
          float mot = wFbm(vMetal * vec3(0.35, 2.2, 2.2));
          roughnessFactor = clamp(roughnessFactor * (1.0 + uMottle * (mot - 0.5) * 2.0), 0.08, 1.0);
          diffuseColor.rgb = mix(diffuseColor.rgb, uBare, edge);
          roughnessFactor = mix(roughnessFactor, 0.22, edge);
        }`,
      );
  };
  m.customProgramCacheKey = () => 'worn';
  return m;
}

export function makeMaterials() {
  const steel = worn(
    new THREE.MeshPhysicalMaterial({
      color: 0x252c39,
      metalness: 1,
      roughness: 0.38,
      anisotropy: 0.6,
      clearcoat: 0.2,
      clearcoatRoughness: 0.16,
    }),
  );
  const M = {
    steel, // deep blued gunmetal
    steelSatin: worn(new THREE.MeshPhysicalMaterial({color: 0x30353d, metalness: 1, roughness: 0.42, anisotropy: 0.45}), {wear: 0.8}),
    steelBright: worn(new THREE.MeshPhysicalMaterial({color: 0x9aa2ad, metalness: 1, roughness: 0.24, anisotropy: 0.7}), {wear: 0.5, bare: 0xc4cad1, mottle: 0.3}), // bolt, in the white
    steelInner: new THREE.MeshStandardMaterial({color: 0x1a1d22, metalness: 1, roughness: 0.48}),
    alloy: worn(new THREE.MeshPhysicalMaterial({color: 0x23262c, metalness: 0.8, roughness: 0.42, clearcoat: 0.15}), {wear: 0.7, bare: 0x7b7f86}), // anodised housing
    brass: new THREE.MeshPhysicalMaterial({color: 0xc29a48, metalness: 1, roughness: 0.27, anisotropy: 0.3}),
    rubber: new THREE.MeshPhysicalMaterial({color: 0x0f1012, metalness: 0, roughness: 0.82, sheen: 0.4, sheenRoughness: 0.8, sheenColor: new THREE.Color(0x2a2c30)}),
    polymer: new THREE.MeshPhysicalMaterial({color: 0x121315, metalness: 0, roughness: 0.55, clearcoat: 0.1}),
    bore: new THREE.MeshStandardMaterial({color: 0x07080a, metalness: 1, roughness: 0.35}),
    rib: new THREE.MeshPhysicalMaterial({color: 0x1f252e, metalness: 1, roughness: 0.55, bumpMap: lineTexture(), bumpScale: 1.2}),
    walnut: (seed, opt) => walnut({seed, ...opt}),
  };
  M.rib.bumpMap.repeat.set(1, 1);
  // Lathe uv runs u around the tube, so the default tangent is circumferential; turn it 90°
  // so the brushed highlight streaks along the tube's length.
  const tubes = new Map();
  M.tube = (m) => {
    if (!m.anisotropy) return m;
    if (!tubes.has(m)) {
      const t = m.clone();
      t.anisotropyRotation = Math.PI / 2;
      t.onBeforeCompile = m.onBeforeCompile;
      t.customProgramCacheKey = m.customProgramCacheKey;
      tubes.set(m, t);
    }
    return tubes.get(m);
  };
  return M;
}
