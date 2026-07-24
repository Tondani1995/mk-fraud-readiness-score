import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  buildCleanAssuranceFixture,
  buildMateriallyWeakDecisionFixture,
  buildModerateDecisionFixture
} from '../src/lib/reports/evidence-model/__fixtures__/decision-fixtures.ts';
import { buildAdvisoryEvidenceModel } from '../src/lib/reports/evidence-model/index.ts';
import { adaptAdvisoryRoadmapToLegacyAgenda } from '../src/lib/reports/roadmap.ts';
import { selectContent } from '../src/lib/reports/select-content-blocks.ts';
import { buildPremiumReportEvidencePack } from '../src/lib/reports/automation/evidence.ts';
import { buildPremiumReportNarrativeBrief } from '../src/lib/reports/automation/narrative-brief.ts';
import { validatePremiumReportAiEditorialPlan } from '../src/lib/reports/automation/ai-plan-validation.ts';
import { validatePremiumReportNarrative } from '../src/lib/reports/automation/validation.ts';
import { aiPlanToNarrative, narrativeToSelectedContent } from '../src/lib/reports/automation/content.ts';
import { PREMIUM_REPORT_SCHEMA_VERSION } from '../src/lib/reports/automation/types.ts';
import { renderValidatedCommercialPdfWithNavigation } from '../src/lib/reports/render-validated-commercial-pdf.ts';
import { renderReportHtml } from '../src/lib/reports/templates/report-template.ts';

const ROOT = process.cwd();
const OUTPUT = path.join(ROOT, 'output', 'pdf');
const TMP = path.join(ROOT, 'tmp', 'pdfs');
const ARTIFACT = path.join(TMP, 'checkpoint-f-artifact');
const REPEAT = path.join(TMP, 'repeat-renders');
const METADATA = path.join(TMP, 'checkpoint-f-candidates.json');
const PDFTOPPM = process.env.PDFTOPPM_EXECUTABLE
  ?? (process.env.CODEX_PDF_BIN
    ? path.join(process.env.CODEX_PDF_BIN, 'pdftoppm')
    : process.platform === 'darwin'
      ? '/Users/tondani/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/override/pdftoppm'
      : 'pdftoppm');
const PYTHON = process.env.CODEX_PYTHON
  ?? (process.platform === 'darwin'
    ? '/Users/tondani/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3'
    : 'python3');
const CHROME = process.env.PUPPETEER_EXECUTABLE_PATH?.trim()
  || (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : '');
if (CHROME) process.env.PUPPETEER_EXECUTABLE_PATH = CHROME;

const DOMAIN_FOCUS = {
  D1: 'executive mandate, role separation and governance challenge',
  D2: 'process risk mapping, scenario identification and exposure ownership',
  D3: 'transaction approval, exception handling and preventive operation',
  D4: 'detection logic, alert review and investigative escalation',
  D5: 'incident triage, response authority and evidence preservation',
  D6: 'speak-up access, retaliation protection and case oversight',
  D7: 'supplier onboarding, invoice integrity and bank-detail verification',
  D8: 'identity assurance, privileged access and digital impersonation defence',
  D9: 'workforce awareness, behavioural reinforcement and accountability culture',
  D10: 'control testing, lessons learned and continuous monitoring cadence'
};

function context(data) {
  const advisoryModel = buildAdvisoryEvidenceModel(data);
  const roadmap = adaptAdvisoryRoadmapToLegacyAgenda(advisoryModel.roadmapActions);
  const deterministicContent = selectContent(data, []);
  const evidence = buildPremiumReportEvidencePack(data, advisoryModel, PREMIUM_REPORT_SCHEMA_VERSION);
  const brief = buildPremiumReportNarrativeBrief(evidence);
  return { data, advisoryModel, roadmap, deterministicContent, evidence, brief };
}

function bandForScore(rawScore) {
  if (rawScore === null || rawScore === undefined) return 'Not scored';
  if (rawScore < 40) return 'Reactive';
  if (rawScore < 65) return 'Developing';
  if (rawScore < 80) return 'Structured';
  return 'Strategic';
}

