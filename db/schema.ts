import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const workspaces = sqliteTable('workspaces', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  snapshot: text('snapshot').notNull(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const runs = sqliteTable(
  'runs',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    status: text('status').notNull(),
    rowCount: integer('row_count').notNull(),
    actionCount: integer('action_count').notNull(),
    receipt: text('receipt').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    index('idx_runs_workspace_created').on(table.workspaceId, table.createdAt),
  ],
);

export const providerCache = sqliteTable('provider_cache', {
  cacheKey: text('cache_key').primaryKey(),
  provider: text('provider').notNull(),
  payload: text('payload').notNull(),
  createdAt: integer('created_at').notNull(),
  expiresAt: integer('expires_at').notNull(),
});

export const runJobs = sqliteTable(
  'run_jobs',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    status: text('status').notNull(),
    rowIds: text('row_ids').notNull(),
    columnIds: text('column_ids'),
    cursor: integer('cursor').notNull().default(0),
    completedCount: integer('completed_count').notNull().default(0),
    skippedCount: integer('skipped_count').notNull().default(0),
    confirmExternalResearch: integer('confirm_external_research', {
      mode: 'boolean',
    })
      .notNull()
      .default(false),
    leaseUntil: integer('lease_until'),
    lastRunId: text('last_run_id'),
    lastError: text('last_error'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [
    index('idx_run_jobs_workspace_created').on(
      table.workspaceId,
      table.createdAt,
    ),
    index('idx_run_jobs_status_updated').on(table.status, table.updatedAt),
  ],
);
