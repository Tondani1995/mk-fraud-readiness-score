#!/usr/bin/env node
/**
 * Provider-free compositor regression for the preserved Phase G Motheo manuscripts.
 *
 * The manuscripts are already-produced fixtures. This test deliberately exercises the
 * production Comprehensive narrative renderer with both fixtures and rejects a companion
 * workbook panel that becomes an isolated low-occupancy page.
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const repo = process.cwd();
const outputRoot = path.resolve(process.env.PHASE_G_OUTPUT_DIR ?? path.join(repo, 'outputs/comprehensive-phase-g-remediated-2026-09-01'));
const fixtureRoot = process.env.COMPREHENSIVE_PHASE_G_FIXTURE_ROOT
  ? path.resolve(process.env.COMPREHENSIVE_PHASE_G_FIXTURE_ROOT)
  : outputRoot;
const evidencePath = path.resolve(process.env.COMPREHENSIVE_COMPOSITOR_REGRESSION_EVIDENCE ?? path.join(outputRoot, 'comprehensive-live-manuscript-compositor-regression.json'));

const fixtureFiles = [
  {
    model: 'luna',
    path: process.env.PHASE_G_LUNA_MANUSCRIPT ?? path.join(fixtureRoot, 'luna/MK-Comprehensive-Motheo-luna-Phase-G-remediated.md'),
    expectedSha256: 'cde956156551bc8ec329041886e6092e8874086e8209c03415cf984d2337c127'
  },
  {
    model: 'terra',
    path: process.env.PHASE_G_TERRA_MANUSCRIPT ?? path.join(fixtureRoot, 'terra/MK-Comprehensive-Motheo-terra-Phase-G-remediated.md'),
    expectedSha256: '1cfbffff5eb58a0de4541a1772b382dff5d609406da0f2463e7bb02cd2313912'
  }
];

const [{ buildMotheoDeterministicFixture }, blueprintText, presentationModule, rendererModule, pdfModule] = await Promise.all([
  import(pathToFileURL(path.join(repo, 'scripts/commercial-quality/comprehensive-phase-g-fixture.mjs')).href),
  import(pathToFileURL(path.join(repo, 'src/lib/reports/narrative/blueprint-text.ts')).href),
  import(pathToFileURL(path.join(repo, 'src/lib/reports/comprehensive/narrative-presentation-model.ts')).href),
  import(pathToFileURL(path.join(repo, 'src/lib/reports/comprehensive/render-narrative-html.ts')).href),
  import(pathToFileURL(path.join(repo, 'src/lib/reports/render-pdf.ts')).href)
]);

const { parseBlueprintMarkdown, bindBlueprintTextProvenance, validateBlueprintTextManuscript } = blueprintText;
const { buildComprehensiveNarrativePresentationModel } = presentationModule;
const { renderComprehensiveNarrativeReportHtml } = rendererModule;
const { renderHtmlToPdfBuffer, closeRenderBrowser } = pdfModule;

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function textFromPdf(pdfPath, page) {
  const args = page ? ['-f', String(page), '-l', String(page), pdfPath, '-'] : [pdfPath, '-'];
  return execFileSync('pdftotext', args, { encoding: 'utf8' }).replace(/\s+/g, ' ').trim();
}

function pdfPages(pdfPath) {
  const info = execFileSync('pdfinfo', [pdfPath], { encoding: 'utf8' });
  return Number(info.match(/^Pages:\s+(\d+)/m)?.[1] ?? 0);
}

function pageMetrics(pdfPath) {
  const pages = pdfPages(pdfPath);
  return Array.from({ length: pages }, (_, index) => {
    const page = index + 1;
    const text = textFromPdf(pdfPath, page);
    return { page, words: text.split(/\s+/).filter(Boolean).length, text };
  });
}

function companionPageMetrics(metrics) {
  return metrics.filter((item) => /Companion analytical record|MK Fraud Readiness Comprehensive Workbook/i.test(item.text));
}

const rendererSource = await fs.readFile(path.join(repo, 'src/lib/reports/comprehensive/render-narrative-html.ts'), 'utf8');
assert.match(rendererSource, /\.conclusion-closing\{[^}]*break-inside:avoid[^}]*page-break-inside:avoid/);
assert.doesNotMatch(rendererSource, /\b(?:luna|terra)\b/i, 'the compositor must not contain model-specific rules');
assert.doesNotMatch(rendererSource, /word.?count|manuscript.?length/i, 'the compositor must not contain word-count hacks');

const fixture = buildMotheoDeterministicFixture();
const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'mk-comprehensive-compositor-'));
const results = [];

try {
  for (const entry of fixtureFiles) {
    const markdown = await fs.readFile(entry.path, 'utf8');
    const manuscriptSha256 = sha256(markdown);
    assert.equal(manuscriptSha256, entry.expectedSha256, `${entry.model}: unexpected manuscript fixture hash`);
    const parsed = parseBlueprintMarkdown(markdown, fixture.blueprint);
    const narrative = bindBlueprintTextProvenance(parsed, {
      factPack: fixture.factPack,
      blueprint: fixture.blueprint,
      generationId: `phase-g-compositor-regression-${entry.model}`
    });
    const validation = validateBlueprintTextManuscript(parsed, fixture.blueprint, fixture.factPack);
    assert.equal(validation.ok, true, `${entry.model}: preserved manuscript must remain valid`);
    const presentation = buildComprehensiveNarrativePresentationModel({
      factPack: fixture.factPack,
      blueprint: fixture.blueprint,
      narrative
    });
    const html = renderComprehensiveNarrativeReportHtml(presentation);
    assert.equal((html.match(/data-companion-workbook="true"/g) ?? []).length, 1, `${entry.model}: companion panel count`);
    assert.match(html, /class="conclusion-closing"[\s\S]*data-companion-workbook="true"/, `${entry.model}: panel must be in conclusion-closing wrapper`);
    const outPath = path.join(temporaryRoot, `${entry.model}.pdf`);
    const pdf = await renderHtmlToPdfBuffer(html, { footerLabel: `MK Fraud Insights · Comprehensive · ${fixture.data.assessmentReference}` });
    await fs.writeFile(outPath, pdf);
    const metrics = pageMetrics(outPath);
    const companionPages = companionPageMetrics(metrics);
    assert.equal(companionPages.length, 1, `${entry.model}: companion panel must render once`);
    assert.ok(companionPages[0].words >= 120, `${entry.model}: companion content is materially underfilled`);
    const conclusionChapterIds = new Set(fixture.blueprint.chapters
      .filter((chapter) => chapter.narrativeRole === 'CONCLUSION')
      .map((chapter) => chapter.chapterId));
    const conclusionParagraphs = narrative.chapters
      .filter((chapter) => conclusionChapterIds.has(chapter.chapterId))
      .flatMap((chapter) => chapter.sections.flatMap((section) => [
        ...section.paragraphs,
        ...section.subsections.flatMap((subsection) => subsection.paragraphs)
      ]))
      .map((paragraph) => paragraph.text)
      .filter(Boolean);
    const conclusionTailSignal = conclusionParagraphs.at(-1)?.split(/\s+/).slice(0, 5).join(' ');
    assert.ok(conclusionTailSignal, `${entry.model}: conclusion tail is missing from the bound manuscript`);
    assert.match(companionPages[0].text, new RegExp(conclusionTailSignal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), `${entry.model}: companion panel became isolated from the conclusion tail`);
    results.push({
      model: entry.model,
      manuscript: { path: entry.path, sha256: manuscriptSha256 },
      html: { companionPanelCount: (html.match(/data-companion-workbook="true"/g) ?? []).length, conclusionClosingWrapper: true, compositorRule: 'break-inside: avoid + page-break-inside: avoid' },
      pdf: { path: outPath, sha256: sha256(pdf), pages: metrics.length, companionPages: companionPages.map(({ page, words }) => ({ page, words })), underfilledNonCoverPages: metrics.slice(1).filter((item) => item.words < 120).map(({ page, words }) => ({ page, words })) }
    });
  }
} finally {
  await closeRenderBrowser();
  await fs.rm(temporaryRoot, { recursive: true, force: true });
}

const summary = {
  status: 'PASS',
  gate: 'comprehensive-live-manuscript-compositor-regression',
  providerCalls: 0,
  modelSpecificRules: false,
  wordCountHacks: false,
  preservedManuscriptFixtures: results.map((result) => result.manuscript),
  results,
  assertions: [
    'both preserved Luna and Terra manuscripts remain valid',
    'companion workbook panel renders exactly once',
    'companion panel is structurally grouped with the conclusion closing content',
    'companion panel is not an isolated low-occupancy page',
    'the same compositor rule is used for both manuscripts',
    'no model-specific CSS or word-count condition exists'
  ]
};
await fs.mkdir(path.dirname(evidencePath), { recursive: true });
await fs.writeFile(evidencePath, JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify(summary, null, 2));
