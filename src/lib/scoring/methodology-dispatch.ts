import { calculateFraudReadinessScore } from './scoring-engine';

/**
 * Methodology-version dispatch.
 *
 * Every score run must be calculated by the calculator of the methodology the assessment recorded, and only that one.
 * The family is resolved from the assessment's own record, never from what is currently active:
 *
 *   assessments.assessment_mode          'legacy_fixed' or 'adaptive' (the column and its check constraint exist)
 *   methodology_versions.version_code    through assessments.methodology_version_id
 *   adaptive_graph_versions              through assessments.graph_version_id, with the graph version and fingerprint
 *                                        snapshotted on the assessment when it started
 *   a review-engine ruleset              recorded by a revised (review bank) assessment
 *
 * A version code alone is not enough: MFRS-V1.1 is both the fixed method and the methodology of the adaptive V1.1 draft
 * graph, so the mode and the graph pin must agree with it. Anything that does not resolve to exactly one registered
 * family fails closed with a reason; nothing falls through to the fixed calculator.
 *
 * The existing entry points are the fixed submit route, the adaptive submit route and the admin scoring route; today
 * each calls its scorer directly, and the admin route always calls the fixed scorer whatever the assessment's mode.
 * `dispatchSubmittedAssessmentScoring` is the single entry point they would call instead. Those routes and both scorers
 * are protected by the integrity guard and are unchanged; switching the routes to this entry point is a release step for
 * MK, not part of this prototype. The revised family is registered so that it can never reach an MFRS calculator, and it
 * refuses to score until MK approves a method.
 */
export type MethodologyFamily = 'mfrs-fixed' | 'mfrs-adaptive' | 'revised-review';

export const REVISED_METHODOLOGY_STATUS = {
  active: false,
  reason: 'No revised scoring method is approved by MK. The revised family is registered so that it can never fall through to an MFRS calculator, and it refuses to score.'
} as const;

export class RevisedMethodologyInactive extends Error {}

/** Methodology versions the fixed calculator was built for. */
export const FIXED_METHODOLOGY_CODES = ['MFRS-V1.0', 'MFRS-V1.1'] as const;
/** Adaptive graphs, each pinned to the methodology version it was compiled against (from the repository migrations). */
export const ADAPTIVE_GRAPH_REGISTRY: Readonly<Record<string, { methodologyVersionCode: string }>> = {
  'MFRS-V1.1-ADAPTIVE-DRAFT-20260804': { methodologyVersionCode: 'MFRS-V1.1' },
  'MFRS-V1.2-ADAPTIVE-CANDIDATE-20260821': { methodologyVersionCode: 'MFRS-V1.2-CANDIDATE-OWNER-CORRECTION' }
};

/** What the assessment recorded, as it is stored. Every field is read from the assessment's own rows. */
export type RecordedMethodology = {
  assessmentReference: string;
  assessmentMode: string | null;
  methodologyVersionId: string | null;
  /** methodology_versions.version_code for methodologyVersionId; null if the row was not found. */
  methodologyVersionCode: string | null;
  graphVersionId: string | null;
  graphVersionSnapshot: string | null;
  graphFingerprintSnapshot: string | null;
  /** The adaptive_graph_versions row for graphVersionId; null if there is none. */
  graph: { id: string; graphVersion: string; methodologyVersionId: string; methodologyVersion: string; graphFingerprint: string; status: string } | null;
  /** A revised assessment records the review engine's ruleset. */
  reviewRuleset?: { engine?: { build?: string } } | null;
};

export type DispatchRefusal =
  | 'assessment_not_found' | 'unknown_assessment_mode' | 'methodology_version_not_found' | 'unregistered_methodology_version'
  | 'fixed_assessment_with_graph_pin' | 'adaptive_assessment_without_graph_pin' | 'graph_not_found' | 'unregistered_graph_version'
  | 'graph_methodology_mismatch' | 'graph_snapshot_mismatch' | 'graph_fingerprint_mismatch' | 'revised_methodology_inactive';

