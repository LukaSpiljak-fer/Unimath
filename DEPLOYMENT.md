# Deployment (cPanel — MyDataKnox shared hosting)

Everything is hosted on cPanel. No Node.js needed — the contact form is handled by a
plain PHP script (`api/send-form.php`), which works on every shared hosting plan.

- **Static site**: `index.html`, all `clanak-*.html`, `blog.html`, `assets/`,
  `posts.json`, `robots.txt`, `sitemap.xml` → `public_html/`
- **Form handler**: `api/send-form.php` → `public_html/api/send-form.php`
- The form on the site POSTs to `/api/send-form.php` (same domain, no CORS setup needed).

## 1. Upload the site

Upload everything **except** `backend/`, `.git/`, `.github/`, `.vscode/`, `README.md`
and `DEPLOYMENT.md` into `public_html/`:

1. Zip the project folder locally (without the folders above).
2. cPanel → **File Manager** → `public_html` → *Upload* → then *Extract*.
   (Or use FTP with the credentials from your MyDataKnox welcome mail.)
3. Make sure `index.html` ends up directly in `public_html/`, not in a subfolder,
   and that `api/send-form.php` is at `public_html/api/send-form.php`.

## 2. Email

1. cPanel → **Email Accounts** → make sure `info@unimath.hr` exists (that's where
   form submissions are delivered). If mail for the domain is hosted elsewhere
   (e.g. Google Workspace), that's fine too — delivery goes to wherever the domain's
   MX records point.
2. The script sends from `no-reply@unimath.hr` with the visitor's address as
   *Reply-To*, so you can hit "Reply" directly. Creating a `no-reply@unimath.hr`
   mailbox (or at least not blocking the address) improves deliverability, but is
   not strictly required — shared cPanel hosts allow `mail()` from the domain.

## 3. Domain & SSL

1. Point `unimath.hr` to the hosting (nameservers or A record — MyDataKnox support
   can confirm the values; skip if the domain is already with them).
2. cPanel → **SSL/TLS Status** → run **AutoSSL** for `unimath.hr` and `www.unimath.hr`.
3. Optionally force HTTPS: cPanel → Domains → toggle *Force HTTPS Redirect*.

## 4. Verify

```bash
curl -X POST https://unimath.hr/api/send-form.php -F email=test@test.com -F poruka=proba
```
→ should return `{"ok":true}` and a mail should arrive at `info@unimath.hr`
(check spam folder on the first try). Then submit the form on the live site.

## Notes

- `backend/` (the Node.js version of the form handler) is **not deployed** — it's kept
  in the repo only in case the site ever moves to a host with Node.js support.
- The GitHub Pages workflows in `.github/workflows/` are no longer the hosting target;
  disable them under the repo's Actions settings so the site isn't published twice.
- To change the recipient address or subject, edit the `$to` / `$subject` variables
  at the top of `api/send-form.php`.
