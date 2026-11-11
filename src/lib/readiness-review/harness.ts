import path from 'node:path';

/**
 * The review track in this candidate stores sessions in a fictional local harness: JSON files on the server's own
 * disk, with random links standing in for authenticated access. It is not durable persistence, not authentication
 * and not suitable for real organisations. It runs only when explicitly configured, and never in a production
 * deployment, whatever the configuration says.
 */
export type HarnessStatus = { enabled: boolean; reason: 'fictional-local' | 'production-runtime' | 'not-configured' };

export function reviewHarnessStatus(): HarnessStatus {
  if (process.env.VERCEL_ENV === 'production') return { enabled: false, reason: 'production-runtime' };
  if (process.env.MK_READINESS_REVIEW_HARNESS !== 'fictional-local') return { enabled: false, reason: 'not-configured' };
  return { enabled: true, reason: 'fictional-local' };
}

export function reviewHarnessDirectory() {
  return process.env.MK_READINESS_REVIEW_HARNESS_DIR || path.join(process.cwd(), '.readiness-review-harness');
}

/**
 * The review engine build new sessions are created with. Build 1.6 (staged completion) only in the fictional harness
 * and only when asked for explicitly; every other case is build 1.5, exactly as before.
 */
export function reviewEngineBuild(): '1.5' | '1.6' {
  return reviewHarnessStatus().enabled && process.env.MK_READINESS_REVIEW_ENGINE === '1.6' ? '1.6' : '1.5';
}

/** Test-only fault injection for save-failure and retry checks. Requires the harness and an explicit second flag. */
export function reviewHarnessFaultsEnabled() {
  return reviewHarnessStatus().enabled && process.env.MK_READINESS_REVIEW_FAULTS === 'enabled';
}

export const HARNESS_NOTICE = 'Fictional local harness: answers are stored as files on this computer, links stand in for sign-in and are not secure, and nothing here is suitable for a real organisation.';
export const DATABASE_HARNESS_NOTICE = 'Fictional test harness: answers are stored in an isolated test database, links stand in for sign-in and are not secure, and nothing here is suitable for a real organisation.';

/** The notice every review page shows, naming where answers are actually stored. */
export function harnessNotice() {
  return process.env.MK_READINESS_REVIEW_STORE === 'database' ? DATABASE_HARNESS_NOTICE : HARNESS_NOTICE;
}
