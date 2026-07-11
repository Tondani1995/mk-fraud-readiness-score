import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const root = process.cwd();
const seed = fs.readFileSync(path.join(root, 'supabase/migrations/0003_phase5_methodology_seed.sql'), 'utf8');
const fixtures = JSON.parse(fs.readFileSync(path.join(root, 'scripts/fixtures/phase7-free-snapshot-fixtures.json'), 'utf8'));

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function assert(condition, label) {
  if (!condition) throw new Error(label);
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, got ${actual}`);
}

function assertDeepEqual(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(label);
}

function loadActualScoringEngine() {
  const enginePath = path.join(root, 'src/lib/scoring/scoring-engine.ts');
  const source = fs.readFileSync(enginePath, 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: enginePath
  }).outputText;

  const module = { exports: {} };
  vm.runInNewContext(transpiled, {
    module,
    exports: module.exports,
    require: (id) => { throw new Error(`Unexpected import from scoring-engine.ts: ${id}`); },
    console
  }, { filename: 'scoring-engine.phase7.cjs' });

  assert(typeof module.exports.calculateFraudReadinessScore === 'function', 'Actual scoring engine export missing.');
  return module.exports.calculateFraudReadinessScore;
}

function parseDomains() {
  const domains = [];
  const domainRe = /\('(?<code>D\d+)',\s*'(?<name>[^']+)',\s*(?<weight>[0-9.]+),\s*'(?<type>[^']+)',\s*(?<isCore>true|false),\s*(?<sortOrder>\d+)\)/g;
  for (const match of seed.matchAll(domainRe)) {
    if (!/^D\d+$/.test(match.groups.code) || match.groups.code === 'D0') continue;
    domains.push({
      id: match.groups.code,
      domainCode: match.groups.code,
      name: match.groups.name,
      weightPct: Number(match.groups.weight),
      domainType: match.groups.type,
      isCore: match.groups.isCore === 'true',
      sortOrder: Number(match.groups.sortOrder),
      questions: []
    });
  }
  return domains.slice(0, 10);
}

function parseQuestions(domainsByCode) {
  const questionRe = /\('(?<domain>D\d+)',\s*'(?<code>D\d+-Q\d+)',\s*'(?<prompt>[^']*)',\s*'(?<help>[^']*)',\s*(?<weight>[0-9.]+),\s*(?<critical>true|false),\s*(?<hardGate>true|false),\s*(?<naAllowed>true|false),\s*(?<naRule>null|'[^']+'),\s*'(?<trigger>[^']+)',\s*(?<sortOrder>\d+)\)/g;
  for (const match of seed.matchAll(questionRe)) {
    const domain = domainsByCode.get(match.groups.domain);
    if (!domain) continue;
    domain.questions.push({
      id: match.groups.code,
      questionCode: match.groups.code,
      domainCode: match.groups.domain,
      domainName: domain.name,
      prompt: match.groups.prompt,
      helpText: match.groups.help || null,
      weight: Number(match.groups.weight),
      isCritical: match.groups.critical === 'true',
      isHardGate: match.groups.hardGate === 'true',
      nAAllowed: match.groups.naAllowed === 'true',
      nARuleKey: match.groups.naRule === 'null' ? null : match.groups.naRule.replaceAll("'", ''),
      triggerKey: match.groups.trigger,
      sortOrder: Number(match.groups.sortOrder)
    });
  }

  for (const domain of domainsByCode.values()) domain.questions.sort((a, b) => a.sortOrder - b.sortOrder);
}

function exposureAnswers(score) {
  return [{
    exposureFactorId: 'EXP-FIXTURE',
    factorCode: 'EXP-FIXTURE',
    selectedValue: 'fixture',
    selectedLabel: 'Fixture exposure score',
    pointsAwarded: score
  }];
}

function answersForFixture(questions, fixture) {
  return questions.map((question) => ({
    answerId: `answer-${fixture.id}-${question.questionCode}`,
    questionId: question.id,
    questionCode: question.questionCode,
    responseValue: fixture.overrides[question.questionCode] ?? fixture.defaultResponse,
    isNotApplicable: false,
    nAReason: null
  }));
}

function buildPersistedSnapshotRows(result, fixture) {
  return {
    assessment: {
      assessment_reference: `PH7-${fixture.id.toUpperCase()}`,
      current_score_run_id: `score-run-${fixture.id}`
    },
    organisation: { legal_name: `${fixture.label} Pty Ltd`, trading_name: null },
    respondent: { full_name: 'Phase 7 Fixture', email: 'phase7@example.test' },
    scoreRun: {
      id: `score-run-${fixture.id}`,
      run_number: 1,
      status: 'completed',
      overall_score: result.summary.overallScore,
      calculated_maturity: result.summary.calculatedMaturity,
      final_maturity: result.summary.finalMaturity,
      exposure_score: result.summary.exposureScore,
      exposure_band: result.summary.exposureBand,
      coverage_pct: result.summary.coveragePct,
      n_a_rate_pct: result.summary.nARatePct,
      critical_gap_count: result.summary.criticalGapCount,
      major_gap_count: result.summary.majorGapCount,
      cap_applied: result.summary.capApplied,
      cap_reason: result.summary.capReason,
      locked_at: '2026-07-08T00:00:00.000Z',
      created_at: '2026-07-08T00:00:00.000Z'
    },
    domainRows: result.domainResults.map((domain) => ({
      domain_id: domain.domainId,
      raw_score: domain.rawScore,
      weighted_contribution: domain.weightedContribution,
      coverage_pct: domain.coveragePct,
      critical_gap_count: domain.criticalGapCount
    }))
  };
}

function snapshotFromPersistedRows(rows, domains) {
  const domainById = new Map(domains.map((domain) => [domain.id, domain]));
  return {
    assessmentReference: rows.assessment.assessment_reference,
    organisationName: rows.organisation.legal_name,
    respondentName: rows.respondent.full_name,
    respondentEmail: rows.respondent.email,
    scoreRunId: rows.scoreRun.id,
    runNumber: rows.scoreRun.run_number,
    overallScore: Number(rows.scoreRun.overall_score),
    calculatedMaturity: rows.scoreRun.calculated_maturity,
    finalMaturity: rows.scoreRun.final_maturity,
    exposureScore: Number(rows.scoreRun.exposure_score),
    exposureBand: rows.scoreRun.exposure_band,
    coveragePct: Number(rows.scoreRun.coverage_pct),
    nARatePct: Number(rows.scoreRun.n_a_rate_pct),
    criticalGapCount: Number(rows.scoreRun.critical_gap_count),
    majorGapCount: Number(rows.scoreRun.major_gap_count),
    capApplied: Boolean(rows.scoreRun.cap_applied),
    capReason: rows.scoreRun.cap_reason,
    scoredAt: rows.scoreRun.locked_at,
    domains: rows.domainRows.map((row) => {
      const domain = domainById.get(row.domain_id);
      return {
        domainId: row.domain_id,
        domainCode: domain.domainCode,
        domainName: domain.name,
        weightPct: domain.weightPct,
        rawScore: row.raw_score === null ? null : Number(row.raw_score),
        weightedContribution: row.weighted_contribution === null ? null : Number(row.weighted_contribution),
        coveragePct: Number(row.coverage_pct),
        criticalGapCount: Number(row.critical_gap_count)
      };
    })
  };
}

const domains = parseDomains();
const domainsByCode = new Map(domains.map((domain) => [domain.domainCode, domain]));
parseQuestions(domainsByCode);
const questions = domains.flatMap((domain) => domain.questions);
const calculateFraudReadinessScore = loadActualScoringEngine();

assertEqual(fixtures.length, 3, 'Phase 7 fixture count');
assert(fixtures.some((fixture) => fixture.id === 'weak'), 'Missing weak fixture.');
assert(fixtures.some((fixture) => fixture.id === 'moderate'), 'Missing moderate fixture.');
assert(fixtures.some((fixture) => fixture.id === 'strong-with-critical-gap'), 'Missing strong-with-critical-gap fixture.');
assertEqual(domains.length, 10, 'Domain count');
assertEqual(questions.length, 68, 'Question count');

for (const fixture of fixtures) {
  const input = {
    domains,
    answers: answersForFixture(questions, fixture),
    exposureAnswers: exposureAnswers(fixture.exposureScore)
  };
  const first = calculateFraudReadinessScore(input);
  const second = calculateFraudReadinessScore(input);
  assertDeepEqual(second, first, `${fixture.id} repeated calculation must be identical.`);

  assertEqual(first.summary.overallScore, fixture.expected.overallScore, `${fixture.id} overall score`);
  assertEqual(first.summary.calculatedMaturity, fixture.expected.calculatedMaturity, `${fixture.id} calculated maturity`);
  assertEqual(first.summary.finalMaturity, fixture.expected.finalMaturity, `${fixture.id} final maturity`);
  assertEqual(first.summary.exposureBand, fixture.expected.exposureBand, `${fixture.id} exposure band`);
  assertEqual(first.summary.criticalGapCount, fixture.expected.criticalGapCount, `${fixture.id} critical gaps`);
  assertEqual(first.summary.majorGapCount, fixture.expected.majorGapCount, `${fixture.id} hard-gate gaps`);

  for (const capRule of fixture.expected.capRules ?? []) {
    assert(first.maturityCapEvents.some((event) => event.ruleCode === capRule), `${fixture.id} missing cap rule ${capRule}`);
  }

  const persistedRows = buildPersistedSnapshotRows(first, fixture);
  const snapshot = snapshotFromPersistedRows(persistedRows, domains);
  assertEqual(snapshot.overallScore, persistedRows.scoreRun.overall_score, `${fixture.id} snapshot overall reconciles to score_run`);
  assertEqual(snapshot.finalMaturity, persistedRows.scoreRun.final_maturity, `${fixture.id} snapshot maturity reconciles to score_run`);
  assertEqual(snapshot.exposureScore, persistedRows.scoreRun.exposure_score, `${fixture.id} snapshot exposure reconciles to score_run`);
  assertEqual(snapshot.domains.length, persistedRows.domainRows.length, `${fixture.id} snapshot domain count reconciles`);
  for (const domain of snapshot.domains) {
    const persistedDomain = persistedRows.domainRows.find((row) => row.domain_id === domain.domainId);
    assertEqual(domain.rawScore, persistedDomain.raw_score, `${fixture.id} ${domain.domainCode} domain score reconciles`);
    assertEqual(domain.coveragePct, persistedDomain.coverage_pct, `${fixture.id} ${domain.domainCode} coverage reconciles`);
    assertEqual(domain.criticalGapCount, persistedDomain.critical_gap_count, `${fixture.id} ${domain.domainCode} critical gaps reconcile`);
  }
}

const moderate = fixtures.find((fixture) => fixture.id === 'moderate');
const nAQuestion = questions.find((question) => question.questionCode === 'D2-Q05');
const nAAnswers = answersForFixture(questions, moderate).map((answer) => answer.questionCode === nAQuestion.questionCode
  ? { ...answer, responseValue: null, isNotApplicable: true, nAReason: 'No third-party exposure in fixture.' }
  : answer);
const nAResult = calculateFraudReadinessScore({ domains, answers: nAAnswers, exposureAnswers: exposureAnswers(75) });
const nATrace = nAResult.questionTraces.find((trace) => trace.questionCode === nAQuestion.questionCode);
assertEqual(nAResult.summary.overallScore, 60, 'N/A fixture must not inflate moderate score');
assertEqual(nATrace.applicable, false, 'N/A trace marked non-applicable');
assertEqual(nATrace.numeratorContribution, 0, 'N/A trace numerator contribution');
assertEqual(nATrace.denominatorContribution, 0, 'N/A trace denominator contribution');
assert(nAResult.summary.nARatePct > 0, 'N/A rate visible in score summary.');

const snapshotRoute = read('src/app/snapshot/[assessmentRef]/page.tsx');
assert(snapshotRoute.includes('validateSnapshotToken'), 'Snapshot route must validate snapshot token.');
assert(snapshotRoute.includes('loadFreeSnapshotByReference'), 'Snapshot route must load persisted free snapshot.');
assert(snapshotRoute.includes('consume: false'), 'Snapshot refresh must not consume token budget.');

const submitRoute = read('src/app/api/assessments/[assessmentRef]/submit/route.ts');
assert(submitRoute.includes('createSnapshotTokenForAssessment'), 'Submit route must create snapshot token.');
assert(submitRoute.includes('snapshotUrl'), 'Submit route must return snapshot URL.');
assert(submitRoute.includes('loadFreeSnapshotByReference'), 'Submit response must load persisted snapshot.');
assert(submitRoute.includes('/score'), 'Submit route must generate public snapshot links under the /score base path.');
assert(submitRoute.includes('publicScoreBaseUrlFor'), 'Submit route must use a public score base URL helper.');
assert(submitRoute.includes("requestHost.endsWith('.vercel.app')"), 'Preview snapshot links must preserve the current Vercel host instead of the configured production host.');
assert(submitRoute.includes('normaliseScoreBase(requestOrigin)'), 'Preview snapshot links must be derived from the request origin.');

const assessmentSave = read('src/lib/respondent/assessment-save.ts');
assert(assessmentSave.includes(".select('id')"), 'Submit lock update must prove a row was locked.');
assert(assessmentSave.includes('assessment_already_submitted_or_locked'), 'Repeated submit must return a stale-state conflict.');

const tokens = read('src/lib/respondent/tokens.ts');
assert(tokens.includes("getNumberEnv('ASSESSMENT_SNAPSHOT_TOKEN_MAX_USES', 100)"), 'Snapshot token max-use fallback must be 100.');

const envExample = read('.env.example');
assert(envExample.includes('ASSESSMENT_SNAPSHOT_TOKEN_MAX_USES=100'), 'Snapshot token max-use env var must be documented.');
assert(envExample.includes('fallback is 100'), 'Snapshot token max-use fallback must be documented.');

const engine = read('src/components/assessment/AssessmentEngine.tsx');
assert(engine.includes('const saved = await saveDraft'), 'Client submit must stop if final save fails.');
assert(engine.includes("submitState !== 'idle'"), 'Client submit must block repeated clicks.');
assert(engine.includes('snapshotUrl'), 'Client must surface durable snapshot URL.');

const snapshotComponent = read('src/components/assessment/FreeSnapshot.tsx');
assert(snapshotComponent.includes('Coverage and applicability'), 'Snapshot must display coverage and applicability effects.');
assert(snapshotComponent.includes('Priority-gap alert'), 'Snapshot must display priority-gap alerts using customer-facing language.');
assert(snapshotComponent.includes('30/60/90-day roadmap'), 'Paid-product comparison may mention the roadmap without exposing roadmap content.');
assert(!/AI-generated|peer benchmark/i.test(snapshotComponent), 'Free snapshot must not expose AI or benchmark content.');
assert(!/Week 1|Week 30|Day 30|Day 60|Day 90|remediation task|action owner/i.test(snapshotComponent), 'Free snapshot must not expose actual roadmap content.');

console.log('Phase 7 free snapshot tests passed. Fixtures, repeatability, persisted-result reconciliation, /score snapshot URL generation, preview host preservation, token route, stale submit safety and snapshot content boundary are covered.');
