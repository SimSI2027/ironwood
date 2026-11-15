// node scripts/probe.mjs — prints per-assembly bounds at explode 0 and 1, triangle count, NaN check.
import {createRequire} from 'node:module';
import path from 'node:path';
import os from 'node:os';
import {pathToFileURL} from 'node:url';
const skill = path.join(os.homedir(), '.claude/skills/cutaway');
const {chromium} = createRequire(path.join(skill, 'x.js'))('playwright');
const {CHROMIUM_ARGS} = await import(pathToFileURL(path.join(skill, 'paths.mjs')).href);
const browser = await chromium.launch({args: CHROMIUM_ARGS});
const page = await browser.newPage({viewport: {width: 800, height: 500}});
await page.goto(pathToFileURL(path.resolve('docs/index.html')).href + '?still');
await page.waitForFunction(() => window.__READY, null, {timeout: 60000});
const r = await page.evaluate(() => {
  const {asms, gun} = window.IRONWOOD;
  const out = [];
  let tris = 0, nan = [];
  gun.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry;
    tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
    const a = g.attributes.position.array;
    for (let i = 0; i < a.length; i++) if (!Number.isFinite(a[i])) { nan.push(o.userData.partRoot?.userData.part); break; }
  });
  const B = (o) => { const b = new o.parent.constructor(); return b; };
  for (const e of [0, 1]) {
    asms.forEach((a) => a.pose(e, 0));
    gun.updateMatrixWorld(true);
    for (const a of asms) {
      const box = new (Object.getPrototypeOf(gun.position).constructor === Object ? Object : window.IRONWOOD.Box3 || Object)();
      let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
      a.group.traverse((o) => {
        if (!o.isMesh) return;
        o.geometry.computeBoundingBox();
        const bb = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld);
        mn = mn.map((v, i) => Math.min(v, bb.min.getComponent(i)));
        mx = mx.map((v, i) => Math.max(v, bb.max.getComponent(i)));
      });
      out.push(`e=${e} ${a.key.padEnd(9)} x[${mn[0].toFixed(1)},${mx[0].toFixed(1)}] y[${mn[1].toFixed(1)},${mx[1].toFixed(1)}] z[${mn[2].toFixed(1)},${mx[2].toFixed(1)}]`);
    }
  }
  asms.forEach((a) => a.pose(0, 0));
  // winding vs stored normals, and signed volume, per mesh
  const bad = [];
  gun.traverse((o) => {
    if (!o.isMesh || o.geometry.type === 'ShapeGeometry') return;
    const g = o.geometry, P = g.attributes.position, N = g.attributes.normal, I = g.index;
    const n = I ? I.count : P.count;
    let agree = 0, tot = 0, vol = 0;
    const v = (k) => [P.getX(k), P.getY(k), P.getZ(k)];
    for (let t = 0; t < n; t += 3) {
      const a = I ? I.getX(t) : t, b = I ? I.getX(t + 1) : t + 1, c = I ? I.getX(t + 2) : t + 2;
      const A = v(a), B = v(b), C = v(c);
      const u = [B[0]-A[0], B[1]-A[1], B[2]-A[2]], w = [C[0]-A[0], C[1]-A[1], C[2]-A[2]];
      const f = [u[1]*w[2]-u[2]*w[1], u[2]*w[0]-u[0]*w[2], u[0]*w[1]-u[1]*w[0]];
      const fl = Math.hypot(...f); if (fl < 1e-9) continue;
      const nn = [N.getX(a)+N.getX(b)+N.getX(c), N.getY(a)+N.getY(b)+N.getY(c), N.getZ(a)+N.getZ(b)+N.getZ(c)];
      agree += Math.sign(f[0]*nn[0]+f[1]*nn[1]+f[2]*nn[2]); tot++;
      vol += (A[0]*(B[1]*C[2]-B[2]*C[1]) - A[1]*(B[0]*C[2]-B[2]*C[0]) + A[2]*(B[0]*C[1]-B[1]*C[0])) / 6;
    }
    const name = (o.userData.partRoot?.userData.part || '?') + ':' + o.geometry.type + ':' + (g.attributes.position.count);
    if (agree / tot < 0.9 || vol < 0) bad.push(`${name} agree=${(agree/tot).toFixed(2)} vol=${vol.toFixed(2)}`);
  });
  return {out: [...out, ...(bad.length ? bad : ['all meshes: winding agrees with normals, volume > 0'])], tris: Math.round(tris), nan};
});
console.log(r.out.join('\n'));
console.log('tris', r.tris, 'nan', JSON.stringify(r.nan));
await browser.close();
