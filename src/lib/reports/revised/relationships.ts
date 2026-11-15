import review from './relationship-review-v0.2.json' with { type: 'json' };
import { controlName, CLASS_SHORT } from './answer-text';

/**
 * FICTIONAL INTEGRATION PROTOTYPE. How a supporting practice relates to a confirmation the organisation reported fully
 * in place, for the same fraud scenario. Candidate rules for MK's review; not approved.
 *
 * Five relationships are distinguished, as MK directed on 12 November:
 *
 *   direct-contradiction    the two answers describe the same fact and cannot both be true as given
 *   necessary-dependency    the confirmed control consumes an input that the practice's answer shows does not exist;
 *                           recorded only with reviewed dependency semantics (what is consumed, and when it is absent)
 *   complementary-weakness  a further defence against the same scenario is weaker; the confirmation stands as reported
 *   untested-practice       the practice is in scope but has not yet been used because no case has arisen
 *   missing-information     the practice was declined, not known or is still waiting for an answer
 *
 * and one neutral status, which is not a sixth relationship:
 *
 *   not-established         the relationship is not established. Either the pair has not been reviewed (nothing is
 *                           concluded and nothing is asked), or review found that the answers leave it open, in which
 *                           case the review supplies the question management should answer.
 *
 * Corrections made on MK's direction of 12 November (second direction):
 *  - A practice answered "not applicable" is outside scope. It has no relationship with the confirmation and is never
 *    described as untested; only "no case has arisen" is an untested practice.
 *  - A routing condition (askWhen) or a preclusion decides when a question is asked. It is no longer read as evidence
 *    that the confirmed control needs the practice to operate. Necessary dependency requires reviewed semantics.
 *  - A pair that has not been reviewed is not-established, never assumed complementary or necessary.
 *  - Incomplete formal documentation is not treated as proof that a control cannot operate (relationship-review-0.2).
 */

export type RelationType = 'direct-contradiction' | 'necessary-dependency' | 'complementary-weakness' | 'untested-practice' | 'missing-information' | 'not-established';
/** answer: decided by the practice's own answer; reviewed-pair: by the review table; not-reviewed: no review exists;
 * semantics-not-met: reviewed, but the reviewed conditions do not hold for the answers actually given. */
export type RelationBasis = 'answer' | 'reviewed-pair' | 'not-reviewed' | 'semantics-not-met';
export type Relation = {
  confirmation: string; practice: string; type: RelationType; basis: RelationBasis;
  rationale: string;
  /** Customer wording for the pair. */
  statement: string;
  /** For a reviewed pair the answers leave open: the question management should answer. */
  question: string | null;
};
/** The five relationships of MK's direction. */
export const RELATIONSHIPS: RelationType[] = ['direct-contradiction', 'necessary-dependency', 'complementary-weakness', 'untested-practice', 'missing-information'];
export const RELATION_LABEL: Record<RelationType, string> = {
  'direct-contradiction': 'Answers that cannot both be right',
  'necessary-dependency': 'Control lacks an input it needs',
  'complementary-weakness': 'Further defence weaker; control stands',
  'untested-practice': 'No case has arisen yet',
  'missing-information': 'Information outstanding',
  'not-established': 'Relationship not established'
};
export const relationLabel = (r: Pick<Relation, 'type' | 'basis' | 'question'>) =>
  r.type !== 'not-established' ? RELATION_LABEL[r.type] : r.question ? 'Question to clarify' : 'Not reviewed: no conclusion';
/** Unresolved inconsistencies: the reported control cannot be treated as covering the scenario until they are settled. */
export const UNRESOLVED: RelationType[] = ['direct-contradiction', 'necessary-dependency'];

export type ReviewedPair = {
  scheme: string; confirmation: string; practice: string; type: RelationType; rationale: string;
  statement?: string; question?: string;
  /** Practice answer classes under which a reviewed contradiction or dependency holds. */
  holdsWhen?: string[];
  /** Practice option values the reviewed wording was written for (choice formats). */
  whenValue?: string[];
  /** Required for a necessary dependency: the input the confirmed control consumes. */
  dependency?: { consumes: string; absentWhen: string[] };
};
export type ReviewTable = { version: string; status: string; rule: string; reassessed?: string[]; pairs: ReviewedPair[] };
export const RELATION_REVIEW = review as unknown as ReviewTable;
const indexOf = (t: ReviewTable) => new Map(t.pairs.map((p) => [`${p.confirmation}>${p.practice}`, p]));
const DEFAULT_INDEX = indexOf(RELATION_REVIEW);

