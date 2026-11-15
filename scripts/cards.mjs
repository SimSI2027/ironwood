// node scripts/cards.mjs [W] [H] — the name card against its part's screen bounds (all vertices): the
// smallest gap in px over every clock tick (default view) and over hovered parts at explode 1.
import {createRequire} from 'node:module';
import path from 'node:path';
import os from 'node:os';
import {pathToFileURL} from 'node:url';
const skill = path.join(os.homedir(), '.claude/skills/cutaway');
const {chromium} = createRequire(path.join(skill, 'x.js'))('playwright');
const {CHROMIUM_ARGS} = await import(pathToFileURL(path.resolve(skill, 'paths.mjs')).href);
const [W = 1280, H = 720] = process.argv.slice(2).map(Number);
const browser = await chromium.launch({args: CHROMIUM_ARGS});
const page = await browser.newPage({viewport: {width: W, height: H}, deviceScaleFactor: 1});
await page.goto(pathToFileURL(path.resolve('docs/index.html')).href + '?q=high');
await page.waitForFunction(() => window.__READY, null, {timeout: 60000});
const gap = () => page.evaluate(() => {
  const I = window.IRONWOOD;
  const h = I.hovered;
  if (!h) return null;
  const THREE = I.S.THREE;
  const v = new THREE.Vector3();
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  h.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || !o.visible) return;
    const a = o.geometry.attributes.position;
    for (let i = 0; i < a.count; i++) {
      v.fromBufferAttribute(a, i).applyMatrix4(o.matrixWorld).project(I.camera);
      const x = (v.x * 0.5 + 0.5) * innerWidth, y = (-v.y * 0.5 + 0.5) * innerHeight;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
  });
  const c = document.querySelector('.iw-card').getBoundingClientRect();
  const dx = Math.max(x0 - c.right, c.left - x1), dy = Math.max(y0 - c.bottom, c.top - y1);
  return {part: h.userData.part, gap: Math.round(Math.max(dx, dy))};
});
const out = [];
// clock ticks on the assembled gun: the active tick's part gets the card
for (const t of [0.04, 0.09, 0.112, 0.13, 0.17, 0.205, 0.211, 0.25, 0.33, 0.45, 0.55, 0.7, 0.9]) {
  await page.evaluate((t) => { const b = document.querySelector('.iw-seg button[data-g="full"]'); if (!window.__eng) (b.click(), (window.__eng = 1)); window.IRONWOOD.st.t = t; }, t);
  await page.evaluate(() => document.querySelector('.iw-play.on')?.click());
  await page.waitForTimeout(1300);
  out.push(['t ' + t, await gap()]);
}
// hover at explode 1
await page.evaluate(() => { const r = document.querySelector('.iw-ctl .iw-range'); r.value = 1; r.dispatchEvent(new Event('input')); });
await page.waitForTimeout(2500);
for (let i = 0; i < 8; i++) {
  const p = await page.evaluate((i) => {
    const {asms, camera} = window.IRONWOOD;
    let m = null;
    asms[i].parts[0].obj.traverse((o) => o.isMesh && !m && (m = o));
    m.geometry.computeBoundingSphere();
    const v = m.localToWorld(m.geometry.boundingSphere.center.clone()).project(camera);
    return {x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight};
  }, i);
  await page.mouse.move(p.x, p.y);
  await page.waitForTimeout(500);
  out.push(['hover ' + i, await gap()]);
}
for (const [k, g] of out) console.log(k.padEnd(9), g ? `${g.part.padEnd(26)} gap ${g.gap} px` : 'no card');
await browser.close();
