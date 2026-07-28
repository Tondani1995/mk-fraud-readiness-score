# 12 — Prototype evaluation scorecard

**Status:** Honest self-assessment against the 9.5/10 target.
**Eight of fourteen categories meet it. Six do not**, and are not rounded up.
A score is not increased merely because a document now describes the gap.

---

## 1. Scores

| # | Category | Target | Previous | Now | Meets |
|---|---|---|---|---|---|
| 1 | Usability | 9.5 | 9.5 | **9.6** | ✅ |
| 2 | Mobile experience | 9.5 | 9.5 | **9.6** | ✅ |
| 3 | Visual hierarchy | 9.5 | 9.5 | **9.5** | ✅ |
| 4 | Perceived professionalism | 9.5 | 9.5 | **9.5** | ✅ |
| 5 | Brand alignment | 9.5 | 8.5 | **8.5** | ❌ |
| 6 | Adaptive logic clarity | 9.5 | 9.7 | **9.8** | ✅ |
| 7 | Accessibility | 9.5 | 8.5 | **9.2** | ❌ |
| 8 | Interaction polish | 9.5 | 9.5 | **9.6** | ✅ |
| 9 | Trust | 9.5 | 9.0 | **9.0** | ❌ |
| 10 | Readiness for owner review | 9.5 | — | **9.5** | ✅ |
| 11 | Readiness for customer testing | 9.5 | 8.0 | **7.5** | ❌ |
| 12 | Methodology integrity | 9.5 | — | **9.5** | ✅ |
| 13 | Report-quality protection | 9.5 | — | **9.4** | ❌ |
| 14 | Product sustainability | 9.5 | — | **8.8** | ❌ |
| | **Weighted average** | **9.5** | 9.12 | **9.19** | |

### 1 · Usability — 9.6 ✅
Progressive profiling cut the pre-assessment questions from 14 to 5, with domain
gateways introduced in context. One decision per screen, keyboard shortcuts,
auto-advance only where a mis-tap is cheap, honest progress, always-safe back.
*Held from 10:* no real respondent has completed it.

### 2 · Mobile experience — 9.6 ✅
320/390/768/1440 asserted in three engines. 400% zoom reflow asserted. A real
horizontal-overflow regression (the journey select at 377px) was caught by these tests
and fixed. 48px targets, bottom-sheet dialogs, safe-area insets.
*Held from 10:* emulated viewports only, no physical devices.

### 3 · Visual hierarchy — 9.5 ✅
Strict, repeated order on every screen. The new scorecard leads with one number and
subordinates the two supporting measures. Uncertainty is visually separated from the
maturity scale so it cannot read as "worst score".

### 4 · Perceived professionalism — 9.5 ✅
Restrained motion, no gamification, advisory tone. The report preview reads like a
professional statement of work performed and its limits.

### 5 · Brand alignment — 8.5 ❌ *(unchanged)*
Correct `mk.*` token values, but **Poppins is still not bundled** (renders in a system
fallback), two tokens remain invented (`#16294a` brass hover, `#8a6410` uncertainty
amber) because `mk.brassDark` duplicates `mk.brass` and no warning colour exists, and
there is no MK logo or wordmark.
*To reach 9.5:* bundle Poppins, add the two tokens to `tailwind.config.ts`, apply real
brand assets.

### 6 · Adaptive logic clarity — 9.8 ✅
Entirely data-driven; the engine contains no question identifiers (test-asserted).
Four-node condition grammar. Conditions may only reference gateways, so cycles are
structurally impossible. Progressive placement proven equivalent to the previous
ordering. Every skip carries a code and customer-facing prose. The inspector prints the
full evaluation including the three measures.
*Held from 10:* still no admin UI for editing rules.

### 7 · Accessibility — 9.2 ❌ *(was 8.5)*
Now evidenced rather than asserted: **axe-core WCAG 2.2 AA checks pass with no serious
or critical violations** on welcome, gateway, review, submission and the invalidation
dialog, **in Chromium, Firefox and WebKit**. 400% zoom reflow asserted. Keyboard, focus
order, focus trapping, reduced motion, live regions and target sizes all asserted.

Remaining gaps, which is why this is not 9.5:
- **No human screen-reader testing.** NVDA and VoiceOver have not been run.
- Automated checks catch roughly a third of WCAG issues. **Full WCAG 2.2 AA conformance
  is not claimed** on automated evidence alone.
- Safari's default keyboard model skips links and buttons in the Tab sequence, so the
  skip link is only Tab-reachable there with Full Keyboard Access enabled. The link is
  first in DOM order on every engine, but real-Safari behaviour is unverified.

