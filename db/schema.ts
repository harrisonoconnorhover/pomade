import { sql } from 'drizzle-orm';
import {
  uniqueIndex,
  index,
  integer,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core';

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
    workbookRunId: text('workbook_run_id'),
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
    purpose: text('purpose').notNull().default('research'),
    model: text('model'),
    reasoningEffort: text('reasoning_effort'),
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
  models: text('models'),
  modelsUpdatedAt: integer('models_updated_at'),
  id: integer('id').primaryKey(),
  ready: integer('ready').notNull(),
  browserAvailable: integer('browser_available').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const researchSettings = sqliteTable('research_settings', {
  id: integer('id').primaryKey(),
  settings: text('settings').notNull(),
});

export const workbookRuns = sqliteTable(
  'workbook_runs',
  {
    id: text('id').primaryKey(),
    workbookId: text('workbook_id').notNull(),
    status: text('status').notNull(),
    state: text('state').notNull(),
    leaseUntil: integer('lease_until'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [
    index('idx_workbook_runs_workbook_created').on(
      table.workbookId,
      table.createdAt,
    ),
    uniqueIndex('idx_workbook_runs_active')
      .on(table.workbookId)
      .where(sql`${table.status} IN ('running','paused','needs_attention')`),
  ],
);

export const crmRefreshes = sqliteTable(
  'crm_refreshes',
  {
    workspaceId: text('workspace_id')
      .primaryKey()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    state: text('state').notNull(),
    status: text('status').notNull(),
    nextRunAt: integer('next_run_at'),
    leaseUntil: integer('lease_until'),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [index('idx_crm_refreshes_due').on(table.status, table.nextRunAt)],
);

// Global identity and encrypted connection metadata. Workbook data stays private
// in the member table namespace; the owner keeps the existing table names.
export const pomadeAccounts = sqliteTable('pomade_accounts', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  subject: text('subject').unique(),
  role: text('role').notNull(),
  status: text('status').notNull(),
  dataPrefix: text('data_prefix').notNull().unique(),
  schemaVersion: integer('schema_version').notNull().default(0),
  vaultMigrated: integer('vault_migrated').notNull().default(0),
  companionHash: text('companion_hash').unique(),
  createdAt: integer('created_at').notNull(),
});
export const accountCredentials = sqliteTable(
  'account_credentials',
  {
    accountId: text('account_id')
      .notNull()
      .references(() => pomadeAccounts.id),
    provider: text('provider').notNull(),
    payload: text('payload').notNull(),
    label: text('label').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_account_credentials_account_provider').on(
      table.accountId,
      table.provider,
    ),
  ],
);

export const waterfallProgress = sqliteTable('waterfall_progress', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  executionId: text('execution_id').notNull(),
  fingerprint: text('fingerprint').notNull(),
  state: text('state').notNull(),
  updatedAt: integer('updated_at').notNull(),
});
