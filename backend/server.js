require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const nodemailer = require('nodemailer');
const path = require('path');

const app = express();
const upload = multer();

const PORT = process.env.PORT || 8000;

app.use(cors());

app.use(express.static(path.join(__dirname, '..')));

app.post('/send-form', upload.none(), async (req, res) => {
  try {
    const body = req.body || {};

    if (body.website) return res.status(400).json({ ok: false, message: 'bot' });

    const name = body.ime || body.name || 'Nepoznato';
    const fromEmail = body.email || body.mail || '';
    const phone = body.telefon || body.phone || '';
    const message = body.poruka || body.message || '';

    const subject = process.env.EMAIL_SUBJECT || 'Upit s web stranice';

    const text = `Ime i prezime: ${name}
Email: ${fromEmail}
Telefon: ${phone}

${message}`;

    // create transport
    const smtpOpts = {
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: (process.env.SMTP_SECURE === 'true') || false,
    };

    if (process.env.SMTP_USER) {
      smtpOpts.auth = {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      };
    }

    const transporter = nodemailer.createTransport(smtpOpts);

    const mailOptions = {
      from: process.env.SENDER_EMAIL || process.env.SMTP_USER || 'no-reply@example.com',
      to: process.env.TO_EMAIL || 'lukaspiljak.lukaspiljak@gmail.com',
      subject: subject,
      text: text,
      html: text.replace(/\n/g, '<br>')
    };

    console.log('Sending contact form to', mailOptions.to);

    await transporter.sendMail(mailOptions);

    res.json({ ok: true });
  } catch (err) {
    console.error('send-form error', err);
    res.status(500).json({ ok: false, error: 'send_failed' });
  }
});

app.get('*', (req, res, next) => {
  if (req.method !== 'GET') return next();
  res.sendFile(path.join(__dirname, '..', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Form backend listening on port ${PORT}`);
});
