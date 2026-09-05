import { describe, expect, it, vi } from 'vitest';
import { currentJobPage, verifyHiringEvidence } from './hiring-evidence';
import { createTable } from './workbook';
import { addSignalResearch } from './account-signals';
import { applyWebResearchResult } from './web-research';

describe('current hiring evidence', () => {
  it('does not mistake HTTP 200 Workday shells for available jobs', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('postingAvailable: false'))
      .mockResolvedValueOnce(new Response('postingAvailable: true'))
      .mockResolvedValueOnce(new Response('<html></html>'));
    const url = 'http://example.wd5.myworkdayjobs.com/en-US/Jobs/job/SDR';
    expect(await currentJobPage(url, fetcher)).toContain('no longer available');
    expect(await currentJobPage(url, fetcher)).toBeNull();
    expect(await currentJobPage(url, fetcher)).toContain('did not establish');
    expect((fetcher.mock.calls[0][0] as URL).protocol).toBe('https:');
  });
  it('checks structured job expiry and refuses unrecognized URLs without fetching them', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(
          '<script type="application/ld+json">{"@type":"JobPosting","title":"Admin","validThrough":"2020-01-01"}</script>',
        ),
      );
    expect(
      await currentJobPage('https://jobs.lever.co/example/job', fetcher),
    ).toContain('expired');
    fetcher.mockClear();
    for (const url of [
      'http://127.0.0.1/job',
      'https://jobs.lever.co.attacker.example/job',
      'https://user:secret@jobs.lever.co/example/job',
    ])
      expect(await currentJobPage(url, fetcher)).toContain('manual check');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('keeps raw/cited research but prevents expired roles from feeding scoring or change events', async () => {
    const w = addSignalResearch(
      createTable({ id: 'w', name: 'Hiring', mode: 'empty' }),
      'hiring',
    );
    w.rows = [
      { id: 'one', values: { company: 'Example', domain: 'example.com' } },
    ];
    const column = w.columns.find((c) => c.id === 'hiring_signals')!;
    const answer = JSON.stringify({
      hiring_signals: 'SDR: https://example.wd5.myworkdayjobs.com/job/SDR',
      hiring_signals_source: 'https://example.wd5.myworkdayjobs.com/job/SDR',
      hiring_signals_date: '',
      hiring_signals_evidence: 'Provider found a role',
    });
    const applied = applyWebResearchResult(
      w,
      'one',
      column,
      {
        answer,
        citations: [
          {
            url: 'https://example.wd5.myworkdayjobs.com/job/SDR',
            title: 'Role',
          },
        ],
        queries: [],
        model: 'speed',
        cached: true,
      },
      Date.now(),
    );
    const checked = await verifyHiringEvidence(
      applied,
      'one',
      column,
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response('postingAvailable: false')),
    );
    expect(checked.receipt.status).toBe('review');
    expect(checked.workspace.rows[0].values.hiring_signals).toBe('');
    expect(checked.workspace.rows[0].values.hiring_signals_source).toBe('');
    expect(checked.workspace.rows[0].values.__research_hiring_signals_raw).toBe(
      answer,
    );
    expect(checked.receipt.evidence?.at(-1)).toContain('no longer available');
  });
});
