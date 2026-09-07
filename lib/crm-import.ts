import type {
  CrmObjectType,
  CrmProvider,
  CrmSourceContact,
  CrmSourcePreview,
  PomadeColumn,
  PomadeRow,
  WorkspaceSnapshot,
} from './pomade-types';

export type CrmImportMode = 'replace' | 'append';

const sourceColumns: PomadeColumn[] = [
  { id: 'company', title: 'Company', kind: 'text', width: 180 },
  { id: 'person', title: 'Person', kind: 'text', width: 170 },
  { id: 'title', title: 'Title', kind: 'text', width: 185 },
  { id: 'email', title: 'Work email', kind: 'text', width: 220 },
  { id: 'phone', title: 'Phone', kind: 'text', width: 170 },
  { id: 'domain', title: 'Company domain', kind: 'text', width: 180 },
  { id: 'crm_source', title: 'CRM source', kind: 'text', width: 145 },
  { id: 'crm_id', title: 'CRM record ID', kind: 'text', width: 190 },
  { id: 'crm_account_id', title: 'CRM account ID', kind: 'text', width: 190 },
  { id: 'description', title: 'Description', kind: 'text', width: 240 },
  { id: 'firstname', title: 'First name', kind: 'text', width: 150 },
  { id: 'lastname', title: 'Last name', kind: 'text', width: 150 },
];

const statusColumn: PomadeColumn = {
  id: 'status',
  title: 'Run status',
  kind: 'status',
  width: 140,
};
const importedFieldIds = new Set(sourceColumns.map((column) => column.id));

export type SavedCrmSource = {
  provider: CrmProvider;
  objectType: CrmObjectType;
  segmentId?: string;
  fields: string[];
};

export function savedCrmSource(
  workspace: WorkspaceSnapshot,
): SavedCrmSource | undefined {
  const source = workspace.source;
  if (
    !source ||
    (source.provider !== 'hubspot' && source.provider !== 'salesforce')
  )
    return;
  const providerLabel =
    source.provider === 'hubspot' ? 'HubSpot' : 'Salesforce';
  // Older imports saved the segment or row identity, before object/field settings.
  const types = [
    ...new Set(
      workspace.rows
        .map((row) => row.values.crm_source)
        .filter((value) => value?.startsWith(`${providerLabel} `))
        .map((value) => value.slice(providerLabel.length + 1)),
    ),
  ];
  const objectType =
    source.objectType ??
    source.segment?.objectType ??
    (types.length === 1 ? (types[0] as CrmObjectType) : undefined);
  if (
    !objectType ||
    !(
      source.provider === 'hubspot'
        ? ['contact', 'company']
        : ['lead', 'contact', 'account']
    ).includes(objectType)
  )
    return;
  return {
    provider: source.provider,
    objectType,
    segmentId: source.provider === 'hubspot' ? source.segment?.id : undefined,
    fields:
      source.fields ??
      workspace.columns
        .filter((column) => column.id.startsWith('crm_property_'))
        .map((column) => column.id.slice('crm_property_'.length)),
  };
}

function protectedColumnIds(columns: PomadeColumn[]) {
  return new Set(
    columns.flatMap((column) => [
      ...(column.kind !== 'text' || column.recipe ? [column.id] : []),
      ...(column.outputFields?.map((field) => field.id) ?? []),
      ...(column.http?.outputs.map((output) => output.outputColumnId) ?? []),
      ...(column.lookup?.outputs.map((output) => output.outputColumnId) ?? []),
      ...[
        column.http?.statusColumnId,
        column.lookup?.statusColumnId,
        column.providerWaterfall?.winnerColumnId,
        column.providerWaterfall?.statusColumnId,
        column.lineageColumnId,
      ].filter((id): id is string => Boolean(id)),
    ]),
  );
}

function importableValues(
  values: Record<string, string>,
  protectedIds: Set<string>,
  propertyIds: string[],
) {
  return Object.fromEntries(
    Object.entries(values).filter(
      ([id]) =>
        !protectedIds.has(id) &&
        (importedFieldIds.has(id) || propertyIds.includes(id)),
    ),
  );
}

function rowIdentity(row: PomadeRow) {
  return `${row.values.crm_source ?? ''}|${row.values.crm_id ?? ''}`;
}

