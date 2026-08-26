#!/usr/bin/env node
/**
 * Current V7 certification: Reporting Bible v1.1 manuscript-first Essential output.
 *
 * This replaces the former Checkpoint E/F mandatory role. It deliberately does not call
 * preparePremiumReportNarrative(), buildPremiumReportEvidencePack(), the old narrative brief,
 * aiPlanToNarrative(), or the old PDF candidate harness. The test writer is a deterministic,
 * provider-free WholeManuscriptWriter double; the PDF render is the real production Chromium
 * renderer reached through renderValidatedCommercialPdfWithNavigation().
 *
 * The checked-in bounded fixture is retained historical V7 source data. No database, Storage,
 * AI provider, email, payment, staging or production side effect is used.
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import { buildAdvisoryEvidenceModel } from '../src/lib/reports/evidence-model/index.ts';
import { buildEssentialProjection } from '../src/lib/reports/essential-projection.ts';
import { adaptEssentialEvidenceModel } from '../src/lib/reports/essential-presentation-adaptation.ts';
import { buildEssentialNarrativeFactPack, assertNarrativeFactPack } from '../src/lib/reports/narrative/fact-pack.ts';
import { composeEssentialManuscript } from '../src/lib/reports/narrative/essential-manuscript-coordinator.ts';
import { buildBlueprintMarkdownSkeleton } from '../src/lib/reports/narrative/blueprint-text.ts';
import {
  WHOLE_MANUSCRIPT_MODEL_MAX_OUTPUT_TOKENS
} from '../src/lib/reports/narrative/report-blueprint.ts';
import { NarrativeManuscriptFirstBoundaryError } from '../src/lib/reports/narrative/release-gate.ts';
import { preparePremiumReportNarrative } from '../src/lib/reports/automation/narrative-pipeline.ts';
import { selectContent } from '../src/lib/reports/select-content-blocks.ts';
import { adaptAdvisoryRoadmapToLegacyAgenda } from '../src/lib/reports/roadmap.ts';
import {
  __resetPdfRendererStateForTests,
  closeRenderBrowser
} from '../src/lib/reports/render-pdf.ts';
import { renderValidatedCommercialPdfWithNavigation } from '../src/lib/reports/render-validated-commercial-pdf.ts';
import { REPORT_TOC_ENTRIES } from '../src/lib/reports/templates/report-template.ts';
import { extractHeadingPageMap } from '../src/lib/reports/pdf-navigation.ts';
import { PDFDocument, PDFName } from 'pdf-lib';

const ROOT = process.cwd();
const FIXTURE = path.join(ROOT, 'src/lib/reports/__fixtures__/bounded-essential-f1-all-zero.json');
const OUT_DIR = path.join(ROOT, 'tmp/v7-current-manuscript-first-certification');
const PDF_PATH = path.join(OUT_DIR, 'essential-manuscript-first-chromium-certification.pdf');
const PROVIDER_GUARD_ERROR = 'CERTIFICATION_PROVIDER_DISPATCH_FORBIDDEN';

// @sparticuz/chromium resolves a Linux executable on this macOS arm64 workstation, where that
// packaged binary cannot be executed. Use an installed real Chromium only for this local
// certification harness; Linux CI continues to exercise the production packaged Chromium path.
if (!process.env.PUPPETEER_EXECUTABLE_PATH && process.platform === 'darwin') {
  const localChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  if (fs.existsSync(localChrome)) process.env.PUPPETEER_EXECUTABLE_PATH = localChrome;
}

let providerDispatches = 0;
for (const key of ['OPENAI_API_KEY', 'AI_GATEWAY_API_KEY', 'VERCEL_AI_GATEWAY_KEY']) delete process.env[key];
globalThis.__MK_CERTIFICATION_PROVIDER_GUARD__ = () => {
  providerDispatches += 1;
  throw new Error(PROVIDER_GUARD_ERROR);
};
const realFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = String(typeof input === 'string' ? input : input?.url ?? '');
  if (/openai|anthropic|gateway\.ai|api\.vercel|inference/i.test(url)) {
    providerDispatches += 1;
    throw new Error(`${PROVIDER_GUARD_ERROR}: ${url}`);
  }
  return realFetch(input, init);
};

function sha256Json(value) {
  return sha256JsonValue(JSON.stringify(value));
}

function sha256JsonValue(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function createProviderFreeWholeWriter(prose) {
  const calls = { write: 0, tail: 0, repair: 0, coherence: 0 };
  let observedContext;
  const writer = {
    provider: 'test-injected',
    model: 'test-injected-model',
    promptVersion: 'test-injected-prompt',
    async writeManuscript(input) {
      calls.write += 1;
      observedContext = input.context;
      const skeleton = buildBlueprintMarkdownSkeleton(input.blueprint);
      const markdown = skeleton.headings.map((heading) =>
        `${'#'.repeat(heading.level)} ${heading.title}\n\n${prose}`
      ).join('\n\n');
      return {
        contractVersion: 'mk-reporting-bible-1.1-whole-manuscript-writer-v1',
        architecture: 'whole-manuscript',
        markdown,
        blueprint: input.blueprint,
        writerMetadata: {
          contractVersion: 'mk-reporting-bible-1.1-whole-manuscript-writer-v1',
          architecture: 'whole-manuscript',
          provider: 'test-injected',
          model: 'test-injected-model',
          promptVersion: 'test-injected-prompt',
          generationMode: 'test-injected',
          generatedAt: '2026-08-26T10:00:00.000Z',
          inputFactPackSha256: 'b'.repeat(64),
          inputStoryPlanSha256: 'c'.repeat(64),
          inputBlueprintSha256: 'd'.repeat(64),
          recovery: {
            initialGenerationCount: 1,
            targetedRepairCount: 0,
            fullRegenerationCount: 0,
            qualityEscalationCount: 0,
            coherenceCount: 0,
            technicalFallbackCount: 0,
            truncationContinuationCount: 0,
            totalCalls: 1,
            totalTokens: 0,
            totalProviderCostMicros: 0
          }
        }
      };
    },
    async completeTail() {
      calls.tail += 1;
      throw new Error('tail completion must not be used by a complete manuscript');
    },
    async repairBlock() {
      calls.repair += 1;
      throw new Error('targeted repair must not be used by a complete manuscript');
    },
    async coherencePass() {
      calls.coherence += 1;
      throw new Error('coherence pass must not be used by a complete manuscript');
    }
  };
  return { writer, calls, get context() { return observedContext; } };
}

function buildCurrentEssentialContext(data) {
  const advisoryModel = buildAdvisoryEvidenceModel(data);
  const reportEvidenceModel = adaptEssentialEvidenceModel(advisoryModel, data.adaptiveGatewayAnswers ?? {});
  const projection = buildEssentialProjection(data, reportEvidenceModel);
  const factPack = buildEssentialNarrativeFactPack(data, reportEvidenceModel, projection);
  assertNarrativeFactPack(factPack);
  return { advisoryModel, reportEvidenceModel, projection, factPack };
}

function flattenBlueprintHeadings(blueprint) {
  return blueprint.chapters.flatMap((chapter) => [
    { level: 1, id: chapter.chapterId, title: chapter.title },
    ...chapter.sections.flatMap((section) => [
      { level: 2, id: section.sectionId, title: section.title },
      ...section.optionalSubsections.map((subsection) => ({
        level: 3,
        id: subsection.subsectionId,
        title: subsection.title
      }))
    ])
  ]);
}

function flattenParsedHeadings(narrative) {
  return narrative.chapters.flatMap((chapter) => [
    { level: 1, id: chapter.chapterId, title: chapter.title },
    ...chapter.sections.flatMap((section) => [
      { level: 2, id: section.sectionId, title: section.title },
      ...section.subsections.map((subsection) => ({
        level: 3,
        id: subsection.subsectionId,
        title: subsection.title
      }))
    ])
  ]);
}

async function expectManuscriptRejection(factPack, prose, expectedCode) {
  const state = createProviderFreeWholeWriter(prose);
  await assert.rejects(
    () => composeEssentialManuscript({ factPack, writer: state.writer }),
    (error) => {
      assert.equal(error.name, 'EssentialManuscriptError');
      assert.equal(error.stage, 'validate_manuscript');
      assert.ok(
        error.diagnostics.validationIssues.some((issue) => issue.code === expectedCode),
        `expected ${expectedCode} in ${JSON.stringify(error.diagnostics.validationIssues)}`
      );
      return true;
    }
  );
  assert.equal(state.calls.write, 1, 'a rejected manuscript still has exactly one initial writer call');
  assert.equal(state.calls.tail + state.calls.repair + state.calls.coherence, 0, 'rejection must not silently spend recovery calls');
}

function pageTexts(pdfPath) {
  const extracted = execFileSync('pdftotext', ['-layout', pdfPath, '-'], {
    encoding: 'utf8',
    maxBuffer: 25 * 1024 * 1024
  });
  return extracted.split('\f').map((page) => page.trim()).filter((page, index, all) => index < all.length - 1 || page.length > 0);
}

function rasterPages(pdfPath, renderDir) {
  fs.mkdirSync(renderDir, { recursive: true });
  execFileSync('pdftoppm', ['-png', '-r', '72', pdfPath, path.join(renderDir, 'page')], { stdio: 'ignore' });
  return fs.readdirSync(renderDir)
    .filter((name) => /^page-\d+\.png$/.test(name))
    .sort((a, b) => Number(a.match(/(\d+)/)?.[1] ?? 0) - Number(b.match(/(\d+)/)?.[1] ?? 0));
}

function visualBlankPages(renderDir) {
  const python = [
    'import json, sys',
    'from pathlib import Path',
    'from PIL import Image, ImageChops',
    'files = sorted(Path(sys.argv[1]).glob("page-*.png"))',
    'blank = []',
    'for index, file in enumerate(files, 1):',
    '    with Image.open(file).convert("RGB") as image:',
    '        if ImageChops.difference(image, Image.new("RGB", image.size, "white")).getbbox() is None:',
    '            blank.append(index)',
    'print(json.dumps({"files": len(files), "blankPages": blank}))'
  ].join('\n');
  return JSON.parse(execFileSync('python3', ['-c', python, renderDir], { encoding: 'utf8' }));
}

const data = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
assert.equal(data.productCode, 'essential_self_assessment', 'the current certification fixture must be Essential PDF-only output');
assert.equal(globalThis.__MK_CERTIFICATION_PROVIDER_GUARD__ instanceof Function, true);
assert.throws(() => globalThis.__MK_CERTIFICATION_PROVIDER_GUARD__(), new RegExp(PROVIDER_GUARD_ERROR));
assert.equal(process.env.OPENAI_API_KEY, undefined);

const first = buildCurrentEssentialContext(data);
const second = buildCurrentEssentialContext(data);
assert.equal(sha256Json(first.factPack), sha256Json(second.factPack), 'Fact Pack must be deterministic');
assert.equal(sha256Json(first.projection), sha256Json(second.projection), 'Essential projection must be deterministic');
assert.equal(sha256Json(first.reportEvidenceModel), sha256Json(second.reportEvidenceModel), 'adapted evidence model must be deterministic');
assert.ok(first.factPack.facts.length > 0, 'current Fact Pack must contain facts');

const validWriter = createProviderFreeWholeWriter(
  'Management should use this recorded position to focus ownership, review and evidence of progress within the defined response.'
);
const composed = await composeEssentialManuscript({ factPack: first.factPack, writer: validWriter.writer });
const expectedHeadings = flattenBlueprintHeadings(composed.blueprint);
const receivedHeadings = flattenParsedHeadings(composed.narrative);
assert.equal(composed.narrative.ok, true);
assert.deepEqual(receivedHeadings, expectedHeadings, 'every parsed section must retain exact Blueprint identity and order');
assert.equal(validWriter.calls.write, 1, 'a complete manuscript uses one WholeManuscriptWriter call');
assert.equal(validWriter.calls.tail + validWriter.calls.repair + validWriter.calls.coherence, 0, 'a complete manuscript uses no recovery call');
assert.equal(validWriter.context.architecture, 'whole-manuscript');
assert.equal(validWriter.context.singleCallFeasible, true);
assert.equal(validWriter.context.outputBudget.reportTier, 'essential');
assert.ok(validWriter.context.outputBudget.hardOutputTokenLimit > 6_204);
assert.ok(validWriter.context.outputBudget.hardOutputTokenLimit <= WHOLE_MANUSCRIPT_MODEL_MAX_OUTPUT_TOKENS);
assert.equal(composed.manuscript.writerMetadata.recovery.totalCalls, 1);

assert.equal(first.factPack.facts.some((fact) => JSON.stringify(fact).includes('999999')), false);
await expectManuscriptRejection(
  first.factPack,
  'Management should act on the unsupported 999999 position.',
  'unsupported_numeric_claim'
);
await expectManuscriptRejection(
  first.factPack,
  'This report provides independent assurance that operating effectiveness is confirmed.',
  'assurance_claim'
);

const fulfilmentSource = fs.readFileSync(path.join(ROOT, 'src/lib/reports/phase1-manual-fulfilment.ts'), 'utf8');
const legacySource = fs.readFileSync(path.join(ROOT, 'src/lib/reports/automation/narrative-pipeline.ts'), 'utf8');
assert.match(fulfilmentSource, /composeEssentialManuscript/);
assert.match(fulfilmentSource, /createV11WholeManuscriptWriter\(flags\.model, \{ providerCallBudget: 1 \}\)/);
assert.equal((fulfilmentSource.match(/\bpreparePremiumReportNarrative\s*\(/g) ?? []).length, 0, 'production Essential fulfilment must not call the retired prepare pipeline');
assert.match(fulfilmentSource, /if \(isComprehensive\)/);
assert.match(fulfilmentSource, /legacy[\s\S]{0,120}preparePremiumReportNarrative[\s\S]{0,160}boundary stays closed/i);
assert.match(legacySource, /const manuscriptFirstBoundaryEnabled: boolean = true/);
assert.match(legacySource, /throw new NarrativeManuscriptFirstBoundaryError\(\)/);
await assert.rejects(
  () => preparePremiumReportNarrative({}),
  (error) => error instanceof NarrativeManuscriptFirstBoundaryError
);

fs.rmSync(OUT_DIR, { recursive: true, force: true });
fs.mkdirSync(OUT_DIR, { recursive: true });
const content = selectContent(data, [], first.projection);
const roadmap = adaptAdvisoryRoadmapToLegacyAgenda(first.projection.roadmapActions);
let pdf;
let repeatPdf;
try {
  __resetPdfRendererStateForTests();
  pdf = await renderValidatedCommercialPdfWithNavigation({
    data,
    content,
    roadmap,
    evidenceModel: first.reportEvidenceModel,
    narrative: composed.narrative
  });
  repeatPdf = await renderValidatedCommercialPdfWithNavigation({
    data,
    content,
    roadmap,
    evidenceModel: first.reportEvidenceModel,
    narrative: composed.narrative
  });
} finally {
  await closeRenderBrowser();
}
fs.writeFileSync(PDF_PATH, pdf);
const repeatPath = path.join(OUT_DIR, 'repeat.pdf');
fs.writeFileSync(repeatPath, repeatPdf);

const pdfDocument = await PDFDocument.load(pdf);
const pageCount = pdfDocument.getPageCount();
const info = execFileSync('pdfinfo', [PDF_PATH], { encoding: 'utf8' });
const infoPageCount = Number(/^Pages:\s+(\d+)/m.exec(info)?.[1] ?? 0);
const pdfPageTexts = pageTexts(PDF_PATH);
const repeatPageTexts = pageTexts(repeatPath);
const text = pdfPageTexts.join('\n');
const repeatText = repeatPageTexts.join('\n');
const pageImages = rasterPages(PDF_PATH, path.join(OUT_DIR, 'renders'));
const visual = visualBlankPages(path.join(OUT_DIR, 'renders'));
const navigation = await extractHeadingPageMap(new Uint8Array(pdf), REPORT_TOC_ENTRIES, 3);
const textOnlyBlankPages = pdfPageTexts
  .map((page, index) => page.length < 35 ? index + 1 : null)
  .filter((page) => page !== null);
const validPageGeometry = pdfDocument.getPages().every((page) => page.getWidth() > 0 && page.getHeight() > 0);

assert.equal(pdf.subarray(0, 4).toString(), '%PDF');
assert.ok(pdf.length > 50_000, `current manuscript-first PDF is implausibly small: ${pdf.length} bytes`);
assert.ok(pageCount > 0);
assert.equal(infoPageCount, pageCount);
assert.ok(pageCount <= 40, `Essential PDF page count ${pageCount} exceeds the hard ceiling of 40`);
assert.equal(validPageGeometry, true, 'every parsed PDF page must have valid geometry');
assert.equal(pageImages.length, pageCount, 'every PDF page must have a Chromium raster');
assert.deepEqual(visual.blankPages, [], 'no PDF page may rasterise blank');
assert.deepEqual(textOnlyBlankPages, [], 'no PDF page may contain only footer-level text');
assert.equal(pdfDocument.catalog.has(PDFName.of('Outlines')), true, 'navigation bookmarks must be present');
assert.equal(REPORT_TOC_ENTRIES.every((entry) => Number.isInteger(navigation[entry.key]) && navigation[entry.key] >= 3), true, 'every tracked heading must resolve to a real page');
assert.equal(text, repeatText, 'repeated Chromium renders must preserve deterministic text and facts');
assert.doesNotMatch(text, /999999/);
assert.doesNotMatch(text, /\b(?:this|the) report provides (?:independent )?assurance\b/i);
assert.doesNotMatch(text, /\bMK independently (?:verified|reviewed|confirmed)\b/i);
assert.doesNotMatch(text, /\boperating effectiveness (?:was|has been) independently (?:verified|reviewed|confirmed)\b/i);
assert.doesNotMatch(text, /\bComprehensive report\b/i);
assert.equal(fs.readdirSync(OUT_DIR, { recursive: true }).some((file) => /\.(xlsx|pptx)$/i.test(String(file))), false, 'Essential certification must publish PDF artefacts only');
assert.equal(providerDispatches, 1, 'only the explicit provider-guard self-test may dispatch the guard');

const summary = {
  schemaVersion: 'v7-current-manuscript-first-certification-v1',
  status: 'PASS',
  ai: 'ZERO',
  product: data.productCode,
  fixture: path.relative(ROOT, FIXTURE),
  factPackSha256: sha256Json(first.factPack),
  projectionSha256: sha256Json(first.projection),
  manuscript: {
    blueprintHeadings: expectedHeadings.length,
    parsedHeadings: receivedHeadings.length,
    writerCalls: validWriter.calls,
    hardOutputTokenLimit: validWriter.context.outputBudget.hardOutputTokenLimit,
    singleCallFeasible: validWriter.context.singleCallFeasible
  },
  pdf: {
    path: path.relative(ROOT, PDF_PATH),
    bytes: pdf.length,
    pageCount,
    sha256: crypto.createHash('sha256').update(pdf).digest('hex'),
    repeatTextStable: true,
    visualBlankPages: visual.blankPages,
    textOnlyBlankPages,
    validPageGeometry,
    navigationEntries: Object.keys(navigation).length,
    outlines: pdfDocument.catalog.has(PDFName.of('Outlines')),
    essentialPdfOnly: true
  },
  failClosed: {
    unsupportedNumericFact: 'PASS',
    prohibitedAssuranceLanguage: 'PASS',
    legacyPreparePipeline: 'DISABLED',
    deterministicFallback: 'NOT USED'
  }
};
fs.writeFileSync(path.join(OUT_DIR, 'certification-summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
// The renderer's Chromium/PDF dependencies can retain non-essential handles after the
// production browser close hook. All certification assertions and artefacts are complete here;
// finish explicitly so CI does not remain queued behind a successful test process.
setImmediate(() => process.exit(0));
