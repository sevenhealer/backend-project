// index.js
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const multer = require('multer');
const dns = require('dns');
const { URL } = require('url');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// ---- MongoDB ----
// Use your own Atlas/local URI via .env MONGODB_URI
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/backend';
mongoose
  .connect(MONGODB_URI, { dbName: 'timestamp', autoIndex: true })
  .then(() => console.log('Mongo connected'))
  .catch((e) => console.error('Mongo error', e));

// ---- Models ----
const counterSchema = new mongoose.Schema({ _id: String, seq: { type: Number, default: 0 } });
const Counter = mongoose.model('Counter', counterSchema);

async function nextSeq(name) {
  const doc = await Counter.findByIdAndUpdate(
    name,
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return doc.seq;
}

// URL Shortener
const shortSchema = new mongoose.Schema({
  original_url: { type: String, required: true },
  short_url: { type: Number, required: true, unique: true },
});
const Short = mongoose.model('Short', shortSchema);

// Exercise Tracker
const userSchema = new mongoose.Schema({ username: { type: String, required: true } });
const exerciseSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  description: { type: String, required: true },
  duration: { type: Number, required: true }, // minutes
  date: { type: Date, required: true },
});
const User = mongoose.model('User', userSchema);
const Exercise = mongoose.model('Exercise', exerciseSchema);

// Root page (tiny help)
app.get('/', (req, res) => {
  res.type('text').send(
    `freeCodeCamp Back End & APIs – All-in-1\n\n` +
      `Timestamp: GET /api (now), GET /api/:date\n` +
      `Header Parser: GET /api/whoami\n` +
      `URL Shortener: POST /api/shorturl | GET /api/shorturl/:short\n` +
      `Exercise Tracker: POST /api/users, GET /api/users, POST /api/users/:_id/exercises, GET /api/users/:_id/logs\n` +
      `File Metadata: POST /api/fileanalyse (form-data: upfile)`
  );
});

// ---------- 2) Request Header Parser Microservice (place BEFORE timestamp param route)
app.get('/api/whoami', (req, res) => {
  const ip =
    (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '')
      .toString()
      .split(',')[0]
      .trim();
  const language = req.headers['accept-language'] || '';
  const software = req.headers['user-agent'] || '';
  res.json({ ipaddress: ip, language, software });
});

// ---------- 3) URL Shortener Microservice (before timestamp param route)
function isValidHttpUrl(u) {
  try {
    const test = new URL(u);
    return test.protocol === 'http:' || test.protocol === 'https:';
  } catch {
    return false;
  }
}

async function verifyDns(urlStr) {
  const { hostname } = new URL(urlStr);
  return new Promise((resolve) => {
    dns.lookup(hostname, (err) => resolve(!err));
  });
}

app.post('/api/shorturl', async (req, res) => {
  const url = req.body.url;
  if (!isValidHttpUrl(url)) return res.json({ error: 'invalid URL' });
  const ok = await verifyDns(url);
  if (!ok) return res.json({ error: 'invalid URL' });
  const short = await nextSeq('short');
  const doc = await Short.create({ original_url: url, short_url: short });
  res.json({ original_url: doc.original_url, short_url: doc.short_url });
});

app.get('/api/shorturl/:short', async (req, res) => {
  const n = Number(req.params.short);
  if (!Number.isFinite(n)) return res.status(400).json({ error: 'invalid short code' });
  const doc = await Short.findOne({ short_url: n });
  if (!doc) return res.status(404).json({ error: 'No short URL found' });
  res.redirect(doc.original_url);
});

// ---------- 4) Exercise Tracker (before timestamp param route)
app.post('/api/users', async (req, res) => {
  const username = (req.body.username || '').trim();
  if (!username) return res.status(400).json({ error: 'username required' });
  const user = await User.create({ username });
  res.json({ username: user.username, _id: user._id });
});

app.get('/api/users', async (req, res) => {
  const users = await User.find({}, { username: 1 }).lean();
  res.json(users.map((u) => ({ username: u.username, _id: u._id })));
});

app.post('/api/users/:_id/exercises', async (req, res) => {
  const { _id } = req.params;
  const { description, duration, date } = req.body;
  const user = await User.findById(_id);
  if (!user) return res.status(404).json({ error: 'unknown userId' });
  const when = date ? new Date(date) : new Date();
  if (isNaN(when.getTime())) return res.status(400).json({ error: 'Invalid Date' });
  const dur = Number(duration);
  if (!description || !Number.isFinite(dur))
    return res.status(400).json({ error: 'description and duration required' });
  const ex = await Exercise.create({ userId: user._id, description, duration: dur, date: when });
  res.json({
    _id: user._id,
    username: user.username,
    date: when.toDateString(),
    duration: ex.duration,
    description: ex.description,
  });
});

app.get('/api/users/:_id/logs', async (req, res) => {
  const { _id } = req.params;
  const { from, to, limit } = req.query;
  const user = await User.findById(_id);
  if (!user) return res.status(404).json({ error: 'unknown userId' });
  const find = { userId: user._id };
  let start, end;
  if (from) {
    start = new Date(from);
    if (!isNaN(start)) find.date = { ...(find.date || {}), $gte: start };
  }
  if (to) {
    end = new Date(to);
    if (!isNaN(end)) find.date = { ...(find.date || {}), $lte: end };
  }
  const lim = limit ? parseInt(limit, 10) : undefined;
  const docs = await Exercise.find(find).sort({ date: 1 }).limit(lim || 0).lean();
  const log = docs.map((d) => ({
    description: d.description,
    duration: d.duration,
    date: new Date(d.date).toDateString(),
  }));
  res.json({ _id: user._id, username: user.username, count: docs.length, log });
});

// ---------- 5) File Metadata Microservice (before timestamp param route)
const upload = multer({ storage: multer.memoryStorage() });
app.post('/api/fileanalyse', upload.single('upfile'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  res.json({ name: req.file.originalname, type: req.file.mimetype, size: req.file.size });
});

// ---------- 1) Timestamp Microservice (put LAST so other /api/* routes take precedence)
function makeTimeResponse(dateInput) {
  let d;
  if (dateInput == null) {
    d = new Date(); // now
  } else if (/^\d+$/.test(dateInput)) {
    // numeric: treat <=10 digits as seconds, otherwise milliseconds
    const n = Number(dateInput);
    d = dateInput.length <= 10 ? new Date(n * 1000) : new Date(n);
  } else {
    d = new Date(dateInput);
  }
  if (isNaN(d.getTime())) return { error: 'Invalid Date' };
  return { unix: d.getTime(), utc: d.toUTCString() };
}

// No-date route -> current time
app.get('/api', (req, res) => {
  res.json(makeTimeResponse());
});

// With date param
app.get('/api/:date', (req, res) => {
  res.json(makeTimeResponse(req.params.date));
});

// ---- Start server ----
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
