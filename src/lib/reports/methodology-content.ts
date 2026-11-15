import bank from '@/lib/readiness-review/data/bank-v1.3.json' with { type: 'json' };
import coverage from '@/lib/readiness-review/data/coverage-map-v1.3.json' with { type: 'json' };
import { getDomainPlaybook, hasDomainPlaybook } from '@/lib/reports/evidence-model/domain-playbooks';
import { getQuestionPlaybook, type MethodologyRegistryIdentity } from '@/lib/reports/evidence-model/question-playbooks';
import type { MethodologyFamily } from '@/lib/scoring/methodology-dispatch';

/**
 * Methodology-scoped content registry.
 *
 * Report content is looked up through the methodology family of the run, so a code that exists in both methods (D3 is
 * "Operational fraud controls" in MFRS and "Ethics, integrity and anti-corruption" in bank 1.3) can never resolve to the
 * other method's content. MFRS lookups delegate unchanged to the existing playbooks with the same selector. Revised
 * lookups return only the bank's own content: the question and its options, the level descriptions, the records the
 * method says management should hold, the fraud risks it names, its module owner, its objectives and its scenario.
 * Nothing is invented; where the bank has no source, the field is null or empty. The report engines do not read this
 * registry yet; that switch belongs to the approved report rework.
 */
type BankQuestion = {
  id: string; key?: string; text: string; options?: [string, string][]; format?: string; type?: string; stage?: string; help?: string;
  levels?: string[]; evidence?: unknown; risks?: string[]; retired?: boolean;
};
type BankModule = { id: string; name: string; owner?: string; purpose?: string; questions: BankQuestion[] };
type BankDomain = { id: string; name: string; covers?: string; bank: { scopeNote?: string; risks?: Record<string, string>; modules: BankModule[] } };
type CoverageMap = {
  questionRole: Record<string, { scenario?: string; role?: string; objectives?: string[] }>;
  scenarios: { id: string; name: string; tier: number; how?: string; why?: string }[];
  objectives: { id: string; domain: string; name: string; purpose?: string }[];
  boundaries?: Record<string, string>;
};
const DOMAINS = (bank as unknown as { domains: BankDomain[] }).domains;
const COV = coverage as unknown as CoverageMap;
const QUESTIONS = new Map<string, { q: BankQuestion; m: BankModule; d: BankDomain }>();
DOMAINS.forEach((d) => d.bank.modules.forEach((m) => m.questions.forEach((q) => { if (!q.retired) QUESTIONS.set(q.id, { q, m, d }); })));
const SCENARIOS = new Map(COV.scenarios.map((s) => [s.id, s]));
const OBJECTIVES = new Map(COV.objectives.map((o) => [o.id, o]));

export type RevisedQuestionContent = {
  id: string; key: string | null; text: string; help: string | null; type: string | null; format: string | null; stage: string | null;
  options: { value: string; label: string }[];
  domain: { id: string; name: string }; module: { id: string; name: string; owner: string | null };
  levels: string[] | null; recordsManagementShouldHold: unknown;
  risks: { id: string; name: string | null }[];
  objectives: { id: string; name: string | null }[];
  role: string | null;
  scenario: { id: string; name: string; tier: number; how: string | null; why: string | null } | null;
};
export type RevisedDomainContent = { code: string; name: string; covers: string | null; scopeNote: string | null; boundary: string | null };

export type RevisedContentRegistry = {
  family: 'revised-review';
  question(id: string): RevisedQuestionContent | null;
  domain(code: string): RevisedDomainContent | null;
  questionIds(): string[];
};
export type MfrsContentRegistry = {
  family: 'mfrs-fixed' | 'mfrs-adaptive';
  question(code: string): ReturnType<typeof getQuestionPlaybook>;
  domain(code: string): ReturnType<typeof getDomainPlaybook> | null;
};

function revisedRegistry(): RevisedContentRegistry {
  return {
    family: 'revised-review',
    question(id) {
      const hit = QUESTIONS.get(id);
      if (!hit) return null;
      const role = COV.questionRole[id] ?? {};
      const s = role.scenario ? SCENARIOS.get(role.scenario) : undefined;
      const risks = hit.d.bank.risks ?? {};
      return {
        id, key: hit.q.key ?? null, text: hit.q.text, help: hit.q.help ?? null, type: hit.q.type ?? null, format: hit.q.format ?? null, stage: hit.q.stage ?? null,
        options: (hit.q.options ?? []).map(([value, label]) => ({ value, label })),
        domain: { id: hit.d.id, name: hit.d.name },
        module: { id: hit.m.id, name: hit.m.name, owner: hit.m.owner ?? null },
        levels: hit.q.levels ?? null,
        recordsManagementShouldHold: hit.q.evidence ?? null,
        risks: (hit.q.risks ?? []).map((r) => ({ id: r, name: risks[r] ?? null })),
        objectives: (role.objectives ?? []).map((o) => ({ id: o, name: OBJECTIVES.get(o)?.name ?? null })),
        role: role.role ?? null,
        scenario: s ? { id: s.id, name: s.name, tier: s.tier, how: s.how ?? null, why: s.why ?? null } : null
      };
    },
    domain(code) {
      const d = DOMAINS.find((x) => x.id === code);
      return d ? { code: d.id, name: d.name, covers: d.covers ?? null, scopeNote: d.bank.scopeNote ?? null, boundary: COV.boundaries?.[d.id] ?? null } : null;
    },
    questionIds() { return [...QUESTIONS.keys()]; }
  };
}

function mfrsRegistry(family: 'mfrs-fixed' | 'mfrs-adaptive', selector?: string | MethodologyRegistryIdentity | null, methodologyVersionCode?: string | null): MfrsContentRegistry {
  return {
    family,
    question(code) { return getQuestionPlaybook(code, selector ?? undefined, methodologyVersionCode ?? null); },
    domain(code) { return hasDomainPlaybook(code) ? getDomainPlaybook(code) : null; }
  };
}

export function contentRegistry(family: 'revised-review'): RevisedContentRegistry;
export function contentRegistry(family: 'mfrs-fixed' | 'mfrs-adaptive', selector?: string | MethodologyRegistryIdentity | null, methodologyVersionCode?: string | null): MfrsContentRegistry;
export function contentRegistry(family: MethodologyFamily, selector?: string | MethodologyRegistryIdentity | null, methodologyVersionCode?: string | null): RevisedContentRegistry | MfrsContentRegistry {
  return family === 'revised-review' ? revisedRegistry() : mfrsRegistry(family, selector, methodologyVersionCode);
}
