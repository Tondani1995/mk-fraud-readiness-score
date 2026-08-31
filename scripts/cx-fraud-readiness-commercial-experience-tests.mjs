/**
 * Fraud Readiness commercial experience contract tests.
 *
 * Credential-free, no database, no network. Everything asserted here is a property of the source:
 * what the storefront reads its prices from, where its CTAs route, what the start API refuses, and
 * what the acceptance record must contain.
 *
 * The database trigger that independently refuses an unaccepted adaptive assessment is asserted
 * against the migration text rather than a live connection, so this suite stays runnable by anyone.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  ADVISORY_PRICE_FROM_CENTS,
  COMMERCIAL_CATALOGUE,
  COMPREHENSIVE_PRICE_CENTS,
  ESSENTIAL_PRICE_CENTS
} from '../src/lib/commercial/product-catalogue.ts';
import {
  STOREFRONT_COMPARISON,
  STOREFRONT_TIERS,
  storefrontCard,
  storefrontCards,
  storefrontPriceLabel
} from '../src/lib/commercial/storefront-presentation.ts';
import { parseProductIntent, productIntentStorageKey } from '../src/lib/commercial/product-intent.ts';
import {
  FRAUD_READINESS_TERMS_VERSION,
  PRIVACY_NOTICE_VERSION,
  REQUIRED_ACKNOWLEDGEMENTS,
  REQUIRED_LEGAL_ACCEPTANCE,
  buildLegalAcceptanceRecord,
  isCurrentLegalAcceptance
} from '../src/lib/legal/fraud-readiness-terms.ts';
import { FRAUD_READINESS_TERMS_SECTIONS } from '../src/lib/legal/fraud-readiness-terms-content.ts';
import {
  parseAdaptiveStartAssessmentInput,
  parseStartAssessmentInput
} from '../src/lib/respondent/validation.ts';

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

/**
 * Source with comments removed. Copy assertions police what a customer sees, and a code comment
 * that explains which phrases were removed must not itself count as one of them.
 */
const readCopy = (relativePath) =>
  read(relativePath).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

let checks = 0;
const failures = [];
function check(label, fn) {
  try {
    fn();
    checks += 1;
    console.log(`  ok - ${label}`);
  } catch (error) {
    failures.push({ label, error });
    console.error(`  FAIL - ${label}: ${error.message}`);
  }
}

const STOREFRONT_PAGE = 'src/app/(website)/fraud-readiness/page.tsx';
const OPTIONS_COMPONENT = 'src/components/website/FraudReadiness/FraudReadinessOptions.tsx';
const COMPARISON_COMPONENT = 'src/components/website/FraudReadiness/FraudReadinessComparison.tsx';
const START_PAGE = 'src/app/score/start/page.tsx';
const START_FORM = 'src/components/adaptive/AdaptiveStartForm.tsx';
const TERMS_GATE = 'src/components/adaptive/FraudReadinessTermsGate.tsx';
const ADAPTIVE_SERVER = 'src/lib/adaptive/server.ts';
const MIGRATION = 'supabase/migrations/20260831200000_fraud_readiness_terms_acceptance.sql';

console.log('fraud readiness commercial experience');

// --- CATALOGUE AUTHORITY ------------------------------------------------------------------------

check('storefront price labels are formatted from the catalogue in ZAR', () => {
  const essential = storefrontCard('essential');
  assert.ok(/^R/.test(essential.priceLabel), 'a ZAR price must be shown');
  assert.ok(/incl\. VAT$/.test(essential.priceLabel));
  const comprehensive = storefrontCard('comprehensive');
  assert.ok(/incl\. VAT$/.test(comprehensive.priceLabel));
  const advisory = storefrontCard('advisory');
  assert.ok(/^From /.test(advisory.priceLabel));
  assert.ok(/excl\. VAT$/.test(advisory.priceLabel));
});

check('storefront prices track the catalogue values exactly', () => {
  const digits = (value) => value.replace(/[^0-9]/g, '');
  assert.equal(digits(storefrontPriceLabel('essential')), String(ESSENTIAL_PRICE_CENTS / 100));
  assert.equal(digits(storefrontPriceLabel('comprehensive')), String(COMPREHENSIVE_PRICE_CENTS / 100));
  assert.equal(digits(storefrontPriceLabel('advisory')), String(ADVISORY_PRICE_FROM_CENTS / 100));
});

