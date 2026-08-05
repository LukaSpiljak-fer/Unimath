// Downloads every remote image + font referenced by the .dc pages into the
// output tree, and writes assets-manifest.json (remote URL -> local path + size).
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const SRC = process.env.SRC;
const OUT = process.env.OUT;

const IMGDIR = path.join(OUT, 'assets/img');
const FONTDIR = path.join(OUT, 'assets/fonts');
fs.mkdirSync(IMGDIR, { recursive: true });
fs.mkdirSync(FONTDIR, { recursive: true });

// ---------- collect remote image urls from the source pages ----------
const urls = new Set();
for (const f of fs.readdirSync(SRC).filter((x) => x.endsWith('.dc.html'))) {
  const html = fs.readFileSync(path.join(SRC, f), 'utf8');
  for (const m of html.matchAll(/src="(https:\/\/[^"]+)"/g)) urls.add(m[1]);
}

// ---------- name each variant deterministically ----------
const slug = (s) =>
  decodeURIComponent(s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

function localName(u) {
  const url = new URL(u);
  const target = url.searchParams.get('url') || '';
  const base = target.split('/').pop() || 'img';
  const ext = (base.match(/\.(png|jpe?g|webp|gif)$/i) || [, 'jpg'])[1].toLowerCase();
  // strip the WordPress -768x512 style size suffix from the stem
  const stem = slug(base.replace(/\.[a-z]+$/i, '').replace(/-\d+x\d+$/, ''));

  const w = url.searchParams.get('w');
  const h = url.searchParams.get('h');
  let tag;
  if (url.searchParams.get('cw')) tag = 'hero';
  else if (w === '900') tag = 'lg';
  else if (w === '640' && h === '380') tag = 'card';
  else if (w === '520' && h === '440') tag = 'team';
  else if (!w && !h) tag = 'full';
  else tag = `${w || 'x'}x${h || 'x'}`;

  return `${stem}-${tag}.${ext === 'jpeg' ? 'jpg' : ext}`;
}

// ---------- download ----------
function fetchTo(url, dest, extraArgs = []) {
  execFileSync('curl', [
    '-sS', '--fail', '--location', '--max-time', '60',
    '-A', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36',
    ...extraArgs, '-o', dest, url,
  ]);
}

function dimensions(file) {
  try {
    const out = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', file], {
      encoding: 'utf8',
    });
    const w = out.match(/pixelWidth:\s*(\d+)/);
    const h = out.match(/pixelHeight:\s*(\d+)/);
    return w && h ? { w: +w[1], h: +h[1] } : null;
  } catch {
    return null;
  }
}

const manifest = { images: {}, fonts: [] };
let n = 0;
for (const u of [...urls].sort()) {
  const name = localName(u);
  const dest = path.join(IMGDIR, name);
  if (!fs.existsSync(dest)) fetchTo(u, dest);
  const size = fs.statSync(dest).size;
  if (size < 1000) throw new Error(`suspiciously small download (${size}b): ${u}`);
  const dim = dimensions(dest);
  manifest.images[u] = { file: `assets/img/${name}`, ...(dim || {}) };
  n++;
  console.log(`img  ${String(size).padStart(7)}b  ${dim ? `${dim.w}x${dim.h}`.padStart(9) : '        ?'}  ${name}`);
}
console.log(`\n${n} images -> ${IMGDIR}\n`);

// ---------- self-host the two Google fonts ----------
// woff2 only; modern browsers all support it and it is the smallest format.
const FONT_CSS =
  'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400..800&family=Figtree:wght@400;500;600;700&display=swap';

const cssRaw = execFileSync('curl', [
  '-sS', '--fail', '--location', '--max-time', '60',
  // this UA makes Google serve woff2 + unicode-range subsets
  '-A', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36',
  FONT_CSS,
], { encoding: 'utf8' });

// Keep only latin + latin-ext subsets — Croatian needs latin-ext (č ć ž š đ).
const blocks = cssRaw.split('/*').filter(Boolean);
let fontCss = '';
let fi = 0;
for (const b of blocks) {
  const subset = b.slice(0, b.indexOf('*/')).trim();
  if (subset !== 'latin' && subset !== 'latin-ext') continue;
  let block = b.slice(b.indexOf('*/') + 2);
  for (const m of [...block.matchAll(/url\((https:\/\/[^)]+\.woff2)\)/g)]) {
    const remote = m[1];
    const fam = (block.match(/font-family:\s*'([^']+)'/) || [, 'font'])[1];
    const wght = (block.match(/font-weight:\s*([\d\s]+)/) || [, ''])[1].trim().replace(/\s+/g, '-');
    const name = `${slug(fam)}-${slug(subset)}-${wght || 'v'}-${fi++}.woff2`;
    const dest = path.join(FONTDIR, name);
    if (!fs.existsSync(dest)) fetchTo(remote, dest);
    const size = fs.statSync(dest).size;
    if (size < 500) throw new Error(`bad font download: ${remote}`);
    console.log(`font ${String(size).padStart(7)}b  ${name}`);
    block = block.replace(remote, `../fonts/${name}`);
    manifest.fonts.push(`assets/fonts/${name}`);
  }
  fontCss += block.trim() + '\n';
}

if (!manifest.fonts.length) throw new Error('no fonts downloaded');
fs.writeFileSync(path.join(__dirname, 'fonts.css'), fontCss, 'utf8');
fs.writeFileSync(path.join(__dirname, 'assets-manifest.json'), JSON.stringify(manifest, null, 1));
console.log(`\n${manifest.fonts.length} font files -> ${FONTDIR}`);
