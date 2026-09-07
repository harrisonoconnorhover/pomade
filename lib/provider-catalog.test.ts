import { describe, expect, it } from 'vitest';
import {
  PROVIDER_CATALOG,
  searchProviderCatalog,
  catalogConnectionStatus,
} from './provider-catalog';
import { CONTACT_PROVIDER_PRESETS } from './contact-provider-presets';
describe('provider catalog', () => {
  it('exposes each supported contact action exactly once with its real inputs and connection', () => {
    expect(new Set(PROVIDER_CATALOG.map((a) => a.id)).size).toBe(
      PROVIDER_CATALOG.length,
    );
    const contacts = PROVIDER_CATALOG.filter(
      (a) => a.target.type === 'contact',
    );
    expect(contacts).toHaveLength(CONTACT_PROVIDER_PRESETS.length);
    for (const preset of CONTACT_PROVIDER_PRESETS)
      expect(contacts.find((a) => a.id === preset.id)?.target).toMatchObject({
        presetId: preset.id,
        connectionId: preset.connectionId,
      });
  });
  it('combines case-insensitive multiword search with task filters and input names', () => {
    expect(
      searchProviderCatalog('  APOLLO mobile ', 'phone').map((a) => a.id),
    ).toContain('apollo-mobile');
    expect(searchProviderCatalog('Apollo mobile', 'email')).toEqual([]);
    expect(searchProviderCatalog('company domain', 'company')).toHaveLength(2);
    expect(searchProviderCatalog('subscription', 'research')[0].target).toEqual(
      { type: 'research', provider: 'codex' },
    );
    expect(searchProviderCatalog('does-not-exist', 'all')).toEqual([]);
  });
  it('distinguishes missing keys, failed checks and Apollo phone callback requirements', () => {
    const phone = PROVIDER_CATALOG.find((a) => a.id === 'apollo-mobile')!;
    expect(catalogConnectionStatus(phone, {}).label).toBe('Couldn’t check');
    expect(catalogConnectionStatus(phone, { http: [] }).label).toBe(
      'API key + callback needed',
    );
    if (phone.target.type === 'contact')
      expect(
        catalogConnectionStatus(phone, { http: [phone.target.connectionId] }),
      ).toEqual({ configured: true, label: 'Key configured' });
  });
  it('checks the selected research service, and does not promise that a Mac is online', () => {
    const codex = PROVIDER_CATALOG.find((a) => a.id === 'research-codex')!;
    const parallel = PROVIDER_CATALOG.find(
      (a) => a.id === 'research-parallel',
    )!;
    const connections = {
      research: {
        provider: 'parallel',
        configured: true,
        alternatives: [
          { provider: 'codex', configured: false },
          { provider: 'parallel', configured: true },
        ],
      },
    };
    expect(catalogConnectionStatus(codex, connections).label).toBe(
      'Setup needed',
    );
    expect(catalogConnectionStatus(parallel, connections).label).toBe(
      'Key configured',
    );
    connections.research.alternatives[0].configured = true;
    expect(catalogConnectionStatus(codex, connections).label).toBe(
      'Connection configured · Mac required',
    );
  });
});
