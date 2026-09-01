#!/usr/bin/env node
/**
 * Provider-free acceptance for the current Comprehensive path.
 *
 * This gate deliberately exercises the same deterministic chain used by the
 * customer product. Motheo uses the preserved Terra whole-manuscript fixture;
 * Bokamoso uses a bounded representative composition manuscript. The latter
 * exercises object placement and renderer behaviour only; it is not evidence
 * of live commercial narrative quality.
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

function lowerInitial(value) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text ? `${text.charAt(0).toLowerCase()}${text.slice(1)}` : '';
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
      return `The assessment records a readiness score of ${value.overall} out of 100${value.exposureBand ? ` and an ${String(value.exposureBand).toLowerCase()} exposure position` : ''}.`;
    case 'maturity':
      return `The recorded maturity is ${value.maturity ?? value.calculatedMaturity ?? 'not assigned'}, subject to the published scoring method.`;
    case 'domain':
      return `${value.name ?? 'This domain'} is recorded at ${value.score ?? 'not scored'} out of 100, with the assessed coverage and gap position carried into the management view.`;
    case 'relative_strength':
      return `${sentence(value.title, 'An assessed capability supports the position')} ${sentence(value.basis, 'Its recorded position supports continued management attention')}`;
    case 'systemic_theme':
      return `${sentence(value.title, 'The connected pattern')} ${sentence(value.whyTogether || value.managementImplicationBasis, 'requires a joined management response')} ${sentence(value.fraudRiskRelationship, 'The fraud-risk relationship remains conditional on the recorded conditions')}`;
    case 'finding':
      return `${sentence(value.title, 'The assessment records a material condition')} Recorded position: ${sentence(withoutIds(value.recordedPosition), 'The condition is not consistently in place')} ${sentence(value.interpretation || value.advisoryMeaningBasis, 'The condition has a practical management implication')} ${sentence(value.approvedControlResponse, 'Management should define the target response, owner and measure')}`;
    case 'risk':
      return `${sentence(value.title, 'The associated risk')} ${sentence(value.statement, 'Could affect timely challenge or recovery')} Approved treatment: ${sentence(withoutIds(value.approvedTreatment), 'Define and retain the required operating response')}`;
    case 'scenario':
      return `Actor: ${sentence(withoutIds(value.actorClass), 'An actor may act through the recorded pathway')} Entry point: ${sentence(withoutIds(value.entryPoint), 'A sensitive process entry point is involved')} Mechanism: ${sentence(withoutIds(value.mechanism), 'The pathway may alter value or records before timely challenge')} Current weakness: ${sentence(withoutIds(value.currentControlWeakness), 'Control coverage is incomplete')} Possible consequence: ${sentence(withoutIds(value.consequence), 'Loss or delayed recovery may follow')}`;
    case 'control':
      return `The target control objective is to ${lowerInitial(withoutIds(value.objective)) || 'interrupt the linked fraud pathway'}. It should be owned by ${lowerInitial(withoutIds(value.accountableExecutive)) || 'the accountable executive'} with ${lowerInitial(withoutIds(value.processOwner)) || 'a named process owner'}, cover ${lowerInitial(withoutIds(value.population)) || 'the complete in-scope population'}, operate ${lowerInitial(withoutIds(value.frequency)) || 'on the defined management rhythm'}, retain ${lowerInitial(withoutIds(value.proofRetained?.join('; '))) || 'the named operating record'} and measure ${lowerInitial(withoutIds(value.effectivenessMeasure)) || 'timely completion and exception closure'}.`;
    case 'decision':
      return `Management should decide ${lowerInitial(withoutIds(value.question)) || 'the route for the priority response'}. Recommended route: ${sentence(lowerInitial(withoutIds(value.recommendedRoute)), 'Use the route recorded for this priority')} Rationale: ${sentence(lowerInitial(withoutIds(value.rationale)), 'It connects ownership, control design and review')} ${sentence(value.consequenceOfDelay, 'Delay would leave the current condition without a clear management route')}`;
    case 'roadmap':
      return `During ${lowerInitial(withoutIds(value.phaseWindow)) || 'the next implementation window'}, management should ${lowerInitial(withoutIds(value.priorityWork)) || 'complete the priority work'} so that ${lowerInitial(withoutIds(value.managementOutcome)) || 'the target operating condition becomes visible'}. Accountable executive: ${withoutIds(value.accountableExecutive) || 'the named owner'}; completion proof: ${lowerInitial(withoutIds(value.proofOfCompletion)) || 'the retained completion record'}; measure: ${lowerInitial(withoutIds(value.successMeasure)) || 'the recorded success measure'}.`;
    case 'maturation':
      return `The ${String(value.stage ?? 'next').toLowerCase()} maturation step should move the response toward ${lowerInitial(withoutIds(value.targetState)) || 'a repeatable, measured operating rhythm'} through ${lowerInitial(withoutIds(value.priorityWork)) || 'the approved management work'}.`;
    case 'proof_of_progress':
      return `Management should retain ${lowerInitial(withoutIds(value.requirement)) || 'the required proof of progress'} because ${lowerInitial(withoutIds(value.whyItMatters)) || 'it makes ownership and completion visible'}.`;
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
  const emittedFactIds = new Set();
  const emittedDescriptionTexts = new Set();
  const compositionLeads = [
    (title) => `For ${title.toLowerCase()}, the selected record is followed by the management response it calls for.`,
    (title) => `The material point for ${title.toLowerCase()} is stated here alongside its associated action.`,
    (title) => `This section places ${title.toLowerCase()} in context and identifies the next management checkpoint.`,
    (title) => `The evidence selected for ${title.toLowerCase()} points to the priority that should remain visible.`,
    (title) => `The account for ${title.toLowerCase()} keeps ownership, timing and proof in view.`,
    (title) => `The selected records for ${title.toLowerCase()} provide a concise view of the response that follows.`
  ];
  const managementTakeaways = {
    JUDGEMENT: ['Management should read the recorded position with its assurance boundary in view.', 'The stated position should guide the next owned management response.'],
    DIAGNOSIS: ['Linked conditions show where management attention should concentrate.', 'The connected conditions identify the point that needs coordinated attention.'],
    EVIDENCE: ['The selected evidence should inform a focused management response.', 'The supporting record should remain available for management challenge and follow-through.'],
    EXPOSURE: ['The conditional pathway should guide prevention, monitoring and escalation.', 'The pathway gives management a practical test for exposure and response.'],
    EXPOSURE_ILLUSTRATION: ['The conditional pathway should guide prevention, monitoring and escalation.', 'The illustration keeps the possible route to loss visible without treating it as an allegation.'],
    TARGET_STATE: ['The target control should have clear ownership, proof and response criteria.', 'The target state is credible only when ownership and evidence are explicit.'],
    RESPONSE: ['The response should make ownership, timing and completion visible.', 'A defined response should connect action, owner and completion evidence.'],
    DECISION: ['Leadership should choose a route with ownership, timing and consequence of delay visible.', 'The choice should make its owner, timing and consequence clear.'],
    IMPLEMENTATION: ['The implementation sequence should make progress and accountability visible.', 'The opening sequence should show what changes first and how completion will be known.'],
    MATURATION: ['Progress should be measured through owned outcomes and retained management records.', 'Maturity should be demonstrated by repeatable outcomes and review evidence.'],
    SUSTAINMENT: ['The strong standard should remain owned, reviewed and responsive to material change.', 'The established standard should remain visible through ownership, review and timely response.'],
    CONCLUSION: ['Management should leave with one clear commitment and the next checkpoint.', 'The closing position should resolve into a named commitment and a review date.']
  };
  const managementTakeaway = (role, index) => {
    const choices = managementTakeaways[role] ?? ['Management should keep the response specific, owned and measurable.'];
    return choices[index % choices.length];
  };
  for (const [headingIndex, heading] of skeleton.headings.entries()) {
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
    const localFacts = factsForRefs(factPack, [...new Set(refs)]);
    const facts = localFacts.filter((fact) => !emittedFactIds.has(fact.id)).slice(0, 2);
    facts.forEach((fact) => emittedFactIds.add(fact.id));
    const descriptions = facts.map((fact) => {
      const prose = factProse(fact);
      const normalized = prose.replace(/\s+/g, ' ').trim();
      if (emittedDescriptionTexts.has(normalized)) return '';
      emittedDescriptionTexts.add(normalized);
      return prose;
    }).filter(Boolean);
    if (!descriptions.length && localFacts[0] && !emittedFactIds.has(localFacts[0].id)) {
      emittedFactIds.add(localFacts[0].id);
      descriptions.push(factProse(localFacts[0]));
    }
    const isManagementConclusion = /management conclusion/i.test(`${chapter?.title ?? ''} ${heading.title}`);
    const paragraphGroups = isManagementConclusion
      ? [
        'The assessed position now needs an owned management route. The next checkpoint should keep priorities, owners, review timing and completion records visible.',
        'Within 90 days, management should confirm accountable ownership, stabilise priority controls and begin a repeatable review cycle with retained evidence.',
        'The lasting objective is a control environment that remains understood, monitored and responsive when conditions change.'
      ]
      : [
        compositionLeads[headingIndex % compositionLeads.length](heading.title),
        ...descriptions,
        managementTakeaway(source?.narrativeRole ?? chapter?.narrativeRole, headingIndex)
      ];
    blocks.push('', paragraphGroups.join(' '));
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

function decisionStructure(decision) {
  return {
    options: decision.options.map((option) => ({ option: option.option, cost: option.cost, benefit: option.benefit, tradeOff: option.tradeOff })),
    recommendedRoute: decision.recommendedRoute,
    rationale: decision.rationale,
    owner: decision.owner,
    targetDate: decision.targetDate,
    consequenceOfDelay: decision.consequenceOfDelay
  };
}

function decisionWords(value) {
  return new Set(String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ').filter((word) => word.length > 2));
}

function decisionSimilarity(left, right) {
  const a = decisionWords(JSON.stringify(decisionStructure(left)));
  const b = decisionWords(JSON.stringify(decisionStructure(right)));
  const intersection = [...a].filter((word) => b.has(word)).length;
  const union = new Set([...a, ...b]).size;
  return union ? Number((intersection / union).toFixed(4)) : 1;
}

function assertDecisionSpecificity(decisions, key) {
  const structures = decisions.map(decisionStructure);
  const exactFingerprints = structures.map((structure) => sha256Json(structure));
  assert.equal(new Set(exactFingerprints).size, decisions.length, `${key}: materially identical decision structures remain`);
  const comparisons = [];
  let maxPairwiseSimilarity = 0;
  for (let left = 0; left < decisions.length; left += 1) {
    for (let right = left + 1; right < decisions.length; right += 1) {
      const similarity = decisionSimilarity(decisions[left], decisions[right]);
      maxPairwiseSimilarity = Math.max(maxPairwiseSimilarity, similarity);
      comparisons.push({ left: decisions[left].factRef, right: decisions[right].factRef, similarity });
      assert.ok(similarity < 0.9, `${key}: decision structures ${decisions[left].factRef} and ${decisions[right].factRef} are materially duplicated (${similarity})`);
    }
  }
  return { count: decisions.length, exactUnique: true, fingerprints: exactFingerprints, maxPairwiseSimilarity, comparisons };
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
  const decisionProof = assertDecisionSpecificity(factPack.decisions, key);
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
    assert.match(html, /INTERNAL QA · PROVIDER-FREE STRUCTURAL COMPOSITION FIXTURE/, `${key}: structural fixture watermark missing`);
    assert.match(html, /tone-critical|watch-exhibit/);
    assert.match(html, /Conditional fraud pathways/);
    assert.match(html, /Target control environment/);
    assert.match(html, /Management decisions required/);
    assert.match(html, /STABILISE/);
    assert.match(html, /MATURE/);
  }
  return {
    exhibits: actualExhibitIds.length,
    exhibitProof: { expectedIds: expectedExhibitIds, actualIds: actualExhibitIds, duplicateIds: [] },
    narrativeCharacters: narrativeText.length,
    exhibitCharacters: exhibitText.length,
    score: data.scoreRun.overallScore,
    maturity: data.scoreRun.finalMaturity,
    decisionProof
  };
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
  for (const [key, fileStem] of [['motheo', 'MK-Comprehensive-V12-Motheo-Terra-Owner-Review'], ['bokamoso', 'MK-Comprehensive-Bokamoso-Provider-Free-Structural-Composition-Fixture']]) {
    const { data, factPack } = deliveryFor(key);
    assertNarrativeFactPack(factPack);
    const storyPlan = buildNarrativeStoryPlan(factPack);
    assertNarrativeStoryPlan(storyPlan, factPack);
    const blueprint = buildReportBlueprint(factPack, storyPlan);
    assertReportBlueprint(blueprint, factPack);
    const markdown = key === 'motheo' ? fixture : syntheticBokamosoManuscript(factPack, blueprint);
    const bound = bindComprehensiveFixtureManuscript({ markdown, factPack, storyPlan, blueprint, generationId: `provider-free-${key}` });
    assert.equal(bound.narrative.ok, true, `${key}: fixture did not bind to the current Blueprint: ${JSON.stringify(bound.narrative.errors)}`);
    assert.equal(bound.validation.ok, true, `${key}: bound manuscript failed hard-truth validation: ${JSON.stringify(bound.validation.hardTruth.issues)}`);
    if (key === 'motheo') assert.equal(bound.validation.quality.status, 'PASS', `${key}: bound manuscript failed quality validation: ${JSON.stringify(bound.validation.quality.issues)}`);
    const presentation = buildComprehensiveNarrativePresentationModel({
      factPack,
      blueprint,
      narrative: bound.narrative,
      qaLabel: key === 'bokamoso' ? 'INTERNAL QA · PROVIDER-FREE STRUCTURAL COMPOSITION FIXTURE · NOT COMMERCIAL NARRATIVE ACCEPTANCE' : undefined
    });
    const html = renderComprehensiveNarrativeReportHtml(presentation);
    const visual = assertPresentationQuality({ key, data, factPack, blueprint, html });
    const pdfPath = path.join(outputDir, `${fileStem}.pdf`);
    await fs.writeFile(pdfPath, await renderHtmlToPdfBuffer(html, { footerLabel: `MK Fraud Insights · Comprehensive Fraud Readiness Report · ${data.assessmentReference}` }));
    const pdf = { ...(await pdfFacts(pdfPath)), sha256: await sha256File(pdfPath) };
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
      acceptance: {
        evidenceClass: key === 'motheo' ? 'provider-free-structural-acceptance-from-preserved-terra-manuscript' : 'provider-free-structural-composition-fixture',
        narrativeQuality: key === 'motheo' ? 'PRESERVED_SOURCE_ONLY' : 'NOT_EVALUATED',
        commercialValue: 'NOT_CLAIMED',
        liveCommercialNarrativeAcceptance: 'NOT_RUN'
      },
      manuscript: { source: key === 'motheo' ? 'preserved-terra-manuscript-structural-replay' : 'provider-free-structural-composition-fixture', providerCalls: 0, recovery: { initialGenerationCount: 0, targetedRepairCount: 0, fullRegenerationCount: 0, qualityEscalationCount: 0, coherenceCount: 0, technicalFallbackCount: 0, totalCalls: 0 }, hardTruth: bound.validation.hardTruth, quality: key === 'motheo' ? bound.validation.quality : { status: 'NOT_EVALUATED', issues: bound.validation.quality.issues } },
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

const summary = {
  status: 'PASS',
  gate: 'comprehensive-current-path-acceptance',
  acceptance: {
    providerFreeStructuralAcceptance: 'PASS',
    liveCommercialNarrativeAcceptance: 'NOT_RUN',
    commercialValue: 'NOT_CLAIMED'
  },
  providerCalls: 0,
  databaseWrites: 0,
  workbookControllerAcceptance: 'PENDING_CROSS_ARTIFACT_INSPECTION',
  outputs: results
};
await fs.writeFile(path.join(outputDir, 'comprehensive-current-path-acceptance.json'), `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
