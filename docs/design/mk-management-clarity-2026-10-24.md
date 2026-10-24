# MK Clarity: design direction
24 October 2026 · Local development review

The chosen direction is **The Living Exposure System**, with the typography of Editorial Intelligence and the restraint of Precision and Executive Clarity. MK's subject is the relationship between exposure, controls and accountability. The signature device makes those relationships visible rather than illustrating generic digital security.

## Creative territories
These are qualitative design judgements, not measured conversion results. Scores run from 1 to 5.

| Criterion | Editorial Intelligence | Living Exposure System | Precision and Executive Clarity |
|---|---:|---:|---:|
| Originality and distinctiveness | 4 | 5 | 3 |
| Executive credibility | 5 | 4 | 5 |
| Usability and mobile suitability | 5 | 4 | 5 |
| Feasibility and maintenance | 5 | 4 | 5 |
| Commercial relevance | 4 | 5 | 4 |

Editorial Intelligence would communicate expertise well but could feel like another advisory publication. Precision would be dependable but less memorable. The Living Exposure System best explains what MK contributes. Editorial hierarchy and restrained motion keep it credible and usable.

## Identity and signature
The existing logo, navy (#001030) and institutional positioning remain. Paper (#F4F5F0), sage (#C8D9BF), green (#55735B) and fine structural rules give the identity a quieter, more analytical expression. Sage extends a colour already present on the live website. There is no change to the logo or trading identity.

Manrope is self-hosted under the included Open Font License. It replaces Poppins, confirmed in the original root layout. Georgia supplies editorial italics without another font download. The existing Tailwind tokens and architecture remain; semantic Clarity surface classes supply the new system. No animation library, image generator or WebGL was added.

The homepage's Exposure / Controls / Decisions illustration uses named organisational functions and control contexts. Selection changes the explanatory view and assembly treatment. It is labelled as a method illustration and carries no result data. The questionnaire uses an assembling completion strip, explicitly separate from readiness findings. The Snapshot's domain map reads persisted domain values without thresholds, ranking or scoring. The isolated report cover repeats the same process-to-decision axis.

Layout uses a 1:2 editorial grid, an approximately balanced hero, generous section spacing, 3–4px control corners and one-pixel rules. Mobile uses a single reading column, large answer targets, full-width primary actions and all domain results. Motion is limited to short relationship and selection transitions; reduced-motion rules remove it.

## Implementation scope and critical review
The homepage, shared website chrome, services hero, readiness storefront, illustrative Snapshot, assessment shell, organisation profile, questionnaire framing, real Snapshot presentation, product cards, billing and payment presentation share this system. Existing supporting-page content and routes remain; those pages inherit typography and shared controls rather than receiving unnecessary rewrites.

The result is more specific to MK and explains its proposition with a visible model. The calm questionnaire is a stronger instrument than the previous repeated-header layout. The result map makes domain differences readable without concealing unscored areas. The main remaining design limits are the existing fallback Snapshot narrative, supporting-page compositions that retain more of their original structure, and the report generator. A fully connected transition into a real persisted result needs staging validation. The report specimen is a design extension, not a redesigned live PDF product.

The supplied X reference returned an access error. This work does not claim to reproduce or analyse its inaccessible visual content.

## Local review
Run Node 24 and npm ci, npm run build, then VERCEL_ENV=preview npm run start. Open /design-review. See this task’s review deliverables for tests, screenshots and release blockers. Production release is not authorized.