// A domain-response-pattern opener, not a single formula sentence repeated for every domain --
// wording changes with the recorded band so ten domains in one report do not read identically.
const BAND_OPENER = {
  Reactive: (focus) => `${focus} is not yet functioning as a working control`,
  Developing: (focus) => `${focus} is partly in place but still depends on specific people rather than a repeatable process`,
  Structured: (focus) => `${focus} is operating as designed across most of the business`,
  Strategic: (focus) => `${focus} is mature and is actively re-tested as the business changes`,
  'Not scored': (focus) => `${focus} was not scored in this assessment`
};

/**
 * Checkpoint F controller review, blocker 3: this stands in for a live AI editorial pass (no
 * provider is called -- see the module header) but must read like a commercial advisory, not a
 * QA artefact. It must (a) name the two or three fixture-specific drivers that actually matter,
 * using real evidence-model fields rather than a template with the organisation name swapped in,
 * and (b) produce domain/gap commentary that differs by domain and response pattern rather than
 * repeating one formula sentence ten times.
 */
const AI_SYNTHESIS_MARKER = 'This diagnosis draws together the complete set of recorded assessment evidence';

function validatedPlan(current) {
  const { data, brief, advisoryModel } = current;
  const clean = data.criticalMajorGaps.length === 0;
  const domainByCode = new Map(data.domainResults.map((domain) => [domain.domainCode, domain]));
  const gapByCode = new Map(data.criticalMajorGaps.map((gap) => [gap.questionCode, gap]));
  const criticalCount = data.criticalMajorGaps.filter((gap) => gap.isCriticalGap).length;
  const majorCount = data.criticalMajorGaps.filter((gap) => gap.isMajorGap).length;

  const topFindings = [...advisoryModel.materialFindings].sort((a, b) => b.materialityScore - a.materialityScore).slice(0, 3);
  const topDomainNames = [...new Set(topFindings.map((finding) => finding.domainName))];
  const domainList = topDomainNames.length > 1
    ? `${topDomainNames.slice(0, -1).join(', ')} and ${topDomainNames[topDomainNames.length - 1]}`
    : (topDomainNames[0] ?? 'the domains covered by this assessment');
  const leadFinding = topFindings[0];

  // Narrative bodies must never contain a numeric literal that is not the exact cited metric value
  // (see automation/ai-plan-validation.ts's numeric_claim_evidence_mismatch/metric_number_
  // reassignment checks) -- so scores are only ever named through data.scoreRun.overallScore
  // itself, and finding.diagnosis (which embeds "normalised score N/100") is deliberately avoided
  // in favour of finding.whyItMatters, which carries the same substance without a raw number.
  const driverSentence = clean
    ? `The strongest reported positions sit in ${domainList}, and none of them has yet been independently tested against the complete operating population.`
    : leadFinding
      ? `The condition that matters most sits in ${leadFinding.domainName.toLowerCase()}: ${leadFinding.questionPrompt.toLowerCase().replace(/\.$/, '')} was recorded at a level where ${leadFinding.whyItMatters.charAt(0).toLowerCase()}${leadFinding.whyItMatters.slice(1)}`
      : `${domainList} carry the conditions that matter most for this result.`;

  const plan = {
    executiveEvidenceRefs: [...brief.executive.requiredEvidenceRefs],
    executiveBody: `${AI_SYNTHESIS_MARKER} for ${data.organisationName}: an overall score of ${data.scoreRun.overallScore}, ${data.scoreRun.finalMaturity} final maturity and ${data.scoreRun.exposureBand} exposure. ${driverSentence} ${clean ? "Leadership's task now is to commission that validation rather than assume the self-reported strength already holds." : 'Until these conditions are addressed and independently retested, the headline score should not be read as operational assurance.'} This remains a self-assessment and has not been independently verified.`,
    falseComfortEvidenceRefs: [...brief.falseComfort.requiredEvidenceRefs],
    falseComfortBody: clean
      ? `${data.organisationName}'s result looks reassuring on paper, but a strong self-reported score is not the same claim as independently confirmed control effectiveness. ${domainList} are exactly the areas where that gap between "reported" and "proven" matters most, because a validation failure there would be expensive to discover late.`
      : criticalCount > 0
        ? `${data.organisationName} carries critical control condition${criticalCount === 1 ? '' : 's'}${majorCount > 0 ? ', alongside major conditions,' : ''} that a headline maturity band does not communicate on its own. A reader who stops at the summary page would miss exactly the conditions this report exists to surface.`
        : `${data.organisationName} recorded major control condition${majorCount === 1 ? '' : 's'} that sit beneath an otherwise workable-looking result. Averages can mask a specific weak control, and that is the pattern here.`,
    leadershipEvidenceRefs: [...brief.leadership.requiredEvidenceRefs],
    leadershipBody: (() => {
      const firstTwo = advisoryModel.leadershipDecisions.slice(0, 2);
      const sequenced = firstTwo.map((decision, index) => `${index === 0 ? 'First' : 'then'}, ${decision.decisionRequired.charAt(0).toLowerCase()}${decision.decisionRequired.slice(1).replace(/\.$/, '')}`).join('; ');
      return `${data.organisationName} leadership should sequence its decisions rather than approve all of them at once: ${sequenced || 'the decisions below should be approved in the order listed'}. Every remaining decision in this section follows the same dependency order, with a named accountable executive and a fixed target period attached.`;
    })(),
    domainEvidence: Object.entries(brief.domains).map(([domainCode, sectionBrief], domainIndex) => {
      const domain = domainByCode.get(domainCode);
      const band = bandForScore(domain.rawScore);
      const focus = DOMAIN_FOCUS[domainCode] ?? domain.domainName.toLowerCase();
      const domainGaps = [...gapByCode.values()].filter((gap) => gap.domainCode === domainCode);
      const opener = BAND_OPENER[band](focus);
      // When every domain in one report shares the same band (a uniformly clean or uniformly weak
      // assessment), BAND_OPENER alone produces ten near-identical closing sentences even though the
      // focus text differs -- exactly the "same formula ten times" defect Checkpoint F controller
      // review blocker 3 flagged. Rotate the closing sentence structure by domain position so the
      // *shape* of the sentence varies too, not just the substituted focus/domain name.
      const domainLower = domain.domainName.toLowerCase();
      const noGapClosers = [
        `The open question for ${domainLower} is whether that position holds under a complete-population test, not the sampled self-assessment already recorded.`,
        `What has not yet happened for ${domainLower} is independent testing across the complete population, rather than reliance on the self-reported sample.`,
        `Leadership's remaining task for ${domainLower} is to prove that position under a full-population review, not to assume the self-assessment already carries that weight.`,
        `The self-assessment alone does not answer whether ${domainLower} would hold up under independent, complete-population scrutiny.`
      ];
      const body = domainGaps.length > 0
        ? `${opener}. The specific reason this domain needs attention before the rest of the score can be relied upon is the recorded condition on ${domainGaps[0].prompt.toLowerCase().replace(/\.$/, '')}.`
        : `${opener}. ${noGapClosers[domainIndex % noGapClosers.length]}`;
      return { domainCode, evidenceRefs: [...sectionBrief.requiredEvidenceRefs], body };
    }),
    gapEvidence: Object.entries(brief.gaps).map(([questionCode, sectionBrief]) => {
      const gap = gapByCode.get(questionCode);
      const finding = advisoryModel.materialFindings.find((item) => item.questionCode === questionCode);
      const mechanism = finding ? `${finding.fraudMechanism.charAt(0).toLowerCase()}${finding.fraudMechanism.slice(1)}` : 'the recorded gap increases the chance that a fraud attempt succeeds before it is noticed.';
      const body = `${gap.prompt} In practice, ${mechanism} Closing it depends on the exact control design and evidence already set out for this finding, not a generic policy statement.`;
      return { questionCode, evidenceRefs: [...sectionBrief.requiredEvidenceRefs], body };
    })
  };
  assert.equal(validatePremiumReportAiEditorialPlan(plan, current.evidence, current.brief).ok, true);
  const narrative = aiPlanToNarrative(current.data, current.deterministicContent, plan);
  assert.equal(validatePremiumReportNarrative(narrative, current.evidence).ok, true);
  return narrativeToSelectedContent(current.data, narrative, false);
}

