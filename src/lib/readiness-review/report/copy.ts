/**
 * DRAFT wording of the standard (self-reported) report, for MK review (B7). NOT APPROVED. Every template is filled only
 * from claims: `{name}` is a slot or a count. No template contains a number of its own, so every number in a report
 * can be traced to a count or a claim. No template describes evidence review, verification or a reviewer's
 * conclusion: those belong to the separately scoped Advisory package and are not part of this report.
 */
export type CopyTable = { version: string; approved: boolean; templates: Record<string, string> };

const issue = '“{key}”: {stateLabel}. Answered by: {by}. Response: “{answer}”';
const corrected = '“{key}”: {stateLabel}. Answered by: {by}, in a correction to an earlier answer. Response: “{answer}”';
const consider = 'Recommended action, for management consideration:';

export const STANDARD_COPY: CopyTable = {
  version: '0.2.0-draft',
  approved: false,
  templates: {
    // ---------------------------------------------------------------- Layer 1: status and basis
    'status.marking': 'Internal interim draft. Not for release.',
    'status.basis': 'This report rests on the organisation\'s own responses to the assessment and on the assessment method. MK has not reviewed evidence or verified any response; evidence review is not part of this assessment. Where the report describes a gap, it is a gap indicated by the responses, not a verified control deficiency.',
    'status.method': 'Method status: {approval}',
    'status.asof': 'Responses as recorded at {asOf}, after {actionCount} recorded actions.',

    // ---------------------------------------------------------------- Layer 1: what the responses indicate
    'indicated.area': '{area}: the responses indicate that {exposed} of the {asked} practices reported on in this area are not fully in place.',
    'indicated.none': 'The responses indicate no practice that is not fully in place.',
    'indicated.scenarios': 'The method describes {scenarios} fraud scenarios. For {gapScenarios} of them, the responses indicate a gap in the practice the method uses to address the scenario; for {practiceScenarios}, that practice was reported in place. {openScenarios} cannot yet be decided from the responses, and {excludedScenarios} do not apply or are not expected.',

    // ---------------------------------------------------------------- Layer 1 and 2: coverage, kept apart category by category
    'coverage.routing.ceiling': 'The assessment is adaptive: each answer decides which questions follow, so not every control is asked. This interview ended when it reached its limit of {limit} respondent screens. A control that was not asked, or whose applicability is not yet known, is not a finding: nothing is concluded about it, favourable or unfavourable.',
    'coverage.routing.respondent': 'The assessment is adaptive: each answer decides which questions follow, so not every control is asked. The respondent ended this interview after {screens} of its {limit} respondent screens. A control that was not asked, or whose applicability is not yet known, is not a finding: nothing is concluded about it, favourable or unfavourable.',
    'coverage.routing.plan': 'The assessment is adaptive: each answer decides which questions follow, so not every control is asked. This interview asked everything its plan required, using {screens} of its {limit} respondent screens. A control that was not asked, or whose applicability is not yet known, is not a finding: nothing is concluded about it, favourable or unfavourable.',
    'coverage.routing.ended': 'The assessment is adaptive: each answer decides which questions follow, so not every control is asked. This interview has ended, after {screens} of its {limit} respondent screens. A control that was not asked, or whose applicability is not yet known, is not a finding: nothing is concluded about it, favourable or unfavourable.',
    'coverage.routing.open': 'The assessment is adaptive: each answer decides which questions follow, so not every control is asked. This interview has not ended; {screens} of its {limit} respondent screens have been used. A control that was not asked, or whose applicability is not yet known, is not a finding: nothing is concluded about it, favourable or unfavourable.',
    'coverage.reported': 'Practices reported on: {reported} of the {total} controls in the method.',
    'coverage.reused': 'Practices established by a wider answer: {reused} of the {total} controls.',
    'coverage.fact': 'Facts recorded about the organisation: {fact} of the {total} controls.',
    'coverage.waiting': 'Waiting for an answer from an accountable function: {waiting} of the {total} controls.',
    'coverage.waiting.scope': 'Waiting for an answer from an accountable function: {waiting} of the {total} controls. For {waitingScope} of these, the open question is whether the practice applies.',
    'coverage.waiting.unassigned': 'Waiting for an answer from an accountable function: {waiting} of the {total} controls. {unassigned} of these have no accountable function yet.',
    'coverage.waiting.both': 'Waiting for an answer from an accountable function: {waiting} of the {total} controls. For {waitingScope} of these, the open question is whether the practice applies; {unassigned} have no accountable function yet.',
    'coverage.unconfirmed': 'Not reached before the interview ended: {unconfirmed} of the {total} controls. They were not asked; nothing is known about them.',
    'coverage.scope-unconfirmed': 'Applicability not yet known: {scopeUnconfirmed} of the {total} controls. Whether they apply depends on facts about the organisation\'s activities that have not been established.',
    'coverage.prerequisite': 'Depends on a question not yet answered: {prerequisite} of the {total} controls. They are asked only once an earlier question is answered.',
    'coverage.excluded': 'Excluded by a recorded scope decision: {excluded} of the {total} controls, because a recorded fact shows they do not apply, they are not expected at the organisation\'s size, or a related practice was reported absent.',
    'coverage.assumed': 'Assumed not to apply for the organisation\'s sector, pending the organisation\'s confirmation: {assumed} of the {total} controls.',
    'coverage.retired': 'Retired questions, no longer part of the method: {retired} of the {total} controls.',

    // ---------------------------------------------------------------- Layer 1: recommended actions, withheld judgements, decisions
    'actions.summary': 'For each of the {issues} gaps indicated, the register restates the practice as the draft method describes it in place, as a recommended action for management consideration. The actions are not ranked.',
    'actions.summary.withheld': 'For {withAction} of the {issues} gaps indicated, the register restates the practice as the draft method describes it in place, as a recommended action for management consideration. For {withheldActions}, a specific action is withheld because the draft method gives no description to restate. The actions are not ranked.',
    'withheld.overall': 'Withheld: an overall view of the organisation\'s fraud readiness. It needs a professional judgement that MK has not recorded, and the method is not yet approved.',
    'withheld.priority': 'Withheld: any order of priority, materiality or urgency among the gaps indicated. MK has not approved a method for prioritisation, and the responses alone do not establish one.',
    'withheld.remediation': 'Withheld: how, by whom and by when each gap should be addressed, beyond the draft method\'s own description of the practice. That needs judgement about the organisation that MK has not recorded.',
    'withheld.verification': 'Withheld: whether the responses are accurate. MK has not reviewed evidence or verified any response; this assessment does not include evidence review.',
    'withheld.scoring': 'Withheld: any score, rating or maturity level, while the method is not approved.',
    'withheld.unasked': 'Withheld: any view on controls that were not asked, whose applicability is not yet known, or that are waiting for an answer.',
    'decision.assign': 'Decide who should answer the {unassigned} open questions that have no accountable function yet.',
    'decision.actions': 'Decide which of the {issues} gaps indicated by the responses to act on, and how. The report does not rank them.',
    'decision.assumptions': 'Confirm or correct the assumptions the assessment made about activities that do not apply.',

    // ---------------------------------------------------------------- Layer 2: analysis by area
    'analysis.issue': `${issue}`,
    'analysis.issue.corrected': `${corrected}`,
    'analysis.issue.risks': 'In the draft method, “{key}” addresses these fraud risks: {risks}.',
    'analysis.area.practice': '{practiced} of the {areaAsked} practices reported on in this area were reported in place.',
    'analysis.area.records': 'The respondent said a record could be shown for {said} of the {areaAsked} practices reported on in this area. MK has not seen these records.',
    'area.coverage.reported': 'Reported on as practices: {count} of the {areaTotal} controls in this area.',
    'area.coverage.reused': 'Established by a wider answer: {count} of the {areaTotal} controls in this area.',
    'area.coverage.fact': 'Recorded facts: {count} of the {areaTotal} controls in this area.',
    'area.coverage.waiting': 'Waiting for an answer from an accountable function: {count} of the {areaTotal} controls in this area; see the information-gathering register.',
    'area.coverage.unconfirmed': 'Not reached before the interview ended: {count} of the {areaTotal} controls in this area.',
    'area.coverage.scope-unconfirmed': 'Applicability not yet known: {count} of the {areaTotal} controls in this area.',
    'area.coverage.prerequisite': 'Depending on a question not yet answered: {count} of the {areaTotal} controls in this area.',
    'area.coverage.excluded': 'Excluded by a recorded scope decision: {count} of the {areaTotal} controls in this area.',
    'area.coverage.assumed': 'Assumed not to apply for the sector, pending the organisation\'s confirmation: {count} of the {areaTotal} controls in this area.',
    'area.coverage.retired': 'Retired questions: {count} of the {areaTotal} controls in this area.',

    // ---------------------------------------------------------------- Layer 2: scenario analysis (method order within each area; tiers in the annex only)
    'scenario.confirmed-reported': '“{name}”: {statusLabel}.',
    'scenario.gap-reported': '“{name}”: the responses indicate a gap in the practice the method uses to address it. “{key}”: {stateLabel}.',
    'scenario.waiting': '“{name}”: {statusLabel}. It cannot yet be decided from the responses.',
    'scenario.unconfirmed': '“{name}”: {statusLabel}. It cannot yet be decided from the responses.',
    'scenario.scope-unconfirmed': '“{name}”: {statusLabel}. It cannot yet be decided from the responses.',
    'scenario.route-unconfirmed': '“{name}”: {statusLabel}. It cannot yet be decided from the responses.',
    'scenario.route-incomplete': '“{name}”: the practice the method uses to address it was reported in place. {statusLabel}, so it cannot yet be fully decided from the responses.',
    'scenario.route-incomplete.gap': '“{name}”: the responses indicate a gap in the practice the method uses to address it. “{key}”: {stateLabel}. {statusLabel}, so it cannot yet be fully decided from the responses.',
    'scenario.precluded': '“{name}”: {statusLabel}.',
    'scenario.outofscope': '“{name}”: {statusLabel}, by a recorded scope decision.',
    'scenario.assumed': '“{name}”: {statusLabel}, pending the organisation\'s confirmation.',

    // ---------------------------------------------------------------- Layer 3: registers
    'register.info.sequence': 'This register is a sequence for gathering information: grouped by accountable function, then by the method\'s scenario tier and question order. It is not a ranking of fraud risk or materiality.',
    'register.info.item': '{function}: answer “{key}”. {provenance}.',
    'register.info.item.unassigned': 'Not yet assigned to an accountable function: answer “{key}”. {provenance}.',
    'register.issues.intro': 'Each item is a gap indicated by the organisation\'s own responses, listed by area and question order for management consideration. MK has not verified the responses. The items are not ranked.',
    'register.issue': `${issue}`,
    'register.issue.corrected': `${corrected}`,
    'register.actions.intro': 'Each recommended action restates the practice as the draft method describes it in place. The method is not yet approved by MK, and the actions rest on responses MK has not verified. They are not ranked, and they do not say how, by whom or by when a practice should be put in place.',
    'action.anchored': `${consider} bring “{key}” to the practice the draft method describes as in place: “{inPlace}”`,
    'action.practice': `The draft method asks “{question}” and treats the answer “{inPlaceAnswers}” as in place. ${consider} bring “{key}” to that point.`,
    'action.choice': `The draft method treats “{inPlaceAnswers}” as in place for “{key}”. ${consider} bring the practice to that position.`,
    'action.withheld': 'For “{key}”, a specific recommended action is withheld: the draft method gives no description of this practice in place to restate, and MK has not recorded a recommendation.',

    // ---------------------------------------------------------------- Layer 4: annex
    'annex.lineage': 'Built from report input version {inputVersion}, from the first {actionCount} actions of session {sessionId} (log digest {logDigest}). The input digest is recorded in the document lineage and checked by the input gate.',
    'annex.method': 'Method: {approval} Basis of this report: the organisation\'s own responses, routed by the adaptive interview, and the draft method\'s own content. Not part of this assessment: evidence review, verification of responses and professional conclusions by MK.'
  }
};

/** Fills a template from slot and count values. Throws on a slot that has no value, so nothing is left unfilled. */
export function render(template: string, values: Record<string, string | number | null>) {
  return template.replace(/\{([A-Za-z]+)\}/g, (_, name: string) => {
    if (!(name in values) || values[name] === null || values[name] === undefined) throw new Error(`No value for the slot {${name}}`);
    return String(values[name]);
  });
}
