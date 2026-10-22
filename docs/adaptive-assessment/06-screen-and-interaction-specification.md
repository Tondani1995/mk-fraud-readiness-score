# 06 — Screen and interaction specification

**Status:** Proposed for approval. **Methodology and content approval required before implementation.**
Screenshots referenced live in `prototypes/adaptive-assessment-v1/screenshots/`.

---

## 1. Screen inventory

All 22 required screens and states, with where each is implemented and captured.

| # | Screen / state | Implementation | Screenshot |
|---|---|---|---|
| 1 | Welcome and expectation-setting | `renderWelcome()` | `{320,390,768,1440}-01-welcome` |
| 2 | Organisation profile questions | `renderQuestion()`, `gateway_status: gateway` | `*-02-gateway-question` |
| 3 | One-question-at-a-time assessment | `renderQuestion()` | `1440-03-question` |
| 4 | Gateway-question screen | eyebrow chip "Sets what we ask next" | `*-02-gateway-question` |
| 5 | Follow-up question | conditional question + "Why we are asking" | `1440-03-question` |
| 6 | "Why we are asking" context | `whyAsking()` → `.why` block | `1440-03-question` |
| 7 | Auto-advance state | `onSelect(..., autoAdvance=true)` | behavioural (test-covered) |
| 8 | Manual Continue state | `high_impact` gateways; Continue disabled until answered | `*-02-gateway-question` |
| 9 | Validation-error state | `showError()` → `role="alert"` | behavioural (test-covered) |
| 10 | Save-in-progress | `savebar[data-state=saving]` | behavioural |
| 11 | Save-failed | `savebar[data-state=error]` + Retry save | `390-08-save-failed` |
| 12 | Resume | `renderResume()` | `390-07-resume` |
| 13 | Back-navigation | `goBack()` over visited history | behavioural |
| 14 | Branch-invalidated warning | `confirmInvalidation()` `alertdialog` | `390-06-invalidation-warning` |
| 15 | Dynamic progress | `renderProgress()` | visible on every screen |
| 16 | Domain-complete transition | `renderDomainComplete()` | `390-05-domain-complete` |
| 17 | "I do not know" handling | `.option--unknown` + review grouping | `1440-04-review` |
| 18 | Outsourced-activity handling | `OV-*` + "Activities you outsource" | `390-10-review-outsourced` |
| 19 | Excluded-area explanation | "Areas excluded, and why" | `390-09-review-excluded-areas` |
| 20 | Final review | `renderReview()` | `1440-04-review` |
| 21 | Submission confirmation | `renderSubmitted()` | `390-11-submitted` |
| 22 | Mobile navigation and recovery | sticky progress, bottom-sheet dialog, retry | `320-*`, `390-*` |
| 23 | Progressive domain gateway intro | `.blockintro` from `gateway_blocks` | `390-12-domain-gateway-intro` |
| 24 | Report preview: three measures + status | `reviewScreenHtml()` | `390-13-review-scope-and-measures` |
| 25 | Insufficient-visibility presentation | `statusbar--error` + limitation list | `390-14-insufficient-visibility` |

## 2. Component inventory

For the production build. Names are proposals.

