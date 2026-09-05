import type {
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
const importedFieldIds = new Set([
  ...sourceColumns.map((column) => column.id),
  statusColumn.id,
]);

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
  const currentById = new Map(current.map((column) => [column.id, column]));
  const required = sourceColumns.map(
    (column) => currentById.get(column.id) ?? column,
  );
  const requiredIds = new Set(required.map((column) => column.id));
  const remainder = current.filter(
    (column) => column.kind !== 'status' && !requiredIds.has(column.id),
  );
  return [
    ...required,
    ...remainder,
    current.find((column) => column.kind === 'status') ?? statusColumn,
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
  const columns = mergedColumns(workspace.columns);
  const incoming = preview.contacts.map((contact) =>
    sourceRow(preview, contact, columns),
  );
  const rows =
    mode === 'replace'
      ? incoming
      : appendRows(workspace.rows, incoming, columns);

  return {
    ...workspace,
    name: mode === 'replace' ? preview.sourceLabel : workspace.name,
    columns,
    rows,
    updatedAt: Date.now(),
    source: {
      provider: preview.provider,
      label: preview.sourceLabel,
      importedAt: Date.parse(preview.readAt) || Date.now(),
    },
  };
}

function appendRows(
  current: PomadeRow[],
  incoming: PomadeRow[],
  columns: PomadeColumn[],
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
        ...Object.fromEntries(
          Object.entries(row.values).filter(([columnId]) =>
            importedFieldIds.has(columnId),
          ),
        ),
      },
    };
  }
  return normalized;
}
