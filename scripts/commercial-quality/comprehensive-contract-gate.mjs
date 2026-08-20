#!/usr/bin/env node
/**
 * Comprehensive product-contract gate.
 *
 * Freezes three things at once, deterministically and with no provider calls:
 *
 *   1. The commercial contract — one automated analytical product, no human
 *      review, and no customer-facing copy that promises review or validation.
 *   2. The assurance boundary — the report may say what management should
 *      obtain; it may never say MK obtained it.
 *   3. The fulfilment boundary — a Comprehensive order must be fulfillable from
 *      a verified payment and a completed assessment. No reviewer assignment, no
 *      sign-off, no evidence intake, no manual approval.
 *
 * Reviewer and evidence-validation code is allowed to exist for future Advisory
 * work. It is not allowed to be imported by the Comprehensive analytical or
 * report path.
 *
 * Usage:
 *   npm run v11:comprehensive-contract-gate
 */
import fs from 'node:fs';
import path from 'node:path';
import { COMMERCIAL_CATALOGUE } from '../../src/lib/commercial/product-catalogue.ts';
import {
  COMPREHENSIVE_PRODUCT_CONTRACT,
  COMPREHENSIVE_MUST_NOT_CLAIM,
  COMPREHENSIVE_PROVENANCE_RULES,
  claimsVerification
} from '../../src/lib/reports/comprehensive/product-contract.ts';

const root = process.cwd();
const violations = [];

// ---- 1. Commercial contract ------------------------------------------------
const comprehensive = COMMERCIAL_CATALOGUE.comprehensive;
if (comprehensive.fulfilmentModel !== 'automated_analytical') {
  violations.push({ code: 'FULFILMENT_MODEL', detail: `expected automated_analytical, found ${comprehensive.fulfilmentModel}` });
}
if (comprehensive.priceCents !== 3_500_000 || comprehensive.currency !== 'ZAR' || comprehensive.vatInclusive !== true) {
  violations.push({ code: 'PRICE_CONTRACT', detail: `${comprehensive.priceCents} ${comprehensive.currency} vatInclusive=${comprehensive.vatInclusive}` });
}
// Customer copy may state the boundary; it may not promise the service.
const copyClauses = [comprehensive.summary, ...comprehensive.includes]
  .flatMap((entry) => String(entry).split(/(?<=[.;])\s+/))
  .filter((clause) => !/\b(no|not|never|without)\b/i.test(clause));
for (const promise of [/reviewer/i, /reviewed/i, /sign-?off/i, /validat/i, /assurance/i, /\baudit\b/i, /independently/i]) {
  const offending = copyClauses.find((clause) => promise.test(clause));
  if (offending) violations.push({ code: 'COPY_PROMISES_REVIEW', detail: `${promise} in "${offending.slice(0, 100)}"` });
}

// ---- 2. Assurance boundary -------------------------------------------------
// The permitted voice must pass and the prohibited voice must fail, so the
// distinction is grammatical person rather than vocabulary.
for (const permitted of COMPREHENSIVE_PRODUCT_CONTRACT.permittedEvidenceVoice) {
  const probe = `${permitted} the supplier bank-detail change control.`;
  if (claimsVerification(probe).violation) {
    violations.push({ code: 'PERMITTED_VOICE_REJECTED', detail: probe });
  }
}
for (const prohibited of COMPREHENSIVE_PRODUCT_CONTRACT.prohibitedEvidenceVoice) {
  const probe = `${prohibited} the supplier bank-detail change control.`;
  if (!claimsVerification(probe).violation) {
    violations.push({ code: 'PROHIBITED_VOICE_ACCEPTED', detail: probe });
  }
}
if (COMPREHENSIVE_MUST_NOT_CLAIM.length === 0) {
  violations.push({ code: 'EMPTY_BOUNDARY', detail: 'the must-not-claim list is empty' });
}
// No provenance class may assert verification, and library content may not be
// presented as a fact about the organisation.
for (const [origin, rule] of Object.entries(COMPREHENSIVE_PROVENANCE_RULES)) {
  if (rule.mayAssertVerification) violations.push({ code: 'PROVENANCE_ALLOWS_VERIFICATION', detail: origin });
}
if (COMPREHENSIVE_PROVENANCE_RULES.CONTROL_LIBRARY.mayAssertOrganisationFact) {
  violations.push({ code: 'LIBRARY_AS_ORGANISATION_FACT', detail: 'CONTROL_LIBRARY must not assert an organisation fact' });
}

