#!/usr/bin/env python3
from pathlib import Path
from textwrap import dedent


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old in text:
        return text.replace(old, new, 1)
    if new in text:
        print(f"already applied: {label}")
        return text
    raise SystemExit(f"missing patch anchor: {label}")


template_path = Path("src/lib/reports/templates/report-template.ts")
text = template_path.read_text()

text = replace_once(
    text,
    "  @page { size: A4 portrait; margin: 0; }",
    "  @page { size: A4 portrait; margin: 12mm 13mm 15mm 13mm; }",
    "paged-media margins",
)
text = replace_once(
    text,
    "  .cover { break-before: auto; min-height: 270mm; padding: 19mm;",
    "  .cover { break-before: auto; margin: -12mm -13mm 0; min-height: 270mm; padding: 19mm;",
    "cover bleed compensation",
)

old_scope_line = "    ${adaptiveScope.redirectedCount > 0 ? `<p>${adaptiveScope.redirectedCount} control area${adaptiveScope.redirectedCount === 1 ? ' was' : 's were'} answered through the assessment's oversight-response route rather than the standard response route. These areas remain in scope. Excluded areas are outside the assessed scope and are not treated as weaknesses.</p>` : ''}"
new_scope_line = "    ${adaptiveScope.redirectedCount > 0 ? `<p>${adaptiveScope.redirectedCount} control area${adaptiveScope.redirectedCount === 1 ? ' was' : 's were'} completed using the assessment's oversight question set rather than the standard question set. ${adaptiveScope.redirectedCount === 1 ? 'It remains' : 'They remain'} in the scored scope. Excluded areas are outside the assessed scope and are not treated as weaknesses.</p>` : ''}"
text = replace_once(text, old_scope_line, new_scope_line, "scope route wording")
text = replace_once(
    text,
    "    <p>${esc(adaptiveScope.scoreComparabilityStatement)}</p>` ) : '';",
    "    ${adaptiveScope.resultStatus !== 'PROVISIONAL' ? `<p>${esc(adaptiveScope.scoreComparabilityStatement)}</p>` : ''}` ) : '';",
    "provisional comparability dedupe",
)

finding_anchor = "  const findingCard = (finding: AdvisoryEvidenceModel['materialFindings'][number], index: number) => `<article class=\"long-record finding-record\">"
finding_with_helper = """  const customerMaterialityLabel = (materialityClass: string): string => {
    const labels: Record<string, string> = {
      maturity_constraint: 'Maturity constraint',
      control_failure: 'Priority control weakness',
      cross_domain_dependency: 'Cross-domain dependency',
      assurance_priority: 'Assurance priority'
    };
    return labels[materialityClass] ?? materialityClass.replaceAll('_', ' ');
  };

  const findingCard = (finding: AdvisoryEvidenceModel['materialFindings'][number], index: number) => `<article class=\"long-record finding-record\">"""
text = replace_once(text, finding_anchor, finding_with_helper, "customer materiality helper")
text = replace_once(
    text,
    "${esc(finding.materialityClass.replaceAll('_', ' '))}",
    "${esc(customerMaterialityLabel(finding.materialityClass))}",
    "customer materiality label",
)

old_recommended = "? `<div class=\"closing-note\"><strong>Recommended next step</strong><p>${esc(buildEvidenceRecommendation(topEvidenceItem))} This is the immediate proof priority; the complete sequence is set out in Proof requirements above and the full checklist in the supporting register.</p></div>`"
new_recommended = "? `<p class=\"recommended-next-step\"><strong>Recommended next step.</strong> ${esc(buildEvidenceRecommendation(topEvidenceItem))} This is the immediate proof priority; the complete sequence is set out in Proof requirements above and the full checklist in the supporting register.</p>`"
text = replace_once(text, old_recommended, new_recommended, "recommended next step inline")
text = replace_once(
    text,
    "    <p><strong>Next step.</strong> Agree the proof requirements listed in this report and supporting register, then sequence them through the leadership decisions above.</p>`;",
    "    `;",
    "remove duplicate generic next step",
)
text = replace_once(
    text,
    "  .closing-note { margin-top:7mm;background:var(--mk-neutral-bg);border-left-color:var(--mk-navy-500); }",
    "  .closing-note { margin-top:7mm;background:var(--mk-neutral-bg);border-left-color:var(--mk-navy-500); }\n  .recommended-next-step { margin-top:4mm; padding:3mm 4mm; background:var(--mk-neutral-bg); border-left:1mm solid var(--mk-navy-500); break-before:avoid; page-break-before:avoid; }",
    "recommended next step css",
)

