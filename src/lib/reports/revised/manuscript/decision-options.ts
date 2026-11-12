/**
 * Draft leadership decision options (Reporting Bible v1.1, section 13.6): at least three options for each decision
 * the revised model raises, with effort, benefit and trade-off, and MK's recommended route with its rationale.
 *
 * FICTIONAL PROTOTYPE. MK advisory content awaiting MK approval. The writer explains these options and may not add
 * to them. Options are generic to the decision; none names a cost in Rand, a supplier or a person.
 */
export const DECISION_OPTIONS_VERSION = 'decision-options-0.1';
export type DecisionOption = { label: string; description: string; effort: string; benefit: string; tradeOff: string };
export type DecisionOptionSet = { options: DecisionOption[]; recommended: string; rationale: string };

export const DECISION_OPTIONS: Record<string, DecisionOptionSet> = {
  'settle-answers': {
    options: [
      { label: 'Process owners confirm and correct', description: 'Each process owner establishes how the process actually runs, records the answer and corrects the assessment where it was wrong.', effort: 'Low: a few hours per process owner.', benefit: 'Fast, and keeps ownership with the people who run the processes.', tradeOff: 'Relies on the same people whose answers are in question.' },
      { label: 'Internal walkthrough by someone independent of the process', description: 'A manager from another area, or internal audit where it exists, walks through each process with its owner and records what was seen.', effort: 'Moderate: a day or two per process.', benefit: 'An answer that does not rest only on the owner\'s view.', tradeOff: 'Takes longer and draws on people outside the process.' },
      { label: 'Independent validation through MK Advisory', description: 'MK examines the records and walks through the processes concerned, as a separately scoped engagement.', effort: 'Higher: a scoped engagement.', benefit: 'An independent view of whether the controls operate, which the automated assessment cannot give.', tradeOff: 'Cost and time; worthwhile where the answers concern controls the organisation relies on heavily.' }
    ],
    recommended: 'Process owners confirm and correct, with an independent walkthrough for any answer that is still disputed.',
    rationale: 'The answers concern how the organisation\'s own processes run, which its owners can establish quickly; an independent view is needed only where that does not settle the question.'
  },
  outstanding: {
    options: [
      { label: 'Assign each question to a named person', description: 'Each outstanding question is assigned to one named person with a date for an answer.', effort: 'Low.', benefit: 'Closes most gaps quickly and shows who holds the knowledge.', tradeOff: 'Some questions may reveal that nobody holds the answer, which is itself a finding.' },
      { label: 'Record as open items and proceed', description: 'Questions that cannot be answered are recorded as open items with an owner, and the work proceeds on what is known.', effort: 'Low.', benefit: 'The programme is not delayed.', tradeOff: 'Decisions on the scenarios affected rest on incomplete information.' },
      { label: 'Establish the answer by inspecting the process', description: 'Where nobody holds the answer, the owner inspects the process and records what is found.', effort: 'Moderate.', benefit: 'Converts an unknown into a fact.', tradeOff: 'Time from people who run the process.' }
    ],
    recommended: 'Assign each question to a named person, and record any that cannot be answered as an open item.',
    rationale: 'An answer, or a recorded open item with an owner, is what allows the scenarios the questions affect to be decided.'
  },
  'name-owners': {
    options: [
      { label: 'One accountable executive per area', description: 'Each area with open scenarios has one executive accountable for its controls, as the method suggests.', effort: 'Low to decide; ongoing for each executive.', benefit: 'Clear ownership that matches how the organisation is run.', tradeOff: 'Requirements that span areas, such as how changes to payment details are verified, need coordination across owners.' },
      { label: 'One executive for the whole programme', description: 'A single executive owns every open scenario and directs area leads.', effort: 'Concentrated on one person.', benefit: 'One point of accountability and a consistent approach.', tradeOff: 'Area executives may treat the work as someone else\'s.' },
      { label: 'Area owners with a programme coordinator', description: 'Area executives own their scenarios, and the fraud risk lead coordinates requirements that span areas and reports progress.', effort: 'Moderate.', benefit: 'Ownership stays in the areas while cross-area requirements are handled once.', tradeOff: 'Needs a coordinator with enough standing to hold owners to account.' }
    ],
    recommended: 'Area owners with a programme coordinator.',
    rationale: 'The open scenarios sit in the operating areas, so ownership belongs there; several of the requirements span areas and are best designed once.'
  },
  'order-work': {
    options: [
      { label: 'Explicit factors, settled facts first', description: 'Answers to settle come first; then each open scenario is weighed on how far its control is reported in place, whether money, pay, cash or stock can leave without it, how much of the activity exists, and what management already knows of incidents.', effort: 'Moderate: a structured management session.', benefit: 'A defensible order that management can explain to the oversight body.', tradeOff: 'Depends on information management must supply, such as volumes and known incidents.' },
      { label: 'Area by area', description: 'One area is completed before the next begins.', effort: 'Low to plan.', benefit: 'Simple to manage and report.', tradeOff: 'Requirements that span areas are designed several times, and exposure in later areas waits.' },
      { label: 'Cross-area requirements first', description: 'Requirements that span areas, such as verifying changes to payment details, are designed once and applied everywhere, before area-specific controls.', effort: 'Moderate.', benefit: 'One design closes several scenarios at once.', tradeOff: 'Area-specific exposures wait until the shared designs are complete.' }
    ],
    recommended: 'Explicit factors, settled facts first, applying cross-area requirements once where they arise.',
    rationale: 'An order of work should rest on facts management can state and defend to its oversight body, and designing shared requirements once avoids building the same control several times.'
  },
  'report-status': {
    options: [
      { label: 'At each meeting of the oversight body', description: 'A one-page status per open scenario at each meeting until it is closed, deferred with a reason or accepted.', effort: 'Low.', benefit: 'Keeps the scenarios visible to the people who can remove blockers.', tradeOff: 'Adds to the oversight body\'s agenda.' },
      { label: 'Quarterly summary', description: 'A consolidated summary each quarter.', effort: 'Low.', benefit: 'Less frequent demand on the oversight body.', tradeOff: 'Blockers may wait a quarter before they are seen.' },
      { label: 'Exceptions only', description: 'Only scenarios that are late or blocked are reported.', effort: 'Lowest.', benefit: 'Focuses attention on problems.', tradeOff: 'The oversight body does not see progress, and a scenario can drift without being reported as an exception.' }
    ],
    recommended: 'At each meeting of the oversight body, until each open scenario is closed, deferred with a reason or accepted.',
    rationale: 'Regular reporting is what keeps a programme moving once the first controls are in place.'
  }
};

export function decisionTypeOf(text: string): string {
  if (/settled|cannot both be right/i.test(text)) return 'settle-answers';
  if (/outstanding questions/i.test(text)) return 'outstanding';
  if (/accountable executive/i.test(text)) return 'name-owners';
  if (/order in which/i.test(text)) return 'order-work';
  if (/receive the status/i.test(text)) return 'report-status';
  return 'other';
}
