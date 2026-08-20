/**
 * Comprehensive engagement lifecycle.
 *
 * Deliberately a SEPARATE concern from payment and report status. The repository already separates
 * these: `orders.status` is the payment/commercial state, `reports.status` is the artefact state,
 * and fulfilment attempts carry their own state. Overloading engagement progress onto any of those
 * would make "paid but not yet reviewed" and "reviewed but not yet delivered" indistinguishable, so
 * the engagement gets its own state column with its own transition table.
 *
 * The state graph is intentionally forward-only apart from two explicit, note-requiring returns
 * (in_review -> evidence_requested when the reviewer needs more evidence, and review_complete ->
 * in_review when sign-off is withdrawn before delivery). Everything else that would move backwards
 * is rejected. `cancelled` is terminal and reachable from any non-delivered state.
 */

export const COMPREHENSIVE_ENGAGEMENT_STATES = [
  'awaiting_payment',
  'payment_received',
  'evidence_requested',
  'evidence_received',
  'in_review',
  'review_complete',
  'delivered',
  'cancelled'
] as const;

export type ComprehensiveEngagementState = (typeof COMPREHENSIVE_ENGAGEMENT_STATES)[number];

export const COMPREHENSIVE_INITIAL_STATE: ComprehensiveEngagementState = 'awaiting_payment';

export const COMPREHENSIVE_TERMINAL_STATES: readonly ComprehensiveEngagementState[] = ['delivered', 'cancelled'];

const ALLOWED_TRANSITIONS: Readonly<Record<ComprehensiveEngagementState, readonly ComprehensiveEngagementState[]>> =
  Object.freeze({
    awaiting_payment: ['payment_received', 'cancelled'],
    payment_received: ['evidence_requested', 'cancelled'],
    evidence_requested: ['evidence_received', 'cancelled'],
    evidence_received: ['in_review', 'cancelled'],
    // A reviewer who finds the evidence insufficient sends the engagement back for more.
    in_review: ['review_complete', 'evidence_requested', 'cancelled'],
    // Sign-off can be withdrawn while the deliverables have not yet gone out.
    review_complete: ['delivered', 'in_review', 'cancelled'],
    delivered: [],
    cancelled: []
  });

/** Transitions that must carry an explanatory note because they undo prior progress. */
const NOTE_REQUIRED_TRANSITIONS: readonly `${ComprehensiveEngagementState}->${ComprehensiveEngagementState}`[] = [
  'in_review->evidence_requested',
  'review_complete->in_review',
  'awaiting_payment->cancelled',
  'payment_received->cancelled',
  'evidence_requested->cancelled',
  'evidence_received->cancelled',
  'in_review->cancelled',
  'review_complete->cancelled'
];

export type TransitionRejectionReason =
  | 'unknown_state'
  | 'terminal_state'
  | 'invalid_transition'
  | 'note_required'
  | 'payment_not_verified'
  | 'reviewer_not_assigned'
  | 'evidence_not_reviewed';

export type TransitionEvaluation =
  | { allowed: true }
  | { allowed: false; reason: TransitionRejectionReason; message: string };

export function isComprehensiveEngagementState(value: unknown): value is ComprehensiveEngagementState {
  return typeof value === 'string' && (COMPREHENSIVE_ENGAGEMENT_STATES as readonly string[]).includes(value);
}

export function allowedNextStates(from: ComprehensiveEngagementState): readonly ComprehensiveEngagementState[] {
  return ALLOWED_TRANSITIONS[from] ?? [];
}

export function transitionRequiresNote(
  from: ComprehensiveEngagementState,
  to: ComprehensiveEngagementState
): boolean {
  return NOTE_REQUIRED_TRANSITIONS.includes(`${from}->${to}`);
}

export type TransitionContext = {
  /** Result of the existing payment-verification contract for the engagement's order. */
  paymentVerified: boolean;
  /** Whether a named reviewer is persisted against the engagement. */
  reviewerAssigned: boolean;
  /** Evidence items still awaiting a reviewer validation decision. */
  unreviewedEvidenceCount: number;
  note: string | null;
};

/**
 * Pure guard over one proposed transition. The database enforces the same graph in a trigger; this
 * exists so routes fail fast with a specific reason rather than surfacing a constraint violation.
 */
export function evaluateTransition(
  from: unknown,
  to: unknown,
  context: TransitionContext
): TransitionEvaluation {
  if (!isComprehensiveEngagementState(from) || !isComprehensiveEngagementState(to)) {
    return { allowed: false, reason: 'unknown_state', message: 'Unknown Comprehensive engagement state.' };
  }

  if (COMPREHENSIVE_TERMINAL_STATES.includes(from)) {
    return {
      allowed: false,
      reason: 'terminal_state',
      message: `A Comprehensive engagement in "${from}" is closed and cannot transition further.`
    };
  }

  if (!allowedNextStates(from).includes(to)) {
    return {
      allowed: false,
      reason: 'invalid_transition',
      message: `"${from}" cannot transition to "${to}".`
    };
  }

  if (transitionRequiresNote(from, to) && !context.note?.trim()) {
    return {
      allowed: false,
      reason: 'note_required',
      message: `A note is required to move a Comprehensive engagement from "${from}" to "${to}".`
    };
  }

  if (to === 'payment_received' && !context.paymentVerified) {
    return {
      allowed: false,
      reason: 'payment_not_verified',
      message: 'Comprehensive engagements cannot record payment without valid payment-verification evidence.'
    };
  }

  if (to === 'in_review' && !context.reviewerAssigned) {
    return {
      allowed: false,
      reason: 'reviewer_not_assigned',
      message: 'A named reviewer must be assigned before a Comprehensive engagement enters review.'
    };
  }

  if (to === 'review_complete') {
    if (!context.reviewerAssigned) {
      return {
        allowed: false,
        reason: 'reviewer_not_assigned',
        message: 'A named reviewer must be assigned before review can be completed.'
      };
    }
    if (context.unreviewedEvidenceCount > 0) {
      return {
        allowed: false,
        reason: 'evidence_not_reviewed',
        message: `${context.unreviewedEvidenceCount} evidence item(s) still have no reviewer validation decision.`
      };
    }
  }

  return { allowed: true };
}
