# 12 — Prototype evaluation scorecard

**Status:** Honest self-assessment. The target was 9.5/10 across ten categories.
**Six categories meet it. Four do not.** Those four are stated plainly with what
would close each gap, rather than rounded up.

---

## 1. Scores

| # | Category | Target | Score | Meets |
|---|---|---|---|---|
| 1 | Usability | 9.5 | **9.5** | ✅ |
| 2 | Mobile experience | 9.5 | **9.5** | ✅ |
| 3 | Visual hierarchy | 9.5 | **9.5** | ✅ |
| 4 | Perceived professionalism | 9.5 | **9.5** | ✅ |
| 5 | Brand alignment | 9.5 | **8.5** | ❌ |
| 6 | Adaptive logic clarity | 9.5 | **9.7** | ✅ |
| 7 | Accessibility | 9.5 | **8.5** | ❌ |
| 8 | Interaction polish | 9.5 | **9.5** | ✅ |
| 9 | Trust | 9.5 | **9.0** | ❌ |
| 10 | Readiness for customer testing | 9.5 | **8.0** | ❌ |
| | **Weighted average** | **9.5** | **9.12** | |

### 1 · Usability — 9.5

One decision per screen, consistent anatomy, keyboard shortcuts, auto-advance where
safe, explicit Continue where consequential. Progress is honest and the time estimate
moves with the branch. Back is always available and never destructive without warning.

*Held back from 10:* 14 gateway questions before the assessment "starts" is a real
cost that has not been validated with users. No real respondent has completed it.

### 2 · Mobile experience — 9.5

Mobile-first throughout. At 320 px the tightest screen fits eyebrow, prompt, guidance,
six options and the action without scrolling. No horizontal scroll at any width
(test-asserted). 48 px targets. Bottom-sheet dialogs. Safe-area insets. Landscape
handling. Option meanings collapse at 320 to protect the primary decision.

*Held back from 10:* not tested on physical devices — only emulated viewports.

### 3 · Visual hierarchy — 9.5

Strict order on every screen: location → question → guidance → rationale → controls →
meaning → navigation. One accent colour. Type scale spans 0.6875–2 rem with a capped
measure. Progress is deliberately subordinate. The uncertainty option is visually
separated from the maturity scale so it cannot read as "worst score".

### 4 · Perceived professionalism — 9.5

Restrained motion (320 ms, opacity + 8 px, no bounce, no celebration). No
gamification. Advisory tone. The review screen reads like a professional summary of
work performed. It looks like an instrument, not a survey.

### 5 · Brand alignment — 8.5 ❌

Uses the real `mk.*` tokens with correct values. But:

- **Poppins is referenced, not bundled.** The prototype renders in a system fallback,
  so the actual brand typography has not been seen in this design.
- **Two invented tokens:** `#16294a` (brass hover) and `#8a6410` (uncertainty amber)
  because `mk.brassDark` duplicates `mk.brass` and no warning colour exists.
- No MK logo, wordmark or photography — the header is a text "MK".

*To reach 9.5:* bundle Poppins, add the two missing tokens to
`tailwind.config.ts`, apply real brand assets.

### 6 · Adaptive logic clarity — 9.7 ✅

The strongest category. Branching is entirely data-driven; the engine contains no
question identifiers (test-asserted). The condition grammar is four node types.
Conditions may only reference gateways, making cycles structurally impossible. Every
skip carries a code and customer-facing prose. The inspector prints the full
evaluation. Every one of the 68 questions is provably accounted for in every state.

*Held back from 10:* no admin UI for editing rules — production still needs one.

### 7 · Accessibility — 8.5 ❌

Strong foundations, verified rather than asserted: skip link as first tab stop,
keyboard operation, focus trapping with restore, `aria-valuetext` on progress,
polite/assertive live regions, 48 px targets, no colour-only signalling, reduced
motion, forced-colors support. Two real defects were found and fixed by tests.

But three genuine gaps:

- **No screen-reader user testing.** Semantics look right; nobody has run NVDA, JAWS
  or VoiceOver against it.
