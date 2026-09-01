#!/usr/bin/env node
/**
 * Provider-free PDF composition gate for the current Comprehensive path.
 *
 * This gate measures composition defects rather than rewarding a target page
 * count. It rejects orphan headings, orphan management implications, chapter
 * marker-only pages, materially underfilled pages, split titles and repeated
 * exhibits. It also consumes the decision/exhibit proof emitted by the
 * current-path gate so the two structural checks are recorded together.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const outputDir = path.resolve(process.env.CURRENT_COMPREHENSIVE_OUTPUT_DIR ?? path.join(process.cwd(), 'outputs', 'comprehensive-current-path'));
const acceptancePath = path.join(outputDir, 'comprehensive-current-path-acceptance.json');
const profiles = [
  ['motheo', 'MK-Comprehensive-V12-Motheo-Terra-Owner-Review'],
  ['bokamoso', 'MK-Comprehensive-Bokamoso-Provider-Free-Structural-Composition-Fixture']
];

function shellText(command, args) {
  return execFileSync(command, args, { encoding: 'utf8' });
}

function compact(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function decodeHtml(value) {
  return value
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&#x27;', "'");
}

function visibleHtml(value) {
  return decodeHtml(value
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' '));
}

function headingsFromHtml(html) {
  return [...html.matchAll(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi)]
    .map((match) => compact(visibleHtml(match[1])))
    .filter((heading) => heading.split(/\s+/).length >= 2);
}

function bodyLines(pageText) {
  return pageText.split(/\r?\n/).map((line) => compact(line)).filter((line) => {
    if (!line) return false;
    if (/^MK Fraud Insights\s*[·•]\s*Comprehensive Fraud Readiness Report\s*[·•]/i.test(line)) return false;
    if (/^\d+\s*\/\s*\d+$/.test(line)) return false;
    return true;
  });
}

function wordCount(value) {
  return compact(value).split(/\s+/).filter(Boolean).length;
}

function pageMetrics(pageText, headings, pageNumber) {
  const lines = bodyLines(pageText);
  const text = compact(lines.join(' '));
  const chapterMarker = /MK Fraud Insights\s*[·•]\s*Comprehensive\s*[·•]\s*\d{2}/i;
  const markerOnlyText = compact(text.replace(chapterMarker, ''));
  const headingHits = headings.filter((heading) => text.toLowerCase().includes(heading.toLowerCase()));
  const withoutHeadings = headingHits.reduce((current, heading) => current.replaceAll(heading, ' '), text);
  const withoutMarker = compact(markerOnlyText);
  const managementImplication = /MANAGEMENT IMPLICATION/i.test(text);
  const managementWords = wordCount(text.replace(/MANAGEMENT IMPLICATION/ig, ''));
  const markerOnly = chapterMarker.test(text) && wordCount(withoutMarker) === 0;
  const orphanHeading = pageNumber > 1 && headingHits.length > 0 && wordCount(withoutHeadings) <= 24;
  const orphanManagementImplication = pageNumber > 1 && managementImplication && managementWords <= 42;
  const materiallyUnderfilled = pageNumber > 1 && wordCount(withoutMarker) < 60;
  return {
    page: pageNumber,
    lines,
    text,
    words: wordCount(text),
    bodyWords: wordCount(withoutMarker),
    headingHits,
    markerOnly,
    orphanHeading,
    orphanManagementImplication,
    materiallyUnderfilled
  };
}

function titleSplits(pages, headings) {
  const splits = [];
  for (let index = 0; index < pages.length - 1; index += 1) {
    const current = pages[index].text.toLowerCase();
    const next = pages[index + 1].text.toLowerCase();
    for (const heading of headings) {
      const words = heading.toLowerCase().split(/\s+/).filter(Boolean);
      for (let split = 2; split < words.length; split += 1) {
        const prefix = words.slice(0, split).join(' ');
        const suffix = words.slice(split).join(' ');
        if (current.endsWith(prefix) && next.startsWith(suffix)) {
          splits.push({ page: pages[index].page, nextPage: pages[index + 1].page, heading, prefix, suffix });
        }
      }
    }
  }
  return splits;
}

function repeatedExhibits(html, expectedIds) {
  const actualIds = [...html.matchAll(/data-exhibit-id="([^"]+)"/g)].map((match) => match[1]);
  const duplicateIds = actualIds.filter((id, index) => actualIds.indexOf(id) !== index);
  const homes = [...html.matchAll(/data-primary-home="([^"]+)"/g)].map((match) => match[1]);
  const duplicateHomes = homes.filter((home, index) => homes.indexOf(home) !== index);
  const contentGroups = new Map();
  for (const match of html.matchAll(/<figure\b[^>]*data-exhibit-id="([^"]+)"[^>]*>([\s\S]*?)<\/figure>/gi)) {
    const content = compact(visibleHtml(match[2])).toLowerCase();
    const fingerprint = crypto.createHash('sha256').update(content).digest('hex');
    const group = contentGroups.get(fingerprint) ?? [];
    group.push(match[1]);
    contentGroups.set(fingerprint, group);
  }
  const duplicateContentGroups = [...contentGroups.values()].filter((group) => group.length > 1);
  return {
    expectedIds,
    actualIds,
    duplicateIds: [...new Set(duplicateIds)],
    duplicateHomes: [...new Set(duplicateHomes)],
    duplicateContentGroups,
    expectedOrderMatches: JSON.stringify(actualIds) === JSON.stringify(expectedIds)
  };
}

function inspectProfile(key, fileStem, acceptanceEvidence) {
  const pdfPath = path.join(outputDir, `${fileStem}.pdf`);
  const htmlPath = path.join(outputDir, `${fileStem}.html`);
  const pdfText = shellText('pdftotext', [pdfPath, '-']);
  const rawPages = pdfText.split('\f').filter((page) => page.trim());
  const sourceHtml = shellText('sed', ['-n', '1,999999p', htmlPath]);
  const headings = headingsFromHtml(sourceHtml);
  const pages = rawPages.map((page, index) => pageMetrics(page, headings, index + 1));
  const expectedIds = acceptanceEvidence?.visual?.exhibitProof?.expectedIds ?? [];
  const exhibitProof = repeatedExhibits(sourceHtml, expectedIds);
  const titleSplitProof = titleSplits(pages, headings);
  const orphanHeadings = pages.filter((page) => page.orphanHeading).map((page) => ({ page: page.page, headings: page.headingHits, bodyWords: page.bodyWords }));
  const orphanManagementImplications = pages.filter((page) => page.orphanManagementImplication).map((page) => ({ page: page.page, bodyWords: page.bodyWords, text: page.text }));
  const markerOnlyPages = pages.filter((page) => page.markerOnly).map((page) => ({ page: page.page, text: page.text }));
  const materiallyUnderfilledPages = pages.filter((page) => page.materiallyUnderfilled).map((page) => ({ page: page.page, bodyWords: page.bodyWords, text: page.text }));
  const duplicateDecisionProof = acceptanceEvidence?.visual?.decisionProof ?? null;
  assert.equal(exhibitProof.expectedOrderMatches, true, `${key}: PDF HTML exhibit IDs do not match the Blueprint order`);
  assert.equal(exhibitProof.duplicateIds.length, 0, `${key}: repeated exhibit IDs detected`);
  assert.equal(exhibitProof.duplicateHomes.length, 0, `${key}: repeated exhibit primary homes detected`);
  assert.equal(exhibitProof.duplicateContentGroups.length, 0, `${key}: materially repeated exhibit content detected: ${JSON.stringify(exhibitProof.duplicateContentGroups)}`);
  assert.equal(markerOnlyPages.length, 0, `${key}: chapter-marker-only pages detected: ${JSON.stringify(markerOnlyPages)}`);
  assert.equal(orphanHeadings.length, 0, `${key}: orphan headings detected: ${JSON.stringify(orphanHeadings)}`);
  assert.equal(orphanManagementImplications.length, 0, `${key}: orphan management implications detected: ${JSON.stringify(orphanManagementImplications)}`);
  assert.equal(materiallyUnderfilledPages.length, 0, `${key}: materially underfilled pages detected: ${JSON.stringify(materiallyUnderfilledPages)}`);
  assert.equal(titleSplitProof.length, 0, `${key}: split titles detected: ${JSON.stringify(titleSplitProof)}`);
  if (duplicateDecisionProof) {
    assert.equal(duplicateDecisionProof.exactUnique, true, `${key}: decision structure fingerprints are not unique`);
    assert.ok(duplicateDecisionProof.maxPairwiseSimilarity < 0.9, `${key}: decision structures are materially similar`);
  }
  return {
    profile: key,
    pdf: pdfPath,
    pages: pages.length,
    pageMetrics: pages.map(({ lines, text, ...metric }) => metric),
    checks: {
      orphanHeadings,
      orphanManagementImplications,
      markerOnlyPages,
      materiallyUnderfilledPages,
      titleSplits: titleSplitProof,
      repeatedExhibits: exhibitProof,
      duplicateDecisionStructures: duplicateDecisionProof
    }
  };
}

const acceptance = JSON.parse(await fs.readFile(acceptancePath, 'utf8'));
assert.equal(acceptance.status, 'PASS', 'Current-path acceptance must pass before PDF composition inspection');
assert.equal(acceptance.providerCalls, 0, 'PDF composition gate must remain provider-free');
assert.equal(acceptance.databaseWrites, 0, 'PDF composition gate must remain write-free');
const inspected = profiles.map(([key, stem]) => inspectProfile(key, stem, acceptance.outputs.find((item) => item.profile === key)));
const summary = {
  status: 'PASS',
  gate: 'comprehensive-current-layout-composition',
  providerCalls: 0,
  databaseWrites: 0,
  acceptance: {
    providerFreeStructuralAcceptance: 'PASS',
    liveCommercialNarrativeAcceptance: 'NOT_RUN',
    commercialValue: 'NOT_CLAIMED'
  },
  thresholds: {
    materiallyUnderfilledBodyWords: '< 60 after footer and chapter-marker removal',
    orphanHeadingBodyWords: '<= 24 after heading removal',
    orphanManagementImplicationBodyWords: '<= 42 after label removal',
    pageCount: 'measured only; no target or upper-bound optimisation gate'
  },
  defectDetectors: [
    { id: 'heading-without-meaningful-following-content', rejects: 'A chapter or section heading with <= 24 non-heading words on its page.' },
    { id: 'management-implication-only-or-nearly-only-page', rejects: 'A management implication with <= 42 words of surrounding page content.' },
    { id: 'chapter-marker-only-page', rejects: 'A chapter marker whose page has no other report content.' },
    { id: 'materially-underfilled-page', rejects: 'A non-cover page with fewer than 60 body words after footer/marker removal.' },
    { id: 'split-title', rejects: 'A known heading prefix at the end of one page with its suffix at the start of the next.' }
  ],
  profiles: inspected,
  evidenceSha256: crypto.createHash('sha256').update(JSON.stringify(inspected)).digest('hex')
};
await fs.writeFile(path.join(outputDir, 'comprehensive-current-layout-composition.json'), `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
