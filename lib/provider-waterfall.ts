import {
  executeHttpRecipe,
  createHttpColumns,
  httpInputFields,
  type HttpConnection,
} from './http-enrichment';
import type {
  PomadeColumn,
  WorkspaceSnapshot,
  ProviderWaterfall,
  HttpProviderStep,
  ActionReceipt,
} from './pomade-types';
export function providerInputFields(config: ProviderWaterfall) {
  return [
    ...new Set(
      config.steps.flatMap((step) =>
        httpInputFields({ ...step, outputs: [], statusColumnId: '' }),
      ),
    ),
  ];
}
export function createProviderWaterfall(
  workspace: WorkspaceSnapshot,
  options: {
    id: string;
    title: string;
    steps: HttpProviderStep[];
    accept: ProviderWaterfall['accept'];
    continueOnError: boolean;
  },
): PomadeColumn[] {
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(options.id))
    throw new Error('Choose a name containing letters or numbers.');
  if (options.steps.length < 2 || options.steps.length > 4)
    throw new Error('Choose two to four provider steps.');
  if (!['nonempty', 'email'].includes(options.accept))
    throw new Error('Choose an acceptance rule.');
  for (const step of options.steps)
    createHttpColumns(workspace, {
      id: options.id,
      title: options.title,
      connectionId: step.connectionId,
      method: step.method,
      pathTemplate: step.pathTemplate,
      bodyTemplate: step.bodyTemplate,
      outputs: [{ title: options.title, path: step.responsePath }],
    });
  const ids = [options.id, `${options.id}_provider`, `${options.id}_status`];
  if (
    workspace.columns.length + 3 > 100 ||
    ids.some((id) => workspace.columns.some((c) => c.id === id))
  )
    throw new Error('Choose a unique name and leave room for three columns.');
  return [
    {
      id: ids[0],
      title: options.title,
      kind: 'enrichment',
      recipe: 'http-waterfall',
      width: 220,
      providerWaterfall: {
        steps: structuredClone(options.steps),
        accept: options.accept,
        continueOnError: options.continueOnError,
        winnerColumnId: ids[1],
        statusColumnId: ids[2],
      },
      outputFields: [
        { id: ids[0], title: options.title, valueType: 'text' },
        { id: ids[1], title: 'Winning provider', valueType: 'text' },
        { id: ids[2], title: 'Waterfall status', valueType: 'text' },
      ],
    },
    { id: ids[1], title: 'Winning provider', kind: 'text', width: 180 },
    { id: ids[2], title: 'Waterfall status', kind: 'text', width: 220 },
  ];
}
export async function executeProviderWaterfall(
  workspace: WorkspaceSnapshot,
  rowId: string,
  column: PomadeColumn,
  connections: HttpConnection[],
  fetcher: typeof fetch = fetch,
) {
  const config = column.providerWaterfall;
  const row = workspace.rows.find((r) => r.id === rowId);
  if (!config || !row || config.steps.length < 2 || config.steps.length > 4)
    throw new Error('Provider waterfall configuration is incomplete.');
  const started = Date.now();
  const attempts: ActionReceipt[] = [];
  let value = '',
    winner = '',
    error: string | undefined;
  for (const [index, step] of config.steps.entries()) {
    const label =
      connections.find((c) => c.id === step.connectionId)?.label ||
      step.connectionId;
    const virtual: PomadeColumn = {
      ...column,
      recipe: 'http-api',
      title: `${index + 1}. ${label}`,
      http: {
        ...step,
        outputs: [{ path: step.responsePath, outputColumnId: column.id }],
        statusColumnId: config.statusColumnId,
      },
    };
    const result = await executeHttpRecipe(
      workspace,
      rowId,
      virtual,
      connections,
      fetcher,
    );
    const receipt = result.receipt;
    const candidate = receipt.after.trim();
    const accepted =
      !receipt.error &&
      Boolean(candidate) &&
      (config.accept === 'nonempty' ||
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate));
    receipt.status = accepted ? 'passed' : 'review';
    receipt.evidence = [
      ...(receipt.evidence ?? []),
      accepted
        ? 'Accepted; later providers skipped.'
        : receipt.error
          ? 'Technical error.'
          : config.accept === 'email'
            ? 'No email-shaped value.'
            : 'No nonempty value.',
    ];
    attempts.push(receipt);
    if (accepted) {
      value = candidate;
      winner = label;
      error = undefined;
      break;
    }
    if (receipt.error) {
      error = receipt.error;
      if (!config.continueOnError) break;
    }
  }
  const values = {
    [column.id]: value,
    [config.winnerColumnId]: winner,
    [config.statusColumnId]: winner
      ? `Accepted after ${attempts.length} attempt(s)`
      : error
        ? `Stopped: ${error}`
        : 'No provider returned an acceptable value',
  };
  const sent = attempts.some((a) => a.provider === 'http');
  const receipt: ActionReceipt = {
    id: crypto.randomUUID(),
    rowId,
    rowLabel: row.values.company || rowId,
    columnId: column.id,
    action: column.title,
    status: winner ? 'passed' : 'review',
    durationMs: Date.now() - started,
    before: row.values[column.id] ?? '',
    after: value,
    outputValues: values,
    provider: sent ? 'http' : 'local',
    creditsConsumed: sent ? null : 0,
    error,
    attempts,
    evidence: attempts.map(
      (a) =>
        `${a.action}: ${a.error ?? (a.status === 'passed' ? 'accepted' : 'no acceptable result')}`,
    ),
  };
  return {
    workspace: {
      ...workspace,
      rows: workspace.rows.map((r) =>
        r.id === rowId ? { ...r, values: { ...r.values, ...values } } : r,
      ),
    },
    receipt,
  };
}
