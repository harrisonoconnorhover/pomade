import app from 'vinext/server/fetch-handler';

import {
  claimDueSchedule,
  completeClaimedSchedule,
  failClaimedSchedule,
} from './lib/recipe-schedule';
import type { RunReceipt, WorkspaceSnapshot } from './lib/pomade-types';

const MAX_WORKSPACES_PER_TICK = 3;

type WorkspaceRecord = {
  id: string;
  snapshot: string;
  updated_at: number;
};

async function saveWorkspace(
  env: Cloudflare.Env,
  workspace: WorkspaceSnapshot,
) {
  await env.DB.prepare(
    `UPDATE workspaces
     SET name = ?, snapshot = ?, updated_at = ?
     WHERE id = ?`,
  )
    .bind(
      workspace.name,
      JSON.stringify(workspace),
      workspace.updatedAt,
      workspace.id,
    )
    .run();
}

async function claimWorkspace(
  env: Cloudflare.Env,
  record: WorkspaceRecord,
  now: number,
) {
  const workspace = JSON.parse(record.snapshot) as WorkspaceSnapshot;
  const claimed = claimDueSchedule(workspace, now);
  if (!claimed) return null;
  const result = await env.DB.prepare(
    `UPDATE workspaces
     SET snapshot = ?, updated_at = ?
     WHERE id = ? AND updated_at = ?`,
  )
    .bind(
      JSON.stringify(claimed),
      claimed.updatedAt,
      record.id,
      record.updated_at,
    )
    .run();
  return result.meta.changes === 1 ? claimed : null;
}

async function scheduledRowIds(workspace: WorkspaceSnapshot) {
  const schedule = workspace.schedule;
  if (!schedule || schedule.target !== 'selected') return undefined;
  const known = new Set(workspace.rows.map((row) => row.id));
  const rowIds = (schedule.rowIds ?? []).filter((rowId) => known.has(rowId));
  if (!rowIds.length) {
    throw new Error('The scheduled rows no longer exist.');
  }
  return rowIds;
}

export async function runDueSchedules(
  scheduledTime: number,
  env: Cloudflare.Env,
  ctx: ExecutionContext,
) {
  const records = await env.DB.prepare(
    `SELECT id, snapshot, updated_at
     FROM workspaces
     ORDER BY updated_at ASC
     LIMIT 50`,
  ).all<WorkspaceRecord>();
  let claimedCount = 0;

  for (const record of records.results) {
    if (claimedCount >= MAX_WORKSPACES_PER_TICK) break;
    let claimed: WorkspaceSnapshot | null = null;
    let latestWorkspace: WorkspaceSnapshot | null = null;
    try {
      claimed = await claimWorkspace(env, record, scheduledTime);
      if (!claimed) continue;
      latestWorkspace = claimed;
      claimedCount += 1;
      const rowIds = await scheduledRowIds(claimed);
      const response = await app.fetch(
        new Request('https://pomade.internal/api/runs', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            workspace: claimed,
            rowIds,
            confirmExternalResearch:
              claimed.schedule?.confirmExternalResearch === true,
          }),
        }),
        env,
        ctx,
      );
      const result = (await response.json()) as {
        workspace?: WorkspaceSnapshot;
        run?: RunReceipt;
        error?: string;
      };
      if (!response.ok || !result.workspace || !result.run) {
        throw new Error(
          result.error || `Scheduled run failed (${response.status}).`,
        );
      }
      latestWorkspace = result.workspace;
      await saveWorkspace(
        env,
        completeClaimedSchedule(result.workspace, result.run, Date.now()),
      );
    } catch (error) {
      if (!latestWorkspace) continue;
      const message =
        error instanceof Error ? error.message : 'The scheduled run failed.';
      console.error(
        `Pomade schedule ${latestWorkspace.schedule?.id ?? 'unknown'} failed: ${message}`,
      );
      try {
        await saveWorkspace(
          env,
          failClaimedSchedule(latestWorkspace, message, Date.now()),
        );
      } catch (recoveryError) {
        console.error(
          `Pomade could not persist the failed schedule state: ${
            recoveryError instanceof Error
              ? recoveryError.message
              : 'unknown error'
          }`,
        );
      }
    }
  }
}

export default {
  fetch: app.fetch,
  scheduled(
    controller: ScheduledController,
    env: Cloudflare.Env,
    ctx: ExecutionContext,
  ) {
    controller.noRetry();
    ctx.waitUntil(runDueSchedules(controller.scheduledTime, env, ctx));
  },
} satisfies ExportedHandler<Cloudflare.Env>;
