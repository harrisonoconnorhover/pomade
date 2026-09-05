import { sites } from '@openai/sites-vite-plugin';
import tailwindcss from '@tailwindcss/postcss';
import vinext from 'vinext';
import { defineConfig, loadEnv } from 'vite';
import hostingConfig from './.openai/hosting.json' with { type: 'json' };

const SITE_CREATOR_PLACEHOLDER_DATABASE_ID =
  '00000000-0000-4000-8000-000000000000';

const { d1, r2 } = hostingConfig;

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === 'seatbelt';
const localVariableNames = [
  'POMADE_API_KEYS',
  'POMADE_HTTP_CONNECTIONS',
  'POMADE_WEBHOOK_SOURCES',
  'APOLLO_API_KEY',
  'HUNTER_API_KEY',
  'PROSPEO_API_KEY',
  'POMADE_RESEARCH_PROVIDER',
  'POMADE_CODEX_URL',
  'POMADE_CODEX_TOKEN',
  'POMADE_CODEX_MODEL',
  'POMADE_CODEX_BROWSER',
  'PDL_API_KEY',
  'PARALLEL_API_KEY',
  'PARALLEL_MODEL',
  'GEMINI_API_KEY',
  'GEMINI_MODEL',
  'HUBSPOT_ACCESS_TOKEN',
  'SALESFORCE_INSTANCE_URL',
  'SALESFORCE_ACCESS_TOKEN',
  'SALESFORCE_API_VERSION',
] as const;

export default defineConfig(async ({ mode }) => {
  const fileEnv = loadEnv(mode, process.cwd(), '');
  const localVars = Object.fromEntries(
    localVariableNames.flatMap((name) => {
      const value = process.env[name] ?? fileEnv[name];
      return value ? [[name, value]] : [];
    }),
  ) as Record<string, string>;
  const localBindingConfig = {
    main: './worker.ts',
    compatibility_flags: ['nodejs_compat'],
    triggers: { crons: ['* * * * *'] },
    vars: localVars,
    d1_databases: d1
      ? [
          {
            binding: d1,
            database_name: 'site-creator-d1',
            database_id: SITE_CREATOR_PLACEHOLDER_DATABASE_ID,
          },
        ]
      : [],
    r2_buckets: r2
      ? [
          {
            binding: r2,
            bucket_name: 'site-creator-r2',
          },
        ]
      : [],
  };

  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= 'false';
  process.env.WRANGLER_LOG_PATH ??= '.wrangler/logs';
  process.env.MINIFLARE_REGISTRY_PATH ??= '.wrangler/registry';

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import('@cloudflare/vite-plugin');

  return {
    css: { postcss: { plugins: [tailwindcss()] } },
    server: isCodexSeatbeltSandbox
      ? { watch: { useFsEvents: false, usePolling: true } }
      : undefined,
    plugins: [
      vinext(),
      sites(),
      cloudflare({
        viteEnvironment: { name: 'rsc', childEnvironments: ['ssr'] },
        config: localBindingConfig,
      }),
    ],
  };
});
