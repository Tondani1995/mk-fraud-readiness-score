/**
 * B5 environment guard for the revised assessment's commercial path (binding a completed review session to an
 * assessment, ordering a paid report from it and generating that report).
 *
 * It runs only in a restricted test environment and fails closed everywhere else:
 *   - never in a production runtime (VERCEL_ENV=production), whatever the settings say;
 *   - only when MK_REVISED_COMMERCIAL_PATH=restricted-test is set explicitly;
 *   - never when the application database or the review store is the production project;
 *   - only when the application database and the review store are the same isolated project, so the commercial
 *     records and the answer log they cite cannot drift apart.
 * The database adds its own switch (readiness_review.environment_flags), which no migration sets.
 */

/** Supabase projects that hold production customer data. The revised path refuses all of them. */
export const PRODUCTION_SUPABASE_REFS: readonly string[] = ['iszihmmbgsfefawqmnwo', 'jvjxlphdyzerrhwcgkup'];

export function supabaseRefFromUrl(url: string | undefined | null): string | null {
  if (!url) return null;
  try {
    const host = new URL(url.trim()).hostname;
    const match = host.match(/^([a-z0-9]{20})\.supabase\.co$/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

export type RevisedCommercialStatus =
  | { enabled: true; projectRef: string }
  | { enabled: false; reason: 'production-runtime' | 'not-configured' | 'production-database' | 'database-mismatch' | 'store-not-database' };

export function revisedCommercialStatus(env: NodeJS.ProcessEnv = process.env): RevisedCommercialStatus {
  if (env.VERCEL_ENV === 'production') return { enabled: false, reason: 'production-runtime' };
  if (env.MK_REVISED_COMMERCIAL_PATH !== 'restricted-test') return { enabled: false, reason: 'not-configured' };
  const appRef = supabaseRefFromUrl(env.NEXT_PUBLIC_SUPABASE_URL);
  const reviewRef = env.MK_READINESS_REVIEW_DB_PROJECT_REF?.trim() || null;
  if (!appRef || PRODUCTION_SUPABASE_REFS.includes(appRef) || (reviewRef && PRODUCTION_SUPABASE_REFS.includes(reviewRef))) {
    return { enabled: false, reason: 'production-database' };
  }
  if (env.MK_READINESS_REVIEW_STORE !== 'database') return { enabled: false, reason: 'store-not-database' };
  if (reviewRef !== appRef) return { enabled: false, reason: 'database-mismatch' };
  return { enabled: true, projectRef: appRef };
}

export class RevisedCommercialDisabled extends Error {
  readonly reason: string;
  constructor(reason: string) {
    super(`The revised assessment's commercial path is not available in this environment (${reason}).`);
    this.name = 'RevisedCommercialDisabled';
    this.reason = reason;
  }
}

export function requireRevisedCommercial(env: NodeJS.ProcessEnv = process.env): string {
  const status = revisedCommercialStatus(env);
  if (!status.enabled) throw new RevisedCommercialDisabled(status.reason);
  return status.projectRef;
}

/** The label every restricted-test artefact carries. */
export const RESTRICTED_TEST_LABEL = 'RESTRICTED TEST · Fictional organisation entered through the test deployment · Revised method not approved by MK: no readiness score is issued · Not for customer release';
