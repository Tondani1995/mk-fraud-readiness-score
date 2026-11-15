/**
 * Ordinary-language labels for engine states. Presentation only: each label names a state the engine already
 * decided. Nothing here classifies an answer, decides scope or ranks anything.
 */

export const PHASE_LABEL: Record<string, string> = {
  profile: 'About the organisation',
  confirm: 'Essential confirmations',
  route: 'Essential confirmations',
  scope: 'Checking what applies',
  followup: 'Following up a gap you reported',
  assumptions: 'Activities to confirm',
  coverage: 'Wider coverage',
  reconfirm: 'Reconfirming after a change',
  'owner-followup': 'Opened by an earlier answer',
  'owner-package': 'Questions for your function'
};

export const REPORTED_LABEL: Record<string, string> = {
  full: 'Reported in place',
  partial: 'Reported partly in place',
  designed: 'Reported as set out, not yet working',
  absent: 'Reported not in place',
  noinstance: 'Set out; no case has tested it yet',
  na: 'Reported as not applicable'
};

export const CONTROL_STATE_LABEL: Record<string, string> = {
  unconfirmed: 'Not asked yet',
  'scope-unconfirmed': 'Whether it applies is not yet known',
  prerequisite: 'Depends on a question not yet asked',
  precluded: 'Cannot apply, because a related practice was reported absent',
  waiting: 'Waiting for an owner',
  'waiting-scope': 'Whether it applies is waiting for an owner',
  assumed: 'Assumed not to apply for this sector; to confirm',
  outofscope: 'Does not apply',
  proportion: 'Not expected at this size',
  retired: 'Retired question',
  reused: 'Established by a wider answer',
  fact: 'Recorded fact'
};

export const SCENARIO_STATUS_LABEL: Record<string, string> = {
  unconfirmed: 'Its control was not reached before the interview ended',
  waiting: 'Waiting for an owner to answer',
  'scope-unconfirmed': 'Whether it applies is not yet known',
  'route-unconfirmed': 'Which control applies is not yet known',
  'route-incomplete': 'A further control may apply, and the fact that decides it is not yet known',
  precluded: 'Its control cannot apply because a related practice was reported absent',
  'confirmed-reported': 'Its control was reported in place',
  'gap-reported': 'A gap was reported for its control',
  outofscope: 'Does not apply',
  assumed: 'Assumed not to apply for this sector'
};

export const EVIDENCE_LABEL: Record<string, string> = {
  requested: 'Evidence requested',
  supplied: 'Evidence supplied, not yet reviewed',
  'reviewed-sufficient': 'Evidence reviewed and sufficient',
  insufficient: 'Evidence reviewed and insufficient',
  contradicted: 'Evidence contradicts the answer',
  unavailable: 'Evidence not available'
};

export const CONCLUSION_LABEL: Record<string, string> = {
  confirmed: 'Confirmed',
  'partly-confirmed': 'Partly confirmed',
  'not-confirmed': 'Not confirmed',
  disputed: 'Disputed'
};

export const STOP_LABEL: Record<string, string> = {
  ceiling: 'The interview reached its limit of 95 screens',
  plan: 'The interview asked everything it needed to',
  respondent: 'The respondent stopped the interview'
};

export const EVIDENCE_CLAIM_LABEL: Record<string, string> = {
  yes: 'The respondent said a record could be shown',
  partly: 'The respondent said a record could partly be shown',
  no: 'The respondent said no record could be shown'
};

export const REACH_LABEL: Record<string, string> = {
  units: 'Falls short in some sites, units or entities',
  cases: 'Falls short in some cases or periods',
  provider: 'Falls short in work done by a provider'
};

export const TESTED_LABEL: Record<string, string> = {
  yes: 'Checked or tested in the last 12 months',
  no: 'Not checked or tested in the last 12 months',
  unsure: 'Not sure whether it was checked or tested'
};
