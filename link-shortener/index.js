const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const dns = require('dns');
const { URL } = require('url');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const ENABLE_DNS = String(process.env.ENABLE_DNS || '').toLowerCase() === 'true';

// ----- MongoDB -----
const MONGODB_URI =
  process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/url-shortener';
mongoose
  .connect(MONGODB_URI, { dbName: 'url-shortener', autoIndex: true })
  .then(() => console.log('Mongo connected'))
  .catch((e) => console.error('Mongo error', e));

// ----- Models -----
const counterSchema = new mongoose.Schema({ _id: String, seq: { type: Number, default: 0 } });
const Counter = mongoose.model('Counter', counterSchema);

async function nextSeq(name) {
  const doc = await Counter.findByIdAndUpdate(
    name,
    { $inc: { seq: 1 } },
    { upsert: true, new: true }
  );
  return doc.seq;
}

const shortSchema = new mongoose.Schema({
  original_url: { type: String, required: true },
  short_url:   { type: Number, required: true, unique: true }
});
const Short = mongoose.model('Short', shortSchema);

// ----- Helpers -----
function isValidHttpUrl(u) {
  try {
    const test = new URL(u);
    return (test.protocol === 'http:' || test.protocol === 'https:') && !!test.hostname;
  } catch {
    return false;
  }
}

function dnsOk(hostname) {
  return new Promise((resolve) => {
    dns.lookup(hostname, (err) => resolve(!err));
  });
}

// ----- Routes -----
app.get('/', (_req, res) => {
  res.type('text').send(
    'URL Shortener Microservice\n' +
    'POST /api/shorturl  (x-www-form-urlencoded: url=https://example.com)\n' +
    'GET  /api/shorturl/:short  -> redirect\n'
  );
});

// Create short URL
app.post('/api/shorturl', async (req, res) => {
  const url = req.body.url;

  // Strict format per FCC: must be http/https with a hostname
  if (!isValidHttpUrl(url)) return res.json({ error: 'invalid url' }); // <-- exact text

  // Optional DNS verification (disabled by default to avoid false negatives on some hosts)
  if (ENABLE_DNS) {
    const { hostname } = new URL(url);
    const ok = await dnsOk(hostname);
    if (!ok) return res.json({ error: 'invalid url' });
  }

  // Reuse existing mapping if present (not required by FCC, but nice to have)
  const existing = await Short.findOne({ original_url: url });
  if (existing) return res.json({ original_url: existing.original_url, short_url: existing.short_url });

  const code = await nextSeq('short');
  const doc = await Short.create({ original_url: url, short_url: code });
  res.json({ original_url: doc.original_url, short_url: doc.short_url });
});

// Visit short URL
app.get('/api/shorturl/:short', async (req, res) => {
  const n = Number(req.params.short);
  if (!Number.isFinite(n)) return res.status(400).json({ error: 'invalid url' });
  const doc = await Short.findOne({ short_url: n });
  if (!doc) return res.status(404).json({ error: 'invalid url' });
  res.redirect(doc.original_url);
});

// ----- Start -----
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`));
