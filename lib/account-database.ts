// Each beta member has a complete private set of data tables in the same D1.
// Only application-owned SQL reaches this adapter; user values must stay bound.
export const ACCOUNT_TABLES = [
  'workspaces',
  'workspace_versions',
  'runs',
  'provider_cache',
  'run_jobs',
  'waterfall_progress',
  'webhook_events',
  'webhook_imports',
  'api_source_batches',
  'table_transfer_runs',
  'workbook_templates',
  'signal_batches',
  'crm_sync_runs',
  'research_requests',
  'research_companion',
  'research_settings',
  'workbook_runs',
  'crm_refreshes',
] as const;
const tables = new Set<string>(ACCOUNT_TABLES);

export function accountSql(sql: string, prefix: string) {
  if (!/^member_[a-f0-9]{32}_$/.test(prefix))
    throw new Error('Invalid account database.');
  return sql.replace(
    /'(?:''|[^'])*'|--[^\n]*|\/\*[\s\S]*?\*\/|"(?:""|[^"])*"|`[^`]*`|\[[^\]]*\]|[A-Za-z_][A-Za-z_0-9]*/g,
    (token) => {
      if (
        token.startsWith("'") ||
        token.startsWith('--') ||
        token.startsWith('/*')
      )
        return token;
      const quoted = /^["`[]/.test(token);
      const name = (quoted ? token.slice(1, -1) : token).toLowerCase();
      if (
        /^(pomade_accounts|account_credentials|sqlite_|member_)/.test(name) ||
        ['attach', 'detach', 'writable_schema'].includes(name)
      )
        throw new Error('Account database access denied.');
      if (
        tables.has(name) ||
        name.startsWith('idx_') ||
        name === 'workspace_revision_guard'
      ) {
        const scoped = prefix + name;
        return quoted ? token[0] + scoped + token.at(-1) : scoped;
      }
      return token;
    },
  );
}

export function accountDatabase(db: D1Database, prefix: string): D1Database {
  if (!prefix) return db; // The owner's existing tables retain their names and data.
  const statements = new WeakSet<object>();
  function wrap(statement: D1PreparedStatement): D1PreparedStatement {
    const proxy = new Proxy(statement, {
      get(target, property) {
        if (property === 'bind')
          return (...values: unknown[]) => wrap(target.bind(...values));
        const value = Reflect.get(target, property);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    statements.add(proxy);
    return proxy;
  }
  return {
    prepare: (sql: string) => wrap(db.prepare(accountSql(sql, prefix))),
    batch: (items: D1PreparedStatement[]) => {
      if (items.some((item) => !statements.has(item)))
        throw new Error('Mixed account statements are not allowed.');
      return db.batch(items);
    },
    exec: () => {
      throw new Error('Use prepared account statements.');
    },
    dump: () => {
      throw new Error('Account database export is not available.');
    },
    withSession: () => {
      throw new Error('Use the current account database.');
    },
  } as unknown as D1Database;
}
