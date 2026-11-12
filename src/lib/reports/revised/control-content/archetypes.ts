/**
 * FICTIONAL INTEGRATION PROTOTYPE. Control-content library, draft 0.1 for MK's approval: the reusable part.
 *
 * MK's direction of 12 November (second direction), item 5: 688 practice questions in the draft bank have no level
 * descriptions or named records, and the reports must not fill that gap with generic text or with 688 unrelated
 * recommendations. The library is therefore built in two layers:
 *
 *   archetypes   a small set of control patterns (this file). Each fixes how a control of that kind is put in place
 *                (implementation activities), what management keeps (record), how success is measured and what to do
 *                when it fails, with slots for the specifics. Approving an archetype approves its structure once.
 *   entries      one per control (entries.ts): the archetype, the target operating practice in full, and the slot
 *                values that make the activities, record and measure specific to that control.
 *
 * Sources an entry may draw on, recorded per entry: the bank's level 4 wording and named evidence for anchored
 * controls, its objectives and scenario descriptions, MK's existing MFRS question playbooks and the method's own
 * routing reasons. This is professional advisory content embedded in automated reports. It is not evidence review
 * or verification, and the records it names are records management should maintain, not evidence MK has examined.
 */

export type ArchetypeId =
  | 'gate' | 'second-person' | 'verify-change' | 'reconcile' | 'monitor' | 'count' | 'segregate' | 'protect'
  | 'rule' | 'procedure' | 'assessment' | 'register' | 'assurance' | 'training' | 'people';

/** Slot values an entry supplies. Only `target`, `unit`, `cycle`, `record`, `fields` and `ok` are always required. */
export type Slots = {
  /** Population item, singular and plural ("change to a supplier's bank details", "changes to suppliers' bank details"). */
  unit: string; units: string;
  /** When the control operates ("before each payment", "each pay run", "daily", "each year"). */
  cycle: string;
  /** The record's name ("supplier set-up file") and what it shows. */
  record: string; fields: string;
  /** What the record shows for each item when the control works; completes the archetype's measure sentence. */
  ok: string;
  /** Where the control is enforced, if a system can enforce it ("the supplier master file"). */
  where?: string;
  /** Channel used to confirm (verify-change). */
  channel?: string;
  /** What one person must not be able to do alone (segregate). */
  risk?: string;
  /** Where to start (protect, assessment). */
  first?: string;
  /** Who approves a rule or plan. */
  approver?: string;
  /** What else prompts a review (register). */
  trigger?: string;
  /** The requirement in brief, as a noun phrase (assessment). */
  req?: string;
};

export type Archetype = {
  id: ArchetypeId; name: string; pattern: string;
  activities: (s: Slots) => string[];
  record: (s: Slots) => string;
  measure: (s: Slots) => string;
  onFailure: (s: Slots) => string;
};

const cap = (t: string) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);
const art = (t: string) => (/^[aeiou]/i.test(t) && !/^(one|uni|use|eu)/i.test(t) ? `an ${t}` : `a ${t}`);
const rec = (s: Slots) => `${cap(s.record)}: ${s.fields}.`;

