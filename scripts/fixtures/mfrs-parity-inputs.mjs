// Fictional MFRS scoring inputs for methodology-version dispatch parity. Pure data built from the committed preview
// graph; no database, no customer records. Used to pin calculator outputs at commit 3f933ac (before dispatch existed)
// and to prove that the dispatched path returns byte-identical results.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { CALCULATED_VARIANTS } from '../../src/lib/visual-review/calculated-fixtures.ts';
import { buildAdaptiveVisualReviewState } from '../../src/lib/visual-review/fixtures.ts';

const graph = JSON.parse(readFileSync(new URL('../../docs/adaptive-assessment/adaptive-graph-v1-draft.json', import.meta.url), 'utf8'));

export function canonicalHash(value) {
  const canon = (v) => Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v;
  return createHash('sha256').update(JSON.stringify(canon(value))).digest('hex');
}

const fixedDomains = graph.domains.map((domain, index) => ({
  id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
  domainCode: domain.domainCode, name: domain.name, weightPct: domain.weightPct, domainType: 'control', isCore: index < 8, sortOrder: domain.sortOrder,
  questions: graph.questions.filter((q) => q.domainCode === domain.domainCode).map((q, qi) => ({
    id: `10000000-0000-4000-8000-${String(graph.questions.indexOf(q) + 1).padStart(12, '0')}`,
    questionCode: q.questionCode, domainCode: q.domainCode, domainName: domain.name, prompt: q.prompt, helpText: null,
    weight: q.weight, isCritical: q.isCritical, isHardGate: q.isHardGate, nAAllowed: qi === 1, nARuleKey: null, triggerKey: null, sortOrder: qi
  }))
}));
const allQuestions = fixedDomains.flatMap((d) => d.questions);
const answer = (q, value, extra = {}) => ({ questionId: q.id, questionCode: q.questionCode, responseValue: value, isNotApplicable: false, nAReason: null, ...extra });
const exposure = [
  { exposureFactorId: 'e1', factorCode: 'EXP-CASH', selectedValue: 'high', selectedLabel: 'High', pointsAwarded: 8 },
  { exposureFactorId: 'e2', factorCode: 'EXP-THIRD', selectedValue: 'medium', selectedLabel: 'Medium', pointsAwarded: 4 }
];

export const FIXED_CASES = {
  'all-three': { domains: fixedDomains, answers: allQuestions.map((q) => answer(q, 3)), exposureAnswers: [] },
  'all-five': { domains: fixedDomains, answers: allQuestions.map((q) => answer(q, 5)), exposureAnswers: exposure },
  'all-one': { domains: fixedDomains, answers: allQuestions.map((q) => answer(q, 1)), exposureAnswers: exposure },
  'mixed-by-domain': { domains: fixedDomains, answers: allQuestions.map((q, i) => answer(q, q.domainCode === 'D7' ? 1 : q.domainCode === 'D3' ? 2 : 4 - (i % 2))), exposureAnswers: exposure },
  'hard-gate-zero': { domains: fixedDomains, answers: allQuestions.map((q) => answer(q, q.isHardGate ? 0 : 4)), exposureAnswers: [] },
  'critical-low': { domains: fixedDomains, answers: allQuestions.map((q) => answer(q, q.isCritical ? 1 : 5)), exposureAnswers: exposure },
  'with-not-applicable': { domains: fixedDomains, answers: allQuestions.map((q) => q.nAAllowed ? answer(q, null, { isNotApplicable: true, nAReason: 'Fictional: not in scope' }) : answer(q, 3)), exposureAnswers: [] },
  'incomplete': { domains: fixedDomains, answers: allQuestions.slice(0, Math.floor(allQuestions.length / 2)).map((q) => answer(q, 3)), exposureAnswers: [] }
};

/** The five calculated visual-review variants, built exactly as src/lib/visual-review/calculated-fixtures.ts builds them. */
export function adaptiveCases() {
  const out = {};
  for (const variant of CALCULATED_VARIANTS) {
    const state = buildAdaptiveVisualReviewState('review');
    const g = state.graph;
    const methodology = {
      domains: g.domains.map((domain) => ({
        id: `review-${domain.domainCode}`, domainCode: domain.domainCode, name: domain.name, weightPct: domain.weightPct, domainType: 'control', isCore: Boolean(domain.isCore), sortOrder: domain.sortOrder,
        questions: g.questions.filter((q) => q.domainCode === domain.domainCode).map((q, index) => ({ id: q.questionId, questionCode: q.questionCode, domainCode: q.domainCode, domainName: domain.name, prompt: q.prompt, helpText: null, weight: q.weight, isCritical: q.isCritical, isHardGate: q.isHardGate, nAAllowed: false, nARuleKey: null, triggerKey: null, sortOrder: index }))
      })), responseScale: [], exposureFactors: []
    };
    const controlResponses = {};
    const active = state.path.activeNodes.filter((node) => node.kind !== 'gateway');
    active.forEach((node, index) => {
      const q = g.questions.find((x) => x.questionId === node.nodeId);
      if (variant === 'partial-coverage' && index >= active.length - 9) return;
      if (variant === 'visibility-limited' && index % 2 === 0) { controlResponses[node.nodeId] = { responseState: 'unknown', responseValue: null }; return; }
      const value = variant === 'strong-controls' ? 5 : variant === 'critical-controls' ? 1 : variant === 'mixed-controls' ? (q.domainCode === 'D7' ? 1 : q.domainCode === 'D3' ? 2 : 4) : 3;
      controlResponses[node.nodeId] = { responseState: 'maturity', responseValue: value };
    });
    out[variant] = { graph: g, methodology, gatewayAnswers: state.gatewayAnswers, controlResponses };
  }
  return out;
}

export const summaryOf = (r) => ({ status: r.summary.status ?? r.resultStatus, overallScore: r.summary.overallScore, finalMaturity: r.summary.finalMaturity, capEvents: (r.maturityCapEvents ?? []).length });
