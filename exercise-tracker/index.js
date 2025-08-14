// Exercise Tracker (FCC)
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.urlencoded({ extended: false })); // FCC uses x-www-form-urlencoded
app.use(express.json());

// ---- MongoDB ----
const MONGODB_URI =
  process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/exercise-tracker';
mongoose
  .connect(MONGODB_URI, { dbName: 'exercise-tracker', autoIndex: true })
  .then(() => console.log('Mongo connected'))
  .catch((e) => console.error('Mongo error', e));

// ---- Models ----
const userSchema = new mongoose.Schema(
  { username: { type: String, required: true } },
  { timestamps: true }
);

const exerciseSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    description: { type: String, required: true },
    duration: { type: Number, required: true }, // minutes
    date: { type: Date, required: true }
  },
  { timestamps: true }
);

const User = mongoose.model('User', userSchema);
const Exercise = mongoose.model('Exercise', exerciseSchema);

// ---- Helpers ----
const toDStr = (d) => new Date(d).toDateString(); // "Mon Jan 01 1990"

// ---- Root (tiny help) ----
app.get('/', (_req, res) => {
  res.type('text').send(
    'Exercise Tracker\n' +
      'POST /api/users (username)\n' +
      'GET  /api/users\n' +
      'POST /api/users/:_id/exercises (description,duration,[date])\n' +
      'GET  /api/users/:_id/logs?from&to&limit\n'
  );
});

// ---- Routes (FCC) ----

// Create user -> { username, _id }
app.post('/api/users', async (req, res) => {
  const username = (req.body.username || '').trim();
  if (!username) return res.status(400).json({ error: 'username required' });
  const user = await User.create({ username });
  res.json({ username: user.username, _id: user._id });
});

// List users -> [{ username, _id }, ...]
app.get('/api/users', async (_req, res) => {
  const users = await User.find({}, { username: 1 }).lean();
  res.json(users.map((u) => ({ username: u.username, _id: u._id })));
});

// Add exercise -> { _id, username, date, duration, description }
app.post('/api/users/:_id/exercises', async (req, res) => {
  const { _id } = req.params;
  const { description, duration, date } = req.body;

  const user = await User.findById(_id);
  if (!user) return res.status(404).json({ error: 'unknown userId' });

  const desc = (description || '').trim();
  const dur = Number(duration);
  if (!desc || !Number.isFinite(dur))
    return res.status(400).json({ error: 'description and duration required' });

  const when = date ? new Date(date) : new Date();
  if (isNaN(when.getTime())) return res.status(400).json({ error: 'Invalid Date' });

  const ex = await Exercise.create({
    userId: user._id,
    description: desc,
    duration: dur,
    date: when
  });

  // Response shape required by FCC
  res.json({
    _id: user._id,
    username: user.username,
    date: toDStr(when),
    duration: ex.duration,
    description: ex.description
  });
});

// Get logs -> { username, count, _id, log: [{ description, duration, date }], [from], [to] }
app.get('/api/users/:_id/logs', async (req, res) => {
  const { _id } = req.params;
  const { from, to, limit } = req.query;

  const user = await User.findById(_id);
  if (!user) return res.status(404).json({ error: 'unknown userId' });

  const query = { userId: user._id };
  let start, end;

  if (from) {
    start = new Date(from);
    if (!isNaN(start)) query.date = { ...(query.date || {}), $gte: start };
  }
  if (to) {
    end = new Date(to);
    if (!isNaN(end)) query.date = { ...(query.date || {}), $lte: end };
  }

  const lim = limit ? parseInt(limit, 10) : 0;

  const docs = await Exercise.find(query).sort({ date: 1 }).limit(lim).lean();

  const log = docs.map((d) => ({
    description: d.description,
    duration: d.duration,
    date: toDStr(d.date)
  }));

  const out = {
    _id: user._id,
    username: user.username,
    count: docs.length,
    log
  };
  if (start && !isNaN(start)) out.from = toDStr(start);
  if (end && !isNaN(end)) out.to = toDStr(end);

  res.json(out);
});

// ---- Start ----
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`));
