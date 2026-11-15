// node scripts/head.mjs <in.html> <out.html> — the built page with its <title>, description, Open Graph and
// Twitter tags (docs/hero.png as the card image) and an inline SVG favicon.
import fs from 'node:fs';
const [src, out] = process.argv.slice(2);
const URL = 'https://simsi2027.github.io/ironwood/';
const TITLE = 'IRONWOOD Mk I · an exploded pump-action, built in code';
const DESC = 'An interactive 3D exploded view of a walnut-stocked pump-action shotgun, made entirely in three.js code: drag, scroll, fire, take it apart.';
const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#15171c"/><rect x="10" y="27" width="44" height="7" rx="2" fill="#c9a24b"/><rect x="10" y="38" width="30" height="5" rx="2" fill="#7a5a32"/><circle cx="50" cy="40.5" r="3.5" fill="#c9a24b"/></svg>`;
const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
const meta = [
  `<title>${TITLE}</title>`,
  `<meta name="description" content="${esc(DESC)}">`,
  `<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,${encodeURIComponent(icon)}">`,
  `<meta property="og:type" content="website">`,
  `<meta property="og:url" content="${URL}">`,
  `<meta property="og:title" content="${esc(TITLE)}">`,
  `<meta property="og:description" content="${esc(DESC)}">`,
  `<meta property="og:image" content="${URL}hero.png">`,
  `<meta property="og:image:width" content="1600">`,
  `<meta property="og:image:height" content="900">`,
  `<meta name="twitter:card" content="summary_large_image">`,
  `<meta name="twitter:title" content="${esc(TITLE)}">`,
  `<meta name="twitter:description" content="${esc(DESC)}">`,
  `<meta name="twitter:image" content="${URL}hero.png">`,
  `<meta name="theme-color" content="#15171c">`,
].join('\n');
const html = fs.readFileSync(src, 'utf8').replace(/<title>[^<]*<\/title>/, meta);
if (!html.includes('og:image')) throw new Error('no <title> to replace in ' + src);
fs.writeFileSync(out, html);
