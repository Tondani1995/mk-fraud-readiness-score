#!/usr/bin/env node
/**
 * Live Essential certification across the real scored, order-backed portfolio.
 *
 * Deterministic analysis -> bounded AI commentary -> validation -> presentation
 * model -> application renderer -> page-level layout gate -> owner-only PDF.
 *
 * Database access is read-only. Nothing is written back, no report record is
 * created, and no report is delivered. Every PDF is a private owner artefact.
 *
 * One case failing must not stop the portfolio, so each case is isolated and its
 * outcome recorded either way.
 *
 * Usage:
 *   ORDERS="MKORD-...,MKORD-..." npm run v11:essential-live
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { assembleReportData } from '../../src/lib/reports/assemble-report-data.ts';
import { buildAdvisoryEvidenceModel } from '../../src/lib/reports/evidence-model/index.ts';
import { buildEssentialProjection } from '../../src/lib/reports/essential-projection.ts';
import { buildEssentialNarrativeFactPack } from '../../src/lib/reports/narrative/fact-pack.ts';
import { buildNarrativeStoryPlan } from '../../src/lib/reports/narrative/story-plan.ts';
import { buildReportBlueprint } from '../../src/lib/reports/narrative/report-blueprint.ts';
import {
  buildReportThesis,
  buildNarrativeSlotPlan,
  generateBoundedNarrativeReport
} from '../../src/lib/reports/narrative/bounded-section-engine.ts';
import { createV11BoundedSectionWriter } from '../../src/lib/reports/narrative/bounded-section-writer.ts';
import { BoundedGenerationFailure } from '../../src/lib/reports/narrative/bounded-section-engine.ts';
import { buildEssentialPresentationModel } from '../../src/lib/reports/essential/presentation-model.ts';
import { validateEssentialPresentation } from '../../src/lib/reports/essential/presentation-validation.ts';
import { renderEssentialReportHtml } from '../../src/lib/reports/essential/render-essential-html.ts';
import { renderHtmlToPdfBuffer, closeRenderBrowser } from '../../src/lib/reports/render-pdf.ts';

const CASE_IDS = {
  'MKORD-2026-B1DN82OG': 'CASE-01', 'MKORD-2026-D1U0CTO8': 'CASE-02', 'MKORD-2026-RHFC6DYH': 'CASE-03',
  'MKORD-2026-HB0OT81P': 'CASE-04', 'MKORD-2026-22FF6B69': 'CASE-05', 'MKORD-2026-7FBBEE23': 'CASE-06',
  'MKORD-2026-O8E19UPV': 'CASE-07', 'MKORD-2026-RXXUNVD9': 'CASE-08', 'MKORD-2026-1EOLBY7Y': 'CASE-09',
  'MKORD-2026-72BCEIDN': 'CASE-10', 'MKORD-2026-O9DT0QTT': 'CASE-11'
};

const outRoot = process.env.LIVE_OUTPUT_DIR
  ?? '/Users/tondani/Documents/Codex/outputs/essential-11-case-live-certification';
const orders = (process.env.ORDERS ?? Object.keys(CASE_IDS).join(',')).split(',').map((v) => v.trim()).filter(Boolean);

const write = async (file, value) => {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`);
};
const firstSentences = (text, count) => String(text ?? '').split(/(?<=[.!?])\s+/).filter(Boolean).slice(0, count).join(' ');

/**
 * Maps approved bounded slots onto the commentary slots the presentation model
 * consumes. Slot roles differ by mode, so selection is by role rather than by a
 * remediation-shaped slot name.
 */
function harvestCommentary(approved) {
  const byRole = (role) => approved.find((slot) => slot.contract?.narrativeRole === role);
  const commentary = {};
  const judgement = byRole('JUDGEMENT');
  if (judgement) {
    commentary['COVER-JUDGEMENT'] = firstSentences(judgement.result.managementImplication, 1);
    commentary['EXECUTIVE-JUDGEMENT'] = firstSentences(judgement.result.narrative, 3);
  }
  const diagnosis = byRole('DIAGNOSIS') ?? byRole('EVIDENCE');
  if (diagnosis) commentary['DIAGNOSIS-SYNTHESIS'] = firstSentences(diagnosis.result.narrative, 3);
  const implementation = byRole('IMPLEMENTATION');
  if (implementation) commentary['ROADMAP-LOGIC'] = firstSentences(implementation.result.narrative, 2);
  const conclusion = byRole('CONCLUSION');
  if (conclusion) commentary['CONCLUSION'] = firstSentences(conclusion.result.narrative, 3);
  return commentary;
}

