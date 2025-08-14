const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// Optional but harmless: if you deploy behind a proxy, express can parse req.ip properly
// app.set('trust proxy', true);

// Helper to grab client IP safely
function getClientIp(req) {
  const xff = (req.headers['x-forwarded-for'] || '').toString().split(',')[0].trim();
  const direct =
    (req.ip || req.socket?.remoteAddress || '').toString().split(',')[0].trim();

  // Prefer X-Forwarded-For when present (common on Render/Railway/Heroku)
  const raw = xff || direct || '';
  // Normalize IPv6-mapped IPv4 (e.g., ::ffff:127.0.0.1)
  return raw.replace(/^::ffff:/, '');
}

// Root page (tiny help)
app.get('/', (_req, res) => {
  res.type('text').send(
    'Request Header Parser Microservice\n\n' +
      'GET /api/whoami -> { ipaddress, language, software }\n'
  );
});

// The endpoint FCC tests:
app.get('/api/whoami', (req, res) => {
  const ipaddress = getClientIp(req);
  const language = req.headers['accept-language'] || '';
  const software = req.headers['user-agent'] || '';
  res.json({ ipaddress, language, software });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
