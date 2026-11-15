// The corrected prototype pipeline for one fictional organisation, shared by the comparison build and its tests so that
// both run exactly the same code. Fictional only; no database, order, payment, entitlement or provider is touched.
import { runJourney } from '../lib/build16-driver.mjs';
import { simulate, bandOf } from '../research/scoring-simulation/calculator.mjs';
import { ORGANISATIONS, gatewaysFor } from './organisations.mjs';
import { buildStagedReportInput } from '../../src/lib/readiness-review/report-input.ts';
import { buildRevisedReport } from '../../src/lib/reports/revised/evidence-model.ts';
import { buildRevisedWorkbook, revisedWorkbookSheets } from '../../src/lib/reports/revised/workbook.ts';
import { buildRevisedAssembledData, REVISED_FIXTURE_LABEL } from '../../src/lib/reports/revised/assembled-data.ts';
import { buildRevisedEssentialPresentation, labelRevisedEssentialHtml } from '../../src/lib/reports/revised/essential-presentation.ts';
import { buildRevisedComprehensive } from '../../src/lib/reports/revised/comprehensive.ts';
import { positionStatements } from '../../src/lib/reports/revised/position.ts';
import { buildEssentialProjection } from '../../src/lib/reports/essential-projection.ts';
import { buildEssentialNarrativeFactPack } from '../../src/lib/reports/narrative/fact-pack.ts';
import { buildNarrativeStoryPlan } from '../../src/lib/reports/narrative/story-plan.ts';
import { buildReportBlueprint } from '../../src/lib/reports/narrative/report-blueprint.ts';
import { buildReportThesis } from '../../src/lib/reports/narrative/bounded-section-engine.ts';
import { buildEssentialPresentationModel } from '../../src/lib/reports/essential/presentation-model.ts';
import { validateEssentialPresentation } from '../../src/lib/reports/essential/presentation-validation.ts';
import { renderEssentialReportHtml } from '../../src/lib/reports/essential/render-essential-html.ts';

export const GENERATED = '2026-11-12T18:00:00Z';
export const PROTOTYPE_BANNER = 'FICTIONAL PROTOTYPE · Fictional organisation · Test-fixture figures, not an approved score · Not a certified paid report';
export const PROTOTYPE_FOOTER = 'FICTIONAL PROTOTYPE · TEST-FIXTURE FIGURES · NOT A CERTIFIED REPORT';
// The existing Essential chain is used only for the cover figure and area profile; it is given no findings, so it
// derives no rating, period or difficulty from the revised assessment.
const EMPTY_EVIDENCE = { narrativeMode: 'SUSTAINMENT', sustainmentPriorities: [], materialFindings: [], contradictions: [], scenarios: [], riskRegister: [], controlImprovements: [], evidenceChecklist: [], leadershipDecisions: [], roadmapActions: [], functionalAgenda: [], visibilityGaps: [] };

export const textOf = (html) => html.replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&ndash;/g, '–').replace(/\s+/g, ' ').trim();

export function essentialChain(data, evidence) {
  const pack = buildEssentialNarrativeFactPack(data, evidence, buildEssentialProjection(data, evidence));
  const blueprint = buildReportBlueprint(pack, buildNarrativeStoryPlan(pack));
  const thesis = buildReportThesis(pack, blueprint);
  const model = buildEssentialPresentationModel({ factPack: pack, thesis, blueprint, commentary: {} });
  return { pack, blueprint, model };
}

/** The corrected Essential and Comprehensive for one organisation, from its staged journey (or a given live session). */
export async function buildCorrected(key, { live = null, workbook = false } = {}) {
  const org = ORGANISATIONS[key] ?? { label: `Fictional ${key}` };
  const reference = `FX-${key}`;
  const session = live ?? runJourney(key).live;
  const staged = buildStagedReportInput(session);
  const sim = simulate(session.engine.report(), { treatment: 'midpoint', aggregation: 'equalDomains', falseComfort: 'F0', caps: 'none', visibility: 'fixture' });
  const fixture = { label: REVISED_FIXTURE_LABEL, overall: sim.overall.point, maturity: bandOf(sim.overall.point), areas: sim.domains.map((d) => ({ area: d.id, value: d.point })) };
  const report = buildRevisedReport(staged);
  const data = buildRevisedAssembledData({ staged, organisationName: org.label, assessmentReference: reference, generatedAt: GENERATED, gatewayAnswers: gatewaysFor(key in ORGANISATIONS ? key : 'P3'), fixture });
  const base = essentialChain(data, EMPTY_EVIDENCE);
  // The four position statements (no band, no threshold), the same for every organisation and both reports.
  const position = positionStatements(report, { score: fixture.overall });
  const essentialModel = buildRevisedEssentialPresentation({ base: base.model, report, fixtureLabel: REVISED_FIXTURE_LABEL, position });
  const validation = validateEssentialPresentation(essentialModel);
  const areaNames = new Map(staged.domains.map((d) => [d.id, d.name]));
  const essentialHtml = labelRevisedEssentialHtml(renderEssentialReportHtml(essentialModel), { banner: PROTOTYPE_BANNER, position, areaOrder: staged.domains.map((d) => d.name) });
  const comprehensive = buildRevisedComprehensive({
    report, banner: PROTOTYPE_BANNER, organisationName: org.label, assessmentReference: reference, position,
    figure: { score: fixture.overall, label: REVISED_FIXTURE_LABEL, areas: fixture.areas.map((x) => ({ area: x.area, name: areaNames.get(x.area) ?? x.area, value: x.value })) }
  });
  const meta = { organisationName: org.label, assessmentReference: reference, figureLabel: REVISED_FIXTURE_LABEL, figure: fixture.overall };
  const sheets = revisedWorkbookSheets(report, meta);
  const book = workbook ? await buildRevisedWorkbook(report, meta) : null;
  return { key, org, reference, staged, fixture, report, position, essentialModel, validation, essentialHtml, comprehensive, comprehensiveHtml: comprehensive.html, sheets, workbook: book };
}
