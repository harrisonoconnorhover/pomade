import { createHttpColumns } from './http-enrichment';
import type { WorkspaceSnapshot } from './pomade-types';
export const APOLLO_COMPANY_CONNECTION = 'pomade_apollo_company';
export function createApolloCompanyColumns(
  workspace: WorkspaceSnapshot,
  domainColumnId: string,
) {
  if (
    !workspace.columns.some(
      (c) => c.id === domainColumnId && c.kind !== 'status',
    )
  )
    throw new Error('Choose an existing domain input column.');
  let id = 'apollo_company';
  let suffix = 2;
  while (
    workspace.columns.some((c) => c.id === id || c.id.startsWith(id + '_'))
  )
    id = `apollo_company_${suffix++}`;
  const columns = createHttpColumns(workspace, {
    id,
    title: 'Apollo company name',
    connectionId: APOLLO_COMPANY_CONNECTION,
    method: 'GET',
    pathTemplate: `/api/v1/organizations/enrich?domain={{${domainColumnId}}}`,
    outputs: [
      { title: 'Apollo company name', path: 'organization.name' },
      { title: 'Apollo domain', path: 'organization.primary_domain' },
      { title: 'Apollo industry', path: 'organization.industry' },
      {
        title: 'Apollo employees',
        path: 'organization.estimated_num_employees',
      },
    ],
  });
  columns[0].http!.preset = 'apollo-company';
  columns[0].http!.presetInputKey = domainColumnId;
  columns[3].valueType = 'number';
  columns[0].outputFields![3].valueType = 'number';
  return columns;
}
