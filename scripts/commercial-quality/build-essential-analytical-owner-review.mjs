#!/usr/bin/env node
/**
 * Builds the Essential analytical exhibit owner candidate.
 *
 * Reuses the existing deterministic analytical truth and the already-approved
 * bounded commentary. It makes no provider calls: the page structure changed,
 * not the analysis, and regenerating prose for a layout change would spend money
 * to reproduce the same judgements.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { buildEssentialPresentationModel } from '../../src/lib/reports/essential/presentation-model.ts';
import { renderEssentialReportHtml } from '../../src/lib/reports/essential/render-essential-html.ts';
import { validateEssentialPresentation } from '../../src/lib/reports/essential/presentation-validation.ts';
import { renderHtmlToPdfBuffer, closeRenderBrowser } from '../../src/lib/reports/render-pdf.ts';

const sourceDir = process.env.ESSENTIAL_SOURCE_DIR
  ?? '/Users/tondani/Documents/Codex/outputs/report-engine-end-to-end-certification/rivonia-essential';
const outDir = process.env.ESSENTIAL_OUTPUT_DIR
  ?? '/Users/tondani/Documents/Codex/outputs/essential-analytical-exhibit-owner-review';

const readJson = async (file) => JSON.parse(await fs.readFile(file, 'utf8'));
const write = async (file, value) => {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`);
};

const factPack = await readJson(path.join(sourceDir, '01-fact-pack.json'));
const thesis = await readJson(path.join(sourceDir, '03-report-thesis.json'));
const blueprint = await readJson(path.join(sourceDir, '02-report-blueprint.json'));

/**
 * Harvest approved bounded commentary and map it onto exhibit interpretation
 * slots. Only prose that fits an exhibit is carried forward; the rest stays in
 * the analytical record rather than being re-flowed into the new structure.
 */
const commentary = {};
const approvedDir = path.join(sourceDir, 'approved');
const files = (await fs.readdir(approvedDir).catch(() => [])).sort();
const approved = [];
for (const file of files) {
  const raw = (await fs.readFile(path.join(approvedDir, file), 'utf8')).trim();
  if (!raw) continue;
  const parsed = JSON.parse(raw);
  approved.push(parsed.result ?? parsed);
}
const bySlot = (fragment) => approved.find((slot) => String(slot.slotId ?? '').includes(fragment));

const firstSentences = (text, count) => {
  const parts = String(text ?? '').split(/(?<=[.!?])\s+/).filter(Boolean);
  return parts.slice(0, count).join(' ');
};

const executive = bySlot('EXECUTIVE-ASSESSMENT');
if (executive) {
  commentary['COVER-JUDGEMENT'] = firstSentences(executive.managementImplication, 1);
  commentary['EXECUTIVE-JUDGEMENT'] = firstSentences(executive.narrative, 3);
}
const shaping = bySlot('SHAPING');
if (shaping) commentary['DIAGNOSIS-SYNTHESIS'] = firstSentences(shaping.narrative, 3);
const conclusion = bySlot('CONCLUSION');
if (conclusion) commentary['CONCLUSION'] = firstSentences(conclusion.narrative, 3);
const roadmapSlot = bySlot('FIRST-90-DAYS');
if (roadmapSlot) commentary['ROADMAP-LOGIC'] = firstSentences(roadmapSlot.narrative, 2);

const model = buildEssentialPresentationModel({ factPack, thesis, blueprint, commentary });
const validation = validateEssentialPresentation(model);
const html = renderEssentialReportHtml(model);

await write(path.join(outDir, 'presentation-model.json'), model);
await write(path.join(outDir, 'exhibits.json'), {
  readinessScore: model.readinessScore,
  domainProfile: model.domainProfile,
  materialContrasts: model.materialContrasts ?? null,
  diagnosis: model.diagnosis,
  exposures: model.exposures ?? null,
  scenarios: model.scenarios ?? null,
  priorities: model.priorities,
  roadmap: model.roadmap,
  dashboard: model.dashboard
});
await write(path.join(outDir, 'presentation-validation.json'), validation);
await write(path.join(outDir, 'approved-commentary', 'commentary.json'), commentary);
await write(path.join(outDir, 'report.html'), html);

if (!validation.ok) {
  console.log(JSON.stringify({ status: 'PRESENTATION_VALIDATION_FAILED', issues: validation.issues }, null, 2));
  await closeRenderBrowser();
  process.exit(1);
}

const startedAt = Date.now();
const pdf = await renderHtmlToPdfBuffer(html, { footerLabel: 'MK Fraud Insights · Essential Fraud Readiness Report' });
const pdfPath = path.join(outDir, 'essential-owner-review.pdf');
await write(pdfPath, '');
await fs.writeFile(pdfPath, pdf);
await write(path.join(outDir, 'renderer-diagnostics.json'), {
  renderer: 'application',
  platform: process.platform,
  bytes: pdf.length,
  durationMs: Date.now() - startedAt
});
await closeRenderBrowser();

console.log(JSON.stringify({
  status: 'OWNER_REVIEW_CANDIDATE',
  pdf: pdfPath,
  bytes: pdf.length,
  pages: model.pages.length,
  customerWords: validation.customerWordCount,
  aiCalls: 0,
  presentationValidation: 'PASS'
}, null, 2));
