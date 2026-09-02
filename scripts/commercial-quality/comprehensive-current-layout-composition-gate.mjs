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

function pageMatchText(value) {
  return compact(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function compositionObjectSpans(pages, html) {
  const stopWords = new Set('the and or of to a an in for with is are this that through from should keep make use management control fraud readiness position current recorded assessed standard owner owners route review material by its as not after into remain has have be will on their'.split(' '));
  const pageTokens = pages.map((page) => new Set(pageMatchText(page.text).split(/\s+/).filter(Boolean)));
  const objects = [...html.matchAll(/<article\b[^>]*data-composition-object="([^"]+)"[^>]*>([\s\S]*?)<\/article>/gi)];
  return objects.flatMap((match) => {
    const objectId = match[1];
    const tokens = [...new Set(pageMatchText(visibleHtml(match[2])).split(/\s+/).filter((word) => word.length >= 4 && !stopWords.has(word)))];
    if (tokens.length < 4) return [];
    const coverage = pageTokens.map((set, index) => {
      const matchedTokens = tokens.filter((token) => set.has(token));
      return { page: pages[index].page, matchedTokens: matchedTokens.length, totalTokens: tokens.length, coverage: Number((matchedTokens.length / tokens.length).toFixed(4)) };
    }).sort((left, right) => right.coverage - left.coverage);
    const best = coverage[0];
    if (best.coverage >= 0.82) return [];
    return [{ objectId, bestPage: best.page, bestCoverage: best.coverage, coverage: coverage.filter((item) => item.coverage >= 0.2), reason: 'object content does not fit one PDF page' }];
  });
}

function repeatedExhibits(html, expectedIds) {
  const actualIds = [...html.matchAll(/data-exhibit-id="([^"]+)"/g)].map((match) => match[1]);
  const duplicateIds = actualIds.filter((id, index) => actualIds.indexOf(id) !== index);
  const homes = [...html.matchAll(/data-primary-home="([^"]+)"/g)].map((match) => match[1]);
  const homePairs = actualIds.map((id, index) => `${id}|${homes[index] ?? ''}`);
  const duplicateHomePairs = homePairs.filter((pair, index) => homePairs.indexOf(pair) !== index);
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
    duplicateHomePairs: [...new Set(duplicateHomePairs)],
    sharedPrimaryHomes: [...new Set(homes.filter((home, index) => homes.indexOf(home) !== index))],
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
  const cardSpans = compositionObjectSpans(pages, sourceHtml);
  const companionPages = pages.filter((page) => /Companion analytical record|MK Fraud Readiness Comprehensive Workbook|Question Traceability/i.test(page.text));
  const standaloneCompanionPages = companionPages
    .filter((page) => !/Management conclusion/i.test(page.text))
    .map((page) => ({ page: page.page, text: page.text }));
  assert.equal(exhibitProof.expectedOrderMatches, true, `${key}: PDF HTML exhibit IDs do not match the Blueprint order`);
  assert.equal(exhibitProof.duplicateIds.length, 0, `${key}: repeated exhibit IDs detected`);
  assert.equal(exhibitProof.duplicateHomePairs.length, 0, `${key}: repeated exhibit ID/home pairs detected`);
  assert.equal(exhibitProof.duplicateContentGroups.length, 0, `${key}: materially repeated exhibit content detected: ${JSON.stringify(exhibitProof.duplicateContentGroups)}`);
  assert.equal(markerOnlyPages.length, 0, `${key}: chapter-marker-only pages detected: ${JSON.stringify(markerOnlyPages)}`);
  assert.equal(orphanHeadings.length, 0, `${key}: orphan headings detected: ${JSON.stringify(orphanHeadings)}`);
  assert.equal(orphanManagementImplications.length, 0, `${key}: orphan management implications detected: ${JSON.stringify(orphanManagementImplications)}`);
  assert.equal(materiallyUnderfilledPages.length, 0, `${key}: materially underfilled pages detected: ${JSON.stringify(materiallyUnderfilledPages)}`);
  assert.equal(titleSplitProof.length, 0, `${key}: split titles detected: ${JSON.stringify(titleSplitProof)}`);
  assert.equal(cardSpans.length, 0, `${key}: exhibit/card objects span pages: ${JSON.stringify(cardSpans)}`);
  assert.equal(standaloneCompanionPages.length, 0, `${key}: companion workbook content is not integrated into the conclusion page: ${JSON.stringify(standaloneCompanionPages)}`);
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
      cardSpans,
      companionPages: companionPages.map((page) => page.page),
      standaloneCompanionPages,
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
    { id: 'split-title', rejects: 'A known heading prefix at the end of one page with its suffix at the start of the next.' },
    { id: 'exhibit-card-spanning-pages', rejects: 'A marked exhibit/card object whose opening and closing content land on different PDF pages.' },
    { id: 'companion-panel-not-integrated', rejects: 'Companion-workbook content on a page without the management conclusion.' }
  ],
  profiles: inspected,
  evidenceSha256: crypto.createHash('sha256').update(JSON.stringify(inspected)).digest('hex')
};
await fs.writeFile(path.join(outputDir, 'comprehensive-current-layout-composition.json'), `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
