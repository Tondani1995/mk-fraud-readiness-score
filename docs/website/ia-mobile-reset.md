# Website information architecture and mobile reset

Branch: `website/ia-mobile-reset`

## Intent

Reduce cognitive load on the public website without changing the MK brand or any Fraud Readiness
product behaviour. The homepage now tells one commercial story:

1. Hero: what MK does, with two routes (Assess your organisation, Speak to MK)
2. Problem: controls are not the same as readiness (functions assembled into one management view)
3. How organisations work with MK: Assess, Build, Enable, Monitor
4. Fraud Readiness: the flagship assessment journey and one primary CTA
5. Why MK: supportable evidence only, with empty-by-default slots for approved proof
6. When to bring MK in: six trigger conditions and the closing CTA

## Sources of truth

- `src/lib/website/capabilities.ts`: the four capabilities, the service lines beneath them, typical
  situations, engagement outputs and trigger conditions. Used by the homepage, Services and footer.
- `src/lib/website/proof.ts`: approved client logos, engagement examples and associations. Each list
  renders nothing while empty. Only add entries MK has permission to publish.

## Navigation

Primary: Services, Fraud Readiness, Insights, About, and the Speak to MK button. The logo goes home.
Industries and Contact are no longer primary items but remain live routes, linked from the footer,
the Services page and every Speak to MK CTA. The mobile sheet uses 56px rows and carries the
assessment CTA and Speak to MK beneath the links.

## Protected and unchanged

- All `/score/*` routes, assessment, Snapshot, payments, fulfilment and admin
- `/fraud-readiness`, `/fraud-readiness/advisory`, `/fraud-readiness-score`, `/industries`, `/contact`
- Legacy Services anchors: `#health-check`, `#programme-design`, `#controls`, `#awareness`,
  `#threat-intelligence`, `#services` (new: `#assess`, `#build`, `#enable`, `#monitor`)
- Sitemap, canonicals, JSON-LD, GA4 and Meta consent logic, contact and advisory forms
- GA4 event names: `cta_click`, `social_click`, `contact_click`

## Release-readiness polish

- Cookie consent is a floating card: one row on wide desktops, about 156px tall on phones. It reserves
  matching bottom padding while it is open, so no content stays hidden behind it. Consent keys, events,
  the unticked advertising opt-in and the full advertising explanation (behind "Details") are unchanged.
- The footer brand mark loads eagerly at its rendered size (48px), so it is never blank mid-scroll.
- Public copy makes no claim about MBA research. Practitioner positioning: Fraud Readiness is built
  from operational fraud experience and practitioner insight.
- The Insights topic filter scrolls sideways within its own row. An edge fade, a chevron and a
  "Swipe sideways for more topics" cue appear only while more topics are out of view.
- Mobile editorial trims: shorter problem copy, step detail on the homepage Fraud Readiness journey
  shown from the `sm` breakpoint up, compact Services jump grid, and single-service capabilities
  named rather than re-described.

## Removed because they could not be supported

- "15+ years experience", "ROI-driven", "Measurable results" (homepage proof cards)
- Five-star rating and "Trusted by organisations across South Africa" (Services hero)
- "50+ articles", "15k+ monthly readers", "100+ patterns", "25+ case studies" (Insights)
- Placeholder Insights featured report and placeholder article cards, including a
  "reduced procurement fraud by 60%" case study

## AI-enabled fraud and methodology transparency

Added inside the approved architecture, with no new primary navigation item.

- `src/lib/website/ai-fraud.ts` holds the vectors, the readiness conditions, the cited evidence and
  the named public sources. Every figure on `/ai-fraud-readiness` cites INTERPOL, ACFE and SAS, or
  SABRIC. No figure is MK's own and none is estimated.
- `FRAUD_READINESS_AI_COVERAGE` records what the live instrument covers today.
  `explicitAiQuestions` is false: the seeded questionnaire (migrations 0002 and 0009) assesses
  identity verification, digital monitoring, phishing and impersonation training, supplier payment
  verification and periodic review of emerging digital fraud risk, but no question names deepfakes,
  voice cloning, synthetic identities or generative AI. The page says so in as many words. When the
  instrument is expanded, set the flag, update `coveredToday`, and the contract test will confirm
  the public wording matches the seed.
- Assess, Build, Enable and Monitor now carry AI-enabled fraud in their summaries, situations and
  outputs, and the homepage trigger list includes the control-testing trigger with a contextual link.
- `/ai-fraud-readiness` carries its own metadata, canonical, Service and FAQPage structured data,
  and a sitemap entry. It is linked from Services (Assess and Monitor), the homepage triggers, the
  Insights hero and the footer.

### Methodology transparency

`src/lib/website/methodology.ts` carries the public statements and the verification notes naming
each module checked. Verified before publication:

| Claim | Verified in |
| --- | --- |
| Score is a pure calculation from recorded answers and methodology version | `src/lib/scoring/scoring-engine.ts` |
| Maturity from defined thresholds, with critical-control caps | `src/lib/scoring/maturity-band.ts`, engine cap events |
| Gaps are rule-based and read from persisted fields | engine question and domain traces, `src/lib/snapshot/gap-inventory.ts` |
| Next step is a pure rule evaluation, reason always shown | `src/lib/snapshot/next-step-recommendation.ts` |
| AI writes interpretation only, from a brief that excludes numerical diagnostics, with deterministic fallback | `src/lib/snapshot/narrative.ts` |
| Report prose cannot introduce an unsupported figure | `src/lib/reports/narrative/validation.ts` (`unsupported_numeric_claim`) |

`MethodologyTrust` renders this as "How your result is produced" on `/fraud-readiness` and
`/ai-fraud-readiness`. It states that AI does not determine the result and never claims the platform
uses no AI at all. `npm run website:test-ai-fraud-methodology` fails if the engine, the narrative
boundary, the questionnaire or the public wording drift apart.
