#!/usr/bin/env node
/**
 * Provider-free acceptance for the current Comprehensive path.
 *
 * This gate deliberately exercises the same deterministic chain used by the
 * customer product. Motheo uses the preserved Terra whole-manuscript fixture;
 * Bokamoso uses a deterministic, Fact-Pack-derived weak-remediation manuscript
 * so the gate tests a substantive remediation shape rather than placeholder prose.
 */
import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import { buildV12ProfileAssembled } from '../../src/lib/qa/comprehensive-v12-quality-profiles.ts';
import { buildAdvisoryEvidenceModel } from '../../src/lib/reports/evidence-model/index.ts';
import { buildComprehensiveDeliveryModel } from '../../src/lib/reports/comprehensive/contract.ts';
import { assertComprehensiveBlueprintContract } from '../../src/lib/reports/comprehensive/contract.ts';
import { buildComprehensiveNarrativeFactPack, assertNarrativeFactPack } from '../../src/lib/reports/narrative/fact-pack.ts';
import { buildNarrativeStoryPlan, assertNarrativeStoryPlan } from '../../src/lib/reports/narrative/story-plan.ts';
import { buildReportBlueprint, assertReportBlueprint } from '../../src/lib/reports/narrative/report-blueprint.ts';
import { buildBlueprintMarkdownSkeleton } from '../../src/lib/reports/narrative/blueprint-text.ts';
import { bindComprehensiveFixtureManuscript } from '../../src/lib/reports/comprehensive/manuscript-coordinator.ts';
import { buildComprehensiveNarrativePresentationModel } from '../../src/lib/reports/comprehensive/narrative-presentation-model.ts';
import { renderComprehensiveNarrativeReportHtml } from '../../src/lib/reports/comprehensive/render-narrative-html.ts';
import { closeRenderBrowser, renderHtmlToPdfBuffer } from '../../src/lib/reports/render-pdf.ts';

const execFile = promisify(execFileCallback);
const outputDir = path.resolve(process.env.CURRENT_COMPREHENSIVE_OUTPUT_DIR ?? path.join(process.cwd(), 'outputs', 'comprehensive-current-path'));
const fixturePath = path.resolve('scripts/commercial-quality/comprehensive-motheo-terra-fixture.md');

function sha256Json(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

async function sha256File(filePath) {
  return crypto.createHash('sha256').update(await fs.readFile(filePath)).digest('hex');
}

function analyticalFor(data, evidenceModel) {
  return {
    assembled: data,
    evidenceModel,
    score: {
      overallScore: data.scoreRun.overallScore,
      calculatedMaturity: data.scoreRun.calculatedMaturity,
      finalMaturity: data.scoreRun.finalMaturity,
      exposureScore: data.scoreRun.exposureScore,
      exposureBand: data.scoreRun.exposureBand,
      coveragePct: data.scoreRun.coveragePct,
      nARatePct: data.scoreRun.nARatePct,
      criticalGapCount: data.scoreRun.criticalGapCount,
      majorGapCount: data.scoreRun.majorGapCount,
      capApplied: data.scoreRun.capApplied,
      capReason: data.scoreRun.capReason,
      methodologyVersionId: data.scoreRun.methodologyVersionId
    },
    organisationName: data.organisationName,
    assessmentReference: data.assessmentReference,
    generatedAt: data.generatedAt
  };
}

function deliveryFor(profileKey) {
  const { data } = buildV12ProfileAssembled(profileKey);
  const evidenceModel = buildAdvisoryEvidenceModel(data);
  const delivery = buildComprehensiveDeliveryModel(analyticalFor(data, evidenceModel));
  assertComprehensiveBlueprintContract(delivery);
  return { data, evidenceModel, delivery, factPack: buildComprehensiveNarrativeFactPack(delivery) };
}

function sentence(value, fallback) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return fallback;
  return /[.!?…]$/.test(text) ? text : `${text}.`;
}

function withoutIds(value) {
  return String(value ?? '')
    .replace(/\b(?:D\d+-Q\d+|(?:MF|RISK|SC|CI|RA|DEC|DECISION|THEME|FINDING|CONTROL|PROOF|ROADMAP)-[A-Z0-9-]+)\b/g, 'the linked record')
    .replace(/\s+/g, ' ')
    .trim();
}

