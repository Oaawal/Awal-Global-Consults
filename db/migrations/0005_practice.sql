-- Step 5: the practice system. Turns the case manager into the firm's back
-- office: team accounts, matters opened by staff, billing, tasks and deadlines,
-- the correspondence and service register, the firm library, contacts, the
-- office (IT, network and subscriptions) register, and firm settings.
--
-- NOT YET APPLIED to the live awal-cases database. Apply it once, from the
-- Cloudflare dashboard (D1 → awal-cases → Console), by pasting this file, or:
--   npx wrangler d1 execute awal-cases --remote --file db/migrations/0005_practice.sql
-- db/schema.sql includes all of this for new setups.
--
-- Money is stored in kobo (₦1 = 100 kobo) as whole numbers, so sums never drift.

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
ALTER TABLE cases ADD COLUMN assigned_to TEXT;     -- staff email responsible for the matter
ALTER TABLE cases ADD COLUMN source TEXT;          -- website | walk_in | whatsapp | phone | email | referral | other
ALTER TABLE documents ADD COLUMN uploaded_by TEXT; -- NULL = uploaded by the client through the website
ALTER TABLE documents ADD COLUMN label TEXT;       -- e.g. "CAC certificate", "Signed engagement letter"
UPDATE cases SET source = 'website' WHERE source IS NULL;
CREATE INDEX IF NOT EXISTS idx_cases_assigned ON cases(assigned_to);

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
