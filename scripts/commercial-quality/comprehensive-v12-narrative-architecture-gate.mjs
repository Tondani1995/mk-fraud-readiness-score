#!/usr/bin/env node
import { buildV12ProfileAssembled } from '../../src/lib/qa/comprehensive-v12-quality-profiles.ts';
import { buildComprehensiveDeliveryModel } from '../../src/lib/reports/comprehensive/contract.ts';
import { buildComprehensiveNarrativeFactPack } from '../../src/lib/reports/narrative/fact-pack.ts';
import { buildNarrativeStoryPlan } from '../../src/lib/reports/narrative/story-plan.ts';
import { buildReportBlueprint } from '../../src/lib/reports/narrative/report-blueprint.ts';
import { buildComprehensiveNarrativePresentationModel } from '../../src/lib/reports/comprehensive/narrative-presentation-model.ts';
import { renderComprehensiveNarrativeReportHtml } from '../../src/lib/reports/comprehensive/render-narrative-html.ts';

const fail = (code, detail) => { console.error(JSON.stringify({ code, detail })); process.exitCode = 1; };
const { data } = buildV12ProfileAssembled('motheo');
const evidenceModelModule = await import('../../src/lib/reports/evidence-model/index.ts');
const evidenceModel = evidenceModelModule.buildAdvisoryEvidenceModel(data);
const delivery = buildComprehensiveDeliveryModel({
  assembled: data,
  evidenceModel,
  score: {
    overallScore: data.scoreRun.overallScore,
    calculatedMaturity: data.scoreRun.calculatedMaturity,
    finalMaturity: data.scoreRun.finalMaturity,
    exposureScore: data.scoreRun.exposureScore,
    exposureBand: data.scoreRun.exposureBand,
    coveragePct: data.scoreRun.coveragePct,
    nARatePct: data.scoreRun.nARatePct,
    criticalGapCount: data.scoreRun.criticalGapCount,
    majorGapCount: data.scoreRun.majorGapCount,
    capApplied: data.scoreRun.capApplied,
    capReason: data.scoreRun.capReason,
    methodologyVersionId: data.scoreRun.methodologyVersionId
  },
  organisationName: data.organisationName,
  assessmentReference: data.assessmentReference,
  generatedAt: data.generatedAt
});
const pack = buildComprehensiveNarrativeFactPack(delivery);
const story = buildNarrativeStoryPlan(pack);
const blueprint = buildReportBlueprint(pack, story);

if (pack.productTier !== 'comprehensive') fail('TIER', pack.productTier);
if (pack.narrativeMode !== 'SUSTAINMENT') fail('MODE', pack.narrativeMode);
if (pack.findings.length || pack.risks.length || pack.scenarios.length || pack.systemicThemeInputs.length) {
  fail('SUSTAINMENT_WEAKNESS_OBJECTS', JSON.stringify({
    findings: pack.findings.length, risks: pack.risks.length, scenarios: pack.scenarios.length, themes: pack.systemicThemeInputs.length
  }));
}
if (!pack.sustainmentPriorities.length) fail('SUSTAINMENT_PRIORITIES', 'none');

const requiredSustainmentChapters = [
  'EXECUTIVE-ASSESSMENT',
  'ANALYTICAL-BASIS',
  'READINESS-SUPPORTING-STANDARDS',
  'SUSTAINMENT-PRIORITIES',
  'DETERIORATION-WATCHPOINTS',
  'TARGET-RESILIENT-CONTROL-ENVIRONMENT',
  'LEADERSHIP-DECISIONS-TO-PRESERVE',
  'SUSTAINMENT-OPTIMISATION',
  'MANAGEMENT-CONCLUSION'
];
for (const id of requiredSustainmentChapters) if (!blueprint.chapters.some((chapter) => chapter.chapterId === id)) fail('MISSING_CHAPTER', id);
if (blueprint.chapters.some((chapter) => /material finding|fraud risk theme|scenario/i.test(chapter.title))) {
  fail('SUSTAINMENT_CHAPTER_SEMANTICS', blueprint.chapters.map((chapter) => chapter.title).join(' | '));
}

const narrative = {
  ok: true,
  markdown: '',
  errors: [],
  chapters: blueprint.chapters.map((chapter) => ({
    chapterId: chapter.chapterId,
    title: chapter.title,
    sections: chapter.sections.map((section) => ({
      chapterId: chapter.chapterId,
      sectionId: section.sectionId,
      title: section.title,
      permittedClaimRefs: section.claimRefs,
      paragraphs: [{
        text: `This is a complete management narrative for ${section.title}. It explains the authorised meaning in connected advisory prose and keeps analytical machinery subordinate to the management story. The detailed register remains in the companion workbook rather than being reproduced as the report itself.`,
        permittedClaimRefs: section.claimRefs
      }],
      subsections: section.optionalSubsections.map((subsection) => ({
        subsectionId: subsection.subsectionId,
        title: subsection.title,
        paragraphs: [{
          text: `This narrative explains ${subsection.title} as part of the connected management story without converting the report into a deterministic table or register export.`,
          permittedClaimRefs: subsection.claimRefs
        }]
      }))
    }))
  }))
};

const presentation = buildComprehensiveNarrativePresentationModel({ factPack: pack, blueprint, narrative });
const html = renderComprehensiveNarrativeReportHtml(presentation);
const forbidden = [
  'Finding register', 'Fraud risk register', 'Evidence requirement register',
  'Measurement register', '12-month action and assurance register',
  'Appendix A', 'Appendix B', 'Appendix C', 'Appendix D', 'Appendix E', 'Appendix F'
];
for (const phrase of forbidden) if (html.includes(phrase)) fail('REGISTER_LEAK', phrase);
if (/<table\b/i.test(html)) fail('TABLE_LED_REPORT', 'narrative renderer contains an HTML table');
if (/\b3 material findings\b|\bfraud risks arise\b|\bHARD GATE\b/i.test(html)) fail('SUSTAINMENT_CONTRADICTION', 'weakness language leaked into high-readiness report');
if (!/var\(--mk-confirmed\)/.test(html) || !/confirmed-bg/.test(html)) fail('POSITIVE_SEMANTICS', 'green positive semantics are absent');
if (!/Deterioration signal/.test(html)) fail('WATCHPOINT_SEMANTICS', 'amber is not isolated to an explicit deterioration signal');
if (!/companion workbook/i.test(html)) fail('WORKBOOK_BOUNDARY', 'detailed analytical record is not routed to companion workbook');
if (!/PRESERVE/.test(html) || !/OPTIMISE/.test(html)) fail('SUSTAINMENT_PATH', 'PRESERVE → EMBED → MEASURE → OPTIMISE is not visible');
if ((html.match(/<section class="chapter/g) ?? []).length < 8) fail('NARRATIVE_DEPTH', 'too few narrative chapters');

console.log(JSON.stringify({
  status: process.exitCode ? 'FAIL' : 'PASS',
  mode: pack.narrativeMode,
  chapters: blueprint.chapters.length,
  sustainmentPriorities: pack.sustainmentPriorities.length,
  tables: (html.match(/<table\b/gi) ?? []).length,
  registerAppendices: forbidden.filter((phrase) => html.includes(phrase)),
  semanticPalette: { positive: 'green', watchpoint: 'amber-only', structure: 'navy' }
}, null, 2));
if (!process.exitCode) console.log('PASS: Comprehensive customer architecture is whole-manuscript, narrative-first, workbook-backed and positive-state aware.');
