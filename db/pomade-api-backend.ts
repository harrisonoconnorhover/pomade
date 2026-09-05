import { ensureDatabase } from './ensure';
import { GET as listTables } from '@/app/api/tables/route';
import { POST as runRecipe, GET as listRuns } from '@/app/api/runs/route';
import { POST as readCrm } from '@/app/api/providers/crm/route';
import { POST as syncCrm } from '@/app/api/crm-sync/route';
import type { PomadeApiBackend } from '@/lib/pomade-api';
import { PomadeApiError } from '@/lib/pomade-api-auth';
import type { WorkspaceSnapshot, RunReceipt } from '@/lib/pomade-types';
import type { TableSummary } from '@/lib/workbook';

const request = (body: unknown) =>
  new Request('http://localhost/api/internal', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
async function result<T>(response: Response): Promise<T> {
  const value = (await response.json()) as T & { error?: string };
  if (!response.ok || value.error)
    throw new PomadeApiError(
      response.ok ? 502 : response.status,
      value.error || 'Pomade operation failed.',
    );
  return value;
}
export async function pomadeApiBackend(): Promise<PomadeApiBackend> {
  const db = await ensureDatabase();
  return {
    async listTables() {
      return (await result<{ tables: TableSummary[] }>(await listTables()))
        .tables;
    },
    async loadTable(id) {
      const record = await db
        .prepare('SELECT snapshot FROM workspaces WHERE id = ?')
        .bind(id)
        .first<{ snapshot: string }>();
      return record ? (JSON.parse(record.snapshot) as WorkspaceSnapshot) : null;
    },
    async runRecipe(workspace, rowIds, columnIds, allowExternalRequests) {
      return result<{ workspace: WorkspaceSnapshot; run: RunReceipt }>(
        await runRecipe(
          request({
            workspace,
            rowIds,
            columnIds,
            confirmExternalResearch: allowExternalRequests,
          }),
        ),
      );
    },
    async listRuns(id) {
      return result(
        await listRuns(
          new Request(
            `http://localhost/api/runs?workspaceId=${encodeURIComponent(id)}`,
          ),
        ),
      );
    },
    async readCrm(input) {
      return result(await readCrm(request(input)));
    },
    async previewCrm(workspaceId, rowIds, config) {
      return result(await syncCrm(request({ workspaceId, rowIds, config })));
    },
    async getCrmPlan(id) {
      const record = await db
        .prepare('SELECT plan FROM crm_sync_runs WHERE id = ?')
        .bind(id)
        .first<{ plan: string }>();
      return record ? JSON.parse(record.plan) : null;
    },
    async executeCrm(planId) {
      return result(await syncCrm(request({ planId, confirmWrite: true })));
    },
  };
}
