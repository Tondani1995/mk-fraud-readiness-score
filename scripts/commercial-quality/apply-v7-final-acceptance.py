#!/usr/bin/env python3
from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old in text:
        return text.replace(old, new, 1)
    if new in text:
        print(f"already applied: {label}")
        return text
    raise SystemExit(f"missing patch anchor: {label}")


# 1) Executive assurance copy: consume the optional trailing object of "verification" so
# "not independent verification of operating effectiveness" cannot become
# "without verification ... by this review of operating effectiveness".
assurance_path = Path("src/lib/reports/narrative/assurance-boundary-normalisation.ts")
assurance = assurance_path.read_text()
assurance = replace_once(
    assurance,
    "    pattern: /\\bnot\\s+(?:an?\\s+)?independent\\s+verification\\b/gi,",
    "    pattern: /\\bnot\\s+(?:an?\\s+)?independent\\s+verification(?:\\s+of\\s+operating\\s+effectiveness)?\\b/gi,",
    "assurance limitation object",
)
assurance_path.write_text(assurance)


# 2) Scenario state grounding: correct only the two closed V7 synthesis patterns, using the
# recorded response labels from the material findings. If the required finding is not present,
# leave the manuscript untouched rather than inventing a state.
adaptation_path = Path("src/lib/reports/essential-presentation-adaptation.ts")
adaptation = adaptation_path.read_text()
scenario_helper = r'''
export interface EssentialScenarioStateFinding {
  questionPrompt: string;
  responseLabel: string;
}

function responseLabelForPrompt(
  findings: ReadonlyArray<EssentialScenarioStateFinding>,
  promptFragment: string
): string | null {
  const needle = promptFragment.toLowerCase();
  return findings.find((finding) => finding.questionPrompt.toLowerCase().includes(needle))?.responseLabel ?? null;
}

/**
 * Correct closed scenario-synthesis phrases where one maturity label was incorrectly applied to
 * several different controls. The replacement is derived only from the recorded finding labels;
 * no score, finding, scenario pathway or recommendation is changed.
 */
export function groundEssentialScenarioStateLanguage(
  value: string,
  findings: ReadonlyArray<EssentialScenarioStateFinding>
): string {
  if (!value) return value;
  let text = value;

  const monitoringLabel = responseLabelForPrompt(
    findings,
    'monitors transactions or operational activity for unusual patterns, anomalies or red flags'
  );
  if (monitoringLabel) {
    text = text.replace(
      /The current control weakness in the pathway is that monitoring and exception review are at an initial or ad hoc stage\./gi,
      `The current control weakness in the pathway is that transaction and activity monitoring is self-assessed as "${monitoringLabel}".`
    );
  }

  const evidenceLabel = responseLabelForPrompt(
    findings,
    'evidence linked to suspected fraud is identified, preserved and handled appropriately'
  );
  const reportingLabel = responseLabelForPrompt(
    findings,
    'provides a confidential or anonymous channel for reporting suspected fraud or misconduct'
  );
  if (evidenceLabel && reportingLabel) {
    text = text.replace(
      /The current control weakness is that evidence preservation, reporting and custody are at an initial or ad hoc stage\./gi,
      `The current control conditions are not at one shared maturity stage: evidence preservation and custody are self-assessed as "${evidenceLabel}", while confidential or anonymous reporting is self-assessed as "${reportingLabel}".`
    );
  }

  return text;
}
'''.strip('\n')
adaptation = replace_once(
    adaptation,
    "/** Keys carrying identity or references, which must never be rewritten. */",
    scenario_helper + "\n\n/** Keys carrying identity or references, which must never be rewritten. */",
    "scenario state grounding helper",
)
adaptation_path.write_text(adaptation)


