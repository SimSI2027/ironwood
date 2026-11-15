// node scripts/firecam.mjs [W] [H] — steps the FIRE clock (0-0.30) on the clock camera and reports, per tick,
// the active part's screen box against the central 60% of the area above the panel (worst overshoot, px)
// and, during Travel, the share of the gun's length on screen (minimum).
import {createRequire} from 'node:module';
import path from 'node:path';
import os from 'node:os';
import {pathToFileURL} from 'node:url';
const skill = path.join(os.homedir(), '.claude/skills/cutaway');
const {chromium} = createRequire(path.join(skill, 'x.js'))('playwright');
const {CHROMIUM_ARGS} = await import(pathToFileURL(path.join(skill, 'paths.mjs')).href);
const [W = 1280, H = 720] = process.argv.slice(2).map(Number);
const browser = await chromium.launch({args: CHROMIUM_ARGS});
const page = await browser.newPage({viewport: {width: W, height: H}, deviceScaleFactor: 1});
await page.goto(pathToFileURL(path.resolve('docs/index.html')).href + '?q=high');
await page.waitForFunction(() => window.__READY, null, {timeout: 60000});
const r = await page.evaluate(async () => {
  const {st, camera, gun, clockCam, partByName, TICKS, tickAt, pointsOf, S} = window.IRONWOOD;
  const THREE = S.THREE;
  const dock = document.querySelector('.iw-dock').getBoundingClientRect().top;
  const w = innerWidth;
  const box = {x0: 0.2 * w, x1: 0.8 * w, y0: 0.2 * dock, y1: 0.8 * dock};
  const raf = () => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
  const out = {};
  const v = new THREE.Vector3();
  const px = (p) => (v.copy(p).project(camera), [(v.x * 0.5 + 0.5) * w, (-v.y * 0.5 + 0.5) * innerHeight]);
  // the gun's length: its local x extent at rest, sampled along the bore line
  const lb = new THREE.Box3();
  for (const p of pointsOf(gun)) lb.expandByPoint(gun.worldToLocal(p.clone()));
  for (let t = 0; t <= 0.3; t += 0.002) {
    st.t = t;
    await raf();
    const c = clockCam(t);
    camera.position.copy(c.p);
    camera.lookAt(c.t);
    camera.updateMatrixWorld();
    const tk = TICKS[tickAt(t)];
    const part = partByName(tk.part);
    let over = 0;
    if (part) {
      const pts = pointsOf(part, true).map(px);
      const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
      over = Math.max(box.x0 - Math.min(...xs), Math.max(...xs) - box.x1, box.y0 - Math.min(...ys), Math.max(...ys) - box.y1, 0);
    }
    let on = 1;
    if (tk.name === 'Travel') {
      let n = 0;
      for (let k = 0; k <= 100; k++) {
        const [x, y] = px(gun.localToWorld(new THREE.Vector3(lb.min.x + ((lb.max.x - lb.min.x) * k) / 100, 0, 0)));
        n += x >= 0 && x <= w && y >= 0 && y <= innerHeight ? 1 : 0;
      }
      on = n / 101;
    }
    const o = (out[tk.name] ||= {part: tk.part, worstPx: 0, minOnScreen: 1, n: 0});
    o.worstPx = Math.max(o.worstPx, Math.round(over));
    o.minOnScreen = Math.min(o.minOnScreen, +on.toFixed(2));
    o.n++;
  }
  return out;
});
for (const [k, o] of Object.entries(r)) console.log(k.padEnd(8), o.part.padEnd(12), 'outside central 60% by', String(o.worstPx).padStart(4), 'px', o.minOnScreen < 1 ? `· gun on screen >= ${o.minOnScreen}` : '', `(${o.n} samples)`);
await browser.close();
