// Renders the .dc.html design-component files into plain static HTML.
//
// What the dc-runtime did at load time, this does at build time:
//   <x-dc>            -> unwrapped (the runtime hid it and cloned it into #dc-root)
//   <helmet>          -> hoisted into <head>
//   <dc-import>       -> the named component inlined, with its props resolved
//   <sc-if value>     -> kept or dropped by evaluating the prop
//   style-hover="..." -> a real CSS class with a :hover rule
//   hint-*            -> dropped (editor-only hints)
//
// Inline style="" attributes are additionally lifted into deduped classes in a
// single shared stylesheet. Selectors are DOUBLED (.s7.s7) so they keep beating
// the global `a:hover{color:...}` rule exactly like inline styles used to —
// without that, every coloured link would change colour on hover.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const META = require('./meta');

const SRC = process.env.SRC;
const OUT = process.env.OUT;
const manifest = require('./assets-manifest.json');
const renames = require('./image-renames.json');
const fontFiles = require('./font-files.json');

// remote image url -> final local path (after png->jpg re-encoding)
const IMGMAP = {};
for (const [url, info] of Object.entries(manifest.images)) {
  const base = info.file.split('/').pop();
  IMGMAP[url] = { ...info, file: 'assets/img/' + (renames[base] || base) };
}

// ---------------------------------------------------------------- style registry
const baseClasses = new Map();   // css text -> class name
const pseudoClasses = new Map(); // "hover|css" -> class name

const normCss = (s) =>
  s.split(';').map((d) => d.trim()).filter(Boolean).join(';');

function baseClass(css) {
  const k = normCss(css);
  if (!k) return null;
  if (!baseClasses.has(k)) baseClasses.set(k, 's' + baseClasses.size.toString(36));
  return baseClasses.get(k);
}
function pseudoClass(pseudo, css) {
  const k = pseudo + '|' + normCss(css);
  if (!pseudoClasses.has(k)) pseudoClasses.set(k, 'p' + pseudoClasses.size.toString(36));
  return pseudoClasses.get(k);
}

// ---------------------------------------------------------------- page loading
const cache = new Map();
function loadDoc(file) {
  if (!cache.has(file)) {
    cache.set(file, new JSDOM(fs.readFileSync(path.join(SRC, file), 'utf8')));
  }
  return cache.get(file).window.document;
}