check('no customer-facing storefront file carries a price literal', () => {
  const amounts = [
    String(ESSENTIAL_PRICE_CENTS / 100),
    String(COMPREHENSIVE_PRICE_CENTS / 100),
    String(ADVISORY_PRICE_FROM_CENTS / 100),
    '7,500', '7 500', '35,000', '35 000', '150,000', '150 000',
    String(ESSENTIAL_PRICE_CENTS), String(COMPREHENSIVE_PRICE_CENTS), String(ADVISORY_PRICE_FROM_CENTS)
  ];
  for (const surface of [STOREFRONT_PAGE, OPTIONS_COMPONENT, COMPARISON_COMPONENT, START_PAGE]) {
    const source = read(surface);
    for (const amount of amounts) {
      assert.ok(!source.includes(amount), `${surface} contains the price literal "${amount}"`);
    }
  }
});

check('storefront card deliverables come from the catalogue includes list', () => {
  for (const tier of STOREFRONT_TIERS) {
    const card = storefrontCard(tier);
    const catalogueIncludes = COMMERCIAL_CATALOGUE[tier].includes;
    for (const item of card.includes) {
      assert.ok(catalogueIncludes.includes(item), `${tier} card lists "${item}" which is not in the catalogue`);
    }
  }
});

check('storefront card labels come from the catalogue', () => {
  for (const tier of STOREFRONT_TIERS) {
    assert.equal(storefrontCard(tier).label, COMMERCIAL_CATALOGUE[tier].label);
  }
});

// --- ROUTING ------------------------------------------------------------------------------------

check('Essential and Comprehensive CTAs route into /score/start with bounded product intent', () => {
  const essential = storefrontCard('essential');
  assert.equal(essential.ctaLabel, 'Start Essential assessment');
  assert.equal(essential.ctaHref, '/score/start?product=essential');
  const comprehensive = storefrontCard('comprehensive');
  assert.equal(comprehensive.ctaLabel, 'Start Comprehensive assessment');
  assert.equal(comprehensive.ctaHref, '/score/start?product=comprehensive');
});

check('Advisory CTA is an enquiry and never enters self-service order creation', () => {
  const advisory = storefrontCard('advisory');
  assert.equal(advisory.ctaLabel, 'Discuss an Advisory engagement');
  assert.equal(advisory.selfServiceOrderable, false);
  assert.equal(COMMERCIAL_CATALOGUE.advisory.selfServiceOrderable, false);
  assert.equal(COMMERCIAL_CATALOGUE.advisory.productCode, null);
  assert.ok(!advisory.ctaHref.includes('/score/order'), 'Advisory CTA must not route into order creation');
  assert.ok(!advisory.ctaHref.includes('product='), 'Advisory must not carry a self-service product intent');
});

check('no storefront surface links Advisory into the order routes', () => {
  for (const surface of [STOREFRONT_PAGE, OPTIONS_COMPONENT, COMPARISON_COMPONENT]) {
    const source = read(surface);
    assert.ok(!source.includes('/score/order'), `${surface} must not link into order creation`);
    assert.ok(!source.includes('product=advisory'), `${surface} must not offer Advisory as a product intent`);
  }
});

check('the free Snapshot route is present and is not presented as a fourth paid tier', () => {
  const source = read(OPTIONS_COMPONENT);
  assert.ok(source.includes('Start with the free Snapshot'));
  assert.ok(source.includes('href="/score/start"'));
  const cards = storefrontCards();
  assert.equal(cards.length, 3);
  assert.deepEqual(cards.map((card) => card.tier), ['essential', 'comprehensive', 'advisory']);
});

check('the homepage hero offers the storefront alongside the assessment CTA', () => {
  const hero = read('src/components/website/Home/HeroSection.tsx');
  assert.ok(hero.includes('Assess Your Organisation'), 'primary assessment CTA must be preserved');
  assert.ok(hero.includes('href="/score/start"'));
  assert.ok(hero.includes('Compare Fraud Readiness Options'));
  assert.ok(hero.includes('href="/fraud-readiness"'));
});

