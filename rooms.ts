import { Router } from 'express';
import { pool } from '../db.js';

const router = Router();

router.get('/', async (req, res) => {
  const { city, minPrice, maxPrice } = req.query;
  const params: any[] = [];
  const where: string[] = ['is_active = true'];
  if (city) { params.push(city); where.push(`lower(city) = lower($${params.length})`); }
  if (minPrice) { params.push(Number(minPrice)); where.push(`hourly_price_cents >= $${params.length}`); }
  if (maxPrice) { params.push(Number(maxPrice)); where.push(`hourly_price_cents <= $${params.length}`); }

  const sql = `
    SELECT r.*, COALESCE(json_agg(p.*) FILTER (WHERE p.id IS NOT NULL), '[]') as photos
    FROM room r
    LEFT JOIN room_photo p ON p.room_id = r.id
    WHERE ${where.join(' AND ')}
    GROUP BY r.id
    ORDER BY r.created_at DESC
    LIMIT 50
  `;
  const { rows } = await pool.query(sql, params);
  res.json(rows);
});

router.get('/:id', async (req, res) => {
  const id = req.params.id;
  const { rows } = await pool.query(`
    SELECT r.*, COALESCE(json_agg(p.*) FILTER (WHERE p.id IS NOT NULL), '[]') as photos
    FROM room r
    LEFT JOIN room_photo p ON p.room_id = r.id
    WHERE r.id = $1
    GROUP BY r.id
  `, [id]);
  if (!rows[0]) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
});

export default router;
