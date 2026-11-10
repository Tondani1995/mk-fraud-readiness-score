/**
 * Which Fraud Readiness service new visitors enter. The scored adaptive assessment remains the default and is
 * unchanged, together with every issued record. A build with NEXT_PUBLIC_MK_READINESS_TRACK=review sends new
 * visitors to the unscored review track instead. Switching is an owner decision; this flag only makes it reversible.
 */
export type ReadinessTrack = 'legacy' | 'review';

export function readinessTrack(): ReadinessTrack {
  return process.env.NEXT_PUBLIC_MK_READINESS_TRACK === 'review' ? 'review' : 'legacy';
}
