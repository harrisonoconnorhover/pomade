import type {
  ActionReceipt,
  PomadeColumn,
  WorkspaceSnapshot,
} from './pomade-types';

const ATS_HOSTS = [
  'jobs.lever.co',
  'jobs.eu.lever.co',
  'boards.greenhouse.io',
  'job-boards.greenhouse.io',
  'boards.eu.greenhouse.io',
];
export async function currentJobPage(
  address: string,
  fetcher: typeof fetch = fetch,
): Promise<string | null> {
  let url: URL;
  try {
    url = new URL(address);
  } catch {
    return 'The job URL is invalid.';
  }
  const workday = url.hostname.endsWith('.myworkdayjobs.com');
  if (url.protocol !== 'https:' && url.protocol !== 'http:')
    return 'Use a public job URL.';
  if (
    url.username ||
    url.password ||
    url.port ||
    !(
      workday ||
      url.hostname.endsWith('.icims.com') ||
      ATS_HOSTS.includes(url.hostname)
    )
  )
    return 'This career-site format needs a manual check of the current posting.';
  url.protocol = 'https:';
  try {
    const response = await fetcher(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      await response.body?.cancel();
      return `The job page returned HTTP ${response.status}; current availability is unverified.`;
    }
    const reader = response.body?.getReader();
    if (!reader) return 'The job page was empty.';
    let size = 0,
      html = '';
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 1_000_000) {
        await reader.cancel();
        return 'The job page exceeded the verification limit.';
      }
      html += decoder.decode(value, { stream: true });
    }
    html += decoder.decode();
    if (workday) {
      if (/postingAvailable\s*:\s*false/.test(html))
        return 'Workday reports that this posting is no longer available.';
      if (/postingAvailable\s*:\s*true/.test(html)) return null;
    }
    for (const match of html.matchAll(
      /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
    )) {
      try {
        const value = JSON.parse(match[1]);
        const items = Array.isArray(value)
          ? value
          : (value['@graph'] ?? [value]);
        for (const item of items) {
          if (item?.['@type'] !== 'JobPosting' || !item.title) continue;
          if (
            item.validThrough &&
            (!Number.isFinite(Date.parse(item.validThrough)) ||
              Date.parse(item.validThrough) < Date.now())
          )
            return 'The job posting has expired.';
          return null;
        }
      } catch {
        /* A malformed metadata block does not establish an open role. */
      }
    }
    return 'The live page did not establish that this job is still open.';
  } catch {
    return 'The current job page could not be verified.';
  }
}

export async function verifyHiringEvidence(
  applied: { workspace: WorkspaceSnapshot; receipt: ActionReceipt },
  rowId: string,
  column: PomadeColumn,
  fetcher: typeof fetch = fetch,
) {
  if (
    !applied.workspace.signalWatches?.some(
      (w) => w.columnId === column.id && w.kind === 'hiring',
    )
  )
    return applied;
  const row = applied.workspace.rows.find((r) => r.id === rowId)!;
  const value = row.values[column.id] ?? '';
  if (!value.trim()) return applied;
  const urls = [...new Set(value.match(/https?:\/\/[^\s;<>"']+/g) ?? [])];
  let reason =
    !urls.length || urls.length > 5
      ? 'Provide up to five direct job links for current availability checks.'
      : undefined;
  for (const url of urls.slice(0, 5)) {
    if (reason) break;
    reason = (await currentJobPage(url, fetcher)) ?? undefined;
  }
  if (!reason) {
    (applied.receipt.evidence ??= []).push(
      'Direct ATS page availability checked at ' + new Date().toISOString(),
    );
    return applied;
  }
  const values = Object.fromEntries(
    (column.outputFields ?? [{ id: column.id }]).map((f) => [
      f.id,
      f.id === column.id + '_evidence' ? reason! : '',
    ]),
  );
  return {
    workspace: {
      ...applied.workspace,
      rows: applied.workspace.rows.map((r) =>
        r.id === rowId
          ? { ...r, values: { ...r.values, ...values, status: 'Review' } }
          : r,
      ),
    },
    receipt: {
      ...applied.receipt,
      status: 'review' as const,
      after: reason,
      outputValues: values,
      evidence: [...(applied.receipt.evidence ?? []), reason],
    },
  };
}
