// apple-touch-icon, robots.txt, sitemap.xml
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const META = require('./meta');

const OUT = process.env.OUT;

(async () => {
  await sharp(path.join(OUT, 'assets/img/favicon.svg'), { density: 600 })
    .resize(180, 180)
    .png()
    .toFile(path.join(OUT, 'assets/img/apple-touch-icon.png'));
  console.log('apple-touch-icon.png written');

  fs.writeFileSync(
    path.join(OUT, 'robots.txt'),
    `User-agent: *\nAllow: /\n\nSitemap: ${META.SITE}/sitemap.xml\n`,
    'utf8'
  );

  const urls = Object.values(META.pages).map((m) => {
    const loc = META.SITE + '/' + (m.out === 'index.html' ? '' : m.out);
    const priority = m.out === 'index.html' ? '1.0' : m.type === 'article' ? '0.6' : '0.8';
    return (
      `  <url>\n    <loc>${loc}</loc>\n` +
      (m.date ? `    <lastmod>${m.date}</lastmod>\n` : '') +
      `    <changefreq>${m.type === 'article' ? 'yearly' : 'monthly'}</changefreq>\n` +
      `    <priority>${priority}</priority>\n  </url>`
    );
  });

  fs.writeFileSync(
    path.join(OUT, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`,
    'utf8'
  );
  console.log(`robots.txt + sitemap.xml (${urls.length} urls) written`);
})();
