import { previewCrmSync, type CrmSyncPlan } from '../lib/crm-sync';
import { scheduledCrmRows } from '../lib/recipe-schedule';
import type { WorkspaceSnapshot } from '../lib/pomade-types';
import type { CrmSourceOptions } from '../lib/crm-sources';

export async function runScheduledCrm(
  db: D1Database,
  workspace: WorkspaceSnapshot,
  rowIds: string[] | undefined,
  options: CrmSourceOptions,
  confirm: (planId: string) => Promise<CrmSyncPlan>,
) {
  const schedule = workspace.schedule;
  const planIds: string[] = [];
  for (const [index, write] of (schedule?.afterRunCrm ?? []).entries()) {
    if (!schedule?.executionId)
      throw new Error('The scheduled CRM write needs an execution ID.');
    const id = `schedule-${schedule.executionId}-${index}`;
    let stored = await db
      .prepare('SELECT plan FROM crm_sync_runs WHERE id = ?')
      .bind(id)
      .first<{ plan: string }>();
    if (!stored) {
      const eligible = scheduledCrmRows(workspace, write, rowIds);
      if (!eligible.length) continue;
      const plan = await previewCrmSync(
        workspace,
        eligible,
        write.config,
        options,
      );
      plan.id = id;
      await db
        .prepare(
          'INSERT OR IGNORE INTO crm_sync_runs (id,workspace_id,provider,status,plan,created_at) VALUES (?,?,?,?,?,?)',
        )
        .bind(
          id,
          workspace.id,
          write.config.provider,
          plan.status,
          JSON.stringify(plan),
          plan.createdAt,
        )
        .run();
      stored = await db
        .prepare('SELECT plan FROM crm_sync_runs WHERE id = ?')
        .bind(id)
        .first<{ plan: string }>();
    }
    if (!stored) throw new Error('CRM preview was not persisted.');
    const prior = JSON.parse(stored.plan) as CrmSyncPlan;
    planIds.push(id);
    if (prior.status === 'complete') continue;
    if (prior.status !== 'preview')
      throw new Error(
        `CRM batch ${id} needs review before any retry. Inspect Write to CRM history.`,
      );
    const result = await confirm(id);
    if (
      result.status !== 'complete' ||
      result.actions.some((a) => a.status !== 'verified')
    )
      throw new Error(
        `CRM batch ${id} did not verify. Inspect Write to CRM history.`,
      );
  }
  return planIds;
}
