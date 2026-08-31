# V1.2 Premium Experience Recovery — Owner Brief

Date: 2026-09-01
Base SHA: 8376242581772153c897687af3acd4da436509eb
Branch: cx/v12-premium-experience-recovery-20260901

## Owner decision

The current customer-facing Fraud Readiness experience is not commercially acceptable. This is not a minor styling pass. Rebuild the presentation layer so the product can credibly sit alongside premium consulting assessment products in 2026.

Production customer starts are paused. Do not re-enable them or deploy this branch until owner visual acceptance.

## Preserve

Do not change scoring, methodology, adaptive applicability, report logic, report length, report content, pricing, manual EFT fulfilment, internal-only automated email, Terms, Advisory/Contact persistence, sitemap, security controls, migrations, payment state model, or report generation. The 16-page Essential report is accepted and is not part of this recovery.

Google Analytics configuration remains deferred.

## Experience problems to fix

1. The Fraud Readiness storefront is visually weak and must be redesigned from first principles, not polished.
2. The current hero is a large navy text block with excessive copy and no tangible product preview.
3. Essential, Comprehensive and Advisory cards look like generic bordered document columns and do not communicate materially different value.
4. The current comparison table is procurement-like and dominates the page.
5. Public/customer copy overuses em dashes. Remove the em dash character from public Fraud Readiness surfaces and add a regression test.
6. The assessment must never expose a global questionnaire denominator such as “1 of 68”. Preserve adaptive logic internally, but show product-appropriate progress by percentage/area/stage without advertising a fixed total.
7. The assessment itself needs a premium visual redesign: clearer hierarchy, better answer-choice treatment, stronger area/progress context, restrained save state, strong mobile behaviour.
8. The homepage still shows visible white edge/seam/gutter artefacts. Remove them and prove true full-bleed sections at common desktop and mobile widths.
9. The Snapshot score gauge is visually broken at 100: the number must sit correctly within the gauge at every supported width and score length.
10. Snapshot commercial cards are better than the storefront but still too visually homogeneous. Keep the stronger Snapshot architecture and improve product differentiation with a richer restrained palette and hierarchy.
11. Storefront, assessment, Snapshot, order journey and public Advisory intake must look like one product family.

## Design direction

Use MK navy as the anchor, not the only colour. Create a restrained executive palette with differentiated product accents and accessible contrast. Avoid garish gradients, neon, generic SaaS glassmorphism and stock consulting imagery.

The commercial story should be immediately understandable:

- Essential: Know where you stand.
- Comprehensive: Design what needs to change.
- Advisory: Work with MK to implement it.

Use a clear Diagnose → Design → Implement progression.

The storefront hero should be concise and product-led, with a real or faithful visual preview of the Fraud Readiness experience (Snapshot score, domain profile, priority action or similar) rather than a wall of copy.

Product cards should feel like premium service experiences, not equal white pricing boxes. Each tier should have its own visual identity, concise outcome, price/commercial cue, key deliverables and CTA. Comprehensive must feel like a material step up from Essential. Advisory must feel bespoke and high-touch.

Keep detailed comparison information available, but make it secondary and elegant (progressive disclosure or a refined comparison section), not the main visual centre of the page.

Methodology, self-reporting and assurance limitations remain important, but move them into a polished scope/methodology disclosure near the bottom rather than allowing caveats to dominate the sales narrative.

## Assessment progress contract

Never show “Question X of 68”, “X of 68”, or any other fixed global questionnaire denominator to the customer.

When adaptive scope is unresolved, show a message such as “We’re tailoring the assessment to your organisation” plus a non-misleading progress cue.

Once scope is resolved, use percentage completion and current area/domain, not a raw question total. The underlying adaptive scoring and applicability counts remain unchanged.

## Copy contract

Customer-facing Fraud Readiness pages must use concise, natural business prose. No em dash character (U+2014) anywhere on public/customer Fraud Readiness surfaces. Avoid implementation/internal terms.

## Visual acceptance

CI green is not visual acceptance.

Before owner review, produce real rendered screenshots from the exact candidate for:
- homepage desktop/mobile;
- Fraud Readiness storefront desktop/mobile;
- assessment start desktop/mobile;
- live adaptive question early/mid/late desktop/mobile;
- assessment completion/review;
- Snapshot desktop/mobile at scores 100, 60 and 20;
- Snapshot product section desktop/mobile;
- Essential order journey desktop/mobile;
- Comprehensive order journey desktop/mobile;
- public Advisory intake desktop/mobile.

Use at least 1440 desktop and representative mobile widths. Include a 100-score Snapshot specifically.

No Production deployment or customer-start reactivation until owner explicitly accepts the screenshots.

## Engineering acceptance

Add focused regression tests for:
- no public/customer em dash;
- no fixed global question denominator;
- adaptive progress semantics;
- 100-score gauge containment/alignment;
- full-bleed homepage boundaries/no legacy wrapper gutters;
- tier visual variants and accessible contrast hooks;
- preserved prices/routes/manual fulfilment;
- no changes to report generation;
- mobile layout invariants.

Run V1 Verification, Joint Launch and V7 Report Hardening unchanged, plus typecheck, lint, build, audit and git diff --check.

Return: V1.2 PREMIUM EXPERIENCE RECOVERY — OWNER VISUAL REVIEW READY
with exact SHA, changed files, screenshots and regression evidence.
