# Deployment (cPanel — MyDataKnox shared hosting)

Everything is hosted on cPanel. No Node.js needed — the contact form is handled by a
plain PHP script (`api/send-form.php`), which works on every shared hosting plan.

- **Static site**: `index.html`, all `clanak-*.html`, `blog.html`, `assets/`,
  `posts.json`, `robots.txt`, `sitemap.xml` → `public_html/`
- **Form handler**: `api/send-form.php` → `public_html/api/send-form.php`
- The form on the site POSTs to `/api/send-form.php` (same domain, no CORS setup needed).

## 1. Automatic deploy (GitHub Actions → FTP)

`.github/workflows/deploy-cpanel.yml` syncs the site to `public_html/` over FTPS on
every push to `main` (only changed files are uploaded). One-time setup:

1. cPanel → **FTP Accounts** → *Add FTP Account*:
   - Username: e.g. `deploy@unimath.hr`
   - Directory: set it to `public_html` (so the account can't touch anything else)
   - Strong password
2. GitHub repo → **Settings → Secrets and variables → Actions → Secrets** → add:
   - `FTP_SERVER` — the FTP host from cPanel (usually your domain or the server
     hostname from the MyDataKnox welcome mail, e.g. `ftp.unimath.hr`)
   - `FTP_USERNAME` — `deploy@unimath.hr`
   - `FTP_PASSWORD` — the password from step 1
3. Push to `main` (or run the workflow manually under Actions). The first run uploads
   everything and can take a few minutes; later runs upload only what changed.

The workflow excludes `backend/`, `.github/`, `.vscode/`, `README.md` and
`DEPLOYMENT.md` automatically.

### Manual upload (fallback)

Zip the project (without the folders above), then cPanel → **File Manager** →
`public_html` → *Upload* → *Extract*. Make sure `index.html` ends up directly in
`public_html/` and the form handler at `public_html/api/send-form.php`.

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
- The old GitHub Pages workflows no longer run automatically (manual trigger only);
  `deploy-cpanel.yml` is the active deployment.
- To change the recipient address or subject, edit the `$to` / `$subject` variables
  at the top of `api/send-form.php`.