check('Fraud Readiness sits immediately before Insights in navigation', () => {
  const navbar = read('src/components/website/Navbar.tsx');
  const fraudReadiness = navbar.indexOf('{ name: "Fraud Readiness", href: "/fraud-readiness" }');
  const insights = navbar.indexOf('{ name: "Insights", href: "/insights" }');
  assert.ok(fraudReadiness > -1, 'Fraud Readiness nav item is missing');
  assert.ok(insights > -1, 'Insights nav item is missing');
  assert.ok(fraudReadiness < insights, 'Fraud Readiness must precede Insights');
  // One `links` array drives both the desktop row and the mobile sheet.
  assert.equal(navbar.split('links.slice(1)').length - 1, 2, 'both navigations must render the shared links array');
});

// --- PRODUCT INTENT -----------------------------------------------------------------------------

check('valid product intent resolves to the paid tier', () => {
  assert.equal(parseProductIntent('essential'), 'essential');
  assert.equal(parseProductIntent('comprehensive'), 'comprehensive');
  assert.equal(parseProductIntent('  Essential  '), 'essential');
});

check('invalid or manipulated product intent fails safely to null', () => {
  for (const value of [
    'advisory', 'free', 'free_snapshot', 'ESSENTIAL_SELF_ASSESSMENT', '', ' ', 'essential; drop table',
    '../essential', 'essentialx', null, undefined, 0, 1, {}, [], ['essential'], true, 'null', '<script>'
  ]) {
    assert.equal(parseProductIntent(value), null, `product intent "${String(value)}" must not resolve`);
  }
});

