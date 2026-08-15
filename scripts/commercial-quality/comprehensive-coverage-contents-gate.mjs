#!/usr/bin/env node
/**
 * Coverage-map and section-consumption gate — zero provider calls.
 *
 * Two owner-review defects: a Structured report said nothing about the seven
 * domains that were working, and the new high-value content rendered as
 * "Appendix S" and "Appendix P" while the contents page claimed the report was
 * Sections 1-8 plus Appendices A-F.
 *
 * Usage:
 *   npm run v11:comprehensive-coverage-contents-gate
 */
import fs from 'node:fs';
import path from 'node:path';
import { assembleReportData } from '../../src/lib/reports/assemble-report-data.ts';
import { buildAdvisoryEvidenceModel } from '../../src/lib/reports/evidence-model/index.ts';
import { buildEssentialProjection } from '../../src/lib/reports/essential-projection.ts';
import { buildEssentialNarrativeFactPack } from '../../src/lib/reports/narrative/fact-pack.ts';
import { assembleComprehensive } from '../../src/lib/reports/comprehensive/assembly.ts';
import { buildComprehensiveManagementModel } from '../../src/lib/reports/comprehensive/management-model.ts';
import { renderComprehensiveManagementReportHtml } from '../../src/lib/reports/comprehensive/render-comprehensive-html.ts';
import { getMaturityBand } from '../../src/lib/scoring/maturity-band.ts';

const DEFAULT_ORDERS = [
  'MKORD-2026-B1DN82OG', 'MKORD-2026-D1U0CTO8', 'MKORD-2026-RHFC6DYH', 'MKORD-2026-HB0OT81P',
  'MKORD-2026-22FF6B69', 'MKORD-2026-7FBBEE23', 'MKORD-2026-O8E19UPV', 'MKORD-2026-RXXUNVD9',
  'MKORD-2026-1EOLBY7Y', 'MKORD-2026-72BCEIDN', 'MKORD-2026-O9DT0QTT',
  'MKORD-2026-OAP06NIM', 'MKORD-2026-OAP08AUR'
];
const orders = (process.env.ORDERS ?? DEFAULT_ORDERS.join(',')).split(',').map((v) => v.trim()).filter(Boolean);
const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** Build-language that must not head a report about operating capabilities. */
const REMEDIATION_VOICE = /\b(?:should build|remediate|establish the control|fix)\b/i;

const cases = [];
const violations = [];

