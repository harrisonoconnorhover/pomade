import { env } from 'cloudflare:workers';

let schemaReady = false;

export async function ensureDatabaseSchema(db: D1Database) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      snapshot TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS runs (
      id TEXT PRIMARY KEY NOT NULL,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      row_count INTEGER NOT NULL,
      action_count INTEGER NOT NULL,
      receipt TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_runs_workspace_created
      ON runs(workspace_id, created_at)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS provider_cache (
      cache_key TEXT PRIMARY KEY NOT NULL,
      provider TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS run_jobs (
      id TEXT PRIMARY KEY NOT NULL,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      row_ids TEXT NOT NULL,
      column_ids TEXT,
      cursor INTEGER NOT NULL DEFAULT 0,
      completed_count INTEGER NOT NULL DEFAULT 0,
      skipped_count INTEGER NOT NULL DEFAULT 0,
      confirm_external_research INTEGER NOT NULL DEFAULT 0,
      lease_until INTEGER,
      last_run_id TEXT,
      last_error TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_run_jobs_workspace_created
      ON run_jobs(workspace_id, created_at)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_run_jobs_status_updated
      ON run_jobs(status, updated_at)`),
  ]);
}

export async function ensureDatabase() {
  if (schemaReady) return env.DB;

  await ensureDatabaseSchema(env.DB);

  schemaReady = true;
  return env.DB;
}
