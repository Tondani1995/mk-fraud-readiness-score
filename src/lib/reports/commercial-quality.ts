import type { AssembledReportData, RoadmapItem, SelectedContent } from './types';
import { gapKey } from './select-content-blocks';
import {
  checkQualityGates,
  PROHIBITED_GENERIC_ROADMAP_PHRASE,
  PROHIBITED_PLACEHOLDER_STRINGS
} from './evidence-model';
import type { AdvisoryEvidenceModel, CommercialQualityIssue, QualityGateResult } from './evidence-model';
import { adaptAdvisoryRoadmapToLegacyAgenda } from './roadmap';
import { RoadmapDependencyError } from './evidence-model/roadmap-dependencies';
import { buildPremiumReportEvidencePack, validatePremiumReportEvidencePack } from './automation/evidence';
import { ESSENTIAL_CAPS, type EssentialProjection } from './essential-projection';

/**
 * V7 Checkpoint B -- fail-closed commercial quality gate.
 *
 * Before Checkpoint B, report-template.ts's renderReportHtml() called the evidence-model's
 * checkQualityGates(), logged a violation via console.error on failure, and then rendered and
 * returned the HTML anyway (see the now-inverted scripts/phase-v7-checkpoint-a-quality-gate-
 * baseline-tests.mjs, which documented that exact defect). This module replaces that
 * detect-log-continue pattern with a single fail-closed assertion, assertCommercialReportQuality(),
 * used by renderReportHtml() (report-template.ts) and, through it, by the PDF-render seam
 * (render-validated-commercial-pdf.ts) and the manual generation lifecycle
 * (phase1-manual-fulfilment.ts).
 *
 * Three independent checks are combined:
 *   1. checkQualityGates() -- the pre-existing evidence-model-level checks (unchanged logic,
 *      now typed).
 *   2. validateRenderedContent() -- inspects the *exact* SelectedContent object passed to the
 *      template (new in Checkpoint B: the evidence model and the rendered content are two
 *      different objects, and only the evidence model was being checked before).
 *   3. validateRenderedRoadmap() -- inspects the *exact* roadmap.agenda array passed to the
 *      template (new in Checkpoint B: the evidence model's roadmapActions and the template's
 *      rendered roadmap.agenda are two different objects/shapes; only roadmapActions was being
 *      checked before, so the template could validate one roadmap and render a different one).
 *
 * A quality failure must occur before any PDF rendering, storage upload, storage verification, or
 * completion RPC -- see render-validated-commercial-pdf.ts and phase1-manual-fulfilment.ts.
 */

export type { CommercialQualityIssue, CommercialQualitySeverity, CommercialQualityIssueCode, QualityGateResult } from './evidence-model';

export const COMMERCIAL_QUALITY_SAFE_ADMIN_MESSAGE =
  'Report generation was blocked because the commercial quality checks failed. No new report was published. Review the quality codes and technical reference before retrying.';

/**
 * Thrown by assertCommercialReportQuality() whenever one or more blocking violations are found, or
 * whenever the quality evaluation itself throws unexpectedly. Never contains full report content,
 * generated HTML, stack traces, raw database errors, or customer data -- only typed issue codes/
 * messages (which are themselves restricted to safe internal identifiers, see CommercialQualityIssue)
 * and the fixed safe admin message above.
 */
export class ReportCommercialQualityError extends Error {
  readonly code = 'commercial_quality_failed';
  readonly violations: CommercialQualityIssue[];
  readonly warnings: CommercialQualityIssue[];
  readonly safeMessage: string;

  // Deliberately not TypeScript "parameter property" shorthand (public readonly x in the
  // constructor signature) -- explicit fields + assignment instead. This repo's committed
  // credential-free test scripts execute real source files directly via
  // `node --experimental-strip-types`, which only erases type annotations and does not support
  // parameter-property codegen (ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX). Behaviourally identical to the
  // brief's suggested contract; only the syntax differs, to keep this class importable by those
  // test scripts as well as by webpack/SWC in the real Next.js build.
  constructor(
    violations: CommercialQualityIssue[],
    warnings: CommercialQualityIssue[],
    safeMessage: string = COMMERCIAL_QUALITY_SAFE_ADMIN_MESSAGE,
    options?: { cause?: unknown }
  ) {
    super(safeMessage, options);
    this.name = 'ReportCommercialQualityError';
    this.violations = violations;
    this.warnings = warnings;
    this.safeMessage = safeMessage;
  }
}

