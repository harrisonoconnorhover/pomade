import {
  CONTACT_INPUTS,
  CONTACT_PROVIDER_PRESETS,
} from './contact-provider-presets';
import {
  APOLLO_COMPANY_CONNECTION,
  PDL_COMPANY_CONNECTION,
} from './provider-presets';
import { APOLLO_PHONE_CONNECTION } from './apollo-phone';
export type CatalogCategory =
  | 'all'
  | 'email'
  | 'phone'
  | 'company'
  | 'research';
export type CatalogAction = {
  id: string;
  category: Exclude<CatalogCategory, 'all'>;
  provider: string;
  label: string;
  inputs: string[];
  target:
    | { type: 'contact'; presetId: string; connectionId: string }
    | { type: 'company'; provider: 'apollo' | 'pdl'; connectionId: string }
    | { type: 'research'; provider: 'codex' | 'parallel' | 'gemini' };
};
export const PROVIDER_CATALOG: CatalogAction[] = [
  ...CONTACT_PROVIDER_PRESETS.map(
    (preset): CatalogAction => ({
      id: preset.id,
      category: preset.accept.includes('phone') ? 'phone' : 'email',
      provider: preset.provider,
      label: preset.label,
      inputs: preset.inputs.map((input) => CONTACT_INPUTS[input]),
      target: {
        type: 'contact',
        presetId: preset.id,
        connectionId: preset.connectionId,
      },
    }),
  ),
  {
    id: 'apollo-company',
    category: 'company',
    provider: 'Apollo',
    label: 'Apollo · enrich company details',
    inputs: ['Company domain'],
    target: {
      type: 'company',
      provider: 'apollo',
      connectionId: APOLLO_COMPANY_CONNECTION,
    },
  },
  {
    id: 'pdl-company',
    category: 'company',
    provider: 'People Data Labs',
    label: 'People Data Labs · enrich company details',
    inputs: ['Company domain'],
    target: {
      type: 'company',
      provider: 'pdl',
      connectionId: PDL_COMPANY_CONNECTION,
    },
  },
  ...(['parallel', 'codex', 'gemini'] as const).map(
    (provider): CatalogAction => ({
      id: `research-${provider}`,
      category: 'research',
      provider:
        provider === 'codex'
          ? 'ChatGPT Codex'
          : provider === 'parallel'
            ? 'Parallel'
            : 'Gemini',
      label:
        provider === 'codex'
          ? 'ChatGPT subscription · deep web research'
          : provider === 'parallel'
            ? 'Parallel · quick web research'
            : 'Gemini · web research',
      inputs: ['Research prompt', 'Company, domain, or other context columns'],
      target: { type: 'research', provider },
    }),
  ),
];
export function searchProviderCatalog(
  query: string,
  category: CatalogCategory,
): CatalogAction[] {
  const words = query.trim().toLowerCase().split(/\s+/);
  return PROVIDER_CATALOG.filter(
    (action) =>
      (category === 'all' || action.category === category) &&
      words.every((word) =>
        `${action.provider} ${action.label} ${action.inputs.join(' ')}`
          .toLowerCase()
          .includes(word),
      ),
  );
}
export type CatalogConnections = {
  http?: string[];
  research?: {
    provider: string | null;
    configured: boolean;
    alternatives?: { provider: string; configured: boolean }[];
  };
};
export function catalogConnectionStatus(
  action: CatalogAction,
  connections: CatalogConnections,
): { configured: boolean; label: string } {
  const target = action.target;
  if (target.type === 'research') {
    const research = connections.research;
    const configured =
      research?.alternatives?.find((p) => p.provider === target.provider)
        ?.configured ??
      (research?.provider === target.provider
        ? research.configured
        : undefined);
    return {
      configured: Boolean(configured),
      label:
        configured === undefined
          ? 'Couldn’t check'
          : configured
            ? target.provider === 'codex'
              ? 'Connection configured · Mac required'
              : 'Key configured'
            : 'Setup needed',
    };
  }
  const configured = connections.http?.includes(target.connectionId);
  return {
    configured: Boolean(configured),
    label:
      configured === undefined
        ? 'Couldn’t check'
        : configured
          ? 'Key configured'
          : target.connectionId === APOLLO_PHONE_CONNECTION
            ? 'API key + callback needed'
            : 'Setup needed',
  };
}
