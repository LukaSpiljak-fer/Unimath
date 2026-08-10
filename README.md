# Unimath

Statični web s kontakt formom (PHP) za unimath.hr.

## Blog

Podaci o člancima žive u `posts.json`. Nakon izmjene (novi članak, promjena naslova/slike)
regeneriraj statične kartice na blogu i naslovnici:

```bash
node scripts/build-blog.js
```

Skripta upisuje kartice između `<!-- blog-cards:start/end -->` markera u `blog.html`
i `index.html` (naslovnica prikazuje zadnja 3 članka). Sam članak je zasebna
`clanak-*.html` stranica — ne zaboravi je dodati i u `sitemap.xml`.
