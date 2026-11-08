-- Quotations, invoices, receipts and engagement letters issued from the dashboard
CREATE TABLE IF NOT EXISTS billing_docs (
  id              TEXT PRIMARY KEY,
  case_id         TEXT NOT NULL REFERENCES cases(id),
  kind            TEXT NOT NULL,            -- quote | invoice | receipt | engagement
  number          TEXT NOT NULL UNIQUE,     -- e.g. AGC-INV-2026-Nov-01
  status          TEXT NOT NULL,            -- issued | sent | paid | part_paid | void
  issued_at       TEXT NOT NULL,
  due_at          TEXT,                     -- invoices
  valid_until     TEXT,                     -- quotations
  related_id      TEXT,                     -- quote for an invoice; invoice for a receipt or letter
  category        TEXT,
  client_json     TEXT NOT NULL,            -- snapshot of who it was issued to
  items_json      TEXT NOT NULL,
  vat_rate        REAL NOT NULL DEFAULT 0,
  subtotal        INTEGER NOT NULL DEFAULT 0,
  vat_amount      INTEGER NOT NULL DEFAULT 0,
  total           INTEGER NOT NULL DEFAULT 0,
  amount_paid     INTEGER,
  payment_method  TEXT,
  payment_ref     TEXT,
  paid_at         TEXT,
  notes           TEXT,
  sent_at         TEXT,
  voided_at       TEXT,
  created_by      TEXT NOT NULL,
  created_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_billing_case ON billing_docs(case_id);
