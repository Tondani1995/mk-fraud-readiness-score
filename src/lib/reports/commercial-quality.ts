import type { AssembledReportData, RoadmapItem, SelectedContent } from './types';
import { gapKey } from './select-content-blocks';
import {
  checkQualityGates,
  PROHIBITED_GENERIC_ROADMAP_PHRASE,
  PROHIBITED_PLACEHOLDER_STRINGS
} from './evidence-model';
import type { AdvisoryEvidenceModel, CommercialQualityIssue, QualityGateResult } from './evidence-model';
import { adaptAdvisoryRoadmapToLegacyAgenda } from './roadmap';
import { buildPremiumReportEvidencePack, validatePremiumReportEvidencePack } from './automation/evidence';

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

export interface CommercialReportPayload {
  data: AssembledReportData;
  content: SelectedContent;
  roadmap: { agenda: RoadmapItem[] };
  evidenceModel: AdvisoryEvidenceModel;
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
export function validateRenderedContent(content: SelectedContent, data: AssembledReportData): QualityGateResult {
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

  // Gap commentary -- every rendered critical or major gap must have commentary.
  for (const gap of data.criticalMajorGaps) {
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
export function validateRoadmapSource(agenda: RoadmapItem[], model: AdvisoryEvidenceModel): QualityGateResult {
  const expected = adaptAdvisoryRoadmapToLegacyAgenda(model.roadmapActions).agenda;
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
export function assertCommercialReportQuality(payload: CommercialReportPayload): QualityGateResult {
  let violations: CommercialQualityIssue[];
  let warnings: CommercialQualityIssue[];

  try {
    const evidenceGate = checkQualityGates(payload.evidenceModel, payload.data);
    const contentGate = validateRenderedContent(payload.content, payload.data);
    const roadmapGate = validateRenderedRoadmap(payload.roadmap.agenda);
    const roadmapSourceGate = validateRoadmapSource(payload.roadmap.agenda, payload.evidenceModel);
    const aiEvidenceIssues = validatePremiumReportEvidencePack(
      buildPremiumReportEvidencePack(payload.data, payload.evidenceModel),
      [payload.data.customerEmail, payload.data.respondentName]
    );

    violations = [...evidenceGate.violations, ...contentGate.violations, ...roadmapGate.violations, ...roadmapSourceGate.violations, ...aiEvidenceIssues];
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