check('product intent is browser-scoped per assessment and is not commercial state', () => {
  assert.equal(productIntentStorageKey('MKFR-1234'), 'mk.product-intent.MKFR-1234');
  assert.notEqual(productIntentStorageKey('MKFR-1234'), productIntentStorageKey('MKFR-5678'));
  const intentModule = read('src/lib/commercial/product-intent.ts');
  assert.ok(!intentModule.includes('supabase'), 'intent must not touch the database');
  assert.ok(!/\border\b/i.test(intentModule.replace(/\/\*[\s\S]*?\*\//g, '')), 'intent must not create orders');
});

check('the start page reads product intent through the safe parser only', () => {
  const source = read(START_PAGE);
  assert.ok(source.includes('parseProductIntent(searchParams?.product)'));
  assert.ok(source.includes('You selected'));
  assert.ok(/Completing the Fraud Readiness Assessment\s+is required/.test(source));
});

check('the Snapshot selector marks the earlier selection without removing any choice', () => {
  const source = read('src/components/products/ProductChoice.tsx');
  assert.ok(source.includes('readProductIntent(snapshot.assessmentReference)'));
  assert.ok(source.includes('You selected this earlier'));
  // Every tier still renders its own choose action.
  assert.ok(source.includes("['essential', 'comprehensive'] as SelfServicePaidTier[]"));
  assert.ok(source.includes('chooseAdvisory'));
  assert.ok(!source.includes('disabled={isEarlierSelection'), 'an earlier selection must not disable the other options');
});

// --- TERMS ACCEPTANCE ---------------------------------------------------------------------------

const validStart = {
  fullName: 'Thandi Nkosi',
  email: 'thandi@example.co.za',
  organisationName: 'Example Holdings',
  consentPrivacy: true,
  consentResearch: false
};

check('an adaptive assessment cannot be started without terms acceptance', () => {
  const result = parseAdaptiveStartAssessmentInput({ ...validStart });
  assert.equal(result.ok, false);
  assert.match(result.errors[0], /Fraud Readiness Assessment Terms and Privacy Notice must be accepted/);
});

check('a superseded, forged or partial acceptance is refused', () => {
  const rejected = [
    { termsVersion: 'FRA-TERMS-2000.0', privacyNoticeVersion: PRIVACY_NOTICE_VERSION },
    { termsVersion: FRAUD_READINESS_TERMS_VERSION, privacyNoticeVersion: 'anything' },
    { termsVersion: FRAUD_READINESS_TERMS_VERSION },
    { privacyNoticeVersion: PRIVACY_NOTICE_VERSION },
    { termsVersion: true, privacyNoticeVersion: true },
    'accepted',
    true,
    null
  ];
  for (const legalAcceptance of rejected) {
    const result = parseAdaptiveStartAssessmentInput({ ...validStart, legalAcceptance });
    assert.equal(result.ok, false, `acceptance ${JSON.stringify(legalAcceptance)} must be refused`);
    assert.equal(isCurrentLegalAcceptance(legalAcceptance), false);
  }
});

check('a current acceptance is accepted and carried through', () => {
  const result = parseAdaptiveStartAssessmentInput({ ...validStart, legalAcceptance: REQUIRED_LEGAL_ACCEPTANCE });
  assert.equal(result.ok, true);
  assert.equal(result.data.legalAcceptance.termsVersion, FRAUD_READINESS_TERMS_VERSION);
  assert.equal(result.data.legalAcceptance.privacyNoticeVersion, PRIVACY_NOTICE_VERSION);
});

check('the persisted acceptance record carries both versions and both timestamps', () => {
  const record = buildLegalAcceptanceRecord(new Date('2026-08-31T09:15:00.000Z'));
  assert.equal(record.termsVersion, FRAUD_READINESS_TERMS_VERSION);
  assert.equal(record.privacyNoticeVersion, PRIVACY_NOTICE_VERSION);
  assert.equal(record.termsAcceptedAt, '2026-08-31T09:15:00.000Z');
  assert.equal(record.privacyAcknowledgedAt, '2026-08-31T09:15:00.000Z');
});

check('acceptance timestamps are taken server-side, never from the client', () => {
  const server = read(ADAPTIVE_SERVER);
  assert.ok(server.includes('const legalAcceptance = buildLegalAcceptanceRecord();'));
  assert.ok(server.includes('terms_version: legalAcceptance.termsVersion'));
  assert.ok(server.includes('terms_accepted_at: legalAcceptance.termsAcceptedAt'));
  assert.ok(server.includes('privacy_notice_version: legalAcceptance.privacyNoticeVersion'));
  assert.ok(server.includes('privacy_acknowledged_at: legalAcceptance.privacyAcknowledgedAt'));
  assert.ok(!server.includes('input.legalAcceptance.termsAcceptedAt'), 'a client timestamp must never be persisted');
});

check('startAdaptiveAssessment re-checks acceptance at the write boundary', () => {
  const server = read(ADAPTIVE_SERVER);
  assert.ok(server.includes('if (!isCurrentLegalAcceptance(input.legalAcceptance)) throw new Error(TERMS_ACCEPTANCE_ERROR);'));
});

check('the database refuses a new adaptive assessment without acceptance', () => {
  const migration = read(MIGRATION);
  assert.ok(migration.includes('add column if not exists terms_version text'));
  assert.ok(migration.includes('add column if not exists terms_accepted_at timestamptz'));
  assert.ok(migration.includes('add column if not exists privacy_notice_version text'));
  assert.ok(migration.includes('add column if not exists privacy_acknowledged_at timestamptz'));
  assert.ok(migration.includes("raise exception 'adaptive_terms_acceptance_required'"));
  assert.ok(/before insert on public\.assessments/.test(migration));
  // Additive only: nothing may rewrite an existing respondent or assessment.
  assert.ok(!/\bupdate\s+public\.(assessments|respondents)\b/i.test(migration));
  assert.ok(!/\bdelete\s+from\b/i.test(migration));
  assert.ok(!/\bdrop\s+column\b/i.test(migration));
});

check('client-side state alone cannot start an assessment', () => {
  // The gate is a display surface: it neither posts nor holds a token the API would trust.
  const gate = read(TERMS_GATE);
  assert.ok(!gate.includes('fetch('), 'the terms gate must not itself create anything');
  assert.ok(!gate.includes('/score/api'), 'the terms gate must not call the start API');
  const route = read('src/app/score/api/adaptive/start/route.ts');
  assert.ok(route.includes('parseAdaptiveStartInput(body)'), 'the route must parse through the adaptive parser');
});

check('both mandatory acknowledgements are separate and affirmative', () => {
  assert.equal(REQUIRED_ACKNOWLEDGEMENTS.length, 2);
  assert.equal(REQUIRED_ACKNOWLEDGEMENTS[0].label, 'I have read and accept the Fraud Readiness Assessment Terms.');
  assert.equal(
    REQUIRED_ACKNOWLEDGEMENTS[1].label,
    'I acknowledge the Privacy Notice and understand how my information will be used to provide this service.'
  );
  const gate = read(TERMS_GATE);
  assert.ok(gate.includes('Fraud Readiness Terms'), 'the dialog must be titled Fraud Readiness Terms');
  assert.ok(gate.includes('Accept and continue'));
  assert.ok(gate.includes('Return to MK Fraud Insights'));
  assert.ok(gate.includes('const bothChecked = termsChecked && privacyChecked;'));
  assert.ok(gate.includes("event.preventDefault()"), 'Escape must not dismiss the gate');
  assert.ok(gate.includes("setAttribute('inert', '')"), 'the underlying form must be inert until acceptance');
});

check('optional research consent stays optional and unbundled', () => {
  const withoutResearch = parseAdaptiveStartAssessmentInput({
    ...validStart,
    consentResearch: false,
    legalAcceptance: REQUIRED_LEGAL_ACCEPTANCE
  });
  assert.equal(withoutResearch.ok, true, 'declining research consent must not block the assessment');
  assert.equal(withoutResearch.data.consentResearch, false);

  const withResearch = parseAdaptiveStartAssessmentInput({
    ...validStart,
    consentResearch: true,
    legalAcceptance: REQUIRED_LEGAL_ACCEPTANCE
  });
  assert.equal(withResearch.data.consentResearch, true);

  const acknowledgementText = REQUIRED_ACKNOWLEDGEMENTS.map((entry) => entry.label).join(' ');
  assert.ok(!/research|product improvement|anonymised/i.test(acknowledgementText));
  const gate = read(TERMS_GATE);
  assert.ok(!/anonymised/i.test(gate), 'research consent must not appear inside the mandatory gate');
  const form = read(START_FORM);
  assert.ok(/name="consentResearch"[^>]*type="checkbox"/.test(form));
  assert.ok(!/name="consentResearch"[^>]*required/.test(form), 'research consent must never be required');
});

check('resume journeys are not blocked by the new-acceptance gate', () => {
  const resumePage = read('src/app/score/adaptive/[assessmentRef]/page.tsx');
  assert.ok(!resumePage.includes('FraudReadinessTermsGate'), 'a valid resume URL must not show the gate');
  assert.ok(!resumePage.includes('AdaptiveStartForm'), 'the resume page must not create a new assessment');
  // The gate lives only on the two surfaces that create a NEW assessment.
  const gatedSurfaces = ['src/app/score/start/page.tsx', 'src/app/score/adaptive/page.tsx'];
  for (const surface of gatedSurfaces) {
    assert.ok(read(surface).includes('FraudReadinessTermsGate'), `${surface} must gate new assessments`);
  }
});

check('the legacy non-adaptive start path is untouched', () => {
  const legacy = read('src/lib/respondent/start-assessment.ts');
  assert.ok(!legacy.includes('legalAcceptance'));
  assert.ok(!legacy.includes('terms_version'));
  const shared = parseStartAssessmentInput({ ...validStart });
  assert.equal(shared.ok, true, 'the shared parser must not require the adaptive acceptance');
});

// --- CUSTOMER COPY ------------------------------------------------------------------------------

check('the start page no longer exposes implementation language', () => {
  const source = readCopy(START_PAGE);
  const banned = [
    'Assessment journey',
    'Capture the respondent and organisation details once',
    'without asking the respondent to create an account',
    'create an account',
    'adaptive engine',
    'report automation',
    'routing'
  ];
  for (const phrase of banned) {
    assert.ok(!source.includes(phrase), `the start page still says "${phrase}"`);
  }
});

check('the start page keeps the required copy hierarchy', () => {
  const source = read(START_PAGE);
  assert.ok(source.includes('Fraud Readiness Assessment'));
  assert.ok(source.includes('Assess your organisation&rsquo;s fraud readiness'));
  assert.ok(source.includes('private Snapshot'));
  assert.ok(source.includes('What to expect'));
  const form = read(START_FORM);
  for (const field of ['fullName', 'email', 'organisationName', 'roleTitle']) {
    assert.ok(form.includes(`name="${field}"`), `the start form is missing ${field}`);
  }
  assert.ok(form.includes('Role (optional)'));
});

// --- LEGAL DOCUMENT -----------------------------------------------------------------------------

check('the assessment terms cover the required subject matter', () => {
  const text = FRAUD_READINESS_TERMS_SECTIONS
    .flatMap((section) => section.clauses.flatMap((clause) => [clause.heading, ...clause.paragraphs]))
    .join('\n');
  const required = [
    /authorised by the organisation/i,
    /self-reported/i,
    /do not (?:test, audit, inspect or otherwise )?verify/i,
    /not an audit/i,
    /assurance/i,
    /guarantees that fraud will be detected/i,
    /responsibility .*remains with your management/i,
    /artificial intelligence/i,
    /confidential/i,
    /Protection of Personal Information Act/i,
    /intellectual property/i,
    /internal purposes/i,
    /cancel an order/i,
    /Consumer Protection Act/i,
    /law of the Republic of South Africa/i,
    /mediation/i,
    /jurisdiction/i,
    /versioned/i,
    /Privacy Notice/i
  ];
  for (const pattern of required) {
    assert.ok(pattern.test(text), `the terms do not cover ${pattern}`);
  }
});

check('the terms do not attempt a blanket exclusion of liability', () => {
  const text = FRAUD_READINESS_TERMS_SECTIONS
    .flatMap((section) => section.clauses.flatMap((clause) => clause.paragraphs))
    .join('\n');
  assert.ok(/Nothing in these terms excludes or limits our liability/i.test(text));
  assert.ok(/cannot lawfully be excluded/i.test(text));
  assert.ok(!/never liable for anything/i.test(text));
  assert.ok(!/under no circumstances (?:whatsoever )?(?:shall|will) we be liable/i.test(text));
});

check('the legal-review status is retained internally', () => {
  const legal = read('src/lib/legal/fraud-readiness-terms.ts');
  assert.ok(/Draft for legal review/.test(legal), 'the internal review marker must survive');
  assert.ok(/INTERNAL ONLY/.test(legal), 'the marker must be documented as internal');
});

check('no customer-facing surface tells a customer the terms are a draft', () => {
  // A person being asked to accept these terms must not be told the document is unfinished.
  const surfaces = [
    'src/app/(website)/fraud-readiness-assessment-terms/page.tsx',
    'src/app/(website)/fraud-readiness-assessment-terms/layout.tsx',
    'src/components/adaptive/FraudReadinessTermsGate.tsx',
    'src/app/(website)/fraud-readiness/page.tsx',
    'src/app/score/start/page.tsx',
    'src/app/(website)/terms-of-use/page.tsx',
    'src/app/(website)/privacy-policy/page.tsx'
  ];
  const banned = [
    /LEGAL_REVIEW_STATUS/,
    /\bdraft\b/i,
    /legal review/i,
    /not (?:yet )?(?:been )?(?:confirmed as )?final/i,
    /pending review/i,
    /provisional/i,
    /Status of this document/i
  ];
  for (const surface of surfaces) {
    const copy = readCopy(surface);
    for (const pattern of banned) {
      assert.ok(!pattern.test(copy), `${surface} shows a draft marker matching ${pattern}`);
    }
  }
  // The clause text itself must not carry one either.
  const clauses = FRAUD_READINESS_TERMS_SECTIONS
    .flatMap((section) => section.clauses.flatMap((clause) => [clause.heading, ...clause.paragraphs]))
    .join('\n');
  for (const pattern of [/\bdraft\b/i, /legal review/i, /provisional/i]) {
    assert.ok(!pattern.test(clauses), `the terms text contains a draft marker matching ${pattern}`);
  }
});

check('the terms migration sorts after the production ledger head', () => {
  const PRODUCTION_LEDGER_HEAD = '20260831153650';
  const stamp = path.basename(MIGRATION).slice(0, 14);
  assert.match(stamp, /^\d{14}$/);
  assert.ok(
    stamp > PRODUCTION_LEDGER_HEAD,
    `migration ${stamp} must sort after the production ledger head ${PRODUCTION_LEDGER_HEAD}`
  );
  // Every timestamped migration after the ledger head must apply in filename order with no
  // out-of-order exception, and no two may share a stamp.
  const all = fs.readdirSync(path.join(root, 'supabase/migrations')).filter((name) => name.endsWith('.sql')).sort();
  assert.ok(all.includes(path.basename(MIGRATION)), 'the terms migration must be present');
  assert.equal(all.filter((name) => name.startsWith(stamp)).length, 1, 'the timestamp must be unused');
  const timestamped = all.map((name) => name.slice(0, 14)).filter((value) => /^\d{14}$/.test(value));
  assert.deepEqual(timestamped, [...timestamped].sort(), 'timestamped migrations must be in chronological order');
  assert.equal(new Set(timestamped).size, timestamped.length, 'no two migrations may share a timestamp');
  assert.ok(
    timestamped[timestamped.length - 1] > PRODUCTION_LEDGER_HEAD,
    'the newest migration must sort after the production ledger head'
  );
});

check('the legal naming is consistently MK Fraud Insights', () => {
  for (const surface of [
    'src/app/(website)/terms-of-use/page.tsx',
    'src/app/(website)/privacy-policy/page.tsx',
    'src/app/(website)/fraud-readiness-assessment-terms/page.tsx'
  ]) {
    assert.ok(!read(surface).includes('Mk Fraud Website'), `${surface} still uses the old legal name`);
  }
});

// --- UNCHANGED CONTRACTS ------------------------------------------------------------------------

check('catalogue prices, codes, entitlement and fulfilment are unchanged', () => {
  assert.equal(ESSENTIAL_PRICE_CENTS, 750_000);
  assert.equal(COMPREHENSIVE_PRICE_CENTS, 3_500_000);
  assert.equal(ADVISORY_PRICE_FROM_CENTS, 15_000_000);
  assert.equal(COMMERCIAL_CATALOGUE.essential.productCode, 'essential_self_assessment');
  assert.equal(COMMERCIAL_CATALOGUE.comprehensive.productCode, 'mk_validated_assessment');
  assert.equal(COMMERCIAL_CATALOGUE.free.productCode, 'free_snapshot');
  assert.equal(COMMERCIAL_CATALOGUE.essential.fulfilmentModel, 'automated_diagnostic');
  assert.equal(COMMERCIAL_CATALOGUE.comprehensive.fulfilmentModel, 'automated_analytical');
  assert.equal(COMMERCIAL_CATALOGUE.advisory.fulfilmentModel, 'manually_scoped');
  assert.equal(COMMERCIAL_CATALOGUE.free.paid, false);
});

check('the paid order route contract is unchanged', () => {
  const orderPage = read('src/app/score/order/new/page.tsx');
  assert.ok(orderPage.includes('isSelfServicePaidTier(tier)'));
  assert.ok(orderPage.includes('validateSnapshotToken'));
  assert.ok(!orderPage.includes('product-intent'), 'order creation must not read browser-held intent');
});

check('the comparison never promises validation, review or assurance for the automated tiers', () => {
  for (const row of STOREFRONT_COMPARISON) {
    for (const key of ['essential', 'comprehensive']) {
      const value = row[key];
      if (/assurance|validat|independent review/i.test(value)) {
        assert.ok(/\b(?:no|not|does not|without)\b/i.test(value), `"${value}" promises assurance for ${key}`);
      }
    }
  }
  assert.ok(STOREFRONT_COMPARISON.length >= 4, 'the comparison must describe the progression in depth');
});

console.log(`\n${checks} checks passed${failures.length ? `, ${failures.length} FAILED` : ''}`);
if (failures.length) process.exit(1);