- **No axe/Lighthouse audit in CI.** Tests assert specific behaviours, not general
  rule conformance.
- **Zoom to 400% (WCAG 1.4.10) not explicitly tested.**

*To reach 9.5:* add `@axe-core/playwright`, run a screen-reader pass, add a zoom test.
Until then, claiming AA conformance would be overstating the evidence.

### 8 · Interaction polish — 9.5

Save states with real timing. Advance blocked on unsaved data. Invalidation dialog
with exact counts, named questions, Escape and backdrop cancel. Domain-complete
transitions. Resume showing what was retained. Keyboard shortcuts. Auto-advance only
after a successful save.

### 9 · Trust — 9.0 ❌

Deliberately engineered: exclusions shown with reasons, outsourcing explained,
uncertainty framed as data, invalidation warned and audited, score calculation not
exposed, prototype status disclosed prominently.

*Held back:* the gateway questions the customer will judge the product by are
**unapproved placeholder content**. Until methodology signs them off, the trust the
experience earns rests on wording that may change.

### 10 · Readiness for customer testing — 8.0 ❌

The prototype runs, is stable, and demonstrates every required state. It is not ready
to put in front of paying customers because:

1. Gateway and oversight content is unapproved (doc 11).
2. Chromium-only verification — no Safari/iOS run, which is a large share of the
   target market.
3. No screen-reader testing.
4. Time-estimate constants are invented and shown to customers as fact.
5. No real brand typography or assets.

*To reach 9.5:* items 1–3 are mandatory; 4–5 are strongly recommended.

---

## 2. Review A — Customer experience

