import type { PomadeColumn, WorkspaceSnapshot } from './pomade-types';
import {
  validateCrmSyncConfig,
  type CrmSyncConfig,
  type CrmSyncPlan,
} from './crm-sync';

export type CrmMapping = { id: string; name: string; config: CrmSyncConfig };

export function sameCrmConfig(a: CrmSyncConfig, b: CrmSyncConfig) {
  return (
    a.provider === b.provider &&
    a.objectType === b.objectType &&
    (a.idColumn || '') === (b.idColumn || '') &&
    Object.keys(a.mapping).length === Object.keys(b.mapping).length &&
    Object.entries(a.mapping).every(
      ([field, column]) => b.mapping[field] === column,
    )
  );
}

export function saveCrmMapping(
  workspace: WorkspaceSnapshot,
  draft: CrmMapping,
): WorkspaceSnapshot {
  validateCrmSyncConfig(workspace, draft.config);
  const name = draft.name.replace(/\s+/g, ' ').trim();
  if (!name || name.length > 80)
    throw new Error('Name the mapping using 1–80 characters.');
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(draft.id))
    throw new Error('Invalid mapping ID.');
  const mappings = workspace.crmMappings ?? [];
  const existing = mappings.some((m) => m.id === draft.id);
  if (!existing && mappings.length >= 20)
    throw new Error('Keep up to 20 CRM mappings per table.');
  if (
    mappings.some(
      (m) => m.id !== draft.id && m.name.toLowerCase() === name.toLowerCase(),
    )
  )
    throw new Error('Another CRM mapping already uses that name.');
  // Store only the field mapping; credentials and selected row IDs never belong here.
  const mapping: CrmMapping = {
    id: draft.id,
    name,
    config: {
      provider: draft.config.provider,
      objectType: draft.config.objectType,
      mapping: { ...draft.config.mapping },
      ...(draft.config.idColumn ? { idColumn: draft.config.idColumn } : {}),
    },
  };
  return {
    ...workspace,
    updatedAt: Date.now(),
    crmMappings: existing
      ? mappings.map((m) => (m.id === draft.id ? mapping : m))
      : [...mappings, mapping],
  };
}

export function removeCrmMapping(
  workspace: WorkspaceSnapshot,
  id: string,
): WorkspaceSnapshot {
  return {
    ...workspace,
    updatedAt: Date.now(),
    crmMappings: (workspace.crmMappings ?? []).filter((m) => m.id !== id),
  };
}

export function copyVerifiedCrmIds(
  workspace: WorkspaceSnapshot,
  plan: CrmSyncPlan,
) {
  if (workspace.id !== plan.workspaceId)
    throw new Error('This CRM receipt belongs to another table.');
  validateCrmSyncConfig(workspace, plan.config);
  const idColumn =
    plan.config.idColumn ||
    `crm_${plan.config.provider}_${plan.config.objectType}_id`;
  const existingColumn = workspace.columns.find((c) => c.id === idColumn);
  if (existingColumn && existingColumn.kind !== 'text')
    throw new Error('CRM IDs need a text column.');
  if (Object.values(plan.config.mapping).includes(idColumn))
    throw new Error(
      'Keep CRM record IDs in a separate column from the fields being written.',
    );
  const issues: string[] = [];
  const updates = new Map<string, string>();
  for (const action of plan.actions) {
    if (action.status !== 'verified' || !action.nativeId) {
      issues.push(`${action.label}: no verified CRM ID to copy.`);
      continue;
    }
    const row = workspace.rows.find((r) => r.id === action.rowId);
    if (!row) {
      issues.push(`${action.label}: row no longer exists.`);
      continue;
    }
    if (
      Object.entries(plan.config.mapping).some(
        ([field, column]) =>
          (row.values[column] || '').trim() !==
          (action.properties[field] || ''),
      )
    ) {
      issues.push(
        `${action.label}: mapped values changed since this receipt; preview again.`,
      );
      continue;
    }
    const currentId = row.values[idColumn]?.trim();
    if (currentId && currentId !== action.nativeId) {
      issues.push(
        `${action.label}: a different CRM ID is already in the table.`,
      );
      continue;
    }
    updates.set(row.id, action.nativeId);
  }
  if (!updates.size) return { workspace, idColumn, copied: 0, issues };
  if (!existingColumn && workspace.columns.length >= 100)
    throw new Error('The table has no room for a CRM ID column.');
  const columns = [...workspace.columns];
  if (!existingColumn) {
    const provider =
      plan.config.provider === 'hubspot' ? 'HubSpot' : 'Salesforce';
    const column: PomadeColumn = {
      id: idColumn,
      title: `${provider} ${plan.config.objectType} ID`,
      kind: 'text',
      width: 210,
    };
    const status = columns.findIndex((c) => c.kind === 'status');
    columns.splice(status < 0 ? columns.length : status, 0, column);
  }
  const next: WorkspaceSnapshot = {
    ...workspace,
    columns,
    updatedAt: Date.now(),
    rows: workspace.rows.map((row) => ({
      ...row,
      values: {
        ...row.values,
        [idColumn]: updates.get(row.id) ?? row.values[idColumn] ?? '',
      },
    })),
    // Saved mappings for this exact write now reuse the verified IDs on subsequent runs.
    crmMappings: workspace.crmMappings?.map((m) =>
      sameCrmConfig(m.config, plan.config)
        ? { ...m, config: { ...m.config, idColumn } }
        : m,
    ),
  };
  return { workspace: next, idColumn, copied: updates.size, issues };
}
