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
  follow_up_note     TEXT,
  legal_hold_reason  TEXT,
  purged_at          TEXT,                        -- personal data and documents erased; the case row stays as a record that it existed
  assigned_to        TEXT,                        -- staff email responsible for the matter
  source             TEXT                         -- website | walk_in | whatsapp | phone | email | referral | other
);
CREATE INDEX IF NOT EXISTS idx_cases_client ON cases(client_id);
CREATE INDEX IF NOT EXISTS idx_cases_status ON cases(status);
CREATE INDEX IF NOT EXISTS idx_cases_retain ON cases(retain_until);
CREATE INDEX IF NOT EXISTS idx_cases_follow_up ON cases(follow_up_at);
CREATE INDEX IF NOT EXISTS idx_cases_assigned ON cases(assigned_to);

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
  deleted_at   TEXT,
  uploaded_by  TEXT,                               -- NULL = uploaded by the client through the website
  label        TEXT
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

-- Requests from clients under the NDPA (access, correction, erasure, ...), and what was done.
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

-- ════ Practice system (db/migrations/0005_practice.sql) ════
-- ── Team ───────────────────────────────────────────────────────────
-- People who can sign in to /admin. Addresses in the ADMIN_EMAILS variable are
-- always owners, even if they are not listed here, so the firm can never be
-- locked out of its own system.
--   owner  — everything, including team, settings, erasure, voiding invoices
--   staff  — day-to-day work: matters, billing, register, library, tasks
--   viewer — read only (e.g. an external accountant or auditor)
CREATE TABLE IF NOT EXISTS staff (
  email       TEXT PRIMARY KEY,
  full_name   TEXT NOT NULL,
  role        TEXT NOT NULL CHECK (role IN ('owner', 'staff', 'viewer')),
  title       TEXT,
  phone       TEXT,
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  created_by  TEXT NOT NULL
);

-- ── Matters opened by staff, assignment, staff uploads ────────────

-- ── Firm settings (name, RC number, bank details, VAT, invoice terms) ──
CREATE TABLE IF NOT EXISTS settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  updated_by  TEXT NOT NULL
);

-- ── Tasks and deadlines ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tasks (
  id            TEXT PRIMARY KEY,
  title         TEXT NOT NULL,
  detail        TEXT,
  kind          TEXT NOT NULL DEFAULT 'task' CHECK (kind IN ('task', 'deadline')),
  priority      TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high')),
  due_at        TEXT,                              -- UTC ISO; 8am Lagos on the due day
  case_id       TEXT REFERENCES cases(id),
  assigned_to   TEXT,
  status        TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done')),
  created_at    TEXT NOT NULL,
  created_by    TEXT NOT NULL,
  completed_at  TEXT,
  completed_by  TEXT
);
CREATE INDEX IF NOT EXISTS idx_tasks_open ON tasks(status, due_at);
CREATE INDEX IF NOT EXISTS idx_tasks_case ON tasks(case_id);

