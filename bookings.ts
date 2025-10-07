import { Router } from 'express';
import { pool } from '../db.js';
import { DateTime } from 'luxon';
import Stripe from 'stripe';

const stripeKey = process.env.STRIPE_SECRET_KEY || 'sk_test_123';
const stripe = new Stripe(stripeKey, { apiVersion: '2023-10-16' });

const router = Router();

router.post('/quote', async (req, res) => {
  const { roomId, startISO, endISO } = req.body;
  if (!roomId || !startISO || !endISO) return res.status(400).json({ error: 'Missing fields' });

  const room = (await pool.query('SELECT hourly_price_cents, min_hours, max_hours FROM room WHERE id=$1', [roomId])).rows[0];
  if (!room) return res.status(404).json({ error: 'Room not found' });

  const start = DateTime.fromISO(startISO);
  const end = DateTime.fromISO(endISO);
  if (!start.isValid || !end.isValid || end <= start) return res.status(400).json({ error: 'Invalid times' });

  const diffHours = end.diff(start, 'hours').hours;
  const roundedHours = Math.max(room.min_hours || 1, Math.ceil(diffHours));
  if (room.max_hours && roundedHours > room.max_hours) return res.status(400).json({ error: 'Exceeds max duration' });

  const total_cents = roundedHours * room.hourly_price_cents;
  res.json({ total_cents });
});

router.post('/', async (req, res) => {
  const { roomId, startISO, endISO } = req.body;
  if (!roomId || !startISO || !endISO) return res.status(400).json({ error: 'Missing fields' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const room = (await client.query('SELECT hourly_price_cents, auto_accept FROM room WHERE id=$1', [roomId])).rows[0];
    if (!room) throw new Error('Room not found');

    const start = DateTime.fromISO(startISO);
    const end = DateTime.fromISO(endISO);
    if (!start.isValid || !end.isValid || end <= start) throw new Error('Invalid times');

    const hours = Math.ceil(end.diff(start, 'hours').hours);
    const total = hours * room.hourly_price_cents;

    const userId = '00000000-0000-0000-0000-000000000009'; // Demo guest
    const insert = await client.query(
      `INSERT INTO booking (room_id, guest_id, start_time, end_time, total_price_cents, status)
       VALUES ($1, $2, $3, $4, $5, 'pending')
       RETURNING id`,
      [roomId, userId, start.toISO(), end.toISO(), total]
    );
    const bookingId = insert.rows[0].id;

    const pi = await stripe.paymentIntents.create({
      amount: total,
      currency: 'eur',
      automatic_payment_methods: { enabled: true },
      metadata: { bookingId }
    });

    await client.query('UPDATE booking SET payment_intent_id=$1 WHERE id=$2', [pi.id, bookingId]);
    await client.query('COMMIT');
    res.json({ bookingId, client_secret: pi.client_secret });
  } catch (e: any) {
    await client.query('ROLLBACK');
    if (e.code === '23P01') return res.status(409).json({ error: 'Time slot already booked' });
    res.status(400).json({ error: e.message });
  } finally {
    client.release();
  }
});

export default router;