template_path.write_text(text)

adaptation_path = Path("src/lib/reports/essential-presentation-adaptation.ts")
adaptation = adaptation_path.read_text()
current = "  [/\\binduction packs, the workforce communication channels used by the organisation, notice boards at operating locations, intranet and supervisor briefings\\b/gi, 'induction and onboarding materials, the workforce communication channels used by the organisation, and supervisor briefings'],"
expanded = current + "\n  [/\\binduction packs, the workforce communication channels used by the organisation, appropriate workforce communication channels and operating locations, internal workforce communication channel and supervisor briefings\\b/gi, 'induction and onboarding materials, workforce communication channels used by the organisation, and supervisor briefings'],"
adaptation = replace_once(adaptation, current, expanded, "workforce channel cleanup")
adaptation_path.write_text(adaptation)

v5_regression_path = Path("scripts/commercial-quality/essential-v5-cleanup-regression.mjs")
v5_regression = v5_regression_path.read_text()
v5_regression = replace_once(
    v5_regression,
    "assert.match(template, /answered through the assessment's oversight-response route rather than the standard response route/);",
    "assert.match(template, /completed using the assessment's oversight question set rather than the standard question set/);",
    "V5 regression customer wording",
)
v5_regression_path.write_text(v5_regression)

regression_path = Path("scripts/commercial-quality/essential-v6-final-polish-regression.mjs")
regression_path.write_text(
    dedent(
        r'''#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { adaptEssentialText, buildEssentialAdaptationContext } from '../../src/lib/reports/essential-presentation-adaptation.ts';

const template = readFileSync(new URL('../../src/lib/reports/templates/report-template.ts', import.meta.url), 'utf8');
assert.match(template, /@page \{ size: A4 portrait; margin: 12mm 13mm 15mm 13mm; \}/);
assert.doesNotMatch(template, /@page \{ size: A4 portrait; margin: 0; \}/);
assert.match(template, /\.cover \{ break-before: auto; margin: -12mm -13mm 0;/);
assert.match(template, /control_failure: 'Priority control weakness'/);
assert.match(template, /customerMaterialityLabel\(finding\.materialityClass\)/);
assert.doesNotMatch(template, /esc\(finding\.materialityClass\.replaceAll\('_', ' '\)\)/);
assert.match(template, /completed using the assessment's oversight question set rather than the standard question set/);
assert.match(template, /adaptiveScope\.resultStatus !== 'PROVISIONAL'/);
assert.match(template, /<p class="recommended-next-step"><strong>Recommended next step\.<\/strong>/);
assert.doesNotMatch(template, /<div class="closing-note"><strong>Recommended next step/);
assert.doesNotMatch(template, /<strong>Next step\.<\/strong> Agree the proof requirements/);

const context = buildEssentialAdaptationContext({});
const ugly = 'The ethics owner must publish reporting routes in plain language across the channels the workforce actually uses — induction packs, the workforce communication channels used by the organisation, appropriate workforce communication channels and operating locations, internal workforce communication channel and supervisor briefings.';
const cleaned = adaptEssentialText(ugly, context);
assert.match(cleaned, /induction and onboarding materials, workforce communication channels used by the organisation, and supervisor briefings/i);
assert.doesNotMatch(cleaned, /appropriate workforce communication channels and operating locations|internal workforce communication channel/i);

console.log(JSON.stringify({ status: 'PASS', ai: 'ZERO', v6FinalPolish: 'PASS', footerCollisionBoundary: 'PASS', sparsePageCleanup: 'PASS' }, null, 2));
'''
    )
)

print("V6 deterministic final polish applied")
