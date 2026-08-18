from pathlib import Path
import re

BRANCH = 'commercial/mk-fraud-readiness-95-quality'

nav = Path('src/lib/reports/render-validated-commercial-pdf.ts')
text = nav.read_text()
old = """export async function renderValidatedCommercialPdfWithNavigation(
  input: {
    data: AssembledReportData;
    content: SelectedContent;
    roadmap: { agenda: RoadmapItem[] };
    evidenceModel?: AdvisoryEvidenceModel;
  },"""
new = """export async function renderValidatedCommercialPdfWithNavigation(
  input: {
    data: AssembledReportData;
    content: SelectedContent;
    roadmap: { agenda: RoadmapItem[] };
    evidenceModel?: AdvisoryEvidenceModel;
    /** Validated v1.1 manuscript must survive every navigation fixed-point render pass. */
    narrative?: ParsedBlueprintMarkdown;
  },"""
if old in text:
    text = text.replace(old, new, 1)
elif 'renderValidatedCommercialPdfWithNavigation' not in text or 'narrative?: ParsedBlueprintMarkdown;' not in text:
    raise SystemExit('navigation input anchor missing')
old_loop = "const html = dependencies.renderHtml(input.data, input.content, input.roadmap, input.evidenceModel, pageMap);"
new_loop = "const html = dependencies.renderHtml(input.data, input.content, input.roadmap, input.evidenceModel, pageMap, undefined, input.narrative);"
if old_loop in text:
    text = text.replace(old_loop, new_loop, 1)
elif new_loop not in text:
    raise SystemExit('navigation rerender anchor missing')
nav.write_text(text)

template = Path('src/lib/reports/templates/report-template.ts')
text = template.read_text()
text = text.replace("import { gapKey } from '../select-content-blocks';\n", "")
text = text.replace("    const commentary = content.gapCommentary[gapKey(gap.domainCode, gap.questionCode)];\n", "")
old_gap = "      <p>${esc(commentary?.body ?? 'Leadership should agree the operating proof and remediation ownership for this recorded condition.')}</p>"
new_gap = "      <p>This assessment records this as a ${gap.isCriticalGap ? 'critical' : 'major'} control gap. Its management significance is addressed in the connected diagnosis.</p>"
if old_gap in text:
    text = text.replace(old_gap, new_gap, 1)
elif new_gap not in text:
    raise SystemExit('priority gap anchor missing')

text = text.replace("      const narrative = content.domainNarratives[domainName];\n", "")
old_domain = """        <p><strong>${esc(narrative?.title ?? band)}</strong></p>
        <p>${esc(narrative?.body ?? 'No domain narrative was produced.')}</p>"""
new_domain = "        <p><strong>${esc(band)}</strong> reported position.</p>"
if old_domain in text:
    text = text.replace(old_domain, new_domain, 1)
elif new_domain not in text:
    raise SystemExit('domain legacy narrative anchor missing')

anchor = """  const topScenarios = projection.scenarios;

  const findingCard ="""
binder = """  const topScenarios = projection.scenarios;

  // The accepted v1.1 manuscript is interpretation around deterministic exhibits, not a second
  // report appended after methodology. Bind each chapter to the section it was written to explain.
  const narrativeChapterBody = (chapterId: string): string => {
    const chapter = narrative?.chapters.find((item) => item.chapterId === chapterId);
    if (!chapter) return '';
    return chapter.sections.map((chapterSection) => {
      const paragraphs = chapterSection.paragraphs.map((block) => `<p>${esc(block.text)}</p>`).join('');
      const childBlocks = chapterSection.subsections.map((item) => `
        <div class=\"manuscript-subsection\">
          <div class=\"field-label\">${esc(item.title)}</div>
          ${item.paragraphs.map((block) => `<p>${esc(block.text)}</p>`).join('')}
        </div>`).join('');
      return `<div class=\"manuscript-section\"><h3>${esc(chapterSection.title)}</h3>${paragraphs}${childBlocks}</div>`;
    }).join('');
  };
  const executiveNarrative = narrativeChapterBody('EXECUTIVE-ASSESSMENT');
  const diagnosisNarrative = narrativeChapterBody('WHAT-HOLDS-READINESS-BACK');
  const exposureNarrative = narrativeChapterBody('PRIORITY-FRAUD-EXPOSURES');
  const scenarioNarrative = narrativeChapterBody('EXPOSURE-COULD-MATERIALISE');
  const targetControlNarrative = narrativeChapterBody('TARGET-CONTROL-ENVIRONMENT');
  const firstNinetyDayNarrative = narrativeChapterBody('FIRST-90-DAYS-CONCLUSION');
  const executiveNarrativeBlock = executiveNarrative
    || `<p class=\"executive-copy\">${esc(content.executiveSummary.body)}</p>${systemicDiagnosisBlock}<div class=\"attention-box\"><strong>Leadership attention</strong><p>${esc(content.leadershipAttention.body)}</p></div>`;

  const findingCard ="""
