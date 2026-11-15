import bank from '@/lib/readiness-review/data/bank-v1.3.json' with { type: 'json' };

/**
 * FICTIONAL INTEGRATION PROTOTYPE. How an answer, and the method's standard for a control, are put into words, for
 * every response format the draft method uses. One place, so that no report surface composes its own wording.
 *
 *   anchored        six described levels (0 to 5); level 4 is the method's in-place standard, level 5 its improving level
 *   practice        in place / partly / set out but not working / not in place; the in-place answer is the standard
 *   choicePractice  named options, each mapped by the method to a practice class; the options mapped to "in place" are
 *                   the standard, stated in the option's own words
 *   multi           several checks selected from a list; each check is its own sub-practice
 *   choice          applicability questions; never a control, so never given a standard
 *
 * The rule the previous prototype broke: a standard for a non-anchored question was written as "the answer to
 * '<question>' is yes", which is wrong for a choice question ("How is stock recorded? ... yes") and mechanical for a
 * practice question. Where the method has no wording for a standard beyond its in-place answer, that is reported as a
 * method content gap (`contentGaps`), not filled with invented professional judgement.
 */

type BankQuestion = {
  id: string; key: string; text: string; format: string; type: string; stage: string;
  options: [string, string][]; levels?: string[]; levelClass?: Record<string, string>; practiceMap?: Record<string, string>;
  subPractices?: Record<string, string>; evidence?: string;
};
type Shape = { domains: { id: string; name: string; bank: { modules: { id: string; name: string; owner?: string; questions: BankQuestion[] }[] } }[] };
const QUESTIONS = new Map<string, BankQuestion & { moduleOwner: string | null; area: string }>();
for (const d of (bank as unknown as Shape).domains) for (const m of d.bank.modules) for (const q of m.questions) QUESTIONS.set(q.id, { ...q, moduleOwner: m.owner ?? null, area: d.id });

export type AnswerLike = { id: string; format?: string | null; class?: string | null; answer?: { value: unknown; label?: string | null } | null };

export const bankQuestion = (id: string) => QUESTIONS.get(id) ?? null;
export const allBankQuestionIds = () => [...QUESTIONS.keys()];

const CLASS_PHRASE: Record<string, string> = {
  full: 'reported in place across everything it should cover',
  partial: 'reported in place only in some areas, cases or periods',
  designed: 'reported as set out or agreed but not yet working in practice',
  absent: 'reported as not in place',
  noinstance: 'not yet used: the organisation reports that no case has arisen',
  na: 'reported as not applicable'
};
/** A short state for tables, in the same terms. */
export const CLASS_SHORT: Record<string, string> = { full: 'In place', partial: 'Partly in place', designed: 'Set out, not yet operating', absent: 'Not in place', noinstance: 'No case yet', na: 'Not applicable' };

