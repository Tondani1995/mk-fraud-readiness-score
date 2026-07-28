# 10 — Production handover for Codex

**Status:** Implementation-ready specification.
**Prototype branch:** `prototype/adaptive-assessment-experience-v1` — **DO NOT MERGE**
**Audited base:** `fdf4d55` (origin/main)

This document tells the production integration owner what to build. It separates
**approved UX requirements** from **prototype shortcuts**, **content decisions** and
**architecture decisions**, so nothing is carried across by accident.

---

## 1. Approved experience principles

Twelve principles, specified in `02-benchmark-and-design-principles.md`:

P1 one decision per screen · P2 branch only on stated facts · P3 "I don't know" is
data · P4 outsourcing relocates risk · P5 dynamic honest progress · P6 explain the
branch · P7 auto-advance only where a mis-tap is cheap · P8 design for interruption ·
P9 changing your mind is safe and audited · P10 review before submission ·
P11 restraint reads as expertise · P12 accessibility is a trust signal.

**Non-negotiable, because integrity depends on them:** P2, P3, P4, P5, P9.

## 2. Component inventory

See `06-screen-and-interaction-specification.md` §2 for the full table with props.
Thirteen components: `AssessmentShell`, `ProgressHeader`, `QuestionScreen`,
`MaturityOptions`, `GatewayOptions`, `WhyAsking`, `EvidencePrompt`, `SaveIndicator`,
`InvalidationDialog`, `DomainCompleteScreen`, `ReviewScreen`, `SubmissionScreen`,
`ResumeScreen`.

Reuse `src/components/ui/{Button,Card,Badge}`. Two design-token gaps to close first:
a darker brass for hover/pressed (`mk.brassDark` currently duplicates `mk.brass`) and
an amber for uncertainty (no warning colour exists).

## 3. State model

```ts
type AssessmentUiState = {
  screen: 'welcome'|'resume'|'question'|'domain-complete'|'review'|'submitted';
  answers: Record<QuestionId, { value: number | 'unknown' | string; answeredAt: string }>;
  auditHistory: AuditEntry[];
  currentId: QuestionId | null;
  visited: QuestionId[];
  saveState: 'idle'|'saving'|'saved'|'error'|'offline';
  lastSavedAt: string | null;
  submittedAt: string | null;
};
```

**`currentId` and `visited` are part of persisted state.** Omitting them caused a
real resume defect (see `08` §5). Persist navigation on every transition, not only
on answer.

Everything else — active path, exclusions, redirects, progress, estimate,
applicability profile — is **derived**, never stored. Storing derived state is how
adaptive systems drift.

## 4. Question-graph schema

Full specification in `04-question-graph-and-branching-spec.md`.

Condition grammar (four node types, nothing more):

```jsonc
{ "question_id": "G03", "in": ["internal","unknown"] }
{ "all": [ … ] }   { "any": [ … ] }   { "not": … }   null
```

Invariants to enforce in production:

1. Conditions may reference **only** gateway questions. This keeps the graph a
   two-layer DAG — cycles become structurally impossible.
2. An unanswered gateway evaluates **false**.
3. Every `skip_reason_code` used must be defined.
4. Every `redirect_to` must resolve.
5. Prototype-authored content carries `methodology_version: "PROTOTYPE_PLACEHOLDER"`
   until approved.

## 5. Database implications

The prototype writes nothing. Production needs the following. **No migration has
been written, and none should be until §7 content decisions are approved.**

### 5.1 New/changed columns

| Table | Change | Purpose |
|---|---|---|
| `questions` | `gateway_status` enum(`standard`,`gateway`,`oversight_variant`) | Identify gateways and variants |
| `questions` | `applicability_condition` jsonb | Replaces the four hard-coded `profile_rule_*` branches in `na-rules.ts` |
| `questions` | `redirect_when` jsonb | Outsourcing pathway |
| `questions` | `replaces_question_id` fk | Variant → base linkage |
| `questions` | `skip_reason_code` text | Customer-facing exclusion reason |
| `questions` | `evidence_prompt` text | "Typical evidence" line |
| `assessment_answers` | `scoring_status` enum | The nine statuses in `05` §3 |
| `assessment_answers` | `applicability_state` enum | The five states in `05` §2 |
| `assessment_answers` | `excluded_from_denominator_rule` text | Auditability of the denominator |
| `assessment_answers` | `skip_reason_code` text | Why this was not asked |
| `assessments` | `graph_version` text | Pin in-flight assessments |
| `assessments` | `active_question_id` | Already partially present via navigation payload |

