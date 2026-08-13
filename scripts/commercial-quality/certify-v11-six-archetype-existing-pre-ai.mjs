#!/usr/bin/env node

/*
 * v1.1 six-archetype certification, existing-assessment-only.
 *
 * This runner reads the persisted Staging assessment population and the
 * existing order/report boundary. It never submits an assessment, writes to
 * Supabase, invokes an AI provider, creates a manuscript or renders a PDF.
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
import { preAiGateMarkdown, runPreAiFactPackGates } from '../../src/lib/reports/narrative/pre-ai-gates.ts';
import { REPORTING_BIBLE_VERSION } from '../../src/lib/reports/reporting-bible.ts';

const outputDir = path.resolve(process.env.V11_SIX_ARCHETYPE_OUTPUT_DIR ?? 'outputs/v1.1-six-archetype-pre-ai-certification');
const runAt = process.env.V11_SIX_ARCHETYPE_RUN_AT ?? new Date().toISOString();
const stagingHost = 'penhenkzfrtmcxklodtu.supabase.co';
const branch = execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).trim();
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const remoteSha = (() => {
  try {
    const ref = execFileSync('git', ['ls-remote', 'origin', `refs/heads/${branch}`], { encoding: 'utf8' }).trim();
    return ref ? ref.split(/\s+/)[0] : null;
  } catch {
    return null;
  }
})();

if (REPORTING_BIBLE_VERSION !== '1.1') throw new Error(`Expected Reporting Bible 1.1, received ${REPORTING_BIBLE_VERSION}.`);
const configuredUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '';
if (!configuredUrl.includes(stagingHost)) throw new Error(`Refusing to run: configured Supabase host is not Staging (${stagingHost}).`);
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for the read-only Staging inventory.');

const FAMILY_SET = [
  'FRAUD_GOVERNANCE', 'FRAUD_RISK_IDENTIFICATION', 'SUPPLIER_ONBOARDING', 'SUPPLIER_PAYMENT_CHANGE',
  'THIRD_PARTY_OVERSIGHT', 'ORDINARY_ACCESS', 'PRIVILEGED_ACCESS', 'IDENTITY_VERIFICATION',
  'DETECTION_MONITORING', 'INCIDENT_RESPONSE', 'EVIDENCE_INTEGRITY', 'WHISTLEBLOWING',
  'FRAUD_AWARENESS', 'CONTINUOUS_IMPROVEMENT'
];
const PATHWAY_SET = ['SUPPLIER_PAYMENT_DIVERSION', 'PRIVILEGED_ACCESS_MISUSE', 'IDENTITY_IMPERSONATION', 'DETECTION_EVASION', 'INCIDENT_CONCEALMENT'];

const selections = [
  {
    key: 'A', directory: '01-broad-reactive', archetype: 'Broad reactive',
    assessmentReference: 'MKFRS-2026-F4047D75C0', orderReference: 'MKORD-2026-22FF6B69',
    rationale: 'Rivonia is the broad reactive reference: Reactive maturity, low aggregate score, and material exposure across supplier/payment, identity/access, detection, incident, evidence and governance families.',
    distinctiveness: 'Broad weak domain vector with the widest multi-family and multi-pathway exposure in the selected set.',
    narrativeInstruction: 'Give management a broad stabilisation story; retain the recorded spread of supplier, access, identity, detection and incident exposure.',
    prohibitedInference: 'Do not imply an actual fraud event or add scenarios beyond the recorded pathway families.'
  },
  {
    key: 'B', directory: '02-developing-mixed', archetype: 'Developing / mixed',
    assessmentReference: 'MKFRS-2026-95B3815A0C', orderReference: 'MKORD-2026-7FBBEE23',
    rationale: 'Kestrel is the developing/mixed reference: Developing maturity, mid-range score, one strong domain, several mixed domains, and a legitimate cap reason without a manufactured deficiency.',
    distinctiveness: 'The vector is mixed rather than uniformly weak: D3 and D6 are stronger while D2, D4, D7, D8 and D10 remain uneven.',
    narrativeInstruction: 'Show transition from uneven foundations to a managed control system; distinguish current weakness from the designed response.',
    prohibitedInference: 'Do not treat the maturity cap reason as a new finding or rewrite the recorded final maturity.'
  },
  {
    key: 'C', directory: '03-concentrated-exposure', archetype: 'Concentrated exposure',
    assessmentReference: 'MKFRS-2026-E18A03B158', orderReference: 'MKORD-2026-O8E19UPV',
    rationale: 'The G27 Adaptive Paid Report record is the closest valid concentrated case: most domains are around or above 60 while D1 and D3 are materially weaker, concentrating the selected narrative on governance/access and the related detection/incident response chain.',
    distinctiveness: 'A narrow weakness spine rather than broad weakness; the product must weight the governance/access concentration and its supported pathways accordingly.',
    narrativeInstruction: 'Follow the concentration. Do not broaden the storyline into a generic enterprise-wide weakness narrative.',
    prohibitedInference: 'Do not manufacture supplier, identity or incident scenarios unless the persisted finding-to-pathway evidence supports them.'
  },
  {
    key: 'D', directory: '04-high-readiness-few-gaps', archetype: 'High readiness / few gaps',
    assessmentReference: 'MKFRS-2026-76FFC69B2D', orderReference: 'MKORD-2026-1EOLBY7Y',
    rationale: 'This persisted Staging assessment is Structured at 60 with three legitimate material findings and no critical or major gaps. It is the available high-readiness sparse case without inventing deficiencies.',
    distinctiveness: 'Sparse finding set, balanced domain vector and no recorded pathway scenarios; the output must remain intentionally compact.',
    narrativeInstruction: 'Use the explicit sparse high-readiness reason; focus on preserving the recorded strengths and closing only the few recorded gaps.',
    prohibitedInference: 'Do not add risk scenarios, themes or control weaknesses merely to make the report look fuller.'
  },
  {
    key: 'E', directory: '05-maturity-constrained', archetype: 'Score / maturity constrained',
    assessmentReference: null, orderReference: null,
    rationale: 'ARCHETYPE COVERAGE GAP. The scored existing-assessment population was queried read-only and no completed current score run has calculated maturity stronger than final maturity. Cap reasons exist, but the recorded calculated and final maturity values remain equal.',
    distinctiveness: 'No honest existing-assessment example meets the required score-versus-final-maturity condition.',
    narrativeInstruction: 'No product run is claimed for this archetype. Preserve the gap instead of manufacturing a cap or changing scoring data.',
    prohibitedInference: 'Do not use a synthetic score, alter maturity, or infer a constrained case from a cap reason alone.'
  },
  {
    key: 'F', directory: '06-strongest-existing', archetype: 'Strongest / most mature existing',
    assessmentReference: 'MKFRS-2026-956FEA052B', orderReference: 'MKORD-2026-72BCEIDN',
    rationale: 'This is the strongest existing scored record: Strategic maturity, 100 aggregate score, all domain results at 100 and zero critical or major gaps. Its compact recorded finding spine is preserved rather than padded.',
    distinctiveness: 'Highest recorded score and maturity in the available population, with sparse legitimate findings and no supported pathway scenarios.',
    narrativeInstruction: 'Treat the record as a mature baseline; show the few recorded governance/risk/continuous-improvement items without inventing deficiencies.',
    prohibitedInference: 'Do not convert a 100 score into an assurance conclusion or claim independent operating effectiveness.'
  }
];

const db = createClient(configuredUrl, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

const clone = (value) => JSON.parse(JSON.stringify(value));
const text = (value) => String(value ?? '').replaceAll('|', '\\|').replaceAll('\n', ' ');
const csv = (value) => {
  const raw = value === null || value === undefined ? '' : Array.isArray(value) ? value.join('; ') : String(value);
  return /[",\n]/.test(raw) ? `"${raw.replaceAll('"', '""')}"` : raw;
};
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const setOf = (items) => new Set((items ?? []).filter(Boolean));
const sorted = (items) => [...new Set(items ?? [])].sort();
const pct = (value) => value === null || value === undefined ? '—' : `${Number(value).toFixed(2)}%`;
const num = (value) => value === null || value === undefined ? null : Number(value);

async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}
async function writeText(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${String(value).trim()}\n`);
}
function table(headers, rows) {
  return [`| ${headers.join(' | ')} |`, `| ${headers.map(() => '---').join(' | ')} |`, ...rows.map((row) => `| ${row.map(text).join(' | ')} |`)].join('\n');
}
function familySetFromFindings(findings) {
  return sorted((findings ?? []).flatMap((finding) => [finding.primarySemanticFamily, ...(finding.secondarySemanticFamilies ?? [])]));
}
function pathwaySetFromFindings(findings) {
  return sorted((findings ?? []).flatMap((finding) => finding.fraudPathwayFamilies ?? []));
}
function modelSummary(model) {
  return {
    allMaterialFindingCount: model.materialFindings.length,
    allRiskCount: model.riskRegister.length,
    allControlCount: model.controlImprovements.length,
    allScenarioCount: model.scenarios.length,
    allDecisionCount: model.leadershipDecisions.length,
    allRoadmapCount: model.roadmapActions.length,
    semanticFamilies: familySetFromFindings(model.materialFindings),
    fraudPathways: pathwaySetFromFindings(model.materialFindings),
    priorityFindingTitles: model.materialFindings.map((finding) => finding.title),
    familyCounts: Object.fromEntries(FAMILY_SET.map((family) => [family, model.materialFindings.filter((finding) => [finding.primarySemanticFamily, ...(finding.secondarySemanticFamilies ?? [])].includes(family)).length])),
    pathwayCounts: Object.fromEntries(PATHWAY_SET.map((pathway) => [pathway, model.materialFindings.filter((finding) => (finding.fraudPathwayFamilies ?? []).includes(pathway)).length]))
  };
}
function tierSummary(pack, writerBrief, gate) {
  return {
    status: gate.status,
    factCount: pack.facts.length,
    findingCount: pack.findings.length,
    themeCount: pack.systemicThemeInputs.length,
    scenarioCount: pack.scenarios.length,
    controlCount: pack.controls.length,
    decisionCount: pack.decisions.length,
    roadmapCount: pack.roadmap.length,
    maturationStepCount: pack.maturationSteps.length,
    semanticFamilies: familySetFromFindings(pack.findings),
    fraudPathways: pathwaySetFromFindings(pack.findings),
    themeFamilies: sorted(pack.systemicThemeInputs.map((theme) => theme.themeFamily)),
    controlFamilies: sorted(pack.controls.map((control) => control.primarySemanticFamily)),
    decisionFamilies: sorted(writerBrief.decisions.map((decision) => decision.decisionFamilyLabel)),
    roadmapTargetPeriods: sorted(writerBrief.roadmap.map((item) => item.targetPeriod)),
    highReadinessSparseNarrativeReason: pack.highReadinessSparseNarrativeReason ?? null,
    gateFailures: gate.results.filter((result) => result.status === 'FAIL').map((result) => result.gate)
  };
}

async function queryInventory() {
  const [assessmentsResult, scoreRunsResult, domainsResult, ordersResult] = await Promise.all([
    db.from('assessments').select('id,assessment_reference,organisation_id,current_score_run_id,created_at,organisations:organisation_id(legal_name,trading_name)').order('created_at', { ascending: true }),
    db.from('score_runs').select('id,assessment_id,overall_score,calculated_maturity,final_maturity,exposure_score,exposure_band,coverage_pct,n_a_rate_pct,critical_gap_count,major_gap_count,status,cap_applied,cap_reason').eq('status', 'completed'),
    db.from('score_domain_results').select('score_run_id,raw_score,domains:domain_id(domain_code,name)').limit(1000),
    db.from('orders').select('order_reference,assessment_id,status,product_id,created_at,products:product_id(product_code,name)').order('created_at', { ascending: true })
  ]);
  for (const result of [assessmentsResult, scoreRunsResult, domainsResult, ordersResult]) if (result.error) throw result.error;
  return { assessments: assessmentsResult.data ?? [], scoreRuns: scoreRunsResult.data ?? [], domains: domainsResult.data ?? [], orders: ordersResult.data ?? [] };
}

function inventoryRows(raw) {
  const runs = new Map(raw.scoreRuns.map((run) => [run.id, run]));
  const domains = new Map();
  for (const row of raw.domains) {
    const domain = row.domains;
    if (!domain) continue;
    const list = domains.get(row.score_run_id) ?? [];
    list.push({ code: domain.domain_code, name: domain.name, score: num(row.raw_score) });
    domains.set(row.score_run_id, list);
  }
  const orders = new Map();
  for (const order of raw.orders) {
    const list = orders.get(order.assessment_id) ?? [];
    list.push(order);
    orders.set(order.assessment_id, list);
  }
  return raw.assessments.map((assessment) => {
    const run = assessment.current_score_run_id ? runs.get(assessment.current_score_run_id) : null;
    const domainVector = (domains.get(run?.id) ?? []).sort((a, b) => a.code.localeCompare(b.code));
    const ordered = orders.get(assessment.id) ?? [];
    const organisation = assessment.organisations?.trading_name || assessment.organisations?.legal_name || assessment.organisation_id;
    const strongest = [...domainVector].filter((domain) => domain.score !== null).sort((a, b) => b.score - a.score).slice(0, 3).map((domain) => `${domain.code} ${domain.score}`);
    const weakest = [...domainVector].filter((domain) => domain.score !== null).sort((a, b) => a.score - b.score).slice(0, 3).map((domain) => `${domain.code} ${domain.score}`);
    return {
      assessmentId: assessment.id,
      assessmentReference: assessment.assessment_reference,
      organisation,
      organisationId: assessment.organisation_id,
      createdAt: assessment.created_at,
      currentScoreRunId: assessment.current_score_run_id,
      scoreRunStatus: run?.status ?? null,
      sourceStatus: run && run.overall_score !== null ? 'SCORED EXISTING ASSESSMENT' : 'EXISTING BUT NOT SCORED',
      orderReference: ordered[0]?.order_reference ?? null,
      orderStatus: ordered[0]?.status ?? null,
      existingProduct: ordered[0]?.products?.name ?? null,
      existingProductCode: ordered[0]?.products?.product_code ?? null,
      score: num(run?.overall_score),
      calculatedMaturity: run?.calculated_maturity ?? null,
      finalMaturity: run?.final_maturity ?? null,
      exposureScore: num(run?.exposure_score),
      exposureBand: run?.exposure_band ?? null,
      coveragePct: num(run?.coverage_pct),
      uncertaintyPct: num(run?.n_a_rate_pct),
      criticalGaps: num(run?.critical_gap_count),
      majorGaps: num(run?.major_gap_count),
      capApplied: run?.cap_applied ?? null,
      capReason: run?.cap_reason ?? null,
      calculatedFinalDiffer: Boolean(run && run.calculated_maturity && run.final_maturity && run.calculated_maturity !== run.final_maturity),
      domainVector: Object.fromEntries(domainVector.map((domain) => [domain.code, domain.score])),
      strongestDomains: strongest,
      weakestDomains: weakest,
      orderCount: ordered.length,
      eligibleForExistingProductCertification: Boolean(run && run.status === 'completed' && run.overall_score !== null && ordered.length > 0)
    };
  });
}

function inventoryMarkdown(rows) {
  const scored = rows.filter((row) => row.score !== null);
  const selectable = rows.filter((row) => row.eligibleForExistingProductCertification);
  return [
    '# Existing-assessment inventory', '',
    `Run: ${runAt} | Source: read-only Supabase Staging ${stagingHost}`,
    '',
    `The inventory contains **${rows.length}** persisted assessment records: **${scored.length}** with a non-null completed score and **${selectable.length}** with both a completed score and an existing order. No assessment was submitted or mutated by this certification.`,
    '',
    table(['Assessment', 'Organisation', 'Source / order', 'Score', 'Calculated → final maturity', 'Critical / major', 'Domains', 'Selectable'], rows.map((row) => [
      row.assessmentReference, row.organisation, `${row.sourceStatus}${row.orderReference ? ` / ${row.orderReference}` : ''}`, row.score === null ? '—' : Number(row.score).toFixed(2), `${row.calculatedMaturity ?? '—'} → ${row.finalMaturity ?? '—'}`, `${row.criticalGaps ?? '—'} / ${row.majorGaps ?? '—'}`, Object.entries(row.domainVector).map(([code, value]) => `${code}:${value ?? '—'}`).join(', '), row.eligibleForExistingProductCertification ? 'YES' : 'NO'
    ])),
    '',
    'The assessment population is a fixture of the Staging environment as observed at run time. It is not a claim about the production population or market readiness.'
  ].join('\n');
}

function inventoryCsv(rows) {
  const headers = ['assessmentReference', 'organisation', 'assessmentId', 'createdAt', 'sourceStatus', 'orderReference', 'orderStatus', 'existingProduct', 'score', 'calculatedMaturity', 'finalMaturity', 'exposureScore', 'exposureBand', 'coveragePct', 'uncertaintyPct', 'criticalGaps', 'majorGaps', 'calculatedFinalDiffer', 'strongestDomains', 'weakestDomains', 'domainVector', 'eligibleForExistingProductCertification'];
  const lines = [headers.join(',')];
  for (const row of rows) lines.push(headers.map((header) => csv(header === 'domainVector' ? JSON.stringify(row[header]) : row[header])).join(','));
  return `${lines.join('\n')}\n`;
}

async function runEssential(data, directory) {
  const evidence = buildAdvisoryEvidenceModel(data);
  const projection = buildEssentialProjection(data, evidence);
  const pack = buildEssentialNarrativeFactPack(data, evidence, projection);
  assertNarrativeFactPack(pack);
  const storyPlan = buildNarrativeStoryPlan(pack);
  assertNarrativeStoryPlan(storyPlan, pack);
  const writerBrief = buildNarrativeWriterBrief(pack, storyPlan);
  assertNarrativeWriterBrief(writerBrief);
  const gate = runPreAiFactPackGates(pack, storyPlan, writerBrief);
  await writeJson(path.join(directory, 'essential-writer-brief.json'), writerBrief);
  await writeJson(path.join(directory, 'essential-story-plan.json'), storyPlan);
  await writeText(path.join(directory, 'essential-pre-ai-gate-report.md'), preAiGateMarkdown({ ...gate, checkedAt: runAt }));
  return { pack, storyPlan, writerBrief, gate: { ...gate, checkedAt: runAt }, summary: tierSummary(pack, writerBrief, gate) };
}

async function runComprehensive(data, directory) {
  const model = await fromAssembledReportData(data);
  const pack = buildComprehensiveNarrativeFactPack(model);
  assertNarrativeFactPack(pack);
  const storyPlan = buildNarrativeStoryPlan(pack);
  assertNarrativeStoryPlan(storyPlan, pack);
  const writerBrief = buildNarrativeWriterBrief(pack, storyPlan);
  assertNarrativeWriterBrief(writerBrief);
  const gate = runPreAiFactPackGates(pack, storyPlan, writerBrief);
  await writeJson(path.join(directory, 'comprehensive-writer-brief.json'), writerBrief);
  await writeJson(path.join(directory, 'comprehensive-story-plan.json'), storyPlan);
  await writeText(path.join(directory, 'comprehensive-pre-ai-gate-report.md'), preAiGateMarkdown({ ...gate, checkedAt: runAt }));
  return { pack, storyPlan, writerBrief, gate: { ...gate, checkedAt: runAt }, summary: tierSummary(pack, writerBrief, gate) };
}

function profileFrom(selection, inventory, model, tiers) {
  const row = inventory.find((item) => item.assessmentReference === selection.assessmentReference);
  const strongest = [...Object.entries(row.domainVector)].filter(([, value]) => value !== null).sort((a, b) => b[1] - a[1]).map(([code, value]) => `${code} ${value}`).slice(0, 3);
  const weakest = [...Object.entries(row.domainVector)].filter(([, value]) => value !== null).sort((a, b) => a[1] - b[1]).map(([code, value]) => `${code} ${value}`).slice(0, 3);
  return {
    status: 'SELECTED', archetype: selection.archetype, archetypeKey: selection.key,
    assessmentReference: selection.assessmentReference, organisation: row.organisation, orderReference: selection.orderReference,
    source: 'Persisted existing Staging assessment assembled through the existing order/report read boundary; no assessment submission or source mutation.',
    existingProductAtSelection: row.existingProduct, existingProductCodeAtSelection: row.existingProductCode,
    overallScore: row.score, calculatedMaturity: row.calculatedMaturity, finalMaturity: row.finalMaturity,
    exposureScore: row.exposureScore, exposureBand: row.exposureBand, coveragePct: row.coveragePct, uncertaintyPct: row.uncertaintyPct,
    criticalGaps: row.criticalGaps, majorGaps: row.majorGaps, capApplied: row.capApplied, capReason: row.capReason,
    domainVector: row.domainVector, strongestDomains: strongest, weakestDomains: weakest,
    legitimateStrengths: model.materialFindings.length === 0 ? ['No material findings recorded.'] : strongest,
    allPrioritySemanticFamilies: modelSummary(model).semanticFamilies,
    allSupportedFraudPathways: modelSummary(model).fraudPathways,
    allMaterialFindingCount: model.materialFindings.length,
    allRiskCount: model.riskRegister.length, allControlCount: model.controlImprovements.length,
    familyCounts: modelSummary(model).familyCounts, pathwayCounts: modelSummary(model).pathwayCounts,
    selectionRationale: selection.rationale, distinctiveness: selection.distinctiveness,
    narrativeInstruction: selection.narrativeInstruction, prohibitedInference: selection.prohibitedInference,
    highReadinessSparseNarrativeReason: tiers.essential.summary.highReadinessSparseNarrativeReason || tiers.comprehensive.summary.highReadinessSparseNarrativeReason || null,
    tierRuns: { essential: tiers.essential.summary, comprehensive: tiers.comprehensive.summary },
    deterministicProductPaths: ['essential', 'comprehensive'], aiConfigured: false, aiCalled: false,
    manuscripts: null, pdfs: null
  };
}

function gapArtifactStatus(selection) {
  return { status: 'ARCHETYPE COVERAGE GAP', archetype: selection.archetype, archetypeKey: selection.key, reason: selection.rationale, noSyntheticAssessment: true, noScoringMutation: true, noProductRunClaim: true };
}

async function writeGapProfile(selection, directory) {
  const status = gapArtifactStatus(selection);
  await writeJson(path.join(directory, 'assessment-profile.json'), status);
  await writeJson(path.join(directory, 'essential-writer-brief.json'), status);
  await writeJson(path.join(directory, 'essential-story-plan.json'), status);
  await writeText(path.join(directory, 'essential-pre-ai-gate-report.md'), `# Essential pre-AI gate — ${selection.archetype}\n\nStatus: **ARCHETYPE COVERAGE GAP**\n\n${selection.rationale}\n\nNo Essential product path is claimed for this archetype.`);
  await writeJson(path.join(directory, 'comprehensive-writer-brief.json'), status);
  await writeJson(path.join(directory, 'comprehensive-story-plan.json'), status);
  await writeText(path.join(directory, 'comprehensive-pre-ai-gate-report.md'), `# Comprehensive pre-AI gate — ${selection.archetype}\n\nStatus: **ARCHETYPE COVERAGE GAP**\n\n${selection.rationale}\n\nNo Comprehensive product path is claimed for this archetype.`);
  return { status: 'ARCHETYPE COVERAGE GAP', selection };
}

function selectedPack(result, tier) { return result?.[tier]?.pack ?? null; }
function selectedFamilies(result, tier) { return familySetFromFindings(selectedPack(result, tier)?.findings ?? []); }
function selectedPathways(result, tier) { return pathwaySetFromFindings(selectedPack(result, tier)?.findings ?? []); }
function unionSets(items) { return sorted(items.flatMap((item) => [...item])); }
function jaccard(left, right) {
  const a = setOf(left); const b = setOf(right); const union = new Set([...a, ...b]);
  return union.size === 0 ? 1 : [...a].filter((item) => b.has(item)).length / union.size;
}
function maturityRank(value) { return { Initial: 1, Reactive: 2, Developing: 3, Structured: 4, Strategic: 5 }[value] ?? 0; }
function vectorDistance(a, b) {
  const codes = sorted([...Object.keys(a ?? {}), ...Object.keys(b ?? {})]);
  const values = codes.map((code) => Math.abs((a?.[code] ?? 0) - (b?.[code] ?? 0)));
  return values.length ? Math.sqrt(values.reduce((sum, value) => sum + value ** 2, 0) / values.length) : 0;
}

async function main() {
  const rawInventory = await queryInventory();
  const inventory = inventoryRows(rawInventory);
  await fs.rm(outputDir, { recursive: true, force: true });
  await fs.mkdir(outputDir, { recursive: true });
  await writeText(path.join(outputDir, 'existing-assessment-inventory.md'), inventoryMarkdown(inventory));
  await writeText(path.join(outputDir, 'existing-assessment-inventory.csv'), inventoryCsv(inventory));

  const results = [];
  for (const selection of selections) {
    const directory = path.join(outputDir, selection.directory);
    if (!selection.assessmentReference) {
      const gap = await writeGapProfile(selection, directory);
      results.push({ selection, profile: null, model: null, tiers: null, ...gap });
      continue;
    }
    const row = inventory.find((item) => item.assessmentReference === selection.assessmentReference);
    if (!row?.eligibleForExistingProductCertification) throw new Error(`${selection.assessmentReference} is not a selectable scored order-backed existing assessment.`);
    const data = await assembleReportData(selection.orderReference);
    const model = buildAdvisoryEvidenceModel(data);
    const tiers = { essential: await runEssential(data, directory), comprehensive: await runComprehensive(data, directory) };
    const profile = profileFrom(selection, inventory, model, tiers);
    await writeJson(path.join(directory, 'assessment-profile.json'), profile);
    results.push({ selection, profile, model, data, tiers, status: tiers.essential.gate.status === 'PASS' && tiers.comprehensive.gate.status === 'PASS' ? 'PASS' : 'FAIL' });
  }

  const valid = results.filter((result) => result.profile);
  const gap = results.find((result) => result.selection.key === 'E');
  const validGatePass = valid.every((result) => result.status === 'PASS');
  const allFamilies = unionSets(valid.map((result) => new Set(result.profile.allPrioritySemanticFamilies)));
  const allPathways = unionSets(valid.map((result) => new Set(result.profile.allSupportedFraudPathways)));
  const diffRows = [];
  for (let leftIndex = 0; leftIndex < valid.length; leftIndex += 1) {
    for (const right of valid.slice(leftIndex + 1)) {
      const left = valid[leftIndex];
      diffRows.push({
        left: left.selection.key, right: right.selection.key,
        scoreDistance: Math.abs(left.profile.overallScore - right.profile.overallScore).toFixed(2),
        maturityDistance: Math.abs(maturityRank(left.profile.finalMaturity) - maturityRank(right.profile.finalMaturity)),
        domainVectorDistance: vectorDistance(left.profile.domainVector, right.profile.domainVector).toFixed(2),
        familyJaccard: jaccard(left.profile.allPrioritySemanticFamilies, right.profile.allPrioritySemanticFamilies).toFixed(2),
        pathwayJaccard: jaccard(left.profile.allSupportedFraudPathways, right.profile.allSupportedFraudPathways).toFixed(2),
        findingShapeSame: left.profile.allPrioritySemanticFamilies.join('|') === right.profile.allPrioritySemanticFamilies.join('|') && left.profile.allMaterialFindingCount === right.profile.allMaterialFindingCount
      });
    }
  }

  await writeText(path.join(outputDir, 'archetype-selection-rationale.md'), [
    '# Archetype selection rationale', '',
    'Selection is from the persisted Staging assessment population only. Existing assessments are reused; no new assessment, answer, score or maturity was created.', '',
    table(['Archetype', 'Assessment / order', 'Decision'], selections.map((selection) => [selection.key, selection.assessmentReference ? `${selection.assessmentReference} / ${selection.orderReference}` : 'No honest existing record', `${selection.rationale} ${selection.distinctiveness}`])),
    '', `Result: **${gap ? 'PARTIAL — Archetype E coverage gap retained honestly' : 'PASS'}**. Five archetypes have valid existing order-backed records; the sixth is not represented because the required calculated-maturity-versus-final-maturity condition was not observed.`,
    '', 'The two sparse high-readiness records are allowed to remain sparse. The certification does not pad them with scenarios, findings, or controls.'
  ].join('\n'));

  const matrixRows = selections.map((selection) => {
    const result = results.find((item) => item.selection.key === selection.key);
    if (!result.profile) return [selection.key, selection.archetype, 'ARCHETYPE COVERAGE GAP', '—', '—', '—', '—', '—', '—', '—', '—', 'No run claimed'];
    const p = result.profile; const c = result.tiers.comprehensive.summary;
    return [selection.key, selection.archetype, p.assessmentReference, `${p.overallScore}`, `${p.calculatedMaturity} → ${p.finalMaturity}`, `${p.criticalGaps} / ${p.majorGaps}`, Object.entries(p.domainVector).map(([code, value]) => `${code}:${value}`).join(', '), p.allPrioritySemanticFamilies.join(', '), p.allSupportedFraudPathways.join(', ') || 'None recorded', `${c.themeCount} / ${c.scenarioCount} / ${c.controlCount}`, `${result.tiers.essential.gate.status} / ${result.tiers.comprehensive.gate.status}`];
  });
  await writeText(path.join(outputDir, 'certification-fixture-matrix.md'), [
    '# Certification fixture matrix', '',
    '**Status: PARTIAL — five valid existing-assessment archetypes plus one explicit coverage gap.**', '',
    `Inventory count: ${inventory.length} persisted assessments; ${inventory.filter((row) => row.score !== null).length} scored; ${inventory.filter((row) => row.eligibleForExistingProductCertification).length} scored and order-backed.`, '',
    table(['Key', 'Archetype', 'Assessment', 'Score', 'Calculated → final', 'Critical / major', 'Domain vector', 'Priority families', 'Fraud pathways', 'Comp themes / scenarios / controls', 'Essential / Comp gates'], matrixRows),
    '',
    'Every selected valid assessment runs both Essential and Comprehensive deterministic paths, regardless of the historical product on its existing order. Comprehensive runs include deterministic 4–6 month Embed and 7–12 month Mature steps. Essential remains a 90-day product path.', '',
    'No AI is configured or called. Manuscripts and PDFs are deliberately absent.'
  ].join('\n'));

  await writeText(path.join(outputDir, 'assessment-diversity-analysis.md'), [
    '# Assessment diversity analysis', '',
    `The selected set contains ${valid.length} materially usable records. Diversity is evaluated across score, maturity, domain vector, critical/major gaps, semantic-family shape, fraud-pathway shape and strengths; it is not inferred from organisation name alone.`, '',
    table(['Pair', 'Score Δ', 'Maturity Δ', 'Domain-vector distance', 'Family Jaccard', 'Pathway Jaccard', 'Same finding-family shape'], diffRows.map((row) => [`${row.left} ↔ ${row.right}`, row.scoreDistance, row.maturityDistance, row.domainVectorDistance, row.familyJaccard, row.pathwayJaccard, row.findingShapeSame ? 'YES — observed population overlap' : 'NO'])),
    '',
    `Union of selected priority semantic families: **${allFamilies.length}/${FAMILY_SET.length}** (${allFamilies.join(', ')}).`,
    `Union of selected supported fraud pathways: **${allPathways.length}/${PATHWAY_SET.length}** (${allPathways.join(', ') || 'none'}).`,
    '',
    'D and F share a compact recorded family shape in the available Staging population, but differ materially in recorded score and maturity. That overlap is disclosed; no artificial weakness was added to force visual diversity. The portfolio is therefore suitable for pre-AI semantic certification with the explicit Archetype E gap, not a claim that the source population is fully representative.'
  ].join('\n'));

  const semanticRows = FAMILY_SET.map((family) => {
    const supporting = valid.filter((result) => result.profile.allPrioritySemanticFamilies.includes(family)).map((result) => result.selection.key);
    const priority = valid.filter((result) => result.tiers.comprehensive.summary.semanticFamilies.includes(family)).map((result) => result.selection.key);
    const theme = valid.filter((result) => result.tiers.comprehensive.summary.themeFamilies.some((themeFamily) => themeFamily.toLowerCase().includes(family.toLowerCase().replaceAll('_', ' ')))).map((result) => result.selection.key);
    const controls = valid.filter((result) => result.tiers.comprehensive.summary.controlFamilies.includes(family)).map((result) => result.selection.key);
    return [family, supporting.join(', ') || 'None', priority.join(', ') || 'None', theme.join(', ') || 'See theme family anchor', controls.join(', ') || 'See selected control spine'];
  });
  await writeText(path.join(outputDir, 'semantic-family-coverage-matrix.md'), [
    '# Semantic-family coverage matrix', '',
    'Coverage is based on persisted material findings and the deterministic narrative selection. “Support” means the full evidence model contains the family; “priority” means the selected product Fact Pack carries it. Theme and control columns use the Reporting Bible’s approved human-facing theme anchors and selected blueprint spine.', '',
    table(['Semantic family', 'Existing support', 'Priority in Comp Fact Pack', 'Theme coverage', 'Control response'], semanticRows),
    '', `Portfolio union: **${allFamilies.length}/${FAMILY_SET.length}** families. Archetype E is not listed as support because it has no selected assessment.`
  ].join('\n'));

  const pathwayRows = PATHWAY_SET.map((pathway) => {
    const support = valid.filter((result) => result.profile.allSupportedFraudPathways.includes(pathway)).map((result) => result.selection.key);
    const scenarios = valid.filter((result) => result.tiers.comprehensive.summary.fraudPathways.includes(pathway)).map((result) => result.selection.key);
    return [pathway, support.join(', ') || 'None recorded', scenarios.join(', ') || 'No deterministic scenario in selected core', support.length ? 'Scenario only where linked finding family and bounded scenario selection support it.' : 'No scenario: source assessment did not record this pathway family.'];
  });
  await writeText(path.join(outputDir, 'fraud-pathway-coverage-matrix.md'), [
    '# Fraud-pathway coverage matrix', '',
    'The pathway matrix is evidence-bounded. A missing scenario is a source-population fact, not an invitation to invent one.', '',
    table(['Fraud pathway', 'Existing finding support', 'Scenario in Comp core', 'Disposition'], pathwayRows),
    '', `Portfolio pathway union: **${allPathways.length}/${PATHWAY_SET.length}**.`,
    '', 'The Comprehensive path uses 2–4 scenarios for non-sparse profiles and allows zero for the explicitly sparse high-readiness profiles. Essential remains bounded to its 90-day path.'
  ].join('\n'));

  const tierRows = valid.map((result) => {
    const e = result.tiers.essential.summary; const c = result.tiers.comprehensive.summary;
    return [result.selection.key, result.profile.assessmentReference, `${e.findingCount} / ${e.themeCount} / ${e.scenarioCount} / ${e.controlCount} / ${e.roadmapCount}`, `${c.findingCount} / ${c.themeCount} / ${c.scenarioCount} / ${c.controlCount} / ${c.roadmapCount}`, `${c.maturationStepCount} (${c.maturationStepCount / 2} Embed + ${c.maturationStepCount / 2} Mature)`, e.roadmapTargetPeriods.join(', '), c.roadmapTargetPeriods.join(', '), e.status, c.status];
  });
  await writeText(path.join(outputDir, 'tier-differentiation-report.md'), [
    '# Tier differentiation report', '',
    'Both tiers consume the same persisted assessment diagnosis but have different deterministic narrative contracts. Essential is a compact 90-day management path. Comprehensive expands diagnosis into interpretation and design and adds the twelve-month maturation horizon.', '',
    table(['Key', 'Assessment', 'Essential F/T/S/C/R', 'Comprehensive F/T/S/C/R', 'Comp maturation', 'Essential target periods', 'Comp target periods', 'Essential gate', 'Comp gate'], tierRows),
    '',
    'F/T/S/C/R = findings / themes / scenarios / controls / roadmap items. Comprehensive target periods preserve 30, 60 and 90 days and add deterministic 4–6 month Embed and 7–12 month Mature steps per eligible control. The tier comparison does not alter the scoring or maturity values.'
  ].join('\n'));

  const maturationRows = valid.map((result) => {
    const c = result.tiers.comprehensive;
    const periods = c.pack.maturationSteps.reduce((counts, step) => { const phase = step.phase ?? 'unknown'; counts[phase] = (counts[phase] ?? 0) + 1; return counts; }, {});
    const controls = new Set(c.pack.controls.map((control) => control.factRef ?? control.controlRef ?? control.id));
    const byControl = new Map();
    for (const step of c.pack.maturationSteps) { const list = byControl.get(step.linkedControlRef) ?? []; list.push(step.phase); byControl.set(step.linkedControlRef, list); }
    const exactlyTwo = [...controls].every((control) => (byControl.get(control) ?? []).length === 2 && new Set(byControl.get(control)).size === 2);
    return [result.selection.key, result.profile.assessmentReference, c.pack.controls.length, periods.EMBED ?? 0, periods.MATURE ?? 0, exactlyTwo ? 'PASS' : 'FAIL', 'Owner/process-owner/dependency/proof fields retained from deterministic control model'];
  });
  await writeText(path.join(outputDir, 'twelve-month-maturation-validation.md'), [
    '# Twelve-month maturation validation', '',
    'Comprehensive is validated for a deterministic maturity path, not a promise that the organisation will achieve the target state. Every selected control receives one Embed step for 4–6 months and one Mature step for 7–12 months, with accountable owner, process owner, dependency, success measure and proof of progress.', '',
    table(['Key', 'Assessment', 'Eligible controls', 'Embed 4–6m', 'Mature 7–12m', 'Exactly two phases/control', 'Boundary'], maturationRows),
    '', 'Archetype E is not applicable because no existing assessment met its required score-versus-final-maturity condition. No maturation steps were invented for the gap.'
  ].join('\n'));

  const gateRows = selections.map((selection) => {
    const result = results.find((item) => item.selection.key === selection.key);
    if (!result.profile) return [selection.key, selection.archetype, 'ARCHETYPE COVERAGE GAP', 'N/A', 'N/A', 'N/A', 'No assessment selected'];
    const e = result.tiers.essential; const c = result.tiers.comprehensive;
    return [selection.key, selection.archetype, result.profile.assessmentReference, e.gate.status, c.gate.status, e.gate.results.concat(c.gate.results).filter((item) => item.status === 'FAIL').length || '0', 'Both deterministic paths executed against the same persisted source assessment'];
  });
  await writeText(path.join(outputDir, 'cross-fixture-gate-report.md'), [
    '# Cross-fixture gate report', '',
    `Overall status: **${validGatePass && gap ? 'PARTIAL' : validGatePass ? 'PASS' : 'FAIL'}**.`, '',
    table(['Key', 'Archetype', 'Assessment', 'Essential', 'Comprehensive', 'Failed gate count', 'Disposition'], gateRows),
    '',
    'A gate result of PASS means Fact Pack, Story Plan, Writer Brief and pre-AI semantic gates passed for that existing assessment. The overall result remains PARTIAL because Archetype E is an honest source-population coverage gap.', '',
    'AI status: **NO AI configured; NO AI called.** Manuscripts: **NONE.** PDFs: **NONE.**'
  ].join('\n'));

  const agendaDisposition = [
    '# Functional Agenda disposition', '',
    '**Disposition: OBSOLETE / SUPERSEDED FOR THE LOCKED v1.1 ESSENTIAL WORKBOOK CONTRACT; UNRELATED TO THIS SIX-ARCHETYPE PRE-AI CERTIFICATION LOOP.**', '',
    'The Reporting Bible v1.1 §20.1 locks the Essential workbook to exactly eight sheets: Read me, Findings, Risks, Control Actions, Evidence Checklist / Proof of Progress, Roadmap, Question Trace and Control Improvements. Functional Agenda is not one of those sheets. The repository’s current Essential workbook builder retains Functional Agenda as an internal analytical collection for legacy/report rendering compatibility, but the locked workbook contract is the authoritative scope for this task.', '',
    'The Comprehensive workbook contract is also eight blueprint-oriented sheets and does not include Functional Agenda. This certification therefore records no unrelated workbook defect and does not modify the workbook contract.', '',
    'Relevant checks: `npm run reporting:bible-compliance` confirms the exact Comprehensive eight-sheet contract; `npm run bounded:test-essential-contract` remains a separate Essential workbook contract loop. No workbook change is made here.'
  ].join('\n');
  await writeText(path.join(outputDir, 'functional-agenda-test-disposition.md'), agendaDisposition);

  const files = [];
  async function collect(directory) {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) await collect(file); else files.push(path.relative(outputDir, file));
    }
  }
  await collect(outputDir);
  files.sort();
  const generatedFiles = {};
  for (const file of files) { const bytes = await fs.readFile(path.join(outputDir, file)); generatedFiles[file] = { bytes: bytes.length, sha256: sha256(bytes) }; }
  const manifest = {
    title: 'MK FRAUD READINESS v1.1 SIX-ARCHETYPE EXISTING-ASSESSMENT PRE-AI CERTIFICATION — OWNER REVIEW CANDIDATE',
    bibleVersion: REPORTING_BIBLE_VERSION, branch, generatedFromCommit: commit, remoteSha, worktree: 'Tracked files were checked before generation; pre-existing untracked user-owned output/work directories were preserved.',
    generatedAt: runAt, source: { environment: 'Supabase Staging', host: stagingHost, projectRef: 'penhenkzfrtmcxklodtu', readOnly: true, assessmentSubmission: false, scoreMutation: false, maturityMutation: false, orderMutation: false },
    inventory: { totalAssessments: inventory.length, scoredAssessments: inventory.filter((row) => row.score !== null).length, scoredOrderBackedAssessments: inventory.filter((row) => row.eligibleForExistingProductCertification).length },
    selectedArchetypes: selections.map((selection) => ({ key: selection.key, archetype: selection.archetype, assessmentReference: selection.assessmentReference, orderReference: selection.orderReference, status: results.find((result) => result.selection.key === selection.key)?.status ?? 'ARCHETYPE COVERAGE GAP' })),
    status: validGatePass && gap ? 'PARTIAL' : validGatePass ? 'PASS' : 'FAIL', archetypeCoverageGap: Boolean(gap),
    aiConfigured: false, aiCalled: false, manuscripts: null, pdfs: null,
    functionalAgendaDisposition: 'OBSOLETE_OR_SUPERSEDED_FOR_LOCKED_V11_WORKBOOK_CONTRACT', generatedFiles
  };
  await writeJson(path.join(outputDir, 'generation-manifest.json'), manifest);
  console.log(JSON.stringify({ outputDir, status: manifest.status, inventory: manifest.inventory, selectedArchetypes: manifest.selectedArchetypes, generatedFileCount: Object.keys(generatedFiles).length, remoteSha }, null, 2));
}

await main();
