# Release decision

**Decision: not releasable. Candidate ready for MK review on the fictional local harness.**

The integrated review track works end to end through the real interface: interview to the 95-screen limit, unscored Snapshot, owner follow-up, reviewer evidence and conclusions, and management actions, with the approved MK brand and question flow. It cannot be released because it has no durable persistence or authenticated access, the environment it would run in is not isolated, and several decisions that belong to MK are open. Nothing was merged, pushed or deployed; no payment, communication or customer record was touched.

## Blocking items

| # | Item | Why it blocks | Owner |
|---|---|---|---|
| B1 | Durable persistence | The file harness is a test fixture. A production store needs the same append-only, sequence-checked, idempotent contract (`DATA-CONTRACT.md`) on an isolated database, with backup and retention. | Engineering, after B2 |
| B2 | Staging isolation | Preview and production share one Supabase project; `customer_start` activation is enabled for both. No isolated target exists to test persistence or payments against. Owner-reserved. | MK |
| B3 | Authenticated access | Links stand in for sign-in. Respondent, owner, management and MK reviewer access needs authentication, invitations for owners, and reviewer access only under an engagement. | MK and engineering |
| B4 | Method approval | Scenario tiers, answer mappings, exclusions, owner functions, completion conditions and legal wording are proposals (`contract.ts` approval statement). | MK |
| B5 | Commercial path | Paid reports cannot be produced from a review; see `COMMERCIAL-RECONCILIATION.md` items 1 to 9. | MK |
| B6 | Terms and privacy | Written for a single-respondent scored assessment. | MK legal |
| B7 | Copy approval | All review-track copy (`src/lib/website/review-track-copy.ts` and the review components) is unapproved. | MK |
| B8 | Assistive technology and physical devices | Screen-reader (VoiceOver with Safari, NVDA with Firefox), magnification and physical phone sessions were not run. | MK, with testers |
| B9 | Respondent comprehension | No usability session has been run for either the parked or the candidate experience. | MK |

## Decisions MK must take

1. Scoring policy for the legacy track and the treatment of issued records (`LEGACY-UNKNOWN-SCORING.md`). Owner-reserved; current behaviour preserved.
2. Staging isolation and the production access model (B2, B3).
3. Whether the review replaces the scored assessment for new visitors, and when.
4. The commercial options in `COMMERCIAL-RECONCILIATION.md`, in particular how review customers reach a paid product.
5. Whether owner follow-up is free and how owners are invited.
6. Whether the anchored answer scale keeps its ascending bar glyph in the review track.
7. Approval of the method proposals and of all review-track copy.
8. Whether to apply the same end-of-entry fix to the legacy assessment, whose shared motion rules are protected (see `CHANGE-LOG.md`).
9. Whether the review laboratories and preview-only QA routes leave the production build before release, and who reviews the QA recovery routes that use the service-role client on preview deployments.

## Limitations of this candidate

- **Fictional harness.** Sessions are JSON files on the server's disk. This is not durable persistence, and the role links are not authentication. A role switch on the links page is not access control.
- **One server process.** Writes are serialised per session in memory and checked by sequence on disk; this has not been tested with several server instances.
- **Postgres recovery test not run.** `scripts/recovery-postgres-tests.mjs` needs an embedded PostgreSQL that cannot initialise in this environment (missing `libicuuc.so.60`, and it refuses to run as root). It fails the same way on the parked baseline. The other 30 parked suites pass on both trees.
- **Local performance only.** All timings come from a local production build on localhost with headless Chromium; they do not describe a deployed network path or a mid-range phone.
- **Automated accessibility only.** axe-core rules on initial page states, plus keyboard, focus, zoom-equivalent and reduced-motion checks in the journeys. Interactive states such as the open reviewer form were exercised but not scanned.
- **Multi-select edge.** A multi-select practice answered with every option is checked by contract test C-08 but was not reached through the page.
- **Area introductions** use the question bank's module names, which read as internal labels in places.
- **Homepage companion at 700px height** falls back to one column at 1440x700 and 1920x700, as in the baseline.
- **Review Snapshot and management view are text-dense**; the wording needs MK approval and then editorial and visual compression.
- **Engine fixes arrive as new builds.** The engine is vendored byte-identical; any change needs a new build, a new hash and a contract version.

## What would make it releasable

Resolve B2 and B3 first, then implement a store behind the existing `ReviewStore` interface on the isolated environment and rerun the full verification against it, followed by the assistive-technology, device and comprehension sessions, with MK's method, copy, commercial and legal approvals.