function propDefaults(doc) {
  const s = doc.querySelector('script[data-dc-script]');
  const out = {};
  if (!s) return out;

  // declared editor props: {"najava":{"default":true,...}}
  try {
    for (const [k, v] of Object.entries(JSON.parse(s.getAttribute('data-props') || '{}'))) {
      if (k.startsWith('$')) continue;
      out[k] = v && typeof v === 'object' && 'default' in v ? v.default : v;
    }
  } catch { /* preview-only props block */ }

  // fallbacks written in renderVals(), e.g. `this.props.najava ?? true`
  for (const m of s.textContent.matchAll(/this\.props\.(\w+)\s*\?\?\s*(true|false|-?[\d.]+|'[^']*'|"[^"]*")/g)) {
    if (m[1] in out) continue;
    const lit = m[2];
    out[m[1]] =
      lit === 'true' ? true :
      lit === 'false' ? false :
      /^['"]/.test(lit) ? lit.slice(1, -1) : Number(lit);
  }
  return out;
}

// `{{ najava }}` / `{{ true }}` — the only expression forms these pages use
function evalExpr(raw, props, defaults) {
  const m = String(raw).match(/^\s*\{\{([\s\S]+?)\}\}\s*$/);
  if (!m) return raw;
  const e = m[1].trim();
  if (e === 'true') return true;
  if (e === 'false') return false;
  if (e in props) return props[e];
  if (e in defaults) return defaults[e];
  throw new Error(`unresolved expression {{ ${e} }}`);
}

const OUTNAME = Object.fromEntries(
  Object.entries(META.pages).map(([src, m]) => [src, m.out])
);

function rewriteHref(href) {
  if (!href) return href;
  const [file, hash] = href.split('#');
  if (!file.endsWith('.dc.html')) return href;
  const out = OUTNAME[file];
  if (!out) throw new Error('link to unknown page: ' + href);
  return out + (hash ? '#' + hash : '');
}

// ---------------------------------------------------------------- node walking
function walk(node, props, doc, ctx) {
  const kids = [...node.childNodes];
  for (const child of kids) {
    if (child.nodeType !== 1) continue;
    const tag = child.tagName.toLowerCase();

    if (tag === 'helmet') {
      child.remove();
      continue;
    }

    if (tag === 'sc-if') {
      const keep = evalExpr(child.getAttribute('value'), props, ctx.defaults);
      if (keep) {
        walk(child, props, doc, ctx); // process before unwrapping
        while (child.firstChild) node.insertBefore(child.firstChild, child);
      }
      child.remove();
      continue;
    }

    if (tag === 'dc-import') {
      const name = child.getAttribute('name');
      const file = name + '.dc.html';
      const sub = loadDoc(file);
      const subDefaults = propDefaults(sub);

      const subProps = {};
      for (const a of [...child.attributes]) {
        if (a.name === 'name' || a.name.startsWith('hint-')) continue;
        subProps[a.name] = evalExpr(a.value, props, ctx.defaults);
      }

      const root = sub.querySelector('x-dc').cloneNode(true);
      walk(root, subProps, doc, { ...ctx, defaults: subDefaults });

      const frag = doc.createDocumentFragment();
      while (root.firstChild) {
        const n = root.firstChild;
        root.removeChild(n); // importNode copies, it does not detach — remove or we spin forever
        frag.appendChild(doc.importNode(n, true));
      }
      node.replaceChild(frag, child);
      continue;
    }

    // ---- plain DOM element ----
    for (const a of [...child.attributes]) {
      if (a.name.startsWith('hint-')) child.removeAttribute(a.name);
    }

    const classes = [];
    for (const a of [...child.attributes]) {
      if (!a.name.startsWith('style-')) continue;
      classes.push(pseudoClass(a.name.slice(6), a.value));
      child.removeAttribute(a.name);
    }

    const style = child.getAttribute('style');
    if (style) {
      // markers replacing the original `[style*="..."]` responsive selectors
      if (style.includes('grid-template-columns')) classes.unshift('mq-grid');
      if (style.includes('380px') && ctx.screen === 'Hero') classes.unshift('mq-heroblob');
      const c = baseClass(style);
      if (c) classes.unshift(c);
      child.removeAttribute('style');
    }
    if (classes.length) {
      child.setAttribute('class', [child.getAttribute('class'), ...classes].filter(Boolean).join(' '));
    }

    if (child.hasAttribute('href')) child.setAttribute('href', rewriteHref(child.getAttribute('href')));

    if (tag === 'img') {
      const src = child.getAttribute('src');
      const info = IMGMAP[src];
      if (!info) throw new Error('unmapped image: ' + src);
      child.setAttribute('src', info.file);
      if (info.w) child.setAttribute('width', info.w);
      if (info.h) child.setAttribute('height', info.h);
      child.setAttribute('decoding', 'async');
      if (ctx.imgCount++ === 0) child.setAttribute('fetchpriority', 'high');
      else child.setAttribute('loading', 'lazy');
    }

    const label = child.getAttribute('data-screen-label');
    walk(child, props, doc, label ? { ...ctx, screen: label } : ctx);
  }
}

// ---------------------------------------------------------------- accessibility + form
function enhance(doc, root) {
  for (const a of root.querySelectorAll('a[href]')) {
    const href = a.getAttribute('href');
    if (/facebook\.com/.test(href)) a.setAttribute('aria-label', 'UniMath na Facebooku');
    if (/instagram\.com/.test(href)) a.setAttribute('aria-label', 'UniMath na Instagramu');
    if (/^https?:/.test(href)) {
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener');
    }
  }

  const form = root.querySelector('form');
  if (!form) return false;

  form.setAttribute('id', 'kontakt-forma');
  form.setAttribute('method', 'post');
  form.setAttribute('action', '');

  const fields = [
    ['ime', 'text', true, 'name'],
    ['email', 'email', true, 'email'],
    ['telefon', 'tel', false, 'tel'],
  ];
  const inputs = [...form.querySelectorAll('input[type="text"],input[type="email"],input[type="tel"]')];
  inputs.forEach((el, i) => {
    const [name, , required, autocomplete] = fields[i];
    el.setAttribute('name', name);
    el.setAttribute('id', 'f-' + name);
    el.setAttribute('autocomplete', autocomplete);
    if (required) el.setAttribute('required', '');
  });

  const ta = form.querySelector('textarea');
  if (ta) {
    ta.setAttribute('name', 'poruka');
    ta.setAttribute('id', 'f-poruka');
  }

  const cb = form.querySelector('input[type="checkbox"]');
  if (cb) {
    cb.setAttribute('name', 'privatnost');
    cb.setAttribute('id', 'f-privatnost');
    cb.setAttribute('required', '');
  }

  // honeypot — catches the dumbest spam bots, invisible and unlabelled for humans
  const hp = doc.createElement('input');
  hp.setAttribute('type', 'text');
  hp.setAttribute('name', 'website');
  hp.setAttribute('tabindex', '-1');
  hp.setAttribute('autocomplete', 'off');
  hp.setAttribute('aria-hidden', 'true');
  hp.setAttribute('class', 'hp');
  form.insertBefore(hp, form.lastElementChild);

  const status = doc.createElement('p');
  status.setAttribute('id', 'forma-status');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.setAttribute('class', 'forma-status');
  form.appendChild(status);

  const btn = form.querySelector('button');
  btn.setAttribute('type', 'submit');
  btn.setAttribute('id', 'forma-gumb');
  return true;
}

// ---------------------------------------------------------------- structured data
function faqJsonLd(root) {
  const items = [...root.querySelectorAll('details')].map((d) => {
    const q = d.querySelector('summary');
    const a = d.querySelector('p');
    if (!q || !a) return null;
    // strip the trailing "+" glyph from the summary
    const text = [...q.childNodes]
      .filter((n) => n.nodeType === 3 || (n.nodeType === 1 && n.tagName !== 'SPAN'))
      .map((n) => n.textContent)
      .join('')
      .trim();
    return {
      '@type': 'Question',
      name: text,
      acceptedAnswer: { '@type': 'Answer', text: a.textContent.trim() },
    };
  }).filter(Boolean);

  if (!items.length) return null;
  return { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: items };
}

function orgJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'EducationalOrganization',
    name: 'UniMath',
    legalName: 'Unimath, obrt za usluge, vl. Maja Horvat',
    url: META.SITE + '/',
    logo: META.SITE + '/assets/img/favicon.svg',
    image: META.SITE + '/assets/img/unimath-hero.jpg',
    email: 'info@unimath.hr',
    telephone: '+385912404994',
    description:
      'Individualne online instrukcije iz matematike i fizike za učenike osnovnih i srednjih škola, ' +
      'pripreme za prijemne ispite za gimnazije i za državnu maturu.',
    areaServed: { '@type': 'Country', name: 'Hrvatska' },
    address: { '@type': 'PostalAddress', addressLocality: 'Zagreb', addressCountry: 'HR' },
    sameAs: [
      'https://www.facebook.com/profile.php?id=61550838506362',
      'https://www.instagram.com/unimath.hr/',
    ],
  };
}

