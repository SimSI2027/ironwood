// node scripts/perf.mjs [W] [H] [query] — loads docs/index.html?perf=1 headless and prints window.__PERF
// for three states: idle (default view), x-ray (clock held at Press), cycle (FULL playing: shadows every frame).
import {createRequire} from 'node:module';
import path from 'node:path';
import os from 'node:os';
import {pathToFileURL} from 'node:url';
const skill = path.join(os.homedir(), '.claude/skills/cutaway');
const {chromium} = createRequire(path.join(skill, 'x.js'))('playwright');
const {CHROMIUM_ARGS} = await import(pathToFileURL(path.join(skill, 'paths.mjs')).href);
const [W = 1920, H = 1080, extra = ''] = process.argv.slice(2);
const browser = await chromium.launch({args: CHROMIUM_ARGS});
const page = await browser.newPage({viewport: {width: +W, height: +H}, deviceScaleFactor: 1});
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
await page.goto(pathToFileURL(path.resolve('docs/index.html')).href + '?perf=1' + (/(^|&)q=/.test(extra) ? '' : '&q=high') + (extra ? '&' + extra : ''));
await page.waitForFunction(() => window.__READY, null, {timeout: 60000});
const read = () => page.evaluate(() => JSON.parse(JSON.stringify({...window.__PERF, reset: 0})));
const wait = (ms) => page.waitForTimeout(ms);
const reset = () => page.evaluate(() => window.__PERF.reset());
await wait(1500);
const still = await read(); // drawn in the second before the last overlay update, with no input
await wait(4000); // the idle auto-turn starts 5 s after the last input
await reset();
await wait(2500);
const idle = await read();
await page.evaluate(() => (window.IRONWOOD.st.t = 0.06));
await wait(1500);
await reset();
await wait(2500);
const xray = await read();
await page.evaluate(() => document.querySelector('.iw-seg button[data-g="full"]').click());
await wait(500);
await reset();
await wait(2500);
const cycle = await read();
const r = (o) => Object.fromEntries(Object.entries(o.marks).map(([k, v]) => [k, Math.round(v)]));
console.log('settled (2-3.5 s, no input): last overlay update', still.drawnPerS, 'drawn/s');
console.log('renderer', idle.renderer, '| timer', idle.timer, '| buffer', idle.size, '| marks', JSON.stringify(r(idle)));
for (const [k, s] of Object.entries({idle, xray, cycle})) console.log(k.padEnd(6), 'gpu', s.gpuMs, 'frame', s.frameMs, 'max', s.frameMax, 'drawn/s', s.drawnPerS, 'cut', s.cut, 'programs', s.programs, 'calls', s.calls, 'tris', s.tris, JSON.stringify(s.pass));
console.log('errors', errs.length ? errs.join('\n') : 'none');
await browser.close();
