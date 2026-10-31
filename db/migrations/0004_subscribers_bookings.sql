-- Newsletter subscribers (double opt-in) and consultation bookings.
-- Applied to the live awal-cases database; db/schema.sql includes these for new setups.
CREATE TABLE IF NOT EXISTS subscribers (
  id               TEXT PRIMARY KEY,
  email            TEXT NOT NULL UNIQUE,
  status           TEXT NOT NULL CHECK (status IN ('pending', 'confirmed', 'unsubscribed')),
  token            TEXT NOT NULL UNIQUE,          -- random; used in confirm and unsubscribe links
  source           TEXT,                          -- page the sign-up came from
  created_at       TEXT NOT NULL,
  confirmed_at     TEXT,
  unsubscribed_at  TEXT,
  last_digest      TEXT                           -- key of the last weekly digest sent, e.g. 2026-W45
);
CREATE INDEX IF NOT EXISTS idx_subscribers_status ON subscribers(status);

CREATE TABLE IF NOT EXISTS bookings (
  id            TEXT PRIMARY KEY,
  case_id       TEXT REFERENCES cases(id),
  type          TEXT NOT NULL,                    -- key from functions/_lib/booking.js
  slot_start    TEXT NOT NULL,                    -- UTC ISO time
  minutes       INTEGER NOT NULL,
  mode          TEXT NOT NULL,                    -- whatsapp | phone | video
  status        TEXT NOT NULL CHECK (status IN ('confirmed', 'awaiting_payment', 'cancelled')),
  full_name     TEXT NOT NULL,
  email         TEXT NOT NULL,
  phone         TEXT,
  topic         TEXT,
  token         TEXT NOT NULL UNIQUE,             -- random; used in the client's cancel link
  created_at    TEXT NOT NULL,
  cancelled_at  TEXT,
  reminded_at   TEXT
);
-- One active booking per time slot
CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_slot ON bookings(slot_start) WHERE status != 'cancelled';
CREATE INDEX IF NOT EXISTS idx_bookings_start ON bookings(slot_start);