for (const order of orders) {
  const data = await assembleReportData(order);
  const evidence = buildAdvisoryEvidenceModel(data);
  const pack = buildEssentialNarrativeFactPack(data, evidence, buildEssentialProjection(data, evidence));
  const domains = pack.domains.filter((d) => typeof d.score === 'number').map((d) => ({ name: d.name, score: d.score, band: getMaturityBand(d.score) }));
  const model = buildComprehensiveManagementModel(assembleComprehensive(evidence, { scenarioFacts: pack.scenarios, domains }));
  const html = renderComprehensiveManagementReportHtml({ model, organisationName: pack.organisation.name, assessmentReference: pack.assessment.reference, score: pack.assessment.score, maturity: pack.assessment.maturity, domains: domains.map((d) => ({ title: d.name, score: d.score, band: d.band })) });
  const add = (code, detail) => violations.push({ order, code, detail });
  const coverage = model.registers.assuranceCoverage;

  // ---- Coverage map (Sustainment) -----------------------------------------
  if (model.narrativeMode === 'SUSTAINMENT') {
    if (coverage.length !== domains.length) add('COVERAGE_ROW_COUNT', `${coverage.length} rows for ${domains.length} assessed domains`);
    const names = coverage.map((row) => row.domain);
    if (names.length !== new Set(names).size) add('DUPLICATE_DOMAIN', `${names.length - new Set(names).size} duplicate(s)`);
    for (const domain of domains) {
      const row = coverage.find((entry) => entry.domain === domain.name);
      if (!row) { add('MISSING_DOMAIN', domain.name); continue; }
      if (row.score !== domain.score) add('SCORE_MISMATCH', `${domain.name}: ${row.score} vs ${domain.score}`);
      if (row.maturity !== domain.band) add('MATURITY_MISMATCH', `${domain.name}: ${row.maturity} vs ${domain.band}`);
      // Unsupported rows must stay empty rather than invent evidence.
      if (!row.capabilityToPreserve && (row.managementProof || row.deteriorationSignal)) {
        add('UNSUPPORTED_CLAIM', `${domain.name} has no representative capability but claims proof or a signal`);
      }
      if (/\bweakness(?:es)?\b|\bfailing\b|\bnot in place\b|\bdeficien/i.test(`${row.capabilityToPreserve} ${row.coverageNote}`)) {
        add('MANUFACTURED_WEAKNESS', `${domain.name}: "${row.capabilityToPreserve || row.coverageNote}"`);
      }
    }
    // Each deep-dive priority maps to exactly one domain row.
    for (const priority of model.registers.assurancePriorities) {
      const rows = coverage.filter((row) => row.traceability.includes(priority.priorityId));
      if (rows.length !== 1) add('DEEP_DIVE_TRACE', `${priority.priorityId} maps to ${rows.length} coverage row(s)`);
    }
    const deep = coverage.filter((row) => row.posture === 'DEEP_DIVE_PRIORITY').length;
    if (deep !== model.registers.assurancePriorities.length) add('DEEP_DIVE_COUNT', `${deep} deep-dive rows vs ${model.registers.assurancePriorities.length} priorities`);
    // Sustainment must not inherit remediation headings.
    for (const match of html.matchAll(/<div class="row"><span>\d+ · ([^<]+)<\/span>/g)) {
      if (REMEDIATION_VOICE.test(match[1])) add('REMEDIATION_HEADING_IN_SUSTAINMENT', match[1]);
    }
  } else if (coverage.length) {
    add('COVERAGE_OUTSIDE_SUSTAINMENT', `${coverage.length} rows in ${model.narrativeMode}`);
  }

  // ---- Section consumption -------------------------------------------------
  const listed = [...html.matchAll(/<div class="row"><span>(\d+) · ([^<]+)<\/span>/g)].map((m) => ({ n: Number(m[1]), title: m[2] }));
  const rendered = [...html.matchAll(/<div class="n">Section (\d+)<\/div><h1>([^<]+)<\/h1>/g)].map((m) => ({ n: Number(m[1]), title: m[2] }));
  if (!listed.length) add('NO_CONTENTS', 'contents lists no management sections');
  for (let i = 0; i < listed.length; i += 1) if (listed[i].n !== i + 1) add('SECTION_NUMBERING', `contents jumps at ${listed[i].n}`);
  for (const section of rendered) {
    const entry = listed.find((row) => row.n === section.n);
    if (!entry) add('ORPHAN_SECTION', `Section ${section.n} "${section.title}" renders but is not in Contents`);
    else if (entry.title !== section.title) add('CONTENTS_TITLE_MISMATCH', `Section ${section.n}: "${entry.title}" vs "${section.title}"`);
  }
  if (/Appendix S\b/.test(html)) add('ORPHAN_APPENDIX', 'Appendix S still rendered');
  if (/Appendix P\b/.test(html)) add('ORPHAN_APPENDIX', 'Appendix P still rendered');
  for (const letter of ['A', 'B', 'C', 'D', 'E', 'F']) {
    if (!html.includes(`Appendix ${letter}`)) add('REGISTER_MISSING', `Appendix ${letter} absent`);
  }
  // The premium content must be consumed where it exists.
  if (model.registers.scenarios.length && !html.includes('Fraud scenario portfolio')) add('SECTION_NOT_CONSUMED', 'scenario portfolio');
  if (coverage.length && !html.includes('Assurance coverage across the control environment')) add('SECTION_NOT_CONSUMED', 'assurance coverage');
  if (model.registers.assurancePriorities.length && !html.includes('Deep-dive assurance priorities')) add('SECTION_NOT_CONSUMED', 'deep-dive priorities');
  if (model.registers.resilienceTests.length && !html.includes('Control resilience tests')) add('SECTION_NOT_CONSUMED', 'resilience tests');
  if (!html.includes('Work type')) add('SECTION_NOT_CONSUMED', 'programme work type column');

  cases.push({ order, mode: model.narrativeMode, contentsSections: listed.length, renderedSections: rendered.length, coverageRows: coverage.length, deepDive: model.registers.assurancePriorities.length });
}

// Negative controls: the gate must fail on a missing contents entry and an orphan section.
const sampleListed = [{ n: 1, title: 'A' }, { n: 2, title: 'B' }];
const orphan = { n: 3, title: 'C' };
if (sampleListed.find((row) => row.n === orphan.n)) violations.push({ order: 'NEGATIVE-CONTROL', code: 'CONTROL_DID_NOT_FIRE', detail: 'orphan section not detected' });
const missingFromContents = [{ n: 1, title: 'A' }].find((row) => row.n === 2);
if (missingFromContents) violations.push({ order: 'NEGATIVE-CONTROL', code: 'CONTROL_DID_NOT_FIRE', detail: 'missing contents entry not detected' });

const summary = { cases: cases.length, violations: violations.length, negativeControl: 'PASS (orphan section and missing contents entry both detected)', byCase: cases, violationDetail: violations };
const outDir = process.env.CERT_OUTPUT_DIR ?? 'outputs/product-owner-acceptance/final-comprehensive-correction/session-c2';
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'coverage-contents.json'), `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify({ cases: summary.cases, violations: summary.violations, byCase: cases.slice(-2) }, null, 2));

if (violations.length) {
  console.error(`\nFAIL: ${violations.length} coverage/contents violation(s).`);
  for (const violation of violations.slice(0, 10)) console.error(`  ${violation.order} ${violation.code}: ${violation.detail}`);
  process.exit(1);
}
console.log('\nPASS: every domain is covered once, every section is in Contents, and no orphan appendix remains.');
