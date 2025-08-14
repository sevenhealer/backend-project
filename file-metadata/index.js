const express = require('express');
const cors = require('cors');
const multer = require('multer');
require('dotenv').config();

const app = express();

// Basic middleware
app.use(cors());
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// (Optional) Serve a simple upload page
app.use(express.static('public'));

// Multer in-memory storage is enough (we only return metadata)
const upload = multer({ storage: multer.memoryStorage() });

// FCC endpoint: field name MUST be "upfile"
app.post('/api/fileanalyse', upload.single('upfile'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const { originalname, mimetype, size } = req.file;
  res.json({ name: originalname, type: mimetype, size });
});

// Health / root
app.get('/', (_req, res) => {
  res.type('text').send(
    'File Metadata Microservice\n\n' +
    'POST /api/fileanalyse (multipart/form-data, field name: upfile)\n'
  );
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`));
