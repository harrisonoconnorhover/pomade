declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    POMADE_HTTP_CONNECTIONS?: string;
    APOLLO_API_KEY?: string;
    PARALLEL_API_KEY?: string;
    PARALLEL_MODEL?: string;
    GEMINI_API_KEY?: string;
    GEMINI_MODEL?: string;
    HUBSPOT_ACCESS_TOKEN?: string;
    SALESFORCE_INSTANCE_URL?: string;
    SALESFORCE_ACCESS_TOKEN?: string;
    SALESFORCE_API_VERSION?: string;
  }
}
