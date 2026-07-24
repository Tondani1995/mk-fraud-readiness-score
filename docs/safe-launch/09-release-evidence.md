# Safe-Launch Evidence Pack

This document is a running record for the safe-launch remediation programme. It is updated at
the end of each work cycle, not written once at the end. Entries use:

- `PASS — verified by...`
- `FAIL — evidence...`
- `BLOCKED — dependency...`
- `NOT IN SCOPE — reason...`

Statements like "appears fixed" or "should work" are not used without a verified result attached.

---

## Resource register

Every metered or persistent resource created during this programme, with cost basis, owner, and
cleanup status. Updated at the end of every work cycle per the controller's cost-hygiene
instruction. "Owner" is the human on whose behalf the resource was created (this session acted on
their instruction, not autonomously).

| # | Resource | Type | Purpose | Cost basis | Owner | Created | Status | Deleted |
|---|---|---|---|---|---|---|---|---|
| 1 | Supabase branch `release-a-backlog-reconciliation` (project ref `cezyphvyommcxarbclfs`, parent `jvjxlphdyzerrhwcgkup`) | Cloud, metered | Test the Release A migration on an isolated schema-only copy of production (no production data) | $0.01344/hour, confirmed via `get_cost`/`confirm_cost` before creation | Tondani (this session's user) | 2026-07-24T10:50:52Z | **Deleted** — provisioning failed (`MIGRATIONS_FAILED`, see `10-migration-discrepancy-investigation.md`); branch was unusable and cost was stopped immediately | 2026-07-24, same session, minutes after creation |
| 2 | Local Supabase/Postgres stack, Docker project `mk-repo` (ports 55321–55329, shifted from the CLI defaults to avoid colliding with a pre-existing, unrelated 8-day-old local stack named `repo` that this work did not create and did not touch) | Local, free | Full local replay of every migration + 11 live functional SQL checks against `classify_backlog_order()`/`backlog_reconciliation_queue()` | None (local Docker only) | Tondani | 2026-07-24 | **Stopped** (`supabase stop`); containers removed | 2026-07-24, same session |
| 3 | Docker volumes `supabase_db_mk-repo`, `supabase_edge_runtime_mk-repo`, `supabase_storage_mk-repo` | Local, free | Backing storage for resource #2 | None | Tondani | 2026-07-24 | **Removed** (`docker volume rm`) after the test transaction was rolled back and its results (11 PASS lines) were recorded in this pack | 2026-07-24, same session |
| 4 | GitHub draft PRs #40, #41 | Free (GitHub) | Reviewable diffs for the discovery doc and Release A tooling | None | Tondani | 2026-07-24 | **Active**, both draft, both `DO NOT MERGE` | N/A — intentionally kept open for review |
| 5 | Homebrew `node@26` + partial `supabase` formula install | Local, free, but caused an **unintended global change** | Attempted global Supabase CLI install; superseded by `npx supabase` (no persistent install needed) | None | Tondani's machine | 2026-07-24 | **Reverted** — `node@26` was unlinked and `node@24` relinked as default (matching this repo's `.nvmrc`/`engines` requirement); orphaned Homebrew dependency kegs removed via `brew uninstall supabase` (cellar cleanup) | 2026-07-24, same session, immediately on discovery |

