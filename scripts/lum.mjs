// node scripts/lum.mjs [query] — luminance (8-bit sRGB, Rec.709 weights) of the receiver's right wall at the
// default view, sampled under the port from the rear to the front (5x5 px around each point), plus the gun's
// lightest and the floor under it. LUM_W / LUM_H set the viewport (default 1280x720).
import {createRequire} from 'node:module';
import path from 'node:path';
import os from 'node:os';
import {pathToFileURL} from 'node:url';
const skill = path.join(os.homedir(), '.claude/skills/cutaway');
const {chromium} = createRequire(path.join(skill, 'x.js'))('playwright');
const {CHROMIUM_ARGS} = await import(pathToFileURL(path.join(skill, 'paths.mjs')).href);
const [query = 'q=high'] = process.argv.slice(2);
const W = +(process.env.LUM_W || 1280), H = +(process.env.LUM_H || 720);
const browser = await chromium.launch({args: CHROMIUM_ARGS});
const page = await browser.newPage({viewport: {width: W, height: H}, deviceScaleFactor: 1});
await page.goto(pathToFileURL(path.resolve('docs/index.html')).href + '?still&' + query);
await page.waitForFunction(() => window.__READY, null, {timeout: 60000});
await page.waitForTimeout(1500);
const r = await page.evaluate((pre) => {
  const {S, asms, camera} = window.IRONWOOD;
  if (pre) new Function('I', pre)(window.IRONWOOD); // LUM_EVAL: code run on window.IRONWOOD (as I) before the measure
  const T = S.THREE;
  const rec = asms.find((a) => a.key === 'receiver').group;
  const gl = S.renderer.getContext();
  S.render();
  S.renderer.setRenderTarget(null); // the composer restores whatever target was bound before it ran
  const dpr = S.renderer.getPixelRatio();
  const px = new Uint8Array(4 * 25);
  const lum = (wx, wy, wz) => {
    const v = rec.localToWorld(new T.Vector3(wx, wy, wz)).project(camera);
    const x = Math.round(((v.x * 0.5 + 0.5) * innerWidth) * dpr), y = Math.round(((v.y * 0.5 + 0.5) * innerHeight) * dpr);
    gl.readPixels(x - 2, y - 2, 5, 5, gl.RGBA, gl.UNSIGNED_BYTE, px);
    let s = 0;
    for (let i = 0; i < 25; i++) s += 0.2126 * px[i * 4] + 0.7152 * px[i * 4 + 1] + 0.0722 * px[i * 4 + 2];
    return +(s / 25).toFixed(1);
  };
  const z = 1.56;
  return {
    wall: [-19, -16, -13, -10, -7, -4, -1.5].map((x) => lum(x, -2.6, z)),
    low: [-17, -11, -5].map((x) => lum(x, -3.6, z)),
    upper: [-18.5, -15].map((x) => lum(x, 0.2, z)),
  };
}, process.env.LUM_EVAL || '');
console.log(query, JSON.stringify(r));
await browser.close();
