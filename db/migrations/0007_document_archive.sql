-- Replaced or removed case documents are archived, not deleted: kept for the record,
-- still openable and backed up, and erased with the case when its retention ends.
ALTER TABLE documents ADD COLUMN archived_at TEXT;
ALTER TABLE documents ADD COLUMN archive_reason TEXT;  -- replaced | removed
ALTER TABLE documents ADD COLUMN replaced_by TEXT;     -- the document that replaced it
