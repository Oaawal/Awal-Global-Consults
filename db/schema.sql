-- Awal Global Consults — client records database (Cloudflare D1: awal-cases)
--
-- Retention rules (from privacy-policy.html#data-retention):
--   application  — client files with KYC/AML documents and registration records.
--                  Kept 6 years after the case closes (covers the 5-year AML
--                  minimum and the 6-year CAMA / CITA record-keeping period).
--                  retain_until stays NULL while the case is open.
--   enquiry      — contact-form enquiries that never became an engagement.
--                  Kept 12 months after the last activity.
-- Nothing is deleted automatically: records past retain_until are listed for
-- review, and a record on legal_hold is never deleted.

CREATE TABLE IF NOT EXISTS clients (
  id            TEXT PRIMARY KEY,
  full_name     TEXT NOT NULL,
  email         TEXT,
  phone         TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  anonymised_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_clients_email ON clients(email);

CREATE TABLE IF NOT EXISTS cases (
  id                 TEXT PRIMARY KEY,
  reference          TEXT NOT NULL UNIQUE,        -- AGC-2026-0001 (application) / ENQ-2026-0001 (enquiry)
  client_id          TEXT NOT NULL REFERENCES clients(id),
  kind               TEXT NOT NULL CHECK (kind IN ('application', 'enquiry')),
  services           TEXT NOT NULL DEFAULT '',
  status             TEXT NOT NULL DEFAULT 'new',
  form_data          TEXT NOT NULL,               -- JSON of the submitted form fields
  consent_accuracy   INTEGER NOT NULL DEFAULT 0,  -- "information is accurate" box ticked
  consent_processing INTEGER NOT NULL DEFAULT 0,  -- "I consent to processing" box ticked
  source_page        TEXT,
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL,
  closed_at          TEXT,
  retention_class    TEXT NOT NULL CHECK (retention_class IN ('application', 'enquiry')),
  retain_until       TEXT,
  legal_hold         INTEGER NOT NULL DEFAULT 0,
  status_changed_at  TEXT,                        -- when the current status was set (drives client reminders)
  follow_up_at       TEXT,                        -- optional reminder date for you, e.g. annual returns
  follow_up_note     TEXT
);
CREATE INDEX IF NOT EXISTS idx_cases_client ON cases(client_id);
CREATE INDEX IF NOT EXISTS idx_cases_status ON cases(status);
CREATE INDEX IF NOT EXISTS idx_cases_retain ON cases(retain_until);
CREATE INDEX IF NOT EXISTS idx_cases_follow_up ON cases(follow_up_at);

-- Files live in the private R2 bucket awal-documents under storage_key;
-- this table is the index of what was received, and when.
CREATE TABLE IF NOT EXISTS documents (
  id           TEXT PRIMARY KEY,
  case_id      TEXT NOT NULL REFERENCES cases(id),
  file_name    TEXT NOT NULL,
  content_type TEXT,
  size_bytes   INTEGER NOT NULL,
  storage_key  TEXT NOT NULL,
  uploaded_at  TEXT NOT NULL,
  deleted_at   TEXT
);
CREATE INDEX IF NOT EXISTS idx_documents_case ON documents(case_id);

-- Status history and notes for each case.
CREATE TABLE IF NOT EXISTS case_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id     TEXT NOT NULL REFERENCES cases(id),
  event       TEXT NOT NULL,
  from_status TEXT,
  to_status   TEXT,
  note        TEXT,
  actor       TEXT NOT NULL,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_case_events_case ON case_events(case_id);

-- Append-only record of who did what, and when. The triggers below make
-- rows impossible to edit or delete, so the log can serve as evidence.
CREATE TABLE IF NOT EXISTS audit_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  at          TEXT NOT NULL,
  actor       TEXT NOT NULL,
  action      TEXT NOT NULL,
  entity_type TEXT,
  entity_id   TEXT,
  detail      TEXT,
  ip          TEXT
);
CREATE TRIGGER IF NOT EXISTS audit_log_no_update BEFORE UPDATE ON audit_log
BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END;
CREATE TRIGGER IF NOT EXISTS audit_log_no_delete BEFORE DELETE ON audit_log
BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END;

-- Yearly sequence numbers for case references.
CREATE TABLE IF NOT EXISTS counters (
  name  TEXT PRIMARY KEY,
  value INTEGER NOT NULL
);

-- ── Admin dashboard login (/admin) ─────────────────────────────────
-- One-time login codes emailed to the admin. Only a hash of each code is
-- stored; a code expires after 10 minutes or 5 wrong attempts.
CREATE TABLE IF NOT EXISTS admin_login_codes (
  id         TEXT PRIMARY KEY,
  email      TEXT NOT NULL,
  code_hash  TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  attempts   INTEGER NOT NULL DEFAULT 0,
  used_at    TEXT
);
CREATE INDEX IF NOT EXISTS idx_admin_login_codes_email ON admin_login_codes(email, created_at);

-- Signed-in sessions. Only a hash of the session token is stored.
CREATE TABLE IF NOT EXISTS admin_sessions (
  token_hash TEXT PRIMARY KEY,
  email      TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  ip         TEXT,
  user_agent TEXT
);

-- One row per scheduled job per day, so a job never runs twice on the same day.
CREATE TABLE IF NOT EXISTS job_runs (
  job      TEXT NOT NULL,
  run_date TEXT NOT NULL,                         -- Lagos date, YYYY-MM-DD
  ran_at   TEXT NOT NULL,
  detail   TEXT,
  PRIMARY KEY (job, run_date)
);
