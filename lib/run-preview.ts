import { conditionFields } from './run-conditions';
import type {
  PomadeColumn,
  PomadeRow,
  WorkspaceSnapshot,
} from './pomade-types';
import {
  CONTACT_PROVIDER_PRESETS,
  contactVerifierStep,
} from './contact-provider-presets';
import {
  countMaximumExternalActions,
  isExternalRecipe,
} from './external-recipes';
import { httpInputFields, type HttpConnectionSummary } from './http-enrichment';
import { shouldRunRecipe } from './local-recipe-engine';
export type PreviewConnections = {
  http?: HttpConnectionSummary[];
  research?: {
    provider: string | null;
    configured: boolean;
    alternatives?: { provider: string; configured: boolean; label: string }[];
  };
};
export type RunPreviewEntry = {
  rowId: string;
  rowLabel: string;
  columnId: string;
  columnLabel: string;
  state: 'ready' | 'dependent' | 'setup' | 'input' | 'skipped' | 'unchecked';
  details: string[];
  steps: string[];
  maximum: number;
};
export function previewRun(
  workspace: WorkspaceSnapshot,
  rowIds: string[],
  columnIds: string[],
  connections: PreviewConnections,
): RunPreviewEntry[] {
  const rows = workspace.rows.filter((r) => rowIds.includes(r.id));
  const columns = workspace.columns.filter(
    (c) =>
      (c.kind === 'enrichment' || c.kind === 'formula') &&
      columnIds.includes(c.id),
  );
  const titles = new Map(workspace.columns.map((c) => [c.id, c.title]));
  const entries: RunPreviewEntry[] = [];
  const preceding = new Set<string>();
  for (const column of columns) {
    if (isExternalRecipe(column))
      for (const row of rows) entries.push(entry(column, row, preceding));
    for (const id of [
      column.id,
      ...(column.outputFields ?? []).map((f) => f.id),
      ...(column.http?.outputs ?? []).map((f) => f.outputColumnId),
      ...(column.lookup?.outputs ?? []).map((f) => f.outputColumnId),
      column.providerWaterfall?.winnerColumnId,
      column.providerWaterfall?.statusColumnId,
      column.lineageColumnId,
    ])
      if (id) preceding.add(id);
  }
  return entries;
  function entry(
    column: PomadeColumn,
    row: PomadeRow,
    preceding: Set<string>,
  ): RunPreviewEntry {
    const details: string[] = [],
      steps: string[] = [];
    let setup = false,
      missing = false,
      dependent = false,
      unchecked = false;
    const maximum = countMaximumExternalActions([row], [column]);
    const conditionDependency = conditionFields(column.runCondition).some(
      (field) => preceding.has(field),
    );
    const skipped =
      maximum === 0 || (!shouldRunRecipe(column, row) && !conditionDependency);
    if (conditionDependency) {
      dependent = true;
      details.push('Condition will be checked after the earlier step.');
    }
    const checkInputs = (keys: string[], label: string) => {
      const blank = keys
        .map((key) => column.inputBindings?.[key] ?? key)
        .filter((field) => !row.values[field]?.trim());
      const waiting = blank.filter((field) => preceding.has(field));
      const absent = blank.filter((field) => !preceding.has(field));
      if (waiting.length) {
        dependent = true;
        details.push(
          `${label}: waiting for ${waiting.map((f) => titles.get(f) ?? f).join(', ')}.`,
        );
      }
      if (absent.length) {
        missing = true;
        details.push(
          `${label}: blank ${absent.map((f) => titles.get(f) ?? f).join(', ')}.`,
        );
      }
    };
    const checkConnection = (id: string, label: string) => {
      if (!connections.http) {
        unchecked = true;
        details.push(`${label}: connection has not been checked.`);
      }
      if (connections.http && !connections.http.some((c) => c.id === id)) {
        setup = true;
        details.push(
          id === 'pomade_apollo_phone'
            ? 'Apollo mobile: add API access and a public callback URL in Connections.'
            : `${label}: connection missing.`,
        );
      }
    };
    if (column.recipe === 'web-research') {
      const id = column.researchProvider ?? connections.research?.provider;
      const provider = connections.research?.alternatives?.find(
        (p) => p.provider === id,
      );
      const label = provider?.label ?? id ?? 'Research provider';
      steps.push(label);
      if (!connections.research) {
        unchecked = true;
        details.push('Research connection has not been checked.');
      }
      if (
        connections.research &&
        !(
          provider?.configured ??
          (id === connections.research.provider &&
            connections.research.configured)
        )
      ) {
        setup = true;
        details.push(`${label}: connection missing.`);
      }
      checkInputs(
        [...(column.prompt?.matchAll(/{{\s*([a-zA-Z0-9_-]+)\s*}}/g) ?? [])].map(
          (m) => m[1],
        ),
        label,
      );
    } else {
      const requests =
        column.recipe === 'http-waterfall'
          ? (column.providerWaterfall?.steps ?? [])
          : column.http
            ? [column.http]
            : [];
      if (!requests.length) {
        setup = true;
        details.push('Recipe has no configured request.');
      }
      for (const request of requests) {
        const label =
          connections.http?.find((c) => c.id === request.connectionId)?.label ??
          CONTACT_PROVIDER_PRESETS.find(
            (p) => p.connectionId === request.connectionId,
          )?.provider ??
          request.connectionId;
        steps.push(label);
        checkConnection(request.connectionId, label);
        checkInputs(
          httpInputFields({ ...request, outputs: [], statusColumnId: '' }),
          label,
        );
        if ('verifier' in request && request.verifier) {
          try {
            const verifier = contactVerifierStep(request.verifier.presetId);
            const name =
              CONTACT_PROVIDER_PRESETS.find(
                (p) => p.id === request.verifier?.presetId,
              )?.provider ?? request.verifier.presetId;
            steps.push(`${name} verification (if a candidate is found)`);
            checkConnection(verifier.connectionId, name);
          } catch {
            setup = true;
            details.push('Choose a supported verifier.');
          }
        }
      }
    }
    return {
      rowId: row.id,
      rowLabel: row.values.person || row.values.company || row.id,
      columnId: column.id,
      columnLabel: column.title,
      state: skipped
        ? 'skipped'
        : setup
          ? 'setup'
          : missing
            ? 'input'
            : unchecked
              ? 'unchecked'
              : dependent
                ? 'dependent'
                : 'ready',
      details: skipped ? ['Current condition skips this action.'] : details,
      steps,
      maximum,
    };
  }
}
