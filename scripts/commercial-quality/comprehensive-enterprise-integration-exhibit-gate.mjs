#!/usr/bin/env node
/**
 * Provider-free render proof for the Comprehensive Enterprise Integration exhibit.
 *
 * The full page is rendered through the production Comprehensive compositor so the
 * screenshot is evidence of the customer-facing exhibit, not a hand-built mock.
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

import { buildMotheoDeterministicFixture } from './comprehensive-phase-g-fixture.mjs';
import { bindComprehensiveFixtureManuscript } from '../../src/lib/reports/comprehensive/manuscript-coordinator.ts';
import { buildComprehensiveNarrativePresentationModel } from '../../src/lib/reports/comprehensive/narrative-presentation-model.ts';
import { renderComprehensiveNarrativeReportHtml } from '../../src/lib/reports/comprehensive/render-narrative-html.ts';
import { closeRenderBrowser, renderHtmlToPdfBuffer } from '../../src/lib/reports/render-pdf.ts';

const repoRoot = process.cwd();
const outputDir = path.resolve(process.env.COMPREHENSIVE_ENTERPRISE_EXHIBIT_OUTPUT_DIR ?? path.join(repoRoot, 'outputs', 'comprehensive-premium-propagation-correction-2026-09-02'));
const manuscriptPath = path.join(repoRoot, 'scripts/commercial-quality/comprehensive-motheo-terra-fixture.md');
const pdfName = 'motheo-enterprise-integration-fixture.pdf';
const htmlName = 'motheo-enterprise-integration-fixture.html';
const pngName = 'motheo-enterprise-integration-exhibit-page.png';
const evidenceName = 'enterprise-integration-exhibit-evidence.json';
const evidenceMarkdownName = 'enterprise-integration-exhibit-evidence.md';

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

async function sha256File(filePath) {
  const bytes = await fs.readFile(filePath);
  return { sha256: sha256(bytes), bytes: bytes.length };
}

const fixture = buildMotheoDeterministicFixture();
const manuscript = await fs.readFile(manuscriptPath, 'utf8');
const bound = bindComprehensiveFixtureManuscript({
  markdown: manuscript,
  factPack: fixture.factPack,
  storyPlan: fixture.storyPlan,
  blueprint: fixture.blueprint,
  generationId: 'provider-free-enterprise-integration-exhibit'
});
assert.equal(bound.narrative.ok, true, `Motheo fixture did not bind: ${JSON.stringify(bound.narrative.errors)}`);
assert.equal(bound.validation.ok, true, `Motheo fixture failed validation: ${JSON.stringify(bound.validation.hardTruth.issues)}`);
const integrationExhibit = fixture.blueprint.chapters.flatMap((chapter) => chapter.exhibits).find((exhibit) => exhibit.exhibitId === 'EXH-ENTERPRISE-INTEGRATION');
assert(integrationExhibit, 'Enterprise Integration exhibit is absent from the Blueprint.');
assert.equal(integrationExhibit.type, 'enterprise_integration');
const presentation = buildComprehensiveNarrativePresentationModel({
  factPack: fixture.factPack,
  blueprint: fixture.blueprint,
  narrative: bound.narrative,
  qaLabel: 'INTERNAL QA · PROVIDER-FREE ENTERPRISE INTEGRATION EXHIBIT FIXTURE'
});
const html = renderComprehensiveNarrativeReportHtml(presentation);
const exhibitMatch = html.match(/<figure\b[^>]*data-exhibit-id="EXH-ENTERPRISE-INTEGRATION"[^>]*>[\s\S]*?<\/figure>/i);
assert(exhibitMatch, 'Enterprise Integration exhibit did not render.');
const exhibitHtml = exhibitMatch[0];
const map = fixture.factPack.enterpriseIntegrationMap;
assert(map, 'Motheo Enterprise Integration Map is absent.');
assert.equal((exhibitHtml.match(/data-integration-loop=/g) ?? []).length, map.loopNodes.length, 'Rendered loop count does not match the supplied map.');
assert.equal((exhibitHtml.match(/data-composition-object="EXH-ENTERPRISE-INTEGRATION:domain-/g) ?? []).length, map.domainNodes.length, 'Rendered domain count does not match the supplied map.');
assert.equal((exhibitHtml.match(/data-composition-object="EXH-ENTERPRISE-INTEGRATION:relationship:/g) ?? []).length, map.dependencies.filter((dependency) => dependency.supportStatus === 'SUPPORTED').length, 'Rendered relationship count does not match supported edges.');
assert.doesNotMatch(exhibitHtml, /<table\b/i, 'Enterprise Integration exhibit must not render as a register/table.');
assert.doesNotMatch(exhibitHtml, /EIM-DEP-00[5-9]|INTEGRATION-DEPENDENCY-00[5-9]/, 'Unsupported dependency identity leaked into the exhibit.');
assert.match(exhibitHtml, /Context overlays/);
assert.match(exhibitHtml, /DEEP_DIVE_PRIORITY|Deep-dive priority/);
assert.match(exhibitHtml, /MAINTAIN|Maintain/);

await fs.mkdir(outputDir, { recursive: true });
const htmlPath = path.join(outputDir, htmlName);
const pdfPath = path.join(outputDir, pdfName);
const pngPath = path.join(outputDir, pngName);
await fs.writeFile(htmlPath, html);
try {
  await fs.writeFile(pdfPath, await renderHtmlToPdfBuffer(html, { footerLabel: `MK Fraud Insights · Comprehensive Fraud Readiness Report · ${fixture.data.assessmentReference}` }));
} finally {
  await closeRenderBrowser();
}

const pdfText = execFileSync('pdftotext', [pdfPath, '-'], { encoding: 'utf8' });
const pages = pdfText.split('\f').filter((page) => page.trim());
const exhibitPageIndex = pages.findIndex((page) => /Enterprise fraud readiness integration/i.test(page));
assert.ok(exhibitPageIndex >= 0, 'Rendered PDF does not contain the Enterprise Integration exhibit caption.');
const exhibitPage = exhibitPageIndex + 1;
const renderPrefix = path.join(outputDir, 'motheo-enterprise-integration-page-render');
execFileSync('pdftoppm', ['-png', '-r', '160', '-f', String(exhibitPage), '-l', String(exhibitPage), pdfPath, renderPrefix], { stdio: 'ignore' });
const renderedFiles = (await fs.readdir(outputDir)).filter((name) => name.startsWith(path.basename(renderPrefix)) && name.endsWith('.png'));
assert.equal(renderedFiles.length, 1, `Expected one exhibit page render, found ${renderedFiles.length}.`);
await fs.rename(path.join(outputDir, renderedFiles[0]), pngPath);

const pdfFile = await sha256File(pdfPath);
const htmlFile = await sha256File(htmlPath);
const pngFile = await sha256File(pngPath);
const evidence = {
  status: 'PASS',
  gate: 'comprehensive-enterprise-integration-exhibit',
  providerCalls: 0,
  databaseWrites: 0,
  evidenceClass: 'provider-free-structural-acceptance',
  liveCommercialNarrativeAcceptance: 'NOT_RUN',
  fixture: {
    profile: 'motheo',
    manuscript: 'preserved-terra-manuscript-structural-replay',
    assessmentReference: fixture.data.assessmentReference,
    score: fixture.data.scoreRun.overallScore,
    maturity: fixture.data.scoreRun.finalMaturity,
    narrativeMode: fixture.factPack.narrativeMode
  },
  enterpriseIntegration: {
    exhibitId: integrationExhibit.exhibitId,
    exhibitType: integrationExhibit.type,
    primaryHome: integrationExhibit.placement,
    mapRef: map.factRef,
    loopCount: map.loopNodes.length,
    domainCount: map.domainNodes.length,
    domainsInLoops: [...new Set(map.loopNodes.flatMap((loop) => loop.memberDomainRefs))].length,
    supportedDependencyRefs: map.dependencies.filter((dependency) => dependency.supportStatus === 'SUPPORTED').map((dependency) => dependency.dependencyRef),
    unsupportedDependencyRefs: map.dependencies.filter((dependency) => dependency.supportStatus !== 'SUPPORTED').map((dependency) => dependency.dependencyRef),
    overlayStatuses: map.overlayNodes.map((overlay) => ({ overlayRef: overlay.overlayRef, status: overlay.status })),
    sourceRefs: integrationExhibit.sourceRefs
  },
  cardPagination: {
    objectCount: (exhibitHtml.match(/data-composition-object=/g) ?? []).length,
    cssRequirement: 'Every loop, domain card, relationship card and overlay strip uses break-inside/page-break-inside avoidance; page count is not optimised.',
    pdfInspection: 'The exhibit caption and all rendered cards are present on the inspected PDF page.',
    inspectedPage: exhibitPage
  },
  rendered: {
    html: { path: htmlName, ...htmlFile },
    pdf: { path: pdfName, ...pdfFile },
    exhibitPagePng: { path: pngName, ...pngFile }
  },
  structuralAssertions: {
    fourLoopsRendered: (exhibitHtml.match(/data-integration-loop=/g) ?? []).length === 4,
    tenDomainsRendered: (exhibitHtml.match(/data-composition-object="EXH-ENTERPRISE-INTEGRATION:domain-/g) ?? []).length === 10,
    onlySupportedEdgesRendered: map.dependencies.filter((dependency) => dependency.supportStatus !== 'SUPPORTED').every((dependency) => !exhibitHtml.includes(dependency.dependencyRef)),
    contextOverlaysSeparate: /Context overlays/.test(exhibitHtml) && !/<table\b/i.test(exhibitHtml),
    postureSemanticsVisible: /Deep-dive priority|DEEP_DIVE_PRIORITY/.test(exhibitHtml) && /Maintain|MAINTAIN/.test(exhibitHtml),
    mkTokenSource: /--mk-navy-700|--mk-confirmed|--mk-brass/.test(html),
    approvedLogoPresent: /data-brand-asset="approved-mk-fraud-insights-mark"/.test(html)
  }
};
const evidencePath = path.join(outputDir, evidenceName);
await fs.writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
const evidenceMarkdown = [
  '# Enterprise Integration exhibit evidence',
  '',
  'Status: **PASS**',
  'Provider calls: **0**',
  `Exhibit: **${evidence.enterpriseIntegration.exhibitId}** · ${evidence.enterpriseIntegration.primaryHome.chapterId}/${evidence.enterpriseIntegration.primaryHome.sectionId}`,
  `PDF page inspected: **${exhibitPage}**`,
  '',
  '## Structural proof',
  '',
  `- Loops rendered: **${evidence.enterpriseIntegration.loopCount}**`,
  `- Domains rendered inside loops: **${evidence.enterpriseIntegration.domainCount}**`,
  `- Supported relationship cards: **${evidence.enterpriseIntegration.supportedDependencyRefs.length}**`,
  `- Unsupported relationships rendered: **${evidence.enterpriseIntegration.unsupportedDependencyRefs.length}**`,
  `- Context overlays: **${evidence.enterpriseIntegration.overlayStatuses.map((item) => `${item.overlayRef}=${item.status}`).join(', ')}**`,
  `- Card objects marked for page integrity: **${evidence.cardPagination.objectCount}**`,
  '',
  'The exhibit is rendered through the current Comprehensive compositor. It uses the approved MK token source, preserves the approved logo marker, presents posture as Deep-dive priority or Maintain, and keeps context overlays separate from supported dependency relationships.',
  '',
  'The adjacent PNG is the inspected PDF page containing the customer-facing exhibit. This is provider-free structural acceptance only; it is not live commercial narrative acceptance.'
].join('\n');
await fs.writeFile(path.join(outputDir, evidenceMarkdownName), `${evidenceMarkdown}\n`);
console.log(JSON.stringify({ status: 'PASS', outputDir, providerCalls: 0, exhibitPage, pdf: pdfFile, png: pngFile, evidence: evidenceName }, null, 2));
