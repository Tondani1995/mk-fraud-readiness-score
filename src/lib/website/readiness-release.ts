import { readinessTrack } from './readiness-track';
import { reviewHarnessStatus } from '@/lib/readiness-review/harness';

/**
 * The switch-over (owner decision DR-01, 14 November 2026): for new customers the revised review replaces the scored
 * MFRS assessment, the scored assessment stops taking new starts and new orders, and existing MFRS results and reports
 * stay where they are, labelled as produced under the previous method.
 *
 * It takes effect only where both hold:
 *   - the build selects the review track (NEXT_PUBLIC_MK_READINESS_TRACK=review), the owner's release switch; and
 *   - the revised review can actually run in this environment (reviewHarnessStatus).
 * If the switch is set where the review cannot run (today, every production runtime), nothing closes and new customers
 * keep the scored assessment: a customer is never left with no assessment to start. Lifting the production refusal is
 * a separate, owner-approved release step.
 */
export function revisedReleaseEffective(): boolean {
  return readinessTrack() === 'review' && reviewHarnessStatus().enabled;
}

/** The assessment mode the commercial bridge gives a revised assessment; every other mode is the previous method. */
export const REVISED_ASSESSMENT_MODE = 'readiness_review';
export function isPreviousMethodMode(mode: string | null | undefined): boolean {
  return mode !== REVISED_ASSESSMENT_MODE;
}

export const PREVIOUS_METHOD_LABEL = 'Produced under the previous MK Fraud Readiness method';
export const PREVIOUS_METHOD_NOTICE =
  'This result was produced under the previous MK Fraud Readiness method. It stays available as a record of the answers given at the time. New assessments and reports use the current method.';
export const SCORED_START_CLOSED = {
  code: 'scored_assessment_closed',
  message: 'New Fraud Readiness assessments now use the current method. Start a new assessment to continue.',
  next: '/review'
} as const;
export const SCORED_ORDER_CLOSED_MESSAGE =
  'This assessment was completed under the previous MK Fraud Readiness method, which no longer takes new report orders. Your Snapshot remains available. To order a report, start a new assessment.';

/**
 * The mode of one assessment, read on its own so the token check is not changed. An error is thrown, never read as
 * "revised": callers treat an unknown mode as the previous method and refuse the order.
 */
export async function assessmentModeOf(db: any, assessmentId: string): Promise<string | null> {
  const { data, error } = await db.from('assessments').select('assessment_mode').eq('id', assessmentId).maybeSingle();
  if (error) throw new Error('assessment_mode_unreadable');
  return (data?.assessment_mode as string | undefined) ?? null;
}