/**
 * Recognises the stable commercial-quality error contract even when a production bundler places
 * the throwing module and the catching module in separate chunks. In that case two copies of the
 * class can exist and `instanceof` is not reliable, while the closed code/shape contract remains
 * deterministic and does not expose report content.
 */
export function isReportCommercialQualityError(error: unknown): error is ReportCommercialQualityError {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as Partial<ReportCommercialQualityError>;
  return candidate.code === 'commercial_quality_failed'
    && Array.isArray(candidate.violations)
    && Array.isArray(candidate.warnings)
    && typeof candidate.safeMessage === 'string';
}

/**
 * A single safe, persistable diagnostic derived from a commercial-quality issue.
 *
 * Deliberately narrower than CommercialQualityIssue: the `message` field is dropped entirely
 * because it interpolates finding identifiers and control names, and the report narrative must
 * never reach the diagnostics table. Only closed-vocabulary identifiers survive -- the violation
 * code, its severity, the methodology question and domain the issue attaches to, and the producing
 * subsystem. record_report_quality_diagnostics() independently rejects any other key, so this
 * shape and the database contract fail closed together.
 */
export type SafeQualityDiagnostic = {
  violation_code: string;
  severity: 'violation' | 'warning';
  question_code?: string;
  domain_code?: string;
  source?: string;
};

const FINDING_ENTITY_PATTERN = /^MF-(D\d+)-(Q\d+)$/;
const SAFE_SOURCE_PATTERN = /^[a-z][a-z0-9-]{2,63}$/;

/**
 * Maps gate issues to safe diagnostics. Material findings are identified as `MF-<questionCode>`
 * (see buildMaterialFindings in ./evidence-model/material-findings.ts), so the affected question
 * and domain can be recovered from the entity id without touching report content. Issues that
 * carry no recognisable finding id -- document-level gates such as a missing risk register -- are
 * still recorded, with no question or domain attached.
 */
export function toSafeQualityDiagnostics(
  issues: readonly CommercialQualityIssue[]
): SafeQualityDiagnostic[] {
  const diagnostics: SafeQualityDiagnostic[] = [];
  for (const issue of issues) {
    if (typeof issue?.code !== 'string' || !/^[A-Z][A-Z0-9_]{2,63}$/.test(issue.code)) continue;
    const diagnostic: SafeQualityDiagnostic = {
      violation_code: issue.code,
      severity: issue.severity === 'warning' ? 'warning' : 'violation'
    };
    const match = typeof issue.entityId === 'string' ? issue.entityId.match(FINDING_ENTITY_PATTERN) : null;
    if (match) {
      diagnostic.domain_code = match[1];
      diagnostic.question_code = `${match[1]}-${match[2]}`;
    }
    if (typeof issue.source === 'string' && SAFE_SOURCE_PATTERN.test(issue.source)) {
      diagnostic.source = issue.source;
    }
    diagnostics.push(diagnostic);
  }
  return diagnostics;
}

export interface CommercialReportPayload {
  data: AssembledReportData;
  content: SelectedContent;
  roadmap: { agenda: RoadmapItem[] };
  evidenceModel: AdvisoryEvidenceModel;
  /**
   * D6 layer 2. The EXACT bounded projection used to build the narrative brief, drive the
   * deterministic fallback and render the PDF. When present, rendered-content completeness is
   * enforced against this bounded contract rather than against the full L1 gap universe, and the
   * accepted Essential caps become fail-closed. Never recompute a second selection here.
   */
  projection?: EssentialProjection;
  /**
   * D6 layer 3. Result of reconciling the generated supporting-register artefact against
   * authoritative L1. Supplied by the generation path once the artefact bytes exist.
   */
  supportingRegister?: { reconciled: boolean; mismatches: string[] };
}