function articleJsonLd(m, root) {
  const h1 = root.querySelector('h1');
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: h1 ? h1.textContent.trim() : m.title,
    description: m.desc,
    image: `${META.SITE}/assets/img/${m.og}.jpg`,
    datePublished: m.date,
    author: { '@type': 'Organization', name: 'UniMath' },
    publisher: {
      '@type': 'Organization',
      name: 'UniMath',
      logo: { '@type': 'ImageObject', url: META.SITE + '/assets/img/favicon.svg' },
    },
    mainEntityOfPage: `${META.SITE}/${m.out}`,
  };
}

// ---------------------------------------------------------------- head
function buildHead(m, extraJsonLd) {
  const canonical = META.SITE + '/' + (m.out === 'index.html' ? '' : m.out);
  const ogImg = `${META.SITE}/assets/img/${m.og}.jpg`;
  // preload only the latin subsets — latin-ext loads on demand for č/ć/ž/š/đ
  const preload = fontFiles
    .filter((f) => !f.includes('-ext'))
    .map((f) => `<link rel="preload" href="assets/fonts/${f}" as="font" type="font/woff2" crossorigin>`)
    .join('\n');

  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

  return `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(m.title)}</title>
<meta name="description" content="${esc(m.desc)}">
<link rel="canonical" href="${canonical}">
<meta name="robots" content="index, follow">
<meta name="theme-color" content="#0D7377">

<meta property="og:type" content="${m.type}">
<meta property="og:site_name" content="UniMath">
<meta property="og:locale" content="${META.LOCALE}">
<meta property="og:title" content="${esc(m.title)}">
<meta property="og:description" content="${esc(m.desc)}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${ogImg}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(m.title)}">
<meta name="twitter:description" content="${esc(m.desc)}">
<meta name="twitter:image" content="${ogImg}">

<link rel="icon" href="assets/img/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="assets/img/apple-touch-icon.png">
${preload}
<link rel="stylesheet" href="assets/css/style.css">
${extraJsonLd.map((j) => `<script type="application/ld+json">${JSON.stringify(j)}</script>`).join('\n')}`;
}

// ---------------------------------------------------------------- run
fs.mkdirSync(OUT, { recursive: true });
let hasForm = false;
const built = [];