const lcFirst = (s: string) => (s && !/^[A-Z]{2,}|^I\b/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s);
const sentence = (s: string) => { const t = String(s ?? '').trim(); return t ? (/[.!?]$/.test(t) ? t : `${t}.`) : ''; };
const joinOr = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} or ${xs.at(-1)}`);
const joinAnd = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);
/** Option labels are written for the respondent ("Our own team"); reports speak about the organisation. */
const FIRST_PERSON: [RegExp, string][] = [
  [/\bWe do not have\b/g, 'The organisation does not have'], [/\bWe have no\b/g, 'The organisation has no'], [/\bWe would\b/g, 'The organisation would'],
  [/\bWe release\b/g, 'The organisation releases'], [/\bwe send\b/g, 'the organisation sends'], [/\binvoices us\b/g, 'invoices the organisation'],
  [/\bOur own\b/g, "The organisation's own"], [/\bour own\b/g, "the organisation's own"], [/\bOur\b/g, "The organisation's"], [/\bour\b/g, "the organisation's"]
];
function thirdPerson(label: string): string {
  return FIRST_PERSON.reduce((s, [re, to]) => s.replace(re, to), label);
}
/** An option label as a clause: "Yes, in a dedicated fraud risk assessment" reads "in a dedicated fraud risk assessment". */
function optionClause(label: string): string {
  // Bare yes, partly and no options read as the practice they answer for.
  const bare: Record<string, string> = { yes: 'in place', partly: 'partly in place', no: 'not in place' };
  const b = bare[label.trim().toLowerCase()];
  if (b) return b;
  return lcFirst(thirdPerson(label).replace(/^Yes,\s*/i, '').replace(/\.$/, ''));
}
const isRealOption = (v: string) => !['unknown', 'none', 'na', 'noinstance'].includes(v);

/** The control's name: the method's own short key. */
export const controlName = (id: string) => QUESTIONS.get(id)?.key ?? id;

/** What the organisation reported, in the method's own words where it has them. */
export function reportedText(c: AnswerLike): string {
  const q = QUESTIONS.get(c.id);
  if (!q) return `${c.id}: ${CLASS_PHRASE[c.class ?? ''] ?? 'not answered'}.`;
  const v = c.answer?.value;
  if (v === undefined || v === null) return `${q.key}: not answered.`;
  if (v === 'unknown') return `${q.key}: not known by the person asked.`;
  switch (q.format) {
    case 'anchored': {
      const n = Number(v);
      return Number.isInteger(n) && q.levels?.[n] ? sentence(q.levels[n]) : `${q.key}: ${CLASS_PHRASE[c.class ?? ''] ?? 'answered'}.`;
    }
    case 'choicePractice':
    case 'choice': {
      const label = q.options.find(([o]) => o === v)?.[1];
      return label ? `${q.key}: ${optionClause(label)}.` : `${q.key}: ${CLASS_PHRASE[c.class ?? ''] ?? 'answered'}.`;
    }
    case 'multi': {
      const chosen = (Array.isArray(v) ? v : [v]).map(String);
      const real = q.options.filter(([o]) => isRealOption(o));
      const yes = real.filter(([o]) => chosen.includes(o)).map(([, l]) => optionClause(l));
      const no = real.filter(([o]) => !chosen.includes(o)).map(([, l]) => optionClause(l));
      if (!yes.length) return `${q.key}: none of the checks the method lists.`;
      return `${q.key}: ${joinAnd(yes)}${no.length ? `; not ${joinAnd(no)}` : ''}.`;
    }
    default:
      return `${q.key}: ${CLASS_PHRASE[c.class ?? ''] ?? 'answered'}.`;
  }
}

/** The method's in-place standard for the control. Null for applicability questions, which are not controls. */
export function standardText(id: string): string | null {
  const q = QUESTIONS.get(id);
  // Only practice questions are controls; applicability, context and event questions describe the organisation.
  if (!q || q.type !== 'practice') return null;
  switch (q.format) {
    case 'anchored': return q.levels?.[4] ? sentence(q.levels[4]) : `${q.key}: in place across everything it should cover.`;
    case 'choicePractice': {
      const full = q.options.filter(([o]) => q.practiceMap?.[o] === 'full').map(([, l]) => optionClause(l));
      return full.length ? `${q.key}: ${joinOr(full)}.` : `${q.key}: in place across everything it should cover.`;
    }
    case 'multi': {
      const all = q.options.filter(([o]) => isRealOption(o)).map(([, l]) => optionClause(l));
      return `${q.key}: ${joinAnd(all)}.`;
    }
    default: return `${q.key}: in place across everything it should cover.`;
  }
}

/** The improving level the method describes beyond the standard (anchored level 5), if any. */
export function improvingText(id: string): string | null {
  const q = QUESTIONS.get(id);
  return q?.format === 'anchored' && q.levels?.[5] ? sentence(q.levels[5]) : null;
}

/** The records the method says management should keep for this control, if it names any. */
export function recordsText(id: string): string | null {
  const e = QUESTIONS.get(id)?.evidence;
  return e ? sentence(e) : null;
}

/** Whether the standard states when or how often the control operates. */
const CYCLE = /\b(every|each|daily|weekly|monthly|quarterly|annual|annually|each year|before|whenever|at least)\b/i;

export type ContentGap = 'no-level-descriptions' | 'no-records-named' | 'no-operating-cycle' | 'no-improving-level';
export const CONTENT_GAP_TEXT: Record<ContentGap, string> = {
  'no-level-descriptions': 'The method describes this control only by its in-place answer; it has no level descriptions of what partial or full operation looks like.',
  'no-records-named': 'The method names no records management should keep for this control.',
  'no-operating-cycle': 'The method does not say when or how often this control operates.',
  'no-improving-level': 'The method describes no level beyond in place for this control.'
};
/** Where the method is not specific enough to support a recommendation for this control. */
export function contentGaps(id: string): ContentGap[] {
  const q = QUESTIONS.get(id);
  if (!q || q.type !== 'practice') return [];
  const gaps: ContentGap[] = [];
  if (q.format !== 'anchored') gaps.push('no-level-descriptions');
  if (!q.evidence) gaps.push('no-records-named');
  const std = standardText(id) ?? '';
  if (!CYCLE.test(`${std} ${q.text}`)) gaps.push('no-operating-cycle');
  if (q.format === 'anchored' && !q.levels?.[5]) gaps.push('no-improving-level');
  return gaps;
}

/** The method's owner for the control's module, verbatim. */
export const methodOwner = (id: string) => QUESTIONS.get(id)?.moduleOwner ?? null;