export type ResolvedRoute =
  | { ok: true; family: 'mfrs-fixed'; methodologyVersionCode: string }
  | { ok: true; family: 'mfrs-adaptive'; methodologyVersionCode: string; graphVersion: string; graphFingerprint: string }
  | { ok: false; family: MethodologyFamily | null; refusal: DispatchRefusal; detail: string };

const refuse = (refusal: DispatchRefusal, detail: string, family: MethodologyFamily | null = null): ResolvedRoute => ({ ok: false, family, refusal, detail });

/** Resolves the one calculator family the recorded methodology allows, or refuses with the reason. Pure. */
export function resolveMethodologyRoute(record: RecordedMethodology | null): ResolvedRoute {
  if (!record) return refuse('assessment_not_found', 'No assessment record.');
  if (record.reviewRuleset) return refuse('revised_methodology_inactive', REVISED_METHODOLOGY_STATUS.reason, 'revised-review');
  if (!record.methodologyVersionId || !record.methodologyVersionCode) return refuse('methodology_version_not_found', `Assessment ${record.assessmentReference} has no resolvable methodology version.`);
  const code = record.methodologyVersionCode;
  if (record.assessmentMode === 'legacy_fixed') {
    if (record.graphVersionId || record.graphVersionSnapshot || record.graphFingerprintSnapshot) return refuse('fixed_assessment_with_graph_pin', 'A fixed assessment carries an adaptive graph pin.', 'mfrs-fixed');
    if (!(FIXED_METHODOLOGY_CODES as readonly string[]).includes(code)) return refuse('unregistered_methodology_version', `${code} is not a fixed MFRS methodology version.`, 'mfrs-fixed');
    return { ok: true, family: 'mfrs-fixed', methodologyVersionCode: code };
  }
  if (record.assessmentMode === 'adaptive') {
    if (!record.graphVersionId || !record.graphVersionSnapshot || !record.graphFingerprintSnapshot) return refuse('adaptive_assessment_without_graph_pin', 'An adaptive assessment must carry its graph version id, version and fingerprint.', 'mfrs-adaptive');
    const g = record.graph;
    if (!g || g.id !== record.graphVersionId) return refuse('graph_not_found', `Graph ${record.graphVersionId} was not found.`, 'mfrs-adaptive');
    const registered = ADAPTIVE_GRAPH_REGISTRY[g.graphVersion];
    if (!registered) return refuse('unregistered_graph_version', `${g.graphVersion} is not a registered adaptive graph.`, 'mfrs-adaptive');
    if (g.methodologyVersionId !== record.methodologyVersionId || g.methodologyVersion !== code || registered.methodologyVersionCode !== code) {
      return refuse('graph_methodology_mismatch', `Graph ${g.graphVersion} belongs to ${g.methodologyVersion}; the assessment recorded ${code}.`, 'mfrs-adaptive');
    }
    if (g.graphVersion !== record.graphVersionSnapshot) return refuse('graph_snapshot_mismatch', 'The graph row differs from the version the assessment started on.', 'mfrs-adaptive');
    if (g.graphFingerprint !== record.graphFingerprintSnapshot) return refuse('graph_fingerprint_mismatch', 'The graph fingerprint differs from the one the assessment started on.', 'mfrs-adaptive');
    return { ok: true, family: 'mfrs-adaptive', methodologyVersionCode: code, graphVersion: g.graphVersion, graphFingerprint: g.graphFingerprint };
  }
  return refuse('unknown_assessment_mode', `Assessment mode ${String(record.assessmentMode)} is not registered.`);
}

type ScoreOptions = { runType?: 'initial' | 'admin_recalc' | 'correction_recalc'; createdByAdminId?: string | null };
type ScoreOutcome = { ok: boolean; status?: number; errors?: string[] } & Record<string, unknown>;
export type DispatchDependencies = {
  loadRecordedMethodology: (assessmentReference: string) => Promise<RecordedMethodology | null>;
  scoreFixed: (assessmentReference: string, options: ScoreOptions) => Promise<ScoreOutcome>;
  scoreAdaptive: (assessmentReference: string, options: ScoreOptions) => Promise<ScoreOutcome>;
};

