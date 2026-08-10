# Deployment (cPanel)

The site has two parts, both hosted on cPanel:

- **Static site** (`index.html`, `assets/`, all `clanak-*.html`, `blog.html`, `posts.json`,
  `robots.txt`, `sitemap.xml`, …) → served from `public_html`.
- **Contact-form backend** (`backend/`) — a small Express app that sends the form via
  SMTP → runs as a cPanel **Node.js application** mounted at `/api`.

The form on the site POSTs to `/api/send-form` (same domain, no CORS issues).

## 1. Upload the static site

Upload everything **except** `backend/`, `.git/`, `.github/`, `.vscode/`, `README.md`
and `DEPLOYMENT.md` into `public_html/` (File Manager zip-upload or FTP).

## 2. Deploy the backend

Requires the "**Setup Node.js App**" feature in cPanel (most hosts have it; if yours
doesn't, ask support to enable it).

1. Create the mailbox for sending in cPanel → **Email Accounts**, e.g. `no-reply@unimath.hr`.
   Note the SMTP settings under *Connect Devices* (host is usually `mail.unimath.hr`, port 465 SSL).
2. cPanel → **Setup Node.js App** → *Create Application*:
   - Node.js version: **18 or newer**
   - Application mode: `Production`
   - Application root: `unimath-backend` (a folder in your home dir, *outside* `public_html`)
   - Application URL: your domain + `/api` (e.g. `unimath.hr/api`)
   - Application startup file: `server.js`
3. Upload `backend/server.js` and `backend/package.json` into `~/unimath-backend/`.
   **Do not upload `node_modules` or `.env` with placeholder values.**
4. In the Node.js App screen add the environment variables (see `backend/.env.example`):
   - `SMTP_HOST` = `mail.unimath.hr`
   - `SMTP_PORT` = `465`, `SMTP_SECURE` = `true`
   - `SMTP_USER` / `SMTP_PASS` = the mailbox credentials
   - `SENDER_EMAIL` = `no-reply@unimath.hr`
   - `TO_EMAIL` = `info@unimath.hr`
   - `ALLOWED_ORIGINS` = `https://unimath.hr,https://www.unimath.hr`
5. Click **Run NPM Install**, then **Restart**.

## 3. Verify

- Make sure SSL is active for the domain (cPanel → SSL/TLS Status → AutoSSL).
- Test the endpoint:
  ```bash
  curl -X POST https://unimath.hr/api/send-form -F email=test@test.com -F poruka=proba
  ```
  → should return `{"ok":true}` and deliver a mail to `TO_EMAIL`.
- Submit the form on the live site and check the inbox.

## Notes

- The old GitHub Pages workflows in `.github/workflows/` are left in place but are no
  longer the hosting target; disable them in the repo's Actions settings if unwanted.
- The backend accepts the form on both `/send-form` and `/api/send-form`, so it works
  regardless of whether Passenger strips the `/api` prefix.

## Local development

```bash
cd backend
cp .env.example .env   # fill in real SMTP credentials
npm install
npm start              # serves the whole site + form endpoint on http://localhost:8000
```
