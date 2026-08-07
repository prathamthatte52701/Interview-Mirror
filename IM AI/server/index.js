import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import './lib/env.js';
import { connectDatabase, getDbStatus } from './config/db.js';
import authRoutes from './routes/authRoutes.js';
import cityRoutes from './routes/cityRoutes.js';
import interviewRoutes from './routes/interviewRoutes.js';

const app = express();
const PORT = process.env.PORT || 5000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || process.env.CLIENT_URL || 'http://localhost:5173,http://127.0.0.1:5173';
const allowedOrigins = new Set(
  CLIENT_ORIGIN.split(',').map(origin => origin.trim()).filter(Boolean)
);

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error('Not allowed by CORS'));
  }
}));
app.use(express.json({ limit: '4mb' }));
app.use(morgan('dev'));

app.get('/api/health', (_req, res) => {
  const db = getDbStatus();
  res.json({
    ok: true,
    mode: process.env.GEMINI_API_KEY ? 'gemini-ai' : 'heuristic',
    database: db.connected ? 'connected' : 'unavailable',
    version: '2.0.0'
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/cities', cityRoutes);
app.use('/api/interview', interviewRoutes);

app.use((err, _req, res, _next) => {
  console.error('[ERROR]', err.message);
  res.status(500).json({ error: 'Internal server error', details: err.message });
});

await connectDatabase();

app.listen(PORT, () => {
  console.log(`\nInterview Mirror AI Server v2.0 running at http://localhost:${PORT}`);
  console.log(`   AI Mode: ${process.env.GEMINI_API_KEY ? 'Gemini AI' : 'Heuristic fallback'}\n`);
});
