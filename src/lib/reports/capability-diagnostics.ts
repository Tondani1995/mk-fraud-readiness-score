// Temporary-by-design diagnostic helper for capability/eligibility checks that
// read from app_settings, RPCs, and the Phase 1 fulfilment tables. Exists to
// answer "which specific dependency failed" without ever logging row content.
//
// Safety contract: only ever log the query name, the Postgres/PostgREST error
// code, a fixed safe description keyed off that code, error.details/error.hint
// (both describe schema objects, not row data, per PostgREST's error shape),
// the request path (a static route template, never an interpolated value),
// and the deployment SHA. Never log error.message directly, row data, customer
// answers, emails, tokens, keys, or secrets.

export type QueryFailureDiagnostic = {
  query: string;
  code: string | null;
  safeMessage: string;
  details: string | null;
  hint: string | null;
};

export type DiagnosticContext = {
  requestPath?: string;
};

type PostgrestLikeError = {
  code?: string | null;
  details?: string | null;
  hint?: string | null;
} | null | undefined;

const SAFE_MESSAGE_BY_CODE: Record<string, string> = {
  '42501': 'Insufficient privilege — the service role is missing a GRANT on this table or function.',
  '42P01': 'Undefined table — schema drift, or a migration has not been applied to this environment.',
  '42703': 'Undefined column — schema drift, or a migration has not been applied to this environment.',
  '42883': 'Undefined function — the RPC does not exist, or the signature does not match.',
  'PGRST116': 'PostgREST schema cache is stale for this object.',
  'PGRST301': 'JWT or role resolution failed at the PostgREST layer.',
  'PGRST202': 'PostgREST could not find this function in its schema cache.'
};

function safeMessage(code: string | null): string {
  if (!code) return 'Query failed with no error code returned.';
  return SAFE_MESSAGE_BY_CODE[code] ?? `Database error code ${code}.`;
}

function deploymentSha(): string {
  return process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.VERCEL_DEPLOYMENT_ID ?? 'unknown';
}

/**
 * Logs a structured, secret-free diagnostic line for a single failed query and
 * returns a QueryFailureDiagnostic for the caller to surface in the admin UI.
 * Returns null (and logs nothing) when `error` is falsy, so call sites can pass
 * a Supabase/PostgREST `{ error }` result directly.
 */
export function logCapabilityQueryFailure(
  queryName: string,
  error: PostgrestLikeError,
  context?: DiagnosticContext
): QueryFailureDiagnostic | null {
  if (!error) return null;
  const diagnostic: QueryFailureDiagnostic = {
    query: queryName,
    code: error.code ?? null,
    safeMessage: safeMessage(error.code ?? null),
    details: error.details ?? null,
    hint: error.hint ?? null
  };
  console.error('capability_query_failure', {
    query: diagnostic.query,
    code: diagnostic.code,
    safeMessage: diagnostic.safeMessage,
    details: diagnostic.details,
    hint: diagnostic.hint,
    requestPath: context?.requestPath ?? null,
    deploymentSha: deploymentSha()
  });
  return diagnostic;
}