function synthetic(base, organisation, assessmentReference, reportReference) {
  const data = structuredClone(base);
  data.organisationName = organisation;
  data.assessmentReference = assessmentReference;
  data.reportReference = reportReference;
  data.generatedAt = '2026-07-23T08:00:00.000Z';
  data.respondentName = 'Synthetic Review Respondent';
  data.customerEmail = 'synthetic-review@example.test';
  return data;
}

// Organisation names are synthetic and fixed (never production customer data), but must read as
// plausible client names -- Checkpoint F controller review blocker 3 flagged that literal internal
// process jargon ("Checkpoint F ... Organisation") was rendering on the customer-facing cover page.
const candidates = [
  {
    name: 'mk-essential-v7-materially-weak-ai',
    fixture: 'materially-weak',
    mode: 'ai',
    organisation: 'Riverbend Distribution Group',
    assessmentReference: 'ESS-WEAK-AI-2026',
    reportReference: 'RPT-WEAK-AI-2026',
    base: buildMateriallyWeakDecisionFixture(),
    aiMarker: AI_SYNTHESIS_MARKER
  },
  {
    name: 'mk-essential-v7-materially-weak-fallback',
    fixture: 'materially-weak',
    mode: 'fallback',
    organisation: 'Northfield Facilities Group',
    assessmentReference: 'ESS-WEAK-FALLBACK-2026',
    reportReference: 'RPT-WEAK-FALLBACK-2026',
    base: buildMateriallyWeakDecisionFixture(),
    aiMarker: AI_SYNTHESIS_MARKER
  },
  {
    name: 'mk-essential-v7-moderate-ai',
    fixture: 'moderate',
    mode: 'ai',
    organisation: 'Coastal Retail Holdings',
    assessmentReference: 'ESS-MODERATE-AI-2026',
    reportReference: 'RPT-MODERATE-AI-2026',
    base: buildModerateDecisionFixture(),
    aiMarker: AI_SYNTHESIS_MARKER
  },
  {
    name: 'mk-essential-v7-clean-assurance-ai',
    fixture: 'clean',
    mode: 'ai',
    organisation: 'Meridian Professional Services',
    assessmentReference: 'ESS-CLEAN-AI-2026',
    reportReference: 'RPT-CLEAN-AI-2026',
    base: buildCleanAssuranceFixture(),
    aiMarker: AI_SYNTHESIS_MARKER
  }
];