export const ARCHETYPES: Record<ArchetypeId, Archetype> = {
  gate: {
    id: 'gate', name: 'Check before the event', pattern: 'A defined check or verification that each item must pass before it proceeds.',
    activities: (s) => [
      `Set out the check in the procedure for ${s.units}: what is checked, by whom, and who may approve an exception.`,
      s.where ? `Set ${s.where} so that no ${s.unit} proceeds until the check is recorded as passed.` : `Add the check to the procedure and to the checklist completed for each ${s.unit}.`,
      `Look back over ${s.units} from the last twelve months, and follow up any that would not have passed the check.`
    ],
    record: rec,
    measure: (s) => `Every ${s.unit} in the period has ${art(s.record)} showing ${s.ok}.`,
    onFailure: (s) => `Where ${art(s.unit)} went ahead without the check, complete the check at once and review anything paid or released before it was found.`
  },
  'second-person': {
    id: 'second-person', name: 'Approval by a second person', pattern: 'Each item is approved by someone other than the person who processes it, before it takes effect.',
    activities: (s) => [
      `Set who may approve ${s.units}, within what limits, and confirm that no one approves their own.`,
      s.where ? `Set ${s.where} so that the person who processes ${art(s.unit)} cannot approve it.` : `Record the approver on each ${s.unit}, and check that it is never the person who processed it.`,
      `Review a recent month of ${s.units} for approvals by the same person or after the event, and correct what allowed them.`
    ],
    record: rec,
    measure: (s) => `Every ${s.unit} in the period was approved by someone other than the person who processed it, ${s.ok}.`,
    onFailure: (s) => `Have any ${s.unit} approved by the person who processed it re-approved independently, and review that person's other ${s.units} for the period.`
  },
  'verify-change': {
    id: 'verify-change', name: 'Verify a change through a known channel', pattern: 'A change to details that direct money, goods or access is confirmed through a channel the organisation starts, never through the request itself.',
    activities: (s) => [
      `Write the confirmation step into the procedure: ${s.channel ?? 'a call to contact details already on file'}, never details supplied with the request.`,
      s.where ? `Limit who can make the change in ${s.where}, and log how each change was confirmed.` : 'Limit who can make the change, and log how each change was confirmed.',
      `Check the ${s.units} made in the last six months against the log, and confirm any that were not verified.`
    ],
    record: rec,
    measure: (s) => `Every ${s.unit} made in the period was confirmed ${s.ok} before it took effect, or is a recorded and approved exception.`,
    onFailure: (s) => `Suspend any ${s.unit} that was not confirmed until it is verified, and check whether any payment, delivery or access used it.`
  },
  reconcile: {
    id: 'reconcile', name: 'Reconcile and explain differences', pattern: 'Two independent records are compared on a set cycle, by someone who does not control both, and every difference is explained.',
    activities: (s) => [
      `Set the reconciliation: what is compared, how often (${s.cycle}), who prepares it and who reviews it.`,
      'Keep a log of differences with the explanation and outcome of each, and a threshold above which a difference is escalated.',
      'Review the first month of reconciliations and differences, and correct the procedure where differences were left open.'
    ],
    record: rec,
    measure: (s) => `Every ${s.record} due in the period was completed and reviewed, and every difference ${s.ok}.`,
    onFailure: () => 'Investigate any difference left unexplained, and escalate repeated differences at the same point or involving the same person.'
  },
  monitor: {
    id: 'monitor', name: 'Monitor for exceptions', pattern: 'Data is reviewed on a set cycle for defined patterns, by someone independent of the activity, and each exception is followed up.',
    activities: (s) => [
      `Define the patterns to look for in ${s.units} and the report, query or alert that finds them.`,
      `Name who reviews the output ${s.cycle} and who follows up each exception, independently of the people whose activity is reviewed.`,
      'Run the review over the last twelve months of data, and follow up what it finds.'
    ],
    record: rec,
    measure: (s) => `The review of ${s.units} ran ${s.cycle} throughout the period, and every exception it raised ${s.ok}.`,
    onFailure: () => 'Where an exception proves to be fraud or error, follow the response procedure, correct the control that allowed it and add the pattern to the review.'
  },
  count: {
    id: 'count', name: 'Independent physical verification', pattern: 'What the records say exists is checked physically by people independent of its custody.',
    activities: (s) => [
      `Set the plan: which ${s.units} are covered, how often, who carries out the check and who observes it.`,
      'Prepare check sheets that do not show the recorded position, and compare the results with the record only after the check.',
      'Investigate the differences from the first check before any record is adjusted.'
    ],
    record: rec,
    measure: (s) => `Every check planned for the period was carried out ${s.ok}, and every difference was explained before a record was adjusted.`,
    onFailure: () => 'Recheck and investigate any unexplained difference, and review access to the items concerned.'
  },
  segregate: {
    id: 'segregate', name: 'Separate duties', pattern: 'No one person can carry out every step that would let them commit and conceal the scheme.',
    activities: (s) => [
      `List who holds the duties concerned, and remove any combination that lets one person ${s.risk ?? 'complete the process alone'}.`,
      s.where ? `Set ${s.where} so that the combination cannot be granted again without recorded approval.` : 'Record the separation in role descriptions, and approve any exception in writing.',
      'Review the combinations at least once a year and whenever roles change, including temporary cover.'
    ],
    record: rec,
    measure: (s) => `The review for the period found no one able to ${s.risk ?? 'complete the process alone'}, ${s.ok}.`,
    onFailure: (s) => `Remove the combination, review the ${s.units} handled while it existed, and record the outcome.`
  },
  protect: {
    id: 'protect', name: 'Technical protection in place everywhere it is needed', pattern: 'A security or system setting is applied to every item in scope, and coverage is checked.',
    activities: (s) => [
      `List every ${s.unit} in scope and how it is set today.`,
      `Apply the setting to each, starting with ${s.first ?? `the ${s.units} that can move money or change master data`}, and record any approved exception.`,
      `Produce the ${s.record} ${s.cycle}, and follow up any gap.`
    ],
    record: rec,
    measure: (s) => `At the end of the period, the ${s.record} shows ${s.ok}, and any exception is approved and recorded.`,
    onFailure: () => 'Close the gap, check activity for the period it was open, and treat any unexplained activity as a security incident.'
  },
  rule: {
    id: 'rule', name: 'An organisation-wide rule that people follow', pattern: 'A short written rule that applies to everyone, including executives, is briefed and tested.',
    activities: (s) => [
      `Write the rule and have it approved by ${s.approver ?? 'the chief executive'}.`,
      `Brief ${s.units}, including executives and their assistants, and record who has been briefed.`,
      'Test the rule at least once a year, for example with a simulated request, and act on the result.'
    ],
    record: rec,
    measure: (s) => `All ${s.units} were briefed by the end of the period, and the most recent test found the rule followed ${s.ok}.`,
    onFailure: () => 'Where the rule was not followed, establish why, brief the people concerned again and check whether any payment or disclosure resulted.'
  },
  procedure: {
    id: 'procedure', name: 'A procedure ready to use', pattern: 'A written procedure names who decides and who acts, and is tested or used.',
    activities: (s) => [
      'Write the procedure, naming who decides and who acts at each step.',
      'Brief the people with a role in it, and keep the contact details it relies on current.',
      `Test it ${s.cycle} with an exercise or a real case, and record what changed as a result.`
    ],
    record: rec,
    measure: (s) => `In the period, ${s.ok}.`,
    onFailure: () => 'Where the procedure was not followed or did not work, record why, correct it and brief the people concerned.'
  },
  assessment: {
    id: 'assessment', name: 'A requirement of the fraud risk assessment', pattern: 'The fraud risk assessment is required to cover a specific question or to take a specific form.',
    activities: (s) => [
      `Add ${s.req ?? 'the requirement'} to the fraud risk assessment method and to the template it uses.`,
      `Apply it at the next assessment or update, starting with ${s.first ?? 'the processes that move money or stock'}.`,
      'Have the person who signs off the assessment confirm that it meets the requirement.'
    ],
    record: rec,
    measure: (s) => `The assessment current at the end of the period shows ${s.ok}.`,
    onFailure: () => 'Record any part of the assessment that does not meet the requirement as an open item with an owner, and complete it before the next sign-off.'
  },
  register: {
    id: 'register', name: 'A maintained list or record', pattern: 'A list or record that other controls rely on is kept complete and current.',
    activities: (s) => [
      `Create the ${s.record} with the fields it needs, and name who maintains it.`,
      'Populate it from current information, and resolve gaps with the people responsible.',
      `Review it ${s.cycle}${s.trigger ? ` and whenever ${s.trigger}` : ''}.`
    ],
    record: rec,
    measure: (s) => `The ${s.record} was reviewed as planned in the period, and ${s.ok}.`,
    onFailure: (s) => `Bring the ${s.record} up to date, and check whether anything was missed while it was out of date.`
  },
  assurance: {
    id: 'assurance', name: 'Independent review', pattern: 'An area is reviewed by someone independent of management, and the findings are tracked to closure.',
    activities: (s) => [
      `Include ${s.units} in the internal audit plan or appoint an external reviewer, with a scope that covers the fraud schemes concerned.`,
      'Agree with the reviewer what will be tested and how findings will be reported.',
      `Track each finding to closure, and report progress to ${s.approver ?? 'the oversight body'}.`
    ],
    record: rec,
    measure: (s) => `A review of ${s.units} was completed ${s.cycle}, and ${s.ok}.`,
    onFailure: () => 'Where findings are overdue, escalate them to the oversight body with the reason and a new date.'
  },
  training: {
    id: 'training', name: 'Training that reaches everyone it should', pattern: 'Specific people complete specific content at a set point, and completion is tracked.',
    activities: (s) => [
      `Set the content and who must complete it, using current schemes relevant to their work.`,
      `Track completion ${s.cycle}, and follow up anyone who has not completed it.`,
      'Refresh the content each year, and test understanding where the risk is highest.'
    ],
    record: rec,
    measure: (s) => `Every ${s.unit} completed the training ${s.ok}, and completion is recorded.`,
    onFailure: () => 'Follow up incomplete training with the person\'s manager, and restrict access to sensitive duties where the risk requires it.'
  },
  people: {
    id: 'people', name: 'A people practice applied consistently', pattern: 'A requirement that applies to defined people is applied to all of them, and exceptions are approved.',
    activities: (s) => [
      `Set the requirement in writing, including which ${s.units} it applies to and who may approve an exception.`,
      `Apply it ${s.cycle}, and record each case and each approved exception.`,
      'Report coverage and exceptions to the accountable executive at least once a year.'
    ],
    record: rec,
    measure: (s) => `Every ${s.unit} in scope ${s.ok}, or has an approved exception.`,
    onFailure: () => 'Where the requirement is not met, record why, agree a corrective action with a date and report it to the accountable executive.'
  }
};
