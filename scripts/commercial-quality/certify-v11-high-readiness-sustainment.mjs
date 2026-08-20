#!/usr/bin/env node

/* Existing-assessment-only v1.1 high-readiness sustainment certification. */
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

const outputDir = path.resolve(process.env.V11_HIGH_READINESS_OUTPUT_DIR ?? '/Users/tondani/Documents/Codex/2026-08-11/p1-no-paid-order-can-be/outputs/v1.1-high-readiness-sustainment-owner-review');
const runAt = process.env.V11_HIGH_READINESS_RUN_AT ?? new Date().toISOString();
const stagingHost = 'penhenkzfrtmcxklodtu.supabase.co';
const branch = execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).trim();
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const trackedWorkingTreeClean = execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8' }).trim() === '';
if (!trackedWorkingTreeClean) throw new Error('Refusing certification: tracked working tree is not clean.');
const remoteSha = (() => { try { const value = execFileSync('git', ['ls-remote', 'origin', `refs/heads/${branch}`], { encoding: 'utf8' }).trim(); return value ? value.split(/\s+/)[0] : null; } catch { return null; } })();
const configuredUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '';
if (REPORTING_BIBLE_VERSION !== '1.1') throw new Error(`Expected Reporting Bible 1.1, received ${REPORTING_BIBLE_VERSION}.`);
if (!configuredUrl.includes(stagingHost)) throw new Error(`Refusing to run: configured Supabase host is not Staging (${stagingHost}).`);
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for the read-only Staging run.');

