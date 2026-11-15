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

/**
 * Production mode for the revised review (release step, 15 November 2026). Off unless every condition holds:
 *   - MK_READINESS_REVIEW_MODE=production, set explicitly;
 *   - a production runtime (VERCEL_ENV=production): production mode never runs anywhere else;
 *   - answers in the database store, never the file harness;
 *   - the review store and the application database are one project;
 *   - no test setting is present (MK_READINESS_REVIEW_HARNESS, MK_REVISED_COMMERCIAL_PATH, MK_READINESS_REVIEW_FAULTS),
 *     so a test configuration can never be carried into production.
 * The database adds its own switch: binding requires readiness_review.environment_flags ('commercial_bridge',
 * 'production'), which no migration sets. Real organisations enter through private role links (DR-09).
 */
export type ReviewProductionStatus =
  | { enabled: true; projectRef: string }
  | { enabled: false; reason: 'not-configured' | 'not-production-runtime' | 'store-not-database' | 'no-database' | 'database-mismatch' | 'test-settings-present' };

export function reviewProductionStatus(env: NodeJS.ProcessEnv = process.env): ReviewProductionStatus {
  if (env.MK_READINESS_REVIEW_MODE !== 'production') return { enabled: false, reason: 'not-configured' };
  if (env.VERCEL_ENV !== 'production') return { enabled: false, reason: 'not-production-runtime' };
  if (env.MK_READINESS_REVIEW_HARNESS || env.MK_REVISED_COMMERCIAL_PATH || env.MK_READINESS_REVIEW_FAULTS) return { enabled: false, reason: 'test-settings-present' };
  if (env.MK_READINESS_REVIEW_STORE !== 'database') return { enabled: false, reason: 'store-not-database' };
  const appRef = supabaseRefFromUrl(env.NEXT_PUBLIC_SUPABASE_URL);
  const reviewRef = env.MK_READINESS_REVIEW_DB_PROJECT_REF?.trim() || null;
  if (!appRef) return { enabled: false, reason: 'no-database' };
  if (reviewRef !== appRef) return { enabled: false, reason: 'database-mismatch' };
  return { enabled: true, projectRef: appRef };
}

export type RevisedCommercialStatus =
  | { enabled: true; projectRef: string; mode: 'production' | 'restricted-test' }
  | { enabled: false; reason: 'production-runtime' | 'not-configured' | 'production-database' | 'database-mismatch' | 'store-not-database' };

export function revisedCommercialStatus(env: NodeJS.ProcessEnv = process.env): RevisedCommercialStatus {
  const production = reviewProductionStatus(env);
  if (production.enabled) return { enabled: true, projectRef: production.projectRef, mode: 'production' };
  // Everything below is the restricted test, unchanged: never in a production runtime or against production data.
  if (env.VERCEL_ENV === 'production') return { enabled: false, reason: 'production-runtime' };
  if (env.MK_REVISED_COMMERCIAL_PATH !== 'restricted-test') return { enabled: false, reason: 'not-configured' };
  const appRef = supabaseRefFromUrl(env.NEXT_PUBLIC_SUPABASE_URL);
  const reviewRef = env.MK_READINESS_REVIEW_DB_PROJECT_REF?.trim() || null;
  if (!appRef || PRODUCTION_SUPABASE_REFS.includes(appRef) || (reviewRef && PRODUCTION_SUPABASE_REFS.includes(reviewRef))) {
    return { enabled: false, reason: 'production-database' };
  }
  if (env.MK_READINESS_REVIEW_STORE !== 'database') return { enabled: false, reason: 'store-not-database' };
  if (reviewRef !== appRef) return { enabled: false, reason: 'database-mismatch' };
  return { enabled: true, projectRef: appRef, mode: 'restricted-test' };
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

/** Which edition a revised report is: a customer edition only in production mode; a restricted test everywhere else. */
export type ReportEdition = 'customer' | 'restricted-test';
export function reportEdition(env: NodeJS.ProcessEnv = process.env): ReportEdition {
  return reviewProductionStatus(env).enabled ? 'customer' : 'restricted-test';
}

/** The label every restricted-test artefact carries. */
export const RESTRICTED_TEST_LABEL = 'RESTRICTED TEST · Fictional organisation entered through the test deployment · Not for customer release';

/**
 * The label a restricted-test revised REPORT carries. Reports now carry the MK Fraud Readiness score (DR-02), so they no
 * longer say that no score is issued; the Snapshot keeps RESTRICTED_TEST_LABEL, which is still true for it.
 */
export const RESTRICTED_TEST_REPORT_LABEL = 'RESTRICTED TEST · Fictional organisation entered through the test deployment · Not for customer release';
