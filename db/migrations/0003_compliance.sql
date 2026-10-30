-- Step 4: retention review, legal hold reasons, erasure, data requests.
-- Already applied to the live awal-cases database; db/schema.sql includes these for new setups.
ALTER TABLE cases ADD COLUMN legal_hold_reason TEXT;
ALTER TABLE cases ADD COLUMN purged_at TEXT;
CREATE TABLE IF NOT EXISTS data_requests (
  id           TEXT PRIMARY KEY,
  client_id    TEXT REFERENCES clients(id),
  kind         TEXT NOT NULL CHECK (kind IN ('access', 'correction', 'erasure', 'objection', 'other')),
  received_at  TEXT NOT NULL,
  completed_at TEXT,
  outcome      TEXT,
  note         TEXT,
  created_by   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_data_requests_open ON data_requests(completed_at);
