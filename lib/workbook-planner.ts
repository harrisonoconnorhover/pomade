import { z } from 'zod';
import type { PomadeColumn, WorkspaceSnapshot } from './pomade-types';
import { planTableTransfer } from './table-transfer';
import { extractJsonContainer } from './web-research';

const key = z
  .string()
  .regex(/^[a-z][a-z0-9_]{0,31}$/)
  .refine(
    (s) => !['status', 'constructor', 'prototype'].includes(s),
    'Choose a different field ID.',
  );
const label = z.string().trim().min(1).max(80);
const field = z
  .object({
    id: key,
    title: label,
    valueType: z.enum(['text', 'number', 'boolean', 'date']),
  })
  .strict();
const condition = z
  .object({
    field: key,
    operator: z.enum([
      'is_not_empty',
      'is_empty',
      'equals',
      'not_equals',
      'contains',
      'greater_than_or_equal',
    ]),
    value: z.string().max(120).optional(),
  })
  .strict();
const research = z
  .object({
    kind: z.literal('research'),
    id: key,
    title: label,
    prompt: z.string().trim().min(10).max(2600),
    outputs: z.array(field).min(1).max(6),
    mode: z.enum(['record', 'list']),
    limit: z.number().int().min(1).max(25).default(1),
    when: condition.optional(),
  })
  .strict();
