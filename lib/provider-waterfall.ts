import {
  contactVerifierStep,
  CONTACT_VERIFIER_PRESETS,
  WATERFALL_CANDIDATE_INPUT,
} from './contact-provider-presets';
import { ASYNC_PROVIDER_CONNECTIONS, hasAsyncProvider } from './async-provider';
import { WaterfallProgress } from '../db/waterfall-progress';
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
  for (const step of config.steps) {
    if (!step.verifier) continue;
    contactVerifierStep(step.verifier.presetId);
    const verifier = CONTACT_VERIFIER_PRESETS.find(
      (p) => p.id === step.verifier!.presetId,
    )!;
    if (
      config.accept === 'nonempty' ||
      config.accept.includes('phone') !== verifier.accept.includes('phone')
    )
      throw new Error(
        'The verifier must match the waterfall’s email or phone acceptance rule.',
      );
  }
  if (
    verifiedAcceptance(config.accept) &&
    config.steps.some((step) => {
      const check = step.verifier
        ? contactVerifierStep(step.verifier.presetId)
        : step;
      return (
        !check.verification?.path?.trim() ||
        !/^[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*$/.test(
          check.verification.path,
        ) ||
        !check.verification.acceptedValues?.length ||
        check.verification.acceptedValues.length > 8 ||
        check.verification.acceptedValues.some(
          (value) => typeof value !== 'string' || !value.trim(),
        )
      );
    })
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
  if (options.steps.length < 1 || options.steps.length > 4)
    throw new Error('Choose one to four provider steps.');
  validateAcceptance(options);
  if (
    options.steps.some(
      (s) =>
        s.verification?.revealedPath &&
        !/^[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*$/.test(
          s.verification.revealedPath,
        ),
    )
  )
    throw new Error('Choose a valid revealed-status path.');
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
  execution?: { db: D1Database; id: string },
) {
  const config = column.providerWaterfall;
  const row = workspace.rows.find((r) => r.id === rowId);
  if (!config || !row || config.steps.length < 1 || config.steps.length > 4)
    throw new Error('Provider waterfall configuration is incomplete.');
  validateAcceptance(config);
  const started = Date.now();
  const asynchronous = hasAsyncProvider(column);
  const allRequests = config.steps.flatMap((step) => [
    step,
    ...(step.verifier ? [contactVerifierStep(step.verifier.presetId)] : []),
  ]);
  if (
    asynchronous &&
    !execution &&
    allRequests.some(
      (step) =>
        ASYNC_PROVIDER_CONNECTIONS.includes(step.connectionId) &&
        connections.some((c) => c.id === step.connectionId),
    )
  )
    throw new Error(
      'Run asynchronous providers in the background so their request IDs can be saved and resumed.',
    );
  const operationScope = execution?.id ?? crypto.randomUUID();
  // Persist all background waterfalls: a verifier error must not repeat its finder.
  const progress = execution
    ? await WaterfallProgress.open(execution.db, {
        executionId: execution.id,
        workspaceId: workspace.id,
        rowId,
        columnId: column.id,
        fingerprint: JSON.stringify([
          config,
          column.inputBindings,
          providerInputFields(config)
            .sort()
            .map((key) => [
              key,
              row.values[column.inputBindings?.[key] ?? key] ?? '',
            ]),
        ]),
      })
    : undefined;
  const attempts: ActionReceipt[] = [];
  const phoneNumber = (value: string) => value.replace(/[\s().-]/g, '');
  const shaped = (candidate: string) =>
    config.accept === 'nonempty'
      ? Boolean(candidate)
      : config.accept.includes('email')
        ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate)
        : /^\+[1-9]\d{6,14}$/.test(phoneNumber(candidate));
  const sameContact = (a: string, b: string) =>
    config.accept.includes('phone')
      ? phoneNumber(a) === phoneNumber(b)
      : a.toLowerCase() === b.toLowerCase();
  const verificationId = `${column.id}__verification`,
    revealedId = `${column.id}__revealed`;
  async function attempt(
    step: HttpProviderStep,
    index: number,
    verify: boolean,
    candidate?: string,
  ) {
    const key = verify ? `v${index}` : index;
    const label =
      connections.find((c) => c.id === step.connectionId)?.label ||
      step.connectionId;
    const checkStatus =
      verify || (verifiedAcceptance(config!.accept) && !step.verifier);
    const virtual: PomadeColumn = {
      ...column,
      recipe: 'http-api',
      title: `${index + 1}. ${label}${verify ? ' · verify candidate' : ''}`,
      inputBindings: {
        ...column.inputBindings,
        ...(verify
          ? { [WATERFALL_CANDIDATE_INPUT]: WATERFALL_CANDIDATE_INPUT }
          : {}),
      },
      http: {
        ...step,
        outputs: [
          { path: step.responsePath, outputColumnId: column.id },
          ...(step.verification?.revealedPath
            ? [
                {
                  path: step.verification.revealedPath,
                  outputColumnId: revealedId,
                },
              ]
            : []),
          ...(checkStatus
            ? [
                {
                  path: step.verification!.path,
                  outputColumnId: verificationId,
                },
              ]
            : []),
        ],
        statusColumnId: config!.statusColumnId,
      },
    };
    const saved = progress?.state.attempts[key];
    const input = verify
      ? {
          ...workspace,
          rows: workspace.rows.map((r) =>
            r.id === rowId
              ? {
                  ...r,
                  values: {
                    ...r.values,
                    [WATERFALL_CANDIDATE_INPUT]: candidate!,
                  },
                }
              : r,
          ),
        }
      : workspace;
    const receipt: ActionReceipt = saved
      ? { ...saved, cached: true, creditsConsumed: 0, httpRequestCount: 0 }
      : (
          await executeHttpRecipe(
            input,
            rowId,
            virtual,
            connections,
            fetcher,
            progress ? { progress, index: key } : undefined,
          )
        ).receipt;
    receipt.operationId = `${operationScope}:${rowId}:${column.id}:${key}`;
    receipt.operationRole = verify ? 'verification' : 'lookup';
    receipt.waterfallStep = index;
    receipt.providerConnectionId = step.connectionId;
    receipt.providerLabel = label;
    const value = receipt.after.trim();
    const status = receipt.outputValues?.[verificationId]?.trim() ?? '';
    const verified =
      !checkStatus ||
      step.verification!.acceptedValues.some(
        (v) => v.trim().toLowerCase() === status.toLowerCase(),
      );
    const revealed =
      !step.verification?.revealedPath ||
      receipt.outputValues?.[revealedId]?.trim().toLowerCase() === 'true';
    if (
      verify &&
      !receipt.pending &&
      !receipt.error &&
      shaped(value) &&
      !sameContact(candidate!, value)
    ) {
      receipt.error =
        'Verifier returned a different contact value; results withheld.';
      receipt.stopWaterfall = true;
    }
    const accepted =
      !receipt.pending &&
      !receipt.error &&
      shaped(value) &&
      verified &&
      revealed;
    receipt.outcome = receipt.pending
      ? 'pending'
      : receipt.error
        ? 'error'
        : accepted
          ? step.verifier
            ? 'candidate'
            : 'accepted'
          : 'rejected';
    receipt.status = accepted ? 'passed' : 'review';
    receipt.evidence = [
      ...(receipt.evidence ?? []),
      ...(checkStatus
        ? [
            `Provider verification: ${status || 'missing'} (${step.verification!.path})`,
          ]
        : []),
      receipt.pending
        ? 'Waiting for result; later providers have not started.'
        : receipt.error
          ? 'Technical error.'
          : accepted
            ? step.verifier
              ? 'Candidate found; verification is required.'
              : 'Accepted; later providers skipped.'
            : 'Missing, invalid or rejected contact value.',
    ];
    attempts.push(receipt);
    if (
      progress &&
      !saved &&
      !receipt.pending &&
      (!receipt.error ||
        (config!.continueOnError &&
          !receipt.stopWaterfall &&
          receipt.error !== 'HTTP 451'))
    )
      await progress.saveAttempt(key, receipt);
    return { receipt, value, accepted, label };
  }
  let value = '',
    winner = '',
    error: string | undefined,
    pending = false,
    stoppedEarly = false;
  for (const [index, step] of config.steps.entries()) {
    const found = await attempt(step, index, false);
    let result = found;
    if (found.accepted && step.verifier) {
      result = await attempt(
        contactVerifierStep(step.verifier.presetId),
        index,
        true,
        found.value,
      );
      found.receipt.outcome = result.accepted
        ? 'accepted'
        : result.receipt.pending || result.receipt.error
          ? 'candidate'
          : 'rejected';
      found.receipt.status = result.accepted ? 'passed' : 'review';
      found.receipt.evidence = [
        ...(found.receipt.evidence ?? []),
        result.accepted
          ? `Accepted after verification by ${result.label}.`
          : result.receipt.pending
            ? `Waiting for verification by ${result.label}.`
            : result.receipt.error
              ? 'Verification needs attention.'
              : `Rejected by ${result.label}; try the next finder.`,
      ];
    }
    if (result.receipt.pending) {
      pending = true;
      error = undefined;
      break;
    }
    if (result.accepted) {
      value = config.accept.includes('phone')
        ? phoneNumber(found.value)
        : found.value;
      winner = found.label;
      error = undefined;
      break;
    }
    if (result.receipt.error) {
      error = result.receipt.error;
      if (
        result.receipt.stopWaterfall ||
        !config.continueOnError ||
        error === 'HTTP 451'
      ) {
        stoppedEarly = true;
        break;
      }
    }
  }
  const providerErrors = attempts.filter((a) => a.error).length;
  const finderCount = attempts.filter(
    (a) => a.operationRole === 'lookup',
  ).length;
  const values = {
    [column.id]: pending ? (row.values[column.id] ?? '') : value,
    [config.winnerColumnId]: pending
      ? (row.values[config.winnerColumnId] ?? '')
      : winner,
    [config.statusColumnId]: pending
      ? (attempts.at(-1)?.outputValues?.[config.statusColumnId] ??
        'Waiting for provider results')
      : winner
        ? `Accepted after ${finderCount} ${finderCount === 1 ? 'attempt' : 'attempts'}${attempts.some((a) => a.operationRole === 'verification') ? ' · independently verified' : ''}`
        : stoppedEarly
          ? `Stopped: ${error}`
          : error
            ? `All providers tried; no acceptable value. ${providerErrors} provider ${providerErrors === 1 ? 'error' : 'errors'}.`
            : 'No provider returned an acceptable value',
  };
  const receipt: ActionReceipt = {
    id: crypto.randomUUID(),
    rowId,
    rowLabel: row.values.company || rowId,
    columnId: column.id,
    action: column.title,
    status: winner ? 'passed' : 'review',
    durationMs: Date.now() - started,
    before: row.values[column.id] ?? '',
    after: values[column.id],
    pending: pending || undefined,
    nextCheckAt: pending || error ? attempts.at(-1)?.nextCheckAt : undefined,
    httpRequestCount: attempts.reduce(
      (sum, a) => sum + (a.httpRequestCount ?? 0),
      0,
    ),
    outputValues: values,
    provider: attempts.some((a) => a.provider === 'http') ? 'http' : 'local',
    creditsConsumed: attempts.some((a) => a.creditsConsumed === null)
      ? null
      : attempts.reduce((sum, a) => sum + (a.creditsConsumed ?? 0), 0),
    error,
    attempts,
    evidence: attempts.map(
      (a) =>
        `${a.action}: ${a.pending ? 'waiting for result' : (a.error ?? (a.outcome === 'candidate' ? 'candidate awaiting verification' : a.status === 'passed' ? 'accepted' : 'no acceptable result'))}`,
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
