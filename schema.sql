CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE IF NOT EXISTS app_user (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE,
  password_hash TEXT,
  name TEXT,
  role TEXT NOT NULL DEFAULT 'guest',
  stripe_customer_id TEXT,
  stripe_connect_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS room (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id UUID REFERENCES app_user(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  hourly_price_cents INT NOT NULL CHECK (hourly_price_cents > 0),
  min_hours INT NOT NULL DEFAULT 1,
  max_hours INT,
  address_line1 TEXT,
  city TEXT,
  country TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  auto_accept BOOLEAN NOT NULL DEFAULT true,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS room_photo (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES room(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS booking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES room(id) ON DELETE CASCADE,
  guest_id UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  total_price_cents INT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  payment_intent_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_time > start_time)
);

ALTER TABLE booking DROP COLUMN IF EXISTS time_range;
ALTER TABLE booking
  ADD COLUMN time_range tstzrange GENERATED ALWAYS AS (tstzrange(start_time, end_time, '[)')) STORED;

CREATE INDEX IF NOT EXISTS booking_room_timerange_idx ON booking USING GIST (room_id, time_range);

DO $$ BEGIN
  ALTER TABLE booking
    ADD CONSTRAINT no_overlapping_bookings
    EXCLUDE USING GIST (room_id WITH =, time_range WITH &&)
    WHERE (status IN ('pending','confirmed'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Seed
INSERT INTO app_user (id, email, name, role) VALUES
  ('00000000-0000-0000-0000-000000000001', 'host@example.com', 'Host One', 'host')
ON CONFLICT DO NOTHING;

INSERT INTO app_user (id, email, name, role) VALUES
  ('00000000-0000-0000-0000-000000000009', 'guest@example.com', 'Demo Guest', 'guest')
ON CONFLICT DO NOTHING;

INSERT INTO room (id, host_id, title, description, hourly_price_cents, city, country, auto_accept)
VALUES
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
   'Bright Meeting Room', 'Seats 6, whiteboard, coffee.', 2500, 'Dublin', 'IE', true),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001',
   'Quiet Studio Space', 'Great for podcasts and calls.', 1800, 'Dublin', 'IE', true)
ON CONFLICT DO NOTHING;

INSERT INTO room_photo (room_id, url, sort_order) VALUES
  ('10000000-0000-0000-0000-000000000001', 'https://images.unsplash.com/photo-1524758631624-e2822e304c36', 0),
  ('10000000-0000-0000-0000-000000000002', 'https://images.unsplash.com/photo-1519710164239-da123dc03ef4', 0)
ON CONFLICT DO NOTHING;
