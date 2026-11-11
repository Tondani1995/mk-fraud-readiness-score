import type { EvidenceLevel, Kind } from './document';

/** Helpers shared by the draft builder and the validation checks. */

const WAITING = ['waiting', 'waiting-scope'];

/** The states about which nothing is concluded: unresolved, not covered, excluded. */
export const UNKNOWN_STATES = ['waiting', 'waiting-scope', 'unconfirmed', 'scope-unconfirmed', 'prerequisite', 'outofscope', 'proportion', 'precluded', 'assumed', 'retired'];

export const SOURCE_LABEL: Record<string, string> = {
  'respondent-answer': 'answer',
  'respondent-correction': 'correction',
  'owner-answer': 'answer by an accountable function',
  'activities-screen': 'activities screen'
};
export const SOURCE_NOT_RECORDED = 'how it was given is not recorded';

export function kindOfControl(control: { state: string; issue: boolean }): Kind {
  if (control.state === 'reported') return control.issue ? 'reported-exposure' : 'reported-practice';
  if (control.state === 'fact') return 'recorded-fact';
  if (control.state === 'reused') return 'reported-practice';
  if (WAITING.includes(control.state)) return 'unresolved';
  return 'outside-scope';
}

/** Reads a dotted field from a claim value; null reads the whole value. */
export function fieldOf(value: any, field: string | null) {
  if (field === null) return value;
  return field.split('.').reduce((v: any, k) => (v === null || v === undefined ? undefined : v[k]), value);
}

/** The template that words an evidence record of the given level and outcome. */
export function evidenceTemplate(prefix: 'evidence' | 'analysis.exposure', level: EvidenceLevel, outcome: string | null) {
  if (level === 'reviewed' || level === 'requested') return `${prefix}.${outcome}`;
  if (level === 'recorded') return `${prefix}.supplied`;
  if (level === 'said-to-exist') return `${prefix}.said-to-exist`;
  return `${prefix}.none-recorded`;
}
