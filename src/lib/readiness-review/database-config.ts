import { StoreUnavailable } from './store';

/**
 * Which store the review track uses, and where the database store may point. The database store is opt-in, server
 * only, and fails closed: it binds to exactly one declared Supabase project and refuses the project that preview and
 * production share until staging isolation (release blocker B2) is resolved. The service key is read only here, on the
 * server; it is never a NEXT_PUBLIC variable and never reaches a page.
 */
export const SHARED_SUPABASE_PROJECT_REFS: readonly string[] = ['iszihmmbgsfefawqmnwo'];

export type ReviewStoreKind = 'file' | 'database';

export function reviewStoreKind(env: NodeJS.ProcessEnv = process.env): ReviewStoreKind {
  return env.MK_READINESS_REVIEW_STORE === 'database' ? 'database' : 'file';
}

/** The database store's configuration was refused. Reported like any other unavailable store: nothing was stored. */
export class DatabaseConfigRefused extends StoreUnavailable {}

export type ReviewDatabaseConfig = { url: string; serviceKey: string; projectRef: string };

export function reviewDatabaseConfig(env: NodeJS.ProcessEnv = process.env): ReviewDatabaseConfig {
  const url = env.MK_READINESS_REVIEW_DB_URL?.trim();
  const serviceKey = env.MK_READINESS_REVIEW_DB_SERVICE_KEY?.trim();
  const projectRef = env.MK_READINESS_REVIEW_DB_PROJECT_REF?.trim();
  if (!url || !serviceKey || !projectRef) throw new DatabaseConfigRefused('The review database is not fully configured. Nothing was stored.');
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new DatabaseConfigRefused('The review database address is not valid. Nothing was stored.');
  }
  const local = projectRef === 'local' && parsed.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(parsed.hostname);
  if (!local && (parsed.protocol !== 'https:' || parsed.host !== `${projectRef}.supabase.co`)) {
    throw new DatabaseConfigRefused('The review database address does not belong to the declared project. Nothing was stored.');
  }
  if (SHARED_SUPABASE_PROJECT_REFS.includes(projectRef)) {
    throw new DatabaseConfigRefused('The review store does not use the project that preview and production share until staging isolation is resolved. Nothing was stored.');
  }
  return { url: parsed.origin, serviceKey, projectRef };
}