export function reviewCrmImport(
  workspace: WorkspaceSnapshot,
  preview: CrmSourcePreview,
) {
  const existing = new Map(
    workspace.rows
      .filter((row) => row.values.crm_id)
      .map((row) => [rowIdentity(row), row]),
  );
  const protectedIds = protectedColumnIds(workspace.columns);
  const titles = new Map(
    [...sourceColumns, ...workspace.columns].map((column) => [
      column.id,
      column.title,
    ]),
  );
  const propertyIds = [
    ...new Set(
      preview.contacts.flatMap((contact) =>
        Object.keys(contact.properties ?? {}),
      ),
    ),
  ].map((name) => `crm_property_${name}`);
  const seen = new Set<string>();
  const changes: {
    nativeId: string;
    label: string;
    fields: { title: string; before: string; after: string }[];
  }[] = [];
  let added = 0;
  let unchanged = 0;
  for (const contact of preview.contacts) {
    const values = contactValues(preview.provider, contact);
    const key = `${values.crm_source}|${values.crm_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const current = existing.get(key);
    if (!current) {
      added++;
      continue;
    }
    const updates = importableValues(
      { ...Object.fromEntries(propertyIds.map((id) => [id, ''])), ...values },
      protectedIds,
      propertyIds,
    );
    const fields = Object.entries(updates)
      .filter(([id, value]) => (current.values[id] ?? '') !== value)
      .map(([id, value]) => ({
        title: titles.get(id) ?? `CRM: ${id.slice('crm_property_'.length)}`,
        before: current.values[id] ?? '',
        after: value,
      }));
    if (fields.length)
      changes.push({
        nativeId: contact.nativeId,
        label: contact.fullName || contact.company || contact.nativeId,
        fields,
      });
    else unchanged++;
  }
  const objectType =
    preview.objectType ??
    preview.segment?.objectType ??
    preview.contacts[0]?.objectType;
  const sourceLabel = `${preview.provider === 'hubspot' ? 'HubSpot' : 'Salesforce'} ${objectType}`;
  const notReturned =
    preview.truncated || !objectType
      ? null
      : [...existing.entries()].filter(
          ([key, row]) =>
            row.values.crm_source === sourceLabel && !seen.has(key),
        ).length;
  return { added, updated: changes.length, unchanged, notReturned, changes };
}

function companyDomain(value: string) {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return '';
  try {
    const url = new URL(
      trimmed.includes('://') ? trimmed : `https://${trimmed}`,
    );
    return url.hostname.replace(/^www\./, '');
  } catch {
    return trimmed
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .split('/')[0];
  }
}

function contactValues(
  provider: CrmSourcePreview['provider'],
  contact: CrmSourceContact,
) {
  return {
    ...Object.fromEntries(
      Object.entries(contact.properties ?? {}).map(([field, value]) => [
        `crm_property_${field}`,
        value,
      ]),
    ),
    company: contact.company,
    person: contact.fullName,
    title: contact.jobTitle,
    email: contact.email,
    phone: contact.phone,
    domain: companyDomain(contact.website),
    crm_source: `${provider === 'hubspot' ? 'HubSpot' : 'Salesforce'} ${contact.objectType}`,
    crm_account_id: contact.accountId ?? '',
    description: contact.description ?? '',
    firstname: contact.firstName,
    lastname: contact.lastName,
    crm_id: contact.nativeId,
    status: (
      contact.objectType === 'company' || contact.objectType === 'account'
        ? contact.company && contact.website
        : contact.fullName &&
          contact.company &&
          (contact.email || contact.website)
    )
      ? 'Ready'
      : 'Review',
  };
}

function mergedColumns(current: PomadeColumn[]) {
  const currentIds = new Set(current.map((column) => column.id));
  const missing = sourceColumns.filter((column) => !currentIds.has(column.id));
  const statusIndex = current.findIndex((column) => column.kind === 'status');
  return statusIndex < 0
    ? [...current, ...missing, statusColumn]
    : [
        ...current.slice(0, statusIndex),
        ...missing,
        ...current.slice(statusIndex),
      ];
}

