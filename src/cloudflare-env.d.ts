/**
 * Minimal types for the Worker bindings used by the server code (/api/quote).
 * Kept local instead of pulling @cloudflare/workers-types globally, which would
 * clash with the DOM types used by the browser scripts.
 */
declare module 'cloudflare:workers' {
  interface D1Result<T = unknown> {
    results?: T[];
    success: boolean;
    meta?: Record<string, unknown>;
  }
  interface D1PreparedStatement {
    bind(...values: unknown[]): D1PreparedStatement;
    first<T = unknown>(column?: string): Promise<T | null>;
    run<T = unknown>(): Promise<D1Result<T>>;
    all<T = unknown>(): Promise<D1Result<T>>;
  }
  interface D1Database {
    prepare(query: string): D1PreparedStatement;
    batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
  }
  interface RateLimit {
    limit(options: { key: string }): Promise<{ success: boolean }>;
  }
  export const env: {
    DB: D1Database;
    /** Edge rate limiter for /api/quote (wrangler.jsonc → ratelimits). */
    QUOTE_LIMITER?: RateLimit;
    /** Secret HMAC key for the stored rate-limit hash (set with `wrangler secret put IP_HASH_KEY`). */
    IP_HASH_KEY?: string;
    /** Optional: forward every stored lead to this URL (Make, Zapier, n8n, CRM…). */
    QUOTE_WEBHOOK_URL?: string;
  };
}