# 3) Report assembly: bind scenario grounding, enforce chronological 30/60/90 ordering, and let
# short section tails share the next section instead of creating pages with mostly whitespace.
template_path = Path("src/lib/reports/templates/report-template.ts")
template = template_path.read_text()
template = replace_once(
    template,
    "import type { ParsedBlueprintMarkdown } from '../narrative/blueprint-text';",
    "import type { ParsedBlueprintMarkdown } from '../narrative/blueprint-text';\nimport { groundEssentialScenarioStateLanguage } from '../essential-presentation-adaptation';",
    "scenario grounding import",
)

old_narrative_helper = '''  const narrativeChapterBody = (chapterId: string): string => {
    const chapter = narrative?.chapters.find((item) => item.chapterId === chapterId);
    if (!chapter) return '';
    return chapter.sections.map((chapterSection) => {
      const paragraphs = chapterSection.paragraphs.map((block) => `<p>${esc(block.text)}</p>`).join('');
      const childBlocks = chapterSection.subsections.map((item) => `
        <div class="manuscript-subsection">
          <div class="field-label">${esc(item.title)}</div>
          ${item.paragraphs.map((block) => `<p>${esc(block.text)}</p>`).join('')}
        </div>`).join('');
      return `<div class="manuscript-section"><h3>${esc(chapterSection.title)}</h3>${paragraphs}${childBlocks}</div>`;
    }).join('');
  };'''
new_narrative_helper = '''  const narrativeBlockText = (chapterId: string, value: string): string =>
    chapterId === 'EXPOSURE-COULD-MATERIALISE'
      ? groundEssentialScenarioStateLanguage(value, evidenceModel.materialFindings)
      : value;
  const narrativeChapterBody = (
    chapterId: string,
    sectionFilter: (title: string) => boolean = () => true
  ): string => {
    const chapter = narrative?.chapters.find((item) => item.chapterId === chapterId);
    if (!chapter) return '';
    return chapter.sections.filter((chapterSection) => sectionFilter(chapterSection.title)).map((chapterSection) => {
      const paragraphs = chapterSection.paragraphs.map((block) => `<p>${esc(narrativeBlockText(chapterId, block.text))}</p>`).join('');
      const childBlocks = chapterSection.subsections.map((item) => `
        <div class="manuscript-subsection">
          <div class="field-label">${esc(item.title)}</div>
          ${item.paragraphs.map((block) => `<p>${esc(narrativeBlockText(chapterId, block.text))}</p>`).join('')}
        </div>`).join('');
      return `<div class="manuscript-section"><h3>${esc(chapterSection.title)}</h3>${paragraphs}${childBlocks}</div>`;
    }).join('');
  };'''
template = replace_once(template, old_narrative_helper, new_narrative_helper, "filtered narrative helper")

template = replace_once(
    template,
    "  const firstNinetyDayNarrative = narrativeChapterBody('FIRST-90-DAYS-CONCLUSION');",
    "  const thirtyDayNarrative = narrativeChapterBody('FIRST-90-DAYS-CONCLUSION', (title) => /\\b30 days\\b/i.test(title));\n  const sixtyDayNarrative = narrativeChapterBody('FIRST-90-DAYS-CONCLUSION', (title) => /\\b60 days\\b/i.test(title));\n  const ninetyDayNarrative = narrativeChapterBody('FIRST-90-DAYS-CONCLUSION', (title) => /\\b90 days\\b/i.test(title));\n  const roadmapConclusionNarrative = narrativeChapterBody('FIRST-90-DAYS-CONCLUSION', (title) => /conclusion/i.test(title));\n  const roadmapOtherNarrative = narrativeChapterBody('FIRST-90-DAYS-CONCLUSION', (title) => !/\\b(?:30|60|90) days\\b|conclusion/i.test(title));",
    "roadmap narrative stage split",
)

old_roadmap_rows = '''  const roadmapRows = projection.roadmapActions.map((action) => `<tr>
    <td>${esc(action.period)}</td>
    <td>${esc(action.domainName)}</td>
    <td>${esc(roadmapDeliverableForDisplay(action))}</td>
    <td>${esc(action.accountableExecutive)}</td>
    <td>${esc(action.successMeasure)}</td>
  </tr>`);'''
