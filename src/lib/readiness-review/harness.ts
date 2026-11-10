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

/** Test-only fault injection for save-failure and retry checks. Requires the harness and an explicit second flag. */
export function reviewHarnessFaultsEnabled() {
  return reviewHarnessStatus().enabled && process.env.MK_READINESS_REVIEW_FAULTS === 'enabled';
}

export const HARNESS_NOTICE = 'Fictional local harness: answers are stored as files on this computer, links stand in for sign-in and are not secure, and nothing here is suitable for a real organisation.';
