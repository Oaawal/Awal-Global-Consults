-- Step 3: client reminders, follow-ups, daily job log.
-- Already applied to the live awal-cases database; db/schema.sql includes these for new setups.
ALTER TABLE cases ADD COLUMN status_changed_at TEXT;
ALTER TABLE cases ADD COLUMN follow_up_at TEXT;
ALTER TABLE cases ADD COLUMN follow_up_note TEXT;
UPDATE cases SET status_changed_at = updated_at WHERE status_changed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_cases_follow_up ON cases(follow_up_at);
CREATE TABLE IF NOT EXISTS job_runs (
  job      TEXT NOT NULL,
  run_date TEXT NOT NULL,
  ran_at   TEXT NOT NULL,
  detail   TEXT,
  PRIMARY KEY (job, run_date)
);
