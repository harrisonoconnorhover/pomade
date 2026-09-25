import type {
  PomadeColumn,
  PomadeRow,
  WorkspaceSnapshot,
} from './pomade-types';

export const initialColumns: PomadeColumn[] = [
  { id: 'company', title: 'Company', kind: 'text', width: 170 },
  { id: 'person', title: 'Person', kind: 'text', width: 160 },
  { id: 'title', title: 'Title', kind: 'text', width: 175 },
  { id: 'domain', title: 'Website input', kind: 'text', width: 260 },
  {
    id: 'normalized_domain',
    title: 'Normalized domain',
    kind: 'formula',
    width: 190,
    recipe: 'normalize-domain',
  },
  {
    id: 'first_name',
    title: 'First name',
    kind: 'formula',
    width: 140,
    recipe: 'first-name',
  },
  {
    id: 'contact_key',
    title: 'Contact key',
    kind: 'formula',
    width: 330,
    recipe: 'dedupe-key',
  },
  { id: 'status', title: 'Run status', kind: 'status', width: 160 },
];

// Fictional companies and people; .example domains cannot be live prospects.
// Outputs start blank and are produced only by the existing local formulas.
const rawRows: Array<Record<string, string>> = [
  {
    company: 'Aster Works',
    person: 'Maya Chen',
    title: 'Operations lead',
    domain: 'HTTPS://WWW.ASTER.EXAMPLE/about',
  },
  {
    company: 'Birch Labs',
    person: 'Rowan Patel',
    title: 'Sales manager',
    domain: 'https://birch.example/team',
  },
  {
    company: 'Cedar Services',
    person: 'Lee Morgan',
    title: 'Operations lead',
    domain: '',
  },
];

export const initialRows: PomadeRow[] = rawRows.map((values, index) => ({
  id: `sample-${index + 1}`,
  values: {
    ...values,
    normalized_domain: '',
    first_name: '',
    contact_key: '',
    status: 'Draft',
  },
}));

export function createSampleWorkspace(): WorkspaceSnapshot {
  return {
    // Keep the existing default ID; saved sheets are loaded before this factory.
    id: 'founder-targets',
    name: 'Synthetic cleanup example',
    columns: initialColumns.map((column) => ({ ...column })),
    rows: initialRows.map((row) => ({ ...row, values: { ...row.values } })),
    recipeTemplates: [],
    updatedAt: Date.now(),
    source: {
      provider: 'sample',
      label: 'Synthetic data · local formulas · no research or CRM writes',
      importedAt: Date.now(),
    },
  };
}
