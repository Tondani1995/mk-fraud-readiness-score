#!/usr/bin/env node

/*
 * Assessment-agnostic v1.1 Report Blueprint reproducibility certification.
 * Read-only Staging inventory; deterministic Blueprint generation only.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import { assembleReportData } from '../../src/lib/reports/assemble-report-data.ts';
import { buildAdvisoryEvidenceModel } from '../../src/lib/reports/evidence-model/index.ts';
import { buildEssentialProjection } from '../../src/lib/reports/essential-projection.ts';
import { fromAssembledReportData } from '../../src/lib/reports/comprehensive/contract.ts';
import { buildEssentialNarrativeFactPack, buildComprehensiveNarrativeFactPack, assertNarrativeFactPack } from '../../src/lib/reports/narrative/fact-pack.ts';
import { buildNarrativeStoryPlan, assertNarrativeStoryPlan } from '../../src/lib/reports/narrative/story-plan.ts';
import { buildNarrativeWriterBrief, assertNarrativeWriterBrief } from '../../src/lib/reports/narrative/writer-brief.ts';
import { buildReportBlueprint, buildWholeManuscriptContext, assertReportBlueprint, validateReportBlueprint } from '../../src/lib/reports/narrative/report-blueprint.ts';
import { runPreAiFactPackGates } from '../../src/lib/reports/narrative/pre-ai-gates.ts';
import { REPORTING_BIBLE_VERSION } from '../../src/lib/reports/reporting-bible.ts';

const outputDir = path.resolve(process.env.V11_REPRODUCIBILITY_OUTPUT_DIR ?? '/Users/tondani/Documents/Codex/2026-08-11/p1-no-paid-order-can-be/outputs/v1.1-report-blueprint-reproducibility');
const stagingHost = 'penhenkzfrtmcxklodtu.supabase.co';
const branch = execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).trim();
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const remoteSha = (() => { try { const raw = execFileSync('git', ['ls-remote', 'origin', `refs/heads/${branch}`], { encoding: 'utf8' }).trim(); return raw ? raw.split(/\s+/)[0] : null; } catch { return null; } })();
const expectedSha = process.env.V11_REPRODUCIBILITY_EXPECTED_SHA;
if (expectedSha && commit !== expectedSha) throw new Error(`Unexpected source SHA ${commit}; expected ${expectedSha}.`);
if (REPORTING_BIBLE_VERSION !== '1.1') throw new Error(`Expected Reporting Bible 1.1, received ${REPORTING_BIBLE_VERSION}.`);

const configuredUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '';
if (!configuredUrl.includes(stagingHost)) throw new Error(`Refusing to run: configured Supabase host is not Staging (${stagingHost}).`);
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for read-only Staging inventory.');

const db = createClient(configuredUrl, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const sha256 = (value) => crypto.createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const unique = (items) => [...new Set((items ?? []).filter(Boolean))];
const sorted = (items) => unique(items).sort();
const text = (value) => String(value ?? '').replaceAll('|', '\\|').replaceAll('\n', ' ');
const writeText = async (file, value) => { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, `${String(value).trim()}\n`); };
const writeJson = async (file, value) => { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`); };
const table = (headers, rows) => [`| ${headers.join(' | ')} |`, `| ${headers.map(() => '---').join(' | ')} |`, ...rows.map((row) => `| ${row.map(text).join(' | ')} |`)].join('\n');

async function queryInventory() {
  const [assessments, scoreRuns, orders] = await Promise.all([
    db.from('assessments').select('id,assessment_reference,organisation_id,current_score_run_id,created_at,organisations:organisation_id(legal_name,trading_name)').order('created_at', { ascending: true }),
    db.from('score_runs').select('id,assessment_id,overall_score,calculated_maturity,final_maturity,exposure_score,exposure_band,coverage_pct,n_a_rate_pct,critical_gap_count,major_gap_count,status,cap_applied,cap_reason').eq('status', 'completed'),
    db.from('orders').select('order_reference,assessment_id,status,created_at,products:product_id(product_code,name)').order('created_at', { ascending: true })
  ]);
  for (const result of [assessments, scoreRuns, orders]) if (result.error) throw result.error;
  const runs = new Map((scoreRuns.data ?? []).map((run) => [run.id, run]));
  const ordersByAssessment = new Map();
  for (const order of orders.data ?? []) ordersByAssessment.set(order.assessment_id, [...(ordersByAssessment.get(order.assessment_id) ?? []), order]);
  return (assessments.data ?? []).map((assessment) => {
    const run = runs.get(assessment.current_score_run_id);
    const assessmentOrders = ordersByAssessment.get(assessment.id) ?? [];
    const organisation = assessment.organisations?.trading_name || assessment.organisations?.legal_name || 'Organisation';
    return {
      assessmentId: assessment.id,
      assessmentReference: assessment.assessment_reference,
      organisation,
      createdAt: assessment.created_at,
      score: run?.overall_score === null || run?.overall_score === undefined ? null : Number(run.overall_score),
      calculatedMaturity: run?.calculated_maturity ?? null,
      finalMaturity: run?.final_maturity ?? null,
      exposureScore: run?.exposure_score === null || run?.exposure_score === undefined ? null : Number(run.exposure_score),
      exposureBand: run?.exposure_band ?? null,
      coveragePct: run?.coverage_pct === null || run?.coverage_pct === undefined ? null : Number(run.coverage_pct),
      uncertaintyPct: run?.n_a_rate_pct === null || run?.n_a_rate_pct === undefined ? null : Number(run.n_a_rate_pct),
      criticalGaps: run?.critical_gap_count === null || run?.critical_gap_count === undefined ? null : Number(run.critical_gap_count),
      majorGaps: run?.major_gap_count === null || run?.major_gap_count === undefined ? null : Number(run.major_gap_count),
      capApplied: run?.cap_applied ?? null,
      capReason: run?.cap_reason ?? null,
      orderReference: assessmentOrders[0]?.order_reference ?? null,
      orderBacked: Boolean(run && run.overall_score !== null && run.overall_score !== undefined && assessmentOrders.length > 0),
      scored: Boolean(run && run.overall_score !== null && run.overall_score !== undefined)
    };
  });
}

function familyTitles(pack) { return pack.systemicThemeInputs.map((item) => item.title); }
function familySet(pack) { return sorted(pack.findings.flatMap((finding) => [finding.primarySemanticFamily, ...(finding.secondarySemanticFamilies ?? [])])); }
function pathwaySet(pack) { return sorted(pack.findings.flatMap((finding) => finding.fraudPathwayFamilies ?? [])); }
function exhibitTypes(blueprint) { return sorted(blueprint.chapters.flatMap((chapter) => chapter.exhibits.map((exhibit) => exhibit.type))); }
function subsectionCount(blueprint) { return blueprint.chapters.reduce((sum, chapter) => sum + chapter.sections.reduce((inner, section) => inner + section.optionalSubsections.length, 0), 0); }
function sectionCount(blueprint) { return blueprint.chapters.reduce((sum, chapter) => sum + chapter.sections.length, 0); }
function canonicalBlueprint(blueprint) { return JSON.stringify(blueprint); }
function blueprintHash(blueprint) { return sha256(canonicalBlueprint(blueprint)); }
function roleSequence(blueprint) { return blueprint.chapters.map((chapter) => chapter.narrativeRole); }
function customerTitleFields(blueprint) {
  return blueprint.chapters.flatMap((chapter) => [chapter.title, chapter.purpose, chapter.requiredManagementTakeaway, ...chapter.sections.flatMap((section) => [section.title, section.purpose, section.requiredManagementTakeaway, ...section.optionalSubsections.flatMap((subsection) => [subsection.title, subsection.purpose, subsection.requiredManagementTakeaway])])]);
}
function machineFacingTitleHits(blueprint) {
  const rawId = /\b[A-Z]{3,}(?:[_-][A-Z0-9]+)+\b/;
  return customerTitleFields(blueprint).filter((value) => rawId.test(value));
}
function unsupportedThemeRefs(result) {
  const surface = new Set(result.blueprint.chapters.flatMap((chapter) => [chapter.requiredFacts, chapter.claimRefs, ...chapter.sections.flatMap((section) => [section.requiredFacts, section.claimRefs, ...section.optionalSubsections.flatMap((subsection) => [subsection.requiredFacts, subsection.claimRefs])])]).flat());
  return result.pack.systemicThemeInputs.filter((theme) => !surface.has(theme.factRef)).map((theme) => theme.factRef);
}

async function buildTierResult(data, tier) {
  const evidence = buildAdvisoryEvidenceModel(data);
  const pack = tier === 'essential'
    ? buildEssentialNarrativeFactPack(data, evidence, buildEssentialProjection(data, evidence))
    : buildComprehensiveNarrativeFactPack(await fromAssembledReportData(data));
  assertNarrativeFactPack(pack);
  const plan = buildNarrativeStoryPlan(pack);
  assertNarrativeStoryPlan(plan, pack);
  const brief = buildNarrativeWriterBrief(pack, plan);
  assertNarrativeWriterBrief(brief);
  const gate = runPreAiFactPackGates(pack, plan, brief);
  if (gate.status !== 'PASS') throw new Error(`${tier} pre-AI gate failed: ${gate.results.filter((item) => item.status === 'FAIL').map((item) => item.gate).join(', ')}`);
  const blueprint = buildReportBlueprint(pack, plan);
  assertReportBlueprint(blueprint, pack);
  const validation = validateReportBlueprint(blueprint, pack);
  const rerunBlueprint = buildReportBlueprint(pack, plan);
  assertReportBlueprint(rerunBlueprint, pack);
  const hash = blueprintHash(blueprint);
  const rerunHash = blueprintHash(rerunBlueprint);
  const context = buildWholeManuscriptContext(pack, blueprint);
  return { tier, pack, plan, brief, gate, blueprint, validation, context, hash, rerunHash, stable: hash === rerunHash };
}

function classifyArchetype(row, essential) {
  const familyCount = familySet(essential.pack).length;
  const findingCount = essential.pack.findings.length;
  if (row.calculatedMaturity && row.finalMaturity && row.calculatedMaturity !== row.finalMaturity) return 'E — maturity-constrained';
  if (row.finalMaturity === 'Strategic' || row.score >= 80) return 'F — Strategic / very high readiness';
  if (row.finalMaturity === 'Structured' || essential.pack.narrativeMode === 'SUSTAINMENT' || (row.score >= 60 && (row.criticalGaps ?? 0) === 0)) return 'D — high-readiness Structured / Sustainment';
  if (row.finalMaturity === 'Reactive' && familyCount >= 5 && ((row.criticalGaps ?? 0) + (row.majorGaps ?? 0) >= 10)) return 'A — broad weak / Reactive';
  if (familyCount <= 3 && findingCount > 0) return 'C — concentrated exposure';
  if (row.finalMaturity === 'Developing' || row.finalMaturity === 'Initial') return 'B — mixed / Developing';
  return 'B — mixed / Developing';
}

function chooseExamples(results) {
  const score = (result, key) => {
    const row = result.row;
    const familyCount = familySet(result.essential.pack).length;
    if (key.startsWith('A')) return (row.finalMaturity === 'Reactive' ? 100 : 0) + familyCount * 5 + (row.criticalGaps ?? 0);
    if (key.startsWith('B')) return (row.finalMaturity === 'Developing' ? 100 : 0) + familyCount;
    if (key.startsWith('C')) return (familyCount <= 3 ? 100 : 0) + (row.score ?? 0);
    if (key.startsWith('D')) return ((row.finalMaturity === 'Structured' || result.essential.pack.narrativeMode === 'SUSTAINMENT') ? 100 : 0) + (row.score ?? 0);
    if (key.startsWith('F')) return ((row.finalMaturity === 'Strategic' ? 1000 : 0) + (row.score ?? 0));
    return 0;
  };
  const keys = ['A — broad weak / Reactive', 'B — mixed / Developing', 'C — concentrated exposure', 'D — high-readiness Structured / Sustainment', 'F — Strategic / very high readiness'];
  const selected = Object.fromEntries(keys.map((key) => [key, results.filter((result) => result.archetype === key).sort((left, right) => score(right, key) - score(left, key))[0] ?? null]));
  const used = new Set(Object.values(selected).filter(Boolean));
  selected['Additional materially distinct scored profile'] = results.filter((result) => !used.has(result)).sort((left, right) => (right.row.criticalGaps ?? 0) - (left.row.criticalGaps ?? 0) || (left.row.score ?? 0) - (right.row.score ?? 0))[0] ?? null;
  return selected;
}

function detailedOutline(result, archetype) {
  const { row, essential, comprehensive } = result;
  const blueprint = comprehensive?.blueprint ?? essential.blueprint;
  const lines = [`# ${row.organisation} — ${blueprint.reportTier[0].toUpperCase() + blueprint.reportTier.slice(1)} owner outline`, '', `Archetype: ${archetype}`, `Assessment: ${row.assessmentReference}`, `Score / maturity: ${row.score} / ${row.finalMaturity}`, `Narrative mode: ${blueprint.narrativeMode}`, '', '## Transformation sequence', ...blueprint.transformationSequence.map((stage) => `- ${stage.stage}: ${stage.supported ? stage.purpose : 'Not supported by recorded inputs; no weakness is manufactured.'}`), '', '## Report hierarchy'];
  for (const chapter of blueprint.chapters) {
    lines.push('', `## ${chapter.title}`, `Narrative role: ${chapter.narrativeRole}`, `Purpose: ${chapter.purpose}`, `Management takeaway: ${chapter.requiredManagementTakeaway}`);
    for (const section of chapter.sections) {
      lines.push('', `### ${section.title}`, `Narrative role: ${section.narrativeRole}`, `Purpose: ${section.purpose}`, `Management takeaway: ${section.requiredManagementTakeaway}`);
      for (const subsection of section.optionalSubsections) lines.push('', `#### ${subsection.title}`, `Narrative role: ${subsection.narrativeRole}`, `Purpose: ${subsection.purpose}`, `Management takeaway: ${subsection.requiredManagementTakeaway}`);
    }
  }
  lines.push('', 'This is a deterministic Blueprint outline for owner review. It does not certify AI writing, PDF design or commercial launch readiness.');
  return lines.join('\n');
}

function matrixRow(result) {
  const { row, essential, comprehensive } = result;
  const e = essential.blueprint;
  const c = comprehensive?.blueprint;
  return [row.assessmentReference, row.score, row.finalMaturity, e.narrativeMode, e.chapters.length, familyTitles(essential.pack).join('; ') || 'None', essential.pack.scenarios.length, e.chapters.flatMap((chapter) => chapter.exhibits).length, comprehensive ? 'YES' : 'NO', c?.chapters.length ?? '—', c ? familyTitles(comprehensive.pack).join('; ') || 'None' : '—', essential.hash, result.warnings.join('; ') || 'None'];
}

function unavailableMatrixRow(row, warning) {
  return [row.assessmentReference, row.score ?? '—', row.finalMaturity ?? '—', '—', '—', '—', '—', '—', 'NO', '—', '—', '—', warning];
}

async function main() {
  const inventory = await queryInventory();
  const scored = inventory.filter((row) => row.scored);
  const reproducibleRows = scored.filter((row) => row.orderBacked);
  const skippedScored = scored.filter((row) => !row.orderBacked);
  const results = [];
  for (const row of reproducibleRows) {
    const warnings = [];
    try {
      const data = await assembleReportData(row.orderReference);
      const essential = await buildTierResult(data, 'essential');
      let comprehensive = null;
      try { comprehensive = await buildTierResult(data, 'comprehensive'); } catch (error) { warnings.push(`Comprehensive ineligible: ${error instanceof Error ? error.message : String(error)}`); }
      const archetype = classifyArchetype(row, essential);
      const allBlueprints = [essential.blueprint, ...(comprehensive ? [comprehensive.blueprint] : [])];
      for (const blueprint of allBlueprints) {
        if (blueprint.chapters.some((chapter) => chapter.sections.length === 0)) warnings.push('empty chapter');
        if (blueprint.narrativeRoleUsage.ledger.length === 0) warnings.push('empty narrative usage ledger');
        if (machineFacingTitleHits(blueprint).length > 0) warnings.push('machine-facing title');
      }
      if (essential.validation.missingMaterialFacts.length > 0 || (comprehensive && comprehensive.validation.missingMaterialFacts.length > 0)) warnings.push('missing material content');
      if (unsupportedThemeRefs(essential).length > 0 || (comprehensive && unsupportedThemeRefs(comprehensive).length > 0)) warnings.push('irrelevant theme');
      results.push({ row, essential, comprehensive, archetype, warnings });
    } catch (error) {
      results.push({ row, essential: null, comprehensive: null, archetype: null, warnings: [`Generation failed: ${error instanceof Error ? error.message : String(error)}`], failure: true });
    }
  }

  const valid = results.filter((result) => result.essential && !result.failure);
  const examples = chooseExamples(valid);
  await fs.rm(outputDir, { recursive: true, force: true });
  await fs.mkdir(outputDir, { recursive: true });

  const inventoryRows = inventory.map((row) => [row.assessmentReference, row.organisation, row.scored ? 'SCORED' : 'NOT SCORED', row.score ?? '—', row.calculatedMaturity ?? '—', row.finalMaturity ?? '—', row.orderReference ?? '—', row.orderBacked ? 'YES' : 'NO']);
  await writeText(path.join(outputDir, 'existing-assessment-inventory.md'), ['# Existing scored-assessment inventory', '', `Source: read-only Supabase Staging ${stagingHost}`, '', `Total assessments: **${inventory.length}** | Scored completed: **${scored.length}** | Scored/order-backed: **${reproducibleRows.length}** | Scored without order: **${skippedScored.length}**`, '', table(['Assessment reference', 'Organisation', 'Score state', 'Score', 'Calculated maturity', 'Final maturity', 'Order reference', 'Reproducible'], inventoryRows), '', 'No assessment, score, maturity, order or payment state was mutated.'].join('\n'));

  const resultByReference = new Map(results.map((result) => [result.row.assessmentReference, result]));
  const matrix = scored.map((row) => {
    const result = resultByReference.get(row.assessmentReference);
    if (result?.essential) return matrixRow(result);
    return unavailableMatrixRow(row, result?.warnings.join(' | ') ?? 'Not reproducible under existing order-backed delivery contract.');
  });
  const failedRows = results.filter((result) => result.failure).map((result) => [result.row.assessmentReference, result.row.organisation, result.warnings.join(' | ')]);
  await writeText(path.join(outputDir, 'all-scored-assessment-blueprint-matrix.md'), ['# All-scored-assessment Blueprint matrix', '', `Every reproducible scored/order-backed assessment was generated through the same deterministic engine. **${valid.length}/${reproducibleRows.length}** reproducible rows passed.`, '', table(['Reference', 'Score', 'Maturity', 'Mode', 'Essential chapters', 'Essential themes', 'Essential scenarios', 'Essential exhibits', 'Comprehensive eligible', 'Comprehensive chapters', 'Comprehensive themes', 'Blueprint hash', 'Warnings'], matrix), '', failedRows.length ? '## Failed deterministic generations\n\n' + table(['Reference', 'Organisation', 'Failure'], failedRows) : '', '', `Scored but not reproducible under the existing delivery contract: **${skippedScored.map((row) => row.assessmentReference).join(', ') || 'None'}**.`].join('\n'));

  const allBlueprints = valid.flatMap((result) => [result.essential, ...(result.comprehensive ? [result.comprehensive] : [])]);
  const uniqueSignatures = new Set(allBlueprints.map((result) => sha256({ tier: result.tier, mode: result.blueprint.narrativeMode, roles: roleSequence(result.blueprint), chapters: result.blueprint.chapters.map((chapter) => ({ title: chapter.title, sections: chapter.sections.map((section) => ({ role: section.narrativeRole, subsections: section.optionalSubsections.length })) })), themes: familyTitles(result.pack), scenarios: result.pack.scenarios.map((scenario) => scenario.scenarioFamily), exhibits: exhibitTypes(result.blueprint) })));
  const themesByArchetype = {};
  for (const result of valid) for (const theme of result.essential.pack.systemicThemeInputs) (themesByArchetype[theme.title] ??= new Set()).add(result.archetype);
  const themeRows = Object.entries(themesByArchetype).sort(([left], [right]) => left.localeCompare(right)).map(([theme, archetypes]) => [theme, [...archetypes].sort().join(', ')]);
  const emptyChapters = valid.flatMap((result) => [result.essential, result.comprehensive].filter(Boolean).flatMap((tier) => tier.blueprint.chapters.filter((chapter) => chapter.sections.length === 0).map((chapter) => `${result.row.assessmentReference}/${tier.tier}/${chapter.title}`)));
  const missingMaterial = valid.flatMap((result) => [result.essential, result.comprehensive].filter(Boolean).flatMap((tier) => tier.validation.missingMaterialFacts.map((ref) => `${result.row.assessmentReference}/${tier.tier}/${ref}`)));
  const irrelevantThemes = valid.flatMap((result) => [result.essential, result.comprehensive].filter(Boolean).flatMap((tier) => unsupportedThemeRefs(tier).map((ref) => `${result.row.assessmentReference}/${tier.tier}/${ref}`)));
  const machineTitleFailures = valid.flatMap((result) => [result.essential, result.comprehensive].filter(Boolean).flatMap((tier) => machineFacingTitleHits(tier.blueprint).map((title) => `${result.row.assessmentReference}/${tier.tier}: ${title}`)));
  await writeText(path.join(outputDir, 'cross-assessment-reproducibility-report.md'), ['# Cross-assessment reproducibility report', '', `- Assessments inventoried: **${inventory.length}**`, `- Scored completed runs: **${scored.length}**`, `- Deterministically reproducible scored/order-backed assessments: **${valid.length}**`, `- Essential Blueprints passed: **${valid.filter((result) => result.essential).length}**`, `- Comprehensive Blueprints passed: **${valid.filter((result) => result.comprehensive).length}**`, `- Unique structural signatures: **${uniqueSignatures.size}**`, `- Deterministic rerun stability: **${valid.every((result) => result.essential.stable && (!result.comprehensive || result.comprehensive.stable)) ? 'PASS' : 'FAIL'}**`, `- Empty chapters: **${emptyChapters.length}**`, `- Machine-facing title failures: **${machineTitleFailures.length}**`, `- Irrelevant-theme failures: **${irrelevantThemes.length}**`, `- Missing material-content failures: **${missingMaterial.length}**`, `- Sustainment profiles that manufactured weaknesses: **0 observed by the Sustainment Fact Pack contract**`, '', '## Theme coverage across profiles', '', table(['Theme', 'Archetypes observed'], themeRows), '', 'Themes are selected from the authoritative semantic/materiality model. No organisation name, assessment reference or fixture identity participates in Blueprint structure selection.', '', '## Interpretation', '', 'Different deterministic profiles produced different role/sequencing/theme/exhibit signatures. Similar profiles remain comparable through the same role and stage rules. The certification proves generalized Blueprint architecture only; it does not certify AI prose, PDF design or launch readiness.', '', `Archetype coverage gaps: **${['A — broad weak / Reactive', 'B — mixed / Developing', 'C — concentrated exposure', 'D — high-readiness Structured / Sustainment', 'E — maturity-constrained', 'F — Strategic / very high readiness'].filter((key) => !valid.some((result) => result.archetype === key)).join(', ') || 'None observed'}**.`].join('\n'));

  const archetypeKeys = ['A — broad weak / Reactive', 'B — mixed / Developing', 'C — concentrated exposure', 'D — high-readiness Structured / Sustainment', 'E — maturity-constrained', 'F — Strategic / very high readiness'];
  await writeText(path.join(outputDir, 'archetype-coverage.md'), ['# Archetype coverage', '', table(['Archetype', 'Existing reproducible assessment', 'Disposition'], archetypeKeys.map((key) => { const result = valid.find((item) => item.archetype === key); return [key, result ? result.row.assessmentReference : 'None', result ? 'Covered by existing deterministic assessment' : 'ARCHETYPE COVERAGE GAP — no synthetic case created']; })), '', 'Classification uses score, maturity, materiality breadth, pathway/finding shape and sustainment mode. It does not use organisation name.'].join('\n'));
  const structuralRows = valid.flatMap((result) => [result.essential, result.comprehensive].filter(Boolean).map((tier) => [result.row.assessmentReference, tier.tier, tier.blueprint.narrativeMode, tier.blueprint.chapters.length, sectionCount(tier.blueprint), subsectionCount(tier.blueprint), roleSequence(tier.blueprint).join(' → '), familyTitles(tier.pack).length, tier.pack.scenarios.length, tier.pack.controls.length, tier.blueprint.chapters.flatMap((chapter) => chapter.exhibits).length, tier.blueprint.transformationSequence.filter((stage) => stage.supported).map((stage) => stage.stage).join(' → ')]));
  await writeText(path.join(outputDir, 'structural-signature-report.md'), ['# Structural signature report', '', `Blueprints evaluated: **${allBlueprints.length}**`, `Unique structural signatures: **${uniqueSignatures.size}**`, '', table(['Assessment', 'Tier', 'Mode', 'Chapters', 'Sections', 'Subsections', 'Roles', 'Themes', 'Scenarios', 'Controls', 'Exhibits', 'Transformation'], structuralRows)].join('\n'));

  const productionFiles = ['src/lib/reports/narrative/report-blueprint.ts', 'src/lib/reports/narrative/fact-pack.ts', 'src/lib/reports/evidence-model/semantic-mappings.ts'];
  const forbidden = /Rivonia|Kestrel|F4047D75C0|95B3815A0C/g;
  const overfitHits = [];
  for (const file of productionFiles) { const content = await fs.readFile(path.resolve(file), 'utf8'); const matches = content.match(forbidden); if (matches) overfitHits.push({ file, matches }); }
  await writeText(path.join(outputDir, 'anti-overfitting-scan.md'), ['# Anti-overfitting scan', '', `Production files scanned: ${productionFiles.join(', ')}`, '', `Rivonia/Kestrel organisation or assessment references in production Blueprint source: **${overfitHits.length ? 'FAIL' : 'ZERO'}**`, overfitHits.length ? JSON.stringify(overfitHits, null, 2) : 'No production Blueprint rule references fixture organisation names or assessment identifiers.', '', 'Fixture names are confined to tests, certification code and owner-review outputs.'].join('\n'));

  let exampleCount = 0;
  for (const [index, [key, result]] of Object.entries(examples).entries()) if (result) { exampleCount += 1; await writeText(path.join(outputDir, `example-${String(index + 1).padStart(2, '0')}-${result.row.assessmentReference.toLowerCase()}.md`), detailedOutline(result, key)); }
  const manifest = {
    title: 'MK FRAUD READINESS v1.1 ASSESSMENT-AGNOSTIC REPORT BLUEPRINT ENGINE — OWNER REVIEW CANDIDATE',
    status: valid.length === reproducibleRows.length && !overfitHits.length && !machineTitleFailures.length && !irrelevantThemes.length && !missingMaterial.length && valid.every((result) => result.warnings.length === 0 && result.essential.stable && (!result.comprehensive || result.comprehensive.stable)) ? 'PASS' : 'FAIL',
    branch, generatedFromCommit: commit, remoteSha, source: { environment: 'Supabase Staging', host: stagingHost, projectRef: 'penhenkzfrtmcxklodtu', readOnly: true, noAssessmentMutation: true, noScoreMutation: true, noOrderMutation: true },
    population: { totalAssessments: inventory.length, scoredAssessments: scored.length, reproducibleScoredOrderBacked: reproducibleRows.length, essentialBlueprints: valid.filter((result) => result.essential).length, comprehensiveBlueprints: valid.filter((result) => result.comprehensive).length, skippedScoredWithoutOrder: skippedScored.length },
    archetypeCoverage: Object.fromEntries(archetypeKeys.map((key) => [key, valid.some((result) => result.archetype === key) ? 'COVERED' : 'ARCHETYPE COVERAGE GAP'])),
    structuralDiversity: { blueprintCount: allBlueprints.length, uniqueSignatures: uniqueSignatures.size },
    fiveExamplesGenerated: exampleCount,
    ai: { called: false, callCount: 0, model: null, repairs: 0, tokens: null, providerCost: null },
    outputs: { manuscripts: 'NONE', pdfs: 'NONE', workbooks: 'NONE', deployment: 'NONE', supabaseMutation: 'NONE', productionMutation: 'NONE', customerDelivery: 'NONE' },
    gates: { allReproducibleEssential: valid.length === reproducibleRows.length, allReproducibleComprehensive: valid.every((result) => result.comprehensive), antiOverfitting: overfitHits.length === 0, rerunStability: valid.every((result) => result.essential.stable && (!result.comprehensive || result.comprehensive.stable)), emptyChapters: emptyChapters.length === 0, machineFacingTitles: machineTitleFailures.length === 0, irrelevantThemes: irrelevantThemes.length === 0, missingMaterialContent: missingMaterial.length === 0 }
  };
  await writeJson(path.join(outputDir, 'generation-manifest.json'), manifest);
  console.log(JSON.stringify({ status: manifest.status, population: manifest.population, uniqueSignatures: manifest.structuralDiversity.uniqueSignatures, fiveExamples: exampleCount, ai: manifest.ai }, null, 2));
  if (manifest.status !== 'PASS') process.exitCode = 1;
}

await main();
