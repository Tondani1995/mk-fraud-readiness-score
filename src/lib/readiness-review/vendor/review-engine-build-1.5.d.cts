// Type surface for the vendored readiness review engine (build 1.5). The engine itself is plain JavaScript, kept
// byte-identical to the reviewed build so that its hash can be checked; these declarations describe only what the
// adapter uses. Question, row and report objects stay loosely typed here and are narrowed by the adapter.

export type EngineQuestion = {
  id: string;
  key?: string;
  text: string;
  help?: string;
  type: 'context' | 'applicability' | 'practice' | 'event';
  format?: 'practice' | 'anchored' | 'choicePractice' | 'choice' | 'multi';
  options: [string, string][];
  levels?: string[];
  naLabel?: string;
  practiceMap?: Record<string, string>;
  subPractices?: Record<string, string>;
  facts?: string[];
  [key: string]: unknown;
};

export type EngineStep = {
  q: EngineQuestion;
  kind: string;
  domain: string | null;
  domainName: string;
  reason?: string;
  scenario?: string | null;
  tier?: number;
  owner?: string;
  suggested?: string;
};

export type EngineInstance = {
  S: any;
  QI: Record<string, EngineQuestion>;
  MOD: Record<string, { id: string; name: string; purpose?: string; owner?: string }>;
  DOM: Record<string, string>;
  DOMS: string[];
  DNAME: Record<string, string>;
  FUNCTIONS: string[];
  EV_STATES: string[];
  CONCLUSIONS: string[];
  next(options?: { respondentOnly?: boolean }): EngineStep | null;
  answer(q: EngineQuestion, value: unknown, kind?: string, extra?: Record<string, unknown>): void;
  correct(qid: string, value: unknown, extra?: Record<string, unknown>): void;
  stop(): void;
  resume(): void;
  assignDomain(domain: string, owner: string): void;
  ownerReturn(qid: string, value: unknown, extra?: Record<string, unknown>): void;
  nextOwner(fn: string): EngineStep | null;
  planFollowUp(meta?: { by?: string }): string[];
  setEvidence(qid: string, state: string, meta: { by: string; basis?: string }): void;
  setReview(qid: string, conclusion: string | null, meta: { by: string; basis?: string; followUp?: string; limitation?: string }): void;
  normalise(q: EngineQuestion, value: unknown): unknown;
  classOf(q: EngineQuestion, value: unknown): string | null;
  functionOf(label: string): string;
  scope(q: EngineQuestion): { st: string; by?: string; basis?: string };
  cond(c: unknown): { st: unknown };
  rowFor(q: EngineQuestion): any;
  labelOf(q: EngineQuestion, value: unknown): string;
  respondentScreens(): number;
  report(): any;
};

declare const REVIEW: {
  create(bank: unknown, coverage: unknown, options?: { ceiling?: number; followups?: number; now?: () => string }): EngineInstance;
  CLASSES: string[];
  ISSUE: string[];
};

export default REVIEW;
