/**
 * DRAFT wording for MK review (B7). Not approved. Used only to build fictional examples and to exercise the validation
 * checks in Phase 1. Every template is filled only from claims: `{name}` is a slot or a count. No template contains a
 * number of its own, so every number in a report can be traced to a count or a claim.
 */
export type CopyTable = { version: string; approved: boolean; templates: Record<string, string> };

const exposure = '“{key}”: {stateLabel}, as reported by {by}.';
const reviewed = 'MK reviewed the evidence supplied and found';

export const DRAFT_COPY: CopyTable = {
  version: '0.1.0-draft',
  approved: false,
  templates: {
    // Layer 1: status
    'status.interim': 'Internal interim draft. Not for release. The review is not complete: {why}',
    'status.method': 'Method status: {approval}',
    'status.scoring': 'No score, rating or ranking is given while the review method is not approved.',
    'status.identity': 'Evidence reviews and conclusions in this report are recorded under a reviewer identity that is not yet verified.',
    'status.asof': 'This report reflects the review record as at {asOf}, after {actionCount} recorded actions.',

    // Layer 1: the position in five parts
    'position.exposure.area': '{area}: {exposed} of the {asked} practices reported on were reported as not fully in place.',
    'position.exposure.none': 'No practice was reported as not fully in place.',
    'position.evidence.summary': 'MK has reviewed evidence for {reviewed} of the {asked} practices reported on. For the others, only what was reported is available.',
    'evidence.reviewed-sufficient': `For “{key}”, ${reviewed} it sufficient.`,
    'evidence.insufficient': `For “{key}”, ${reviewed} it insufficient.`,
    'evidence.contradicted': `For “{key}”, ${reviewed} that it did not support the answer.`,
    'evidence.supplied': 'For “{key}”, evidence has been supplied and recorded; it has not yet been reviewed.',
    'evidence.requested': 'For “{key}”, evidence has been requested and not yet supplied.',
    'evidence.unavailable': 'For “{key}”, evidence was requested and the organisation said it cannot be provided.',
    'evidence.said-to-exist': 'For “{key}”, the respondent said evidence is available; MK has not seen it.',
    'conclusion.confirmed': 'Reviewer conclusion recorded by “{by}” on {at}: confirmed the answer recorded for “{key}” (answer version {forVersion}: “{answer}”). Recorded basis: “{basis}”.',
    'conclusion.partly-confirmed': 'Reviewer conclusion recorded by “{by}” on {at}: partly confirmed the answer recorded for “{key}” (answer version {forVersion}: “{answer}”). Recorded basis: “{basis}”.',
    'conclusion.not-confirmed': 'Reviewer conclusion recorded by “{by}” on {at}: did not confirm the answer recorded for “{key}” (answer version {forVersion}: “{answer}”). Recorded basis: “{basis}”.',
    'conclusion.disputed': 'Reviewer conclusion recorded by “{by}” on {at}: the answer recorded for “{key}” (answer version {forVersion}: “{answer}”) is disputed. Recorded basis: “{basis}”.',
    'conclusion.none': 'No authorised reviewer conclusion has been recorded.',
    'position.unresolved': '{open} of the {total} controls are waiting for an answer from an accountable function; {unassigned} of those {open} have no accountable function yet.',
    'position.undecided': '{undecided} fraud scenarios that the method treats as material cannot yet be decided, because the questions that decide them are unanswered. The method covers {scenarios} scenarios in all.',
    'position.outside': '{notAsked} of the {total} controls were not asked in this review, and {excluded} were excluded by a recorded fact or by the organisation\'s size. Nothing is concluded about them.',

    // Layer 1: what management can conclude, what remains unestablished, decisions
    'conclude.reported': 'Management has been told by its own respondent that {exposed} of the {asked} practices reported on are not fully in place. This is what was reported; it has been checked against evidence only where stated.',
    'unestablished.evidence': '{withoutEvidence} of the {asked} practices reported on have no evidence reviewed by MK; for these, only the respondent\'s account is available.',
    'unestablished.validation': 'No evidence has been independently validated; the current method does not provide for independent validation.',
    'decision.assign': 'Decide who should answer the {unassigned} unresolved questions that have no accountable function yet.',
    'decision.evidence': 'Decide whether to supply evidence for the {withoutEvidence} practices reported on that MK has not reviewed.',
    'decision.assumptions': 'Confirm or correct the assumptions the review made about activities that do not apply.',
    'decision.completion': 'Decide whether the review should proceed to an authorised reviewer\'s conclusions on scope, evidence and findings.',

    // Layer 2: analysis by area
    'analysis.exposure.none-recorded': `${exposure} No evidence has been recorded.`,
    'analysis.exposure.said-to-exist': `${exposure} The respondent said evidence is available; MK has not seen it.`,
    'analysis.exposure.requested': `${exposure} Evidence has been requested.`,
    'analysis.exposure.unavailable': `${exposure} Evidence was requested and the organisation said it cannot be provided.`,
    'analysis.exposure.supplied': `${exposure} Evidence has been supplied; it has not yet been reviewed.`,
    'analysis.exposure.reviewed-sufficient': `${exposure} ${reviewed} it sufficient.`,
    'analysis.exposure.insufficient': `${exposure} ${reviewed} it insufficient.`,
    'analysis.exposure.contradicted': `${exposure} ${reviewed} that it did not support the answer.`,
    'analysis.area.unresolved': '{open} of the {areaTotal} controls in this area are waiting for an answer; see the information-gathering register.',
    'analysis.area.outside': '{notAsked} of the {areaTotal} controls in this area were not asked, and {excluded} do not apply or are not expected at this size. Nothing is concluded about them.',

    // Layer 3: registers
    'register.info.sequence': 'This register is a sequence for gathering information: grouped by accountable function, then by the method\'s scenario tier and question order. It is not a ranking of fraud risk or materiality.',
    'register.info.item': '{function}: answer “{key}”. {provenance}.',
    'register.info.item.unassigned': 'Not yet assigned to an accountable function: answer “{key}”. {provenance}.',
    'register.remediation.unranked': 'These recommendations are listed by area and question order. They are not ranked: no view has been formed on their relative risk or urgency.',
    'register.remediation.method': '{action}. For management consideration; based on what was reported.',
    'register.followups.intro': 'Reviewer follow-ups are quoted as recorded. The reviewer has not classified them as remediation or as information gathering, and they are not ranked.',
    'register.followup.item': 'Follow-up recorded by “{by}” on {at} for “{key}”: “{followUp}”.',

    // Layer 4: annex
    'annex.lineage': 'Built from report input version {inputVersion}, from the first {actionCount} actions of session {sessionId} (log digest {logDigest}). The input digest is recorded in the document lineage and checked by the input gate.'
  }
};

/** Fills a template from slot and count values. Throws on a slot that has no value, so nothing is left unfilled. */
export function render(template: string, values: Record<string, string | number | null>) {
  return template.replace(/\{([A-Za-z]+)\}/g, (_, name: string) => {
    if (!(name in values) || values[name] === null || values[name] === undefined) throw new Error(`No value for the slot {${name}}`);
    return String(values[name]);
  });
}
