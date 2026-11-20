-- The dashboard mailbox for info@awalglobal.com.ng.
-- Incoming mail: written by the awal-mail Worker (ops/mail-worker.js), raw message in R2.
-- Outgoing mail: sent from the dashboard through Brevo, a copy kept here.
CREATE TABLE IF NOT EXISTS mail_messages (
  id              TEXT PRIMARY KEY,
  direction       TEXT NOT NULL CHECK (direction IN ('in', 'out')),
  folder          TEXT NOT NULL DEFAULT 'inbox',   -- inbox | sent | archive | spam | trash
  message_id      TEXT,                            -- RFC 5322 Message-ID
  in_reply_to     TEXT,
  thread_id       TEXT NOT NULL,                   -- Message-ID of the first message in the conversation
  from_addr       TEXT NOT NULL,
  from_name       TEXT,
  reply_to        TEXT,
  to_addrs        TEXT NOT NULL DEFAULT '',        -- comma separated
  cc_addrs        TEXT NOT NULL DEFAULT '',
  subject         TEXT NOT NULL DEFAULT '',
  snippet         TEXT NOT NULL DEFAULT '',
  size_bytes      INTEGER NOT NULL DEFAULT 0,
  attachments     INTEGER NOT NULL DEFAULT 0,      -- count
  auth            TEXT,                            -- JSON: { spf, dkim, dmarc } from Cloudflare's own check
  warnings        TEXT,                            -- JSON list of security warnings
  raw_key         TEXT,                            -- R2 key of the raw message (incoming)
  parsed_at       TEXT,
  client_id       TEXT REFERENCES clients(id),
  case_id         TEXT REFERENCES cases(id),
  read_at         TEXT,
  starred         INTEGER NOT NULL DEFAULT 0,
  sent_by         TEXT,                            -- admin who sent it (outgoing)
  provider_id     TEXT,                            -- Brevo message id (outgoing)
  received_at     TEXT NOT NULL,
  trashed_at      TEXT
);
CREATE INDEX IF NOT EXISTS idx_mail_folder ON mail_messages(folder, received_at);
CREATE INDEX IF NOT EXISTS idx_mail_thread ON mail_messages(thread_id, received_at);
CREATE INDEX IF NOT EXISTS idx_mail_client ON mail_messages(client_id);
CREATE INDEX IF NOT EXISTS idx_mail_msgid ON mail_messages(message_id);