/** Problems that make a review table unusable: every claim of inability or conflict must carry its conditions. */
export function validateRelationReview(t: ReviewTable): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const p of t.pairs) {
    const k = `${p.confirmation}>${p.practice}`;
    if (seen.has(k)) out.push(`${k}: listed twice`);
    seen.add(k);
    if (!RELATIONSHIPS.includes(p.type) && p.type !== 'not-established') out.push(`${k}: unknown type ${p.type}`);
    if (p.type === 'untested-practice' || p.type === 'missing-information') out.push(`${k}: ${p.type} is decided by the answer, not by review`);
    if (p.type === 'necessary-dependency' && (!p.dependency?.consumes || !p.dependency.absentWhen?.length)) out.push(`${k}: necessary dependency without reviewed dependency semantics`);
    if (p.type === 'direct-contradiction' && (!p.statement || !p.holdsWhen?.length)) out.push(`${k}: direct contradiction without a statement and the answers under which it holds`);
    if (p.type === 'not-established' && !p.question) out.push(`${k}: a reviewed pair left open must state the question for management`);
    if (!p.rationale) out.push(`${k}: no rationale`);
  }
  return out;
}

type Answered = { id: string; class?: string | null; answer?: { value: unknown } | null; outstanding: boolean };
const lc = (s: string) => (s && !/^[A-Z]{2,}/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s);
const valueOf = (a: Answered) => (a.answer && !Array.isArray(a.answer.value) ? String(a.answer.value) : null);

/**
 * The relationship between a confirmation reported fully in place and a supporting practice of the same scenario, or
 * null where the practice is outside scope (answered "not applicable"), which has no relationship to report.
 */
export function classifyRelation(confirmation: Answered, practice: Answered, opts: { review?: ReviewTable } = {}): Relation | null {
  if (practice.class === 'na' && !practice.outstanding) return null;
  const index = opts.review ? indexOf(opts.review) : DEFAULT_INDEX;
  const cId = confirmation.id;
  const pId = practice.id;
  const cName = controlName(cId);
  const pName = controlName(pId);
  const state = lc(CLASS_SHORT[practice.class ?? ''] ?? 'reported weaker');
  const base = { confirmation: cId, practice: pId, question: null as string | null };
  if (practice.outstanding) {
    return { ...base, type: 'missing-information', basis: 'answer', rationale: 'The practice was declined, not known or is still waiting for an answer.',
      statement: `${pName} is still to be answered, so nothing is concluded about how it bears on ${lc(cName)}.` };
  }
  if (practice.class === 'noinstance') {
    return { ...base, type: 'untested-practice', basis: 'answer', rationale: 'The practice is in scope, and the organisation reports that no case has arisen, so it has not yet been used.',
      statement: `${pName} is in scope but has not yet been used because no case has arisen; it neither supports nor weakens ${lc(cName)}.` };
  }
  const notReviewed: Relation = { ...base, type: 'not-established', basis: 'not-reviewed',
    rationale: 'Not reviewed. No relationship is assumed: the pair is neither treated as a further defence nor as a dependency.',
    statement: `${pName} is ${state}. How it bears on ${lc(cName)} has not been reviewed, so this report draws no conclusion from the pair.` };
  const reviewed = index.get(`${cId}>${pId}`);
  if (!reviewed) return notReviewed;
  const fill = (s: string) => s.replace(/\{state\}/g, state);
  const value = valueOf(practice);
  const valueMismatch = reviewed.whenValue?.length && (!value || !reviewed.whenValue.includes(value));
  const classMismatch = (reviewed.type === 'direct-contradiction' && !reviewed.holdsWhen?.includes(practice.class ?? ''))
    || (reviewed.type === 'necessary-dependency' && (!reviewed.dependency || !reviewed.dependency.absentWhen.includes(practice.class ?? '')));
  if (valueMismatch || classMismatch) {
    return { ...notReviewed, basis: 'semantics-not-met',
      rationale: `Reviewed as ${reviewed.type.replace(/-/g, ' ')} for other answers. The reviewed conditions do not hold for the answer given (${state}), so no relationship is established.` };
  }
  if (reviewed.type === 'not-established') {
    return { ...base, type: 'not-established', basis: 'reviewed-pair', rationale: reviewed.rationale, question: reviewed.question ?? null,
      statement: reviewed.statement ? fill(reviewed.statement) : notReviewed.statement };
  }
  return { ...base, type: reviewed.type, basis: 'reviewed-pair', rationale: reviewed.rationale,
    statement: reviewed.statement ? fill(reviewed.statement) : `${pName} is ${state}. It is a further defence against the same scenario and does not change the answer given for ${lc(cName)}.` };
}
