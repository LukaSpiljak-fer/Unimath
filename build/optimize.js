// Re-encodes the heavy PNGs as JPEG and re-compresses the JPEGs.
// Nothing here changes pixel dimensions, so layout is untouched.
// The one PNG with real transparency (Maja's cut-out portrait) is flattened onto
// #F1F8F6 — the exact solid colour of the card it sits on — so it renders identically.
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const IMG = path.join(process.env.OUT, 'assets/img');
const FLATTEN = { 'unimath-maja-2-full.png': '#F1F8F6' };

const rename = {}; // old file name -> new file name
let before = 0;
let after = 0;

(async () => {
  for (const f of fs.readdirSync(IMG).sort()) {
    const src = path.join(IMG, f);
    const size = fs.statSync(src).size;
    before += size;

    const isPng = f.endsWith('.png');
    const out = isPng ? f.replace(/\.png$/, '.jpg') : f;
    const dest = path.join(IMG, out);
    const tmp = dest + '.tmp';

    let img = sharp(src);
    if (FLATTEN[f]) img = img.flatten({ background: FLATTEN[f] });
    await img.jpeg({ quality: 84, mozjpeg: true, chromaSubsampling: '4:4:4' }).toFile(tmp);

    const newSize = fs.statSync(tmp).size;
    if (newSize < size) {
      fs.renameSync(tmp, dest);
      if (out !== f) fs.unlinkSync(src);
      if (out !== f) rename[f] = out;
      after += newSize;
      console.log(
        `${f.padEnd(46)} ${String(size).padStart(8)} -> ${String(newSize).padStart(8)}  ` +
        `(-${Math.round((1 - newSize / size) * 100)}%)${out !== f ? '  => ' + out : ''}`
      );
    } else {
      fs.unlinkSync(tmp);
      after += size;
      console.log(`${f.padEnd(46)} ${String(size).padStart(8)}  kept as-is`);
    }
  }

  fs.writeFileSync(path.join(__dirname, 'image-renames.json'), JSON.stringify(rename, null, 1));
  console.log(
    `\ntotal ${(before / 1024).toFixed(0)}KB -> ${(after / 1024).toFixed(0)}KB ` +
    `(-${Math.round((1 - after / before) * 100)}%)`
  );
})();