const score = z
  .object({
    kind: z.literal('score'),
    id: key,
    title: label,
    inputs: z
      .array(
        z
          .object({
            field: key,
            maxPoints: z.number().int().min(1).max(100),
            minimumPoints: z.number().int().min(0).max(100).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(6),
    highAt: z.number().int().min(1).max(100),
    mediumAt: z.number().int().min(0).max(99),
    when: condition.optional(),
  })
  .strict();
export const workbookPlanSchema = z
  .object({
    name: z.string().trim().min(1).max(60),
    summary: z.string().trim().min(1).max(600),
    assumptions: z.array(z.string().max(400)).max(8),
    manualTasks: z.array(z.string().max(400)).max(10),
    tables: z
      .array(
        z
          .object({
            key,
            name: label,
            purpose: z.string().min(1).max(500),
            inputs: z.array(field).max(20),
            steps: z
              .array(z.discriminatedUnion('kind', [research, score]))
              .max(8),
          })
          .strict(),
      )
      .min(1)
      .max(5),
    transfers: z
      .array(
        z
          .object({
            from: key,
            to: key,
            name: label,
            childRecipeId: key.optional(),
            sourceKey: key,
            targetKey: key,
            mapping: z.record(key, key),
            when: condition.optional(),
          })
          .strict(),
      )
      .max(6),
  })
  .strict();
export type WorkbookPlan = z.infer<typeof workbookPlanSchema>;
export type WorkbookPlanStep = {
  title: string;
  tableId: string;
  columnId?: string;
  transferId?: string;
  detail: string;
};
export type WorkbookPlanGuide = {
  id: string;
  fingerprint: string;
  request: string;
  name: string;
  summary: string;
  purpose: string;
  assumptions: string[];
  manualTasks: string[];
  steps: WorkbookPlanStep[];
  tables: { id: string; name: string }[];
};
export const DEMANDDRIVE_EXAMPLE = `Build a HeroDevs prospecting workbook for 3 ICP-fit companies. HeroDevs provides security patches and support for end-of-life open-source software such as AngularJS. Use HealthEdge (healthedge.com), Clearwater Security (clearwatersecurity.com), and Solera (solera.com) as the starting companies and verify their fit.
Include 3 custom buying signals with source evidence, why each matters, and how to verify it: use of end-of-life technology in company-owned software, security or operational risk, and an active modernization or maintenance trigger. Define a transparent 1–100 scoring rubric, combine the signal points, and assign High / Medium / Low tiers. Hold accounts with insufficient evidence for review.
For the strongest accounts, create a separate buyer committee sheet with the likely economic buyer, champion, technical evaluator, security approver, and commercial approver. Find current people where public evidence supports their role; label unnamed roles as hypotheses. Explain how to find and enrich these contacts. Keep verified facts separate from hypotheses and include source links. Prepare the tables for a walkthrough; recording and sharing the walkthrough are separate tasks.`;

export function workbookPlanningPrompt(request: string) {
  if (!request.trim() || request.length > 5000)
    throw new Error('Paste a request of 1–5,000 characters.');
  return `Design a runnable Pomade GTM workbook from the brief below. Use the supplied brief to plan the work; do not browse or complete the prospect research. Return only the complete JSON workbook plan below. Prefer 2–3 sheets; combine per-account signals and scoring in one Accounts sheet. Use short prompts with explicit criteria and all required keys.
Plan shape:
{"name":"Workbook name","summary":"What the workbook will do","assumptions":[],"manualTasks":[],"tables":[{"key":"accounts","name":"Accounts","purpose":"...","inputs":[],"steps":[]}],"transfers":[]}
Field shape: {"id":"snake_case","title":"Human label","valueType":"text|number|boolean|date"}.
Research step: {"kind":"research","id":"unique_step_id","title":"...","prompt":"Complete research instructions with {{field_id}} tokens","outputs":[FIELD],"mode":"record|list","limit":3,"when":{"field":"field_id","operator":"is_not_empty|is_empty|equals|not_equals|contains|greater_than_or_equal","value":"optional"}}.
Score step: {"kind":"score","id":"fit_score","title":"Fit score","inputs":[{"field":"signal_points","maxPoints":100,"minimumPoints":35}],"highAt":85,"mediumAt":60,"when":CONDITION}. minimumPoints is optional; it is an evidence qualification gate. Research must award integer points up to each maxPoints under an explicit rubric. All maxPoints MUST sum to 100. Score runs locally and adds id, id_tier, id_reason columns. Missing/invalid inputs or a failed minimum gate hold the score for review. Never use a random, hashed or invented score.
Transfer shape: {"from":"earlier_table_key","to":"later_table_key","name":"...","childRecipeId":"optional list step id","sourceKey":"field_id","targetKey":"input_field_id","mapping":{"destination_input_id":"source_field_id"},"when":CONDITION}. Map at least one field besides the match key; do NOT include targetKey in mapping. Transfers upsert by match key. Use domain for accounts. For people use profile URL or a researched stable company+buying-role key so different roles survive. Blank match keys cannot transfer.
Rules: 1–5 tables in execution order; every table after the first needs exactly one incoming transfer from an earlier table. First table starts with ONE request row with a built-in text field "brief"; every other table starts empty. Do not invent seed data. The first step should discover/verify the requested companies using list output and limit; include company and domain. Route discovered child rows into an Accounts sheet before per-account research. Use company, domain, person, title as canonical IDs. A later sheet's inputs must declare every incoming mapped field and its targetKey. Inputs may be empty on the first table. Do not declare brief or status yourself.
List outputs create child rows in their source table; transfer them to the next sheet with childRecipeId. Outputs can reuse input field IDs (e.g. company, domain); otherwise all field and step IDs within a table must be unique. Steps and conditions can only read inputs, brief, or earlier outputs. Each research step has 1–6 output fields; split larger requests into steps. Conditions should avoid running discovery on its own children and avoid researching empty target rows. Put scoring before any committee step gated by score. Preserve all requested signals, rubrics, evidence and deliverables. Include explicit source URL fields. Use null for unverified data and never infer private email/phone. Research prompts must state the actual criteria, not just reference the brief.
Available automatic work: public web research, list discovery, local points scoring, and table transfers. Email/mobile enrichment, CRM imports/writes, outbound sending, screen recording and sharing must be listed in manualTasks with the relevant existing Pomade flow or missing connection; do not pretend these actions are wired. Keep the plan tailored to this brief, not a fixed template. IDs use lowercase letters/numbers/underscores, start with a letter, max 32. Names max 80 characters. Research prompts max 2600 characters. Use at most 8 steps per table. The entire plan should fit in 10000 characters.
BRIEF:
${request.trim()}`;
}

export function parseWorkbookPlanAnswer(answer: string): WorkbookPlan {
  try {
    const wrapper = JSON.parse(extractJsonContainer(answer, '{'));
    return workbookPlanSchema.parse(
      typeof wrapper.plan === 'string'
        ? JSON.parse(wrapper.plan)
        : (wrapper.plan ?? wrapper),
    );
  } catch (error) {
    if (error instanceof z.ZodError)
      throw new Error(
        `The proposed workbook needs revision: ${error.issues[0]?.message}. Try a more specific brief.`,
      );
    throw new Error(
      'The planner returned an incomplete workbook. Try again with a shorter or more specific brief.',
    );
  }
}

export function compileWorkbookPlan(
  value: unknown,
  request: string,
  id: string,
  fingerprint = '',
  now = Date.now(),
) {
  const plan = workbookPlanSchema.parse(value);
  if (!/^[a-f0-9-]{36}$/.test(id))
    throw new Error('Invalid workbook creation ID.');
  const keys = plan.tables.map((t) => t.key);
  if (new Set(keys).size !== keys.length)
    throw new Error('Each planned sheet needs a unique ID.');
  const tableIds = new Map(keys.map((key) => [key, `plan_${id}_${key}`]));
  const guideSteps: WorkbookPlanStep[] = [];
  const tables = plan.tables.map<WorkspaceSnapshot>((spec, index) => {
    const columns: PomadeColumn[] = [];
    const defined = new Set<string>();
    const addField = (
      f: { id: string; title: string; valueType?: string },
      reuse = false,
    ) => {
      if (defined.has(f.id)) {
        if (reuse && columns.some((c) => c.id === f.id && c.kind === 'text'))
          return;
        throw new Error(`${spec.name}: duplicate field ${f.id}.`);
      }
      defined.add(f.id);
      columns.push({
        ...f,
        valueType: f.valueType as PomadeColumn['valueType'],
        kind: 'text',
        width: ['company', 'domain', 'person', 'title'].includes(f.id)
          ? 190
          : 280,
      });
    };
    if (index === 0)
      addField({ id: 'brief', title: 'Request', valueType: 'text' });
    for (const input of spec.inputs) addField(input);
    const validateCondition = (when: { field: string } | undefined) => {
      if (when && !defined.has(when.field))
        throw new Error(
          `${spec.name}: condition needs an earlier field (${when.field}).`,
        );
    };
    for (const step of spec.steps) {
      validateCondition(step.when);
      if (defined.has(step.id))
        throw new Error(
          `${spec.name}: a step ID overlaps another column (${step.id}).`,
        );
      if (step.kind === 'research') {
        for (const match of step.prompt.matchAll(
          /{{\s*([a-zA-Z0-9_]+)\s*}}/g,
        )) {
          if (!defined.has(match[1]))
            throw new Error(`${step.title}: unknown input ${match[1]}.`);
        }
        if (new Set(step.outputs.map((f) => f.id)).size !== step.outputs.length)
          throw new Error(`${step.title}: output IDs must be unique.`);
        defined.add(step.id);
        columns.push({
          id: step.id,
          title: step.title,
          kind: 'enrichment',
          width: 260,
          recipe: 'web-research',
          prompt: step.prompt,
          outputFields: step.outputs,
          outputCardinality: step.mode,
          listLimit: step.limit,
          runCondition: step.when,
          ...(step.mode === 'list'
            ? {
                listDestinationBindings: Object.fromEntries(
                  step.outputs.map((f) => [f.id, f.id]),
                ),
              }
            : {}),
        });
        for (const output of step.outputs) addField(output, true);
        guideSteps.push({
          tableId: tableIds.get(spec.key)!,
          columnId: step.id,
          title: step.title,
          detail:
            step.mode === 'list'
              ? `Research up to ${step.limit} results per input row.`
              : 'Research the eligible rows and fill the output columns.',
        });
      } else {
        if (
          step.inputs.reduce((sum, item) => sum + item.maxPoints, 0) !== 100 ||
          step.mediumAt >= step.highAt ||
          new Set(step.inputs.map((i) => i.field)).size !== step.inputs.length
        )
          throw new Error(
            `${step.title}: use distinct signal fields totaling 100 points and increasing tier thresholds.`,
          );
        for (const input of step.inputs) {
          if (
            !columns.some(
              (c) => c.id === input.field && c.valueType === 'number',
            ) ||
            (input.minimumPoints ?? 0) > input.maxPoints
          )
            throw new Error(
              `${step.title}: score inputs must be earlier numeric fields with valid gates.`,
            );
        }
        addField({ id: step.id, title: step.title, valueType: 'number' });
        addField({ id: `${step.id}_tier`, title: `${step.title} tier` });
        addField({ id: `${step.id}_reason`, title: `${step.title} review` });
        const column = columns.find((c) => c.id === step.id)!;
        Object.assign(column, {
          kind: 'formula',
          recipe: 'rubric-score',
          autoRun: true,
          runCondition: step.when,
          rubricScore: {
            inputs: step.inputs,
            highAt: step.highAt,
            mediumAt: step.mediumAt,
            tierColumnId: `${step.id}_tier`,
            reasonColumnId: `${step.id}_reason`,
          },
        });
        guideSteps.push({
          tableId: tableIds.get(spec.key)!,
          columnId: step.id,
          title: step.title,
          detail:
            'Add the signal points locally and assign a tier. Missing evidence stays in Review.',
        });
      }
    }
    if (!columns.length)
      throw new Error(`${spec.name}: add input fields or research steps.`);
    columns.push({
      id: 'status',
      title: 'Run status',
      kind: 'status',
      width: 140,
    });
    if (columns.length > 100)
      throw new Error('A planned sheet exceeds the 100-column limit.');
    return {
      id: tableIds.get(spec.key)!,
      name: `${plan.name} — ${spec.name}`.slice(0, 100),
      columns,
      rows:
        index === 0
          ? [
              {
                id: `brief_${id}`,
                values: { brief: request, status: 'Ready to research' },
              },
            ]
          : [],
      updatedAt: now,
    };
  });
  for (const [index, transfer] of plan.transfers.entries()) {
    const from = keys.indexOf(transfer.from),
      to = keys.indexOf(transfer.to);
    if (from < 0 || to <= from)
      throw new Error(
        'Route results only from an earlier sheet to a later sheet.',
      );
    const source = tables[from],
      target = tables[to];
    const rule = {
      id: `route_${index}`,
      name: transfer.name,
      targetTableId: target.id,
      sourceKey: transfer.sourceKey,
      targetKey: transfer.targetKey,
      mapping: transfer.mapping,
      mode: 'upsert' as const,
      normalization:
        transfer.sourceKey === 'domain'
          ? ('domain' as const)
          : ('text' as const),
      skipBlank: true,
      condition: transfer.when,
      ...(transfer.childRecipeId
        ? {
            rowScope: 'children' as const,
            childRecipeId: transfer.childRecipeId,
          }
        : {}),
    };
    planTableTransfer({ ...source, rows: [] }, target, rule);
    source.tableTransfers = [...(source.tableTransfers ?? []), rule];
    guideSteps.push({
      tableId: source.id,
      transferId: rule.id,
      title: transfer.name,
      detail: `Copy matching results into ${target.name}.`,
    });
  }
  for (const key of keys.slice(1))
    if (plan.transfers.filter((t) => t.to === key).length !== 1)
      throw new Error('Every later sheet needs exactly one incoming route.');
  if (
    !plan.tables[0].steps.length ||
    plan.tables[0].steps[0].kind !== 'research' ||
    plan.tables[0].steps[0].mode !== 'list'
  )
    throw new Error(
      'Start the workbook with a list research step that turns the brief into records.',
    );
  const sorted = guideSteps.sort(
    (a, b) =>
      tables.findIndex((t) => t.id === a.tableId) -
      tables.findIndex((t) => t.id === b.tableId),
  );
  for (const [index, table] of tables.entries())
    table.workbookPlan = {
      id,
      fingerprint,
      request,
      name: plan.name,
      summary: plan.summary,
      purpose: plan.tables[index].purpose,
      assumptions: plan.assumptions,
      manualTasks: plan.manualTasks,
      steps: sorted,
      tables: tables.map((item) => ({ id: item.id, name: item.name })),
    };
  return { plan, tables, steps: sorted };
}