new_roadmap_rows = '''  const roadmapRowsForPeriod = (period: '30 days' | '60 days' | '90 days') => projection.roadmapActions
    .filter((action) => action.period === period)
    .map((action) => `<tr>
      <td>${esc(action.domainName)}</td>
      <td>${esc(roadmapDeliverableForDisplay(action))}</td>
      <td>${esc(action.accountableExecutive)}</td>
      <td>${esc(action.successMeasure)}</td>
    </tr>`);
  const roadmapThirtyRows = roadmapRowsForPeriod('30 days');
  const roadmapSixtyRows = roadmapRowsForPeriod('60 days');
  const roadmapNinetyRows = roadmapRowsForPeriod('90 days');'''
template = replace_once(template, old_roadmap_rows, new_roadmap_rows, "roadmap rows by stage")

old_roadmap_block = '''  const roadmapBlock = subsection('30/60/90-day roadmap', `
    <p class="section-note">The first 30 days establish decisions and ownership; the 60- and 90-day windows implement and evidence the linked controls.</p>
    ${firstNinetyDayNarrative ? `<div class="manuscript-panel">${firstNinetyDayNarrative}</div>` : ''}
    ${firstThirtyDayRows.length ? `<h3 class="roadmap-table-heading">First 30 days — decisions and foundations</h3>${table(['Priority decision', 'Deliverable', 'Accountable executive', 'Completion test'], firstThirtyDayRows, 'compact-register roadmap-table')}` : ''}
    <h3 class="roadmap-table-heading">60- and 90-day implementation actions</h3>
    ${table(['Period', 'Domain', 'Deliverable', 'Accountable executive', 'Success measure'], roadmapRows, 'compact-register roadmap-table')}`);'''
new_roadmap_block = '''  const roadmapActionTable = (rows: string[]) => table(
    ['Domain', 'Deliverable', 'Accountable executive', 'Success measure'],
    rows,
    'compact-register roadmap-table'
  );
  const roadmapBlock = subsection('30/60/90-day roadmap', `
    <p class="section-note">The first 30 days establish decisions and ownership; the 60- and 90-day windows implement and evidence the linked controls.</p>
    ${thirtyDayNarrative ? `<div class="manuscript-panel roadmap-stage-panel">${thirtyDayNarrative}</div>` : ''}
    ${firstThirtyDayRows.length ? `<h3 class="roadmap-table-heading">First 30 days — decisions and foundations</h3>${table(['Priority decision', 'Deliverable', 'Accountable executive', 'Completion test'], firstThirtyDayRows, 'compact-register roadmap-table')}` : ''}
    ${roadmapThirtyRows.length ? `<h3 class="roadmap-table-heading">First 30 days — implementation foundations</h3>${roadmapActionTable(roadmapThirtyRows)}` : ''}
    ${roadmapOtherNarrative ? `<div class="manuscript-panel roadmap-stage-panel">${roadmapOtherNarrative}</div>` : ''}
    ${sixtyDayNarrative ? `<div class="manuscript-panel roadmap-stage-panel">${sixtyDayNarrative}</div>` : ''}
    ${roadmapSixtyRows.length ? `<h3 class="roadmap-table-heading">60-day implementation actions</h3>${roadmapActionTable(roadmapSixtyRows)}` : ''}
    ${ninetyDayNarrative ? `<div class="manuscript-panel roadmap-stage-panel">${ninetyDayNarrative}</div>` : ''}
    ${roadmapNinetyRows.length ? `<h3 class="roadmap-table-heading">90-day implementation actions</h3>${roadmapActionTable(roadmapNinetyRows)}` : ''}
    ${roadmapConclusionNarrative ? `<div class="manuscript-panel roadmap-stage-panel roadmap-conclusion-panel">${roadmapConclusionNarrative}</div>` : ''}`);'''
template = replace_once(template, old_roadmap_block, new_roadmap_block, "chronological roadmap block")

