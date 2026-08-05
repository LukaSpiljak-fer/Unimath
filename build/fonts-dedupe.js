// Figtree is a variable font: Google serves the identical file for every weight
// we requested. Collapse the duplicates into one @font-face per subset with a
// weight *range*, and give the files clean names.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const OUT = process.env.OUT;
const FONTDIR = path.join(OUT, 'assets/fonts');
const CSS = path.join(__dirname, 'fonts.css');

const css = fs.readFileSync(CSS, 'utf8');
const faces = [...css.matchAll(/@font-face\s*\{([\s\S]*?)\}/g)].map((m) => {
  const b = m[1];
  const get = (re) => (b.match(re) || [, ''])[1].trim();
  return {
    family: get(/font-family:\s*'([^']+)'/),
    weight: get(/font-weight:\s*([^;]+);/),
    stretch: get(/font-stretch:\s*([^;]+);/),
    file: get(/url\(\.\.\/fonts\/([^)]+)\)/),
    range: get(/unicode-range:\s*([^;]+);/),
  };
});

// group by (family, content hash) — identical bytes collapse into one face
const groups = new Map();
for (const f of faces) {
  const buf = fs.readFileSync(path.join(FONTDIR, f.file));
  const key = f.family + '|' + crypto.createHash('sha1').update(buf).digest('hex');
  if (!groups.has(key)) groups.set(key, { ...f, weights: [], files: [] });
  const g = groups.get(key);
  g.files.push(f.file);
  for (const w of f.weight.split(/\s+/)) g.weights.push(+w);
}

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
let out = '/* Self-hosted fonts — no request leaves the visitor\'s browser to Google. */\n';
const keep = new Set();

for (const g of groups.values()) {
  const lo = Math.min(...g.weights);
  const hi = Math.max(...g.weights);
  const subset = g.range.startsWith('U+0100') ? 'latin-ext' : 'latin';
  const name = `${slug(g.family)}-${subset}.woff2`;

  if (g.files[0] !== name) fs.renameSync(path.join(FONTDIR, g.files[0]), path.join(FONTDIR, name));
  keep.add(name);
  for (const dup of g.files.slice(1)) {
    const p = path.join(FONTDIR, dup);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }

  out +=
    `@font-face{font-family:'${g.family}';font-style:normal;` +
    `font-weight:${lo === hi ? lo : `${lo} ${hi}`};` +
    (g.stretch ? `font-stretch:${g.stretch};` : '') +
    `font-display:swap;src:url(../fonts/${name}) format('woff2');` +
    `unicode-range:${g.range}}\n`;

  console.log(`${g.family.padEnd(22)} ${subset.padEnd(10)} weight ${lo}-${hi}  ${g.files.length} file(s) -> ${name}`);
}

for (const f of fs.readdirSync(FONTDIR)) {
  if (!keep.has(f)) {
    fs.unlinkSync(path.join(FONTDIR, f));
    console.log(`removed duplicate ${f}`);
  }
}

fs.writeFileSync(CSS, out, 'utf8');
const total = [...keep].reduce((a, f) => a + fs.statSync(path.join(FONTDIR, f)).size, 0);
fs.writeFileSync(path.join(__dirname, 'font-files.json'), JSON.stringify([...keep], null, 1));
console.log(`\n${keep.size} font files, ${(total / 1024).toFixed(0)}KB total`);