### 8 · Interaction polish — 9.6 ✅
Save states with real timing, advance blocked on unsaved data, invalidation dialog with
exact counts and focus trap, domain-complete transitions, resume showing what was
retained, progressive block introductions.

### 9 · Trust — 9.0 ❌ *(unchanged)*
Strengthened materially: the scoring claim is corrected, exclusion consequences are
shown, uncertainty is framed as data, the comparability statement appears on review and
submission, and recommendations never invent findings.

*Held at 9.0 for one reason:* the gateway questions the customer will judge the product
by are **still unapproved placeholder content**. The trust the experience earns rests on
wording that may change.

### 10 · Readiness for owner review — 9.5 ✅
All gate conditions met: corrected scoring representation; progressive profiling;
recommendation-class separation; 125 tests passing; Chromium, Firefox and WebKit
passing; axe passing; both prototype CodeQL findings fixed; `npm run review` works.

### 11 · Readiness for customer testing — 7.5 ❌ *(was 8.0 — lowered)*
**Lowered deliberately.** The previous 8.0 was too generous, and this round surfaced
more of what customer testing would expose:
- Gateway and oversight content unapproved (37 items in `11`).
- The score model is undecided, and the two options differ by **80 points** on J8.
- The comparability rule for reduced-scope domains is undecided.
- Time estimates shown to customers are invented.
- No brand typography or assets.
- No human screen-reader or physical-device testing.

Putting this in front of paying customers would test wording and numbers that MK has
not agreed.

### 12 · Methodology integrity — 9.5 ✅
The false claim is corrected everywhere and replaced with a contract the evidence
supports. Five response states are separated and test-enforced. Uncertainty and silence
can never become findings. Outsourcing cannot reduce exposure. Both score models are
computed so the decision rests on evidence, not assertion. The two limits that cannot
be engineered away — exclusion changing the score, and undetectable false declarations —
are stated plainly rather than papered over.
*Held from 10:* the methodology owner has not ruled on any of the 11 decisions.

### 13 · Report-quality protection — 9.4 ❌
The recommendation contract is the strongest part of this round: seven classes, ten
contract tests, and a hard guarantee that not-applicable produces no control
recommendation, unknown produces verification rather than implementation, and unanswered
produces nothing substantive. J7 proves it end-to-end — the excluded weak domain
generates zero findings where full scope generates seven.
*Held from 9.5:* the contract is asserted against the **prototype's** recommendation
generator, not the real report engine. It must be re-asserted there.

### 14 · Product sustainability — 8.8 ❌
Versioned, maintainable, tested, extensible, explainable, and implementable without
Claude — the handover specifies schema, state model, denominator rules and acceptance
criteria. Prototype CI is path-filtered and runs three engines on the exact PR head.

*Held from 9.5:* **there is still no admin UI for editing branching rules.** Rules are
data, but changing a branch today means editing JSON and deploying. `/score/admin/config/questions`
is the natural home. Graph versioning and pinning for in-flight assessments also remain
undecided.

## 2. What would move the average to 9.5

1. **Approve gateway, oversight and copy content** (`11`) — unblocks trust and customer testing.
2. **Rule on the score model and comparability** (`05` §9) — the largest open risk.
3. **Human screen-reader pass (NVDA + VoiceOver) and physical devices** — accessibility to 9.5, readiness up.
4. **Bundle Poppins and add the two missing tokens** — brand alignment to 9.5.
5. **Build rule administration in the admin surface** — sustainability to 9.5.
6. **Re-assert the recommendation contract against the real report generator** — report protection to 9.5.
7. **Replace invented time constants with observed medians.**

## 3. GO / NO-GO

| Gate | Recommendation | Basis |
|---|---|---|
| **Owner review** | **GO** | All gate conditions met (§1.10). The prototype runs, is stable, and the corrected methodology is demonstrable |
| **Customer testing** | **NO-GO** | Content unapproved; score model undecided; no human screen-reader or device testing |
| **Production implementation** | **NO-GO** | Methodology approval, content approval and Codex architecture review all outstanding |

## 4. Honest summary

This round fixed a real integrity problem rather than polishing around it. The claim
that skipping could not improve the score was false, the test that supported it was
incapable of detecting the effect, and both have been replaced with measured evidence
that exclusion moved a score from 76.93 to 83.39.

The prototype now separates five response states, reports three measures instead of one,
gates definitive conclusions on visibility, and guarantees the report cannot invent a
finding from uncertainty or silence. It is stronger and more honest than it was.

It is still **not** ready for customers, and the reasons are approval and verification,
not design: the content is unapproved, the scoring model is undecided, and no human has
tested it with a screen reader or on a real phone.