function sourceRow(
  preview: CrmSourcePreview,
  contact: CrmSourceContact,
  columns: PomadeColumn[],
): PomadeRow {
  const values = contactValues(preview.provider, contact);
  return {
    id: `${preview.provider}-${contact.objectType}-${contact.nativeId}`,
    values: Object.fromEntries(
      columns.map((column) => [
        column.id,
        values[column.id as keyof typeof values] ?? '',
      ]),
    ),
  };
}

export function applyCrmImport(
  workspace: WorkspaceSnapshot,
  preview: CrmSourcePreview,
  mode: CrmImportMode,
): WorkspaceSnapshot {
  const properties = [
    ...new Set(
      preview.contacts.flatMap((c) => Object.keys(c.properties ?? {})),
    ),
  ];
  const propertyColumns: PomadeColumn[] = properties
    .filter(
      (name) => !workspace.columns.some((c) => c.id === `crm_property_${name}`),
    )
    .map((name) => ({
      id: `crm_property_${name}`,
      title: `CRM: ${name}`,
      kind: 'text',
      width: 200,
    }));
  const columns = mergedColumns([...workspace.columns, ...propertyColumns]);
  if (columns.length > 100)
    throw new Error(
      'The imported properties exceed this table’s 100-column capacity.',
    );
  const incoming = preview.contacts.map((contact) =>
    sourceRow(preview, contact, columns),
  );
  const rows =
    mode === 'replace'
      ? incoming
      : appendRows(
          workspace.rows,
          incoming,
          columns,
          properties.map((name) => `crm_property_${name}`),
        );

  if (rows.length > 5_000)
    throw new Error(
      'This import exceeds the table’s 5,000-row capacity. Use a smaller segment or another table.',
    );

  return {
    ...workspace,
    name: mode === 'replace' ? preview.sourceLabel : workspace.name,
    columns,
    rows,
    updatedAt: Date.now(),
    source: {
      provider: preview.provider,
      label: preview.sourceLabel,
      objectType:
        preview.objectType ??
        preview.segment?.objectType ??
        preview.contacts[0]?.objectType,
      fields: preview.fields ?? properties,
      ...(preview.segment ? { segment: preview.segment } : {}),
      importedAt: Date.parse(preview.readAt) || Date.now(),
    },
  };
}

function appendRows(
  current: PomadeRow[],
  incoming: PomadeRow[],
  columns: PomadeColumn[],
  propertyIds: string[] = [],
) {
  const normalized = current.map((row) => ({
    ...row,
    values: Object.fromEntries(
      columns.map((column) => [column.id, row.values[column.id] ?? '']),
    ),
  }));
  const indexByExternalId = new Map<string, number>(
    normalized
      .map(
        (row, index) =>
          [
            `${row.values.crm_source ?? ''}|${row.values.crm_id ?? ''}`,
            index,
          ] as const,
      )
      .filter(([key]) => key !== '|'),
  );

  const protectedIds = protectedColumnIds(columns);
  for (const row of incoming) {
    const key = `${row.values.crm_source}|${row.values.crm_id}`;
    const index = indexByExternalId.get(key);
    if (index === undefined) {
      indexByExternalId.set(key, normalized.length);
      normalized.push(row);
      continue;
    }
    normalized[index] = {
      ...normalized[index],
      values: {
        ...normalized[index].values,
        ...importableValues(row.values, protectedIds, propertyIds),
      },
    };
  }
  return normalized;
}

export function mergeCrmSourcePages(
  current: CrmSourcePreview,
  page: CrmSourcePreview,
): CrmSourcePreview {
  if (
    current.provider !== page.provider ||
    current.segment?.id !== page.segment?.id ||
    current.objectType !== page.objectType ||
    JSON.stringify(current.fields ?? []) !== JSON.stringify(page.fields ?? [])
  ) {
    throw new Error('The preview source changed. Start a fresh preview.');
  }
  const contacts = [
    ...new Map(
      [...current.contacts, ...page.contacts].map((contact) => [
        contact.nativeId,
        contact,
      ]),
    ).values(),
  ];
  if (contacts.length > 5_000)
    throw new Error(
      'A table can hold up to 5,000 rows. Import this page selection into a table before continuing separately.',
    );
  return { ...page, contacts, readAt: current.readAt };
}
