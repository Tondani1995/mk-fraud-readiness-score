# MK Fraud Insights: brand direction for the website and Fraud Readiness journey

Owner direction, 25 October 2026. This file governs all presentation work on this repository. Where it conflicts with the "MK Clarity", "Authority correction", "Product refinement" or "Experience transformation" reviews, or with the V1.2 brief's "differentiated product accents", this file wins.

## 1. Positioning

MK Fraud Insights is an independent specialist fraud risk advisory practice. Every public and customer-facing surface must read as a professional services firm that a chief risk officer, CFO or audit committee chair would trust with a sensitive problem. It must not read as a software start-up, a product launch page or a marketing agency portfolio.

Use this test on every screen: if a senior risk executive forwarded this page to their board, would it look like the work of a serious advisory firm? Authority comes from clear thinking, restraint and precise language. It does not come from interactive devices, motion, badges or clever slogans.

The benchmark is the visual discipline of established forensic and risk advisory practices and institutional bodies such as IRMSA: white reading surfaces, navy used deliberately, simple typography, and diagrams only where they replace words.

## 2. What to remove because it signals agency or SaaS

1. Interactive diagrams or widgets as the hero. The `ExposureSystem` "MK lens" component (`src/components/clarity/ExposureSystem.tsx`) leaves the homepage hero.
2. Software pricing-page structure on `/fraud-readiness`: the "Support ladder" eyebrow, the highlighted dark middle card, the "Deeper analysis" pill, and ticked feature lists as the visual centre.
3. Display typography with tight negative tracking and heavy weights. `clarity.css` currently sets headline letter-spacing as low as -0.065em.
4. Numbered section eyebrows such as "01 / The missing view" and "03 / How we help". Assess, Build, Enable and Monitor are independent entry points and must never be numbered or shown as a sequence.
5. Slogan triads and formula strips: "Exposure + Control reality → Management clarity", "Exposure. Readiness. Decisions.", the top and bottom hero strips.
6. Trend vocabulary used as product language: "intelligence", "lens", "connected view", "clarity" as a label.
7. Decorative motion on the website. Keep only functional feedback (selection, saving, focus) and respect reduced motion. The assessment flow is governed separately by section 6 and keeps its guided motion.
8. Engineering language on customer surfaces (see section 5).

## 3. Visual system

**Typeface.** Poppins is the MK brand face across proposals, decks and the LinkedIn Fraud Readiness Series, so the website returns to Poppins. Remove Inter and the unused Manrope assets from `public/fonts` and `src/app/layout.tsx`. Set headings at weight 500 to 600 with letter-spacing between 0 and -0.01em, and body text at 400, 16 to 18px, line-height 1.6 to 1.7. Eyebrows are 12px, weight 600, uppercase, tracking 0.12em, slate, with no numbers. Use tabular numerals for scores where the font supports them.

**Colour.** Navy and white carry the identity, supported only by tonal blue-greys. Use the existing tokens in `tailwind.config.ts`:

| Role | Value |
|---|---|
| Navy, structural mass and primary actions | `#001030` |
| Secondary navy | `#1D3658` |
| Secondary text | `#475569` |
| Rules and borders | `#E2E8F0` |
| Alternate section surface | `#F8FAFC` |
| Main reading surface | `#FFFFFF` |
| Status only, never decorative | danger `#9B2C2C`, success `#2F6B4F` |

Retire these values from `src/components`, `src/app/(website)` and `src/app/clarity.css`: sage `#C8D9BF` and `#A9BF9C`, mint `#A9D4CE`, ochre and brown `#6F5537`, `#80613B`, `#64491F`, `#8A6D4B`, beige `#DFD8CB`, `#F4EFE7`, `#CBBD9F`, `#D8CBBB`, and teal `#12333C`, `#0B2631`, `#31565E`. The branch currently uses about thirty ad hoc blue-greys; consolidate them into a small named scale in `tailwind.config.ts` and reference tokens rather than raw hex.

Limit navy mass to three or four surfaces per page (typically hero or one feature band, the closing call to action and the footer). Everything else sits on white or `#F8FAFC`.

**Shape.** Buttons and cards use a 4 to 8px radius. No pill buttons, no tinted pill badges, no glass or blur, and at most one subtle shadow level.

**Imagery.** No stock imagery and no illustrations of digital security. Use typography, rules and simple diagrams only where a diagram genuinely replaces words.

## 4. Copy rules

All public and customer copy follows the MK writing standard: zero em dashes; no dramatic one-line paragraphs or isolated punchlines; no rhythm built from clipped short sentences; no fragments in body copy; no staged two-line headlines designed to sound profound; no repeated "not X, but Y" contrasts. Write cohesive paragraphs in a calm, expert executive register. Public copy describes Fraud Readiness as built from operational fraud experience and practitioner insight and makes no claim about MBA research.

