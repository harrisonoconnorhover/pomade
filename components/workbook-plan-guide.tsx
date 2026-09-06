'use client';
import { useState } from 'react';
import { Button } from './ui/button';
import type { WorkspaceSnapshot } from '@/lib/pomade-types';

type TransferPreview = {
  sourceRevision: number;
  targetRevision: number;
  added: number;
  updated: number;
  skipped: number;
  review: number;
};
export default function WorkbookPlanGuide({
  workspace,
  ready,
  onRun,
  onOpenTable,
}: {
  workspace: WorkspaceSnapshot;
  ready: boolean;
  onRun: (columnId: string) => void;
  onOpenTable: (tableId: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [preview, setPreview] = useState<{
    id: string;
    data: TransferPreview;
  }>();
  const plan = workspace.workbookPlan;
  if (!plan) return null;
  async function transfer(id: string, apply: boolean) {
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/transfers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceId: workspace.id,
          ruleId: id,
          apply,
          ...(apply && preview?.id === id
            ? {
                sourceRevision: preview.data.sourceRevision,
                targetRevision: preview.data.targetRevision,
              }
            : {}),
        }),
      });
      const data = (await response.json()) as {
        preview?: TransferPreview;
        receipt?: TransferPreview;
        error?: string;
      };
      if (!response.ok)
        throw new Error(data.error || 'The route could not be applied.');
      if (data.preview) setPreview({ id, data: data.preview });
      if (data.receipt) {
        setPreview(undefined);
        setMessage(
          `${data.receipt.added} rows added, ${data.receipt.updated} updated, ${data.receipt.review} need review in the destination sheet.`,
        );
      }
    } catch (e) {
      setPreview(undefined);
      setMessage(e instanceof Error ? e.message : 'Transfer failed.');
    } finally {
      setBusy(false);
    }
  }
  const otherTables = plan.tables.filter((table) => table.id !== workspace.id);
  return (
    <details className="workbook-plan-guide" open>
      <summary>Workbook plan · {plan.name}</summary>
      <p>{plan.purpose}</p>
      <ol>
        {plan.steps.map((step, index) =>
          step.tableId !== workspace.id ? null : (
            <li
              key={`${step.tableId}:${step.columnId ?? step.transferId}`}
              value={index + 1}
            >
              <div>
                <strong>{step.title}</strong>
                <p>{step.detail}</p>
              </div>
              {step.columnId ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={
                    !ready ||
                    busy ||
                    !workspace.columns.some((c) => c.id === step.columnId)
                  }
                  onClick={() => onRun(step.columnId!)}
                >
                  Run step
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!ready || busy}
                  onClick={() => void transfer(step.transferId!, false)}
                >
                  Preview route
                </Button>
              )}
              {preview && preview.id === step.transferId ? (
                <div className="workbook-route-preview">
                  <p>
                    {preview.data.added} new · {preview.data.updated} updates ·{' '}
                    {preview.data.review} need review · {preview.data.skipped}{' '}
                    skipped
                  </p>
                  <Button
                    size="sm"
                    disabled={
                      !ready ||
                      busy ||
                      !(preview.data.added + preview.data.updated)
                    }
                    onClick={() => void transfer(step.transferId!, true)}
                  >
                    Transfer matching rows
                  </Button>
                </div>
              ) : null}
            </li>
          ),
        )}
      </ol>
      {message ? <output>{message}</output> : null}
      {otherTables.length ? (
        <div className="workbook-guide-links">
          Other sheets:{' '}
          {otherTables.map((table) => (
            <Button
              key={table.id}
              variant="ghost"
              size="sm"
              disabled={!ready || busy}
              onClick={() => onOpenTable(table.id)}
            >
              {table.name}
            </Button>
          ))}
        </div>
      ) : null}
      <details>
        <summary>Original request and separate steps</summary>
        <p className="workbook-original-request">{plan.request}</p>
        {plan.assumptions.length ? (
          <>
            <strong>Assumptions</strong>
            <ul>
              {plan.assumptions.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
          </>
        ) : null}
        {plan.manualTasks.length ? (
          <>
            <strong>Separate steps</strong>
            <ul>
              {plan.manualTasks.map((task, i) => (
                <li key={i}>{task}</li>
              ))}
            </ul>
          </>
        ) : null}
      </details>
    </details>
  );
}