| Component | Responsibility | Props (indicative) |
|---|---|---|
| `AssessmentShell` | Layout, skip link, live regions, focus management | `children` |
| `ProgressHeader` | Area, areas complete, %, minutes remaining | `area, areasComplete, areasTotal, pct, minutesRemaining` |
| `QuestionScreen` | One question, one decision | `node, value, onSelect, autoAdvance, canGoBack` |
| `MaturityOptions` | 0–5 scale + uncertainty option | `scale, value, onChange` |
| `GatewayOptions` | Applicability single-select | `options, value, onChange` |
| `WhyAsking` | Branch rationale | `text` |
| `EvidencePrompt` | "Typical evidence" | `text` |
| `SaveIndicator` | idle/saving/saved/error + retry | `state, savedAt, onRetry` |
| `InvalidationDialog` | Modal warning, focus trap | `count, items, newlyApplicable, onConfirm, onCancel` |
| `DomainCompleteScreen` | Area transition | `domain, progress, onContinue, onPause` |
| `ReviewScreen` | Areas, exclusions, outsourcing, unknowns | `profile, onJump, onSubmit` |
| `SubmissionScreen` | Confirmation + applicability summary | `profile, reference` |
| `ResumeScreen` | What was retained | `progress, currentNode, onContinue` |
| `GatewayBlockIntro` | Progressive-profiling block introduction | `title, intro` |
| `MeasureScorecard` | Fraud Readiness Score + coverage + visibility | `result` |
| `ReportStatusBar` | NORMAL / PROVISIONAL / INSUFFICIENT_VISIBILITY | `status, limitations` |
| `ScopeSchedule` | Applicable, excluded, redirected, unknown, unanswered | `result` |
| `RecommendationPreview` | Grouped by recommendation class | `groups` |

Reuse existing `src/components/ui/` (`Button`, `Card`, `Badge`) where they fit.

## 3. State model

```ts
type AssessmentUiState = {
  screen: 'welcome' | 'resume' | 'question' | 'domain-complete' | 'review' | 'submitted';
  answers: Record<QuestionId, { value: number | string; answeredAt: string }>;
  auditHistory: Array<{
    event: 'invalidated';
    question_id: QuestionId;
    previous_value: number | string;
    cause: QuestionId;
    at: string;
  }>;
  currentId: QuestionId | null;
  visited: QuestionId[];          // ordered history for Back
  saveState: 'idle' | 'saving' | 'saved' | 'error';
  lastSavedAt: string | null;
  submittedAt: string | null;
};
```

Derived per control by `buildAssessment()` and required by the report:
`finding_class`, `recommendation_class`, `evidence_required`, `conclusion_confidence`,
`control_absence_confirmed`, `control_visibility_status`. Derived per assessment:
`report_status`, `report_limitation_reason`, `assessment_coverage`,
`control_visibility`, and the twelve integrity signals.

`currentId` and `visited` are **part of saved state**. Omitting them was a real
defect found by the resume test: the respondent returned to the previously-saved
question rather than the active one. Production must persist navigation position on
every transition, not only on answer.

Derived, never stored: active path, excluded set, redirects, progress, time estimate,
applicability profile. All are pure functions of `(graph, answers)`.

## 4. Interaction rules

### 4.1 Selection

| Input | Behaviour |
|---|---|
| Click/tap an option | Select → save → auto-advance or enable Continue |
| Keys `1`–`9` | Focus and select the nth option |
| Key `u` | Select "I do not know" where present |
| `Tab` / `Shift+Tab` | Move through options and actions |
| `Enter` on Continue | Advance |
| `Escape` in dialog | Cancel |

Arrow-key roving within the radiogroup is native browser behaviour and is preserved.

### 4.2 Auto-advance

Permitted when the node is a single-select **and** not `high_impact`. Applies to
maturity questions and low-impact gateways. Never on `high_impact` gateways
(G03, G04, G07, G08, G14), never on anything requiring explanation, never on
multi-select (none exist in V1).

Advance happens only **after** the save resolves successfully. On failure the
respondent stays put and sees the retry path.

### 4.3 Save

Fires on every answer. States and copy:

| State | Copy |
|---|---|
| `idle` | Your progress saves automatically |
| `saving` | Saving your answer… |
| `saved` | All answers saved · HH:MM |
| `error` | Not saved. Your answer is safe on this device — retry below. |

Failure blocks advancement and replaces Continue with **Retry save**. Prototype
simulates 420 ms latency and offers a forced-failure toggle.

### 4.4 Back and invalidation

Back walks `visited`. Available from the second screen.