if anchor in text:
    text = text.replace(anchor, binder, 1)
elif "const executiveNarrative = narrativeChapterBody('EXECUTIVE-ASSESSMENT');" not in text:
    raise SystemExit('chapter binder insertion anchor missing')

old_scenario = "const priorityScenariosBlock = subsection('Scenarios and assurance tests', topScenarios.map(scenarioCard).join(''));"
new_scenario = "const priorityScenariosBlock = subsection('Scenarios and assurance tests', scenarioNarrative || topScenarios.map(scenarioCard).join(''));"
if old_scenario in text:
    text = text.replace(old_scenario, new_scenario, 1)
elif new_scenario not in text:
    raise SystemExit('scenario binding anchor missing')

old_roadmap = """  const roadmapRows = projection.roadmapActions.map((action) => `<tr>
    <td>${esc(action.period)}</td>
    <td>${esc(action.domainName)}</td>
    <td>${esc(action.deliverable)}</td>
    <td>${esc(action.accountableExecutive)}</td>
    <td>${esc(action.successMeasure)}</td>
  </tr>`);
  const roadmapBlock = subsection('30/60/90-day roadmap', `
    <p class=\"section-note\">This is the report's only action roadmap. Dependencies and measures are carried directly from the material findings, risks and controls set out in this report.</p>
    ${table(['Period', 'Domain', 'Deliverable', 'Accountable executive', 'Success measure'], roadmapRows, 'compact-register roadmap-table')}`);"""
new_roadmap = """  const roadmapRows = projection.roadmapActions.map((action) => `<tr>
    <td>${esc(action.period)}</td>
    <td>${esc(action.domainName)}</td>
    <td>${esc(action.deliverable)}</td>
    <td>${esc(action.accountableExecutive)}</td>
    <td>${esc(action.successMeasure)}</td>
  </tr>`);
  const firstThirtyDayRows = evidenceModel.leadershipDecisions
    .filter((decision) => decision.targetPeriod === '30 days')
    .map((decision) => `<tr>
      <td>${esc(decision.decisionRequired)}</td>
      <td>${esc(decision.recommendedDecision)}</td>
      <td>${esc(decision.accountableExecutive)}</td>
      <td>Decision recorded, accountable owner confirmed and escalation route documented.</td>
    </tr>`);
  const roadmapBlock = subsection('30/60/90-day roadmap', `
    <p class=\"section-note\">The first 30 days establish decisions and ownership; the 60- and 90-day windows implement and evidence the linked controls.</p>
    ${firstNinetyDayNarrative ? `<div class=\"manuscript-panel\">${firstNinetyDayNarrative}</div>` : ''}
    ${firstThirtyDayRows.length ? `<h3>First 30 days — decisions and foundations</h3>${table(['Priority decision', 'Deliverable', 'Accountable executive', 'Completion test'], firstThirtyDayRows, 'compact-register roadmap-table')}` : ''}
    <h3>60- and 90-day implementation actions</h3>
    ${table(['Period', 'Domain', 'Deliverable', 'Accountable executive', 'Success measure'], roadmapRows, 'compact-register roadmap-table')}`);"""
if old_roadmap in text:
    text = text.replace(old_roadmap, new_roadmap, 1)
elif 'First 30 days — decisions and foundations' not in text:
    raise SystemExit('roadmap anchor missing')

pattern = re.compile(r"\n  // Blueprint narrative, in the blueprint's own order\..*?\n  const parts = \[", re.S)
text, count = pattern.subn("\n  const parts = [", text, count=1)
if count == 0 and 'const narrativeSections =' in text:
    raise SystemExit('append-only manuscript removal failed')

