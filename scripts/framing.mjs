// node scripts/framing.mjs [W] [H] — the one framing rule, measured on every vertex of the subject:
// fill = the subject's projected bounds over the usable area (the larger of width and height share, target
// 70-85%), off = how far the bounds' centre sits from the usable area's centre (% of its size, x / y).
// States: default, sway at -20 / +20 deg, explode 0.5 and 1, each pill, each FIRE and PUMP tick.
import {createRequire} from 'node:module';
import path from 'node:path';
import os from 'node:os';
import {pathToFileURL} from 'node:url';
const skill = path.join(os.homedir(), '.claude/skills/cutaway');
const {chromium} = createRequire(path.join(skill, 'x.js'))('playwright');
const {CHROMIUM_ARGS} = await import(pathToFileURL(path.resolve(skill, 'paths.mjs')).href);
const [W = 1280, H = 720] = process.argv.slice(2).map(Number);
const phone = W < 720;
const browser = await chromium.launch({args: CHROMIUM_ARGS});
const page = await browser.newPage({viewport: {width: W, height: H}, deviceScaleFactor: 1, hasTouch: phone, isMobile: phone});
await page.goto(pathToFileURL(path.resolve('docs/index.html')).href + '?q=med');
await page.waitForFunction(() => window.__READY, null, {timeout: 60000});
const rows = await page.evaluate(async () => {
  const I = window.IRONWOOD;
  const {st, camera, S, TICKS} = I;
  const THREE = S.THREE;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const v = new THREE.Vector3();
  const measure = (subject) => {
    camera.updateMatrixWorld();
    const U = I.usable();
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of I.subjectPts(subject, true)) {
      v.copy(p).project(camera);
      const x = (v.x * 0.5 + 0.5) * innerWidth, y = (-v.y * 0.5 + 0.5) * innerHeight;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
    const uw = U.r - U.l, uh = U.b - U.t;
    const fw = (x1 - x0) / uw, fh = (y1 - y0) / uh;
    return {fill: +(100 * Math.max(fw, fh)).toFixed(1), w: +(100 * fw).toFixed(1), h: +(100 * fh).toFixed(1),
      off: [+((100 * ((x0 + x1) / 2 - (U.l + U.r) / 2)) / uw).toFixed(1), +((100 * ((y0 + y1) / 2 - (U.t + U.b) / 2)) / uh).toFixed(1)]};
  };
  const out = [];
  out.push(['default', measure(I.gun)]); // centred unless the contact shadow needs the room
  // sway extremes: hold the envelope at 1 and the phase at -/+ quarter turn
  for (const ph of [-Math.PI / 2, Math.PI / 2]) {
    Object.assign(I.view.env, {v: 1, from: 1, to: 1});
    I.view.phase = ph;
    await wait(120);
    out.push([`sway ${ph < 0 ? '-' : '+'}20`, measure(I.autoSubject())]);
  }
  I.view.phase = 0;
  Object.assign(I.view.env, {v: 0, from: 0, to: 0});
  for (const e of [0.5, 1]) {
    st.target = e;
    await wait(1600);
    out.push([`explode ${e}`, measure(I.autoSubject())]);
  }
  st.target = 0;
  await wait(1600);
  for (let i = 0; i < I.asms.length; i++) {
    I.focusOn(i, 0.3);
    await wait(900);
    out.push([`pill ${I.asms[i].key}`, measure(I.asms[i].group)]);
  }
  I.focusOn(-1, 0.3);
  await wait(900);
  for (let i = 1; i < TICKS.length - 1; i++) {
    const t1 = TICKS[i + 1].t;
    st.t = TICKS[i].t + 0.2 * (t1 - TICKS[i].t);
    I.direct();
    await wait(1000);
    out.push([`tick ${TICKS[i].name}`, measure(I.clockSubject(i))]);
  }
  return out;
});
console.log(`${W}x${H}`);
let bad = 0;
for (const [k, m] of rows) {
  const ok = m.fill >= 70 && m.fill <= 85 && Math.abs(m.off[0]) <= 3 && Math.abs(m.off[1]) <= 3;
  bad += !ok;
  console.log(`${ok ? '  ' : '! '}${k.padEnd(18)} fill ${m.fill}% (w ${m.w} h ${m.h})  off ${m.off.join(' / ')}%`);
}
console.log(`${rows.length - bad}/${rows.length} in 70-85%, centred within 3%`);
await browser.close();