/**
 * The single scoring entry point: resolve the recorded methodology, then call that family's unchanged scorer. A refusal
 * calls no scorer and is returned as a conflict with its reason, so a route can report it exactly as it reports other
 * scoring refusals today.
 */
export async function dispatchSubmittedAssessmentScoring(assessmentReference: string, options: ScoreOptions, deps: DispatchDependencies) {
  const route = resolveMethodologyRoute(await deps.loadRecordedMethodology(assessmentReference));
  if (!route.ok) return { ok: false as const, status: route.refusal === 'assessment_not_found' ? 404 : 409, errors: [`methodology_dispatch_refused:${route.refusal}`], route };
  const outcome = route.family === 'mfrs-fixed' ? await deps.scoreFixed(assessmentReference, options) : await deps.scoreAdaptive(assessmentReference, options);
  return { ...outcome, route };
}

/**
 * Production loader for the record, reading only the columns the resolution needs. Not called by any route yet.
 * `db` is a service-role Supabase client.
 */
export async function loadRecordedMethodologyFromDb(db: any, assessmentReference: string): Promise<RecordedMethodology | null> {
  const { data: a, error } = await db.from('assessments')
    .select('assessment_reference,assessment_mode,methodology_version_id,graph_version_id,graph_version_snapshot,graph_fingerprint_snapshot')
    .eq('assessment_reference', assessmentReference).maybeSingle();
  if (error) throw error;
  if (!a) return null;
  const [{ data: mv, error: mvError }, graphResult] = await Promise.all([
    db.from('methodology_versions').select('id,version_code').eq('id', a.methodology_version_id).maybeSingle(),
    a.graph_version_id
      ? db.from('adaptive_graph_versions').select('id,graph_version,methodology_version_id,methodology_version,graph_fingerprint,status').eq('id', a.graph_version_id).maybeSingle()
      : Promise.resolve({ data: null, error: null })
  ]);
  if (mvError || graphResult.error) throw mvError ?? graphResult.error;
  const g = graphResult.data;
  return {
    assessmentReference: a.assessment_reference, assessmentMode: a.assessment_mode, methodologyVersionId: a.methodology_version_id, methodologyVersionCode: mv?.version_code ?? null,
    graphVersionId: a.graph_version_id ?? null, graphVersionSnapshot: a.graph_version_snapshot ?? null, graphFingerprintSnapshot: a.graph_fingerprint_snapshot ?? null,
    graph: g ? { id: g.id, graphVersion: g.graph_version, methodologyVersionId: g.methodology_version_id, methodologyVersion: g.methodology_version, graphFingerprint: g.graph_fingerprint, status: g.status } : null,
    reviewRuleset: null
  };
}

// ------------------------------------------------------------------------------------------------ pure calculator parity

/** @deprecated Superseded by `resolveMethodologyRoute`; kept so the parity fixtures pinned at 3f933ac keep running. */
export function methodologyFamilyFor(input: { reviewRuleset?: { engine?: { build?: string } } | null; graphVersionId?: string | null }): MethodologyFamily {
  if (input.reviewRuleset) return 'revised-review';
  return input.graphVersionId ? 'mfrs-adaptive' : 'mfrs-fixed';
}

type FixedInput = Parameters<typeof calculateFraudReadinessScore>[0];

/** The fixed calculator behind the dispatch, for parity tests. Refuses the revised and adaptive families. */
export function dispatchFixedScoring(family: MethodologyFamily, input: FixedInput) {
  if (family === 'revised-review') throw new RevisedMethodologyInactive(REVISED_METHODOLOGY_STATUS.reason);
  if (family !== 'mfrs-fixed') throw new Error(`The ${family} family is not scored through the fixed MFRS path.`);
  return calculateFraudReadinessScore(input);
}
