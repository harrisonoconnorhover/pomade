import { describe, expect, it } from 'vitest';
import Papa from 'papaparse';
import {
  parseCsvImport,
  createCsvWorkspace,
  appendCsvRows,
  suggestCsvMapping,
  planCsvAppend,
  workspaceCsv,
  CSV_NEW_COLUMN,
  CSV_SKIP_COLUMN,
} from './csv-import';
import { createSampleWorkspace } from './sample-workspace';
import { createRecipeSchedule } from './recipe-schedule';
describe('previewed CSV imports', () => {
  it('reads quoted values, multiline text and single-column files', () => {
    const csv = parseCsvImport(
      'Company,Notes\n"Acme, Inc.","Line one\nLine two"',
    );
    expect(csv.rows).toEqual([['Acme, Inc.', 'Line one\nLine two']]);
    expect(parseCsvImport('Company\nAcme\nBeta').rows).toHaveLength(2);
    expect(
      parseCsvImport('Company,Website\nAcme,acme.test\n\n').rows,
    ).toHaveLength(1);
  });
  it('preserves CRM status, duplicate headers and blanks under distinct names', () => {
    const w = createCsvWorkspace(
      'Company,Status,Status,,Run status\nAcme,Customer,Active,x,Sales qualified',
      'Imported',
      'csv-test',
      'input.csv',
      1,
    );
    expect(w.columns.map((c) => c.title)).toEqual([
      'Company',
      'Status',
      'Status (2)',
      'Column 4',
      'Run status (2)',
      'Run status',
    ]);
    expect(w.rows[0].values).toMatchObject({
      csv_status: 'Customer',
      csv_status_2: 'Active',
      run_status: 'Sales qualified',
      status: 'Imported',
    });
    expect(new Set(w.columns.map((c) => c.id)).size).toBe(w.columns.length);
    expect(w.workbookPlan).toBeUndefined();
  });
  it('rejects malformed and oversized files before producing an import', () => {
    expect(() => parseCsvImport('Company,Email\nAcme,a@test,extra')).toThrow(
      'Row 2',
    );
    expect(() => parseCsvImport('Company,Email\nAcme')).toThrow('Row 2');
    expect(() => parseCsvImport('Company\n"unfinished')).toThrow('quotes');
    expect(() => parseCsvImport('')).toThrow('empty');
    expect(() =>
      parseCsvImport('Company\n' + Array(5001).fill('Acme').join('\n')),
    ).toThrow('5,000');
    expect(() => parseCsvImport(Array(100).fill('Field').join(','))).toThrow(
      '99 CSV columns',
    );
    expect(() => parseCsvImport('A'.repeat(2_000_001))).toThrow('2 MB');
  });
  it('appends mapped rows without replacing existing records, recipes, CRM sources or views', () => {
    const w = createSampleWorkspace();
    w.source = {
      provider: 'hubspot',
      label: 'Saved CRM source',
      objectType: 'company',
      importedAt: 1,
    };
    w.schedule = createRecipeSchedule({
      id: 'schedule',
      cadence: 'every_day',
      nextRunAt: 1000,
      now: 1,
    });
    const csv = parseCsvImport(
      'Company name,Website,Target tier\nExample,example.test,High',
    );
    const mapping = suggestCsvMapping(w, csv);
    expect(mapping).toMatchObject({
      company: 'company',
      domain: 'domain',
      target_tier: CSV_NEW_COLUMN,
    });
    const added = appendCsvRows(w, csv, mapping, 'example.csv', 42);
    expect(added.rows.slice(0, w.rows.length)).toEqual(w.rows);
    expect(added.columns.filter((c) => c.recipe)).toEqual(
      w.columns.filter((c) => c.recipe),
    );
    expect(added.source).toEqual(w.source);
    expect(added.schedule?.enabled).toBe(false);
    expect(added.rows.at(-1)?.values).toMatchObject({
      company: 'Example',
      domain: 'example.test',
      target_tier: 'High',
    });
    expect(w.rows).toHaveLength(createSampleWorkspace().rows.length);
  });
  it('blocks overwriting recipes and ambiguous destinations, supports skip, and checks combined capacity', () => {
    const w = createSampleWorkspace(),
      csv = parseCsvImport('Company,Email\nAcme,acme@test');
    expect(() =>
      planCsvAppend(w, csv, { company: 'fit', email: CSV_SKIP_COLUMN }),
    ).toThrow('recipe');
    expect(() =>
      planCsvAppend(w, csv, { company: 'company', email: 'company' }),
    ).toThrow('own destination');
    expect(
      planCsvAppend(w, csv, { company: 'company', email: CSV_SKIP_COLUMN })
        .destinations,
    ).toEqual(['company', '']);
    expect(() =>
      planCsvAppend(
        { ...w, rows: Array(5000).fill(w.rows[0]) },
        csv,
        suggestCsvMapping(w, csv),
      ),
    ).toThrow('5,000');
    const full = {
      ...w,
      columns: Array.from({ length: 100 }, (_, i) => ({
        id: 'c' + i,
        title: 'C' + i,
        kind: 'text' as const,
        width: 160,
      })),
    };
    expect(() =>
      planCsvAppend(full, csv, {
        company: CSV_NEW_COLUMN,
        email: CSV_SKIP_COLUMN,
      }),
    ).toThrow('100-column');
  });
  it('exports every requested cell even when display titles repeat or columns are hidden', () => {
    const w = createSampleWorkspace();
    w.columns[0].title = 'Same';
    w.columns[1].title = 'Same';
    w.columns[0].hidden = true;
    const parsed = Papa.parse<string[]>(workspaceCsv(w));
    expect(parsed.data[0].slice(0, 2)).toEqual(['Same', 'Same']);
    expect(parsed.data[1].slice(0, 2)).toEqual([
      w.rows[0].values.company,
      w.rows[0].values.person,
    ]);
    expect(
      Papa.parse<string[]>(workspaceCsv({ ...w, rows: [] })).data[0],
    ).toHaveLength(w.columns.length);
  });
});
