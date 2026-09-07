import { describe, expect, it } from 'vitest';
import {
  waterfallColumnIdentity,
  chooseWaterfallPreset,
  chooseWaterfallVerifier,
} from './provider-waterfall-draft';
import { createProviderWaterfall } from './provider-waterfall';
import {
  contactPreset,
  type ContactBindings,
} from './contact-provider-presets';
import { createSampleWorkspace } from './sample-workspace';
const bindings: ContactBindings = {
  person: 'person',
  domain: 'domain',
  email: 'email',
  profile: 'profile',
  phone: 'phone',
  first_name: 'first_name',
  last_name: 'last_name',
};
describe('provider setup drafts', () => {
  it('adds repeated lookups with unique bounded names and output IDs', () => {
    const w = createSampleWorkspace(),
      preset = contactPreset('apollo')!;
    expect(preset).toBeDefined();
    const first = waterfallColumnIdentity(w, preset.label);
    const added = createProviderWaterfall(w, {
      ...first,
      steps: [preset.step(bindings)],
      accept: preset.accept,
      continueOnError: false,
    });
    const next = { ...w, columns: [...w.columns, ...added] };
    const second = waterfallColumnIdentity(next, preset.label);
    expect(second.title).toBe(first.title + ' (2)');
    expect(second.id).not.toBe(first.id);
    expect(
      createProviderWaterfall(next, {
        ...second,
        steps: [preset.step(bindings)],
        accept: preset.accept,
        continueOnError: false,
      }),
    ).toHaveLength(3);
    const long = waterfallColumnIdentity(w, 'A'.repeat(80));
    expect(long.id.length).toBeLessThanOrEqual(60);
    expect(() => waterfallColumnIdentity(w, 'A'.repeat(81))).toThrow(
      '1 and 80',
    );
  });
  it('removes incompatible hidden email verification when switching to phone', () => {
    const email = contactPreset('enrow-email')!,
      phone = contactPreset('apollo-mobile')!;
    const steps = [
      {
        ...email.step(bindings),
        quickSetup: email.id,
        verifier: { presetId: 'hunter-verify' },
      },
    ];
    const next = chooseWaterfallPreset(
      steps,
      0,
      phone,
      bindings,
      'verified-email',
    );
    expect(next.steps[0].verifier).toBeUndefined();
    expect(next.accept).toBe('phone');
  });
  it('restores the sole finder rule when a verifier is removed but preserves strict fallback rules', () => {
    const preset = contactPreset('dropcontact-email')!;
    const step = {
      ...preset.step(bindings),
      quickSetup: preset.id,
      verifier: { presetId: 'hunter-verify' },
    };
    expect(
      chooseWaterfallVerifier([step], 0, '', 'verified-email').accept,
    ).toBe('email');
    expect(
      chooseWaterfallPreset(
        [
          step,
          {
            connectionId: '',
            method: 'GET',
            pathTemplate: '/',
            responsePath: 'email',
          },
        ],
        1,
        preset,
        bindings,
        'verified-email',
      ).accept,
    ).toBe('verified-email');
  });
});