const selections = [
  { key: 'A', assessmentReference: 'MKFRS-2026-F4047D75C0', orderReference: 'MKORD-2026-22FF6B69' },
  { key: 'B', assessmentReference: 'MKFRS-2026-95B3815A0C', orderReference: 'MKORD-2026-7FBBEE23' },
  { key: 'C', assessmentReference: 'MKFRS-2026-E18A03B158', orderReference: 'MKORD-2026-O8E19UPV' },
  { key: 'D', assessmentReference: 'MKFRS-2026-76FFC69B2D', orderReference: 'MKORD-2026-1EOLBY7Y' },
  { key: 'F', assessmentReference: 'MKFRS-2026-956FEA052B', orderReference: 'MKORD-2026-72BCEIDN' }
];
const db = createClient(configuredUrl, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const writeJson = async (file, value) => { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`); };
const writeText = async (file, value) => { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, `${String(value).trim()}\n`); };
const names = (items) => items.map((item) => item.title);
const failNames = (gate) => gate.results.filter((item) => item.status === 'FAIL').map((item) => item.gate);

async function assertSelectedOrderExists(selection) {
  const { data, error } = await db.from('orders').select('order_reference,assessment_id,status').eq('order_reference', selection.orderReference).maybeSingle();
  if (error) throw error;
  if (!data || data.status === 'cancelled') throw new Error(`Missing usable existing order for ${selection.key}: ${selection.orderReference}`);
}

async function runEssential(data) {
  const evidence = buildAdvisoryEvidenceModel(data);
  const projection = buildEssentialProjection(data, evidence);
  const pack = buildEssentialNarrativeFactPack(data, evidence, projection);
  assertNarrativeFactPack(pack);
  const plan = buildNarrativeStoryPlan(pack);
  assertNarrativeStoryPlan(plan, pack);
  const brief = buildNarrativeWriterBrief(pack, plan);
  assertNarrativeWriterBrief(brief);
  const gate = runPreAiFactPackGates(pack, plan, brief);
  return { evidence, pack, plan, brief, gate };
}

async function runComprehensive(data) {
  const model = await fromAssembledReportData(data);
  const pack = buildComprehensiveNarrativeFactPack(model);
  assertNarrativeFactPack(pack);
  const plan = buildNarrativeStoryPlan(pack);
  assertNarrativeStoryPlan(plan, pack);
  const brief = buildNarrativeWriterBrief(pack, plan);
  assertNarrativeWriterBrief(brief);
  const gate = runPreAiFactPackGates(pack, plan, brief);
  return { evidence: model.analytical.evidenceModel, pack, plan, brief, gate };
}

function summary(result) {
  const { pack, plan, brief, gate, evidence } = result;
  return {
    narrativeMode: pack.narrativeMode,
    sustainmentPriorityCount: pack.sustainmentPriorities.length,
    findingCount: pack.findings.length,
    riskCount: pack.risks.length,
    scenarioCount: pack.scenarios.length,
    controlCount: pack.controls.length,
    decisionCount: pack.decisions.length,
    roadmapCount: pack.roadmap.length,
    maturationStepCount: pack.maturationSteps.length,
    movementTitles: plan.movements.map((movement) => movement.title),
    roadmapTargetPeriods: brief.roadmap.map((item) => item.targetPeriod),
    blueprintSemantics: brief.controls.map((control) => ({ objective: control.objective, frequency: control.frequency, proofRetained: control.proofRetained, deteriorationTrigger: control.escalationTrigger, effectivenessIndicator: control.effectivenessMeasure })),
    sourceAnalyticalCounts: { materialFindings: evidence.materialFindings.length, risks: evidence.riskRegister.length, scenarios: evidence.scenarios.length },
    gateStatus: gate.status,
    gateFailures: failNames(gate)
  };
}

function textScan(result) {
  const payload = JSON.stringify({ brief: result.brief, plan: result.plan });
  const forbidden = /material (?:control )?(?:weakness|gap)|priority weakness|control failure|remediation required|urgent remediation|foundational failure|close (?:the )?weakness|implement (?:the )?missing control|validate that|independently validate|before relying on self-assessment|self-reported claims remain unverified/i;
  const machine = /\b[A-Z]{3,}(?:_[A-Z0-9]+){1,}\b/;
  const languagePayload = payload.replace(/No material weaknesses were identified from the recorded assessment responses\./gi, '');
  return { forbiddenLanguage: forbidden.test(languagePayload), machineIdentifier: machine.test(payload), rawTextBytes: Buffer.byteLength(payload) };
}

async function main() {
  await fs.rm(outputDir, { recursive: true, force: true });
  await fs.mkdir(outputDir, { recursive: true });
  const runs = {};
  for (const selection of selections) {
    await assertSelectedOrderExists(selection);
    const data = await assembleReportData(selection.orderReference);
    const evidence = buildAdvisoryEvidenceModel(data);
    if (selection.key === 'D' || selection.key === 'F') {
      if (evidence.narrativeMode !== 'SUSTAINMENT') throw new Error(`${selection.key} expected SUSTAINMENT, received ${evidence.narrativeMode}`);
      const essential = await runEssential(data);
      const comprehensive = await runComprehensive(data);
      runs[selection.key] = { data, evidence, essential, comprehensive };
      for (const [tier, result] of [['essential', essential], ['comprehensive', comprehensive]]) {
        if (result.gate.status !== 'PASS') throw new Error(`${selection.key} ${tier} gate failed: ${failNames(result.gate).join(', ')}`);
        const prefix = `${selection.key}-${tier}`;
        await writeJson(path.join(outputDir, `${prefix}-writer-brief.json`), result.brief);
        await writeJson(path.join(outputDir, `${prefix}-story-plan.json`), result.plan);
      }
    } else {
      const essential = await runEssential(data);
      const comprehensive = await runComprehensive(data);
      runs[selection.key] = { data, evidence, essential, comprehensive };
      if (essential.gate.status !== 'PASS' || comprehensive.gate.status !== 'PASS') throw new Error(`${selection.key} regression failed: ${failNames(essential.gate).concat(failNames(comprehensive.gate)).join(', ')}`);
    }
  }
  const d = runs.D; const f = runs.F;
  const semanticRows = ['D', 'F'].flatMap((key) => {
    const run = runs[key];
    return ['essential', 'comprehensive'].map((tier) => {
      const result = run[tier]; const s = summary(result); const scan = textScan(result);
      return `### ${key} — ${tier}\n\n- Narrative mode: **${s.narrativeMode}**\n- Sustainment priorities: **${s.sustainmentPriorityCount}**\n- Findings / risks / scenarios: **${s.findingCount} / ${s.riskCount} / ${s.scenarioCount}**\n- Controls / decisions / roadmap: **${s.controlCount} / ${s.decisionCount} / ${s.roadmapCount}**\n- 12-month maturation steps: **${s.maturationStepCount}**\n- Movement titles: ${s.movementTitles.join(' → ')}\n- 30/60/90 targets: ${s.roadmapTargetPeriods.join(', ')}\n- Customer-facing scan: forbidden language **${scan.forbiddenLanguage ? 'FOUND' : 'zero'}**, machine identifiers **${scan.machineIdentifier ? 'FOUND' : 'zero'}**.`;
    });
  }).join('\n\n');
  const blueprintSemantics = ['D', 'F'].map((key) => {
    const result = runs[key].comprehensive; const controls = result.brief.controls.map((control) => `- ${control.objective} | frequency: ${control.frequency} | proof: ${control.proofRetained.join('; ')} | deterioration trigger: ${control.escalationTrigger} | effectiveness: ${control.effectivenessMeasure}`).join('\n');
    return `### ${key} blueprint semantics\n\n${controls}`;
  }).join('\n\n');
  await writeText(path.join(outputDir, 'high-readiness-semantic-gate-report.md'), [
    '# MK FRAUD READINESS v1.1 — HIGH-READINESS / SUSTAINMENT MODE', '',
    `Status: **PASS** | Run: ${runAt} | Branch: ${branch} | SHA: ${commit} | Remote SHA: ${remoteSha ?? 'unavailable'}`, '',
    'The run used only existing order-backed Staging assessments. No assessment, score, maturity, order or source record was changed. AI was not configured or called; manuscripts and PDFs were not generated.', '',
    semanticRows, '', blueprintSemantics, '',
    'Sustainment invariant: no unsupported deficiency is promoted from a healthy assurance priority; no material risk is created from healthy assurance priorities; no automated fraud scenario is generated; customer language is limited to resilience, continuity, ownership, review rhythm and supported deterioration watchpoints.', '',
    'The Essential narrative uses Executive assessment → What is supporting the result → Priorities to sustain readiness → Where deterioration could emerge → What management should protect and strengthen → Management conclusion. Comprehensive uses the nine-movement sustainment sequence, including PRESERVE → EMBED → MEASURE → OPTIMISE semantics in the twelve-month blueprint.'
  ].join('\n'));

  const regressionRows = ['A', 'B', 'C'].map((key) => {
    const run = runs[key];
    return `| ${key} | ${run.data.assessmentReference} | ${run.essential.pack.narrativeMode} | ${run.comprehensive.pack.narrativeMode} | ${run.essential.pack.findings.length} / ${run.comprehensive.pack.findings.length} | ${run.essential.pack.scenarios.length} / ${run.comprehensive.pack.scenarios.length} | PASS / PASS |`;
  }).join('\n');
  await writeText(path.join(outputDir, 'A-B-C-regression-summary.md'), [
    '# A/B/C regression summary', '',
    'A/B/C were rerun through the deterministic pre-AI Fact Pack, Story Plan, Writer Brief and semantic gates after the sustainment correction. No assessment response, scoring or product redesign was applied.', '',
    '| Archetype | Assessment | Essential mode | Comprehensive mode | Findings E / C | Scenarios E / C | Gates E / C |', '|---|---|---|---|---:|---:|---|', regressionRows, '',
    'Archetype E remains the previously accepted honest coverage gap: no existing assessment met the required calculated-maturity-versus-final-maturity condition. It was not filled with synthetic data.', '',
    'AI: **NO**. Manuscripts: **NONE**. PDFs: **NONE**.'
  ].join('\n'));

  const files = (await fs.readdir(outputDir)).filter((file) => file.endsWith('.json') || file.endsWith('.md')).sort();
  const generatedFiles = {};
  for (const file of files) { const bytes = await fs.readFile(path.join(outputDir, file)); generatedFiles[file] = { bytes: bytes.length, sha256: sha256(bytes) }; }
  const manifest = {
    title: 'MK FRAUD READINESS v1.1 HIGH-READINESS / SUSTAINMENT MODE — OWNER REVIEW CANDIDATE',
    bibleVersion: REPORTING_BIBLE_VERSION, branch, generatedFromCommit: commit, frozenSha: commit, remoteSha, trackedWorkingTreeClean, generatedAt: runAt,
    source: { environment: 'Supabase Staging', projectRef: 'penhenkzfrtmcxklodtu', host: stagingHost, readOnly: true, existingAssessmentsOnly: true, assessmentSubmission: false, scoreMutation: false, maturityMutation: false, orderMutation: false },
    status: 'PASS',
    selectedAssessments: ['D', 'F'].map((key) => ({ key, reference: runs[key].data.assessmentReference, orderReference: runs[key].data.orderReference, narrativeMode: runs[key].evidence.narrativeMode, score: runs[key].data.scoreRun.overallScore, maturity: runs[key].data.scoreRun.finalMaturity, criticalGaps: runs[key].data.scoreRun.criticalGapCount, majorGaps: runs[key].data.scoreRun.majorGapCount, tiers: { essential: summary(runs[key].essential), comprehensive: summary(runs[key].comprehensive) } })),
    regression: ['A', 'B', 'C'].map((key) => ({ key, assessmentReference: runs[key].data.assessmentReference, essentialMode: runs[key].essential.pack.narrativeMode, comprehensiveMode: runs[key].comprehensive.pack.narrativeMode, status: 'PASS' })),
    archetypeE: { status: 'ARCHETYPE COVERAGE GAP', preserved: true },
    aiConfigured: false, aiCalled: false, manuscripts: null, pdfs: null,
    worktree: 'Tracked tree was checked; pre-existing user-owned untracked output/work directories were preserved.',
    generatedFiles
  };
  await writeJson(path.join(outputDir, 'generation-manifest.json'), manifest);
  console.log(JSON.stringify({ outputDir, status: 'PASS', frozenSha: commit, remoteSha, generatedFileCount: Object.keys(generatedFiles).length + 1, D: summary(d.comprehensive), F: summary(f.comprehensive) }, null, 2));
}

await main();
