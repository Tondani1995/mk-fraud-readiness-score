#!/usr/bin/env node
/**
 * Comprehensive management-model gate.
 *
 * The core is a view over the registers. This checks that it stays one:
 *
 *   ROLE_NORMALISATION            composite labels collapse to a usable set
 *   CORE_TO_REGISTER_TRACEABILITY every id the core cites exists in a register
 *   REGISTER_COMPLETENESS         no analytical object is dropped on the way in
 *   MODULE_OWNERSHIP              core modules do not own the same source objects
 *   MODE_COHERENCE                the core shrinks with readiness
 *
 * Zero provider calls.
 *
 * Usage:
 *   npm run v11:comprehensive-management-model-gate
 */
import fs from 'node:fs';
import path from 'node:path';
import { assembleReportData } from '../../src/lib/reports/assemble-report-data.ts';
import { buildAdvisoryEvidenceModel } from '../../src/lib/reports/evidence-model/index.ts';
import { assembleComprehensive } from '../../src/lib/reports/comprehensive/assembly.ts';
import { buildComprehensiveManagementModel } from '../../src/lib/reports/comprehensive/management-model.ts';

const DEFAULT_ORDERS = {
  'CASE-01': 'MKORD-2026-B1DN82OG', 'CASE-02': 'MKORD-2026-D1U0CTO8', 'CASE-03': 'MKORD-2026-RHFC6DYH',
  'CASE-04': 'MKORD-2026-HB0OT81P', 'CASE-05': 'MKORD-2026-22FF6B69', 'CASE-06': 'MKORD-2026-7FBBEE23',
  'CASE-07': 'MKORD-2026-O8E19UPV', 'CASE-08': 'MKORD-2026-RXXUNVD9', 'CASE-09': 'MKORD-2026-1EOLBY7Y',
  'CASE-10': 'MKORD-2026-72BCEIDN', 'CASE-11': 'MKORD-2026-O9DT0QTT'
};

/**
 * A governance model an executive cannot read is not a governance model. The
 * ceiling is set from measurement: the raw library labels produce 55-72 rows,
 * canonical resolution produces 4-21 across the portfolio, so 25 fails the
 * unnormalised state with margin and passes every real case.
 */
const MAX_CANONICAL_ROLES = Number(process.env.MAX_CANONICAL_ROLES ?? 25);

const orders = process.env.ORDERS
  ? Object.fromEntries(process.env.ORDERS.split(',').map((order, index) => [`CASE-${String(index + 1).padStart(2, '0')}`, order.trim()]))
  : DEFAULT_ORDERS;

const cases = [];
const violations = [];

