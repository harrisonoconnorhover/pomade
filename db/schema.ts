import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const workspaces = sqliteTable('workspaces', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  snapshot: text('snapshot').notNull(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const workspaceVersions = sqliteTable(
  'workspace_versions',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    reason: text('reason').notNull(),
    snapshot: text('snapshot').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    index('idx_workspace_versions_workspace_created').on(
      table.workspaceId,
      table.createdAt,
    ),
  ],
);

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
    resumeColumnIds: text('resume_column_ids'),
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

export const webhookEvents = sqliteTable(
  'webhook_events',
  {
    id: text('id').primaryKey(),
    sourceId: text('source_id').notNull(),
    workspaceId: text('workspace_id').notNull(),
    payloadHash: text('payload_hash').notNull(),
    records: text('records').notNull(),
    receivedAt: integer('received_at').notNull(),
  },
  (table) => [
    index('idx_webhook_events_workspace').on(
      table.workspaceId,
      table.receivedAt,
      table.id,
    ),
  ],
);

export const webhookImports = sqliteTable('webhook_imports', {
  eventId: text('event_id').primaryKey(),
  importedAt: integer('imported_at').notNull(),
});

export const apiSourceBatches = sqliteTable(
  'api_source_batches',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id').notNull(),
    batch: text('batch').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    index('idx_api_source_batches_workspace').on(
      table.workspaceId,
      table.createdAt,
    ),
  ],
);

export const tableTransferRuns = sqliteTable(
  'table_transfer_runs',
  {
    id: text('id').primaryKey(),
    sourceId: text('source_id').notNull(),
    targetId: text('target_id').notNull(),
    receipt: text('receipt').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    index('idx_table_transfer_runs_source').on(table.sourceId, table.createdAt),
  ],
);

export const workbookTemplates = sqliteTable('workbook_templates', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  template: text('template').notNull(),
  createdAt: integer('created_at').notNull(),
});

export const signalBatches = sqliteTable(
  'signal_batches',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id').notNull(),
    batch: text('batch').notNull(),
    createdAt: integer('created_at').notNull(),
    reviewedAt: integer('reviewed_at'),
  },
  (table) => [
    index('idx_signal_batches_workspace').on(
      table.workspaceId,
      table.createdAt,
    ),
  ],
);

export const crmSyncRuns = sqliteTable(
  'crm_sync_runs',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id').notNull(),
    provider: text('provider').notNull(),
    status: text('status').notNull(),
    plan: text('plan').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    index('idx_crm_sync_workspace').on(table.workspaceId, table.createdAt),
  ],
);

export const researchRequests = sqliteTable(
  'research_requests',
  {
    id: text('id').primaryKey(),
    prompt: text('prompt').notNull(),
    model: text('model'),
    browser: integer('browser').notNull().default(0),
    status: text('status').notNull(),
    leaseToken: text('lease_token'),
    leaseUntil: integer('lease_until'),
    result: text('result'),
    error: text('error'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [
    index('idx_research_requests_status_created').on(
      table.status,
      table.createdAt,
    ),
  ],
);

export const researchCompanion = sqliteTable('research_companion', {
  id: integer('id').primaryKey(),
  ready: integer('ready').notNull(),
  browserAvailable: integer('browser_available').notNull(),
  updatedAt: integer('updated_at').notNull(),
});