function factProse(fact) {
  const value = fact.value && typeof fact.value === 'object' ? fact.value : {};
  switch (fact.kind) {
    case 'score':
      return `The deterministic assessment records a readiness score of ${value.overall} out of 100${value.exposureBand ? ` and an ${String(value.exposureBand).toLowerCase()} exposure position` : ''}.`;
    case 'maturity':
      return `The recorded maturity is ${value.maturity ?? value.calculatedMaturity ?? 'not assigned'}, subject to the published scoring method.`;
    case 'domain':
      return `${value.name ?? 'This domain'} is recorded at ${value.score ?? 'not scored'} out of 100, with the assessed coverage and gap position carried into the management view.`;
    case 'relative_strength':
      return `${sentence(value.title, 'An assessed capability supports the position')} ${sentence(value.basis, 'Its recorded score provides the deterministic basis for retaining attention')}`;
    case 'systemic_theme':
      return `${sentence(value.title, 'The connected pattern')} ${sentence(value.managementImplicationBasis, 'requires a joined management response')} ${sentence(value.fraudRiskRelationship, 'The fraud-risk relationship remains conditional on the recorded conditions')}`;
    case 'finding':
      return `${sentence(value.title, 'The assessment records a material condition')} The recorded position is ${withoutIds(value.recordedPosition) || 'not consistently in place'}. ${sentence(value.interpretation || value.advisoryMeaningBasis, 'The condition has a practical management implication')} ${sentence(value.approvedControlResponse, 'Management should define the target response, owner and measure')}`;
    case 'risk':
      return `${sentence(value.title, 'The associated risk')} ${sentence(value.statement, 'could affect timely challenge or recovery') } The approved treatment is ${withoutIds(value.approvedTreatment) || 'to define and retain the required operating response'}.`;
    case 'scenario':
      return `A plausible pathway is that ${withoutIds(value.actorClass) || 'an actor'} may use ${withoutIds(value.entryPoint) || 'a sensitive process entry point'} to ${withoutIds(value.mechanism) || 'alter value or records before timely challenge'}. The current weakness is ${withoutIds(value.currentControlWeakness) || 'incomplete control coverage'}, with a consequence of ${withoutIds(value.consequence) || 'loss or delayed recovery'}.`;
    case 'control':
      return `The target control objective is to ${withoutIds(value.objective) || 'interrupt the linked fraud pathway'}. It should be owned by ${withoutIds(value.accountableExecutive) || 'the accountable executive'} with ${withoutIds(value.processOwner) || 'a named process owner'}, cover ${withoutIds(value.population) || 'the complete in-scope population'}, operate ${withoutIds(value.frequency) || 'on the defined management rhythm'}, retain ${withoutIds(value.proofRetained?.join('; ')) || 'the named operating record'} and measure ${withoutIds(value.effectivenessMeasure) || 'timely completion and exception closure'}.`;
    case 'decision':
      return `Management should decide ${withoutIds(value.question) || 'the route for the priority response'}. The recommended route is ${withoutIds(value.recommendedRoute) || 'the route recorded in the deterministic option set'} because ${withoutIds(value.rationale) || 'it connects ownership, control design and review'}. ${sentence(value.consequenceOfDelay, 'Delay would leave the current condition without a clear management route')}`;
    case 'roadmap':
      return `During ${withoutIds(value.phaseWindow) || 'the next implementation window'}, management should ${withoutIds(value.priorityWork) || 'complete the priority work'} so that ${withoutIds(value.managementOutcome) || 'the target operating condition becomes visible'}. The accountable executive is ${withoutIds(value.accountableExecutive) || 'the named owner'}; completion is shown by ${withoutIds(value.proofOfCompletion) || 'the retained completion record'} and measured through ${withoutIds(value.successMeasure) || 'the recorded success measure'}.`;
    case 'maturation':
      return `The ${String(value.stage ?? 'next') .toLowerCase()} maturation step should move the response toward ${withoutIds(value.targetState) || 'a repeatable, measured operating rhythm'} through ${withoutIds(value.priorityWork) || 'the approved management work'}.`;
    case 'proof_of_progress':
      return `Management should retain ${withoutIds(value.requirement) || 'the required proof of progress'} because ${withoutIds(value.whyItMatters) || 'it makes ownership and completion visible'}.`;
    default:
      return `The authorised ${String(fact.kind).replaceAll('_', ' ')} supports the management response described in this section.`;
  }
}

function factsForRefs(factPack, refs) {
  const wanted = new Set(refs);
  return factPack.facts.filter((fact) => wanted.has(fact.id));
}

