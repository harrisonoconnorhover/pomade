declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    APOLLO_API_KEY?: string;
    GEMINI_API_KEY?: string;
    GEMINI_MODEL?: string;
    HUBSPOT_ACCESS_TOKEN?: string;
    SALESFORCE_INSTANCE_URL?: string;
    SALESFORCE_ACCESS_TOKEN?: string;
    SALESFORCE_API_VERSION?: string;
  }
}
