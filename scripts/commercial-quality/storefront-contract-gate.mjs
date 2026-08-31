#!/usr/bin/env node
/**
 * Storefront contract gate — zero provider calls.
 *
 * Every gate built for the report engines polices what the PDFs say. None
 * policed the shop window, so the free snapshot page sold "MK QUALITY REVIEW",
 * "Expert quality review", "Comprehensive verifies" and "Reports are reviewed
 * before release" on the same page that correctly stated no evidence is
 * independently validated. That contradiction reached owner review intact.
 *
 * This gate reads the customer-facing sales surfaces used by the assessment
 * journey and rejects assurance, review, validation and costing promises made
 * about the automated tiers.
 *
 * It is sense-aware, because the same words are legitimate in three other
 * constructions:
 *   - a denial            "Comprehensive does not include independent validation"
 *   - an Advisory offer   "Independent validation is available through Advisory"
 *   - a customer action   "management should verify", "obtain independent assurance"
 * Only a promise attached to an automated tier is a violation.
 *
 * Usage:
 *   npm run v11:storefront-contract-gate
 */
import fs from 'node:fs';
import path from 'node:path';

/** Customer-facing sales surfaces reachable from the assessment journey. */
const SURFACES = [
  // The Snapshot result experience. FreeSnapshot.tsx was replaced by these files; the gate
  // follows the customer surface rather than the old filename.
  'src/components/assessment/SnapshotResult.tsx',
  'src/components/assessment/ScoreGauge.tsx',
  'src/components/products/ProductChoice.tsx',
  'src/components/commercial/OrderJourney.tsx',
  'src/lib/snapshot/result-copy.ts',
  'src/lib/snapshot/gap-inventory.ts',
  'src/lib/snapshot/next-step-recommendation.ts',
  'src/app/score/order/new/page.tsx',
  'src/components/products/TierComparison.tsx',
  'src/lib/snapshot/commercial-insights.ts',
  'src/lib/commercial/product-catalogue.ts',
  'src/app/score/snapshot/[assessmentRef]/page.tsx',
  'src/app/score/start/page.tsx',
  // The public storefront reached before an assessment exists. It sells the same three products,
  // so it is policed by the same contract as the in-journey surfaces.
  'src/app/(website)/fraud-readiness/page.tsx',
  'src/components/website/FraudReadiness/FraudReadinessOptions.tsx',
  'src/components/website/FraudReadiness/FraudReadinessComparison.tsx',
  'src/lib/commercial/storefront-presentation.ts',
  // The public MK Advisory intake sells the Advisory engagement, so it is policed too.
  'src/app/(website)/fraud-readiness/advisory/page.tsx',
  'src/components/website/FraudReadiness/PublicAdvisoryEnquiryForm.tsx',
  'src/app/score/order/[assessmentRef]/page.tsx',
  'src/components/comprehensive/CustomerOrderStatusWorkspace.tsx'
];

/** Promises the automated tiers cannot keep. */
const PROHIBITED = [
  { code: 'HUMAN_REVIEW', pattern: /\b(?:MK\s+)?quality[- ]review(?:ed|s)?\b/i },
  { code: 'HUMAN_REVIEW', pattern: /\bexpert\s+(?:quality\s+)?review\b/i },
  { code: 'HUMAN_REVIEW', pattern: /\breviewed\s+before\s+release\b/i },
  { code: 'HUMAN_REVIEW', pattern: /\bnamed\s+reviewer\b/i },
  { code: 'HUMAN_REVIEW', pattern: /\breviewer\s+(?:validation|sign[- ]off)\b/i },
  { code: 'VERIFICATION', pattern: /\bComprehensive\s+verifies\b/i },
  { code: 'VERIFICATION', pattern: /\bindependently\s+validat(?:es|ed|ion)\b/i },
  { code: 'ASSURANCE', pattern: /\bassurance\s+opinion\b/i },
  { code: 'ASSURANCE', pattern: /\blevel\s+of\s+assurance\s+you\s+need\b/i },
  { code: 'COSTED', pattern: /\bcosted\s+(?:options|estimates?|implementation)\b/i },
  { code: 'HUMAN_REVIEW', pattern: /\bdeeper\s+MK\s+review\b/i },
  { code: 'UNAPPROVED_PRODUCT', pattern: /\bFraud\s+Health\s+Check\b/i },
  { code: 'INTERNAL_LANGUAGE', pattern: /\bprivate\s+access\s+authority\b/i },
  { code: 'INTERNAL_LANGUAGE', pattern: /\bno\s+customer\s+portal\s+is\s+created\b/i },
  { code: 'HUMAN_REVIEW', pattern: /\bafter\s+quality\s+review\b/i },
  { code: 'VERIFICATION', pattern: /\bevidence-review\s+progress\b/i }
];

/**
 * Constructions in which the same words are truthful.
 *
 * Checked against the whole line, because a denial or an Advisory attribution
 * commonly sits either side of the matched phrase.
 */
