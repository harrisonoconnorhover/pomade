export type ConnectionField = {
  key: string;
  label: string;
  required?: boolean;
  public?: boolean;
};
export type ConnectionDefinition = {
  id: string;
  name: string;
  help: string;
  fields: ConnectionField[];
  hidden?: boolean;
};
const api = (
  id: string,
  name: string,
  key: string,
  help: string,
): ConnectionDefinition => ({
  id,
  name,
  help,
  fields: [{ key, label: 'API key', required: true }],
});
export const CONNECTIONS: ConnectionDefinition[] = [
  api(
    'apollo',
    'Apollo',
    'APOLLO_API_KEY',
    'Company and person enrichment. Use a key from your own Apollo account.',
  ),
  api(
    'hunter',
    'Hunter',
    'HUNTER_API_KEY',
    'Work email discovery and verification.',
  ),
  api(
    'prospeo',
    'Prospeo',
    'PROSPEO_API_KEY',
    'Verified email and mobile numbers.',
  ),
  api(
    'leadmagic',
    'LeadMagic',
    'LEADMAGIC_API_KEY',
    'Email and mobile lookup presets. Tested with sample responses; live API access is not yet verified. Mobile lookups do not include independent phone verification.',
  ),
  api(
    'pdl',
    'People Data Labs',
    'PDL_API_KEY',
    'Person and company enrichment.',
  ),
  api(
    'parallel',
    'Parallel',
    'PARALLEL_API_KEY',
    'Web research using your own credits.',
  ),
  api(
    'gemini',
    'Gemini',
    'GEMINI_API_KEY',
    'AI research with your Gemini API key.',
  ),
  {
    id: 'hubspot',
    name: 'HubSpot',
    help: 'Use a private app access token from the HubSpot account you want to import from and write to. Read/write permissions are required for the objects you use; segment imports also need list read permission.',
    fields: [
      {
        key: 'HUBSPOT_ACCESS_TOKEN',
        label: 'Private app access token',
        required: true,
      },
    ],
  },
  {
    id: 'salesforce',
    name: 'Salesforce',
    help: 'Use your Salesforce instance URL and access token. Add your app client ID and refresh token to renew expired sessions automatically. Reconnecting or disconnecting clears saved research and pending CRM work.',
    fields: [
      {
        key: 'SALESFORCE_INSTANCE_URL',
        label: 'Instance URL',
        required: true,
        public: true,
      },
      { key: 'SALESFORCE_ACCESS_TOKEN', label: 'Access token', required: true },
      { key: 'SALESFORCE_REFRESH_TOKEN', label: 'Refresh token (optional)' },
      { key: 'SALESFORCE_CLIENT_ID', label: 'App client ID (for renewal)' },
      {
        key: 'SALESFORCE_CLIENT_SECRET',
        label: 'App client secret (if required)',
      },
      {
        key: 'SALESFORCE_LOGIN_URL',
        label: 'Login URL (optional)',
        public: true,
      },
      {
        key: 'SALESFORCE_API_VERSION',
        label: 'API version (optional)',
        public: true,
      },
    ],
  },
  {
    id: 'research',
    name: 'Research defaults',
    help: '',
    hidden: true,
    fields: [
      'POMADE_RESEARCH_PROVIDER',
      'POMADE_CODEX_MODEL',
      'POMADE_CODEX_REASONING_EFFORT',
      'POMADE_CODEX_BROWSER',
      'PARALLEL_MODEL',
      'GEMINI_MODEL',
    ].map((key) => ({ key, label: key })),
  },
  {
    id: 'advanced',
    name: 'Advanced connections',
    help: '',
    hidden: true,
    fields: [
      'POMADE_HTTP_CONNECTIONS',
      'POMADE_API_KEYS',
      'POMADE_WEBHOOK_SOURCES',
    ].map((key) => ({ key, label: key })),
  },
  {
    id: 'companion',
    name: 'Personal research companion',
    help: '',
    hidden: true,
    fields: [
      'POMADE_COMPANION_TOKEN_SHA256',
      'POMADE_CODEX_URL',
      'POMADE_CODEX_TOKEN',
    ].map((key) => ({ key, label: key })),
  },
];
export const PRIVATE_ENV_KEYS = CONNECTIONS.flatMap((c) =>
  c.fields.map((f) => f.key),
);
export function connectionDefinition(id: string) {
  const definition = CONNECTIONS.find((c) => c.id === id && !c.hidden);
  if (!definition) throw new Error('Choose a supported connection.');
  return definition;
}
export function connectionValues(id: string, input: unknown) {
  const definition = connectionDefinition(id);
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new Error('Enter your connection details.');
  const values: Record<string, string> = {};
  for (const field of definition.fields) {
    const value = (input as Record<string, unknown>)[field.key];
    if (value !== undefined && typeof value !== 'string')
      throw new Error('Connection fields must be text.');
    const text = typeof value === 'string' ? value.trim() : '';
    if (field.required && !text) throw new Error(`${field.label} is required.`);
    if (text.length > 12000 || /[\r\n]/.test(text))
      throw new Error('Connection value is invalid.');
    if (text) values[field.key] = text;
  }
  for (const field of ['SALESFORCE_INSTANCE_URL', 'SALESFORCE_LOGIN_URL'])
    if (values[field]) {
      const url = new URL(values[field]);
      if (
        url.protocol !== 'https:' ||
        url.username ||
        url.password ||
        !/(^|\.)(salesforce\.com|force\.com)$/.test(url.hostname)
      )
        throw new Error('Use your Salesforce HTTPS URL.');
      values[field] = url.origin;
    }
  if (values.SALESFORCE_REFRESH_TOKEN && !values.SALESFORCE_CLIENT_ID)
    throw new Error('A refresh token also needs the app client ID.');
  return values;
}
