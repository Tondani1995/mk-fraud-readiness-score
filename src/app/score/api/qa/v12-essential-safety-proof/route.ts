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

function run(text: string, disposition: 'ALLOW' | 'REJECT' | 'HOLD', reasonCode: string) {
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
  const unconfirmedReject = run(
    'The finance team performs daily exception reviews across all sites.',
    'REJECT',
    'unsupported_frequency'
  );

  const pass = safeReject.publishable === true
    && safeReject.finalDisposition === 'ACCEPT'
    && unsafeAllow.publishable === false
    && unsafeAllow.finalDisposition === 'REJECT'
    && unconfirmedReject.publishable === false
    && unconfirmedReject.finalDisposition === 'HELD_FOR_REVIEW'
    && unconfirmedReject.blockingCodes.length === 0;

  return NextResponse.json({
    ok: pass,
    policy: 'semantic-review-advisory-to-five-layer-cascade',
    safeReviewerReject: safeReject,
    unsafeReviewerAllow: unsafeAllow,
    unconfirmedReviewerReject: unconfirmedReject
  }, { status: pass ? 200 : 500, headers: { 'Cache-Control': 'no-store' } });
}
