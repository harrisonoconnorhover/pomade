import type { CrmProvider } from './pomade-types';
export type CrmField = {
  name: string;
  label: string;
  type:
    | 'text'
    | 'number'
    | 'boolean'
    | 'date'
    | 'datetime'
    | 'select'
    | 'multiselect'
    | 'reference';
  createable: boolean;
  updateable: boolean;
  options?: { value: string; label: string }[];
  maxLength?: number;
  integer?: boolean;
};
type NativeField = {
  name: string;
  label?: string;
  type: string;
  fieldType?: string;
  archived?: boolean;
  calculated?: boolean;
  createable?: boolean;
  updateable?: boolean;
  modificationMetadata?: { readOnlyValue?: boolean };
  externalOptions?: boolean;
  restrictedPicklist?: boolean;
  length?: number;
  options?: {
    value: string;
    label: string;
    hidden?: boolean;
    active?: boolean;
  }[];
  picklistValues?: {
    value: string;
    label: string;
    hidden?: boolean;
    active?: boolean;
  }[];
};
const validName = (name: unknown): name is string =>
  typeof name === 'string' && /^[A-Za-z][A-Za-z0-9_]{0,199}$/.test(name);
export function parseCrmFields(
  provider: CrmProvider,
  payload: unknown,
): CrmField[] {
  const data = payload as {
    results?: NativeField[];
    fields?: NativeField[];
  };
  return (
    provider === 'hubspot' ? (data.results ?? []) : (data.fields ?? [])
  ).flatMap((raw) => {
    if (
      !validName(raw.name) ||
      raw.archived ||
      raw.calculated ||
      raw.modificationMetadata?.readOnlyValue
    )
      return [];
    const createable = provider === 'hubspot' ? true : raw.createable === true;
    const updateable = provider === 'hubspot' ? true : raw.updateable === true;
    if (!createable && !updateable) return [];
    const types: Record<string, CrmField['type']> = {
      string: 'text',
      textarea: 'text',
      url: 'text',
      email: 'text',
      phone: 'text',
      encryptedstring: 'text',
      number: 'number',
      double: 'number',
      int: 'number',
      currency: 'number',
      percent: 'number',
      bool: 'boolean',
      boolean: 'boolean',
      date: 'date',
      datetime: 'datetime',
      enumeration: raw.fieldType === 'checkbox' ? 'multiselect' : 'select',
      picklist: 'select',
      multipicklist: 'multiselect',
      reference: 'reference',
    };
    const type = types[raw.type];
    if (!type) return [];
    const values = provider === 'hubspot' ? raw.options : raw.picklistValues;
    const restricted =
      provider === 'hubspot' ? !raw.externalOptions : raw.restrictedPicklist;
    return [
      {
        name: raw.name,
        label: raw.label || raw.name,
        type,
        createable,
        updateable,
        ...(restricted && Array.isArray(values) && values.length
          ? {
              options: values
                .filter((v) => !v.hidden && v.active !== false)
                .map((v) => ({
                  value: String(v.value),
                  label: String(v.label || v.value),
                })),
            }
          : {}),
        ...(raw.length && raw.length > 0 ? { maxLength: raw.length } : {}),
        ...(raw.type === 'int' ? { integer: true } : {}),
      },
    ];
  });
}
export function normalizeCrmValue(value: string, field?: CrmField): string {
  const text = value.trim();
  if (!text || !field) return text;
  const invalid = (reason: string): never => {
    throw new Error(`${field.label}: ${reason}`);
  };
  if (field.maxLength && text.length > field.maxLength)
    invalid(`maximum ${field.maxLength} characters`);
  if (field.type === 'number') {
    if (
      !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(text) ||
      !Number.isFinite(Number(text))
    )
      invalid('use a plain number');
    const n = Number(text);
    if (field.integer && !Number.isSafeInteger(n))
      invalid('use a whole number');
    return String(n);
  }
  if (field.type === 'boolean') {
    const normalized = text.toLowerCase();
    if (['true', 'yes', '1'].includes(normalized)) return 'true';
    if (['false', 'no', '0'].includes(normalized)) return 'false';
    return invalid('use true/false or yes/no');
  }
  if (field.type === 'reference' && !/^[A-Za-z0-9]{15,18}$/.test(text))
    invalid('use a Salesforce record ID');
  if (field.type === 'date' || field.type === 'datetime') {
    // HubSpot reads may return epoch milliseconds; table inputs can use ISO dates.
    const date = /^\d{11,14}$/.test(text)
      ? new Date(Number(text))
      : new Date(text);
    if (Number.isNaN(date.valueOf())) invalid('use an ISO date');
    if (field.type === 'date') {
      const iso = date.toISOString().slice(0, 10);
      if (
        !/^\d{11,14}$/.test(text) &&
        (!/^\d{4}-\d{2}-\d{2}$/.test(text) || text !== iso)
      )
        invalid('use YYYY-MM-DD');
      return iso;
    }
    if (
      !/^\d{11,14}$/.test(text) &&
      !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:?\d{2})$/.test(text)
    )
      invalid('include a timezone in the ISO timestamp');
    return date.toISOString();
  }
  if (field.type === 'select' || field.type === 'multiselect') {
    const values =
      field.type === 'multiselect'
        ? text
            .split(';')
            .map((v) => v.trim())
            .filter(Boolean)
        : [text];
    if (
      field.options &&
      values.some((v) => !field.options!.some((o) => o.value === v))
    )
      invalid('choose a valid internal option value');
    return [...new Set(values)].sort().join(';');
  }
  return text;
}
export function crmWireValue(
  value: string,
  field: CrmField | undefined,
  provider: CrmProvider,
): string | number | boolean {
  if (provider === 'salesforce' && field?.type === 'number')
    return Number(value);
  if (provider === 'salesforce' && field?.type === 'boolean')
    return value === 'true';
  return value;
}
