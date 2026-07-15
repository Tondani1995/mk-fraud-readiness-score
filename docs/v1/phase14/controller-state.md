# Controller State

- Branch: `phase14/autonomous-premium-report-engine`
- Production base: `194c9c7729450719a7b4ad1fb8a6628a15d7ab5a`
- Phase 14 migrations: production has the early disabled foundation; this work
  has not applied the security closure or fourth/fifth/sixth controls
- Database security gate: required version 1, satisfied version 0, unsatisfied
- Auto fulfilment: disabled
- AI narrative: disabled
- Auto email: disabled
- Manual delivery: disabled
- Customer email dispatch: implemented as an inert authorization/outbox foundation; not enabled
- Provider webhook mutation: implemented but blocked by the unsatisfied gate
- AAL2: required by database RPCs for privileged human actions
- R50,000 automation: prohibited
- Scoring and methodology changes: none