Required replacements:

| File | Current | Replace with |
|---|---|---|
| `Home/HeroSection.tsx` | Eyebrow "01 / Exposure. Readiness. Decisions." and the "South Africa · A management perspective" and "A different perspective on readiness" strips | Eyebrow "Independent fraud risk advisory"; remove both strips |
| `Home/HeroSection.tsx` | "Understand your fraud exposure. Evaluate whether your controls cover it. Decide what management should prioritise." | "We help South African organisations understand where their fraud exposure sits, whether existing controls genuinely cover it, and what management should address first." |
| `Home/HeroSection.tsx` | "Free assessment. Private Snapshot. An informed next step." | "The assessment is free, and your Snapshot is visible only to your organisation." |
| `Home/HeroSection.tsx` | `ExposureSystem` widget | A quiet typographic list headed "Three questions leadership should be able to answer": where does our fraud exposure actually sit; do the controls we have genuinely cover it; what should we fix first. No card chrome. |
| `Home/ProblemSection.tsx` | "A control can exist. And a gap can remain." and the formula strip | Restore the approved heading "Controls are not the same as readiness." and its approved body copy; remove the strip |
| `Home/CapabilitiesSection.tsx` | "The question comes first. The right support follows." and 01 to 04 row numbers | Restore "Four points of entry, each starting from a management question."; remove the numbers |
| `Home/FraudReadinessSection.tsx` | Subtitle "Your first clear view." | Remove |
| `FraudReadiness/FraudReadinessStorefront.tsx` | "Support ladder" / "One result. Three ways to use it." | Eyebrow "After your Snapshot"; heading "What your organisation can do with its result" |
| `FraudReadiness/FraudReadinessStorefront.tsx` | Highlighted middle card and "Deeper analysis" pill | Three equal white cards divided by rules. Each states the work in one sentence, who it suits, up to four deliverables without tick icons, then the fee in regular weight. Diagnose, Design and Implement remain as quiet labels. |
| `website/SnapshotPreview.tsx` | Clipped "Start your assessment" bar inside the preview card (broken at 1440 and 375) | Remove it; the page already carries the primary call to action |
| `lib/website/methodology.ts` | "Expert-designed. Deterministic at the core." | "How your result is produced" |
| `products/ProductChoice.tsx`, `commercial/OrderJourney.tsx` | First-person lines such as "Tell me what is wrong and what management should do first." | The owner-approved outcomes: "Know where you stand." (Essential), "Design what needs to change." (Comprehensive), "Work with MK to implement it." (Advisory) |
| `clarity/SnapshotExecutive.tsx` | "Fraud readiness / Management intelligence" | "Fraud Readiness Snapshot" |
| `clarity/DomainReadinessMap.tsx` | "Area intelligence", "The connected view" | "Area detail", "Readiness by area" |
| `design-review/report/page.tsx` | "Fraud readiness. A management perspective.", the three-line slogan diagram, "Read the position. Understand the implication." | "Fraud Readiness Report" with "Prepared for [organisation]"; section heading "The management view" |
| `website/Footer.tsx`, `website/LoginClient.tsx` | "MK Fraud Insights is a product of Stonda (Pty) Ltd." | "MK Fraud Insights is a trading name of Stonda (Pty) Ltd." |

## 5. Snapshot and assessment language

Keep every measure, rule and integrity safeguard added in the refinement work; only the presentation changes. The customer should see a professional advisory result, not a QA instrument.

1. Move internal explanations into the collapsed "How to read this Snapshot" section: the priority sort order ("Existing order: critical-control gap count first..."), the coverage denominators, "Reconciled response counts are unavailable in this view", "No specific control finding is attributed".
2. Remove "scoring-base coverage" from the customer view. Relabel "Unknown weight share" as "Answered 'I do not know'" and "Control visibility" as "Known responses", each with its precise definition in the methodology section. Make these edits in `src/lib/snapshot/result-copy.ts` and the components that render them.
3. On the questionnaire, replace "Changes are saved after server confirmation." with "Your answers are saved as you go."
4. The Snapshot header uses the MK logo, not the plain text "MK FRAUD INSIGHTS".

## 6. Assessment flow dynamics

The guided questionnaire flow is owner-approved and inspired by SHL's candidate assessment experience. Keep it and refine it; do not remove it under the website motion rule. The principle is that the website stays editorial and still, while the assessment behaves like a professional psychometric instrument: one focused question at a time, a calm and immediate response to each answer, and a constant sense of orientation without pressure.

Keep as built:

