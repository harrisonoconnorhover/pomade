import type { reviewCrmImport } from '@/lib/crm-import';

export default function CrmImportReview({
  review,
}: {
  review: ReturnType<typeof reviewCrmImport>;
}) {
  return (
    <section className="crm-import-review" aria-label="Changes if merged">
      <strong>Changes if merged</strong>
      <dl className="crm-import-counts">
        <div>
          <dt>New records</dt>
          <dd>{review.added}</dd>
        </div>
        <div>
          <dt>Updated records</dt>
          <dd>{review.updated}</dd>
        </div>
        <div>
          <dt>Unchanged</dt>
          <dd>{review.unchanged}</dd>
        </div>
        <div>
          <dt>Not returned · kept</dt>
          <dd>{review.notReturned ?? 'Not checked'}</dd>
        </div>
      </dl>
      <p className="source-help">
        {review.notReturned === null
          ? 'Load every page to check which existing CRM records were not returned. Counts above cover the loaded records.'
          : 'Existing records not returned by this source stay in the sheet.'}{' '}
        Recipe results and run statuses are kept. Enrichment is not rerun.
      </p>
      {review.changes.length ? (
        <details className="crm-import-changes">
          <summary>
            Review changed values
            {review.changes.length > 10 ? ' (first 10 records)' : ''}
          </summary>
          {review.changes.slice(0, 10).map((change) => (
            <article key={change.nativeId}>
              <strong>{change.label}</strong>
              <dl>
                {change.fields.map((field) => (
                  <div key={field.title}>
                    <dt>{field.title}</dt>
                    <dd>
                      <del>{field.before || '(empty)'}</del>
                      <span aria-label="changes to"> → </span>
                      <ins>{field.after || '(empty)'}</ins>
                    </dd>
                  </div>
                ))}
              </dl>
            </article>
          ))}
        </details>
      ) : null}
    </section>
  );
}