/**
 * Minimum character length for a *rendered* roadmap action (action30/action60/action90) to count
 * as a meaningful deliverable rather than a stub. Deliberately slightly stricter than the
 * evidence-model's own pre-render RoadmapAction.deliverable threshold (15 chars, evidence-model/
 * index.ts) because this checks the actual customer-facing sentence, not an internal deliverable
 * label. Documented here (rather than left as a bare magic number) because Checkpoint B explicitly
 * requires the threshold to be documented, not just applied.
 */
export const MIN_RENDERED_ROADMAP_ACTION_LENGTH = 20;

function isBlank(value: string | null | undefined): boolean {
  return value === null || value === undefined || value.trim().length === 0;
}

function containsPlaceholder(...values: (string | null | undefined)[]): boolean {
  const haystack = values.filter((v): v is string => typeof v === 'string').join('\n');
  return PROHIBITED_PLACEHOLDER_STRINGS.some((placeholder) => haystack.includes(placeholder));
}

/**
 * Validates the *exact* SelectedContent object passed to renderReportHtml() -- i.e. what the
 * template will actually render, not the pre-render evidence model. See section 5 of the
 * Checkpoint B brief. Fallback content (usedFallback: true) still counts as valid content here --
 * fallback-vs-real-content coverage thresholds belong to a later checkpoint (per the brief: "Do not
 * introduce final fallback-percentage thresholds here").
 */
export function validateRenderedContent(
  content: SelectedContent,
  data: AssembledReportData,
  projection?: EssentialProjection
): QualityGateResult {
  const violations: CommercialQualityIssue[] = [];
  const warnings: CommercialQualityIssue[] = [];

  function checkTitledSection(entityId: string, section: { title: string; body: string } | undefined) {
    if (!section) {
      violations.push({ code: 'QG_RENDERED_CONTENT_MISSING', severity: 'violation', message: `Rendered content section "${entityId}" is missing entirely.`, entityId, source: 'commercial-quality' });
      return;
    }
    if (isBlank(section.title)) {
      violations.push({ code: 'QG_RENDERED_CONTENT_TITLE_MISSING', severity: 'violation', message: `Rendered content section "${entityId}" has a blank title.`, entityId, source: 'commercial-quality' });
    }
    if (isBlank(section.body)) {
      violations.push({ code: 'QG_RENDERED_CONTENT_BODY_MISSING', severity: 'violation', message: `Rendered content section "${entityId}" has a blank body.`, entityId, source: 'commercial-quality' });
    }
    if (containsPlaceholder(section.title, section.body)) {
      violations.push({ code: 'QG_PLACEHOLDER_TEXT_PRESENT', severity: 'violation', message: `Rendered content section "${entityId}" contains prohibited placeholder text.`, entityId, source: 'commercial-quality' });
    }
  }

  // Executive summary.
  checkTitledSection('executive_summary', content?.executiveSummary);

  // False-comfort section.
  checkTitledSection('false_comfort', content?.falseComfort);

  // Leadership attention (body only -- SelectedContent.leadershipAttention has no title field).
  if (!content?.leadershipAttention) {
    violations.push({ code: 'QG_RENDERED_CONTENT_MISSING', severity: 'violation', message: 'Rendered content section "leadership_attention" is missing entirely.', entityId: 'leadership_attention', source: 'commercial-quality' });
  } else {
    if (isBlank(content.leadershipAttention.body)) {
      violations.push({ code: 'QG_RENDERED_CONTENT_BODY_MISSING', severity: 'violation', message: 'Rendered content section "leadership_attention" has a blank body.', entityId: 'leadership_attention', source: 'commercial-quality' });
    }
    if (containsPlaceholder(content.leadershipAttention.body)) {
      violations.push({ code: 'QG_PLACEHOLDER_TEXT_PRESENT', severity: 'violation', message: 'Rendered content section "leadership_attention" contains prohibited placeholder text.', entityId: 'leadership_attention', source: 'commercial-quality' });
    }
  }

  // Domain narratives -- every rendered domain must have a narrative.
  for (const domain of data.domainResults) {
    const entityId = `domain_narrative:${domain.domainName}`;
    checkTitledSection(entityId, content?.domainNarratives?.[domain.domainName]);
  }

  // Gap commentary.
  //
  // D6: when a bounded projection is supplied this iterates the EXACT selected findings that the
  // narrative brief, deterministic fallback and renderer all consume -- not the full L1 gap
  // universe. No critical or major gap is deleted by that rebind: an unselected gap's obligation
  // moves to complete deterministic representation in the L3 supporting register, which is
  // separately fail-closed below. Without a projection the legacy full-universe obligation is
  // retained unchanged.
  const gapObligations = projection
    ? projection.findings.map((finding) => ({
      domainCode: finding.domainCode,
      questionCode: finding.questionCode
    }))
    : data.criticalMajorGaps;
  for (const gap of gapObligations) {
    const key = gapKey(gap.domainCode, gap.questionCode);
    const entityId = `gap_commentary:${key}`;
    const commentary = content?.gapCommentary?.[key];
    if (!commentary) {
      violations.push({ code: 'QG_RENDERED_CONTENT_MISSING', severity: 'violation', message: `Rendered gap commentary for "${key}" is missing entirely.`, entityId, source: 'commercial-quality' });
      continue;
    }
    if (isBlank(commentary.body)) {
      violations.push({ code: 'QG_RENDERED_CONTENT_BODY_MISSING', severity: 'violation', message: `Rendered gap commentary for "${key}" has a blank body.`, entityId, source: 'commercial-quality' });
    }
    if (containsPlaceholder(commentary.body)) {
      violations.push({ code: 'QG_PLACEHOLDER_TEXT_PRESENT', severity: 'violation', message: `Rendered gap commentary for "${key}" contains prohibited placeholder text.`, entityId, source: 'commercial-quality' });
    }
  }

  return { passed: violations.length === 0, violations, warnings };
}

