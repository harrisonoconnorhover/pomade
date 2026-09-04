import { env } from 'cloudflare:workers';

let schemaReady = false;

export async function ensureDatabase() {
  if (schemaReady) return env.DB;

  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      snapshot TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS runs (
      id TEXT PRIMARY KEY NOT NULL,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      row_count INTEGER NOT NULL,
      action_count INTEGER NOT NULL,
      receipt TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_runs_workspace_created
      ON runs(workspace_id, created_at)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS provider_cache (
      cache_key TEXT PRIMARY KEY NOT NULL,
      provider TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    )`),
  ]);

  schemaReady = true;
  return env.DB;
}
