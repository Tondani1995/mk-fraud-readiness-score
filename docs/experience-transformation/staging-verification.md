# Updated staging verification gate — 24 October 2026

**NO-GO for production.** This work has not merged, deployed or exercised external transactions. Follow the complete procedures and safety prerequisites in `../product-refinement/staging-verification-matrix.md`; every real-application row remains outstanding. Local fixture tests are supporting evidence, not substitutes for those rows.

The checkout has no `.env.local`. No application credentials or bound isolated preview were supplied. Previously inspected project metadata included both preview and production policies in the same project; its name does not establish isolation. Do not copy credentials from another checkout, change activation policy, or use production to unblock verification.

## Additional executable checks

| ID | Procedure | Required evidence | Present result |
|---|---|---|---|
| committed-start | After normal legal/profile gates, create one synthetic assessment. Confirm the response contains the committed initial state. Inspect the private history URL, reload and resume in a fresh context. Disable analytics and repeat. | One draft, legal versions/consent and hashed token; initial graph/path identity matches a fresh GET; no duplicate creation; p50/p95/worst Begin-to-usable question over at least 30 permitted starts. Numeric Server-Timing only. | Source and local contracts pass; real creation and database p95 **unverified**. |
| state-transfer | Save against the same graph using compact-v1/fingerprint headers; repeat without headers and with a mismatched fingerprint. | Identical graph/path IDs, answers, unknown/zero values, domain boundaries, current next node and save sequence across full/compact; mismatch falls back to full. Redacted byte counts and HAR. | Five deterministic fixture parity cases pass; real RPC round trip outstanding. |
| pending-recovery | On mobile and desktop, fail a save, try Back, retry; force stale sequence in another tab, then reload. Attempt rapid choices during both write and reload. | Selected local value retained; all options restored on failure; Back/input locked until safe; one mutation; no unsaved delta leaks into another question; correct current version after conflict. | Browser HTTP fixture checks; real multi-tab persistence outstanding. |
| scope-recalculation | Answer affected controls, go Back to a gateway, change scope, cancel and repeat/confirm. | Existing preview/confirmation/invalidation history and server-selected next node; no browser-inferred branching. | Pure gateway engine and HTTP fixture check; DB invalidation history outstanding. |
| completed-resume | Complete/scored assessment, retain original private Snapshot URL, reopen resume link, refresh during generation, retry a failed generation. | Safe private result recovery without rescoring a locked run or duplicate notification. Expired/wrong tokens denied. | **Known existing blocker:** controller can show “preparing result” without a URL; submit rejects scored/locked assessment. Requires a reviewed authenticated result-recovery path and staging proof. |
| performance-device | Repeat documented benchmark and actual authenticated flow on a representative physical phone/desktop, ordinary mobile network and slower connection. Inspect service access/load/commit/projection timings. | At least 30 transitions/profile; input feedback <100ms, next usable p95<1000ms; frame trace, long tasks, failures, navigation/keyboard and network timing. Real creation separately sampled. | Desktop-host synthetic gzip HTTP measurements only. Device CPU, initial bundle/route cold load and SQL latency not certified. |
| assistive-motion | VoiceOver/Safari and NVDA/Firefox or approved equivalents; system reduced motion; touch zoom; mobile virtual keyboard; all six widths. | Native radio name/meaning, live save status, focus after advance/Back/modal, no lost/trapped focus, meaning accessible before selection, reduced motion without timed dependency. | Keyboard/browser/manual layout and axe evidence; physical keyboard/AT/system-preference checks outstanding. |

Retain the existing fourteen rows for identity, creation, branching, save/resume, completion, private result, both orders, negative and confirmed test payments, report generation, private delivery, recovery and mobile/assistive checks. Preserve catalogue prices and entitlements. Payment mode must be explicitly non-chargeable (`double` where supported); email `test` can still dispatch, so block egress and use an approved sink. Verify worker/AI/storage/callback isolation, not only missing API keys.

The candidate metadata/engine discrepancy for unknown-score denominator treatment remains an owner decision. This implementation changes no methodology or calculator.

Run the read-only evidence gate:

```sh
node scripts/staging-product-gate.mjs /absolute/path/to/staging-evidence.json
```

Extend the existing manifest with the seven IDs above. All evidence must identify the exact tested deployment SHA and existing files. The checker validates manifest completeness, not evidence truth; human review is mandatory. No credentials, responses, private tokens or customer identifiers belong in published timing evidence.
