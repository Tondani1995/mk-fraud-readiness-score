# Response to the review of the corrective pass: local reliability correction (14 November 2026)

> A later independent review (14 November) found two claims here overstated: the US$ campaign figure is an estimated reservation, not a guaranteed ceiling, and the deadline is not enforced uniformly across storage and rendering. The owner accepted both as limitations for the restricted test. `RELEASE-READINESS.md`, section 6, states them as they are.

Base: `4016c0de` on `review/mk-integrated-readiness`, with the corrective pass still uncommitted. Nothing was committed, pushed or deployed; no hosted database was changed; no paid model call, payment, production probe or communication was made. The new migration was applied only to a throwaway local PostgreSQL 17. The retained AI manuscripts were read from the isolated test database through its read-only report-run function.

Evidence is labelled by kind throughout:
- **local double**: deterministic writer and in-memory store, real analysis, validator, composer, renderer and workbook;
- **local SQL**: the migration on a throwaway local PostgreSQL;
- **unchanged manuscript**: original AI text from the deployed pipeline, recomposed without any model call;
- **hosted**: none in this pass.

## Separately reviewable changes

| Group | Files |
|---|---|
| Accounting and audit | `supabase/migrations/20261113150000_readiness_review_generation_ledger.sql` (new), `src/lib/reports/revised/live/accounting.ts` (new), `live/checkpoints.ts` (new), `live/produce.ts`, `live/manual-generation.ts` |
| Publication and deadline | `src/lib/reports/revised/manuscript/layout.ts`, `manuscript/render.ts`, `live/produce.ts` (`publicationGates`) |
| Reporting and validation | `manuscript/manuscript.ts` (entitlement), `position.ts` (wording), version identifiers in `evidence-model.ts`, `fact-pack.ts`, `story-plan.ts`, `compose.ts`, `workbook-bible.ts`, `mk-publication.ts` |
| Security containment | `src/lib/auth/admin-surface.ts`, `src/middleware.ts`; also as a standalone patch against production, `security-containment-74b16d35.patch` |
| Tests | `scripts/revised-reports/b5-fulfilment-tests.mjs` (rewritten), `generation-ledger-sql-tests.mjs`, `entitlement-tests.mjs`, `publication-gate-tests.mjs`, `original-manuscript-layout.mjs` (new), `scripts/admin-surface-gate-tests.mjs` (updated) |

No pinned file changed; the integrity guard passes with its existing four exceptions.

## F1: unavailable call history permitted new paid work (high)

**Confirmed.** `priorAttempts` turned an error, a thrown request or malformed data into zero calls, reset at each successful report, parsed free text, and missed rendering failures.

**Correction.**
- `priorAttempts` is removed. AI calls are now counted in a durable ledger, `readiness_review.generation_calls`.
- Each call is reserved through `review_reserve_generation_call` **before** it is dispatched, and counted from then on whatever happens. It is settled afterwards as succeeded, failed or indeterminate. A failed or indeterminate call, or one never settled after a crash or lost response, stays charged at its worst-case cost.
- The limits are enforced in the database, under a lock on the campaign row and an advisory lock on the order:
  - **Order:** a lifetime ceiling covering every attempt and every report version, at most the approved bound of 6. `MK_REVISED_ORDER_CALL_CEILING` may lower it but never raise it, and an unreadable value means 1.
  - **Campaign:** an owner-approved budget (`generation_budgets`) of calls and US dollars. Without one, no paid call is possible. Cost is reserved in advance from list prices, an input estimate and a cap on output tokens (`maxOutputTokens` now bounds every call). The reservation is replaced by the actual cost once usage is known.
- Unreachable, failing or malformed ledger answers refuse the call (`accounting_unavailable`). Unreadable or malformed checkpoint history refuses the whole request before any reservation (`history_unavailable`).
- **Scope, made explicit:** the six-call ceiling is per order over its lifetime. It no longer resets after a successful report.

**Evidence.**

| Suite | Kind | Result |
|---|---|---|
| Ledger SQL suite (GL-01 to GL-08) | local SQL | 8 of 8. No budget means no reservation; lifetime ceiling clamped to 6; cost charged at worst case until settled, with a known lower cost freeing headroom and an indeterminate call staying at worst case; call count enforced; **six concurrent requests for the last unit: exactly one wins**; append-only guards; service role only |
| Fulfilment suite, history and accounting (GF-04 to GF-08, GF-12 to GF-15) | local double | Unavailable, thrown, malformed and incomplete history refused with no reservation and no call; ledger error, throw and malformed refused with no call; no or unapproved campaign refused; provider failure kept at worst case; timeout settled as indeterminate; a render failure's call is in the ledger; the allowance does not reset after a successful report; cost exhaustion refused before the call; a failed settlement leaves the call counted |