async function renderCandidate(candidate) {
  const data = synthetic(candidate.base, candidate.organisation, candidate.assessmentReference, candidate.reportReference);
  const current = context(data);
  const content = candidate.mode === 'ai'
    ? validatedPlan(current)
    : current.deterministicContent;
  const input = { data, content, roadmap: current.roadmap, evidenceModel: current.advisoryModel };
  const first = await renderValidatedCommercialPdfWithNavigation(input);
  const second = await renderValidatedCommercialPdfWithNavigation(input);
  const firstPath = path.join(ARTIFACT, 'pdf', `${candidate.name}.pdf`);
  const outputPath = path.join(OUTPUT, `${candidate.name}.pdf`);
  const repeatPdf = path.join(TMP, `${candidate.name}-repeat.pdf`);
  await writeFile(firstPath, first);
  await writeFile(outputPath, first);
  await writeFile(repeatPdf, second);
  const renderDir = path.join(ARTIFACT, 'renders', candidate.name);
  const repeatDir = path.join(REPEAT, candidate.name);
  await mkdir(renderDir, { recursive: true });
  await mkdir(repeatDir, { recursive: true });
  execFileSync(PDFTOPPM, ['-png', '-r', '200', firstPath, path.join(renderDir, 'raw')], { stdio: 'inherit' });
  execFileSync(PDFTOPPM, ['-png', '-r', '200', repeatPdf, path.join(repeatDir, 'raw')], { stdio: 'inherit' });
  const { readdir, rename } = await import('node:fs/promises');
  for (const directory of [renderDir, repeatDir]) {
    const files = (await readdir(directory)).filter((file) => /^raw-\d+\.png$/.test(file)).sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
    for (const [index, file] of files.entries()) await rename(path.join(directory, file), path.join(directory, `page-${String(index + 1).padStart(3, '0')}.png`));
  }
}

