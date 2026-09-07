declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    POMADE_ACCOUNTS_ENABLED?: string;
    POMADE_VAULT_KEY?: string;
    POMADE_ACCOUNT_ID?: string;
    POMADE_DEPLOYMENT?: string;
    POMADE_OWNER_EMAIL?: string;
    POMADE_OWNER_TOKEN_SHA256?: string;
    POMADE_PUBLIC_ORIGIN?: string;
    POMADE_SCHEDULES_ENABLED?: string;
    POMADE_COMPANION_TOKEN_SHA256?: string;
    POMADE_API_KEYS?: string;
    POMADE_HTTP_CONNECTIONS?: string;
    POMADE_WEBHOOK_SOURCES?: string;
    APOLLO_API_KEY?: string;
    HUNTER_API_KEY?: string;
    LEADMAGIC_API_KEY?: string;
    FINDYMAIL_API_KEY?: string;
    ZEROBOUNCE_API_KEY?: string;
    TRESTLE_API_KEY?: string;
    CONTACTOUT_API_KEY?: string;
    UPCELL_API_KEY?: string;
    BOUNCEBAN_API_KEY?: string;
    ENROW_API_KEY?: string;
    PROSPEO_API_KEY?: string;
    POMADE_RESEARCH_PROVIDER?: string;
    POMADE_CODEX_URL?: string;
    POMADE_CODEX_TOKEN?: string;
    POMADE_CODEX_MODEL?: string;
    POMADE_CODEX_REASONING_EFFORT?: string;
    POMADE_CODEX_BROWSER?: string;
    PDL_API_KEY?: string;
    PARALLEL_API_KEY?: string;
    PARALLEL_MODEL?: string;
    GEMINI_API_KEY?: string;
    GEMINI_MODEL?: string;
    HUBSPOT_ACCESS_TOKEN?: string;
    SALESFORCE_INSTANCE_URL?: string;
    SALESFORCE_ACCESS_TOKEN?: string;
    SALESFORCE_REFRESH_TOKEN?: string;
    SALESFORCE_CLIENT_ID?: string;
    SALESFORCE_CLIENT_SECRET?: string;
    SALESFORCE_LOGIN_URL?: string;
    SALESFORCE_API_VERSION?: string;
  }
}