function syntheticBokamosoManuscript(factPack, blueprint) {
  const skeleton = buildBlueprintMarkdownSkeleton(blueprint);
  const blocks = [];
  const emittedFactTexts = new Set();
  for (const heading of skeleton.headings) {
    blocks.push(`${'#'.repeat(heading.level)} ${heading.title}`);
    if (heading.kind === 'chapter') continue;
    const chapter = blueprint.chapters.find((item) => item.chapterId === heading.chapterId);
    const section = chapter?.sections.find((item) => item.sectionId === heading.sectionId);
    const subsection = section?.optionalSubsections.find((item) => item.subsectionId === heading.subsectionId);
    const source = subsection ?? section;
    const subRefs = new Set(section?.optionalSubsections.flatMap((item) => [...item.requiredFacts, ...item.claimRefs]) ?? []);
    const refs = heading.kind === 'subsection'
      ? [...(source?.requiredFacts ?? []), ...(source?.claimRefs ?? [])]
      : [...(source?.requiredFacts ?? []), ...(source?.claimRefs ?? [])].filter((ref) => !subRefs.has(ref));
    const facts = factsForRefs(factPack, [...new Set(refs)]);
    const sectionContext = `This section translates the authorised evidence into a specific management account. `;
    const lead = sentence(source?.purpose, `Explain ${heading.title.toLowerCase()} for management.`);
    const takeaway = sentence(source?.requiredManagementTakeaway, 'Management should keep the response specific, owned and measurable.');
    const contextualTakeaway = `${takeaway} The management consequence for ${heading.title.toLowerCase()} is explicit in this section.`;
    const descriptions = facts.map((fact) => {
      const prose = factProse(fact);
      const normalized = prose.replace(/\s+/g, ' ').trim();
      if (emittedFactTexts.has(normalized)) {
        return `${prose} Viewed through the ${heading.title.toLowerCase()} lens, this evidence supports the section's distinct management focus.`;
      }
      emittedFactTexts.add(normalized);
      return prose;
    });
    const isManagementConclusion = /management conclusion/i.test(`${chapter?.title ?? ''} ${heading.title}`);
    const paragraphGroups = isManagementConclusion
      ? [
        'This closing section turns the assessed position into an owned management route. The companion analytical record retains the linked control, proof and decision detail.',
        'The immediate management expectation is to keep ownership, implementation evidence, monitoring and overdue escalation visible at the next review point.',
        'The management consequence is explicit: sustain what is working, close what remains exposed and use the agreed decision route when conditions change.'
      ]
      : descriptions.length > 0
        ? [sectionContext + lead, ...descriptions.slice(0, 3), contextualTakeaway]
        : [sectionContext + lead, contextualTakeaway];
    blocks.push('', paragraphGroups.join(' '));
    if (descriptions.length > 3 && !isManagementConclusion) {
      blocks.push('', descriptions.slice(3).join(' '));
    }
    blocks.push('');
  }
  return `${blocks.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`;
}