console.log('V7 Checkpoint F — rendered PDF commercial review');

// Blocker 2 (Checkpoint F controller review): the rendered exposure headline must always be
// derived from the authoritative sr.exposureBand, and only ever mention that exact band -- never
// re-derived from an independent percentage-threshold heuristic that can disagree with it.
console.log('  checking exposure headline derivation against every authoritative band');
const EXPOSURE_BANDS = ['Low', 'Moderate', 'High', 'Severe'];
for (const band of EXPOSURE_BANDS) {
  const data = synthetic(buildModerateDecisionFixture(), 'Exposure Heading Fixture ' + band, 'CPF-EXPOSURE-' + band, 'CPF-EXPOSURE-' + band + '-REPORT');
  data.scoreRun = { ...data.scoreRun, exposureBand: band };
  const current = context(data);
  const html = renderReportHtml(data, current.deterministicContent, current.roadmap, current.advisoryModel);
  assert.ok(html.includes(`${band} exposure with`), `expected the "${band} exposure with…" headline for the ${band} band fixture`);
  for (const other of EXPOSURE_BANDS.filter((value) => value !== band)) {
    assert.ok(!html.includes(`${other} exposure with`), `${band}-band report must never render "${other} exposure with…"`);
  }
  console.log(`    ok — ${band} fixture renders "${band} exposure with…" and no other band`);
}

await rm(ARTIFACT, { recursive: true, force: true });
await rm(REPEAT, { recursive: true, force: true });
await mkdir(path.join(ARTIFACT, 'pdf'), { recursive: true });
await mkdir(OUTPUT, { recursive: true });
for (const candidate of candidates) {
  console.log(`  rendering twice: ${candidate.name}`);
  await renderCandidate(candidate);
}
await writeFile(METADATA, JSON.stringify({
  candidates: candidates.map(({ base, ...item }) => ({ ...item, exposureBand: base.scoreRun.exposureBand }))
}, null, 2));
execFileSync(PYTHON, [path.join(ROOT, 'scripts', 'checkpoint-f-pdf-audit.py'), ARTIFACT, METADATA], { stdio: 'inherit' });

const audit = JSON.parse(await readFile(path.join(ARTIFACT, 'inspection', 'pdf-audit.json'), 'utf8'));
const text = Object.fromEntries(await Promise.all(candidates.map(async (candidate) => [
  candidate.name,
  await readFile(path.join(ARTIFACT, 'extracted-text', `${candidate.name}.txt`), 'utf8')
])));
const sha = (value) => createHash('sha256').update(value).digest('hex');
const models = candidates.map((candidate) => context(synthetic(candidate.base, candidate.organisation, candidate.assessmentReference, candidate.reportReference)).advisoryModel);