# Allow the three known sparse transitions to flow onto the same physical page. Risk records may
# split only at their already-protected field boundaries, avoiding a new mostly-empty page after the
# scenario tail while preserving each field as an intact unit.
template = replace_once(
    template,
    "      ${priorityScenariosBlock}`, 'long-section'),",
    "      ${priorityScenariosBlock}`, 'long-section continue-after-short-tail'),",
    "priority findings tail fill",
)
template = replace_once(
    template,
    "      ${priorityRisksBlock}`, 'long-section'),",
    "      ${priorityRisksBlock}`, 'long-section continue-after-short-tail splittable-risk-section'),",
    "priority risks tail fill",
)
template = replace_once(
    template,
    "      ${subsection('E2. Definitions and score basis', definitionsBlock)}`, 'long-section')",
    "      ${subsection('E2. Definitions and score basis', definitionsBlock)}`, 'long-section continue-after-short-tail')",
    "appendix tail fill",
)

css_anchor = '''  .report-section.continue-after-long-register { break-before: auto; page-break-before: auto; }
  /* Do not solve one orphan by creating another: this section's kicker and heading must stay with
     its first meaningful content wherever it starts on the page. */'''
css_replacement = '''  .report-section.continue-after-long-register { break-before: auto; page-break-before: auto; }
  /* V7 final acceptance: when the preceding section leaves a short tail, start the next section in
     the available space instead of manufacturing a mostly-empty page. Section identity is
     unchanged; the kicker and heading remain attached to the first meaningful content. */
  .report-section.continue-after-short-tail { break-before: auto; page-break-before: auto; }
  .continue-after-short-tail .section-kicker,
  .continue-after-short-tail > h2 { break-after: avoid; page-break-after: avoid; }
  /* Priority-risk records may cross a page only between already indivisible field blocks. */
  .splittable-risk-section .risk-record { break-inside: auto; page-break-inside: auto; }
  .splittable-risk-section .record-heading,
  .splittable-risk-section .risk-statement,
  .splittable-risk-section .field { break-inside: avoid; page-break-inside: avoid; }
  /* Do not solve one orphan by creating another: this section's kicker and heading must stay with
     its first meaningful content wherever it starts on the page. */'''
template = replace_once(template, css_anchor, css_replacement, "short-tail pagination css")
template_path.write_text(template)


