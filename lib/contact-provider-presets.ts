import {
  emailProviderStep,
  emailVerificationStep,
  ZEROBOUNCE_CONNECTION,
  TRESTLE_CONNECTION,
  CONTACTOUT_CONNECTION,
  contactOutStep,
  trestlePhoneStep,
  pdlPersonStep,
  PDL_PEOPLE_CONNECTION,
  prospeoMobileStep,
  leadMagicMobileStep,
  findymailEmailStep,
  findymailPhoneStep,
  findymailVerifyStep,
  APOLLO_PEOPLE_CONNECTION,
  HUNTER_CONNECTION,
  PROSPEO_CONNECTION,
  LEADMAGIC_CONNECTION,
  FINDYMAIL_CONNECTION,
} from './provider-presets';
import type { HttpProviderStep, ProviderWaterfall } from './pomade-types';

export const CONTACT_INPUTS = {
  person: 'Person’s full name',
  domain: 'Company domain (example.com)',
  email: 'Email address',
  profile: 'Professional profile URL',
  phone: 'Phone number with country code',
} as const;
export type ContactInput = keyof typeof CONTACT_INPUTS;
export type ContactBindings = Record<ContactInput, string>;
export type ContactProviderPreset = {
  id: string;
  label: string;
  provider: string;
  connectionId: string;
  inputs: ContactInput[];
  accept: ProviderWaterfall['accept'];
  note?: string;
  step: (bindings: ContactBindings) => HttpProviderStep;
};
export const CONTACT_PROVIDER_PRESETS: ContactProviderPreset[] = [
  {
    id: 'hunter',
    label: 'Hunter · find verified email',
    provider: 'Hunter',
    connectionId: HUNTER_CONNECTION,
    inputs: ['person', 'domain'],
    accept: 'verified-email',
    step: ({ person, domain }) => emailProviderStep('hunter', person, domain),
  },
  {
    id: 'apollo',
    label: 'Apollo · find verified email',
    provider: 'Apollo',
    connectionId: APOLLO_PEOPLE_CONNECTION,
    inputs: ['person', 'domain'],
    accept: 'verified-email',
    step: ({ person, domain }) => emailProviderStep('apollo', person, domain),
  },
  {
    id: 'prospeo',
    label: 'Prospeo · find verified email',
    provider: 'Prospeo',
    connectionId: PROSPEO_CONNECTION,
    inputs: ['person', 'domain'],
    accept: 'verified-email',
    step: ({ person, domain }) => emailProviderStep('prospeo', person, domain),
  },
  {
    id: 'prospeo-mobile',
    label: 'Prospeo · find verified mobile',
    provider: 'Prospeo',
    connectionId: PROSPEO_CONNECTION,
    inputs: ['person', 'domain'],
    accept: 'verified-phone',
    step: ({ person, domain }) => prospeoMobileStep(person, domain),
  },
  {
    id: 'leadmagic',
    label: 'LeadMagic · find verified email',
    provider: 'LeadMagic',
    connectionId: LEADMAGIC_CONNECTION,
    inputs: ['person', 'domain'],
    accept: 'verified-email',
    step: ({ person, domain }) =>
      emailProviderStep('leadmagic', person, domain),
  },
  {
    id: 'leadmagic-mobile',
    label: 'LeadMagic · find mobile (format only)',
    provider: 'LeadMagic',
    connectionId: LEADMAGIC_CONNECTION,
    inputs: ['email'],
    accept: 'phone',
    note: 'Uses a work email. The response has no independent phone verification status.',
    step: ({ email }) => leadMagicMobileStep(email),
  },
  {
    id: 'findymail',
    label: 'Findymail · find email (format only)',
    provider: 'Findymail',
    connectionId: FINDYMAIL_CONNECTION,
    inputs: ['person', 'domain'],
    accept: 'email',
    note: 'Findymail describes its finder emails as verified, but this response has no verification status. Add a separate verification column for an explicit check.',
    step: ({ person, domain }) => findymailEmailStep(person, domain),
  },
  {
    id: 'findymail-phone',
    label: 'Findymail · find US phone (format only)',
    provider: 'Findymail',
    connectionId: FINDYMAIL_CONNECTION,
    inputs: ['profile'],
    accept: 'phone',
    note: 'The documented API supports US numbers and may return mobile or landline. Number format does not establish ownership or reachability.',
    step: ({ profile }) => findymailPhoneStep(profile),
  },
  {
    id: 'findymail-verify',
    label: 'Findymail · verify existing email',
    provider: 'Findymail',
    connectionId: FINDYMAIL_CONNECTION,
    inputs: ['email'],
    accept: 'verified-email',
    note: 'Checks an existing email and accepts only verified=true. Each attempt may use verifier credits.',
    step: ({ email }) => findymailVerifyStep(email),
  },
  {
    id: 'hunter-verify',
    label: 'Hunter · verify existing email',
    provider: 'Hunter',
    connectionId: HUNTER_CONNECTION,
    inputs: ['email'],
    accept: 'verified-email',
    note: 'Accepts valid only. Pending verifications stop for a later retry; they do not silently become misses.',
    step: ({ email }) => emailVerificationStep('hunter', email),
  },
  {
    id: 'leadmagic-verify',
    label: 'LeadMagic · verify existing email',
    provider: 'LeadMagic',
    connectionId: LEADMAGIC_CONNECTION,
    inputs: ['email'],
    accept: 'verified-email',
    step: ({ email }) => emailVerificationStep('leadmagic', email),
  },
  {
    id: 'zerobounce-verify',
    label: 'ZeroBounce · verify existing email',
    provider: 'ZeroBounce',
    connectionId: ZEROBOUNCE_CONNECTION,
    inputs: ['email'],
    accept: 'verified-email',
    note: 'Accepts valid only. Unknown, catch-all, abuse, spamtrap and do-not-mail results are rejected. Optional paid data add-ons are off.',
    step: ({ email }) => emailVerificationStep('zerobounce', email),
  },
  {
    id: 'trestle-verify',
    label: 'Trestle · validate existing phone',
    provider: 'Trestle',
    connectionId: TRESTLE_CONNECTION,
    inputs: ['phone'],
    accept: 'verified-phone',
    note: 'Requires an international number and is_valid=true for that same number. This does not confirm ownership, mobile line type, or recent activity. No paid add-ons are requested.',
    step: ({ phone }) => trestlePhoneStep(phone),
  },
  {
    id: 'pdl-email',
    label: 'People Data Labs · find work email (format only)',
    provider: 'People Data Labs',
    connectionId: PDL_PEOPLE_CONNECTION,
    inputs: ['profile'],
    accept: 'email',
    note: 'Requires the work-email field and a match likelihood of at least 6/10. Person matching is not email verification.',
    step: ({ profile }) => pdlPersonStep('work_email', profile),
  },
  {
    id: 'pdl-mobile',
    label: 'People Data Labs · find mobile (format only)',
    provider: 'People Data Labs',
    connectionId: PDL_PEOPLE_CONNECTION,
    inputs: ['profile'],
    accept: 'phone',
    note: 'Requests the mobile-phone field only, with a match likelihood of at least 6/10. Phone reachability is not verified.',
    step: ({ profile }) => pdlPersonStep('mobile_phone', profile),
  },
  {
    id: 'pdl-personal-email',
    label: 'People Data Labs · find personal email (format only)',
    provider: 'People Data Labs',
    connectionId: PDL_PEOPLE_CONNECTION,
    inputs: ['profile'],
    accept: 'email',
    note: 'Requests the recommended personal email, with match likelihood of at least 6/10. This is separate from work email and not a verification result.',
    step: ({ profile }) => pdlPersonStep('recommended_personal_email', profile),
  },
  {
    id: 'contactout-email',
    label: 'ContactOut · find verified work email',
    provider: 'ContactOut',
    connectionId: CONTACTOUT_CONNECTION,
    inputs: ['profile'],
    accept: 'verified-email',
    note: 'Requests work email only; phone and personal-email reveals are off. Accepts the verification status attached to that exact email.',
    step: ({ profile }) => contactOutStep('work', profile),
  },
  {
    id: 'contactout-personal',
    label: 'ContactOut · find personal email (format only)',
    provider: 'ContactOut',
    connectionId: CONTACTOUT_CONNECTION,
    inputs: ['profile'],
    accept: 'email',
    note: 'Requests personal email only. No work-email or phone reveal is requested.',
    step: ({ profile }) => contactOutStep('personal', profile),
  },
  {
    id: 'contactout-phone',
    label: 'ContactOut · find phone (format only)',
    provider: 'ContactOut',
    connectionId: CONTACTOUT_CONNECTION,
    inputs: ['profile'],
    accept: 'phone',
    note: 'Requests phone only, with email_type=none. The first international-format phone is selected; mobile line type and ownership are not verified.',
    step: ({ profile }) => contactOutStep('phone', profile),
  },
];
export function contactPreset(id?: string) {
  return CONTACT_PROVIDER_PRESETS.find((preset) => preset.id === id);
}
export function missingContactInputs(
  preset: ContactProviderPreset,
  bindings: ContactBindings,
  columns: { id: string }[],
) {
  return preset.inputs.filter(
    (input) => !columns.some((column) => column.id === bindings[input]),
  );
}
