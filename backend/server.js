require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const nodemailer = require('nodemailer');
const path = require('path');

const app = express();
const upload = multer();

const PORT = process.env.PORT || 8000;

// Iza cPanel/Passenger proxyja
app.set('trust proxy', 1);

const allowedOrigins = (process.env.ALLOWED_ORIGINS ||
  'https://unimath.hr,https://www.unimath.hr,http://localhost:8000')
  .split(',')
  .map(function (o) { return o.trim(); })
  .filter(Boolean);

app.use(cors({
  origin: function (origin, cb) {
    // dopusti zahtjeve bez Origin headera (same-origin, curl)
    if (!origin || allowedOrigins.indexOf(origin) !== -1) return cb(null, true);
    return cb(new Error('CORS: origin not allowed'));
  },
}));

app.use(express.static(path.join(__dirname, '..')));

function clip(value, max) {
  return String(value || '').slice(0, max).trim();
}

// '/send-form' kad Node poslužuje cijeli site,
// '/api/send-form' kad je backend montiran pod /api na cPanelu
app.post(['/send-form', '/api/send-form'], upload.none(), async (req, res) => {
  try {
    const body = req.body || {};

    // honeypot
    if (body.website) return res.status(400).json({ ok: false, message: 'bot' });

    const name = clip(body.ime || body.name, 200);
    const fromEmail = clip(body.email || body.mail, 320);
    const phone = clip(body.telefon || body.phone, 50);
    const message = clip(body.poruka || body.message, 5000);

    if (!fromEmail || !message) {
      return res.status(400).json({ ok: false, error: 'missing_fields' });
    }

    const subject = process.env.EMAIL_SUBJECT || 'Upit s web stranice';

    const text = `Ime i prezime: ${name}
Email: ${fromEmail}
Telefon: ${phone}

${message}`;

    const smtpOpts = {
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: process.env.SMTP_SECURE === 'true',
    };

    if (process.env.SMTP_USER) {
      smtpOpts.auth = {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      };
    }

    const transporter = nodemailer.createTransport(smtpOpts);

    const mailOptions = {
      from: process.env.SENDER_EMAIL || process.env.SMTP_USER,
      to: process.env.TO_EMAIL || 'info@unimath.hr',
      replyTo: fromEmail,
      subject: subject,
      text: text,
      html: text.replace(/\n/g, '<br>'),
    };

    await transporter.sendMail(mailOptions);

    res.json({ ok: true });
  } catch (err) {
    console.error('send-form error', err);
    res.status(500).json({ ok: false, error: 'send_failed' });
  }
});

app.listen(PORT, () => {
  console.log(`Form backend listening on port ${PORT}`);
});
