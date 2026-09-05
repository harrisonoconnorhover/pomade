'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import type { WorkbookTemplate } from '@/lib/workbook-template';
import type { TableSummary } from '@/lib/workbook';
export default function WorkbookTemplateBuilder({
  tables,
  disabled,
  onBusy,
  onCreated,
}: {
  tables: TableSummary[];
  disabled: boolean;
  onBusy: (busy: boolean) => void;
  onCreated: (tables: TableSummary[]) => void;
}) {
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [templates, setTemplates] = useState<WorkbookTemplate[]>([]),
    [selected, setSelected] = useState<string[]>([]);
  const [name, setName] = useState('New workflow'),
    [templateId, setTemplateId] = useState(''),
    [bindings, setBindings] = useState<Record<string, string>>({});
  const template = templates.find((t) => t.id === templateId);
  async function load() {
    setOpen(true);
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/api/workbook-templates');
      const d = (await r.json()) as {
        templates: WorkbookTemplate[];
        error?: string;
      };
      if (!r.ok) throw new Error(d.error ?? 'Templates could not be loaded.');
      setTemplates(d.templates);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Load failed.');
    } finally {
      setBusy(false);
    }
  }
  async function submit(action: 'capture' | 'create') {
    setBusy(true);
    onBusy(true);
    setError('');
    try {
      const r = await fetch('/api/workbook-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          name,
          tableIds: selected,
          templateId,
          bindings,
        }),
      });
      const d = (await r.json()) as {
        template?: WorkbookTemplate;
        tables?: TableSummary[];
        error?: string;
      };
      if (!r.ok) throw new Error(d.error ?? 'Template action failed.');
      if (d.template) {
        setTemplates((current) => [d.template!, ...current]);
        setTemplateId(d.template.id);
        setBindings({});
        setError('Template saved. Original tables are unchanged.');
      }
      if (d.tables) {
        onCreated(d.tables);
        setOpen(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Template action failed.');
    } finally {
      setBusy(false);
      onBusy(false);
    }
  }
  return (
    <>
      <Button variant="outline" disabled={disabled} onClick={() => void load()}>
        Workbook templates
      </Button>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!busy) setOpen(value);
        }}
      >
        <DialogContent className="template-dialog">
          <DialogHeader>
            <DialogTitle>Reusable workbooks</DialogTitle>
            <DialogDescription>
              Save connected table structures, then create a new set of empty
              tables. Recipes, views and local connection references are
              preserved. Schedules start paused; webhook ingestion is
              disconnected.
            </DialogDescription>
          </DialogHeader>
          <label>
            Name
            <input
              maxLength={60}
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={busy}
            />
          </label>
          <details>
            <summary>Save current tables as a template</summary>
            {tables.map((t) => (
              <label key={t.id}>
                <input
                  type="checkbox"
                  checked={selected.includes(t.id)}
                  disabled={busy}
                  onChange={(e) =>
                    setSelected((ids) =>
                      e.target.checked
                        ? [...ids, t.id]
                        : ids.filter((id) => id !== t.id),
                    )
                  }
                />
                {t.name}
              </label>
            ))}
            <Button
              disabled={
                disabled ||
                busy ||
                !name.trim() ||
                selected.length < 1 ||
                selected.length > 10
              }
              onClick={() => void submit('capture')}
            >
              Save selected tables
            </Button>
            <p>
              Select one to ten tables. Rows, run history and imported-data
              provenance are excluded.
            </p>
          </details>
          <label>
            Saved template
            <select
              value={templateId}
              disabled={busy}
              onChange={(e) => {
                setTemplateId(e.target.value);
                setBindings({});
              }}
            >
              <option value="">Choose a template</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} · {t.tables.length} tables
                </option>
              ))}
            </select>
          </label>
          {template ? (
            <>
              <ul>
                {template.tables.map((t) => (
                  <li key={t.id}>
                    {name} — {t.name}: {t.columns.length} columns,{' '}
                    {t.columns.filter((c) => c.recipe).length} recipes
                    {t.schedule ? ', paused schedule' : ''}
                  </li>
                ))}
              </ul>
              {template.externalTableIds.map((id) => (
                <label key={id}>
                  Map outside reference:{' '}
                  {tables.find((t) => t.id === id)?.name ?? id}
                  <select
                    value={bindings[id] ?? ''}
                    disabled={busy}
                    onChange={(e) =>
                      setBindings((b) => ({ ...b, [id]: e.target.value }))
                    }
                  >
                    <option value="">Choose existing table</option>
                    {tables.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
              <p>
                References inside this template point to the new tables. Outside
                references use your mappings and must have the required column
                IDs. Review paused schedules, row scope and connections before
                running.
              </p>
              <Button
                disabled={
                  disabled ||
                  busy ||
                  !name.trim() ||
                  template.externalTableIds.some((id) => !bindings[id])
                }
                onClick={() => void submit('create')}
              >
                Create {template.tables.length} empty tables
              </Button>
            </>
          ) : null}
          {error ? <output>{error}</output> : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
