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
  'src/components/assessment/FreeSnapshot.tsx',
  'src/components/products/TierComparison.tsx',
  'src/lib/snapshot/commercial-insights.ts',
  'src/lib/commercial/product-catalogue.ts',
  'src/app/score/snapshot/[assessmentRef]/page.tsx'
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
  { code: 'COSTED', pattern: /\bcosted\s+(?:options|estimates?|implementation)\b/i }
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
      const exemption = EXEMPTIONS.find((entry) => entry.pattern.test(line));
      if (exemption) continue;
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
  'The named reviewer signs off the Comprehensive deliverable package.'
];
const POSITIVE = [
  'No evidence is independently validated and no assurance opinion is provided.',
  'Comprehensive does not include independent validation.',
  'Independent validation is available through MK Advisory.',
  'They do not independently validate evidence, test whether controls operate, or provide an assurance opinion.',
  'Management should obtain independent assurance over the strongest self-reported claims.'
];
const fires = (text) => PROHIBITED.some((rule) => rule.pattern.test(text)) && !EXEMPTIONS.some((entry) => entry.pattern.test(text));
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
