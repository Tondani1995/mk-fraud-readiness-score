# 10 — Production handover for Codex

## Status

> ## DESIGN HANDOVER COMPLETE — METHODOLOGY AND CONTENT APPROVAL REQUIRED BEFORE IMPLEMENTATION

This document is **not** an implementation-ready specification, and the previous
version was wrong to call itself one. The experience design is complete and
evidenced. The methodology rules and all new content remain **unapproved**.

**Prototype branch:** `prototype/adaptive-assessment-experience-v1` — **DO NOT MERGE**
**Audited base:** `fdf4d55` (origin/main)

---

## 1. Instructions to the production integration owner

1. **Do not merge this branch, and do not copy the prototype code into Production.**
   It is a design reference. The engine is deliberately framework-free and
   browser-oriented; Production is Next.js with a server-side scoring engine.
2. **Re-audit the then-current Production repository.** This handover was written
   against `fdf4d55`. RC1, PR #45 and other release work will have moved Production on.
3. **Confirm the live question bank and scoring engine before designing anything.**
   The question bank lives in Supabase, not the repo. Verify the active
   `methodology_version`, the seeded questions, and the current behaviour of
   `src/lib/scoring/scoring-engine.ts`.
4. **Map approved rules into the existing architecture.** Do not restructure the app
   to resemble the prototype.
5. **Write no migration before methodology and content approval.** The schema in §6 is
   a proposal, not a plan of record.
6. **RC1 and the near-real-time fulfilment work remain separate.** No dependency in
   either direction.
7. **Payment, email, reporting and fulfilment must not be altered** by the adaptive
   assessment implementation.

## 2. Classification of everything in this workstream

### 2.1 Approved UX principles *(safe to build once content is approved)*

One question per screen · progressive profiling (≤5 broad questions, then domain
gateway blocks) · gateway-driven adaptivity on stated facts only · uncertainty as a
first-class response · outsourcing redirects to oversight · dynamic progress with time
estimate · "why we are asking" · safe back navigation with invalidation warning and
audit trail · save/resume including navigation position · final review showing assessed
and excluded scope with reasons · WCAG 2.2 AA interaction patterns.

### 2.2 Proposed methodology rules *(NOT approved — decisions in `05` §9)*

Five response states and their treatments · three separate measures · Fraud Readiness
Score Option A · report statuses and all thresholds · the seven recommendation classes ·
the twelve integrity signals · the comparability statement · the denominator rules.

### 2.3 Unapproved content *(see `11`)*

14 gateway questions · 6 oversight variants · uncertainty option copy · 4 progressive
domain introductions · exclusion explanations · comparability explanation · report-status
explanations · evidence-verification recommendation templates · 68 evidence prompts ·
10 time-estimate constants.

### 2.4 Prototype-only shortcuts *(must not ship)*

The inspection bar · `localStorage` persistence with simulated latency · client-side
score computation · `window.__MK_PROTO__` hooks · the "Prototype" chip · synthetic
journeys and deterministic responders · `tools/review-server.mjs`.

### 2.5 Production architecture decisions *(owner: Codex)*

Where the graph lives (Supabase rows vs a versioned artefact) · graph versioning and
pinning for in-flight assessments · audit-history table design and retention · RLS on
new tables · server-side vs client-side path resolution · an admin UI for editing
branching rules without a code change · how the applicability profile reaches the
report generator.

### 2.6 Unresolved decisions

`05` §9 (11 methodology decisions) · `09` §7 (6 behavioural decisions) · `09` §6
(5 versioning decisions) · `11` (10 content decision groups).

## 3. Component inventory

Thirteen components, specified with props in `06` §2: `AssessmentShell`,
`ProgressHeader`, `QuestionScreen`, `MaturityOptions`, `GatewayOptions`, `WhyAsking`,
`EvidencePrompt`, `SaveIndicator`, `InvalidationDialog`, `DomainCompleteScreen`,
`ReviewScreen`, `SubmissionScreen`, `ResumeScreen`. Plus `GatewayBlockIntro` for
progressive profiling.

Reuse `src/components/ui/{Button,Card,Badge}`. Two token gaps to close first: a darker
brass for hover/pressed (`mk.brassDark` duplicates `mk.brass`) and an amber for
uncertainty.

## 4. State model

```ts
type AssessmentUiState = {
  screen: 'welcome'|'resume'|'question'|'domain-complete'|'review'|'submitted';
  answers: Record<QuestionId, { value: number | 'unknown'; answeredAt: string }>;
  auditHistory: AuditEntry[];
  currentId: QuestionId | null;
  visited: QuestionId[];
  saveState: 'idle'|'saving'|'saved'|'error'|'offline';
  lastSavedAt: string | null;
  submittedAt: string | null;
};
```

**`currentId` and `visited` are persisted state.** Omitting them caused a real resume
defect. Persist on every navigation, not only on answer.

Everything else is **derived** and never stored: active path, exclusions, redirects,
progress, time estimate, the three measures, report status, recommendations and
integrity signals. All are pure functions of `(graph, answers, auditHistory)`.