/**
 * Validates the *exact* roadmap.agenda array passed to renderReportHtml() -- i.e. what the
 * template will actually render via roadmapCard(), not the evidence model's separate
 * roadmapActions. See section 4 of the Checkpoint B brief. It is expected that today's report may
 * fail this gate (e.g. defaultActions() in roadmap.ts can still produce the prohibited generic
 * phrase when no matching recommendation_rule exists) -- Checkpoint B intentionally does not
 * rewrite the roadmap's content to make this pass; that belongs to a later checkpoint.
 */
export function validateRenderedRoadmap(agenda: RoadmapItem[]): QualityGateResult {
  const violations: CommercialQualityIssue[] = [];
  const warnings: CommercialQualityIssue[] = [];

  agenda.forEach((item, index) => {
    const entityId = item.ruleCode || `${item.domainName || 'unknown-domain'}:${index}`;

    if (isBlank(item.domainName)) {
      violations.push({ code: 'QG_RENDERED_ROADMAP_DOMAIN_MISSING', severity: 'violation', message: `Rendered roadmap item ${entityId} has a blank domain name.`, entityId, source: 'commercial-quality' });
    }
    if (isBlank(item.ownerRole)) {
      violations.push({ code: 'QG_RENDERED_ROADMAP_OWNER_MISSING', severity: 'violation', message: `Rendered roadmap item ${entityId} has no owner role.`, entityId, source: 'commercial-quality' });
    }
    if (isBlank(item.rationale)) {
      violations.push({ code: 'QG_RENDERED_ROADMAP_RATIONALE_MISSING', severity: 'violation', message: `Rendered roadmap item ${entityId} has a blank rationale.`, entityId, source: 'commercial-quality' });
    }

    const actions = [item.action30, item.action60, item.action90];
    const populatedActions = actions.filter((action): action is string => !isBlank(action));

    if (populatedActions.length === 0) {
      violations.push({ code: 'QG_RENDERED_ROADMAP_ACTION_MISSING', severity: 'violation', message: `Rendered roadmap item ${entityId} has no action30, action60 or action90.`, entityId, source: 'commercial-quality' });
    }

    for (const action of populatedActions) {
      if (action.includes(PROHIBITED_GENERIC_ROADMAP_PHRASE)) {
        violations.push({ code: 'QG_RENDERED_ROADMAP_GENERIC_LANGUAGE', severity: 'violation', message: `Rendered roadmap item ${entityId} uses the prohibited generic template sentence.`, entityId, source: 'commercial-quality' });
      }
      if (action.trim().length < MIN_RENDERED_ROADMAP_ACTION_LENGTH) {
        violations.push({ code: 'QG_RENDERED_ROADMAP_ACTION_TOO_SHORT', severity: 'violation', message: `Rendered roadmap item ${entityId} has an action shorter than the ${MIN_RENDERED_ROADMAP_ACTION_LENGTH}-character minimum: "${action}".`, entityId, source: 'commercial-quality' });
      }
    }
  });

  return { passed: violations.length === 0, violations, warnings };
}

