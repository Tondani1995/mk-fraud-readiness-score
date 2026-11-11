import type { Kind } from './document';

/** Helpers shared by the report builders and the validation checks. */

const WAITING = ['waiting', 'waiting-scope'];
const NOT_YET_KNOWN = ['unconfirmed', 'scope-unconfirmed', 'prerequisite'];

/** The states about which nothing is concluded: unresolved, not yet known, excluded. */
export const UNKNOWN_STATES = ['waiting', 'waiting-scope', 'unconfirmed', 'scope-unconfirmed', 'prerequisite', 'outofscope', 'proportion', 'precluded', 'assumed', 'retired'];

export const SOURCE_LABEL: Record<string, string> = {
  'respondent-answer': 'answer',
  'respondent-correction': 'correction',
  'owner-answer': 'answer by an accountable function',
  'activities-screen': 'activities screen'
};
export const SOURCE_NOT_RECORDED = 'how it was given is not recorded';

export function kindOfControl(control: { state: string; issue: boolean }): Kind {
  if (control.state === 'reported') return control.issue ? 'indicated-gap' : 'reported-practice';
  if (control.state === 'fact') return 'recorded-fact';
  if (control.state === 'reused') return 'reported-practice';
  if (WAITING.includes(control.state)) return 'unresolved';
  if (NOT_YET_KNOWN.includes(control.state)) return 'coverage';
  return 'outside-scope';
}

/**
 * Reads a dotted field from a claim value; null reads the whole value. A segment ending in [] reads a list, and the
 * rest of the field is read from each item; the results are joined with "; ".
 */
export function fieldOf(value: any, field: string | null): any {
  if (field === null) return value;
  const list = field.indexOf('[]');
  if (list >= 0) {
    const items = fieldOf(value, field.slice(0, list));
    if (!Array.isArray(items)) return undefined;
    const rest = field.slice(list + 2).replace(/^\./, '');
    return items.map((item) => fieldOf(item, rest || null)).join('; ');
  }
  return field.split('.').reduce((v: any, k) => (v === null || v === undefined ? undefined : v[k]), value);
}
