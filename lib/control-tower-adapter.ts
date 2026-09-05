import type {
  CrmProvider,
  PomadeColumn,
  WorkspaceSnapshot,
} from './pomade-types';

export type ControlTowerContactField =
  | 'fullName'
  | 'firstName'
  | 'lastName'
  | 'email'
  | 'company'
  | 'phone'
  | 'jobTitle'
  | 'website';

export type ControlTowerFieldMapping = {
  sourceColumnId: string;
  sourceColumnTitle: string;
  contactField: ControlTowerContactField;
  destinationFields: string[];
};

type FieldSpec = {
  id: ControlTowerContactField;
  label: string;
  aliases: string[];
  destinations: Record<CrmProvider, string[]>;
};

export const CONTROL_TOWER_FIELD_SPECS: FieldSpec[] = [
  {
    id: 'fullName',
    label: 'Full name',
    aliases: ['person', 'name', 'fullname', 'contactname'],
    destinations: {
      hubspot: ['firstname', 'lastname'],
      salesforce: ['FirstName', 'LastName'],
    },
  },
  {
    id: 'firstName',
    label: 'First name',
    aliases: ['firstname', 'givenname'],
    destinations: { hubspot: ['firstname'], salesforce: ['FirstName'] },
  },
  {
    id: 'lastName',
    label: 'Last name',
    aliases: ['lastname', 'surname', 'familyname'],
    destinations: { hubspot: ['lastname'], salesforce: ['LastName'] },
  },
  {
    id: 'email',
    label: 'Work email',
    aliases: [
      'email',
      'workemail',
      'businessemail',
      'apolloemail',
      'normalizedemail',
    ],
    destinations: { hubspot: ['email'], salesforce: ['Email'] },
  },
  {
    id: 'company',
    label: 'Company',
    aliases: ['company', 'companyname', 'account', 'accountname'],
    destinations: { hubspot: ['company'], salesforce: ['Company'] },
  },
  {
    id: 'phone',
    label: 'Phone',
    aliases: ['phone', 'workphone', 'mobile', 'mobilephone'],
    destinations: { hubspot: ['phone'], salesforce: ['Phone'] },
  },
  {
    id: 'jobTitle',
    label: 'Job title',
    aliases: ['title', 'jobtitle', 'position', 'role'],
    destinations: { hubspot: ['jobtitle'], salesforce: ['Title'] },
  },
  {
    id: 'website',
    label: 'Website',
    aliases: ['website', 'companywebsite', 'domain', 'companydomain'],
    destinations: { hubspot: ['website'], salesforce: ['Website'] },
  },
];

export type ControlTowerPreviewPlan = {
  source: 'pomade';
  workspaceId: string;
  mode: 'preview';
  destination: {
    provider: CrmProvider;
    objectType: 'contact' | 'lead';
  };
  fieldMappings: ControlTowerFieldMapping[];
  records: Array<{
    rowId: string;
    externalKey: string;
    proposedFields: Partial<Record<ControlTowerContactField, string>>;
  }>;
  guards: {
    maxRecords: 100;
    allowCreate: false;
  };
};

function normalized(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function editableColumns(columns: PomadeColumn[]) {
  return columns.filter(
    (column) => column.kind !== 'status' && !column.id.startsWith('__'),
  );
}

export function suggestControlTowerMappings(
  columns: PomadeColumn[],
  provider: CrmProvider,
): ControlTowerFieldMapping[] {
  const available = editableColumns(columns);
  const usedColumns = new Set<string>();

  return CONTROL_TOWER_FIELD_SPECS.flatMap((spec) => {
    const source = available.find((column) => {
      if (usedColumns.has(column.id)) return false;
      const candidates = [normalized(column.id), normalized(column.title)];
      return candidates.some((candidate) => spec.aliases.includes(candidate));
    });
    if (!source) return [];
    usedColumns.add(source.id);
    return [
      {
        sourceColumnId: source.id,
        sourceColumnTitle: source.title,
        contactField: spec.id,
        destinationFields: spec.destinations[provider],
      },
    ];
  });
}

function validMappings(
  workspace: WorkspaceSnapshot,
  provider: CrmProvider,
  mappings: ControlTowerFieldMapping[],
) {
  const columns = new Map(
    editableColumns(workspace.columns).map((column) => [column.id, column]),
  );
  const specs = new Map(
    CONTROL_TOWER_FIELD_SPECS.map((spec) => [spec.id, spec]),
  );
  const usedFields = new Set<ControlTowerContactField>();
  const usedColumns = new Set<string>();

  return mappings.flatMap((mapping) => {
    const column = columns.get(mapping.sourceColumnId);
    const spec = specs.get(mapping.contactField);
    if (
      !column ||
      !spec ||
      usedFields.has(spec.id) ||
      usedColumns.has(column.id)
    )
      return [];
    usedFields.add(spec.id);
    usedColumns.add(column.id);
    return [
      {
        sourceColumnId: column.id,
        sourceColumnTitle: column.title,
        contactField: spec.id,
        destinationFields: spec.destinations[provider],
      },
    ];
  });
}

// Pomade can propose data, but it never executes CRM writes itself. The plan
// must be previewed and approved inside GTM Control Tower before any provider
// connector is called.
export function toControlTowerPreview(
  workspace: WorkspaceSnapshot,
  selectedRowIds = workspace.rows.map((row) => row.id),
  options?: {
    provider?: CrmProvider;
    mappings?: ControlTowerFieldMapping[];
  },
): ControlTowerPreviewPlan {
  const provider = options?.provider ?? 'hubspot';
  const mappings = validMappings(
    workspace,
    provider,
    options?.mappings ??
      suggestControlTowerMappings(workspace.columns, provider),
  );
  const selected = new Set(selectedRowIds);
  return {
    source: 'pomade',
    workspaceId: workspace.id,
    mode: 'preview',
    destination: {
      provider,
      objectType: provider === 'hubspot' ? 'contact' : 'lead',
    },
    fieldMappings: mappings,
    records: workspace.rows
      .filter((row) => selected.has(row.id))
      .slice(0, 100)
      .map((row) => ({
        rowId: row.id,
        externalKey:
          row.values.crm_source && row.values.crm_id
            ? `${row.values.crm_source}:${row.values.crm_id}`
            : row.values.email ||
              row.values.apollo_email ||
              row.values.domain ||
              row.id,
        proposedFields: Object.fromEntries(
          mappings.map((mapping) => [
            mapping.contactField,
            row.values[mapping.sourceColumnId] ?? '',
          ]),
        ),
      })),
    guards: {
      maxRecords: 100,
      allowCreate: false,
    },
  };
}
