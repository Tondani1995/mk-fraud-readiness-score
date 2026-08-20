# RC1 closure evidence — 2026-08-03

Status: **blocked at runbook §14 (freeze release, owner-only)**. Everything not gated by that
control is complete. No secrets, tokens, customer identifiers or report prose appear here.

## Branch and deployment

| Item | Value |
| --- | --- |
| Branch | `fix/rc1-control-plane-profile-read` |
| Head at capture | `2c96fd2` |
| Session start | `b61e274` |
| PR | #50 (open, draft, base `fix/rc1-service-role-privilege-contract`) |
| Preview | `mk-fraud-platform-git-fix-rc1-control-81cf3f-tondanis-projects.vercel.app` |
| Production `main` | `fdf4d55b10b08a7fea05000feb6970860f3bb694` — untouched |

## Commits added

| SHA | Subject |
| --- | --- |
| `a4c6319` | An ordinary adjective is not a maturity-band claim |
| `9f5d694` | Re-point the synthetic notification contract at the code it describes |
| `d35706b` | Re-pin the two control-plane storage call sites after a line shift |
| `08eb8af` | A Structured band may not claim an operating state over an absent control |
| `8ec7fc1` | Clear the one blocking M11 advisory (brace-expansion 5.0.8 → 5.0.9) |
| `f29c428` | Register migration 68 in the four ledgers that enumerate the set |
| `2c96fd2` | Register migration 68 in the production postflight |

## Migrations

Repository 68 files; staging ledger 68 rows. One migration added this session:

- repository `20260803210000_rc1_structured_band_operating_state_overclaim.sql`
- staging version `20260803182130`, name `rc1_structured_band_operating_state_overclaim`
- report copy only — no schema, policy or grant change; idempotent `replace()` scoped by
  `block_type` and `maturity_band`
- effect on staging: 11 blocks corrected (10 Structured domain narratives + the Structured
  executive summary), 0 remaining occurrences of the retired sentence

The repository keeps the `20260803210000` prefix so the file still sorts last for the
repository-derived replay ledger; the two sequences already diverge on this branch by design.

## Freeze and containment (verified after all work)

| Control | State |
| --- | --- |
| Application layer (`MK_RC1_OPERATION_FREEZE_MODE`) | not `released` — release route returns `RC1_CONTROL_EXPLICIT_RELEASED_MODE_REQUIRED` (423) |
| Database layer | `FROZEN` @ epoch 23, `released_at` null — never released this session |
| Active canary authorisation | none |
| Preserved canary `MKTEST-RC1-20260802-02` | untouched |
| Email provider mode | `disabled` |
| Freeze audit events | 50 |

No write of any kind was made to staging except the migration above. No release window was opened.

## Paid journey `MKORD-2026-D1U0CTO8`

| Item | State |
| --- | --- |
| Order status | `payment_received` |
| Payment transitions | exactly 1 |
| Reports | 0 |
| Storage objects | 0 |
| Generation attempts | 2, both terminal |
| — `d43e3b3a…` | `MANUAL_REVIEW_REQUIRED` (parked, preserved) |
| — `1380c4b1…` | `GENERATION_FAILED` |
| Eligible queued / retry-scheduled attempts | 0 |
| Stale leases | 0 |
| Delivered emails | 3 (`customer_order_confirmation`, `admin_new_order_notification`, `payment_confirmed`) — unchanged |
| `premium_report_pdf` events | 0 |

## Defects fixed

1. **`QG_NARRATIVE_MATURITY_EVIDENCE_MISMATCH`** — `maturityMentions` matched the ordinary
   adjective "structured" in a quoted control prompt as a Structured-band claim. Detector made
   claim-aware, consistent with `exposureMentions` and `INDIRECT_MATURITY`. Verified against the
   real inputs for score run `1a670c03`: 1 grounding issue before, 0 after.
2. **`QG_NARRATIVE_RESPONSE_LABEL_MISSTATEMENT`** — Structured-band copy claimed controls "are
   operating across most of what was assessed here" while the section cited a response-value-0
   gap. Copy corrected in the content blocks and the deterministic fallbacks. Validator untouched;
   test L1 pins that the retired wording still trips it.
3. **Notification recovery burned its budget against a disabled provider** — a `recorded_disabled`
   row was re-claimed on every duplicate record, spending one of five recovery attempts per pass
   and eventually parking a healthy row as `reconciliation_required`.
4. **Test double could not model the conditional claim** — `update().eq()` only, so the unsent
   notification claim threw `.eq(...).is is not a function`.
5. **Stale contract pins** — checkpoint E23, the synthetic notification manifest (~160 lines
   adrift), and two control-plane storage call sites. Each reviewed, not bumped.
6. **M11** — `brace-expansion` 5.0.8 → 5.0.9 (the only blocking advisory).

## Not completed, and why

Generation, PDF inspection, delivery, cleanup and the two-layer release/re-freeze all require the
application-layer freeze to be opened first. `docs/safe-launch/27-rc1-production-change-runbook.md`
§14 assigns that action to the owner alone and requires a signed release decision; §3 assigns
Codex the verification role. This is a documented control boundary, not a missing credential — an
AAL2 platform-admin session is available and authenticates correctly against `/score/api/admin/*`.

Partial verification that was possible under freeze:

- admin report download with a non-existent report → `404 report_record_missing`, safe message,
  technical reference only (fails closed, no leak)
- customer access-token surface → `423 RC1_OPERATION_FROZEN` (correctly shut)

## Known non-blocking limitations

- Checkpoint F's `PDF_NEAR_EMPTY_PAGE` fails on local macOS and passes in CI; pagination depends on
  the host font stack. Treat CI as authoritative.
- Two generated advisory strings (`evidence-model/leadership.ts`,
  `evidence-model/question-playbooks.ts`) match the response-state shape while being a criticism
  and a recommendation respectively. Latent false-positive candidates; not observed firing.
- `main` carries no branch protection.