// ---- 3. Fulfilment boundary ------------------------------------------------
/**
 * The Comprehensive analytical and report path. The engagement services under
 * src/lib/comprehensive/ are the retired reviewed pipeline, retained for
 * Advisory; they are deliberately not in this list.
 */
const ANALYTICAL_PATH = ['src/lib/reports/comprehensive', 'src/lib/reports/evidence-model'];
const REVIEWER_IMPORTS = [
  /from '.*comprehensive\/engagement-service'/,
  /from '.*comprehensive\/evidence-service'/,
  /from '.*comprehensive\/review-record-service'/,
  /from '.*comprehensive\/generation-service'/,
  /from '.*commercial\/comprehensive-lifecycle'/
];
const REVIEWER_STATE = [/\breview_incomplete\b/, /\breviewer sign-?off\b/i, /\bsignOffStatement\b/, /\bawaiting reviewer\b/i];

function walk(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

/** The contract module names the forbidden dependencies; it is the specification, not a consumer. */
const CONTRACT_SPECIFICATION = 'src/lib/reports/comprehensive/product-contract.ts';

for (const dir of ANALYTICAL_PATH) {
  for (const file of walk(path.join(root, dir))) {
    const relative = path.relative(root, file);
    if (relative === CONTRACT_SPECIFICATION) continue;
    const source = fs.readFileSync(file, 'utf8');
    for (const pattern of REVIEWER_IMPORTS) {
      if (pattern.test(source)) violations.push({ code: 'ANALYTICAL_PATH_IMPORTS_REVIEWER', detail: `${relative} matches ${pattern}` });
    }
    for (const pattern of REVIEWER_STATE) {
      // A comment explaining that reviewer state is excluded is not a dependency.
      const codeOnly = source.split('\n').filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line)).join('\n');
      if (pattern.test(codeOnly)) violations.push({ code: 'ANALYTICAL_PATH_USES_REVIEWER_STATE', detail: `${relative} matches ${pattern}` });
    }
  }
}

const summary = {
  contractVersion: COMPREHENSIVE_PRODUCT_CONTRACT.version,
  product: COMPREHENSIVE_PRODUCT_CONTRACT.product,
  checks: {
    commercialContract: 'automated_analytical, R35,000 incl VAT, no review promised in customer copy',
    assuranceBoundary: `${COMPREHENSIVE_PRODUCT_CONTRACT.permittedEvidenceVoice.length} permitted voices accepted, ${COMPREHENSIVE_PRODUCT_CONTRACT.prohibitedEvidenceVoice.length} prohibited voices rejected`,
    provenanceClasses: Object.keys(COMPREHENSIVE_PROVENANCE_RULES).length,
    fulfilmentBoundary: `${ANALYTICAL_PATH.join(', ')} free of reviewer dependency`
  },
  violations: violations.length,
  violationDetail: violations
};

const outDir = process.env.CERT_OUTPUT_DIR ?? '/Users/tondani/Documents/Codex/outputs/comprehensive-phase0-discovery';
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'comprehensive-contract-gate.json'), `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));

if (violations.length) {
  console.error(`\nFAIL: ${violations.length} Comprehensive contract violation(s).`);
  process.exit(1);
}
console.log('\nPASS: Comprehensive is automated, unreviewed, and its analytical path carries no reviewer dependency.');
