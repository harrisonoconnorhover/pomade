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
import {
  planRecipeFunctionUpdate,
  reviseRecipeFunction,
  createRecipeFunction,
  instantiateRecipeFunction,
  functionStepIds,
} from '@/lib/recipe-functions';
import type {
  WorkspaceSnapshot,
  RecipeFunction,
  PomadeColumn,
} from '@/lib/pomade-types';
import type { TableSummary } from '@/lib/workbook';
export default function RecipeFunctionBuilder({
  workspace,
  ready,
  onSave,
  onAdd,
  onRun,
}: {
  workspace: WorkspaceSnapshot;
  ready: boolean;
  onSave: (w: WorkspaceSnapshot) => void;
  onAdd: (columns: PomadeColumn[]) => void;
  onRun: (ids: string[], background: boolean) => void;
}) {
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [name, setName] = useState('Reusable workflow');
  const [selected, setSelected] = useState<string[]>([]);
  const [tables, setTables] = useState<TableSummary[]>([]);
  const [libraryId, setLibraryId] = useState(workspace.id);
  const [library, setLibrary] = useState<RecipeFunction[]>([]);
  const [active, setActive] = useState<RecipeFunction>();
  const [updateInstanceId, setUpdateInstanceId] = useState('');
  const [bindings, setBindings] = useState<Record<string, string>>({});
  const definitions =
    libraryId === workspace.id ? (workspace.recipeFunctions ?? []) : library;
  const instances = [
    ...new Map(
      workspace.columns
        .filter((c) => c.functionInstance)
        .map((c) => [c.functionInstance!.id, c.functionInstance!]),
    ).values(),
  ];
  async function load() {
    setOpen(true);
    setBusy(true);
    try {
      const response = await fetch('/api/tables');
      if (!response.ok) throw new Error('Tables could not be loaded.');
      const data = (await response.json()) as { tables: TableSummary[] };
      setTables(data.tables);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Load failed.');
    } finally {
      setBusy(false);
    }
  }
  async function chooseLibrary(id: string) {
    setLibraryId(id);
    setActive(undefined);
    setUpdateInstanceId('');
    setBusy(true);
    setError('');
    try {
      if (id === workspace.id) return;
      const response = await fetch(
        `/api/workspace?workspaceId=${encodeURIComponent(id)}`,
      );
      if (!response.ok) throw new Error('Library table could not be loaded.');
      const data = (await response.json()) as { workspace: WorkspaceSnapshot };
      setLibrary(data.workspace.recipeFunctions ?? []);
    } catch (e) {
      setLibrary([]);
      setError(e instanceof Error ? e.message : 'Library failed.');
    } finally {
      setBusy(false);
    }
  }
  let added: PomadeColumn[] | undefined;
  let previewError = '';
  if (active)
    try {
      added = instantiateRecipeFunction(active, workspace, bindings);
    } catch (e) {
      previewError = e instanceof Error ? e.message : 'Map required inputs.';
    }
  let update: ReturnType<typeof planRecipeFunctionUpdate> | undefined;
  let updateError = '';
  if (active && updateInstanceId)
    try {
      update = planRecipeFunctionUpdate(
        workspace,
        active,
        updateInstanceId,
        bindings,
      );
    } catch (e) {
      updateError =
        e instanceof Error ? e.message : 'Update cannot be applied.';
    }
  const latestDefinition = definitions.find((d) => d.id === active?.id);
  return (
    <>
      <Button variant="outline" disabled={!ready} onClick={() => void load()}>
        Recipe functions
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="template-dialog">
          <DialogHeader>
            <DialogTitle>Reusable recipe functions</DialogTitle>
            <DialogDescription>
              Capture two to ten same-row recipe steps in their table order. Map
              external inputs when adding the function to a table; internal
              outputs stay connected automatically. No provider requests occur
              while saving or adding.
            </DialogDescription>
          </DialogHeader>
          <details>
            <summary>Save steps from this table</summary>
            <label>
              Function name
              <input value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <div className="webhook-events">
              {workspace.columns
                .filter((c) => c.recipe)
                .map((c) => (
                  <label key={c.id}>
                    <input
                      type="checkbox"
                      checked={selected.includes(c.id)}
                      onChange={(e) =>
                        setSelected((current) =>
                          e.target.checked
                            ? [...current, c.id]
                            : current.filter((id) => id !== c.id),
                        )
                      }
                    />
                    {c.title}
                  </label>
                ))}
            </div>
            <Button
              disabled={!ready || busy}
              onClick={() => {
                try {
                  const definition = createRecipeFunction(workspace, selected, {
                    id: crypto.randomUUID(),
                    name,
                  });
                  onSave({
                    ...workspace,
                    recipeFunctions: [
                      ...(workspace.recipeFunctions ?? []),
                      definition,
                    ],
                    updatedAt: Date.now(),
                  });
                  setError('Function saved to this table library.');
                } catch (e) {
                  setError(
                    e instanceof Error
                      ? e.message
                      : 'Function could not be saved.',
                  );
                }
              }}
            >
              Save selected steps as a new function
            </Button>
            {active && libraryId === workspace.id ? (
              <Button
                variant="outline"
                disabled={!ready || busy}
                onClick={() => {
                  try {
                    const previous = workspace.recipeFunctions?.find(
                      (f) => f.id === active.id,
                    );
                    if (!previous)
                      throw new Error('Saved function is unavailable.');
                    const next = reviseRecipeFunction(
                      previous,
                      workspace,
                      selected,
                    );
                    onSave({
                      ...workspace,
                      recipeFunctions: workspace.recipeFunctions!.map((f) =>
                        f.id === next.id ? next : f,
                      ),
                      updatedAt: Date.now(),
                    });
                    setActive(next);
                    setUpdateInstanceId('');
                    setError(
                      `Version ${next.version} saved. Existing copies are unchanged until you apply it.`,
                    );
                  } catch (e) {
                    setError(
                      e instanceof Error
                        ? e.message
                        : 'Version could not be saved.',
                    );
                  }
                }}
              >
                Save selected steps as next version of {active.name}
              </Button>
            ) : null}
          </details>
          <label>
            Library table
            <select
              value={libraryId}
              disabled={busy}
              onChange={(e) => void chooseLibrary(e.target.value)}
            >
              {tables.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Saved function
            <select
              value={active?.id ?? ''}
              disabled={busy}
              onChange={(e) => {
                const definition = definitions.find(
                  (d) => d.id === e.target.value,
                );
                setActive(definition);
                setUpdateInstanceId('');
                setBindings(
                  Object.fromEntries(
                    (definition?.inputs ?? []).map((input) => [
                      input.sourceColumnId,
                      workspace.columns.find(
                        (c) => c.id === input.sourceColumnId,
                      )?.id ??
                        workspace.columns.find((c) => c.title === input.title)
                          ?.id ??
                        '',
                    ]),
                  ),
                );
              }}
            >
              <option value="">Choose a function</option>
              {definitions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} · {d.steps.length} steps
                </option>
              ))}
            </select>
          </label>
          {active ? (
            <>
              <label>
                Version to use
                <select
                  value={active.version ?? 1}
                  onChange={(e) => {
                    if (!latestDefinition) return;
                    const version = Number(e.target.value);
                    const old = latestDefinition.history?.find(
                      (v) => v.version === version,
                    );
                    setActive(
                      old ? { ...latestDefinition, ...old } : latestDefinition,
                    );
                  }}
                >
                  <option value={latestDefinition?.version ?? 1}>
                    Version {latestDefinition?.version ?? 1} (latest)
                  </option>
                  {latestDefinition?.history?.map((v) => (
                    <option key={v.version} value={v.version}>
                      Version {v.version}
                    </option>
                  ))}
                </select>
              </label>
              <ol>
                {active.steps.map((step) => (
                  <li key={step.id}>{step.name}</li>
                ))}
              </ol>
              <div className="http-output-grid">
                {active.inputs.map((input) => (
                  <label key={input.sourceColumnId}>
                    {input.title}
                    {input.required ? ' *' : ' (optional)'}
                    <select
                      value={bindings[input.sourceColumnId] ?? ''}
                      onChange={(e) =>
                        setBindings((b) => ({
                          ...b,
                          [input.sourceColumnId]: e.target.value,
                        }))
                      }
                    >
                      <option value="">Choose input</option>
                      {workspace.columns
                        .filter((c) => c.kind !== 'status')
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.title}
                          </option>
                        ))}
                    </select>
                  </label>
                ))}
              </div>
              {previewError ? (
                <p role="alert">{previewError}</p>
              ) : (
                <p>
                  Adds {added?.length} columns:{' '}
                  {added?.map((c) => c.title).join(', ')}
                </p>
              )}
              <Button
                disabled={!ready || busy || !added}
                onClick={() => {
                  if (added) {
                    onAdd(added);
                    setOpen(false);
                  }
                }}
              >
                Add function columns
              </Button>
              <label>
                Update an existing copy
                <select
                  value={updateInstanceId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setUpdateInstanceId(id);
                    const existing = instances.find((i) => i.id === id);
                    if (existing?.bindings)
                      setBindings({ ...existing.bindings });
                  }}
                >
                  <option value="">Choose a copy to preview</option>
                  {instances
                    .filter((i) => i.definitionId === active.id)
                    .map((i, index) => (
                      <option key={i.id} value={i.id}>
                        {i.name} · copy {index + 1} · v{i.version ?? 1}
                      </option>
                    ))}
                </select>
              </label>
              {updateError ? <p role="alert">{updateError}</p> : null}
              {update ? (
                <>
                  <p>
                    Applies version {active.version ?? 1} to{' '}
                    {update.changes.length} steps, replacing their local recipe
                    settings. Column names, IDs and values stay in place. Rows
                    become Review and the schedule pauses. Run afterward to
                    refresh results.
                  </p>
                  {update.changes.map((change) => (
                    <details key={change.before.id}>
                      <summary>{change.title}: before / after settings</summary>
                      <pre className="http-request-preview">
                        {JSON.stringify(
                          { before: change.before, after: change.after },
                          null,
                          2,
                        )}
                      </pre>
                    </details>
                  ))}
                  <Button
                    disabled={!ready || busy}
                    onClick={() => {
                      onSave(update.workspace);
                      setUpdateInstanceId('');
                      setError(
                        `Version ${active.version ?? 1} applied. Run the function to refresh its results.`,
                      );
                    }}
                  >
                    Apply previewed version to this copy
                  </Button>
                </>
              ) : null}
              {libraryId === workspace.id ? (
                <Button
                  variant="outline"
                  disabled={!ready || busy}
                  onClick={() => {
                    onSave({
                      ...workspace,
                      recipeFunctions: workspace.recipeFunctions?.filter(
                        (f) => f.id !== active.id,
                      ),
                      updatedAt: Date.now(),
                    });
                    setActive(undefined);
                  }}
                >
                  Remove saved definition
                </Button>
              ) : null}
            </>
          ) : null}
          {instances.length ? (
            <div>
              <h3>Run functions in this table</h3>
              <p>
                Uses the current selected or visible rows. External steps retain
                ordinary request confirmation and limits.
              </p>
              {instances.map((instance) => {
                let ids: string[] = [];
                let issue = '';
                try {
                  ids = functionStepIds(workspace.columns, instance.id);
                } catch (e) {
                  issue =
                    e instanceof Error ? e.message : 'Invalid step group.';
                }
                return (
                  <div key={instance.id}>
                    <strong>{instance.name}</strong>
                    {issue ? (
                      <p role="alert">{issue}</p>
                    ) : (
                      <>
                        <Button
                          disabled={!ready || busy}
                          onClick={() => {
                            onRun(ids, false);
                            setOpen(false);
                          }}
                        >
                          Run function
                        </Button>
                        <Button
                          variant="outline"
                          disabled={!ready || busy}
                          onClick={() => {
                            onRun(ids, true);
                            setOpen(false);
                          }}
                        >
                          Queue function
                        </Button>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          ) : null}
          <p>
            Copies update only when you preview and apply a saved version. Older
            versions remain selectable. Updating requires the same step count
            and output types; structural changes need a new copy. List-producing
            recipes need a separate table stage.
          </p>
          {error ? <p role="alert">{error}</p> : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