/** Ensures the rendered compatibility shape is a pure projection of the authoritative roadmap. */
export function validateRoadmapSource(
  agenda: RoadmapItem[],
  model: AdvisoryEvidenceModel,
  projection?: EssentialProjection
): QualityGateResult {
  // Bounded Essential: the authoritative roadmap source is the SAME shared projection the renderer
  // consumed -- its dependency-closed selection -- not the full L1 register. Comparing a bounded
  // rendered roadmap against all of L1 would fail every Essential report, and truncating after
  // validation would defeat the control. L1 itself is untouched; legacy/non-Essential paths keep
  // validating against the complete model exactly as before.
  const authoritativeActions = projection ? projection.roadmapActions : model.roadmapActions;
  let expected: RoadmapItem[];
  try {
    expected = adaptAdvisoryRoadmapToLegacyAgenda(authoritativeActions).agenda;
  } catch (error) {
    if (!(error instanceof RoadmapDependencyError)) throw error;
    return {
      passed: false,
      violations: [{
        code: 'QG_ROADMAP_DEPENDENCY_INVALID',
        severity: 'violation',
        message: error.message,
        source: 'commercial-quality'
      }],
      warnings: []
    };
  }
  const normalise = (items: RoadmapItem[]) => items.map((item) => ({
    ruleCode: item.ruleCode,
    domainCode: item.domainCode,
    domainName: item.domainName,
    ownerRole: item.ownerRole,
    rationale: item.rationale,
    severity: item.severity,
    action30: item.action30,
    action60: item.action60,
    action90: item.action90,
    priorityScore: item.priorityScore,
    authoritativeActionIds: item.authoritativeActionIds ?? []
  }));
  const matches = JSON.stringify(normalise(agenda)) === JSON.stringify(normalise(expected));
  const violations: CommercialQualityIssue[] = matches ? [] : [{
    code: 'QG_ROADMAP_SOURCE_MISMATCH',
    severity: 'violation',
    message: 'Rendered legacy roadmap does not match the authoritative AdvisoryEvidenceModel roadmap actions.',
    source: 'commercial-quality'
  }];
  return { passed: matches, violations, warnings: [] };
}

/**
 * The single fail-closed assertion Checkpoint B requires. Builds/consumes the same evidence-model
 * instance used for rendering (never a second, validation-only model), evaluates all three checks
 * above, and:
 *   - returns normally (with any warnings attached) when there are zero violations;
 *   - throws ReportCommercialQualityError when there is one or more violation;
 *   - throws ReportCommercialQualityError with a single QG_QUALITY_EVALUATION_FAILED violation if
 *     the evaluation itself throws unexpectedly (never catches and continues).
 */
/**
 * D6 layer 2 -- bounded volume. Fail-closed on any main-report list exceeding its accepted cap.
 * The existing QG_COMMERCIAL_VOLUME_WARNING enforces a *minimum* substantive volume; this is its
 * missing upper bound, and it is a violation rather than a warning.
 */