- One question per screen, with the question as the only heading.
- Selecting a response saves and advances automatically. Unselected responses collapse over about 180ms, the chosen answer settles into the saved-response confirmation, and the next question enters over about 240ms. Motion never delays saving and is removed under reduced motion.
- Back allows an answer to be reviewed and changed, "Continue with saved response" advances without rewriting, and a review step precedes submission so nothing submits silently.
- A failed save keeps the selection and offers a clear retry.
- Progress shows percentage complete and the current area, never a global question count.

Refine:

1. **Ordered scale.** Present the maturity responses as a single column ordered from "Not in place" to "Embedded and improving" at every screen width, with each meaning shown beneath its label. The current two-column grid makes an ordinal scale read in a zigzag. "I do not know" stays visually separate beneath the scale.
2. **Orientation step.** Between the organisation profile and the first question, add a short instructions screen in the manner of SHL's pre-assessment guidance. It explains how the assessment works, what the response scale means with one worked example that is not saved, that answers save as the respondent goes and the private link allows a return later, and how long the assessment usually takes. State a duration only if it is derived from measured completion times; otherwise omit it.
3. **Area introductions.** When the respondent enters a new area, show the area name and one sentence on what it covers above that area's first question, inline rather than as a separate page so momentum is kept. Use existing approved area descriptions; where none exist, leave a marked placeholder for owner copy approval rather than writing new methodology claims.
4. **Quieter orientation rail.** The area rail lists area names with a simple completed, current or upcoming state. Remove the per-area percentages and "answered" lines, which add reading load during the flow. On mobile the rail collapses into the progress bar with the current area name.
5. **Completion moment.** After submission, a short confirmation states that the responses are recorded and the Snapshot is being prepared before the Snapshot opens.
6. **Brand shape.** Answer options and panels use the 4 to 8px radius from section 3. The current 14 to 28px radii read as a consumer app.

## 7. Scope and branch discipline

The branch `design/mk-management-clarity` mixes brand work with engineering changes (118 files, about 15,200 lines added). Before anything is proposed for merge, split it:

- **Brand and presentation pull request.** Website, storefront, assessment shell, Snapshot presentation, product cards, order journey styling and copy files, implementing this document.
- **Separate engineering pull requests, each with its own review.** The uncommitted result-recovery work (`src/lib/respondent/tokens.ts`, `src/lib/adaptive/server.ts`, `src/lib/adaptive/question-transition.ts`, the new `src/app/score/api/adaptive/[assessmentRef]/result/` route) is token and security logic and must not travel with brand work. The adaptive start and state API changes in commit `1184d955` also go separately.
- **Review laboratory stays out of production.** Do not merge `/design-review/*` (including the benchmark API, accessibility engine route, concepts and interaction pages), `BaselineAdaptiveAssessmentExperience`, `baseline-clarity.css.txt` or `benchmark-service`. Keep them on a separate review branch.
- **Do not grow `clarity.css`.** It is 5,538 lines running parallel to Tailwind. New styling uses Tailwind tokens, and consolidation is a planned follow-up.

Preserve without change: scoring, methodology, adaptive branching, catalogue prices (R7 500 and R35 000 incl. VAT; Advisory from R150 000 per engagement), payments, consent, analytics, legal terms and the existing no-em-dash regression test. Nothing is deployed or pushed without the owner's instruction.

## 8. Decisions reserved for the owner

Do not resolve these in code:

1. **Unknown-response scoring policy.** The graph metadata says unknown responses stay in the denominator with zero credit, the calculator excludes them, and the provisional limitation sentence contradicts the calculator. That sentence may already appear in issued reports. See `docs/interaction-release-gate/scoring-policy-decision.md`.
2. **Staging isolation.** The interaction release gate reports that `customer_start` activation is enabled for both preview and production against the same Supabase project. Confirm before any staging test that writes data.

## 9. Definition of done for the brand pass

Render screenshots at 1440px and 375px for the homepage, Services, `/fraud-readiness`, `/score/start`, the orientation step, an early and late question, an area introduction, the completion moment, the Snapshot at high, mid and low scores, product choice, order, Advisory intake and the footer. Each must pass this checklist:

- One typeface in use (Poppins), confirmed from computed styles.
- No retired hex values remain; add `scripts/brand-guardrail-tests.mjs` that greps `src/components`, `src/app/(website)` and `src/app/clarity.css` for the retired list in section 3 and for the banned phrases in sections 4 and 5, and fails if any are found.
- No numbered eyebrows, pills, badges, highlighted pricing tier or tick-icon feature lists.
- No em dashes and no staged two-line headlines.
- No more than four navy surfaces per page.
- The response scale reads as one ordered column, and a motion recording confirms select, collapse, confirm and advance still work with reduced motion honoured.
- Existing regression suites still pass.