## 5. Question-graph schema and branching format

Full specification in `04`. Condition grammar, four node types only:

```jsonc
{ "question_id": "G03", "in": ["internal","unknown"] }
{ "all": [ … ] }   { "any": [ … ] }   { "not": … }   null
```

Invariants to enforce:

1. Conditions may reference **only** gateway questions — this keeps the graph a
   two-layer DAG and makes cycles structurally impossible.
2. An unanswered gateway evaluates **false**.
3. Every gateway must be ordered before the first question that depends on it.
4. Every `skip_reason_code` used must be defined; every `redirect_to` must resolve.
5. Prototype-authored content carries `methodology_version: "PROTOTYPE_PLACEHOLDER"`.

Progressive profiling is expressed as a `phase` field on each gateway
(`"profile"` or `"domain:D3"`) plus a `gateway_blocks` array carrying the
introduction copy.

## 6. Database implications

**No migration has been written and none should be until §2.2 and §2.3 are approved.**

### 6.1 Columns

| Table | Column | Purpose |
|---|---|---|
| `questions` | `gateway_status` enum | standard / gateway / oversight_variant |
| `questions` | `phase` text | `profile` or `domain:<code>` |
| `questions` | `applicability_condition` jsonb | replaces the hard-coded `profile_rule_*` branches in `na-rules.ts` |
| `questions` | `redirect_when` jsonb | outsourcing pathway |
| `questions` | `replaces_question_id` fk | variant → base linkage |
| `questions` | `skip_reason_code` text | customer-facing exclusion reason |
| `questions` | `evidence_prompt` text | "typical evidence" line |
| `assessment_answers` | `finding_class` enum | the five states + implemented/partial/invalidated |
| `assessment_answers` | `recommendation_class` enum | the seven classes |
| `assessment_answers` | `applicability_state` enum | internal/outsourced/shared/absent/unknown |
| `assessment_answers` | `control_absence_confirmed` boolean | **only true for a substantive 0** |
| `assessment_answers` | `control_visibility_status` enum | visible / not_visible / not_assessed |
| `assessment_answers` | `evidence_required` boolean | drives verification recommendations |
| `assessment_answers` | `excluded_from_denominator_rule` text | denominator auditability |
| `assessment_answers` | `skip_reason_code` text | why it was not asked |
| `assessments` | `graph_version` text | pin in-flight assessments |
| `assessments` | `report_status` enum | NORMAL / PROVISIONAL / INSUFFICIENT_VISIBILITY |
| `assessments` | `report_limitation_reason` text[] | shown in the report |
| `assessments` | `assessment_coverage`, `control_visibility` numeric | the two new measures |

### 6.2 Tables

```sql
assessment_answer_history (            -- superseded answers, never deleted
  id, assessment_id, question_id, previous_value,
  cause_question_id, event, created_at )

assessment_applicability_profile (     -- resolved scope at submission
  id, assessment_id, question_id, finding_class, recommendation_class,
  applicability_state, scoring_weight, in_denominator,
  excluded_from_denominator_rule, skip_reason_code, control_visibility_status )

assessment_integrity_signals (         -- deterministic, inspectable
  id, assessment_id, signal_id, detail, blocking, created_at )
```

### 6.3 Migration considerations

- Backfill `graph_version` on in-flight assessments and treat them as non-adaptive.
- Map existing `is_not_applicable` + `n_a_reason` rows to
  `finding_class = 'NOT_APPLICABLE'` with
  `excluded_from_denominator_rule = 'legacy_manual_na'`. **Do not silently reinterpret
  them as gateway-derived.**
- `question_applicability_rules` already exists and is the natural home for
  `applicability_condition` — migrate rather than duplicate.
- All migrations additive and reversible. **Review RLS on the three new tables before
  they carry data.**

## 7. Scoring-denominator rules

See `05` §4. Summary:

```
numerator   = Σ (value/5 × weight)      over controls answered with a maturity value
denominator = answered-maturity weight + unknown weight      (Option A, recommended)
```

Excluded from the denominator: `gateway_declared_absent`, `invalidated_by_upstream`,
`unanswered_incomplete`, `profile_only`.

Carry alongside every score: applicable / excluded / redirected / invalidated counts
and weights, coverage, visibility, unknown weight share, material exclusion share, and
the full per-control profile.

**The score is scope-specific.** Exclusion changes it — measured at +6.46 points in
J7 vs J7-FULL. The comparability statement must travel with every result.

## 8. Audit history

Every invalidation writes `{event, question_id, previous_value, cause, at}`. Retained
indefinitely, excluded from the active pathway and denominator, not shown in the
customer review (recommended), always available to admin. Supports reconstructing why
a control left scope, detecting gateway toggling, and restoring answers on revert.

## 9. Invalidation behaviour

Resolve the path twice (actual vs hypothetical) → report only **answered** controls
that would leave → require explicit confirmation naming the count → on confirm write
audit rows and remove from active answers → on cancel change nothing. Reverting the
gateway restores path shape; auto-restoring answers is an open decision.

