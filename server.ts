import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { pool } from './db.js';
import roomsRouter from './routes/rooms.js';
import bookingsRouter from './routes/bookings.js';
import { stripeWebhook } from './routes/webhook.js';

const app = express();
app.use(cors({ origin: true, credentials: true }));

// Webhook MUST use raw body BEFORE json middleware
app.post('/api/webhooks/stripe', express.raw({ type: 'application/json' }), stripeWebhook);

app.use(express.json());

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('select 1');
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.use('/api/rooms', roomsRouter);
app.use('/api/bookings', bookingsRouter);

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`API running on http://localhost:${port}`);
});