-- ── Billing: quotes, invoices, payments ───────────────────────────
-- Financial records are never deleted: invoices are voided and payments
-- reversed, each with a reason, so the books always reconcile.
CREATE TABLE IF NOT EXISTS invoices (
  id               TEXT PRIMARY KEY,
  number           TEXT NOT NULL UNIQUE,           -- INV-2026-0001 / QUO-2026-0001
  kind             TEXT NOT NULL CHECK (kind IN ('invoice', 'quote')),
  status           TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'issued', 'accepted', 'void')),
  client_id        TEXT NOT NULL REFERENCES clients(id),
  case_id          TEXT REFERENCES cases(id),
  bill_to_name     TEXT NOT NULL,                  -- copied at issue, so the document never changes
  bill_to_email    TEXT,
  bill_to_address  TEXT,
  issue_date       TEXT NOT NULL,                  -- YYYY-MM-DD
  due_date         TEXT,                           -- YYYY-MM-DD (quotes: valid until)
  vat_rate_bp      INTEGER NOT NULL DEFAULT 0,     -- basis points: 750 = 7.5%; applies to fees only
  fees_kobo        INTEGER NOT NULL DEFAULT 0,
  disbursements_kobo INTEGER NOT NULL DEFAULT 0,
  vat_kobo         INTEGER NOT NULL DEFAULT 0,
  total_kobo       INTEGER NOT NULL DEFAULT 0,
  paid_kobo        INTEGER NOT NULL DEFAULT 0,
  notes            TEXT,
  token            TEXT NOT NULL UNIQUE,           -- random; the client's view link
  source_quote_id  TEXT,                           -- invoice made from this quote
  created_at       TEXT NOT NULL,
  created_by       TEXT NOT NULL,
  updated_at       TEXT NOT NULL,
  issued_at        TEXT,
  sent_at          TEXT,
  voided_at        TEXT,
  void_reason      TEXT
);
CREATE INDEX IF NOT EXISTS idx_invoices_client ON invoices(client_id);
CREATE INDEX IF NOT EXISTS idx_invoices_case ON invoices(case_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(kind, status, due_date);

CREATE TABLE IF NOT EXISTS invoice_items (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id   TEXT NOT NULL REFERENCES invoices(id),
  position     INTEGER NOT NULL,
  description  TEXT NOT NULL,
  kind         TEXT NOT NULL CHECK (kind IN ('fee', 'disbursement')), -- disbursements: agency fees paid on the client's behalf, no VAT
  quantity     INTEGER NOT NULL DEFAULT 1,
  unit_kobo    INTEGER NOT NULL,
  amount_kobo  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoice_id);

CREATE TABLE IF NOT EXISTS payments (
  id              TEXT PRIMARY KEY,
  receipt_number  TEXT NOT NULL UNIQUE,            -- RCT-2026-0001
  invoice_id      TEXT NOT NULL REFERENCES invoices(id),
  amount_kobo     INTEGER NOT NULL CHECK (amount_kobo > 0),
  paid_on         TEXT NOT NULL,                   -- YYYY-MM-DD
  method          TEXT NOT NULL,                   -- bank_transfer | cash | pos | card | cheque | other
  reference       TEXT,                            -- bank or POS reference
  note            TEXT,
  recorded_at     TEXT NOT NULL,
  recorded_by     TEXT NOT NULL,
  reversed_at     TEXT,
  reversed_by     TEXT,
  reverse_reason  TEXT
);
CREATE INDEX IF NOT EXISTS idx_payments_invoice ON payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_date ON payments(paid_on);

-- ── Contacts: agencies, courts, counsel, vendors, banks, referrers ─
CREATE TABLE IF NOT EXISTS contacts (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  organisation  TEXT,
  kind          TEXT NOT NULL DEFAULT 'other',     -- agency | court | counsel | vendor | bank | referrer | partner | other
  role          TEXT,                              -- e.g. "Registry officer", "Head of Chambers"
  email         TEXT,
  phone         TEXT,
  address       TEXT,
  website       TEXT,
  notes         TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  created_by    TEXT NOT NULL,
  archived_at   TEXT
);
CREATE INDEX IF NOT EXISTS idx_contacts_name ON contacts(name);

-- ── Register: correspondence and service of documents ────────────
-- Inward: everything served on or delivered to the firm (court processes,
-- regulator letters, demand letters, notices). Outward: everything the firm
-- serves on or sends to others. Each entry keeps how and when it was served,
-- who received or served it, any response deadline, and scanned copies.
CREATE TABLE IF NOT EXISTS correspondence (
  id              TEXT PRIMARY KEY,
  number          TEXT NOT NULL UNIQUE,            -- IN-2026-0001 / OUT-2026-0001
  direction       TEXT NOT NULL CHECK (direction IN ('in', 'out')),
  kind            TEXT NOT NULL,                   -- letter | court_process | regulator | notice | contract | email | other
  subject         TEXT NOT NULL,
  party           TEXT NOT NULL,                   -- sender (inward) or recipient (outward)
  contact_id      TEXT REFERENCES contacts(id),
  case_id         TEXT REFERENCES cases(id),
  method          TEXT,                            -- hand | courier | post | email | whatsapp | portal | bailiff | other
  doc_date        TEXT,                            -- date written on the document
  served_on       TEXT NOT NULL,                   -- date received (inward) or served/sent (outward), YYYY-MM-DD
  served_by       TEXT,                            -- who delivered it (inward) or who served it (outward)
  received_by     TEXT,                            -- who signed for it (inward) or acknowledged it (outward)
  proof           TEXT,                            -- e.g. "Acknowledged copy", "DHL AWB 1234", "Read receipt"
  response_due    TEXT,                            -- YYYY-MM-DD, if a reply or appearance is required
  handled_by      TEXT,                            -- staff email responsible
  status          TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'actioned', 'filed')),
  summary         TEXT,
  created_at      TEXT NOT NULL,
  created_by      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  closed_at       TEXT
);
CREATE INDEX IF NOT EXISTS idx_corr_due ON correspondence(status, response_due);
CREATE INDEX IF NOT EXISTS idx_corr_case ON correspondence(case_id);

-- ── Office register: devices, network, domains, software, accounts ─
-- Never store passwords here. access_note says who has access and where the
-- credentials are kept (e.g. "Owner's password manager").
CREATE TABLE IF NOT EXISTS assets (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  kind          TEXT NOT NULL,                     -- device | network | domain | software | account | licence | premises | other
  detail        TEXT,                              -- model, plan, serial number, IP range
  custodian     TEXT,                              -- who holds or manages it
  vendor        TEXT,
  location      TEXT,
  cost_kobo     INTEGER,
  billing       TEXT,                              -- one_off | monthly | yearly
  renews_on     TEXT,                              -- YYYY-MM-DD
  access_note   TEXT,
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'retired')),
  notes         TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  created_by    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_assets_renews ON assets(status, renews_on);

-- ── Firm files: the library, and scans attached to the register ───
-- Stored in the private R2 bucket under firm/<id>. A new version of a library
-- file shares the first version's series_id; older versions stay available.
CREATE TABLE IF NOT EXISTS firm_files (
  id            TEXT PRIMARY KEY,
  area          TEXT NOT NULL CHECK (area IN ('library', 'correspondence', 'asset')),
  parent_id     TEXT,                              -- correspondence or asset id
  series_id     TEXT NOT NULL,
  version       INTEGER NOT NULL DEFAULT 1,
  title         TEXT NOT NULL,
  category      TEXT,                              -- library: template | precedent | policy | corporate | licence | contract | finance | hr | other
  file_name     TEXT NOT NULL,
  content_type  TEXT,
  size_bytes    INTEGER NOT NULL,
  storage_key   TEXT NOT NULL,
  expires_on    TEXT,                              -- YYYY-MM-DD, e.g. licence or certificate expiry
  notes         TEXT,
  uploaded_at   TEXT NOT NULL,
  uploaded_by   TEXT NOT NULL,
  deleted_at    TEXT,
  deleted_by    TEXT
);
CREATE INDEX IF NOT EXISTS idx_firm_files_area ON firm_files(area, parent_id);
CREATE INDEX IF NOT EXISTS idx_firm_files_series ON firm_files(series_id, version);
CREATE INDEX IF NOT EXISTS idx_firm_files_expiry ON firm_files(expires_on);