Changing a **gateway** with an existing different value triggers
`invalidationPreview`. If any answered question would leave the path, an
`alertdialog` appears. Cancel (button, Escape, backdrop) restores the previous
selection and destroys nothing. Confirm writes audit entries and removes answers.

Changing a **non-gateway** answer never invalidates anything and needs no warning.

### 4.5 Validation

The only validation in V1: a question must be answered before Continue. Continue is
`disabled` until then; if activated anyway, `showError()` renders a `role="alert"`
callout and moves focus to the first option.

There are no free-text fields in the adaptive path — the existing N/A reason box is
replaced by gateway-driven exclusion, which removes a whole class of validation.

## 5. Copy specification

| Context | Copy |
|---|---|
| Uncertainty option | **I do not know** — Recorded as uncertainty. This is not treated as a control being absent, and it is not treated as a control being present. |
| Why we are asking | Because you indicated "{option label}", this question applies to your organisation. |
| Outsourcing rationale | Because you told us this activity is handled by an external provider, we are asking how you oversee that provider rather than assuming the risk has gone away. |
| Invalidation title | Changing this will remove {n} answer(s) |
| Invalidation body | …no longer apply to your organisation and will be removed from the assessment. They are kept in the audit history but will not affect your result. |
| Exclusion framing | Excluded questions are removed from your result entirely. They do not count for you or against you. |
| Unknown framing (review) | These are treated as uncertainty, not as controls being in place. A high number will be reflected as reduced confidence rather than as a weakness. |
| Preview framing | This is a preview based on your current answers. Your final report is generated after submission. |
| Fraud Readiness Score note | Readiness across applicable controls. Under the proposed methodology, controls that could not be confirmed receive no maturity credit and are reported separately through Control Visibility. |
| Score withheld | MK could not issue a defensible overall Fraud Readiness Score because too much of the applicable control environment could not be confirmed. |
| Comparability | Your score reflects the controls applicable to the operating profile you declared. It should not be compared directly with an organisation whose fraud exposures and applicable control areas differ materially. |
| Exclusion (report) | This area was not assessed because the organisation indicated that the underlying activity does not form part of its operating model. |
| Integrity signals | Several answers materially shaped the applicable assessment scope. These will be recorded in the final report and may require confirmation. |

## 6. Visual specification

Tokens mirror `tailwind.config.ts` `mk.*` exactly. Derived values are prototype-only
and flagged.

| Purpose | Token | Value |
|---|---|---|
| Primary text | `--mk-ink` | `#001030` |
| Accent, progress, selection | `--mk-brass` | `#1d3658` |
| Accent hover | *(derived — token gap)* | `#16294a` |
| Page background | `--mk-cream` | `#f8fafc` |
| Surface | `--mk-paper` | `#ffffff` |
| Borders | `--mk-line` | `#e2e8f0` |
| Secondary text | `--mk-muted` | `#475569` |
| Error | `--mk-danger` | `#9b2c2c` |
| Success | `--mk-success` | `#2f6b4f` |
| Uncertainty | *(derived — token gap)* | `#8a6410` |

Type scale is fluid (`clamp()`), from `0.8125rem` to `2rem`. Measure capped at
42–46 rem. Touch targets 48 px. Radii 8/12/18 px. Motion: `riseIn` 320 ms,
`cubic-bezier(.22,.61,.36,1)`, opacity + 8 px translate only.

**Two token gaps** the production design system should close: a darker brass for
hover/pressed states (`mk.brassDark` currently duplicates `mk.brass`), and an amber
for uncertainty (no warning colour exists in the palette).

## 7. Prototype-only shortcuts

Must not ship:

1. The grey inspection bar (journey loader, path dump, failure toggle, reset).
2. `localStorage` persistence with simulated latency.
3. Client-side provisional scoring — production scoring stays server-side.
4. `window.__MK_PROTO__` test hooks.
5. The "Prototype" chip in the header.