const portfolio = [];
for (const order of orders) {
  const caseId = CASE_IDS[order] ?? order;
  const caseDir = path.join(outRoot, 'reports', caseId);
  const startedAt = Date.now();
  const record = { caseId, order, startedAt: new Date(startedAt).toISOString() };
  try {
    const data = await assembleReportData(order);
    const evidence = buildAdvisoryEvidenceModel(data);
    const pack = buildEssentialNarrativeFactPack(data, evidence, buildEssentialProjection(data, evidence));
    const blueprint = buildReportBlueprint(pack, buildNarrativeStoryPlan(pack));
    const thesis = buildReportThesis(pack, blueprint);
    const plan = buildNarrativeSlotPlan(pack, blueprint, thesis);
    record.mode = pack.narrativeMode;
    record.score = pack.assessment?.score;
    record.slots = plan.slots.length;

    const compiled = await generateBoundedNarrativeReport({
      reportGenerationId: `${caseId}-live`,
      pack, blueprint, thesis, plan,
      provider: createV11BoundedSectionWriter()
    });
    const accounting = compiled.accounting;
    record.generation = {
      initialCalls: accounting.initialCalls,
      repairCalls: accounting.repairCalls,
      qualityEscalations: accounting.qualityEscalations,
      technicalFormatRetries: accounting.technicalFormatRetries,
      technicalProviderFailures: accounting.technicalProviderFailureCount,
      technicalOutputParseFailures: accounting.technicalOutputParseFailureCount,
      totalTokens: accounting.totalTokens,
      providerCostMicros: accounting.totalProviderCostMicros,
      models: [...new Set(Object.values(accounting.modelBySlot ?? {}))]
    };

    const commentary = harvestCommentary(compiled.approvedSlots ?? []);
    const model = buildEssentialPresentationModel({ factPack: pack, thesis, blueprint, commentary });
    const validation = validateEssentialPresentation(model);
    record.validation = { ok: validation.ok, words: validation.customerWordCount, pages: validation.pageCount, issues: validation.issues };
    record.commentaryKeys = Object.keys(commentary);
    record.centralJudgement = model.cover.centralJudgement;
    record.priorities = model.priorities.rows.map((row) => row.outcome);
    record.exposures = model.exposures?.rows.length ?? 0;
    record.strengths = model.strengths?.rows.length ?? 0;
    record.watchpoints = model.watchpoints?.rows.length ?? 0;

    await write(path.join(caseDir, 'presentation-model.json'), model);
    await write(path.join(caseDir, 'approved-commentary', 'commentary.json'), commentary);
    await write(path.join(caseDir, 'validation.json'), validation);
    await write(path.join(caseDir, 'generation-accounting.json'), accounting);

    if (validation.ok) {
      const html = renderEssentialReportHtml(model);
      await write(path.join(caseDir, 'report.html'), html);
      const renderStart = Date.now();
      const pdf = await renderHtmlToPdfBuffer(html, { footerLabel: 'MK Fraud Insights · Essential Fraud Readiness Report' });
      await fs.writeFile(path.join(caseDir, 'report.pdf'), pdf);
      record.render = { ok: true, bytes: pdf.length, durationMs: Date.now() - renderStart };
      await write(path.join(caseDir, 'renderer-diagnostics.json'), record.render);
    } else {
      record.render = { ok: false, reason: 'validation failed; not rendered' };
    }
    record.ok = validation.ok;
  } catch (error) {
    record.ok = false;
    record.error = String(error?.message ?? error).slice(0, 400);
    // A failed case still spent provider calls. Reading the accounting off the
    // failure keeps portfolio economics honest -- reporting $0.00 for a case that
    // ran for six minutes understates real production cost.
    if (error instanceof BoundedGenerationFailure) {
      const accounting = error.accounting;
      record.failedAtSlot = error.slotId;
      record.generation = {
        initialCalls: accounting.initialCalls,
        repairCalls: accounting.repairCalls,
        qualityEscalations: accounting.qualityEscalations,
        technicalFormatRetries: accounting.technicalFormatRetries,
        technicalProviderFailures: accounting.technicalProviderFailureCount,
        technicalOutputParseFailures: accounting.technicalOutputParseFailureCount,
        totalTokens: accounting.totalTokens,
        providerCostMicros: accounting.totalProviderCostMicros,
        models: [...new Set(Object.values(accounting.modelBySlot ?? {}))]
      };
      await write(path.join(caseDir, 'generation-accounting.json'), accounting);
    }
  } finally {
    // Release the browser per case. A render that throws mid-loop otherwise
    // leaves a browser holding the event loop open, and the process never exits
    // even though every case has finished.
    await closeRenderBrowser().catch(() => {});
  }
  record.durationMs = Date.now() - startedAt;
  portfolio.push(record);
  await write(path.join(outRoot, 'portfolio', 'portfolio-summary.json'), portfolio);
  console.log(`${record.caseId} ${record.ok ? 'PASS' : 'FAIL'} ${String(record.mode ?? '?').padEnd(11)} ${String(record.score ?? '?').padStart(6)} calls:${record.generation?.initialCalls ?? '-'} rep:${record.generation?.repairCalls ?? '-'} esc:${record.generation?.qualityEscalations ?? '-'} tok:${record.generation?.totalTokens ?? '-'} $${((record.generation?.providerCostMicros ?? 0) / 1e6).toFixed(4)} ${record.validation?.words ?? '-'}w ${Math.round(record.durationMs / 1000)}s ${record.error ?? (record.validation?.issues ?? []).map((i) => i.code).join(',')}`);
}
await closeRenderBrowser().catch(() => {});

const done = portfolio.filter((entry) => entry.ok);
const cost = portfolio.reduce((sum, entry) => sum + (entry.generation?.providerCostMicros ?? 0), 0) / 1e6;
console.log(`\nPASS ${done.length}/${portfolio.length} · total $${cost.toFixed(4)} · tokens ${portfolio.reduce((s, e) => s + (e.generation?.totalTokens ?? 0), 0)}`);