function stripTags(value) {
  return value.replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<[^>]+>/g, ' ').replace(/&(?:amp|lt|gt|quot|#39);/g, ' ').replace(/\s+/g, ' ').trim();
}

function exhibitIds(html) {
  return [...html.matchAll(/data-exhibit-id="([^"]+)"/g)].map((match) => match[1]);
}

function assertPresentationQuality({ key, data, factPack, blueprint, html }) {
  const expectedExhibitIds = blueprint.chapters.flatMap((chapter) => chapter.exhibits.map((exhibit) => exhibit.exhibitId));
  const actualExhibitIds = exhibitIds(html);
  assert.deepEqual([...new Set(actualExhibitIds)], expectedExhibitIds, `${key}: every Blueprint exhibit must render exactly once`);
  assert.equal(actualExhibitIds.length, new Set(actualExhibitIds).size, `${key}: duplicate exhibit IDs`);
  const homes = [...html.matchAll(/data-primary-home="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(homes.length, new Set(homes).size, `${key}: duplicate exhibit primary homes`);
  assert.doesNotMatch(html, /<table\b/i, `${key}: narrative must not be table-led`);
  assert.doesNotMatch(html, /<h[1-6][^>]*>[^<]*(?:appendix|finding register|risk register|evidence requirement register)|class="[^"]*card register/i, `${key}: register/card presentation leaked into customer PDF`);
  assert.doesNotMatch(html, /Preserve a named senior executive owns/i, `${key}: malformed control wording remains`);
  assert.doesNotMatch(html, /\bThe the\b/i, `${key}: synthetic manuscript contains duplicated article wording`);
  assert.doesNotMatch(html, /\.chapter\{[^}]*break-before:page/i, `${key}: forced chapter pagination remains`);
  assert.match(html, /data-brand-asset="approved-mk-fraud-insights-mark"/, `${key}: approved MK logo asset marker missing`);
  assert.match(html, /data:image\/svg\+xml,/, `${key}: approved MK vector logo missing`);
  assert.match(html, /alt="MK Fraud Insights"/, `${key}: approved MK logo identity missing`);
  assert.doesNotMatch(html, /#0B1B33|#5A6B7C|--navy-900|--muted\s*:/i, `${key}: deprecated approximate MK branding remains`);
  assert.match(html, /Confidential · Internal leadership use/, `${key}: confidentiality convention missing`);
  assert.match(html, /Report reference/, `${key}: report-reference convention missing`);
  const narrativeText = [...html.matchAll(/<div class="narrative-copy">([\s\S]*?)<\/div>/g)].map((match) => stripTags(match[1])).join(' ');
  const exhibitText = [...html.matchAll(/<figure class="exhibit[^"]*"[\s\S]*?<\/figure>/g)].map((match) => stripTags(match[0])).join(' ');
  assert.ok(narrativeText.length > exhibitText.length, `${key}: narrative must materially dominate exhibits`);
  assert.match(html, /data-exhibit-type="score_display"/, `${key}: score exhibit missing`);
  assert.match(html, /Management implication/, `${key}: management conclusion framing missing`);
  assert.match(html, /Companion analytical record/, `${key}: workbook boundary missing`);
  assert.equal((html.match(/<section class="chapter/g) ?? []).length, blueprint.chapters.length, `${key}: chapter count`);
  assert.ok(blueprint.transformationSequence.length >= 4, `${key}: transformation stages missing`);
  assert.equal(new Set(blueprint.transformationSequence.map((stage) => stage.purpose)).size, blueprint.transformationSequence.length, `${key}: transformation stages are not differentiated`);
  assert.equal(new Set(factPack.decisions.map((decision) => decision.question)).size, factPack.decisions.length, `${key}: decisions are not differentiated`);
  if (key === 'motheo') {
    assert.equal(factPack.narrativeMode, 'SUSTAINMENT');
    assert.equal(factPack.findings.length, 0);
    assert.equal(factPack.risks.length, 0);
    assert.equal(factPack.scenarios.length, 0);
    assert.match(html, /tone-positive/);
    assert.match(html, /positive-exhibit/);
    assert.match(html, /Deterioration signal/);
    assert.match(html, /PRESERVE/);
    assert.match(html, /OPTIMISE/);
    assert.match(html, /strong assessed fraud readiness position|strong assessed position|strong assessed/i);
  } else {
    assert.equal(factPack.narrativeMode, 'REMEDIATION');
    assert.ok(factPack.findings.length > 0 && factPack.risks.length > 0 && factPack.scenarios.length > 0, `${key}: remediation objects missing`);
    assert.match(html, /tone-critical|watch-exhibit/);
    assert.match(html, /Conditional fraud pathways/);
    assert.match(html, /Target control environment/);
    assert.match(html, /Management decisions required/);
    assert.match(html, /STABILISE/);
    assert.match(html, /MATURE/);
  }
  return { exhibits: actualExhibitIds.length, narrativeCharacters: narrativeText.length, exhibitCharacters: exhibitText.length, score: data.scoreRun.overallScore, maturity: data.scoreRun.finalMaturity };
}

async function pdfFacts(filePath) {
  const { stdout: info } = await execFile('pdfinfo', [filePath]);
  const { stdout: text } = await execFile('pdftotext', [filePath, '-']);
  const pages = Number(info.match(/^Pages:\s+(\d+)/m)?.[1] ?? 0);
  assert.ok(pages > 0, `${filePath}: PDF has no pages`);
  assert.ok(text.trim().length > 2000, `${filePath}: PDF text is unexpectedly sparse`);
  assert.doesNotMatch(text, /\bundefined\b|\bNaN\b/i, `${filePath}: PDF contains undefined/NaN text`);
  return { pages, words: text.trim().split(/\s+/).length };
}

await fs.mkdir(outputDir, { recursive: true });
const results = [];
try {
  const fixture = await fs.readFile(fixturePath, 'utf8');
  for (const [key, fileStem] of [['motheo', 'MK-Comprehensive-V12-Motheo-Terra-Owner-Review'], ['bokamoso', 'MK-Comprehensive-V12-Bokamoso-Weak-Remediation-Owner-Review']]) {
    const { data, factPack } = deliveryFor(key);
    assertNarrativeFactPack(factPack);
    const storyPlan = buildNarrativeStoryPlan(factPack);
    assertNarrativeStoryPlan(storyPlan, factPack);
    const blueprint = buildReportBlueprint(factPack, storyPlan);
    assertReportBlueprint(blueprint, factPack);
    const markdown = key === 'motheo' ? fixture : syntheticBokamosoManuscript(factPack, blueprint);
    const bound = bindComprehensiveFixtureManuscript({ markdown, factPack, storyPlan, blueprint, generationId: `provider-free-${key}` });
    assert.equal(bound.narrative.ok, true, `${key}: fixture did not bind to the current Blueprint`);
    assert.equal(bound.validation.ok, true, `${key}: bound manuscript failed hard-truth validation: ${JSON.stringify(bound.validation.hardTruth.issues)}`);
    assert.equal(bound.validation.quality.status, 'PASS', `${key}: bound manuscript failed quality validation: ${JSON.stringify(bound.validation.quality.issues)}`);
    const presentation = buildComprehensiveNarrativePresentationModel({ factPack, blueprint, narrative: bound.narrative });
    const html = renderComprehensiveNarrativeReportHtml(presentation);
    const visual = assertPresentationQuality({ key, data, factPack, blueprint, html });
    const pdfPath = path.join(outputDir, `${fileStem}.pdf`);
    await fs.writeFile(pdfPath, await renderHtmlToPdfBuffer(html, { footerLabel: `MK Fraud Insights · Comprehensive Fraud Readiness Report · ${data.assessmentReference}` }));
    const pdf = { ...(await pdfFacts(pdfPath)), sha256: await sha256File(pdfPath) };
    assert.ok(pdf.pages <= 36, `${key}: PDF exceeds the Reporting Bible's 36-page upper bound`);
    const evidence = {
      profile: key,
      organisation: data.organisationName,
      assessmentReference: data.assessmentReference,
      score: data.scoreRun.overallScore,
      maturity: data.scoreRun.finalMaturity,
      narrativeMode: factPack.narrativeMode,
      brand: {
        authority: 'accepted Essential production renderer',
        logoAsset: 'approved-mk-fraud-insights-mark via renderCoverLogo',
        tokenSource: 'MK_CSS_VARIABLES',
        coverReference: true,
        confidentiality: true,
        externalAssets: false
      },
      factPackSha256: sha256Json(factPack),
      blueprintSha256: sha256Json(blueprint),
      factPack: { schemaVersion: factPack.schemaVersion, facts: factPack.facts.length, findings: factPack.findings.length, risks: factPack.risks.length, scenarios: factPack.scenarios.length, controls: factPack.controls.length, decisions: factPack.decisions.length, roadmap: factPack.roadmap.length, maturationSteps: factPack.maturationSteps.length },
      blueprint: { chapters: blueprint.chapters.length, sections: blueprint.chapters.reduce((sum, chapter) => sum + chapter.sections.length, 0), exhibits: blueprint.chapters.reduce((sum, chapter) => sum + chapter.exhibits.length, 0), transformation: blueprint.transformationSequence.map((stage) => stage.stage) },
      manuscript: { source: key === 'motheo' ? 'preserved-terra-fixture' : 'deterministic-fact-pack-derived-synthetic-fixture', providerCalls: 0, recovery: { initialGenerationCount: 0, targetedRepairCount: 0, fullRegenerationCount: 0, qualityEscalationCount: 0, coherenceCount: 0, technicalFallbackCount: 0, totalCalls: 0 }, hardTruth: bound.validation.hardTruth, quality: bound.validation.quality },
      visual,
      pdf,
      pdfPath
    };
    results.push(evidence);
    await fs.writeFile(path.join(outputDir, `${fileStem}.html`), html);
  }
} finally {
  await closeRenderBrowser();
}

const summary = { status: 'PASS', gate: 'comprehensive-current-path-acceptance', providerCalls: 0, databaseWrites: 0, outputs: results };
await fs.writeFile(path.join(outputDir, 'comprehensive-current-path-acceptance.json'), `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