**Accidental global machine change — documented per instruction.** Installing the Supabase CLI's
node dependency via Homebrew unlinked this machine's `node@24` and linked `node@26.5.0` instead,
and the `supabase` formula itself failed to install cleanly (`No such file or directory` on the
bottle's `dist/supabase.js`). This was caught, `node@24` was relinked as the active version, and
the broken partial install was removed. `npx supabase@latest` was used for the remainder of the
work — no further global installs were made. Local Supabase/Postgres testing going forward should
continue to prefer `npx supabase@latest <command>` over a global/Homebrew install.

**Pre-existing resource explicitly not touched:** a local Docker Supabase stack, project `repo`
(containers `supabase_db_repo`, `supabase_kong_repo`, etc.), had been running for 8 days prior to
this session, in a Documents-folder clone this work did not create. It was not stopped, deleted,
or altered — this work's local stack used different ports specifically to avoid needing to touch
it.

---

## Release A evidence

| Requirement | Implementation | Commit(s) | Test | Result | Preview | Evidence |
|---|---|---|---|---|---|---|
| Current-state discovery report (brief §4) | `docs/safe-launch/00-current-state.md` | `70c0141` | Manual verification of every cited fact against live `gh`/Supabase MCP output | `PASS — verified by direct gh pr view 37 / Supabase list_tables,list_migrations,execute_sql calls, all cited in the doc` | PR #40 (Vercel: Ready) | This document's own citations |
| Backlog reconciliation migration (table, RLS, 2 RPCs) | `supabase/migrations/20260724150000_release_a_backlog_reconciliation.sql` | `b1080f3` | (a) `npm run typecheck`; (b) full local `supabase start` replay of all 31 production migrations + this one; (c) GitHub Actions "Supabase Migration Replay" workflow | `PASS — (a) tsc --noEmit exit 0, no output; (b) all migrations applied with only benign idempotency NOTICEs, stack reached healthy; (c) CI runs 30087606900 (release-a branch) and 30087604815 (docs/safe-launch-discovery branch) both succeeded, ~4m38s/4m39s` | PR #41 (Vercel: building/ready) | `10-migration-discrepancy-investigation.md` §"What was checked and did NOT reproduce the error" |
| `classify_backlog_order()` — role/session/note-length enforcement | Same migration | `b1080f3` | Live SQL test against local Postgres: unauthenticated call, wrong-role (`reviewer`) call, sub-5-char note, all with synthetic fixture data | `PASS — verified by direct psql execution; unauthenticated call raised backlog_reconciliation_no_session, reviewer call raised backlog_reconciliation_role_forbidden, short note raised backlog_reconciliation_note_too_short` | — | Live test run, this work cycle (test script not committed — synthetic-fixture SQL, one-off verification, results recorded here) |
| `classify_backlog_order()` — upsert-not-duplicate, always-audited | Same migration | `b1080f3` | Two classify calls on the same order, same live test | `PASS — verified by direct psql execution; exactly 1 row in backlog_reconciliation_records, exactly 2 rows in audit_logs (one with before_json = null, one with the prior state), record reflects the latest classification` | — | Same live test run |
| `backlog_reconciliation_queue()` — role-gated, non-PII | Same migration | `b1080f3` | Same live test: `reviewer` read access; return-signature check for PII field names | `PASS — verified by direct psql execution; reviewer could read the queue and see the test order; function's return signature contains no customer_name/customer_email/organisation_name columns` | — | Same live test run |
| RLS enforcement on `backlog_reconciliation_records` | Same migration | `b1080f3` | `anon` role direct table access, same live test | `PASS — verified by direct psql execution; anon role returned zero rows / no privilege` | — | Same live test run |
| Admin UI + classify/export routes | `src/app/score/admin/backlog-reconciliation/page.tsx`, `src/app/score/api/admin/backlog-reconciliation/route.ts`, `.../export/route.ts` | `b1080f3` | `npm run typecheck`; static source assertions (`scripts/release-a-backlog-reconciliation-tests.mjs`) confirming role checks run before the mutating/reading call in each route | `PASS — typecheck exit 0; node scripts/release-a-backlog-reconciliation-tests.mjs exit 0, all assertions ok` | PR #41 | Script output, this work cycle |
| CSV export — non-PII field set | `.../export/route.ts` | `b1080f3` | Static assertion of the fixed `CSV_COLUMNS` list against a PII-field-name blocklist/allowlist | `PASS — see script output` | — | Script output |
| CSV export — spreadsheet formula-injection hardening | `src/lib/backlog-reconciliation/csv-safety.ts` (new, shared module) | `aefefd5` | Real functional test (not source assertion) calling the actual `csvEscape()` against: `=SUM(1,1)`, `+cmd`, `-1+2`, `@IMPORT`, leading-space-hidden formula, leading-tab-hidden formula, plain text, self-quoted text, comma-containing text, embedded line break, embedded double quotes, `null`, `undefined`, a number | `PASS — 14/14 assertions passed against the real function's return value, see scripts/release-a-backlog-reconciliation-tests.mjs section 9c output` | PR #41 | Script output, this work cycle |
| Backlog reconciliation runbook | `docs/safe-launch/01-backlog-reconciliation-runbook.md` | `b1080f3` | Manual review (under 600 words, as required) | `PASS — 582 words` | — | — |
| Migration applied to a Supabase Cloud environment | — | — | — | `BLOCKED — no Supabase Cloud environment has executed this migration. The one preview-branch attempt failed for reasons still under investigation (10-migration-discrepancy-investigation.md) and unrelated to the migration's own content, which replays cleanly locally and in CI. Deferred to the single integrated release-candidate cloud branch planned after Releases A-D, per current instructions.` | — | — |
| Production backlog reconciled | — | — | — | `NOT IN SCOPE for this work cycle — tooling exists and is verified; using it against the real 18 payment_received orders requires the authorised MK operator, not an automated action.` | — | — |

---

## Cross-references

- Current-state findings: `00-current-state.md`
- Backlog reconciliation runbook: `01-backlog-reconciliation-runbook.md`
- Migration discrepancy investigation: `10-migration-discrepancy-investigation.md`
- PR #40: `docs(safe-launch): current-state discovery report`, base `feat/essential-report-v2-commercial-rebuild`
- PR #41: `feat(release-a): paid-order backlog reconciliation tooling`, base `docs/safe-launch-discovery` (stacked)
