#!/usr/bin/env node
/**
 * Generira statične blog kartice iz posts.json i upisuje ih u
 * blog.html (sve) i index.html (zadnje 3) između HTML komentara:
 *   <!-- blog-cards:start --> ... <!-- blog-cards:end -->
 *
 * Nakon izmjene posts.json pokreni:  node scripts/build-blog.js
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const posts = JSON.parse(fs.readFileSync(path.join(root, 'posts.json'), 'utf8'));

const esc = (s) => String(s)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/"/g, '&quot;');

function card(post, index, { cardClass, imgClass, moreClass }) {
  const priority = index === 0 ? ' fetchpriority="high"' : ' loading="lazy"';
  return `    <a class="${cardClass}" href="${post.id}.html">
      <img src="${post.image}" alt="${esc(post.headline)}" class="${imgClass}" width="640" height="380" decoding="async"${priority}>
      <div class="s3p">
        <span class="s3q">${esc(post.date)}</span>
        <h3 class="s3r">${esc(post.headline)}</h3>
        <span class="${moreClass}">Pročitaj više →</span>
      </div>
    </a>`;
}

function inject(file, cardsHtml) {
  const filePath = path.join(root, file);
  const html = fs.readFileSync(filePath, 'utf8');
  const re = /(<!-- blog-cards:start -->)[\s\S]*?(<!-- blog-cards:end -->)/;
  if (!re.test(html)) {
    console.error(`${file}: markeri <!-- blog-cards:start/end --> nisu pronađeni`);
    process.exitCode = 1;
    return;
  }
  fs.writeFileSync(filePath, html.replace(re, `$1\n${cardsHtml}\n    $2`));
  console.log(`${file}: upisano`);
}

inject('blog.html', posts
  .map((p, i) => card(p, i, { cardClass: 's57 pi', imgClass: 's58', moreClass: 's59' }))
  .join('\n'));

inject('index.html', posts.slice(0, 3)
  .map((p, i) => card(p, i, { cardClass: 's3n pd', imgClass: 's3o', moreClass: 's3s' }))
  .join('\n'));