**As a small-business owner (J5).** The journey shortens from 68 to 47 questions and
from ~42 to ~29 minutes, and it says so. "Because you told us you have no external
suppliers, we did not ask about supplier fraud" is exactly the reassurance that
prevents the "this isn't for a business like mine" reaction. G14 ("the owner approves
everything") is offered without judgement, and D3-Q01 carries a note that owner-led
approval will be assessed on its own terms. **Concern:** excluding eight fraud-culture
questions for micro organisations may feel like the product decided they do not have
a culture. Flagged in doc 11 §A.3.

**As a CFO or risk executive (J2/J4).** The applicability profile is the credibility
test, and it holds: 68 questions, nothing excluded, exclusions and redirects counted
and explained. The outsourcing behaviour is the standout — a CFO who outsources
procurement and sees the assessment get *longer*, with questions about retained
control over price integrity and bank-detail verification, will conclude the
instrument understands third-party risk. Evidence prompts signal what a real review
would ask for. **Concern:** no way to delegate individual questions to a colleague;
a CFO will not know every operational detail.

**As an operations manager.** Questions are concrete and answerable. "I do not know"
removes the pressure to guess, which is the main source of bad data from this role.
Save-and-resume with an exact return position matches a working day full of
interruptions. **Concern:** 14 profiling questions before the substance may feel like
admin to someone expecting to start immediately.

**As a mobile-only user.** This is where the design is strongest. One question per
screen suits a phone far better than the current domain-scrolling model. No
horizontal scroll, 48 px targets, reachable actions, bottom-sheet dialogs, quiet
progress. **Concern:** a 29–43 minute journey on a phone will span multiple sessions;
resume works locally but production must make it work across devices.

**Verdict:** the experience would justify R5,000 *if* the content is approved and the
report delivers on what the review screen promises. The journey now sets an
expectation of precision that the report must meet.

## 3. Review B — Fraud methodology integrity

| Failure mode | Assessment |
|---|---|
| **Hides relevant risks** | **Contained.** Exclusion requires a gateway assertion of absence. 45 of 68 questions are unconditional. J5 floors at 47 questions and a test forbids dropping below 30. *Residual:* a respondent who lies at a gateway hides risk — unavoidable in self-assessment, mitigated by audit trail and admin review. |
| **Rewards non-applicability** | **Contained by design and test.** The load-bearing test builds two identical organisations answering 0 throughout, one falsely claiming no suppliers, and asserts the evasive path does not score better. *Residual:* the underlying engine still removes weight from the denominator; the guard is that exclusion needs a stated fact, is counted, and is reported. |
| **Confuses outsourcing with absence of risk** | **Resolved.** Outsourcing redirects to oversight at identical weight and hard-gate status. J4 answers *more* questions with a *larger* denominator (85.00) than the in-house retailer (83.75). Outsourced payroll adds a question. Test-asserted. |
| **Treats uncertainty as control strength** | **Resolved.** Unknown earns zero credit and stays in the denominator. It can never exclude — every condition allow-list includes `unknown`. J6 answers all 68 with 65.37% unknown weight and scores 6.93. |
| **Makes scores incomparable without explanation** | **Partially resolved.** Every result carries applicable/excluded/redirected/invalidated counts, coverage and unknown share. **But** the product does not yet state how a 47-question result compares to a 68-question one. Open decision `05` §9.6 recommends "limited applicability" domain reporting. **This is the largest outstanding methodology risk.** |

**Verdict:** four of five failure modes are closed and test-enforced. The fifth —
comparability — is a reporting decision this workstream cannot make alone.

## 4. Review C — Product sustainability

| Requirement | Assessment |
|---|---|
| **Versioned** | Graph carries `graph_version` and `methodology_version`; every node carries its own version. Pinning in-flight assessments is specified (`09` §6) but not implemented. **Adequate, with a decision outstanding.** |
| **Maintained** | Adding a conditional question is one `applicability_condition` plus one `skip_reason_code` — no engine change. The engine contains no question identifiers. Structural invariants (gateway-only conditions) make whole classes of error impossible. **Strong.** |
| **Tested** | 44 automated tests across integrity, determinism, reachability, loop-freedom, invalidation, progress, accessibility and safety. Two real defects caught. **Strong**, though production needs a combinatorial gateway sweep. |
| **Extended** | New gateways, questions, redirects and domains need data only. Because conditions reference only gateways, adding a question cannot create a cycle or orphan another. **Strong.** |
| **Explained to customers** | Every skip has customer-facing prose; the review screen groups exclusions by reason; the outsourcing rationale is explicit. **Strong.** |
| **Integrated without dependence on Claude** | The prototype is plain HTML, CSS and ES modules with no framework and no build step. The handover specifies schema, state model, denominator rules, migrations and acceptance criteria. Any competent engineer can implement from doc 10. **Strong.** |
| **Administered without editing code per branch** | **The weakest point.** Rules are data, but there is no admin UI to edit them. Today a branch change means editing JSON and deploying. `/score/admin/config/questions` exists and is the natural home. **Specified as a production decision, not built.** |

**Verdict:** sustainable, with one real gap — rule administration. Everything else is
data-driven, tested and documented.

## 5. What would move the average from 9.12 to 9.5

In priority order:

1. **Approve gateway and oversight content** (doc 11) — unblocks trust and readiness.
2. **Add `@axe-core/playwright` and run a screen-reader pass** — accessibility to 9.5.
3. **Cross-browser verification, especially Safari/iOS** — readiness.
4. **Bundle Poppins and add the two missing design tokens** — brand alignment to 9.5.
5. **Decide the comparability/"limited applicability" reporting rule** (`05` §9.6) —
   the largest methodology risk.
6. **Replace invented time constants with observed medians.**
7. **Build rule administration in the admin surface** — sustainability.

Items 1–3 are prerequisites for customer testing. Items 4–7 are prerequisites for
production.

## 6. Honest summary

This prototype does what it set out to do: it demonstrates a premium, adaptive,
one-question-at-a-time assessment that shortens for simple organisations without
becoming easier to manipulate, and it proves that claim with tests rather than
assertions.

It is **not** ready for customers, for three reasons that are about approval and
verification rather than design: the content is unapproved, the accessibility
evidence is incomplete, and it has only been run in one browser engine.

The design is sound. The evidence is not yet complete enough to put it in front of
someone about to spend R5,000.