The review's `priorAttempts` probes no longer apply because the function is gone. Each of its cases is covered by a named test above.

## F2: success returned without the audit package (high)

**Confirmed.** The success record swallowed write errors.

**Correction.** `generation_checkpoints` (append-only, idempotent per attempt and stage) holds three kinds of record:

1. **drafted**: a draft awaiting repair, so a retry repairs it rather than writing it again.
2. **validated**: the validated manuscript with its full audit package. That is: the manuscript with its paragraph references, Fact Pack, Story Plan, writer brief, validation, models, usage, call ids, versions and bound input identity. It is written before anything is composed, stored or finalised. If it cannot be written after three bounded attempts, no PDF is stored and nothing is finalised (`audit_unavailable`, calls already counted).
3. **linked**: the link to the finalised report. If this write fails after the report is committed, the report is not undone or regenerated. Success is returned with `auditStatus: 'pending_link'` and an operator event (`revised_audit_link_pending`). The next generation request for the order, or `reconcileAudits`, links it from the attempt's `output_report_id` with no AI call.

A lost response is repaired by the retry: a duplicate with the same payload digest is accepted, and a different payload is refused. Resume points now come from these records, not from parsing failure text.

**Evidence (local double, plus local SQL GL-07).**
- **GF-01:** the package has all eleven parts and the report is linked.
- **GF-16:** write denied, so no upload and no finalisation.
- **GF-17:** lost response, so one stored package and one report.
- **GF-18:** link denied, so the result is pending and never a second report; recovery links it with no AI call.
- **GF-19:** a repeated request on the same attempt cannot produce a second report.
- **GF-11:** storage failure, then a retry with no AI call.

**Limitation:** the recovery path is a library function and the automatic run at the start of the next request. A console button would be a change to pinned admin routes.

## F3: the entitlement rule rejected legitimate control advice (medium)

**Confirmed.**

**Correction.** The vocabulary ban is replaced by `ESSENTIAL_ARTEFACT_PROMISES`: six patterns for a promise of an artefact Essential does not supply. They are: an accompanying or supporting workbook, register or appendix; "the workbook"; "see the spreadsheet" or "in the full register"; anything "supplied with this report"; "MK's workbook"; and "the wider register". Section markers and exhibits are skipped. The PDF-only entitlement is unchanged, and so is the Bible/product conflict (DR-17).

**Evidence.**
- **Entitlement suite (local double): 4 of 4.**
  - All 9 artefact promises are blocked.
  - 7 legitimate record sentences are allowed. They include both of the review's sentences, "excel" used as a verb, and "recorded in the risk register".
  - Comprehensive is unaffected.
- **The review's own entitlement probe**, rerun unchanged against this code, now passes both sentences.
- **Excellence:** gate G01 still fails for the four 12 November prototype Essentials (88 of 92). Every flagged line is a genuine promise, for example "The supporting workbook carries the complete registers…".

## F4: host gate is containment, not person-bound authorisation (high before release)

**Agreed; nothing here closes person-bound access** (DR-08 remains open and unimplemented).

**Correction.** The `.vercel.app` suffix is no longer trusted. The console answers only on:
- the deployment's own Vercel-generated hosts (`VERCEL_URL`, `VERCEL_BRANCH_URL`, and only if they are `*.vercel.app`);
- hosts listed exactly in `MK_ADMIN_ALLOWED_HOSTS`;
- local development off Vercel.

`MK_ADMIN_TRUST_DEPLOYMENT_HOSTS=0` withdraws the deployment hosts. The protection-scope assumption is written in the source and the security document.

The containment is also delivered as a standalone patch against the production baseline (`security-containment-74b16d35.patch`). It applies cleanly to `74b16d35`, and with it applied the gate tests (7 of 7) and TypeScript pass on production's own source, with all 45 console files there gated. Deploying it does not require deploying the revised product.

**Evidence:** gate suite **7 of 7** (local).
- An unrelated `*.vercel.app` host is refused, both by the helper and through the middleware.
- A custom domain placed in `VERCEL_URL` is not trusted.
- With nothing configured on Vercel, the console answers nowhere.

## F5: request budgeting is not durable fulfilment (medium)

**Agreed; durable background fulfilment is not implemented** (DR-14). Generation remains synchronous in the operator's request.

**Correction:** the deadline now covers the whole request, not only provider calls. Each stage starts only if the time it needs remains, so the attempt stops cleanly before a step rather than being killed during it:

