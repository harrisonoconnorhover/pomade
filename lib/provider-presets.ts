import { createProviderWaterfall } from './provider-waterfall';
import { createHttpColumns } from './http-enrichment';
import type { HttpProviderStep, WorkspaceSnapshot } from './pomade-types';
export const APOLLO_COMPANY_CONNECTION = 'pomade_apollo_company';
export const APOLLO_PEOPLE_CONNECTION = 'pomade_apollo_people';
export const LEADMAGIC_CONNECTION = 'pomade_leadmagic';
export const PROSPEO_CONNECTION = 'pomade_prospeo';
export const HUNTER_CONNECTION = 'pomade_hunter';
export const PDL_COMPANY_CONNECTION = 'pomade_pdl_company';
export function emailProviderStep(
  provider: 'hunter' | 'apollo' | 'prospeo' | 'leadmagic',
  person = 'person',
  domain = 'domain',
): HttpProviderStep {
  if (provider === 'leadmagic')
    return {
      connectionId: LEADMAGIC_CONNECTION,
      method: 'POST',
      pathTemplate: '/v1/people/email-finder',
      bodyTemplate: JSON.stringify({
        full_name: `{{${person}}}`,
        domain: `{{${domain}}}`,
      }),
      responsePath: 'email',
      verification: { path: 'status', acceptedValues: ['valid'] },
    };
  if (provider === 'prospeo')
    return {
      connectionId: PROSPEO_CONNECTION,
      method: 'POST',
      pathTemplate: '/enrich-person',
      bodyTemplate: JSON.stringify({
        only_verified_email: true,
        enrich_mobile: false,
        data: { full_name: `{{${person}}}`, company_website: `{{${domain}}}` },
      }),
      responsePath: 'person.email.email',
      verification: {
        path: 'person.email.status',
        acceptedValues: ['VERIFIED'],
      },
    };
  return provider === 'hunter'
    ? {
        connectionId: HUNTER_CONNECTION,
        method: 'GET',
        pathTemplate: `/v2/email-finder?domain={{${domain}}}&full_name={{${person}}}&max_duration=10`,
        responsePath: 'data.email',
        verification: {
          path: 'data.verification.status',
          acceptedValues: ['valid'],
        },
      }
    : {
        connectionId: APOLLO_PEOPLE_CONNECTION,
        method: 'POST',
        pathTemplate: '/api/v1/people/match',
        bodyTemplate: JSON.stringify({
          name: `{{${person}}}`,
          domain: `{{${domain}}}`,
          reveal_personal_emails: false,
          reveal_phone_number: false,
        }),
        responsePath: 'person.email',
        verification: {
          path: 'person.email_status',
          acceptedValues: ['verified'],
        },
      };
}
export function createApolloCompanyColumns(
  workspace: WorkspaceSnapshot,
  domainColumnId: string,
  detailed = false,
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
      ...(detailed
        ? [
            {
              title: 'Apollo revenue estimate',
              path: 'organization.annual_revenue_printed',
            },
            { title: 'Apollo city', path: 'organization.city' },
            { title: 'Apollo state', path: 'organization.state' },
            { title: 'Apollo country', path: 'organization.country' },
            {
              title: 'Apollo total funding',
              path: 'organization.total_funding',
            },
            {
              title: 'Apollo latest funding stage',
              path: 'organization.latest_funding_stage',
            },
            {
              title: 'Apollo funding history',
              path: 'organization.funding_events',
            },
            {
              title: 'Apollo technologies',
              path: 'organization.technology_names',
            },
            {
              title: 'Apollo annual revenue (USD)',
              path: 'organization.annual_revenue',
            },
          ]
        : []),
    ],
  });
  columns[0].http!.preset = 'apollo-company';
  columns[0].http!.presetInputKey = domainColumnId;
  columns[3].valueType = 'number';
  columns[0].outputFields![3].valueType = 'number';
  if (detailed) {
    columns[12].valueType = 'number';
    columns[0].outputFields![12].valueType = 'number';
  }
  return columns;
}

export function createPdlCompanyColumns(
  workspace: WorkspaceSnapshot,
  domainColumnId: string,
) {
  let id = 'pdl_company',
    suffix = 2;
  while (
    workspace.columns.some((c) => c.id === id || c.id.startsWith(id + '_'))
  )
    id = `pdl_company_${suffix++}`;
  const columns = createHttpColumns(workspace, {
    id,
    title: 'PDL company name',
    connectionId: PDL_COMPANY_CONNECTION,
    method: 'GET',
    pathTemplate: `/v5/company/enrich?website={{${domainColumnId}}}`,
    outputs: [
      { title: 'PDL company name', path: 'name' },
      { title: 'PDL domain', path: 'website' },
      { title: 'PDL industry', path: 'industry' },
      { title: 'PDL employees', path: 'employee_count' },
      { title: 'PDL size range', path: 'size' },
      { title: 'PDL revenue band', path: 'inferred_revenue' },
      { title: 'PDL location', path: 'location.name' },
      { title: 'PDL funding', path: 'total_funding_raised' },
      { title: 'PDL latest funding stage', path: 'latest_funding_stage' },
    ],
  });
  columns[0].http!.preset = 'pdl-company';
  columns[0].http!.presetInputKey = domainColumnId;
  columns[3].valueType = 'number';
  columns[0].outputFields![3].valueType = 'number';
  return columns;
}

export function prospeoMobileStep(
  person = 'person',
  domain = 'domain',
): HttpProviderStep {
  return {
    connectionId: PROSPEO_CONNECTION,
    method: 'POST',
    pathTemplate: '/enrich-person',
    bodyTemplate: JSON.stringify({
      only_verified_mobile: true,
      data: { full_name: `{{${person}}}`, company_website: `{{${domain}}}` },
    }),
    responsePath: 'person.mobile.mobile',
    verification: {
      path: 'person.mobile.status',
      acceptedValues: ['VERIFIED'],
      revealedPath: 'person.mobile.revealed',
    },
  };
}
export function createProspeoMobileColumns(
  workspace: WorkspaceSnapshot,
  person: string,
  domain: string,
) {
  if (
    !person ||
    !domain ||
    person === domain ||
    ![person, domain].every((id) => workspace.columns.some((c) => c.id === id))
  )
    throw new Error('Choose separate full-name and company-domain columns.');
  return createProviderWaterfall(workspace, {
    id: 'verified_mobile',
    title: 'Verified mobile',
    steps: [prospeoMobileStep(person, domain)],
    accept: 'verified-phone',
    continueOnError: false,
  });
}

// The documented response has no verification/ownership flag. Use phone-format
// acceptance; do not promote a successful lookup to verified-phone.
export function leadMagicMobileStep(email = 'email'): HttpProviderStep {
  return {
    connectionId: LEADMAGIC_CONNECTION,
    method: 'POST',
    pathTemplate: '/v1/people/mobile-finder',
    bodyTemplate: JSON.stringify({ work_email: `{{${email}}}` }),
    responsePath: 'mobile_number',
  };
}
