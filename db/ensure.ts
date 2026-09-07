import { env } from 'cloudflare:workers';

let schemaReady = false;

export async function ensureDatabaseSchema(db: D1Database) {
  await db.batch([
    db.prepare(
      `CREATE TABLE IF NOT EXISTS research_companion (id INTEGER PRIMARY KEY NOT NULL, ready INTEGER NOT NULL, browser_available INTEGER NOT NULL, updated_at INTEGER NOT NULL, models TEXT, models_updated_at INTEGER)`,
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS research_requests (id TEXT PRIMARY KEY NOT NULL, prompt TEXT NOT NULL, model TEXT, browser INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL, lease_token TEXT, lease_until INTEGER, result TEXT, error TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, purpose TEXT NOT NULL DEFAULT 'research', reasoning_effort TEXT)`,
    ),
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_research_requests_status_created ON research_requests(status,created_at)`,
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS research_settings (id INTEGER PRIMARY KEY NOT NULL, settings TEXT NOT NULL)`,
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS crm_sync_runs (id TEXT PRIMARY KEY NOT NULL, workspace_id TEXT NOT NULL, provider TEXT NOT NULL, status TEXT NOT NULL, plan TEXT NOT NULL, created_at INTEGER NOT NULL)`,
    ),
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_crm_sync_workspace ON crm_sync_runs(workspace_id,created_at)`,
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS signal_batches (id TEXT PRIMARY KEY NOT NULL,workspace_id TEXT NOT NULL,batch TEXT NOT NULL,created_at INTEGER NOT NULL,reviewed_at INTEGER)`,
    ),
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_signal_batches_workspace ON signal_batches(workspace_id,created_at)`,
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS workbook_templates (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, template TEXT NOT NULL, created_at INTEGER NOT NULL)`,
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS table_transfer_runs (id TEXT PRIMARY KEY NOT NULL, source_id TEXT NOT NULL, target_id TEXT NOT NULL, receipt TEXT NOT NULL, created_at INTEGER NOT NULL)`,
    ),
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_table_transfer_runs_source ON table_transfer_runs(source_id,created_at)`,
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS api_source_batches (id TEXT PRIMARY KEY NOT NULL, workspace_id TEXT NOT NULL, batch TEXT NOT NULL, created_at INTEGER NOT NULL)`,
    ),
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_api_source_batches_workspace ON api_source_batches(workspace_id,created_at)`,
    ),
    db.prepare(`CREATE TABLE IF NOT EXISTS webhook_events (
      id TEXT PRIMARY KEY NOT NULL,
      source_id TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      payload_hash TEXT NOT NULL,
      records TEXT NOT NULL,
      received_at INTEGER NOT NULL
    )`),
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_webhook_events_workspace ON webhook_events(workspace_id, received_at, id)`,
    ),
    db.prepare(`CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      snapshot TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`),
    db.prepare(`CREATE TRIGGER IF NOT EXISTS workspace_revision_guard
      BEFORE UPDATE ON workspaces
      WHEN COALESCE(json_extract(NEW.snapshot, '$.revision'), 0) != COALESCE(json_extract(OLD.snapshot, '$.revision'), 0) + 1
      BEGIN SELECT RAISE(ABORT, 'Workspace changed; reload before retrying.'); END`),
    db.prepare(`CREATE TABLE IF NOT EXISTS webhook_imports (
      event_id TEXT PRIMARY KEY NOT NULL,
      imported_at INTEGER NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS workspace_versions (
      id TEXT PRIMARY KEY NOT NULL,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      reason TEXT NOT NULL,
      snapshot TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_workspace_versions_workspace_created
      ON workspace_versions(workspace_id, created_at)`),
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
    db.prepare(`CREATE TABLE IF NOT EXISTS crm_refreshes (
      workspace_id TEXT PRIMARY KEY NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      state TEXT NOT NULL, status TEXT NOT NULL, next_run_at INTEGER, lease_until INTEGER, updated_at INTEGER NOT NULL
    )`),
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_crm_refreshes_due ON crm_refreshes(status,next_run_at)`,
    ),
    db.prepare(`CREATE TABLE IF NOT EXISTS workbook_runs (
      id TEXT PRIMARY KEY NOT NULL, workbook_id TEXT NOT NULL, status TEXT NOT NULL,
      state TEXT NOT NULL, lease_until INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    )`),
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_workbook_runs_workbook_created ON workbook_runs(workbook_id,created_at)`,
    ),
    db.prepare(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_workbook_runs_active ON workbook_runs(workbook_id) WHERE status IN ('running','paused','needs_attention')`,
    ),
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
  const columns = await db
    .prepare('PRAGMA table_info(run_jobs)')
    .all<{ name: string }>();
  if (!columns.results.some((column) => column.name === 'workbook_run_id'))
    await db
      .prepare('ALTER TABLE run_jobs ADD COLUMN workbook_run_id TEXT')
      .run();
  if (!columns.results.some((column) => column.name === 'resume_column_ids'))
    await db
      .prepare('ALTER TABLE run_jobs ADD COLUMN resume_column_ids TEXT')
      .run();
}

export async function ensureDatabase() {
  if (schemaReady || env.POMADE_DEPLOYMENT === 'hosted') return env.DB;

  await ensureDatabaseSchema(env.DB);

  schemaReady = true;
  return env.DB;
}