# 4) Exact V7 provider-free regression.
regression_path = Path("scripts/commercial-quality/essential-v7-final-acceptance-regression.mjs")
regression_path.write_text(r'''#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normaliseProhibitedAssessmentAssurance } from '../../src/lib/reports/narrative/assurance-boundary-normalisation.ts';
import { groundEssentialScenarioStateLanguage } from '../../src/lib/reports/essential-presentation-adaptation.ts';

const execNarrative = {
  ok: true,
  markdown: '# Executive\n\nThe assessment is strategic fraud-risk analysis and control design, not independent verification of operating effectiveness.',
  errors: [],
  chapters: [{
    chapterId: 'EXECUTIVE-ASSESSMENT',
    title: 'Executive assessment',
    sections: [{
      chapterId: 'EXECUTIVE-ASSESSMENT',
      sectionId: 'POSITION',
      title: 'Position',
      permittedClaimRefs: [],
      paragraphs: [{
        text: 'The assessment is strategic fraud-risk analysis and control design, not independent verification of operating effectiveness.',
        permittedClaimRefs: []
      }],
      subsections: []
    }]
  }]
};
normaliseProhibitedAssessmentAssurance(execNarrative);
const execText = execNarrative.chapters[0].sections[0].paragraphs[0].text;
assert.match(execText, /without verification of operating effectiveness by this review\.$/i);
assert.doesNotMatch(execText, /by this review of operating effectiveness/i);
assert.doesNotMatch(execNarrative.markdown, /by this review of operating effectiveness/i);

const findings = [
  {
    questionPrompt: 'The organisation monitors transactions or operational activity for unusual patterns, anomalies or red flags.',
    responseLabel: 'Partially designed'
  },
  {
    questionPrompt: 'Evidence linked to suspected fraud is identified, preserved and handled appropriately.',
    responseLabel: 'Initial / ad hoc'
  },
  {
    questionPrompt: 'The organisation provides a confidential or anonymous channel for reporting suspected fraud or misconduct.',
    responseLabel: 'Partially designed'
  }
];
const scenarioOne = groundEssentialScenarioStateLanguage(
  'The current control weakness in the pathway is that monitoring and exception review are at an initial or ad hoc stage. The activity may appear routine.',
  findings
);
assert.match(scenarioOne, /transaction and activity monitoring is self-assessed as "Partially designed"/i);
assert.doesNotMatch(scenarioOne, /monitoring and exception review are at an initial or ad hoc stage/i);

const scenarioTwo = groundEssentialScenarioStateLanguage(
  'The current control weakness is that evidence preservation, reporting and custody are at an initial or ad hoc stage. A delayed report can weaken containment.',
  findings
);
assert.match(scenarioTwo, /evidence preservation and custody are self-assessed as "Initial \/ ad hoc"/i);
assert.match(scenarioTwo, /confidential or anonymous reporting is self-assessed as "Partially designed"/i);
assert.doesNotMatch(scenarioTwo, /evidence preservation, reporting and custody are at an initial or ad hoc stage/i);

const template = readFileSync(new URL('../../src/lib/reports/templates/report-template.ts', import.meta.url), 'utf8');
const first30 = template.indexOf('First 30 days — decisions and foundations');
const day60 = template.indexOf('60-day implementation actions');
const day90 = template.indexOf('90-day implementation actions');
const conclusion = template.indexOf('roadmapConclusionNarrative ?');
assert.ok(first30 >= 0 && day60 > first30 && day90 > day60 && conclusion > day90, 'roadmap must render 30 -> 60 -> 90 -> conclusion');
assert.doesNotMatch(template, /60- and 90-day implementation actions/);
assert.match(template, /roadmapRowsForPeriod\('30 days'\)/);
assert.match(template, /roadmapRowsForPeriod\('60 days'\)/);
assert.match(template, /roadmapRowsForPeriod\('90 days'\)/);

assert.match(template, /long-section continue-after-short-tail'\),/);
assert.match(template, /long-section continue-after-short-tail splittable-risk-section'\),/);
assert.match(template, /long-section continue-after-short-tail'\)\n  \]\.join/);
assert.match(template, /\.report-section\.continue-after-short-tail \{ break-before: auto; page-break-before: auto; \}/);
assert.match(template, /\.splittable-risk-section \.risk-record \{ break-inside: auto; page-break-inside: auto; \}/);
assert.match(template, /groundEssentialScenarioStateLanguage\(value, evidenceModel\.materialFindings\)/);

console.log(JSON.stringify({
  status: 'PASS',
  ai: 'ZERO',
  v7ExecutiveCopy: 'PASS',
  v7ScenarioStateGrounding: 'PASS',
  v7RoadmapChronology: 'PASS',
  v7SparsePageFlow: 'PASS'
}, null, 2));
''')

# Add the permanent provider-free gate step after V6 final polish.
workflow_path = Path(".github/workflows/essential-provider-diagnostics.yml")
workflow = workflow_path.read_text()
workflow = replace_once(
    workflow,
    "    - name: Run provider-free Comprehensive customer-visible regressions\n      run: npx tsx --test scripts/commercial-quality/comprehensive-customer-visible-adaptation-tests.mjs",
    "    - name: Prove Essential V7 final acceptance fixes provider-free\n      run: npx tsx --test scripts/commercial-quality/essential-v7-final-acceptance-regression.mjs\n\n    - name: Run provider-free Comprehensive customer-visible regressions\n      run: npx tsx --test scripts/commercial-quality/comprehensive-customer-visible-adaptation-tests.mjs",
    "permanent V7 acceptance gate",
)
workflow_path.write_text(workflow)

print("V7 deterministic final acceptance fixes applied")
