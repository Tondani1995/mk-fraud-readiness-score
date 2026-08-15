#!/usr/bin/env node
/**
 * Comprehensive renderer-consumption gate.
 *
 * Essential shipped four sustainment reports missing two exhibits because the
 * model built them and the renderer had no block for either. The same mistake is
 * cheaper to prevent than to find. Every customer-facing object in the
 * management model must reach the page, or be named in
 * COMPREHENSIVE_NON_RENDERED with a reason.
 *
 * No PDF and no provider calls: the HTML is the artefact under test.
 *
 * Usage:
 *   npm run v11:comprehensive-renderer-gate
 */
import fs from 'node:fs';
import path from 'node:path';
import { assembleReportData } from '../../src/lib/reports/assemble-report-data.ts';
import { buildAdvisoryEvidenceModel } from '../../src/lib/reports/evidence-model/index.ts';
import { buildEssentialProjection } from '../../src/lib/reports/essential-projection.ts';
import { buildEssentialNarrativeFactPack } from '../../src/lib/reports/narrative/fact-pack.ts';
import { assembleComprehensive } from '../../src/lib/reports/comprehensive/assembly.ts';
import { buildComprehensiveManagementModel } from '../../src/lib/reports/comprehensive/management-model.ts';
import { renderComprehensiveManagementReportHtml, COMPREHENSIVE_NON_RENDERED } from '../../src/lib/reports/comprehensive/render-comprehensive-html.ts';
import { getMaturityBand } from '../../src/lib/scoring/maturity-band.ts';
import { claimsVerification } from '../../src/lib/reports/comprehensive/product-contract.ts';

const DEFAULT_ORDERS = {
  'CASE-05': 'MKORD-2026-22FF6B69',
  'CASE-06': 'MKORD-2026-7FBBEE23',
  'CASE-11': 'MKORD-2026-O9DT0QTT'
};

const esc = (value) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const orders = process.env.ORDERS
  ? Object.fromEntries(process.env.ORDERS.split(',').map((order, index) => [`CASE-${String(index + 1).padStart(2, '0')}`, order.trim()]))
  : DEFAULT_ORDERS;

const cases = [];
const violations = [];

for (const [caseId, order] of Object.entries(orders)) {
  const data = await assembleReportData(order);
  const evidence = buildAdvisoryEvidenceModel(data);
  const pack = buildEssentialNarrativeFactPack(data, evidence, buildEssentialProjection(data, evidence));
  const model = buildComprehensiveManagementModel(assembleComprehensive(evidence, { scenarioFacts: pack.scenarios }));
  const domains = pack.domains.filter((domain) => typeof domain.score === 'number')
    .map((domain) => ({ title: domain.name, score: domain.score, band: getMaturityBand(domain.score) }));
  const html = renderComprehensiveManagementReportHtml({
    model, organisationName: pack.organisation.name, assessmentReference: pack.assessment.reference,
    score: pack.assessment.score, maturity: pack.assessment.maturity, domains
  });
  const add = (code, detail) => violations.push({ caseId, code, detail });

  // Every register row must reach its own appendix.
  //
  // Checking presence anywhere in the document is too weak: an effectiveness
  // measure also appears in the control and action registers, so emptying the
  // measure appendix left every string still findable and the check passed. Each
  // register is therefore searched only within its own section.
  const sections = html.split('<section class="reg">').slice(1);
  const sectionFor = (title) => sections.find((section) => section.includes(esc(title))) ?? '';
  const checkIn = (sectionTitle, rows, idOf, label) => {
    const section = sectionFor(sectionTitle);
    if (!section) { add('UNRENDERED_REGISTER_SECTION', `${label}: appendix section absent`); return; }
    const missing = rows.filter((row) => !section.includes(esc(idOf(row))));
    if (missing.length) add('UNRENDERED_REGISTER_ROW', `${label}: ${missing.length} of ${rows.length} absent (e.g. ${idOf(missing[0])})`);
  };
  checkIn('Finding register', model.registers.findings, (row) => row.findingId, 'finding register');
  checkIn('Fraud risk register', model.registers.risks, (row) => row.riskId, 'risk register');
  checkIn('Control blueprint register', model.registers.controls, (row) => row.controlId, 'control register');
  checkIn('12-month action and assurance register', model.registers.actions, (row) => row.deliverable, 'action register');
  const evidenceItems = model.registers.evidence.flatMap((group) => group.items);
  checkIn('Evidence requirement register', evidenceItems, (row) => row.artefact, 'evidence register');
  checkIn('Measurement register', model.registers.measures, (row) => row.measure, 'measure register');

  // Every core module must reach the page.
  const coreChecks = [
    ['managementThemes', model.core.managementThemes.map((theme) => theme.title)],
    ['exposureThemes', model.core.exposureThemes.map((theme) => theme.title)],
    ['controlProgrammes', model.core.controlProgrammes.map((programme) => programme.title)],
    ['governanceRoles', model.core.governanceRoles.map((role) => role.displayRole)],
    ['decisionAgenda', model.core.decisionAgenda.map((decision) => decision.decisionRequired)],
    ['implementationPhases', model.core.implementationPhases.map((phase) => phase.phase)]
  ];
  for (const [name, values] of coreChecks) {
    const present = values.filter((value) => value && html.includes(esc(value)));
    if (values.length && present.length !== values.length) {
      add('UNRENDERED_CORE_MODULE', `${name}: ${values.length - present.length} of ${values.length} absent`);
    }
    if (!values.length && !COMPREHENSIVE_NON_RENDERED.some((entry) => entry.object.startsWith(`core.${name}`))) {
      // An empty module is only acceptable where the mode genuinely has none.
      if (model.narrativeMode !== 'SUSTAINMENT') add('UNRENDERED_CORE_MODULE', `${name} is empty in ${model.narrativeMode}`);
    }
  }

  // The assurance boundary must survive rendering.
  const verification = claimsVerification(html.replace(/<[^>]+>/g, ' '));
  if (verification.violation) add('ASSURANCE_BOUNDARY', `rendered report claims verification (${verification.matched})`);
  if (!html.includes('has not been independently reviewed')) add('ASSURANCE_BOUNDARY', 'the report basis statement is missing');

  cases.push({
    caseId, mode: model.narrativeMode, htmlBytes: html.length,
    registers: { findings: model.registers.findings.length, risks: model.registers.risks.length, controls: model.registers.controls.length, evidence: evidenceItems.length, actions: model.registers.actions.length, measures: model.registers.measures.length },
    core: { themes: model.core.managementThemes.length, programmes: model.core.controlProgrammes.length, roles: model.core.governanceRoles.length, decisions: model.core.decisionAgenda.length, phases: model.core.implementationPhases.length }
  });
}

const summary = { cases: cases.length, violations: violations.length, declaredNonRendered: COMPREHENSIVE_NON_RENDERED.length, byCase: cases, violationDetail: violations };
const outDir = process.env.CERT_OUTPUT_DIR ?? '/Users/tondani/Documents/Codex/outputs/comprehensive-c4-renderer';
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'renderer-consumption.json'), `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));

if (violations.length) {
  console.error(`\nFAIL: ${violations.length} renderer-consumption violation(s).`);
  process.exit(1);
}
console.log('\nPASS: every management-model object reaches the page, and the assurance boundary survives rendering.');
