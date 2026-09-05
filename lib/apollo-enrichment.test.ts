import { describe, expect, it } from 'vitest';

import {
  applyApolloBatchEnrichment,
  applyApolloEnrichment,
} from './apollo-enrichment';
import type { ApolloEnrichmentResult } from './pomade-types';
import { createSampleWorkspace } from './sample-workspace';

const FOUND: ApolloEnrichmentResult = {
  personId: 'apollo-1',
  fullName: 'Immad Akhund',
  title: 'Co-founder & CEO',
  workEmail: 'immad@mercury.com',
  candidateEmail: null,
  emailStatus: 'verified',
  linkedinUrl: 'https://linkedin.com/in/immad',
  location: 'San Francisco, California, United States',
  organizationDomain: 'mercury.com',
  status: 'found',
  evidence: ['Exact name and domain.', 'Verified email.'],
  creditsConsumed: 1,
  cached: false,
};

describe('Apollo workspace enrichment', () => {
  it('adds provider fields, updates only the selected row, and records a receipt', () => {
    const workspace = createSampleWorkspace();
    const result = applyApolloEnrichment(
      workspace,
      'sample-1',
      FOUND,
      Date.now() - 25,
    );

    expect(result.workspace.rows[0].values).toMatchObject({
      apollo_email: 'immad@mercury.com',
      apollo_match: 'Verified',
      apollo_title: 'Co-founder & CEO',
      apollo_credits: '1',
      status: 'Ready',
    });
    expect(result.workspace.rows[1].values).not.toHaveProperty('apollo_email');
    expect(result.workspace.columns.map((column) => column.id)).toContain(
      'apollo_email',
    );
    expect(result.run).toMatchObject({
      provider: 'apollo',
      creditsConsumed: 1,
      rowCount: 1,
      actionCount: 1,
      externalWrites: 0,
    });
    expect(result.run.receipts[0]).toMatchObject({
      provider: 'apollo',
      status: 'passed',
      evidence: FOUND.evidence,
    });
  });

  it('marks a cached review result without reporting new credit use', () => {
    const workspace = createSampleWorkspace();
    const result = applyApolloEnrichment(
      workspace,
      'sample-1',
      {
        ...FOUND,
        workEmail: null,
        candidateEmail: 'candidate@mercury.com',
        status: 'needs_review',
        creditsConsumed: 0,
        cached: true,
      },
      Date.now(),
    );

    expect(result.workspace.rows[0].values).toMatchObject({
      apollo_email: '',
      apollo_match: 'Review email',
      apollo_credits: '0 · cached',
      status: 'Review',
    });
    expect(result.run.reviewCount).toBe(1);
  });

  it('applies a multi-row batch and aggregates receipts and credits', () => {
    const workspace = createSampleWorkspace();
    const result = applyApolloBatchEnrichment(
      workspace,
      [
        { rowId: 'sample-1', result: FOUND },
        {
          rowId: 'sample-2',
          result: {
            ...FOUND,
            personId: null,
            fullName: null,
            workEmail: null,
            title: null,
            linkedinUrl: null,
            location: null,
            organizationDomain: 'linear.app',
            status: 'not_found',
            evidence: ['No match.'],
            creditsConsumed: 0,
          },
        },
      ],
      Date.now() - 25,
    );

    expect(result.workspace.rows[0].values.apollo_email).toBe(
      'immad@mercury.com',
    );
    expect(result.workspace.rows[1].values).toMatchObject({
      apollo_match: 'Not found',
      status: 'Review',
    });
    expect(result.run).toMatchObject({
      rowCount: 2,
      actionCount: 2,
      passedCount: 1,
      reviewCount: 1,
      creditsConsumed: 1,
    });
    expect(result.run.receipts).toHaveLength(2);
  });
});
