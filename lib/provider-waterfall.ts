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
export const verifiedAcceptance = (accept: ProviderWaterfall['accept']) =>
  accept === 'verified-email' || accept === 'verified-phone';
function validateAcceptance(
  config: Pick<ProviderWaterfall, 'accept' | 'steps'>,
) {
  if (
    ![
      'nonempty',
      'email',
      'phone',
      'verified-email',
      'verified-phone',
    ].includes(config.accept)
  )
    throw new Error('Choose an acceptance rule.');
  if (
    verifiedAcceptance(config.accept) &&
    config.steps.some(
      (step) =>
        !step.verification?.path?.trim() ||
        !/^[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*$/.test(step.verification.path) ||
        !step.verification.acceptedValues?.length ||
        step.verification.acceptedValues.length > 8 ||
        step.verification.acceptedValues.some(
          (value) => typeof value !== 'string' || !value.trim(),
        ),
    )
  )
    throw new Error(
      'Each provider needs a verification status path and its accepted verified statuses.',
    );
}
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
  validateAcceptance(options);
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
  validateAcceptance(config);
  const started = Date.now();
  const attempts: ActionReceipt[] = [];
  let value = '',
    winner = '',
    error: string | undefined;
  for (const [index, step] of config.steps.entries()) {
    const label =
      connections.find((c) => c.id === step.connectionId)?.label ||
      step.connectionId;
    const verificationId = `${column.id}__verification`;
    const virtual: PomadeColumn = {
      ...column,
      recipe: 'http-api',
      title: `${index + 1}. ${label}`,
      http: {
        ...step,
        outputs: [
          { path: step.responsePath, outputColumnId: column.id },
          ...(verifiedAcceptance(config.accept)
            ? [
                {
                  path: step.verification!.path,
                  outputColumnId: verificationId,
                },
              ]
            : []),
        ],
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
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate);
    const phone = candidate.replace(/[\s().-]/g, '');
    const isPhone = /^\+[1-9]\d{6,14}$/.test(phone);
    const shapeMatches =
      config.accept === 'nonempty'
        ? Boolean(candidate)
        : config.accept.includes('email')
          ? isEmail
          : isPhone;
    const verification = receipt.outputValues?.[verificationId]?.trim() ?? '';
    const verified =
      !verifiedAcceptance(config.accept) ||
      step.verification!.acceptedValues.some(
        (value) => value.trim().toLowerCase() === verification.toLowerCase(),
      );
    const accepted = !receipt.error && shapeMatches && verified;
    receipt.status = accepted ? 'passed' : 'review';
    receipt.evidence = [
      ...(receipt.evidence ?? []),
      ...(verifiedAcceptance(config.accept)
        ? [
            `Provider verification: ${verification || 'missing'} (${step.verification!.path}); observed ${new Date(started).toISOString()}`,
          ]
        : []),
      accepted
        ? 'Accepted; later providers skipped.'
        : receipt.error
          ? 'Technical error.'
          : !shapeMatches
            ? 'Missing or invalid result format.'
            : 'Verification was missing or did not meet the configured status rule.',
    ];
    attempts.push(receipt);
    if (accepted) {
      value = config.accept.includes('phone') ? phone : candidate;
      winner = label;
      error = undefined;
      break;
    }
    if (receipt.error) {
      error = receipt.error;
      if (!config.continueOnError || receipt.error === 'HTTP 451') break;
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