export function validateBoundedVolume(projection: EssentialProjection): QualityGateResult {
  const violations: CommercialQualityIssue[] = [];
  const systemic = projection.systemic.systemic;
  const limits: Array<[string, number, number]> = [
    ['findings', projection.findings.length, systemic ? ESSENTIAL_CAPS.findingsSystemic : ESSENTIAL_CAPS.findings],
    ['risks', projection.risks.length, ESSENTIAL_CAPS.risks],
    ['control_action_records', projection.controlActionRecords.length, systemic ? ESSENTIAL_CAPS.controlActionRecordsSystemic : ESSENTIAL_CAPS.controlActionRecords],
    ['scenarios', projection.scenarios.length, systemic ? ESSENTIAL_CAPS.scenariosSystemic : ESSENTIAL_CAPS.scenarios],
    ['evidence_to_obtain', projection.evidenceToObtain.length, ESSENTIAL_CAPS.evidenceToObtain],
    ['leadership_decisions', projection.leadershipDecisions.length, ESSENTIAL_CAPS.leadershipDecisions],
    ['roadmap_actions', projection.roadmapActions.length, ESSENTIAL_CAPS.roadmapTotalCeiling],
    ['appendix_control_action_records', projection.appendixControlActionRecords.length, ESSENTIAL_CAPS.appendixControlActionRecords]
  ];
  for (const [entityId, actual, cap] of limits) {
    if (actual > cap) {
      violations.push({
        code: 'QG_COMMERCIAL_VOLUME_EXCEEDED',
        severity: 'violation',
        message: `Bounded Essential contract exceeded for ${entityId}: ${actual} present, maximum ${cap}.`,
        entityId,
        source: 'commercial-quality'
      });
    }
  }
  return { passed: violations.length === 0, violations, warnings: [] };
}

/**
 * D6 layer 3 -- supporting-register completeness. The reconciliation itself is performed against
 * the generated artefact bytes by the caller; this turns any mismatch into a release-blocking
 * commercial-quality violation so a bounded report can never claim supporting detail that the
 * delivered register does not physically contain.
 */
export function validateSupportingRegister(
  result: { reconciled: boolean; mismatches: string[] } | undefined
): QualityGateResult {
  if (!result) return { passed: true, violations: [], warnings: [] };
  if (result.reconciled) return { passed: true, violations: [], warnings: [] };
  return {
    passed: false,
    violations: result.mismatches.slice(0, 24).map((mismatch) => ({
      code: 'QG_SUPPORTING_REGISTER_INCOMPLETE' as const,
      severity: 'violation' as const,
      message: `Supporting register does not reconcile against the authoritative evidence model: ${mismatch}.`,
      entityId: mismatch.split(':')[0],
      source: 'commercial-quality'
    })),
    warnings: []
  };
}

export function assertCommercialReportQuality(payload: CommercialReportPayload): QualityGateResult {
  let violations: CommercialQualityIssue[];
  let warnings: CommercialQualityIssue[];

  try {
    const evidenceGate = checkQualityGates(payload.evidenceModel, payload.data);
    const contentGate = validateRenderedContent(payload.content, payload.data, payload.projection);
    const volumeGate = payload.projection
      ? validateBoundedVolume(payload.projection)
      : { passed: true, violations: [], warnings: [] };
    const registerGate = validateSupportingRegister(payload.supportingRegister);
    const roadmapGate = validateRenderedRoadmap(payload.roadmap.agenda);
    const roadmapSourceGate = validateRoadmapSource(payload.roadmap.agenda, payload.evidenceModel, payload.projection);
    const aiEvidenceIssues = validatePremiumReportEvidencePack(
      buildPremiumReportEvidencePack(payload.data, payload.evidenceModel, undefined, payload.projection),
      [payload.data.customerEmail, payload.data.respondentName]
    );

    violations = [...evidenceGate.violations, ...contentGate.violations, ...roadmapGate.violations, ...roadmapSourceGate.violations, ...volumeGate.violations, ...registerGate.violations, ...aiEvidenceIssues];
    warnings = [...evidenceGate.warnings, ...contentGate.warnings, ...roadmapGate.warnings];
  } catch (error) {
    const evaluationFailure: CommercialQualityIssue = {
      code: 'QG_QUALITY_EVALUATION_FAILED',
      severity: 'violation',
      message: error instanceof Error
        ? `Commercial quality evaluation threw an unexpected error: ${error.message}`
        : 'Commercial quality evaluation threw an unexpected, non-Error exception.',
      source: 'commercial-quality'
    };
    throw new ReportCommercialQualityError([evaluationFailure], [], COMMERCIAL_QUALITY_SAFE_ADMIN_MESSAGE, { cause: error });
  }

  if (violations.length > 0) {
    throw new ReportCommercialQualityError(violations, warnings, COMMERCIAL_QUALITY_SAFE_ADMIN_MESSAGE);
  }

  return { passed: true, violations: [], warnings };
}