for (const [srcFile, m] of Object.entries(META.pages)) {
  const doc = loadDoc(srcFile);
  const defaults = propDefaults(doc);
  const root = doc.querySelector('x-dc').cloneNode(true);

  const ctx = { defaults, screen: null, imgCount: 0 };
  walk(root, {}, doc, ctx);

  const formOnPage = enhance(doc, root);
  hasForm = hasForm || formOnPage;

  const jsonld = [];
  if (m.out === 'index.html') {
    jsonld.push(orgJsonLd());
    const faq = faqJsonLd(root);
    if (faq) jsonld.push(faq);
  } else if (m.type === 'article') {
    jsonld.push(articleJsonLd(m, root));
  }

  const body = root.innerHTML.trim();
  const script = formOnPage ? '\n<script src="assets/js/form.js" defer></script>' : '';
  const html = `<!doctype html>
<html lang="hr">
<head>
${buildHead(m, jsonld)}
</head>
<body>
${body}${script}
</body>
</html>
`;

  fs.writeFileSync(path.join(OUT, m.out), html, 'utf8');
  built.push({ out: m.out, bytes: Buffer.byteLength(html), form: formOnPage, jsonld: jsonld.length });
}

// ---------------------------------------------------------------- stylesheet
const fontsCss = fs.readFileSync(path.join(__dirname, 'fonts.css'), 'utf8');

const globalCss = `
/* ---- base ---- */
html{scroll-behavior:smooth}
body{margin:0;font-family:'Figtree',sans-serif;color:#1F2A44;background:#fff}
a{color:#0D7377}
a:hover{color:#E2477E}
details summary::-webkit-details-marker{display:none}
:focus-visible{outline:3px solid #0D7377;outline-offset:2px}

/* Images carry width/height attributes so the browser can reserve space before
   they load. Those attributes also act as a presentational height, which would
   stretch any image whose CSS sets only a width — height:auto restores the
   aspect ratio. Elements that set an explicit height in their own class win,
   since .sN.sN (0,2,0) beats this (0,0,1). */
img{height:auto}

/* contact form helpers */
.hp{position:absolute;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none}
.forma-status{margin:0;font-size:14.5px;line-height:1.5;font-weight:600;min-height:0}
.forma-status:empty{display:none}
.forma-status[data-stanje="ok"]{color:#0A6E52}
.forma-status[data-stanje="greska"]{color:#C42B2B}
`;

const responsiveCss = `
/* ---- responsive ----
   .mq-grid / .mq-heroblob replace the original [style*="..."] selectors,
   which could not survive lifting inline styles into classes. */
@media (max-width:860px){
  .mq-grid{grid-template-columns:1fr !important}
  [data-screen-label="Brojke"] > div{grid-template-columns:1fr 1fr !important;padding:28px 20px !important}
  h1{font-size:clamp(32px,9vw,42px) !important;letter-spacing:-1px !important}
  h2{font-size:clamp(26px,7vw,32px) !important}
  header > div{flex-wrap:wrap;padding:12px 16px !important;gap:10px 12px !important}
  header nav{order:3;width:100%;margin-left:0 !important;overflow-x:auto;gap:18px !important;scrollbar-width:none}
  header nav a{white-space:nowrap}
  header > div > a[href*="kontakt"]{margin-left:auto;font-size:13.5px !important;padding:9px 16px !important}
  [data-screen-label="Hero"] > div{padding:44px 20px 52px !important;gap:40px !important}
  [data-screen-label="Hero"] .mq-heroblob{width:min(300px,82vw) !important;height:380px !important}
  section > div, article, footer > div{padding-left:20px !important;padding-right:20px !important}
  form{padding:24px !important}
}
`;

let sheet = fontsCss + globalCss + '\n/* ---- element styles (lifted from inline style="") ---- */\n';
for (const [css, cls] of baseClasses) sheet += `.${cls}.${cls}{${css}}\n`;
sheet += '\n/* ---- interaction states (from style-hover / style-focus) ---- */\n';
for (const [key, cls] of pseudoClasses) {
  const i = key.indexOf('|');
  sheet += `.${cls}.${cls}:${key.slice(0, i)}{${key.slice(i + 1)}}\n`;
}
sheet += responsiveCss;

fs.mkdirSync(path.join(OUT, 'assets/css'), { recursive: true });
fs.writeFileSync(path.join(OUT, 'assets/css/style.css'), sheet, 'utf8');
fs.unlinkSync(path.join(__dirname, 'fonts.css'));

console.log(built.map((b) => `${b.out.padEnd(34)} ${String(b.bytes).padStart(7)}b  jsonld:${b.jsonld}${b.form ? '  +form' : ''}`).join('\n'));
console.log(`\n${baseClasses.size} style classes, ${pseudoClasses.size} interaction classes`);
console.log(`stylesheet ${Buffer.byteLength(sheet)}b`);
if (!hasForm) throw new Error('contact form never found — check the enhance() selectors');