old_exec = "<div><p class=\"executive-copy\">${esc(content.executiveSummary.body)}</p>${systemicDiagnosisBlock}<div class=\"attention-box\"><strong>Leadership attention</strong><p>${esc(content.leadershipAttention.body)}</p></div></div>"
new_exec = "<div class=\"manuscript-panel executive-manuscript\">${executiveNarrativeBlock}</div>"
if old_exec in text:
    text = text.replace(old_exec, new_exec, 1)
elif new_exec not in text:
    raise SystemExit('executive anchor missing')

old_domain_section = """    section('Domain overview', 'Domain overview', systemic.systemic
      ? `<p class=\"lede\">Every assessed domain is summarised below. Individual domain narratives are omitted because the recorded condition is systemic rather than domain-specific.</p>${systemicDomainAggregation}`
      : domainGroupBlocks.map((block, index) => subsection(DOMAIN_GROUPS[index].title, block)).join(''), 'long-section'),"""
new_domain_section = """    section('Domain overview', 'Domain overview', `${diagnosisNarrative ? `<div class=\"manuscript-panel\">${diagnosisNarrative}</div>` : ''}${systemic.systemic
      ? `<p class=\"lede\">Every assessed domain is summarised below. Individual domain narratives are omitted because the recorded condition is systemic rather than domain-specific.</p>${systemicDomainAggregation}`
      : domainGroupBlocks.map((block, index) => subsection(DOMAIN_GROUPS[index].title, block)).join('')}`, 'long-section'),"""
if old_domain_section in text:
    text = text.replace(old_domain_section, new_domain_section, 1)
elif '${diagnosisNarrative ? `<div class="manuscript-panel">${diagnosisNarrative}</div>` : \'\'}' not in text:
    raise SystemExit('domain section anchor missing')

old_findings = """      <p class=\"lede\">The ${topFindings.length} conditions selected for executive attention from ${sortedFindings.length} recorded findings. The complete register of all ${sortedFindings.length} findings is provided in the supporting register issued with this report.</p>
      ${priorityFindingsBlock}"""
new_findings = """      <p class=\"lede\">The ${topFindings.length} conditions selected for executive attention from ${sortedFindings.length} recorded findings. The complete register of all ${sortedFindings.length} findings is provided in the supporting register issued with this report.</p>
      ${exposureNarrative ? `<div class=\"manuscript-panel\">${exposureNarrative}</div>` : ''}
      ${priorityFindingsBlock}"""
if old_findings in text:
    text = text.replace(old_findings, new_findings, 1)
elif '${exposureNarrative ? `<div class="manuscript-panel">${exposureNarrative}</div>` : \'\'}' not in text:
    raise SystemExit('findings narrative anchor missing')

old_leadership = """    section('Leadership decisions and roadmap', 'Leadership decisions and roadmap', systemic.systemic
      ? `${decisionsBlock}${subsection('Foundational control programme', foundationalProgramme)}${roadmapBlock}`
      : `${decisionsBlock}${roadmapBlock}`, 'long-section'),"""
new_leadership = """    section('Leadership decisions and roadmap', 'Leadership decisions and roadmap', `${targetControlNarrative ? subsection('Target control environment', `<div class=\"manuscript-panel\">${targetControlNarrative}</div>`) : ''}${systemic.systemic
      ? `${decisionsBlock}${subsection('Foundational control programme', foundationalProgramme)}${roadmapBlock}`
      : `${decisionsBlock}${roadmapBlock}`}`, 'long-section'),"""
if old_leadership in text:
    text = text.replace(old_leadership, new_leadership, 1)
elif 'targetControlNarrative ? subsection' not in text:
    raise SystemExit('leadership anchor missing')

text = text.replace('the full checklist in the appendix.', 'the full checklist in the supporting register.')
old_count = "This report presents the highest-priority matters from a complete assessment of ${u.materialFindings > 0 ? data.questionTraces.length : 0} controls."
new_count = "This report presents the highest-priority matters from a complete assessment inventory of ${u.materialFindings > 0 ? data.questionTraces.length : 0} controls${adaptiveScope ? ` (${adaptiveScope.applicableCount} applicable and ${adaptiveScope.excludedCount} excluded)` : ''}."
if old_count in text:
    text = text.replace(old_count, new_count, 1)
elif 'complete assessment inventory of ${u.materialFindings' not in text:
    raise SystemExit('supporting count anchor missing')
