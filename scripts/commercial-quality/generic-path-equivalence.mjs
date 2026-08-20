#!/usr/bin/env node
/**
 * Generic-path equivalence check for the retired owner-correction gate.
 *
 * Builds the reference organisation's blueprint twice from one Fact Pack: once
 * with the gated engine as it stood at the given commit, once with the generic
 * engine in the working tree. The comparison is analytical, not textual — the
 * generic path is not expected to reproduce the old wording, and reproducing it
 * would be the defect, not the proof.
 *
 * Usage:
 *   BASELINE_REF=a910d67 ORDER=MKORD-2026-22FF6B69 npm run v11:generic-path-equivalence
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { assembleReportData } from '../../src/lib/reports/assemble-report-data.ts';
import { buildAdvisoryEvidenceModel } from '../../src/lib/reports/evidence-model/index.ts';
import { buildEssentialProjection } from '../../src/lib/reports/essential-projection.ts';
import { buildEssentialNarrativeFactPack } from '../../src/lib/reports/narrative/fact-pack.ts';
import { buildNarrativeStoryPlan } from '../../src/lib/reports/narrative/story-plan.ts';
import { buildReportBlueprint } from '../../src/lib/reports/narrative/report-blueprint.ts';

const order = process.env.ORDER ?? 'MKORD-2026-22FF6B69';
const baselineRef = process.env.BASELINE_REF ?? 'a910d673e67140da1bfb1c8729b284f090ada529';
const blueprintPath = 'src/lib/reports/narrative/report-blueprint.ts';
const shadowPath = path.join(path.dirname(blueprintPath), '__baseline-report-blueprint.ts');

// The baseline module must sit beside the real one so its relative imports resolve.
fs.writeFileSync(shadowPath, execFileSync('git', ['show', `${baselineRef}:${blueprintPath}`], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }));

let report;
try {
  const baseline = await import(`../../${shadowPath}`);
  const data = await assembleReportData(order);
  const evidence = buildAdvisoryEvidenceModel(data);
  const pack = buildEssentialNarrativeFactPack(data, evidence, buildEssentialProjection(data, evidence));
  const plan = buildNarrativeStoryPlan(pack);

  const gated = baseline.buildReportBlueprint(pack, plan);
  const generic = buildReportBlueprint(pack, plan);

  /** Analytical shape of a blueprint: what it argues and what it owns, not how it words it. */
  const shape = (blueprint) => ({
    chapters: blueprint.chapters.map((chapter) => chapter.chapterId),
    narrativeRoles: [...new Set(blueprint.chapters.flatMap((chapter) => [chapter.narrativeRole, ...chapter.sections.map((section) => section.narrativeRole)]))].filter(Boolean).sort(),
    sectionsPerChapter: Object.fromEntries(blueprint.chapters.map((chapter) => [chapter.chapterId, chapter.sections.length])),
    clusterIds: blueprint.findingClusters.map((cluster) => cluster.clusterId),
    clusterOwnership: Object.fromEntries(blueprint.findingClusters.map((cluster) => [cluster.clusterId, [...cluster.findingRefs].sort()])),
    clusterFamilies: Object.fromEntries(blueprint.findingClusters.map((cluster) => [cluster.clusterId, [...cluster.semanticFamilies].sort()])),
    ownedFindingRefs: [...new Set(blueprint.findingClusters.flatMap((cluster) => cluster.findingRefs))].sort(),
    assignedContentRefs: [...new Set(blueprint.contentAssignments.map((assignment) => assignment.contentRef))].sort(),
    claimRefs: [...new Set(blueprint.chapters.flatMap((chapter) => chapter.sections.flatMap((section) => [...section.requiredFacts, ...(section.claimRefs ?? [])])))].sort()
  });

  const before = shape(gated);
  const after = shape(generic);

  const setDiff = (a, b) => ({ onlyBefore: a.filter((x) => !b.includes(x)), onlyAfter: b.filter((x) => !a.includes(x)) });

  const packFindingRefs = pack.findings.map((finding) => finding.factRef).sort();
  const packScenarioRefs = (pack.scenarios ?? []).map((scenario) => scenario.factRef).sort();
  const roadmapPeriods = [...new Set(pack.roadmap.map((item) => item.targetPeriod))];

  const findings = [];
  const check = (name, ok, detail) => { findings.push({ check: name, result: ok ? 'PASS' : 'FAIL', detail }); return ok; };

  // 1. The argument still has the same chapters in the same order.
  check('chapter sequence unchanged', JSON.stringify(before.chapters) === JSON.stringify(after.chapters), setDiff(before.chapters, after.chapters));

  // 1b. The report is the same size and shape: same sections per chapter, so
  //     the customer is not quietly given a shorter document.
  check('sections per chapter unchanged', JSON.stringify(before.sectionsPerChapter) === JSON.stringify(after.sectionsPerChapter), { before: before.sectionsPerChapter, after: after.sectionsPerChapter });

  // 2. Exposure identity is unchanged: the same clusters exist.
  check('exposure cluster identity unchanged', JSON.stringify(before.clusterIds) === JSON.stringify(after.clusterIds), setDiff(before.clusterIds, after.clusterIds));

  // 3. Ownership may change only in one permitted direction. A finding may leave
  //    the exposure register when it is cross-cutting — governance, risk
  //    identification or culture enable every exposure rather than being one —
  //    and it must then be diagnosed instead. Anything else is a loss.
  const CROSS_CUTTING = ['FRAUD_GOVERNANCE', 'FRAUD_RISK_IDENTIFICATION', 'FRAUD_CULTURE'];
  const familyOf = new Map(pack.findings.map((finding) => [finding.factRef, finding.primarySemanticFamily]));
  const diagnosisRefs = new Set(generic.contentAssignments.filter((assignment) => assignment.narrativeRole === 'DIAGNOSIS').map((assignment) => assignment.contentRef));
  const leftRegister = before.ownedFindingRefs.filter((ref) => !after.ownedFindingRefs.includes(ref));
  const unexplained = leftRegister.filter((ref) => !CROSS_CUTTING.includes(familyOf.get(ref)) || !diagnosisRefs.has(ref));
  check('every ownership change is a cross-cutting finding moved to diagnosis', unexplained.length === 0, { leftRegister: leftRegister.map((ref) => ({ ref, family: familyOf.get(ref), diagnosed: diagnosisRefs.has(ref) })), unexplained });
  check('cross-cutting findings are treated consistently', pack.findings.filter((finding) => CROSS_CUTTING.includes(finding.primarySemanticFamily)).every((finding) => !after.ownedFindingRefs.includes(finding.factRef)), pack.findings.filter((finding) => CROSS_CUTTING.includes(finding.primarySemanticFamily)).map((finding) => ({ ref: finding.factRef, family: finding.primarySemanticFamily, inRegister: after.ownedFindingRefs.includes(finding.factRef) })));

  // 3. Nothing analytical was dropped. Losing coverage would be a regression;
  //    gaining it is the generic path being better, which is permitted.
  const claims = setDiff(before.claimRefs, after.claimRefs);
  check('no claim reference lost', claims.onlyBefore.length === 0, claims);
  const assigned = setDiff(before.assignedContentRefs, after.assignedContentRefs);
  check('no assigned content lost', assigned.onlyBefore.length === 0, assigned);

  // 4. Every finding still has an exposure home, and none is owned twice.
  const ownedTwice = after.ownedFindingRefs.length !== [...new Set(after.ownedFindingRefs)].length;
  check('no finding owned by two clusters', !ownedTwice, after.ownedFindingRefs.length);
  const homeless = packFindingRefs.filter((ref) => !after.assignedContentRefs.includes(ref));
  check('every finding has a chapter home', homeless.length === 0, homeless);

  // 5. Every conditional scenario still has a home.
  const orphanScenarios = packScenarioRefs.filter((ref) => !after.assignedContentRefs.includes(ref));
  check('every scenario has a chapter home', orphanScenarios.length === 0, orphanScenarios);

  // 6. The implementation sequence still covers every roadmap period.
  const roadmapChapter = generic.chapters.find((chapter) => chapter.chapterId === 'FIRST-90-DAYS-CONCLUSION');
  const coveredPeriods = roadmapPeriods.filter((period) => (roadmapChapter?.sections ?? []).some((section) => section.title.includes(period)));
  check('every roadmap period has a stage', coveredPeriods.length === roadmapPeriods.length, { roadmapPeriods, coveredPeriods });

  // 7. The narrative roles the compiler depends on are all still present.
  const roles = setDiff(before.narrativeRoles, after.narrativeRoles);
  check('no narrative role lost', roles.onlyBefore.length === 0, roles);

  // 8. The generic path did not simply reproduce the gated prose.
  const gatedRuleText = JSON.stringify(gated.deterministicRules ?? []);
  const genericRuleText = JSON.stringify(generic.deterministicRules ?? []);
  check('deterministic rules are generic, not customer prose', !/rivonia/i.test(genericRuleText), { gatedMentionsCustomer: /rivonia/i.test(gatedRuleText), genericMentionsCustomer: /rivonia/i.test(genericRuleText) });
  check('executive storyline is generic, not customer prose', !/rivonia/i.test(generic.executiveStory ?? ''), (generic.executiveStory ?? '').slice(0, 200));

  const failed = findings.filter((entry) => entry.result === 'FAIL');
  report = { order, baselineRef, organisation: pack.organisation.name, checks: findings, failed: failed.length, verdict: failed.length ? 'FAIL' : 'PASS' };
} finally {
  fs.rmSync(shadowPath, { force: true });
}

const outDir = process.env.CERT_OUTPUT_DIR ?? '/Users/tondani/Documents/Codex/outputs/essential-clean-live-certification';
fs.mkdirSync(path.join(outDir, 'analysis'), { recursive: true });
fs.writeFileSync(path.join(outDir, 'analysis', 'generic-path-equivalence.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
process.exit(report.verdict === 'PASS' ? 0 : 1);
