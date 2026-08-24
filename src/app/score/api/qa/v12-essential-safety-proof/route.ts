import { NextResponse } from 'next/server';
import { adjudicateTextFirstValidation, essentialCandidateId } from '@/lib/reports/essential-validation-cascade';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function minimalParsed(text: string) {
  return {
    ok: true as const,
    markdown: text,
    errors: [],
    chapters: [{
      chapterId: 'C',
      title: 'C',
      sections: [{
        chapterId: 'C',
        sectionId: 'SEC',
        title: 'Section',
        paragraphs: [{ text, permittedClaimRefs: [] }],
        subsections: [],
        permittedClaimRefs: []
      }]
    }]
  };
}

function cleanReport() {
  return {
    ok: true,
    hardTruth: { status: 'PASS' as const, issues: [] },
    semanticCandidates: { status: 'PASS' as const, issues: [] },
    repairableSemantic: { status: 'PASS' as const, issues: [] },
    quality: { status: 'PASS' as const, issues: [] },
    sectionCount: 1,
    subsectionCount: 0,
    paragraphCount: 1
  };
}

function run(text: string, disposition: 'ALLOW' | 'REPAIR' | 'REJECT' | 'HOLD', reasonCode: string) {
  const path = 'SEC.paragraphs[0]';
  const candidateId = essentialCandidateId('semantic_grounding_block', path, text);
  const result = adjudicateTextFirstValidation({
    parsed: minimalParsed(text),
    report: cleanReport(),
    factPack: { facts: [] } as any,
    requireSemanticReviewer: true,
    semanticGroundingBlocks: [{ path, span: text }],
    semanticDecisions: [{ candidateId, disposition, reasonCode }]
  });
  return {
    publishable: result.publishable,
    finalDisposition: result.candidates[0]?.finalDisposition,
    blockingCodes: result.blockingCodes,
    heldForReviewCodes: result.heldForReviewCodes,
    decisions: result.candidates[0]?.decisions
  };
}

export function GET() {
  const safeReject = run(
    'Management should obtain independent review of refund and override activity before closure.',
    'REJECT',
    'unsupported_assurance'
  );
  const unsafeAllow = run(
    'This report provides independent assurance that the controls are effective.',
    'ALLOW',
    'grounded'
  );
  const ratherThanLimitation = run(
    'The assessment reflects management’s own responses and the MK scoring method rather than independent verification of operating effectiveness.',
    'ALLOW',
    'grounded'
  );
  const boundedRelativeStrengthRepair = run(
    'Whistleblowing and Reporting Culture is a comparatively stronger self-assessed area and represents the clearest positive signal in the profile.',
    'REPAIR',
    'repairable_overstatement'
  );
  const prescriptiveOperatingReject = run(
    'By 60 days establish the evidence register, adopt chain-of-custody forms and place preserved items in an access-controlled repository.',
    'REJECT',
    'unsupported_operating_detail'
  );
  const intraProfileStructureRepair = run(
    'The strongest reported position appears in Digital and Identity Fraud Risk, while Operational Fraud Controls and Third-Party and Supply Chain Fraud Risk are also comparatively higher than other domains; by contrast, Fraud Leadership and Governance is materially weaker in the self-assessment profile.',
    'REPAIR',
    'unsupported_structure'
  );
  const inventedStructureRepair = run(
    'The fraud team is structurally stronger than the finance department within this domain profile.',
    'REPAIR',
    'unsupported_structure'
  );
  const unconfirmedReject = run(
    'The finance team performs daily exception reviews across all sites.',
    'REJECT',
    'unsupported_frequency'
  );

  const pass = safeReject.publishable === true
    && safeReject.finalDisposition === 'ACCEPT'
    && prescriptiveOperatingReject.publishable === true
    && prescriptiveOperatingReject.finalDisposition === 'ACCEPT'
    && intraProfileStructureRepair.publishable === true
    && intraProfileStructureRepair.finalDisposition === 'ACCEPT'
    && inventedStructureRepair.publishable === false
    && inventedStructureRepair.finalDisposition === 'REPAIR'
    && unsafeAllow.publishable === false
    && unsafeAllow.finalDisposition === 'REJECT'
    && ratherThanLimitation.publishable === true
    && ratherThanLimitation.finalDisposition === 'ACCEPT'
    && boundedRelativeStrengthRepair.publishable === true
    && boundedRelativeStrengthRepair.finalDisposition === 'ACCEPT'
    && unconfirmedReject.publishable === false
    && unconfirmedReject.finalDisposition === 'HELD_FOR_REVIEW'
    && unconfirmedReject.blockingCodes.length === 0;

  return NextResponse.json({
    ok: pass,
    policy: 'semantic-review-advisory-to-five-layer-cascade',
    safeReviewerReject: safeReject,
    prescriptiveOperatingReject,
    intraProfileStructureRepair,
    inventedStructureRepair,
    unsafeReviewerAllow: unsafeAllow,
    ratherThanAssuranceLimitation: ratherThanLimitation,
    boundedRelativeStrengthRepair,
    unconfirmedReviewerReject: unconfirmedReject
  }, { status: pass ? 200 : 500, headers: { 'Cache-Control': 'no-store' } });
}