### 5.2 New tables

```sql
-- Superseded answers, retained for audit. Never deleted.
assessment_answer_history (
  id, assessment_id, question_id, previous_value,
  cause_question_id, event, created_at
)

-- The resolved applicability profile at submission, so a report can be
-- reproduced exactly without re-running the graph.
assessment_applicability_profile (
  id, assessment_id, question_id, scoring_status,
  applicability_state, scoring_weight, in_denominator,
  excluded_from_denominator_rule, skip_reason_code, uncertainty
)
```

### 5.3 Migration considerations

- Existing in-flight assessments have no `graph_version`. Backfill with the current
  methodology version and treat them as non-adaptive.
- Existing `is_not_applicable` + `n_a_reason` rows must map to
  `scoring_status = 'not_applicable'` with
  `excluded_from_denominator_rule = 'legacy_manual_na'` — do **not** silently
  reinterpret them as gateway-derived.
- `question_applicability_rules` already exists and currently stores a descriptive
  blob. It is the natural home for `applicability_condition`; migrate rather than
  duplicate.
- All migrations must be additive and reversible. **RLS policies must be reviewed
  for the two new tables before they carry any data.**

## 6. Scoring-denominator rules

Full specification in `05-applicability-and-scoring-integrity.md`.

```
denominator = Σ weight  over active AND answered (including "I do not know")
numerator   = Σ (credit/100 × weight),  credit = 0 for unknown
```

Excluded from the denominator: `gateway_declared_absent`, `invalidated_by_upstream`,
`unanswered_incomplete`, `profile_only`.

Carry alongside every score: `applicableCount`, `excludedCount`, `redirectedCount`,
`invalidatedCount`, `coveragePct`, `unknownWeightShare`, and the full per-question
profile.

**Existing rules preserved unchanged:** hard-gate caps, three-criticals cap, coverage
80/90 thresholds, domain-coverage-70 flag. **`n_a_rate_20` should be re-cut** —
gateway-driven exclusion is systematic rather than discretionary, and the meaningful
new signal is `unknownWeightShare`.

## 7. Audit-history expectations

Every invalidation writes `{event:'invalidated', question_id, previous_value, cause,
at}`. Retained indefinitely, excluded from the active pathway and the denominator,
never shown in the customer review (recommended), always available to admin.

Supports: reconstructing why a question left the path; detecting gateway toggling to
shed unfavourable answers; restoring answers if a gateway is reverted.

## 8. Invalidation behaviour

1. On gateway change, resolve the path twice (actual vs hypothetical).
2. Report only **answered** questions that would leave the path.
3. Require explicit confirmation naming the count.
4. On confirm: write audit rows, remove from active answers, recompute progress.
5. On cancel: change nothing.
6. Reverting the gateway restores path shape; **auto-restoring answers is an open
   decision** (`09` §7.1).

## 9. Save-and-resume behaviour

Keep the existing production model — it is the strongest part of the current build.
Add:

- Navigation position persisted on every transition (§3).
- Advance blocked while `saveState === 'error'`.
- Explicit resume screen rather than silent restoration.
- Retain `sessionStorage` fallback, `interactionLockRef`, and the `offline`
  distinction from `navigator.onLine`.

## 10. Accessibility acceptance criteria

WCAG 2.2 AA. Ship gates:

- [ ] Skip link is the first tab stop and reaches `#main`
- [ ] Every control keyboard-operable; no keyboard trap outside intentional dialogs
- [ ] `:focus-visible` ≥3:1 contrast, 3 px outline, 3 px offset
- [ ] Dialogs: `role="alertdialog"`, `aria-modal`, focus trapped, Escape closes, focus restored
- [ ] Progress exposes `aria-valuenow` **and** prose `aria-valuetext`
- [ ] Polite live region for save/navigation; assertive for errors
- [ ] All targets ≥44 px (design to 48)
- [ ] No information by colour alone — every state has a redundant cue
- [ ] `prefers-reduced-motion` honoured
- [ ] One `<h1>` per screen; no skipped heading levels; `lang="en-ZA"`
- [ ] No horizontal scroll at 320/390/768/1440
- [ ] **Add `@axe-core/playwright` to CI** (gap in the prototype)
- [ ] **Screen-reader pass on NVDA + VoiceOver** (gap in the prototype)

