// Decodes a PNG far enough to answer one question: is any pixel non-opaque?
// (hasAlpha from sips only reports that an alpha *channel* exists.)
const fs = require('fs');
const zlib = require('zlib');

function check(file) {
  const buf = fs.readFileSync(file);
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a png: ' + file);

  let off = 8;
  let ihdr = null;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      ihdr = {
        w: data.readUInt32BE(0),
        h: data.readUInt32BE(4),
        depth: data[8],
        color: data[9],
        interlace: data[12],
      };
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    off += 12 + len;
  }

  // color 6 = RGBA, 4 = gray+alpha. anything else has no per-pixel alpha.
  if (ihdr.color !== 6 && ihdr.color !== 4) return { ...ihdr, transparent: false, reason: 'no alpha channel' };
  if (ihdr.depth !== 8) return { ...ihdr, transparent: null, reason: 'unsupported bit depth' };
  if (ihdr.interlace !== 0) return { ...ihdr, transparent: null, reason: 'interlaced' };

  const channels = ihdr.color === 6 ? 4 : 2;
  const bpp = channels;
  const stride = ihdr.w * bpp;
  const raw = zlib.inflateSync(Buffer.concat(idat));

  const prev = Buffer.alloc(stride);
  let line = Buffer.alloc(stride);
  let p = 0;
  let minAlpha = 255;

  for (let y = 0; y < ihdr.h; y++) {
    const filter = raw[p++];
    raw.copy(line, 0, p, p + stride);
    p += stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? line[x - bpp] : 0;
      const b = prev[x];
      const c = x >= bpp ? prev[x - bpp] : 0;
      let val = line[x];
      if (filter === 1) val += a;
      else if (filter === 2) val += b;
      else if (filter === 3) val += (a + b) >> 1;
      else if (filter === 4) {
        const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
        val += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      line[x] = val & 0xff;
    }
    for (let x = bpp - 1; x < stride; x += bpp) {
      if (line[x] < minAlpha) minAlpha = line[x];
      if (minAlpha === 0) break;
    }
    line.copy(prev);
    if (minAlpha === 0) break;
  }

  return { ...ihdr, minAlpha, transparent: minAlpha < 255 };
}

for (const f of process.argv.slice(2)) {
  const r = check(f);
  console.log(
    `${f.split('/').pop().padEnd(30)} ${String(r.w + 'x' + r.h).padEnd(10)} colorType=${r.color}  ` +
    `minAlpha=${r.minAlpha ?? '-'}  ${r.transparent ? 'TRANSPARENT -> keep png' : 'fully opaque -> can be jpeg'}`
  );
}
