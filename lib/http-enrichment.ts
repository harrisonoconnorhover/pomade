import {
  normalizeContactProviderResponse,
  validateContactProviderRequest,
} from './contact-provider-contracts';
import { normalizeLookupKey } from './table-lookup';
import type {
  ActionReceipt,
  HttpRecipe,
  PomadeColumn,
  PomadeRow,
  WorkspaceSnapshot,
} from './pomade-types';

export type HttpConnection = {
  id: string;
  label: string;
  origin: string;
  methods: ('GET' | 'POST')[];
  headers: Record<string, string>;
  requestDelayMs?: number;
  requestTimeoutMs?: number;
  // Only server-created connections can supply query credentials.
  secretQuery?: Record<string, string>;
};
export type HttpConnectionSummary = Omit<
  HttpConnection,
  'headers' | 'secretQuery'
>;
export function httpConnections(raw?: string): HttpConnection[] {
  if (!raw?.trim()) return [];
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error('POMADE_HTTP_CONNECTIONS must be a JSON object.');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(
      'HTTP connections must be an object keyed by connection name.',
    );
  return Object.entries(value).map(([id, config]) => {
    if (
      !/^[a-zA-Z0-9_-]{1,80}$/.test(id) ||
      !config ||
      typeof config !== 'object'
    )
      throw new Error('Invalid HTTP connection entry.');
    const c = config as {
      label?: unknown;
      origin?: unknown;
      methods?: unknown;
      headers?: unknown;
    };
    let origin: URL;
    try {
      origin = new URL(String(c.origin));
    } catch {
      throw new Error(`Connection ${id} needs an origin URL.`);
    }
    if (
      !['http:', 'https:'].includes(origin.protocol) ||
      origin.username ||
      origin.password ||
      origin.pathname !== '/' ||
      origin.search ||
      origin.hash
    )
      throw new Error(
        `Connection ${id} needs an origin without credentials, paths or query parameters.`,
      );
    const methods = c.methods ?? ['GET'];
    if (
      !Array.isArray(methods) ||
      !methods.length ||
      methods.some((method) => method !== 'GET' && method !== 'POST')
    )
      throw new Error(`Connection ${id} supports GET and POST only.`);
    const headers = c.headers ?? {};
    if (
      !headers ||
      typeof headers !== 'object' ||
      Array.isArray(headers) ||
      Object.values(headers).some((v) => typeof v !== 'string')
    )
      throw new Error(`Connection ${id} needs string header values.`);
    try {
      new Headers(headers as Record<string, string>);
    } catch {
      throw new Error(`Connection ${id} has invalid headers.`);
    }
    return {
      id,
      label: typeof c.label === 'string' ? c.label : id,
      origin: origin.origin,
      methods: methods as ('GET' | 'POST')[],
      headers: headers as Record<string, string>,
    };
  });
}
export function publicHttpConnections(
  connections: HttpConnection[],
): HttpConnectionSummary[] {
  return connections.map(({ id, label, origin, methods }) => ({
    id,
    label,
    origin,
    methods,
  }));
}
export function httpInputFields(config: HttpRecipe) {
  return [
    ...new Set(
      [
        ...`${config.pathTemplate} ${config.bodyTemplate ?? ''}`.matchAll(
          /\{\{\s*([a-zA-Z0-9_-]+)\s*\}\}/g,
        ),
      ].map((match) => match[1]),
    ),
  ];
}
function interpolate(
  text: string,
  row: PomadeRow,
  column: PomadeColumn,
  encode: boolean,
) {
  return text.replace(/\{\{\s*([a-zA-Z0-9_-]+)\s*\}\}/g, (_, key: string) => {
    const field = column.inputBindings?.[key] ?? key;
    const raw = row.values[field] ?? '';
    const value =
      ['apollo-company', 'pdl-company'].includes(column.http?.preset ?? '') &&
      key === column.http?.presetInputKey
        ? normalizeLookupKey(raw, 'domain')
        : raw;
    if (!value.trim()) throw new Error(`Missing request input: ${key}`);
    return encode ? encodeURIComponent(value) : value;
  });
}
export function prepareHttpRequest(
  column: PomadeColumn,
  row: PomadeRow,
  connection: HttpConnection,
) {
  const config = column.http;
  if (!config || !connection.methods.includes(config.method))
    throw new Error('This request method is not enabled for the connection.');
  if (
    !config.pathTemplate.startsWith('/') ||
    config.pathTemplate.startsWith('//')
  )
    throw new Error('Use a relative API path beginning with one slash.');
  if (
    config.preset === 'apollo-company' &&
    (config.method !== 'GET' ||
      !config.presetInputKey ||
      config.pathTemplate !==
        `/api/v1/organizations/enrich?domain={{${config.presetInputKey}}}`)
  )
    throw new Error(
      'Apollo preset request settings changed. Recreate the preset or use a custom HTTP recipe.',
    );
  if (
    config.preset === 'pdl-company' &&
    (config.method !== 'GET' ||
      !config.presetInputKey ||
      config.pathTemplate !==
        `/v5/company/enrich?website={{${config.presetInputKey}}}`)
  )
    throw new Error(
      'PDL preset request settings changed. Recreate the preset or use a custom HTTP recipe.',
    );
  const path = interpolate(config.pathTemplate, row, column, true);
  const url = new URL(path, connection.origin);
  if (
    url.origin !== connection.origin ||
    url.username ||
    url.password ||
    url.hash
  )
    throw new Error('Requests must stay on the configured connection origin.');
  for (const [key, value] of Object.entries(connection.secretQuery ?? {}))
    url.searchParams.set(key, value);
  const headers = new Headers(connection.headers);
  headers.set('Accept', 'application/json');
  let body: string | undefined;
  if (config.method === 'POST') {
    let template: unknown;
    try {
      template = JSON.parse(config.bodyTemplate || '{}');
    } catch {
      throw new Error(
        'The request body must be valid JSON. Put column tokens inside JSON strings.',
      );
    }
    const visit = (value: unknown): unknown =>
      typeof value === 'string'
        ? interpolate(value, row, column, false)
        : Array.isArray(value)
          ? value.map(visit)
          : value && typeof value === 'object'
            ? Object.fromEntries(
                Object.entries(value).map(([key, entry]) => [
                  key,
                  visit(entry),
                ]),
              )
            : value;
    body = JSON.stringify(visit(template));
    headers.set('Content-Type', 'application/json');
  }
  validateContactProviderRequest(connection.id, url, body);
  return {
    url: url.toString(),
    init: { method: config.method, headers, body, redirect: 'manual' as const },
  };
}
export function jsonPath(value: unknown, path: string): unknown {
  if (path === '$') return value;
  if (!/^[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*$/.test(path)) return undefined;
  return path
    .split('.')
    .reduce<unknown>(
      (current, key) =>
        current && typeof current === 'object' && Object.hasOwn(current, key)
          ? (current as Record<string, unknown>)[key]
          : undefined,
      value,
    );
}
export function createHttpColumns(
  workspace: WorkspaceSnapshot,
  options: {
    id: string;
    title: string;
    connectionId: string;
    method: 'GET' | 'POST';
    pathTemplate: string;
    bodyTemplate?: string;
    outputs: { title: string; path: string }[];
  },
): PomadeColumn[] {
  if (
    !options.title.trim() ||
    !options.connectionId ||
    !options.pathTemplate.startsWith('/') ||
    options.pathTemplate.startsWith('//') ||
    options.pathTemplate.includes('\\')
  )
    throw new Error('Choose a name, connection and API path.');
  if (
    !options.outputs.length ||
    options.outputs.length > 16 ||
    options.outputs.some(
      (output) => !output.title.trim() || !output.path.trim(),
    )
  )
    throw new Error('Choose one to sixteen named response fields.');
  if (options.method === 'POST') {
    try {
      JSON.parse(options.bodyTemplate || '{}');
    } catch {
      throw new Error('The POST body must be valid JSON.');
    }
  }
  const titles = new Set(workspace.columns.map((c) => c.title.toLowerCase()));
  function title(base: string) {
    let result = base.trim();
    let n = 2;
    while (titles.has(result.toLowerCase())) result = `${base.trim()} ${n++}`;
    titles.add(result.toLowerCase());
    return result;
  }
  const fields = options.outputs.map((output, index) => ({
    id: index === 0 ? options.id : `${options.id}_${index}`,
    title: title(index === 0 ? options.title : output.title),
    valueType: 'text' as const,
  }));
  const status = {
    id: `${options.id}_status`,
    title: title('HTTP result'),
    valueType: 'text' as const,
  };
  fields.push(status);
  if (
    workspace.columns.length + fields.length > 100 ||
    fields.some((field) => workspace.columns.some((c) => c.id === field.id))
  )
    throw new Error(
      'The output columns exceed this table’s capacity or already exist.',
    );
  const config: HttpRecipe = {
    connectionId: options.connectionId,
    method: options.method,
    pathTemplate: options.pathTemplate,
    bodyTemplate: options.method === 'POST' ? options.bodyTemplate : undefined,
    outputs: options.outputs.map((output, index) => ({
      path: output.path.trim(),
      outputColumnId: fields[index].id,
    })),
    statusColumnId: status.id,
  };
  const inputs = httpInputFields(config);
  if (inputs.some((id) => !workspace.columns.some((c) => c.id === id)))
    throw new Error('A request token refers to a missing column ID.');
  return fields.map((field, index) => ({
    ...field,
    width: 240,
    kind: index ? 'text' : 'enrichment',
    ...(index
      ? {}
      : {
          recipe: 'http-api' as const,
          http: config,
          inputBindings: Object.fromEntries(inputs.map((id) => [id, id])),
          outputFields: fields,
        }),
  }));
}
export async function boundedJson(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Empty response body.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 1_048_576) throw new Error('Response exceeds 1 MB.');
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    throw new Error('Response is not valid JSON.');
  }
}
export async function executeHttpRecipe(
  workspace: WorkspaceSnapshot,
  rowId: string,
  column: PomadeColumn,
  connections: HttpConnection[],
  fetchImpl: typeof fetch = fetch,
) {
  const row = workspace.rows.find((candidate) => candidate.id === rowId);
  const config = column.http;
  if (!row || !config?.outputs?.length || !config.statusColumnId)
    throw new Error('HTTP recipe configuration is incomplete.');
  const started = Date.now();
  let status = 'Complete';
  let failure: string | undefined;
  let sent = false;
  const values = Object.fromEntries(
    config.outputs.map((output) => [output.outputColumnId, '']),
  );
  const connection = connections.find(
    (candidate) => candidate.id === config.connectionId,
  );
  try {
    if (!connection) throw new Error('HTTP connection is not configured.');
    const request = prepareHttpRequest(column, row, connection);
    let response: Response;
    if (connection.requestDelayMs)
      await new Promise((resolve) =>
        setTimeout(resolve, connection.requestDelayMs),
      );
    try {
      sent = true;
      response = await fetchImpl(request.url, {
        ...request.init,
        signal: AbortSignal.timeout(connection.requestTimeoutMs ?? 15_000),
      });
    } catch {
      throw new Error('Request failed or timed out; it was not retried.');
    }
    if (connection.id === 'pomade_hunter' && response.status === 202) {
      await response.body?.cancel();
      throw new Error(
        'Hunter verification is still pending. Run this verification again later; no fallback was automatically started.',
      );
    }
    if (connection.id === 'pomade_hunter' && response.status === 222) {
      await response.body?.cancel();
      throw new Error(
        'Hunter could not complete the SMTP check. Try this verification again later.',
      );
    }
    let data: unknown;
    let providerMiss = false;
    if (
      connection.id === 'pomade_pdl_people' &&
      new URL(request.url).pathname === '/v5/person/enrich' &&
      response.status === 404
    ) {
      await response.body?.cancel();
      data = {};
      providerMiss = true;
      status = 'No matching person with the required field';
    }
    if (connection.id === 'pomade_prospeo' && response.status === 400) {
      data = await boundedJson(response);
      const code = jsonPath(data, 'error_code');
      if (code === 'NO_MATCH') {
        providerMiss = true;
        status = 'No matching verified record';
      } else {
        const reason =
          typeof code === 'string' && /^[A-Z_]{1,60}$/.test(code)
            ? code
            : 'request rejected';
        throw new Error(`Prospeo: ${reason}`);
      }
    }
    if (!response.ok && !providerMiss) {
      await response.body?.cancel();
      throw new Error(
        `HTTP ${response.status}${response.status >= 300 && response.status < 400 ? ' — redirect refused' : ''}`,
      );
    }
    if (!providerMiss)
      data = normalizeContactProviderResponse(
        connection.id,
        new URL(request.url),
        await boundedJson(response),
      );
    if (connection.id === 'pomade_zerobounce' && jsonPath(data, 'error'))
      throw new Error(
        'ZeroBounce rejected the request. Check the API key, credits, and request inputs.',
      );
    // Findymail documents application errors even with an HTTP 200 response.
    // Never treat account/credit failures as a miss and silently spend on fallback.
    if (connection.id === 'pomade_findymail' && jsonPath(data, 'error')) {
      const reason = jsonPath(data, 'error');
      throw new Error(
        reason === 'Not enough credits' || reason === 'Subscription is paused'
          ? `Findymail: ${reason}`
          : 'Findymail rejected the request. Check the account and request inputs.',
      );
    }
    if (config.preset === 'apollo-company' || config.preset === 'pdl-company') {
      const expected = new URL(request.url).searchParams.get(
        config.preset === 'apollo-company' ? 'domain' : 'website',
      );
      const returned = jsonPath(
        data,
        config.preset === 'apollo-company'
          ? 'organization.primary_domain'
          : 'website',
      );
      if (
        typeof returned !== 'string' ||
        normalizeLookupKey(returned, 'domain') !== expected
      )
        throw new Error(
          `${config.preset === 'apollo-company' ? 'Apollo' : 'PDL'} returned no matching domain. Results withheld for review.`,
        );
    }
    const missing: string[] = [];
    for (const output of config.outputs) {
      const value = jsonPath(data, output.path);
      if (value === undefined || value === null) {
        missing.push(output.path);
        continue;
      }
      const text =
        typeof value === 'string' ? value : (JSON.stringify(value) ?? '');
      const maxCharacters = Array.isArray(value) ? 20_000 : 4_000;
      if (text.length > maxCharacters) {
        missing.push(
          `${output.path} (over ${maxCharacters.toLocaleString('en-US')} characters)`,
        );
        continue;
      }
      values[output.outputColumnId] = text;
    }
    if (missing.length && !providerMiss)
      status = `Missing response fields: ${missing.join(', ')}`;
  } catch (error) {
    status = error instanceof Error ? error.message : 'HTTP request failed.';
    failure = status;
  }
  values[config.statusColumnId] = status;
  const receipt: ActionReceipt = {
    id: crypto.randomUUID(),
    rowId,
    rowLabel: row.values.company || rowId,
    columnId: column.id,
    action: column.title,
    status: status === 'Complete' ? 'passed' : 'review',
    durationMs: Date.now() - started,
    before: row.values[column.id] ?? '',
    after: values[column.id] ?? '',
    outputValues: values,
    error: failure,
    provider: sent
      ? config.preset === 'apollo-company'
        ? 'apollo'
        : 'http'
      : 'local',
    creditsConsumed: sent ? null : 0,
    evidence: [
      `Connection: ${connection?.label ?? config.connectionId}`,
      `Method: ${config.method}`,
      ...(config.preset === 'apollo-company'
        ? [
            'Apollo lists 1 credit per organization; actual credit usage was not reported by this response.',
          ]
        : []),
      status,
    ],
  };
  return {
    workspace: {
      ...workspace,
      rows: workspace.rows.map((candidate) =>
        candidate.id === rowId
          ? { ...candidate, values: { ...candidate.values, ...values } }
          : candidate,
      ),
    },
    receipt,
  };
}
