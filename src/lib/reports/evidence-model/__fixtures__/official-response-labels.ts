import type { OfficialResponseLabel } from '../../response-labels';

/** Credential-free copy of the six official rows verified by Checkpoint A. */
export const officialResponseLabelsFixture: OfficialResponseLabel[] = [
  { responseValue: 0, label: 'Not in place', operationalMeaning: 'No control exists.', normalisedScore: 0, displayOrder: 1 },
  { responseValue: 1, label: 'Initial / ad hoc', operationalMeaning: 'Exists only informally or inconsistently.', normalisedScore: 20, displayOrder: 2 },
  { responseValue: 2, label: 'Partially designed', operationalMeaning: 'Partially designed but not fully implemented.', normalisedScore: 40, displayOrder: 3 },
  { responseValue: 3, label: 'Implemented', operationalMeaning: 'Implemented and in use.', normalisedScore: 60, displayOrder: 4 },
  { responseValue: 4, label: 'Consistently operating', operationalMeaning: 'Operating consistently in practice.', normalisedScore: 80, displayOrder: 5 },
  { responseValue: 5, label: 'Embedded and improved', operationalMeaning: 'Embedded and subject to continuous improvement.', normalisedScore: 100, displayOrder: 6 }
];
