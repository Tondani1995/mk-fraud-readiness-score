import fs from 'node:fs';
import path from 'node:path';

const projectRoot = process.cwd();
const seedPath = path.join(projectRoot, 'supabase/migrations/0003_phase5_methodology_seed.sql');
const seed = fs.readFileSync(seedPath, 'utf8');

function round(value, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function parseDomains() {
  const domains = [];
  const domainRe = /\('(?<code>D\d+)',\s*'(?<name>[^']+)',\s*(?<weight>[0-9.]+),\s*'(?<type>[^']+)',\s*(?<isCore>true|false),\s*(?<sortOrder>\d+)\)/g;
  for (const match of seed.matchAll(domainRe)) {
    domains.push({
      code: match.groups.code,
      name: match.groups.name,
      weightPct: Number(match.groups.weight),
      isCore: match.groups.isCore === 'true',
      sortOrder: Number(match.groups.sortOrder),
      questions: []
    });
  }
  return domains.filter((domain) => /^D\d+$/.test(domain.code) && domain.code !== 'D0').slice(0, 10);
}

function parseQuestions(domainsByCode) {
  const questionRe = /\('(?<domain>D\d+)',\s*'(?<code>D\d+-Q\d+)',\s*'[^']*',\s*'[^']*',\s*(?<weight>[0-9.]+),\s*(?<critical>true|false),\s*(?<hardGate>true|false),\s*(?<naAllowed>true|false),\s*(?<naRule>null|'[^']+'),\s*'(?<trigger>[^']+)',\s*(?<sortOrder>\d+)\)/g;
  for (const match of seed.matchAll(questionRe)) {
    const domain = domainsByCode.get(match.groups.domain);
    if (!domain) continue;
    domain.questions.push({
      code: match.groups.code,
      weight: Number(match.groups.weight),
      isCritical: match.groups.critical === 'true',
      isHardGate: match.groups.hardGate === 'true',
      sortOrder: Number(match.groups.sortOrder)
    });
  }

  for (const domain of domainsByCode.values()) {
    domain.questions.sort((a, b) => a.sortOrder - b.sortOrder);
  }
}

function maturityForScore(score) {
  if (score < 40) return 'Reactive';
  if (score < 60) return 'Developing';
  if (score < 80) return 'Structured';
  return 'Strategic';
}

const ranks = { Reactive: 0, Developing: 1, Structured: 2, Strategic: 3 };
function minMaturity(current, cap) {
  return ranks[cap] < ranks[current] ? cap : current;
}

function exposureBand(score) {
  if (score <= 25) return 'Low';
  if (score <= 50) return 'Moderate';
  if (score <= 75) return 'High';
  return 'Severe';
}

function calculateFixture(domains, responses, exposureScore) {
  let overall = 0;
  let totalDomainWeight = 0;
  let criticalGapCount = 0;
  let majorGapCount = 0;
  let anyHardGate2 = false;
  let anyHardGateMajor = false;
  let anyCoreBelow40 = false;
  let anyCoreBelow60 = false;

  const domainResults = [];

  for (const domain of domains) {
    let numerator = 0;
    let denominator = 0;
    let domainCritical = 0;

    for (const question of domain.questions) {
      const response = responses[question.code];
      if (!Number.isInteger(response)) throw new Error(`Missing response for ${question.code}`);
      const normalised = (response / 5) * 100;
      numerator += normalised * question.weight;
      denominator += question.weight;

      if (question.isCritical && response <= 2) {
        criticalGapCount += 1;
        domainCritical += 1;
      }
      if (question.isHardGate && response <= 1) {
        majorGapCount += 1;
        anyHardGateMajor = true;
      }
      if (question.isHardGate && response === 2) {
        anyHardGate2 = true;
      }
    }

    const rawScore = round(numerator / denominator, 2);
    if (domain.isCore && rawScore < 40) anyCoreBelow40 = true;
    if (domain.isCore && rawScore < 60) anyCoreBelow60 = true;
    overall += rawScore * domain.weightPct;
    totalDomainWeight += domain.weightPct;
    domainResults.push({ code: domain.code, rawScore, criticalGapCount: domainCritical });
  }

  const overallScore = round(overall / totalDomainWeight, 2);
  const calculatedMaturity = maturityForScore(overallScore);
  let finalMaturity = calculatedMaturity;
  const capEvents = [];

  if (anyHardGateMajor) {
    finalMaturity = minMaturity(finalMaturity, 'Developing');
    capEvents.push('any_hard_gate_critical_control_lte_1');
  }
  if (anyHardGate2) {
    finalMaturity = minMaturity(finalMaturity, 'Structured');
    capEvents.push('any_hard_gate_critical_control_eq_2');
  }
  if (criticalGapCount >= 3) {
    finalMaturity = minMaturity(finalMaturity, 'Developing');
    capEvents.push('three_or_more_critical_controls_lte_2');
  }
  if (anyCoreBelow40) {
    finalMaturity = minMaturity(finalMaturity, 'Developing');
    capEvents.push('any_core_domain_below_40');
  }
  if (anyCoreBelow60) {
    finalMaturity = minMaturity(finalMaturity, 'Structured');
    capEvents.push('any_core_domain_below_60');
  }

  return {
    overallScore,
    calculatedMaturity,
    finalMaturity,
    exposureScore,
    exposureBand: exposureBand(exposureScore),
    coveragePct: 100,
    nARatePct: 0,
    criticalGapCount,
    majorGapCount,
    capEvents,
    domainResults
  };
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

const domains = parseDomains();
const domainsByCode = new Map(domains.map((domain) => [domain.code, domain]));
parseQuestions(domainsByCode);

const allQuestions = domains.flatMap((domain) => domain.questions);
assertEqual(domains.length, 10, 'Domain count');
assertEqual(allQuestions.length, 68, 'Question count');
assertEqual(allQuestions.filter((q) => q.isCritical).length, 19, 'Critical-control count');
assertEqual(allQuestions.filter((q) => q.isHardGate).length, 17, 'Hard-gate count');

function allResponses(value) {
  return Object.fromEntries(allQuestions.map((question) => [question.code, value]));
}

const ts01 = calculateFixture(domains, allResponses(1), 100);
assertEqual(ts01.overallScore, 20, 'TS-01 overall score');
assertEqual(ts01.calculatedMaturity, 'Reactive', 'TS-01 calculated maturity');
assertEqual(ts01.finalMaturity, 'Reactive', 'TS-01 final maturity');
assertEqual(ts01.exposureBand, 'Severe', 'TS-01 exposure band');
assertEqual(ts01.criticalGapCount, 19, 'TS-01 critical gaps');
assertEqual(ts01.majorGapCount, 17, 'TS-01 major gaps');

const ts02 = calculateFixture(domains, allResponses(3), 75);
assertEqual(ts02.overallScore, 60, 'TS-02 overall score');
assertEqual(ts02.calculatedMaturity, 'Structured', 'TS-02 calculated maturity');
assertEqual(ts02.finalMaturity, 'Structured', 'TS-02 final maturity');
assertEqual(ts02.exposureBand, 'High', 'TS-02 exposure band');
assertEqual(ts02.criticalGapCount, 0, 'TS-02 critical gaps');
assertEqual(ts02.majorGapCount, 0, 'TS-02 major gaps');

const ts03Responses = allResponses(4);
// This fixture remains faithful to the Phase 1 scenario: most answers are 4, selected strong areas are 5,
// but D5 incident-response hard gates fail. The exact integer-response pattern reconciles to 82.00 when rounded.
['D1-Q01','D1-Q02','D1-Q03','D1-Q04','D2-Q01','D2-Q02','D3-Q02','D4-Q02','D4-Q06'].forEach((code) => {
  ts03Responses[code] = 5;
});
ts03Responses['D5-Q01'] = 1;
ts03Responses['D5-Q05'] = 2;
const ts03 = calculateFixture(domains, ts03Responses, 75);
assertEqual(ts03.overallScore, 82.00, 'TS-03 overall score');
assertEqual(ts03.calculatedMaturity, 'Strategic', 'TS-03 calculated maturity');
assertEqual(ts03.finalMaturity, 'Developing', 'TS-03 final maturity cap');
assertEqual(ts03.exposureBand, 'High', 'TS-03 exposure band');
assertEqual(ts03.criticalGapCount, 2, 'TS-03 critical gaps');
assertEqual(ts03.majorGapCount, 1, 'TS-03 major gaps');
if (!ts03.capEvents.includes('any_hard_gate_critical_control_lte_1')) throw new Error('TS-03 missing hard-gate <=1 cap event');
if (!ts03.capEvents.includes('any_hard_gate_critical_control_eq_2')) throw new Error('TS-03 missing hard-gate =2 cap event');

console.log('Phase 6 scenario tests passed. TS-01, TS-02 and TS-03 reconcile exactly against V1 methodology seed.');