text = text.replace('    narrativeSections,\n', '')

css_anchor = "  .lede { color: var(--mk-muted); font-size: 10pt; max-width: 170mm; }\n"
css_insert = """  .lede { color: var(--mk-muted); font-size: 10pt; max-width: 170mm; }
  .manuscript-panel { border-left: 1mm solid var(--mk-navy-500); background: var(--mk-cream); padding: 4mm 5mm; margin-bottom: 5mm; }
  .manuscript-section { margin-bottom: 4mm; }
  .manuscript-section:last-child { margin-bottom: 0; }
  .manuscript-subsection { margin-top: 3mm; }
"""
if css_anchor in text and '.manuscript-panel {' not in text:
    text = text.replace(css_anchor, css_insert, 1)
elif '.manuscript-panel {' not in text:
    raise SystemExit('CSS anchor missing')

template.write_text(text)

test = Path('scripts/commercial-quality/essential-manuscript-render-binding-tests.mjs')
test.write_text(r'''#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
const nav = fs.readFileSync('src/lib/reports/render-validated-commercial-pdf.ts', 'utf8');
const template = fs.readFileSync('src/lib/reports/templates/report-template.ts', 'utf8');
assert.match(nav, /renderValidatedCommercialPdfWithNavigation[\s\S]*narrative\?: ParsedBlueprintMarkdown/);
assert.match(nav, /pageMap, undefined, input\.narrative\)/);
for (const id of ['EXECUTIVE-ASSESSMENT','WHAT-HOLDS-READINESS-BACK','PRIORITY-FRAUD-EXPOSURES','EXPOSURE-COULD-MATERIALISE','TARGET-CONTROL-ENVIRONMENT','FIRST-90-DAYS-CONCLUSION']) {
  assert.match(template, new RegExp(`narrativeChapterBody\\('${id}'\\)`), `${id} is not bound`);
}
assert.doesNotMatch(template, /const narrativeSections =/);
assert.doesNotMatch(template, /narrativeSections,/);
assert.doesNotMatch(template, /No domain narrative was produced/);
assert.match(template, /scenarioNarrative \|\| topScenarios\.map\(scenarioCard\)/);
assert.match(template, /First 30 days — decisions and foundations/);
assert.match(template, /full checklist in the supporting register\./);
assert.match(template, /applicable and \$\{adaptiveScope\.excludedCount\} excluded/);
console.log(JSON.stringify({ status: 'PASS', ai: 'ZERO', manuscriptBinding: 'PASS', navigationPersistence: 'PASS' }, null, 2));
''')

# Restore the provider-free workflow to its normal read-only role, keeping the new regression.
workflow = Path('.github/workflows/essential-provider-diagnostics.yml')
workflow.write_text("""name: Report Provider-Free Regressions

on:
  push:
    branches:
      - commercial/mk-fraud-readiness-95-quality
  pull_request:
    branches:
      - main

permissions:
  contents: read

jobs:
  report-regressions:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - name: Check out repository
        uses: actions/checkout@v4

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '24'
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Run provider-free Essential diagnostics
        run: npm run v11:narrative-diagnostics

      - name: Prove Essential output budget and one-call guard
        run: npx tsx --test scripts/commercial-quality/essential-output-budget-tests.mjs

      - name: Prove Essential assurance boundary provider-free
        run: npx tsx --test scripts/commercial-quality/essential-assurance-boundary-tests.mjs

      - name: Prove Essential numeric claim equivalence provider-free
        run: npx tsx --test scripts/commercial-quality/essential-numeric-claim-tests.mjs

      - name: Prove Essential manuscript render binding provider-free
        run: npx tsx --test scripts/commercial-quality/essential-manuscript-render-binding-tests.mjs

      - name: Run provider-free Comprehensive customer-visible regressions
        run: npx tsx --test scripts/commercial-quality/comprehensive-customer-visible-adaptation-tests.mjs
""")

# Retire all temporary patch machinery in the same commit that applies the fix.
for temp in [
    Path('.github/workflows/one-off-essential-manuscript-binding-v2.yml'),
    Path('docs/ops/essential-manuscript-binding-trigger-2026-08-18.txt'),
    Path('scripts/commercial-quality/apply-essential-manuscript-binding.py'),
]:
    if temp.exists():
        temp.unlink()

print('Essential manuscript binding patch applied provider-free.')
