# MK Clarity: institutional authority correction
24 October 2026 · Review 02 · Base 4396f30f

## Selected typography
The actual homepage and Snapshot were rendered in two sans-serif headline treatments: **Manrope** and **Inter**, both with an Inter body. The four candidate screenshots in this folder record that comparison. Poppins, the original website face, was also considered against the existing identity and earlier baseline. Its geometric character gives continuity, but I judged Inter better suited to dense assessment language and executive reporting. Manrope was strong and contemporary, but retained more of the geometric softness being corrected.

**Inter is selected for both headlines and body.** It gives the long management statements a more restrained technical character and a consistent rhythm between website, form and results. This is a design judgement, not external user-testing evidence.

The root declares a self-hosted `--font-inter`. Semantic `--font-sans` and `--font-heading` aliases use it consistently in global CSS, Tailwind and the score SVG. There is no `--font-poppins` alias, expressive serif, decorative italic or second font download in the active system. The licensed variable Latin WOFF2 is approximately 109 KiB. The temporary candidate rendering configuration is removed; the old Manrope assets remain in the repository history/current asset folder but are not referenced by the final root.

## Positioning and visual hierarchy
The primary headline is restored to **“Turn fraud readiness into a management decision.”** Supporting copy explicitly addresses understanding fraud exposure, evaluating whether controls cover it and deciding what management should prioritise.

Navy and white now carry the identity. Cool neutral surfaces support forms and data panels. Steel blue provides structural accents; sage remains a restrained indicator within the exposure illustration and result graphic. Report and product panels have the same institutional contrast. The custom exposure system, its three interactive explanations, assessment controls and Snapshot structure remain.

Hierarchy uses weight, scale and alignment: approximately 62px desktop hero, 35–46px mobile hero, 30–42px section headings, 24–32px questions, 14–16px body text and a 12px supporting-text floor. Large values keep tabular numerals. Mobile domain results use a single column to preserve readable names, scores, coverage and gap counts.

Small-label corrections extend through services, readiness, organisation profile, consent summaries, questionnaire, Snapshot, tier cards, billing, payment-status presentation, private-access states and the isolated report specimen. Nothing is removed to make the layouts simpler.

## Four review criteria
| Criterion | Correction and assessment |
|---|---|
| Professional credibility and executive confidence | Direct management positioning, disciplined sans-serif hierarchy, stronger navy/white contrast and explicit exposure/control/priority language. The design is intended to support senior review; executive user validation remains pending. |
| Originality and visual sophistication | The MK exposure-to-control-to-decision device remains the signature. Its legible labels and structural grid carry the concept, supported by typography rather than decorative type. |
| Ecosystem consistency | Inter, the neutral surfaces, label hierarchy and data colours extend from public entry to assessment, results, tiers, billing, payment states and the report identity specimen. |
| Readability, accessibility and functionality | The audited samples contain no visible text below 12px and no automated WCAG violations. Exact-width screenshots and targeted layout checks confirm the sampled responsive compositions. Existing product contracts continue to pass. |

The remaining tradeoff is that larger supporting text makes the mobile result longer. All domain data stays visible. The specimen is still an isolated report design, and the underlying live report generator remains untouched.

## Verification and boundaries
The optimized build and typecheck pass. All 15 targeted regression suites pass, covering scoring, Snapshot integrity, adaptive contracts, consent, analytics/privacy, prices/entitlements, payment safety, commercial conversion, security contracts and presentation data integrity. See `regression-results.json` and the build/typecheck logs.

Rendered audit results are in `accessibility-typography-results.json`. They include the actual computed Inter heading family, visible-text checks and, for the later samples, actual viewport/overflow measurements. Earlier iframe checks have a two-pixel border inset; the final exact-width checks corrected that harness sizing. Some axe contrast/ARIA cases remain incomplete for manual review. Zero automated violations is not a full WCAG certification.

The correction does not change files under `src/lib`, `supabase`, `src/app/score/api` or `src/app/api`. Question content, scoring, branching, persistence, privacy, consent recording, analytics, prices, payments, orders and entitlements remain authoritative. Questionnaire code is not rewritten. Changes to private page files are text-size classes only. No live payment, order or notification was triggered.

Real database save/resume, branching, report generation and delivery remain unverified in this credential-free checkout, as before. The isolated fixtures and report identity are clearly labelled. Nothing was deployed or merged. This is ready for renewed design review; production remains outside the authorised scope.
