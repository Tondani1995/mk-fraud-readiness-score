import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const root = process.cwd();
const seedPath = path.join(root, 'supabase/migrations/0003_phase5_methodology_seed.sql');
const enginePath = path.join(root, 'src/lib/scoring/scoring-engine.ts');
const seed = fs.readFileSync(seedPath, 'utf8');
const engineSource = fs.readFileSync(enginePath, 'utf8');

function loadActualScoringEngine() {
  const transpiled = ts.transpileModule(engineSource, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true
    },
    fileName: enginePath
  }).outputText;

  const module = { exports: {} };
  const sandbox = {
    module,
    exports: module.exports,
    require: (id) => {
      throw new Error(`Unexpected runtime import from scoring-engine.ts: ${id}`);
    },
    console
  };
  vm.runInNewContext(transpiled, sandbox, { filename: 'scoring-engine.transpiled.cjs' });
  if (typeof module.exports.calculateFraudReadinessScore !== 'function') {
    throw new Error('Could not load calculateFraudReadinessScore from actual scoring-engine.ts');
  }
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

  for (const domain of domainsByCode.values()) {
    domain.questions.sort((a, b) => a.sortOrder - b.sortOrder);
  }
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

function assertDeepEqual(actual, expected, label) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${label}: repeated engine run was not deterministic.`);
  }
}

function allAnswers(questions, value) {
  return questions.map((question) => ({
    answerId: `answer-${question.questionCode}`,
    questionId: question.id,
    questionCode: question.questionCode,
    responseValue: value,
    isNotApplicable: false,
    nAReason: null
  }));
}

function exposureAnswers(score) {
  return [{
    exposureFactorId: 'EXP-TEST',
    factorCode: 'EXP-TEST',
    selectedValue: 'fixture',
    selectedLabel: 'Fixture exposure score',
    pointsAwarded: score
  }];
}

const calculateFraudReadinessScore = loadActualScoringEngine();
const domains = parseDomains();
const domainsByCode = new Map(domains.map((domain) => [domain.domainCode, domain]));
parseQuestions(domainsByCode);
const questions = domains.flatMap((domain) => domain.questions);

assertEqual(domains.length, 10, 'Domain count');
assertEqual(questions.length, 68, 'Question count');
assertEqual(questions.filter((q) => q.isCritical).length, 19, 'Critical-control count');
assertEqual(questions.filter((q) => q.isHardGate).length, 17, 'Hard-gate count');

function runAndAssertRepeatable(label, input) {
  const first = calculateFraudReadinessScore(input);
  const second = calculateFraudReadinessScore(input);
  assertDeepEqual(second, first, `${label} repeatability`);
  assertEqual(first.domainResults.length, 10, `${label} domain trace count`);
  assertEqual(first.questionTraces.length, 68, `${label} question trace count`);
  return first;
}

const ts01 = runAndAssertRepeatable('TS-01', {
  domains,
  answers: allAnswers(questions, 1),
  exposureAnswers: exposureAnswers(100)
});
assertEqual(ts01.summary.overallScore, 20, 'TS-01 overall score');
assertEqual(ts01.summary.calculatedMaturity, 'Reactive', 'TS-01 calculated maturity');
assertEqual(ts01.summary.finalMaturity, 'Reactive', 'TS-01 final maturity');
assertEqual(ts01.summary.exposureBand, 'Severe', 'TS-01 exposure band');
assertEqual(ts01.summary.criticalGapCount, 19, 'TS-01 critical gaps');
assertEqual(ts01.summary.majorGapCount, 17, 'TS-01 major gaps');

const ts02 = runAndAssertRepeatable('TS-02', {
  domains,
  answers: allAnswers(questions, 3),
  exposureAnswers: exposureAnswers(75)
});
assertEqual(ts02.summary.overallScore, 60, 'TS-02 overall score');
assertEqual(ts02.summary.calculatedMaturity, 'Structured', 'TS-02 calculated maturity');
assertEqual(ts02.summary.finalMaturity, 'Structured', 'TS-02 final maturity');
assertEqual(ts02.summary.exposureBand, 'High', 'TS-02 exposure band');
assertEqual(ts02.summary.criticalGapCount, 0, 'TS-02 critical gaps');
assertEqual(ts02.summary.majorGapCount, 0, 'TS-02 major gaps');

const ts03Answers = allAnswers(questions, 4);
const answerByCode = new Map(ts03Answers.map((answer) => [answer.questionCode, answer]));
['D1-Q01','D1-Q02','D1-Q03','D1-Q04','D2-Q01','D2-Q02','D3-Q02','D4-Q02','D4-Q06'].forEach((code) => {
  answerByCode.get(code).responseValue = 5;
});
answerByCode.get('D5-Q01').responseValue = 1;
answerByCode.get('D5-Q05').responseValue = 2;
const ts03 = runAndAssertRepeatable('TS-03', {
  domains,
  answers: ts03Answers,
  exposureAnswers: exposureAnswers(75)
});
assertEqual(ts03.summary.overallScore, 82.00, 'TS-03 overall score');
assertEqual(ts03.summary.calculatedMaturity, 'Strategic', 'TS-03 calculated maturity');
assertEqual(ts03.summary.finalMaturity, 'Developing', 'TS-03 final maturity');
assertEqual(ts03.summary.exposureBand, 'High', 'TS-03 exposure band');
assertEqual(ts03.summary.criticalGapCount, 2, 'TS-03 critical gaps');
assertEqual(ts03.summary.majorGapCount, 1, 'TS-03 major gaps');
if (!ts03.maturityCapEvents.some((event) => event.ruleCode === 'any_hard_gate_critical_control_lte_1')) {
  throw new Error('TS-03 missing hard-gate <=1 maturity cap event from actual engine.');
}
if (!ts03.maturityCapEvents.some((event) => event.ruleCode === 'any_hard_gate_critical_control_eq_2')) {
  throw new Error('TS-03 missing hard-gate =2 maturity cap event from actual engine.');
}

const incomplete = calculateFraudReadinessScore({
  domains,
  answers: allAnswers(questions.slice(0, 50), 3),
  exposureAnswers: exposureAnswers(50)
});
assertEqual(incomplete.summary.status, 'incomplete', 'Incomplete assessment status');
assertEqual(incomplete.summary.overallScore, null, 'Incomplete assessment score blocked');

console.log('Phase 6 v1.1 direct engine tests passed. Actual calculateFraudReadinessScore reconciles TS-01, TS-02, TS-03, repeatability and incomplete-coverage blocking.');
