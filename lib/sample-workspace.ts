import type { PomadeColumn, PomadeRow, WorkspaceSnapshot } from './pomade-types';

export const initialColumns: PomadeColumn[] = [
  { id: 'company', title: 'Company', kind: 'text', width: 170 },
  { id: 'person', title: 'Person', kind: 'text', width: 160 },
  { id: 'title', title: 'Title', kind: 'text', width: 175 },
  { id: 'domain', title: 'Company domain', kind: 'text', width: 170 },
  { id: 'fit', title: 'ICP fit', kind: 'enrichment', width: 180, recipe: 'score-fit' },
  { id: 'opener', title: 'Personal opener', kind: 'enrichment', width: 330, recipe: 'write-opener' },
  { id: 'status', title: 'Run status', kind: 'status', width: 140 },
];

const rawRows: Array<Record<string, string>> = [
  { company: 'Mercury', person: 'Immad Akhund', title: 'Co-founder & CEO', domain: 'mercury.com', fit: 'Strong · 92', opener: 'Your focus on making complex finance feel calm is exactly the bar we admire.', status: 'Ready' },
  { company: 'Linear', person: 'Karri Saarinen', title: 'Co-founder & CEO', domain: 'linear.app', fit: 'Strong · 89', opener: 'Linear proves that operational software can be both rigorous and beautifully fast.', status: 'Ready' },
  { company: 'Vercel', person: 'Guillermo Rauch', title: 'Founder & CEO', domain: 'vercel.com', fit: 'Strong · 87', opener: 'You turned deployment from a release ritual into a product experience.', status: 'Ready' },
  { company: 'Attio', person: 'Nicolas Sharp', title: 'Co-founder & CEO', domain: 'attio.com', fit: 'Review · 76', opener: 'Attio’s model-first approach is a sharp rethink of what a CRM should feel like.', status: 'Review' },
  { company: 'Ramp', person: 'Eric Glyman', title: 'Co-founder & CEO', domain: 'ramp.com', fit: 'Strong · 91', opener: 'The way Ramp ties every workflow back to time and money saved really lands.', status: 'Ready' },
  { company: 'Clay', person: 'Kareem Amin', title: 'Co-founder & CEO', domain: 'clay.com', fit: 'Review · 79', opener: 'You made enrichment composable enough to feel less like data work and more like making.', status: 'Review' },
  { company: 'HubSpot', person: 'Yamini Rangan', title: 'CEO', domain: 'hubspot.com', fit: 'Strong · 86', opener: 'Your customer-first operating model keeps a large platform remarkably coherent.', status: 'Ready' },
  { company: 'OpenAI', person: 'Brad Lightcap', title: 'COO', domain: 'openai.com', fit: 'Review · 72', opener: 'Scaling access while the underlying capability changes weekly is an unusual GTM problem.', status: 'Review' },
  { company: 'Webflow', person: 'Linda Tong', title: 'CEO', domain: 'webflow.com', fit: 'Strong · 84', opener: 'Webflow’s evolution from a tool into a platform mirrors how modern GTM teams work.', status: 'Ready' },
  { company: 'Notion', person: 'Ivan Zhao', title: 'Co-founder & CEO', domain: 'notion.so', fit: 'Strong · 88', opener: 'Notion showed that flexible primitives can still produce a deeply opinionated experience.', status: 'Ready' },
];

export const initialRows: PomadeRow[] = rawRows.map((values, index) => ({
  id: `sample-${index + 1}`,
  values,
}));

export function createSampleWorkspace(): WorkspaceSnapshot {
  return {
    id: 'founder-targets',
    name: 'Founder targets',
    columns: initialColumns.map((column) => ({ ...column })),
    rows: initialRows.map((row) => ({
      ...row,
      values: { ...row.values },
    })),
    updatedAt: Date.now(),
  };
}