## 11. Browser and viewport matrix

| Viewport | Requirement |
|---|---|
| 320 px | Question + controls + action visible; no horizontal scroll |
| 390 px | Baseline mobile |
| 768 px | Tablet; dialog becomes centred modal |
| 1440 px | Desktop; measure capped at 46 rem |

Browsers: current Safari (iOS + macOS), Chrome, Edge, Firefox; Samsung Internet
recommended for the South African Android market. The prototype was executed in
Chromium only — **cross-browser verification is outstanding**.

`:has()` is used for option selection styling; supported in all current targets but
verify against the agreed support floor.

## 12. Test-path matrix

Port the 44 prototype tests. Minimum production additions:

1. Combinatorial gateway sweep (all permutations of the 14 gateways) asserting
   termination, reachability and accounting — the six journeys are a design sample,
   not coverage.
2. Server-side denominator tests mirroring the client profile.
3. Migration replay: legacy N/A rows map to `legacy_manual_na`.
4. Concurrency: two tabs, expired token, mid-save refresh.
5. `@axe-core/playwright` on every screen state.
6. Cross-browser runs of the layout suite.

## 13. Areas that must not change

- The 68 approved question prompts, weights, `is_critical`, `is_hard_gate`, domain
  assignment and domain weights (MFRS-V1.0).
- The 0–5 response scale, labels, operational meanings and normalised values.
- Existing maturity caps and coverage thresholds.
- Report content and structure.
- Payment, email, fulfilment and report-generation systems.
- `release-candidate/v7-a-d-integration`, PR #45, and any RC1 branch.

## 14. Risks

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| 1 | Gateway content is unapproved; the whole experience depends on it | **High** | `11-content-decisions-required.md`; methodology sign-off before build |
| 2 | Adaptive scores are not comparable across differing profiles | **High** | Carry the applicability profile; consider "limited applicability" domain reporting (`05` §6) |
| 3 | Exclusion remains structurally score-positive | **High** | Exclusion requires a stated fact; counted, reported, test-enforced. Residual risk: a respondent who lies |
| 4 | Unknown-heavy submissions score like weak ones | Medium | Report `unknownWeightShare` beside the score; define thresholds (`05` §9.5) |
| 5 | Gateway toggling to shed bad answers | Medium | Audit history retains everything; log toggle counts as a review signal |
| 6 | Migration misreads legacy N/A rows | Medium | Distinct `legacy_manual_na` rule; replay test |
| 7 | Chromium-only verification | Medium | Cross-browser matrix before customer testing |
| 8 | No screen-reader user testing | Medium | NVDA/VoiceOver pass before customer testing |
| 9 | Graph versioning for in-flight assessments undecided | Medium | Pin `graph_version` at start (`09` §6) |
| 10 | 14 gateways before the assessment "starts" may feel like a hurdle | Low | Short, concrete, mostly auto-advancing; validate in customer testing |

## 15. Classification of everything in this workstream

### Approved UX requirements (build these)
One question per screen · gateway-driven adaptivity · uncertainty as a first-class
response · outsourcing redirects · dynamic progress with time estimate · why-we-are-asking ·
safe back navigation with invalidation warning and audit trail · save/resume with
navigation position · final review with exclusions and reasons · WCAG 2.2 AA.

### Prototype-only shortcuts (do not carry across)
Inspection bar · `localStorage` persistence with simulated latency · client-side
provisional scoring · `window.__MK_PROTO__` hooks · "Prototype" chip · synthetic
journeys and deterministic responders.

### Content decisions (require approval — see doc 11)
14 gateway questions · 6 oversight variants · uncertainty option copy · exclusion and
outsourcing framing copy · evidence prompts.

### Production architecture decisions (owner: Codex)
Where the graph lives (Supabase vs versioned file) · graph versioning and pinning ·
audit-history table design and retention · RLS on new tables · server vs client path
resolution · admin UI for editing branching rules without code changes.

### Unresolved questions
`05` §9 (8 methodology decisions) · `09` §7 (6 behavioural decisions) ·
`09` §6 (5 versioning decisions).
