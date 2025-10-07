import Stripe from 'stripe';
import { pool } from '../db.js';
import type { Request, Response } from 'express';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_123', { apiVersion: '2023-10-16' });

export async function stripeWebhook(req: Request, res: Response) {
  const sig = req.headers['stripe-signature'];
  if (!sig) return res.status(400).send('Missing signature');

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET || '');
  } catch (err: any) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'payment_intent.succeeded': {
        const pi = event.data.object as Stripe.PaymentIntent;
        const bookingId = String(pi.metadata?.bookingId || '');
        if (bookingId) {
          await pool.query('UPDATE booking SET status=$1 WHERE id=$2', ['confirmed', bookingId]);
        }
        break;
      }
      case 'payment_intent.payment_failed': {
        const pi = event.data.object as Stripe.PaymentIntent;
        const bookingId = String(pi.metadata?.bookingId || '');
        if (bookingId) {
          await pool.query('UPDATE booking SET status=$1 WHERE id=$2', ['cancelled', bookingId]);
        }
        break;
      }
    }
    res.json({ received: true });
  } catch (e: any) {
    res.status(500).send(e.message);
  }
}
