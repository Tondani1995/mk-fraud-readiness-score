// The fictional organisations used for the report comparison. Each organisation is defined once; its MFRS V1.2 answers
// (the "before" assessment) and its staged review answers (the "after" assessment) are both derived from that single
// definition, so a difference between the two reports comes from the assessment and the report engines, not from a
// different organisation. Fictional only: no real organisation, person or customer record is used.
import { POLICIES, withUnknown } from '../research/scoring-simulation/lib.mjs';
import { JOURNEY_PROFILES } from '../lib/build16-driver.mjs';

const SEED = 'mk-sim';

// MFRS V1.2 gateway answers for the two organisation shapes (retail group R, small owner-managed firm S). They state
// the same facts as the staged profile answers (sector, size, procurement, payroll, cash, stock, digital channels).
const GATEWAYS = {
  R: { G01: 'retail_consumer', G02: 'employees_50_249', G03: 'yes', G04: 'organisation', G05: 'dedicated_internal', G06: 'yes', G07: 'yes', G08: 'organisation', G09: 'own', G10: 'yes', G11: 'yes', G12: 'yes', G13: 'yes', G14: 'yes', G15: 'yes', G16: 'two_or_more', G17: 'no' },
  // The small firm's staged profile answers "no" to buying from suppliers, payroll, selling on account, cash and stock
  // (fact mode "closed"), so those areas are out of scope in both assessments; digital channels and finance apply.
  S: { G01: 'other_mixed', G02: 'employees_10_49', G03: 'no', G05: 'no_procurement', G06: 'no', G07: 'no', G08: 'no_payroll', G09: 'none', G10: 'no', G11: 'yes', G12: 'yes', G13: 'no', G14: 'no', G15: 'no', G16: 'one_person', G17: 'no' }
};

/**
 * Construct mapping: the bank 1.3 area whose controls each MFRS V1.2 question asks about. An organisation's answer to
 * an MFRS question is drawn from the same policy as its answers in that bank area, so "mixed" means the same strengths
 * and weaknesses in both assessments. Chosen by reading each MFRS prompt; documented in REPORT-COMPARISON.md.
 */
export const MFRS_TO_BANK_AREA = {
  'D1-Q01': 'D1', 'D1-Q02': 'D1', 'D1-Q03': 'D1', 'D1-Q04': 'D1', 'D1-Q05': 'D1', 'D1-Q06': 'D1', 'D1-Q07': 'D1',
  'D10-Q01': 'D1', 'D10-Q02': 'D1', 'D10-Q03': 'D1', 'D10-Q04': 'D1', 'D10-Q05': 'D1', 'D10-Q06': 'D1',
  'D2-Q01': 'D2', 'D2-Q02': 'D2', 'D2-Q03': 'D2', 'D2-Q04': 'D2', 'D2-Q05': 'D2', 'D2-Q06': 'D2', 'D2-Q07': 'D2', 'D2-Q08': 'D2',
  'D3-Q01': 'D6', 'D3-Q02': 'D6', 'D3-Q03': 'D4', 'D3-Q04': 'D9', 'D3-Q05': 'D6', 'D3-Q06': 'D1', 'D3-Q07': 'D5', 'D3-Q08': 'D9', 'D3-Q09': 'D5', 'D3-Q10': 'D8', 'D3-Q11': 'D8',
  'D4-Q01': 'D10', 'D4-Q02': 'D10', 'D4-Q03': 'D10', 'D4-Q04': 'D10', 'D4-Q05': 'D10', 'D4-Q06': 'D10', 'D4-Q07': 'D10', 'D4-Q08': 'D10',
  'D5-Q01': 'D10', 'D5-Q02': 'D10', 'D5-Q03': 'D10', 'D5-Q04': 'D10', 'D5-Q05': 'D10', 'D5-Q06': 'D10', 'D5-Q07': 'D10',
  'D6-Q01': 'D10', 'D6-Q02': 'D10', 'D6-Q03': 'D10', 'D6-Q04': 'D10', 'D6-Q05': 'D10', 'D6-Q06': 'D10',
  'D7-Q01': 'D4', 'D7-Q02': 'D4', 'D7-Q03': 'D3', 'D7-Q04': 'D4', 'D7-Q05': 'D4', 'D7-Q06': 'D4', 'D7-Q07': 'D4',
  'D8-Q01': 'D9', 'D8-Q02': 'D9', 'D8-Q03': 'D9', 'D8-Q04': 'D9', 'D8-Q05': 'D9', 'D8-Q06': 'D9', 'D8-Q07': 'D9', 'D8-Q08': 'D9', 'D8-Q09': 'D9', 'D8-Q10': 'D9',
  'D9-Q01': 'D3', 'D9-Q02': 'D3', 'D9-Q03': 'D3', 'D9-Q04': 'D3', 'D9-Q05': 'D3', 'D9-Q06': 'D3'
};

const strongAll = (q, seed) => POLICIES.strong(q, seed);

/**
 * Selected for the comparison: P3 shows a mixed organisation, P6b an organisation whose headline answers overstate its
 * practices, P4 a small owner-managed firm and P5 an organisation with much unanswered information.
 * `mfrsPolicy` is how the same organisation answers MFRS's single-level headline questions: P6b's respondent reports
 * every headline control as mature (the overstatement MFRS cannot see), P5's respondent does not know 35% of answers.
 */
export const ORGANISATIONS = {
  P3: { label: 'Fictional Retail Group (mixed controls)', short: 'Mixed retail group', profile: 'R', mfrsPolicy: POLICIES.mixed },
  P6b: { label: 'Fictional Retail Group (overstated confirmations)', short: 'Overstated retail group', profile: 'R', mfrsPolicy: strongAll },
  P4: { label: 'Fictional Owner-Managed Firm', short: 'Small owner-managed firm', profile: 'S', mfrsPolicy: POLICIES.mixed },
  P5: { label: 'Fictional Retail Group (extensive unanswered information)', short: 'Retail group, much unanswered', profile: 'R', mfrsPolicy: withUnknown(POLICIES.mixed, 0.35) }
};

export function journeyProfile(key) {
  return JOURNEY_PROFILES[key];
}

export function gatewaysFor(key) {
  return GATEWAYS[ORGANISATIONS[key].profile];
}

/** The organisation's answer to an MFRS V1.2 question: a maturity level 0 to 5, or 'unknown'. */
export function mfrsResponse(key, question) {
  const area = MFRS_TO_BANK_AREA[question.questionCode];
  if (!area) throw new Error(`No construct mapping for ${question.questionCode}`);
  const target = ORGANISATIONS[key].mfrsPolicy({ id: `MFRS|${question.questionCode}`, domain: area, format: 'anchored' }, SEED);
  return target === 'unknown' ? 'unknown' : target;
}
