import review from './relationship-review-v0.1.json' with { type: 'json' };
import { bankQuestion, controlName, CLASS_SHORT } from './answer-text';

/**
 * FICTIONAL INTEGRATION PROTOTYPE. How a supporting practice relates to a confirmation the organisation reported fully
 * in place, for the same fraud scheme.
 *
 * MK's direction of 12 November: the previous prototype treated a confirmation as "false comfort" whenever any
 * related practice of its scheme was reported as a gap. That is too broad. A practice reported weaker only shows that
 * the confirmation is wrong or cannot work when the two answers concern the same fact, or when the method establishes
 * that the confirmed control needs the practice to operate. Five relationships are distinguished:
 *
 *   direct-contradiction    the two answers describe the same fact and cannot both be true as given
 *   necessary-dependency    the confirmed control uses the practice's output, as the method's wording or structure
 *                           establishes; with the practice weaker, the control cannot operate as fully as reported
 *   complementary-weakness  a further defence against the same scheme is weaker; the confirmation stands as reported
 *   untested-practice       the practice has not yet been used because no case has arisen; nothing is concluded
 *   missing-information     the practice was declined, not known or is still waiting for an answer
 *
 * Sources of a classification, in order: missing information and untested practices are decided by the answer itself;
 * then the reviewed pair table (`relationship-review-v0.1.json`, rationale for every pair); then the method's own
 * structure (the confirmation is asked only where the practice exists, or the practice's answer precludes it); and
 * otherwise the conservative default, complementary weakness, which never claims the confirmation is disproved.
 */

export type RelationType = 'direct-contradiction' | 'necessary-dependency' | 'complementary-weakness' | 'untested-practice' | 'missing-information';
export type RelationBasis = 'answer' | 'reviewed-pair' | 'method-structure' | 'default';
export type Relation = {
  confirmation: string; practice: string; type: RelationType; basis: RelationBasis;
  rationale: string;
  /** Customer wording for the pair. Reviewed wording for contradictions and dependencies; generated for the rest. */
  statement: string;
};
export const RELATION_LABEL: Record<RelationType, string> = {
  'direct-contradiction': 'Answers that cannot both be right',
  'necessary-dependency': 'Control depends on a weaker practice',
  'complementary-weakness': 'Further defence weaker',
  'untested-practice': 'Not yet used',
  'missing-information': 'Information outstanding'
};
/** Relationships that leave a confirmation unresolved: the report cannot treat the scheme as covered until they are. */
export const UNRESOLVED: RelationType[] = ['direct-contradiction', 'necessary-dependency'];

type Pair = { scheme: string; confirmation: string; practice: string; type: RelationType; rationale: string; statement?: string };
const PAIRS = new Map((review as unknown as { pairs: Pair[] }).pairs.map((p) => [`${p.confirmation}>${p.practice}`, p]));
export const RELATION_REVIEW = review as unknown as { version: string; status: string; rule: string; pairs: Pair[] };

type Answered = { id: string; class?: string | null; answer?: { value: unknown } | null; outstanding: boolean };
const lc = (s: string) => (s && !/^[A-Z]{2,}/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s);

export function classifyRelation(confirmation: Answered, practice: Answered, precludes: { by: string; controls: string[] }[] = []): Relation {
  const cId = confirmation.id;
  const pId = practice.id;
  const cName = controlName(cId);
  const pName = controlName(pId);
  const state = lc(CLASS_SHORT[practice.class ?? ''] ?? 'reported weaker');
  const base = { confirmation: cId, practice: pId };
  if (practice.outstanding) {
    return { ...base, type: 'missing-information', basis: 'answer', rationale: 'The practice was declined, not known or is still waiting for an answer.',
      statement: `${pName} is still to be answered, so nothing is concluded about how it bears on ${lc(cName)}.` };
  }
  if (practice.class === 'noinstance' || practice.class === 'na') {
    return { ...base, type: 'untested-practice', basis: 'answer', rationale: 'The organisation reports that no case has arisen, so the practice has not been used.',
      statement: `${pName} has not yet been used because no case has arisen; it neither supports nor weakens ${lc(cName)}.` };
  }
  const reviewed = PAIRS.get(`${cId}>${pId}`);
  if (reviewed) {
    return { ...base, type: reviewed.type, basis: 'reviewed-pair', rationale: reviewed.rationale,
      statement: reviewed.statement ?? complementary(cName, pName, state) };
  }
  const cq = bankQuestion(cId) as { askWhen?: { q?: string; any?: { q: string }[] }; dependsBecause?: string } | null;
  const askedOnlyWhere = cq?.askWhen && (cq.askWhen.q === pId || cq.askWhen.any?.some((a) => a.q === pId));
  const precluded = precludes.some((p) => p.by === pId && p.controls.includes(cId));
  if (askedOnlyWhere || precluded) {
    return { ...base, type: 'necessary-dependency', basis: 'method-structure',
      rationale: askedOnlyWhere ? `The method asks ${cId} only where ${pId} is in place${cq?.dependsBecause ? `: ${cq.dependsBecause}` : '.'}` : `The method precludes ${cId} when ${pId} is not in place.`,
      statement: `${cName} is reported in place, but it relies on ${lc(pName)}, which is ${state}. It can operate only as far as ${lc(pName)} does.` };
  }
  return { ...base, type: 'complementary-weakness', basis: 'default',
    rationale: 'Not yet reviewed. The method establishes no dependency between the two questions, so the practice is treated as a further defence against the same scheme.',
    statement: complementary(cName, pName, state) };
}

function complementary(cName: string, pName: string, state: string): string {
  return `${pName} is ${state}. It is a further defence against the same scheme and does not change the answer given for ${lc(cName)}.`;
}