| Stage | Rule |
|---|---|
| Paid call | Starts only if it leaves 75 s for everything after it, and is aborted at its share of the time |
| Layout | Starts only with 45 s left; each render pass starts only with 10 s left and is given only the remaining time (the renderer's own timeouts now follow it) |
| Storage | Starts only with 20 s left |

Every stop leaves a checkpoint, so the retry resumes without repeating paid work.

**Evidence (local double).**
- **GF-10:** a slow draft leaves no time for the repair; the retry repairs it with one call (two in the ledger, never three).
- **PG-03 and PG-04:** the layout stops at its deadline; when that happens during page-number passes, the result is held.

There is no hosted timing evidence.

## F6: layout failure did not hold the report (medium)

**Confirmed.**

**Correction.** `publicationGates` defines three required gates:

| Gate | Requirement |
|---|---|
| PG-HEADINGS | Every section and unit heading is found in the final PDF |
| PG-CONVERGED | The page map is stable within the passes |
| PG-CONTENTS | The contents page numbers match the final PDF, where the product has a contents page |

A report that fails any of them is held (`publication_held`): nothing is stored, an operator event is recorded, and the retry recomposes the stored manuscript without an AI call. Near-empty pages and moved headings are advisory: they are recorded and returned with the result, never described as verified. Layout records the map it actually printed.

**Evidence.**
- **Publication-gate suite (local double, real composer and gate function): 6 of 6.** A stable document passes; a missing heading is held; a page map that never converges exhausts its passes and is held; the deadline before any PDF is a render failure; the deadline during the number passes is held; advisories are recorded.
- **GF-22:** a held PDF is not stored, and the retry recomposes with no AI call.

**Matched evidence on unchanged original-length manuscripts** (`original-manuscript-layout.mjs`, kind: unchanged manuscript). Each is the exact text the deployed pipeline produced and kept. "Before" is the single-pass composition at `4016c0de`, with the Fact Pack and Story Plan that code builds for the bound Kestrel input. "After" is the corrected layout with the same three inputs.

| Run | Product, words | Pages | Near-empty pages | Contents numbers | Stranded headings | Gates |
|---|---|---|---|---|---|---|
| `8d6f64e3` | Kestrel Comprehensive, 4,818 (the deployed run's final text) | 31 → 31 | 0 → 0 | no contents page | 0 → 0 | pass |
| `896b8e6c` | Kestrel Essential, 3,133 | 21 → 19 | 2 → 0 (pp. 3, 19) | absent → present | 0 → 0 | pass |
| `ff637bbf` | Kestrel Essential, 2,632 | 20 → 19 | 1 → 0 (p. 3) | absent → present | 0 → 0 | pass |

**Limitations.**
- All three manuscripts were **rejected** by the validator: they are layout evidence only.
- The three **successful** deployed reports (Kestrel Essential, Marula Essential, Marula Comprehensive) kept no manuscript, so they cannot be reconstructed faithfully. The Marula Comprehensive's reported orphan heading (p. 20) and sparse page (p. 31) therefore cannot be re-tested on its own text.
- Four other retained Kestrel drafts contain unknown slots or broken units, so they would measure the manuscript rather than the layout; they were excluded.
- No shorter stand-in writing was substituted.

## Other matters

| Item | Response |
|---|---|
| "Stand without question" | Replaced. The PDF, workbook and position panel now read: "every core control in place for 90 (for 4 of these the answers raise a question or cannot both be right; for the other 86 the answers compared under the reviewed rules show no conflict, though 15 of them have a related practice reported weaker, which does not establish that the controls operate)". The test asserts the old phrase is gone |
| Kestrel 16 questions + 4 dependent rows; Marula reconciliation | Unchanged and still tested (RC-02, RC-03, RC-06) |
| Versioning | Report model `0.4.0`, Fact Pack `0.2`, Story Plan `0.2`, validator `0.2`, composer `0.2`, workbook `0.2`, publication `1.1`, layout `1.1`, pipeline `0.2`, accounting `1.0`, checkpoints `1.0`. All are recorded in each audit package and provenance. Bound inputs, scoring, branching and relationship semantics are unchanged |
| Overall live-test ceiling | Enforced by the campaign budget in the ledger, not by the per-order rule. See `RELEASE-READINESS.md`, section 6, including what happens when usage or cost cannot be read |
| Snapshot common account | Still unfinished; recorded as outstanding |
| 83/73 package sweep | From the previous pass and not rerun here. The candidate does have failing checks: the 73 package-script failures (identical on `4016c0de`) and excellence G01 (4) |