## 10. Save and resume

Keep the existing production model. Add: navigation position persisted on every
transition; advance blocked while `saveState === 'error'`; an explicit resume screen;
retain the `sessionStorage` fallback, `interactionLockRef` and the `offline`
distinction.

## 11. Accessibility acceptance criteria

- [ ] Skip link first in DOM order and reaches `#main`
- [ ] All controls keyboard-operable; no unintended keyboard trap
- [ ] `:focus-visible` ≥3:1, 3px outline, 3px offset
- [ ] Dialogs `role="alertdialog"`, `aria-modal`, focus trapped, Escape closes, focus restored
- [ ] Progress exposes `aria-valuenow` and prose `aria-valuetext`
- [ ] Polite live region for save/navigation; assertive for errors
- [ ] All targets ≥44px (design to 48)
- [ ] No information by colour alone
- [ ] `prefers-reduced-motion` honoured
- [ ] One `<h1>` per screen; no skipped levels; `lang="en-ZA"`
- [ ] No horizontal scroll at 320/390/768/1440
- [ ] 400% zoom reflow (320 CSS px) with no two-dimensional scrolling
- [ ] axe-core clean of serious/critical on every screen state, all three engines
- [ ] **Human screen-reader pass (NVDA + VoiceOver)** — outstanding
- [ ] **Physical-device testing** — outstanding

## 12. Browser and viewport matrix

| | Status |
|---|---|
| Chromium / Firefox / WebKit | **Automated, passing in CI** |
| 320 / 390 / 768 / 1440 px | **Automated, passing in all three engines** |
| 400% zoom reflow | **Automated, passing** |
| axe-core WCAG 2.2 AA | **Automated, passing** (serious/critical) |
| Real Safari on iOS, real Chrome on Android | **Outstanding — pre-production gate** |
| Samsung Internet | **Outstanding — recommended for the SA Android market** |
| NVDA / VoiceOver human testing | **Outstanding — pre-production gate** |

**Known engine difference:** Safari's default keyboard model moves Tab between form
controls only and skips links and buttons unless Full Keyboard Access is enabled. The
skip link is first in DOM order on every engine (asserted), but Tab reaches it only on
Chromium and Firefox. This is a platform preference, not a page defect, and it applies
to every skip link on every site in Safari. Real-Safari keyboard verification remains
a pre-production gate.

`:has()` is used for option selection styling — verify against the agreed support floor.

## 13. Test-path matrix

Port the 125 prototype tests. Minimum production additions:

1. Combinatorial gateway sweep over all 14 gateway permutations asserting
   termination, reachability, ordering and accounting.
2. Server-side denominator and measure tests mirroring the client model.
3. Migration replay proving legacy N/A rows map to `legacy_manual_na`.
4. Concurrency: two tabs, expired token, mid-save refresh.
5. Recommendation-contract tests against the real report generator.
6. Report-status gate tests against real submissions.

## 14. Areas that must not change

The 68 approved question prompts, weights, `is_critical`, `is_hard_gate`, domain
assignment and domain weights · the 0–5 scale, labels, operational meanings and
normalised values · existing maturity caps and coverage thresholds · report content and
structure · payment, email, fulfilment and report generation ·
`release-candidate/v7-a-d-integration`, PR #45 and any RC1 branch.

## 15. Risks

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| 1 | Gateway and oversight content unapproved; the whole experience depends on it | **High** | `11`; methodology sign-off before build |
| 2 | **Exclusion changes the score and cannot be prevented from doing so** | **High** | Scope-specific framing, comparability statement, integrity signals, exclusion schedule. Accepted limit, not solved |
| 3 | A false factual declaration cannot be detected in self-assessment | **High** | Audit trail, exclusion visibility, admin review trigger. Accepted limit |
| 4 | Score model undecided; Option B reports 100/100 for near-total blindness | **High** | `05` §4.1 recommends Option A on J8 evidence |
| 5 | Comparability rule for reduced-scope domains undecided | **High** | `05` §6 proposal awaiting approval |
| 6 | Report could infer absence from uncertainty or silence | Medium | Recommendation contract + 10 tests; must be re-asserted against the real generator |
| 7 | Gateway toggling to shed unfavourable answers | Medium | Audit history + `repeated_gateway_toggling` signal |
| 8 | Migration misreads legacy N/A rows | Medium | `legacy_manual_na` rule + replay test |
| 9 | No human screen-reader or physical-device testing | Medium | Pre-production gates, stated openly |
| 10 | Graph versioning for in-flight assessments undecided | Medium | Pin `graph_version` at start |
| 11 | Five profile questions before the assessment may still feel like a hurdle | Low | Validate in owner review and customer testing |

## 16. Gates

**Pre-customer-testing:** approved or formally review-ready gateway wording · approved
uncertainty and comparability treatment · direct owner walkthrough · no critical
owner-review findings.

**Pre-production:** methodology approval · content approval · Production architecture
review by Codex · physical-device testing · VoiceOver and NVDA testing · complete
Production integration and regression certification.