for (const [caseId, order] of Object.entries(orders)) {
  const evidence = buildAdvisoryEvidenceModel(await assembleReportData(order));
  const assembly = assembleComprehensive(evidence);
  const model = buildComprehensiveManagementModel(assembly);
  const add = (code, detail) => violations.push({ caseId, order, code, detail });

  const findingIds = new Set(model.registers.findings.map((row) => row.findingId));
  const riskIds = new Set(model.registers.risks.map((row) => row.riskId));
  const controlIds = new Set(model.registers.controls.map((row) => row.controlId));
  const actionIds = new Set(model.registers.actions.map((row) => row.actionId));

  // ---- ROLE_NORMALISATION --------------------------------------------------
  const rawLabels = new Set();
  for (const control of model.registers.controls) {
    for (const label of [control.accountableExecutiveRole, control.processOwnerRole, control.oversightFunction]) {
      if (label) rawLabels.add(label);
    }
  }
  const roles = model.core.governanceRoles;
  if (roles.length > MAX_CANONICAL_ROLES) add('ROLE_NORMALISATION', `${roles.length} canonical roles exceeds the readable ceiling of ${MAX_CANONICAL_ROLES}`);
  for (const role of roles) {
    const responsibilities = role.controls.length + role.decisions.length + role.evidenceResponsibilities.length + role.reviewResponsibilities.length + role.escalationResponsibilities.length;
    if (responsibilities === 0) add('ROLE_NORMALISATION', `${role.displayRole} carries no responsibility of any kind`);
    if (!role.sourceRoleLabels.length) add('ROLE_NORMALISATION', `${role.displayRole} has no source label, so its provenance is lost`);
    // Named individuals are not derivable from the assessment and must never appear.
    if (/\b(mr|mrs|ms|dr)\b\.?\s+[A-Z]/i.test(role.displayRole)) add('ROLE_NORMALISATION', `${role.displayRole} looks like a named individual`);
  }

  // ---- CORE_TO_REGISTER_TRACEABILITY --------------------------------------
  const checkIds = (ids, pool, where, kind) => {
    const missing = ids.filter((id) => !pool.has(id));
    if (missing.length) add('CORE_TO_REGISTER_TRACEABILITY', `${where} cites ${kind} not in the register: ${missing.slice(0, 3).join(', ')}`);
  };
  for (const theme of [...model.core.managementThemes, ...model.core.exposureThemes]) {
    checkIds(theme.findingIds, findingIds, theme.themeId, 'findings');
    checkIds(theme.riskIds, riskIds, theme.themeId, 'risks');
    checkIds(theme.controlIds, controlIds, theme.themeId, 'controls');
  }
  for (const programme of model.core.controlProgrammes) checkIds(programme.controlIds, controlIds, programme.programmeId, 'controls');
  for (const role of roles) {
    checkIds(role.controls, controlIds, role.displayRole, 'controls');
  }
  for (const phase of model.core.implementationPhases) checkIds(phase.actionIds, actionIds, phase.phase, 'actions');
  for (const measure of model.registers.measures) checkIds(measure.sourceControlIds, controlIds, 'measure register', 'controls');

  // ---- REGISTER_COMPLETENESS ----------------------------------------------
  if (model.registers.findings.length !== assembly.counts.findings) add('REGISTER_COMPLETENESS', 'findings lost between assembly and model');
  if (model.registers.risks.length !== assembly.counts.risks) add('REGISTER_COMPLETENESS', 'risks lost between assembly and model');
  if (model.registers.controls.length !== assembly.counts.controls) add('REGISTER_COMPLETENESS', 'controls lost between assembly and model');
  if (model.registers.actions.length !== assembly.counts.programmeActions) add('REGISTER_COMPLETENESS', 'actions lost between assembly and model');
  // Every finding must reach exactly one management theme.
  const themedFindings = model.core.managementThemes.flatMap((theme) => theme.findingIds);
  if (new Set(themedFindings).size !== findingIds.size) add('REGISTER_COMPLETENESS', `${findingIds.size} findings but ${new Set(themedFindings).size} reach a theme`);
  if (themedFindings.length !== new Set(themedFindings).size) add('MODULE_OWNERSHIP', 'a finding appears in more than one management theme');
  // Every control must reach exactly one programme.
  const programmedControls = model.core.controlProgrammes.flatMap((programme) => programme.controlIds);
  if (new Set(programmedControls).size !== controlIds.size) add('REGISTER_COMPLETENESS', `${controlIds.size} controls but ${new Set(programmedControls).size} reach a programme`);
  if (programmedControls.length !== new Set(programmedControls).size) add('MODULE_OWNERSHIP', 'a control appears in more than one programme');

  // ---- MODE_COHERENCE ------------------------------------------------------
  if (model.narrativeMode === 'SUSTAINMENT' && model.core.managementThemes.length > 4) {
    add('MODE_COHERENCE', `sustainment produced ${model.core.managementThemes.length} management themes`);
  }
  if (model.narrativeMode !== 'SUSTAINMENT' && model.core.managementThemes.length === 0) {
    add('MODE_COHERENCE', `${model.narrativeMode} produced no management themes`);
  }

  cases.push({
    caseId, mode: model.narrativeMode,
    rawRoleLabels: rawLabels.size, canonicalRoles: roles.length,
    core: {
      themes: model.counts.managementThemes, exposureThemes: model.counts.exposureThemes,
      programmes: model.counts.controlProgrammes, roles: model.counts.governanceRoles,
      decisions: model.counts.decisions, phases: model.counts.implementationPhases
    },
    registers: {
      findings: model.counts.registerFindings, risks: model.counts.registerRisks, controls: model.counts.registerControls,
      evidenceItems: model.counts.registerEvidenceItems, actions: model.counts.registerActions, measures: model.counts.registerMeasures
    }
  });
}

const summary = {
  cases: cases.length,
  violations: violations.length,
  roleReduction: {
    rawMin: Math.min(...cases.map((entry) => entry.rawRoleLabels)),
    rawMax: Math.max(...cases.map((entry) => entry.rawRoleLabels)),
    canonicalMin: Math.min(...cases.map((entry) => entry.canonicalRoles)),
    canonicalMax: Math.max(...cases.map((entry) => entry.canonicalRoles))
  },
  byCase: cases,
  violationDetail: violations
};

const outDir = process.env.CERT_OUTPUT_DIR ?? '/Users/tondani/Documents/Codex/outputs/comprehensive-c3-management-model';
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'management-model-portfolio.json'), `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify({ cases: summary.cases, violations: summary.violations, roleReduction: summary.roleReduction }, null, 2));

if (violations.length) {
  console.error(`\nFAIL: ${violations.length} management-model violation(s).`);
  for (const violation of violations.slice(0, 8)) console.error(`  ${violation.caseId} ${violation.code}: ${violation.detail}`);
  process.exit(1);
}
console.log('\nPASS: the core is a traceable view over complete registers, and the governance model is readable.');
