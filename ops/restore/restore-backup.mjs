#!/usr/bin/env node
/**
 * Turn a nightly database backup (backups/YYYY-MM-DD.json, written by the daily job) into SQL
 * that recreates the data in an EMPTY database that already has the schema.
 *
 *   node ops/restore/restore-backup.mjs <backup.json> > restore.sql
 *
 * Then (see docs/RUNBOOK.md, "Restore the database"):
 *   wrangler d1 execute <db> --file db/schema.sql   (+ db/migrations/*.sql in order)
 *   wrangler d1 execute <db> --file restore.sql
 *
 * audit_log is append-only (triggers block UPDATE/DELETE), so the restore only INSERTs.
 * Rows are inserted parents first (clients before cases before documents and events).
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Columns the schema defines (db/schema.sql + db/migrations), so a backup taken from a database with
// an extra column still restores: unknown columns are skipped with a warning.
const DB_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'db');
const schemaText = [readFileSync(join(DB_DIR, 'schema.sql'), 'utf8'),
  ...readdirSync(join(DB_DIR, 'migrations')).sort().map(f => readFileSync(join(DB_DIR, 'migrations', f), 'utf8'))].join('\n');
const known = {};
for (const m of schemaText.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)\s*\(([\s\S]*?)\n\);/g)) {
  const cols = known[m[1]] || (known[m[1]] = new Set());
  for (const line of m[2].split('\n')) {
    const c = /^\s*([a-z_][a-z0-9_]*)\s+(TEXT|INTEGER|REAL|BLOB|NUMERIC)/i.exec(line);
    if (c && !/^(PRIMARY|UNIQUE|FOREIGN|CHECK|CONSTRAINT)$/i.test(c[1])) cols.add(c[1]);
  }
}
for (const m of schemaText.matchAll(/ALTER TABLE (\w+) ADD COLUMN (\w+)/gi)) (known[m[1]] || (known[m[1]] = new Set())).add(m[2]);

const ORDER = ['clients', 'cases', 'documents', 'case_events', 'billing_docs', 'data_requests', 'counters', 'job_runs',
  'subscribers', 'bookings', 'app_settings', 'push_subscriptions', 'audit_log'];

const file = process.argv[2];
if (!file) { console.error('Usage: node ops/restore/restore-backup.mjs <backup.json> > restore.sql'); process.exit(1); }
const dump = JSON.parse(readFileSync(file, 'utf8'));
if (!dump || !dump.tables) { console.error('Not a backup file (no "tables").'); process.exit(1); }

const lit = v => v === null || v === undefined ? 'NULL'
  : typeof v === 'number' ? (Number.isFinite(v) ? String(v) : 'NULL')
  : typeof v === 'boolean' ? (v ? '1' : '0')
  : `'${String(v).replace(/'/g, "''")}'`;

const out = [`-- Restore of ${file} (backup made ${dump.createdAt || 'unknown'})`, 'PRAGMA defer_foreign_keys = true;'];
const counts = {};
const tables = [...ORDER.filter(t => dump.tables[t]), ...Object.keys(dump.tables).filter(t => !ORDER.includes(t))];
for (const t of tables) {
  const rows = dump.tables[t] || [];
  counts[t] = rows.length;
  if (!known[t]) { console.error(`Skipping table ${t}: not in the schema.`); continue; }
  const extra = [...new Set(rows.flatMap(r => Object.keys(r)))].filter(c => !known[t].has(c));
  if (extra.length) console.error(`Table ${t}: skipping columns not in the schema: ${extra.join(', ')}`);
  for (const r of rows) {
    const cols = Object.keys(r).filter(c => known[t].has(c));
    out.push(`INSERT INTO ${t} (${cols.join(', ')}) VALUES (${cols.map(c => lit(r[c])).join(', ')});`);
  }
}
process.stdout.write(out.join('\n') + '\n');
console.error('Rows per table: ' + Object.entries(counts).map(([t, n]) => `${t} ${n}`).join(', '));