const EXEMPTIONS = [
  { name: 'denial', pattern: /\b(?:no|not|never|does not|do not|without|neither|nor)\b/i },
  { name: 'advisory', pattern: /\badvisory\b/i },
  { name: 'customer-action', pattern: /\b(?:management|leadership|you|customer)\s+(?:should|can|may|must)\b/i },
  { name: 'code-comment', pattern: /^\s*(?:\*|\/\/|\/\*)/ }
];

/**
 * Exemptions answer "is this promise being denied or attributed to Advisory?",
 * which only makes sense for a promise. Internal-language and unapproved-product
 * findings are not promises, so they are never exempt — "No customer portal is
 * created here" was escaping purely because the denial rule matched its "No".
 */
const EXEMPTIBLE = new Set(['HUMAN_REVIEW', 'VERIFICATION', 'ASSURANCE', 'COSTED']);

const violations = [];
const scanned = [];

for (const surface of SURFACES) {
  if (!fs.existsSync(surface)) { scanned.push({ surface, status: 'absent' }); continue; }
  const lines = fs.readFileSync(surface, 'utf8').split('\n');
  let hits = 0;
  lines.forEach((line, index) => {
    for (const rule of PROHIBITED) {
      const match = line.match(rule.pattern);
      if (!match) continue;
      if (EXEMPTIBLE.has(rule.code) && EXEMPTIONS.some((entry) => entry.pattern.test(line))) continue;
      if (!EXEMPTIBLE.has(rule.code) && /^\s*(?:\*|\/\/|\/\*)/.test(line)) continue;
      hits += 1;
      violations.push({ surface, line: index + 1, code: rule.code, text: line.trim().slice(0, 150), matched: match[0] });
    }
  });
  scanned.push({ surface, status: 'scanned', lines: lines.length, hits });
}

/**
 * Controls. The gate must catch the phrases owner review actually found, and
 * must stay silent on the three legitimate constructions.
 */
const NEGATIVE = [
  '<Badge>MK quality review</Badge>',
  "'Expert quality review',",
  'Essential diagnoses. Comprehensive verifies, interprets and makes it board-ready.',
  'Paid reports are subject to MK quality review before release.',
  "'Reports are reviewed before release'",
  'Leadership decision library with costed options and trade-offs',
  'Payment → evidence request → reviewer validation → deliverable package',
  'The named reviewer signs off the Comprehensive deliverable package.',
  'the areas that deserve deeper MK review',
  'request the detailed MK report or a fuller Fraud Health Check',
  'MK will make the report available through the private access authority after quality review.',
  'A focused view of payment and, for Comprehensive, evidence-review progress. No customer portal is created here.'
];
const POSITIVE = [
  'No evidence is independently validated and no assurance opinion is provided.',
  'Comprehensive does not include independent validation.',
  'Independent validation is available through MK Advisory.',
  'They do not independently validate evidence, test whether controls operate, or provide an assurance opinion.',
  'Management should obtain independent assurance over the strongest self-reported claims.'
];
const fires = (text) => PROHIBITED.some((rule) => rule.pattern.test(text)
  && (!EXEMPTIBLE.has(rule.code) || !EXEMPTIONS.some((entry) => entry.pattern.test(text))));
const missedDefects = NEGATIVE.filter((text) => !fires(text));
const falsePositives = POSITIVE.filter((text) => fires(text));
for (const text of missedDefects) violations.push({ surface: 'NEGATIVE-CONTROL', code: 'CONTROL_DID_NOT_FIRE', text });
for (const text of falsePositives) violations.push({ surface: 'POSITIVE-CONTROL', code: 'FALSE_POSITIVE', text });

const summary = {
  surfaces: scanned.length,
  violations: violations.length,
  negativeControl: missedDefects.length ? `FAIL (${missedDefects.length} defect phrase(s) not caught)` : `PASS (${NEGATIVE.length}/${NEGATIVE.length} caught)`,
  positiveControl: falsePositives.length ? `FAIL (${falsePositives.length} legitimate phrase(s) flagged)` : `PASS (${POSITIVE.length}/${POSITIVE.length} allowed)`,
  scanned, violationDetail: violations
};
const outDir = process.env.CERT_OUTPUT_DIR ?? 'outputs/product-owner-acceptance/correction-review';
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'storefront-contract.json'), `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify({ surfaces: summary.surfaces, violations: summary.violations, negativeControl: summary.negativeControl, positiveControl: summary.positiveControl }, null, 2));

if (violations.length) {
  console.error(`\nFAIL: ${violations.length} storefront-contract violation(s).`);
  for (const violation of violations.slice(0, 10)) console.error(`  ${violation.surface}:${violation.line ?? '-'} ${violation.code}: ${violation.text}`);
  process.exit(1);
}
console.log('\nPASS: the storefront promises only what the automated products deliver.');