const tests = [
  ['F1 real render seam produced four valid PDF signatures', () => assert.equal(Object.keys(audit.candidateResults).length, 4)],
  ['F2 every PDF is A4 portrait and non-trivial', () => assert.ok(audit.checks.filter((x) => ['PDF_PAGE_SIZE_NOT_A4', 'PDF_FILE_TOO_SMALL'].includes(x.code)).every((x) => x.passed))],
  ['F3 every physical page has a 200-DPI raster', () => assert.ok(audit.checks.filter((x) => x.code === 'PDF_RENDER_PAGE_COUNT_MISMATCH').every((x) => x.passed))],
  ['F4 repeated renders are pixel-identical', () => assert.ok(audit.checks.filter((x) => x.code === 'PDF_VISUAL_NONDETERMINISM').every((x) => x.passed))],
  ['F5 no blank, footer-only or visually blank pages exist', () => assert.ok(audit.checks.filter((x) => /BLANK/.test(x.code)).every((x) => x.passed))],
  ['F6 all required commercial sections are present', () => assert.ok(audit.checks.filter((x) => x.code === 'PDF_REQUIRED_SECTION_MISSING').every((x) => x.passed))],
  ['F7 organisation and report references render correctly', () => assert.ok(audit.checks.filter((x) => /ORGANISATION_MISSING|REPORT_REFERENCE_MISSING/.test(x.code)).every((x) => x.passed))],
  ['F8 forbidden legacy copy and internal identifiers are absent', () => assert.ok(audit.checks.filter((x) => x.code.startsWith('PDF_FORBIDDEN_')).every((x) => x.passed))],
  ['F9 PII, secrets, URLs and AI provenance are absent', () => assert.ok(audit.checks.filter((x) => /EMAIL|SECRET|URL|AI_PROVENANCE/.test(x.code)).every((x) => x.passed))],
  ['F10 AI narratives render only in AI candidates', () => assert.ok(audit.checks.filter((x) => /AI_BODY_NOT_RENDERED|FALLBACK_RENDERED_AS_AI/.test(x.code)).every((x) => x.passed))],
  ['F11 AI and fallback use identical deterministic authority', () => assert.ok(audit.checks.filter((x) => x.code === 'PDF_AI_FALLBACK_AUTHORITY_MISMATCH').every((x) => x.passed))],
  ['F12 clean assurance avoids false failure language', () => assert.ok(audit.checks.filter((x) => x.code === 'PDF_CLEAN_FALSE_FAILURE_LANGUAGE').every((x) => x.passed))],
  ['F13 risk, decision and roadmap authority contains no semantic duplicates', () => { for (const model of models) for (const key of ['riskRegister', 'leadershipDecisions', 'roadmapActions']) { const values = model[key].map((item) => sha(JSON.stringify(item))); assert.equal(new Set(values).size, values.length); } }],
  ['F14 every evidence checklist item renders its required status', () => { for (const [index, candidate] of candidates.entries()) assert.ok((text[candidate.name].match(/Not yet\s+requested/g) ?? []).length >= models[index].evidenceChecklist.length); }],
  ['F15 the audit has zero blocking failures and publishes the complete review tree', async () => { assert.equal(audit.passed, true); for (const relative of ['pdf', 'renders', 'contact-sheets', 'inspection/pdf-audit.json', 'inspection/page-by-page-review.md', 'inspection/section-map.json', 'extracted-text']) await import('node:fs/promises').then((fs) => fs.stat(path.join(ARTIFACT, relative))); }],
  ['F16 review metadata uses the real PR head SHA, never the checkout merge-ref, when the two diverge', () => {
    const auditScript = path.join(ROOT, 'scripts', 'checkpoint-f-pdf-audit.py');
    // The CI workflow sets V7_ARTIFACT_HEAD_SHA for this whole step (so the *real* audit run below
    // uses the real PR head), which means it is already present in this test's own process.env --
    // inheriting it unmodified would test nothing here. The local-dev fallback path only exists
    // when the override is genuinely absent, so it must be stripped explicitly for this assertion,
    // regardless of what the ambient (CI or local) environment happens to have set.
    const envWithoutOverride = { ...process.env };
    delete envWithoutOverride.V7_ARTIFACT_HEAD_SHA;
    const withoutOverride = execFileSync(PYTHON, [auditScript, '--print-resolved-head-sha'], { cwd: ROOT, encoding: 'utf8', env: envWithoutOverride }).trim();
    const actualGitHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
    assert.equal(withoutOverride, actualGitHead, 'without a PR-head override, resolve_head_sha() must fall back to git rev-parse HEAD (the local-dev path)');

    // Simulate a pull_request CI run where the checked-out merge-ref commit (what `git rev-parse
    // HEAD` would return) differs from the real PR branch head GitHub ties the artifact to --
    // exactly the divergence this correction round fixes.
    const simulatedMergeRefHead = actualGitHead;
    const simulatedPrHead = `f${actualGitHead.slice(1)}` === actualGitHead ? `e${actualGitHead.slice(1)}` : `f${actualGitHead.slice(1)}`;
    assert.notEqual(simulatedPrHead, simulatedMergeRefHead, 'test fixture must actually simulate a divergent PR head');

    const withOverride = execFileSync(
      PYTHON,
      [auditScript, '--print-resolved-head-sha'],
      { cwd: ROOT, encoding: 'utf8', env: { ...process.env, V7_ARTIFACT_HEAD_SHA: simulatedPrHead } }
    ).trim();
    assert.equal(withOverride, simulatedPrHead, 'V7_ARTIFACT_HEAD_SHA (the PR branch head) must win over whatever git rev-parse HEAD (the merge-ref commit) would independently resolve to');
    assert.notEqual(withOverride, simulatedMergeRefHead, 'the resolved head SHA must not silently fall back to the merge-ref commit once a PR-head override is present');
  }],
  ['F17 near-empty-page rule regression fixtures (occupancy-led, no page-number exception)', () => {
    const auditScript = path.join(ROOT, 'scripts', 'checkpoint-f-pdf-audit.py');
    const output = execFileSync(PYTHON, [auditScript, '--self-test-near-empty-rule'], { cwd: ROOT, encoding: 'utf8' });
    assert.match(output, /all 5 near-empty-rule regression fixtures passed/);
  }],
  ['F18 no internal release-workflow copy in any customer PDF; replacement content present; review file unaffected', async () => {
    const auditScript = path.join(ROOT, 'scripts', 'checkpoint-f-pdf-audit.py');
    // 3. A deliberately injected release-candidate callout (and every phrase on the controller's
    //    minimum list) fails with PDF_INTERNAL_RELEASE_WORKFLOW_COPY, without falsely flagging
    //    ordinary fraud-control prose that happens to use the same bare words.
    const output = execFileSync(PYTHON, [auditScript, '--self-test-internal-release-copy'], { cwd: ROOT, encoding: 'utf8' });
    assert.match(output, /self_test_internal_release_workflow_copy: all fixtures passed/);

    // 1. All four real, rendered customer PDFs contain zero internal release-workflow phrases --
    //    the actual audit check, already run as part of the real render above.
    assert.ok(
      audit.checks.filter((x) => x.code === 'PDF_INTERNAL_RELEASE_WORKFLOW_COPY').length === candidates.length
        && audit.checks.filter((x) => x.code === 'PDF_INTERNAL_RELEASE_WORKFLOW_COPY').every((x) => x.passed),
      'PDF_INTERNAL_RELEASE_WORKFLOW_COPY must run and pass for every candidate'
    );

    // 4. The replacement customer-facing content -- a concrete, per-report "Recommended next step"
    //    -- is present in every candidate in place of the removed callout.
    for (const candidate of candidates) {
      assert.match(text[candidate.name], /Recommended next step/);
      assert.match(text[candidate.name], /Commission independent validation of/);
      assert.doesNotMatch(text[candidate.name], /Controller review remains required/i);
      assert.doesNotMatch(text[candidate.name], /commercial release candidate/i);
    }

    // 2. inspection/commercial-review.md (a non-customer review record, never scanned by the PDF
    //    audit) may still say controller review is outstanding.
    const reviewMarkdown = await readFile(path.join(ARTIFACT, 'inspection', 'commercial-review.md'), 'utf8');
    assert.match(reviewMarkdown, /awaiting controller review/);
  }],
  ['F19 recommended-next-step copy is grammatical, deterministic and assessment-specific (no artefact -- Whether concatenation)', () => {
    const auditScript = path.join(ROOT, 'scripts', 'checkpoint-f-pdf-audit.py');
    // 2/5. The exact malformed concatenation (and every phrase on the controller's minimum list) is
    //    caught if reintroduced; the corrected two-sentence form and ordinary "whether" usage in
    //    unrelated advisory prose are never falsely flagged.
    const output = execFileSync(PYTHON, [auditScript, '--self-test-customer-copy-grammar'], { cwd: ROOT, encoding: 'utf8' });
    assert.match(output, /self_test_customer_copy_grammar_defect: all fixtures passed/);

    // 2/7. All four real, rendered customer PDFs are clean under the actual audit check (already
    //    run as part of the real render above), and the internal-release-workflow audit (previous
    //    round) remains green alongside it -- no regression in either.
    for (const code of ['PDF_CUSTOMER_COPY_GRAMMAR_DEFECT', 'PDF_INTERNAL_RELEASE_WORKFLOW_COPY']) {
      const results = audit.checks.filter((x) => x.code === code);
      assert.equal(results.length, candidates.length, `${code} must run for every candidate`);
      assert.ok(results.every((x) => x.passed), `${code} must pass for every candidate`);
    }

    // 1. Extract each candidate's actual recommendation sentence pair and prove it is natural,
    //    assessment-specific prose -- no raw "Whether", no "--" concatenation, no mid-sentence
    //    doubled capitalisation ("The organisation"/"Management" is fine as the answer's own opening
    //    word, just not glued onto "Whether").
    const recommendationByName = {};
    for (const candidate of candidates) {
      // pypdf wraps extracted text at the PDF's rendered line breaks, which can fall mid-phrase
      // (e.g. "validation\npriority") -- normalise whitespace before matching, same as the
      // line-wrap-tolerant pattern already used for F14's "Not yet\s+requested".
      const normalised = text[candidate.name].replace(/\s+/g, ' ');
      const match = /Recommended next step\s+(.+?)\s+This is the immediate validation priority/.exec(normalised);
      assert.ok(match, `${candidate.name}: Recommended next step sentence pair must be present and extractable`);
      const recommendation = match[1].trim();
      recommendationByName[candidate.name] = recommendation;
      assert.doesNotMatch(recommendation, /--/, `${candidate.name}: no "--" concatenation`);
      assert.doesNotMatch(recommendation, /\bWhether\b/, `${candidate.name}: no raw "Whether ..." proof phrasing`);
      assert.doesNotMatch(recommendation, /operates? to the exact expected control standard/, `${candidate.name}: no raw provesWhat closing phrase`);
      assert.match(recommendation, /^Commission /, `${candidate.name}: must open with a natural action sentence`);
      assert.match(recommendation, /\. Confirm /, `${candidate.name}: must be exactly two sentences (action, then a Confirm... test)`);
    }

    // 3. Weak AI and fallback share the same deterministic advisory authority (Checkpoint E), so
    //    their recommendation must be identical, not independently varied text.
    assert.equal(
      recommendationByName['mk-essential-v7-materially-weak-ai'],
      recommendationByName['mk-essential-v7-materially-weak-fallback'],
      'weak AI and fallback recommendations must be identical'
    );

    // 4. Moderate and clean draw on different findings/evidence, so their recommendations must
    //    differ -- proves this is genuinely assessment-specific, not a fixed template string.
    assert.notEqual(
      recommendationByName['mk-essential-v7-moderate-ai'],
      recommendationByName['mk-essential-v7-clean-assurance-ai'],
      'moderate and clean recommendations must differ'
    );

    // 6. No page-count, near-empty, TOC/bookmark, clean-assurance or AI/fallback-authority
    //    regression -- these are the same checks F2/F5/F11/F12 and the TOC checks already assert
    //    against this same regenerated artifact; re-assert the aggregate here as a single guard tied
    //    specifically to this round's change.
    assert.equal(audit.passed, true, 'the full audit (page budgets, near-empty pages, TOC/bookmarks, clean-assurance semantics, AI/fallback authority) must remain green');
  }]
];

for (const [name, test] of tests) {
  await test();
  console.log(`  ok — ${name}`);
}
console.log(`Checkpoint F passed: ${tests.length}/${tests.length} tests; artifacts: ${ARTIFACT}`);
process.exit(0);
