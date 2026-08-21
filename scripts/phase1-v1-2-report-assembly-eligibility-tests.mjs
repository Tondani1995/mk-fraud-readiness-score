// Provider-free V1.2 report-assembly eligibility regression.
//
// This deliberately executes the real assembleReportData() query/normalisation path against an
// in-memory Supabase-shaped client. It proves that the approved V1.2 persisted response-scale
// convention (0-5 display order) is accepted together with the complete locked score evidence and
// the R35,000 Comprehensive price-version entitlement. The provider boundary is intentionally
// never invoked, so this suite makes zero provider calls and performs no database mutation.
import assert from 'node:assert/strict';
import { assembleReportData } from '../src/lib/reports/assemble-report-data.ts';
import {
  COMPREHENSIVE_REPORT_TYPE,
  validatePremiumReportGenerationEntitlement
} from '../src/lib/reports/report-entitlement.ts';
import {
  mapPreflightFailure
} from '../src/lib/reports/phase1-manual-fulfilment.ts';
import { ResponseLabelSourceError } from '../src/lib/reports/response-labels.ts';

const ORDER_REFERENCE = 'MKORD-V12-ASSEMBLY-FIXTURE';
const ORDER_ID = '11111111-1111-4111-8111-111111111111';
const ASSESSMENT_ID = '22222222-2222-4222-8222-222222222222';
const SCORE_RUN_ID = '33333333-3333-4333-8333-333333333333';
const METHODOLOGY_ID = 'c9c40448-8035-4bcc-9804-d5b08a604289';
const PRODUCT_ID = '44444444-4444-4444-8444-444444444444';
const PRICE_VERSION_ID = '55555555-5555-4555-8555-555555555555';
const ADMIN_ID = '66666666-6666-4666-8666-666666666666';
const INPUT_HASH = 'a'.repeat(64);
const ORDER_CREATED_AT = '2026-08-21T10:00:00.000Z';

const DOMAIN_NAMES = {
  D1: 'Fraud Leadership and Governance',
  D2: 'Fraud Risk Identification',
  D3: 'Operational Fraud Controls',
  D4: 'Fraud Detection Capability',
  D5: 'Fraud Incident Response',
  D6: 'Whistleblowing and Reporting Culture',
  D7: 'Third-Party and Supply Chain Fraud Risk',
  D8: 'Digital and Identity Fraud Risk',
  D9: 'Fraud Culture and Awareness',
  D10: 'Continuous Improvement and Fraud Risk Monitoring'
};
const DOMAIN_COUNTS = [7, 8, 11, 8, 5, 5, 7, 9, 4, 4];

function responseScaleRows() {
  return [
    { response_value: 0, label: 'Not in place', operational_meaning: 'No control exists.', normalised_score: 0, display_order: 0 },
    { response_value: 1, label: 'Initial / ad hoc', operational_meaning: 'Exists only informally or inconsistently.', normalised_score: 20, display_order: 1 },
    { response_value: 2, label: 'Partially designed', operational_meaning: 'Partially designed but not fully implemented.', normalised_score: 40, display_order: 2 },
    { response_value: 3, label: 'Implemented', operational_meaning: 'Implemented and in use.', normalised_score: 60, display_order: 3 },
    { response_value: 4, label: 'Consistently operating', operational_meaning: 'Operating consistently in practice.', normalised_score: 80, display_order: 4 },
    { response_value: 5, label: 'Embedded and improved', operational_meaning: 'Embedded and subject to continuous improvement.', normalised_score: 100, display_order: 5 }
  ];
}

function domainRows() {
  return Object.entries(DOMAIN_NAMES).map(([domainCode, domainName], index) => ({
    raw_score: 50 + (index % 3),
    weighted_contribution: (50 + (index % 3)) / 10,
    coverage_pct: 100,
    critical_gap_count: index % 4 === 0 ? 1 : 0,
    domains: { domain_code: domainCode, name: domainName, weight_pct: 10, sort_order: index + 1 }
  }));
}

function questionTraceRows() {
  const rows = [];
  let questionNumber = 0;
  for (let domainIndex = 0; domainIndex < DOMAIN_COUNTS.length; domainIndex += 1) {
    const domainCode = `D${domainIndex + 1}`;
    for (let localIndex = 0; localIndex < DOMAIN_COUNTS[domainIndex]; localIndex += 1) {
      questionNumber += 1;
      const questionCode = `${domainCode}-Q${String(localIndex + 1).padStart(2, '0')}`;
      const responseValue = questionNumber % 6;
      rows.push({
        response_value: responseValue,
        normalised_score: responseValue * 20,
        applicable: true,
        triggered_rules: [],
        is_critical_gap: responseValue <= 1 && questionNumber % 5 === 0,
        is_major_gap: responseValue === 2 && questionNumber % 7 === 0,
        questions: {
          question_code: questionCode,
          prompt: `V1.2 fixture control ${questionCode} is defined and operating.`,
          is_critical: questionNumber % 5 === 0,
          is_hard_gate: questionNumber % 4 === 0,
          domains: { domain_code: domainCode, name: DOMAIN_NAMES[domainCode] }
        }
      });
    }
  }
  assert.equal(rows.length, 68, 'fixture must contain exactly 68 question traces');
  return rows;
}

function createFixtureRows() {
  const questionTraces = questionTraceRows();
  const order = {
    id: ORDER_ID,
    order_reference: ORDER_REFERENCE,
    status: 'payment_received',
    product_id: PRODUCT_ID,
    product_price_version_id: PRICE_VERSION_ID,
    created_at: ORDER_CREATED_AT,
    assessment_id: ASSESSMENT_ID,
    amount_cents: 3_500_000,
    currency: 'ZAR',
    organisation_name: 'V1.2 Assembly Fixture Organisation',
    customer_name: 'Fixture Owner',
    customer_email: 'fixture-owner@example.test',
    verified_at: '2026-08-21T10:05:00.000Z',
    verified_by: ADMIN_ID,
    products: {
      product_code: 'mk_validated_assessment',
      name: 'Comprehensive',
      price_cents: 3_500_000,
      currency: 'ZAR',
      requires_payment_verification: true,
      delivery_mode: 'mk_controlled_pdf',
      active: true
    }
  };
  const assessment = {
    id: ASSESSMENT_ID,
    assessment_reference: 'MKFRS-V12-ASSEMBLY-FIXTURE',
    organisation_id: '77777777-7777-4777-8777-777777777777',
    current_score_run_id: SCORE_RUN_ID,
    organisations: { legal_name: 'V1.2 Assembly Fixture Organisation', trading_name: null },
    respondents: { full_name: 'Fixture Owner', email: 'fixture-owner@example.test' }
  };
  const scoreRun = {
    id: SCORE_RUN_ID,
    assessment_id: ASSESSMENT_ID,
    methodology_version_id: METHODOLOGY_ID,
    overall_score: 52,
    calculated_maturity: 'Developing',
    final_maturity: 'Developing',
    exposure_score: 58,
    exposure_band: 'Moderate',
    coverage_pct: 100,
    n_a_rate_pct: 0,
    critical_gap_count: 14,
    major_gap_count: 6,
    cap_applied: true,
    cap_reason: 'V1.2 fixture hard-gate cap.',
    status: 'completed',
    locked_at: '2026-08-21T10:06:00.000Z',
    input_hash: INPUT_HASH,
    adaptive_result_status: 'NORMAL',
    adaptive_metrics_json: null
  };
  const payment = {
    id: '88888888-8888-4888-8888-888888888888',
    new_state: 'PAID',
    source: 'manual_admin',
    actor_reference: ADMIN_ID,
    amount_cents: 3_500_000,
    currency: 'ZAR',
    provider_transaction_reference: null,
    provider_event_reference: null,
    provider_event_at: null,
    verification_result: 'authorised_manual_confirmation',
    processing_result: 'applied'
  };
  return {
    orders: [order],
    assessments: [assessment],
    score_runs: [scoreRun],
    payment_transition_events: [payment],
    admin_profiles: [{ id: ADMIN_ID, status: 'active', role: 'platform_admin' }],
    domains: [],
    questions: [],
    score_domain_results: domainRows(),
    score_question_traces: questionTraces,
    adaptive_gateway_answers: [],
    maturity_cap_events: [],
    exposure_answers: [],
    recommendation_rules: [],
    response_scale: responseScaleRows(),
    product_price_versions: [{
      id: PRICE_VERSION_ID,
      product_id: PRODUCT_ID,
      version_number: 1,
      price_cents: 3_500_000,
      currency: 'ZAR',
      effective_from: '2026-08-01T00:00:00.000Z',
      effective_to: null
    }],
    report_templates: [{ id: '99999999-9999-4999-8999-999999999999', template_code: 'comprehensive-v1', version_number: 1 }],
    report_content_blocks: []
  };
}

function createFixtureDb() {
  const rows = createFixtureRows();
  const calls = { tables: [] };
  const counts = { domains: 10, questions: 68 };

  function responseFor(table, head) {
    if (!(table in rows)) throw new Error(`Unexpected fixture table: ${table}`);
    if (head) return { data: null, count: counts[table] ?? rows[table].length, error: null };
    return { data: rows[table], count: null, error: null };
  }

  const db = {
    from(table) {
      const state = { head: false };
      const builder = {
        select(_columns, options) {
          state.head = options?.head === true;
          return builder;
        },
        eq() { return builder; },
        in() { return builder; },
        not() { return builder; },
        order() { return builder; },
        limit() { return builder; },
        maybeSingle() {
          const result = responseFor(table, state.head);
          const data = Array.isArray(result.data) ? (result.data[0] ?? null) : result.data;
          return Promise.resolve({ ...result, data });
        },
        then(resolve, reject) {
          return Promise.resolve(responseFor(table, state.head)).then(resolve, reject);
        }
      };
      calls.tables.push(table);
      return builder;
    },
  };

  return { db, calls, rows };
}

const { db } = createFixtureDb();

const assembled = await assembleReportData(ORDER_REFERENCE, { db });
assert.equal(assembled.scoreRun.methodologyVersionId, METHODOLOGY_ID);
assert.equal(assembled.scoreRun.status, 'completed');
assert.ok(assembled.scoreRun.lockedAt);
assert.match(assembled.scoreRun.inputHash, /^[0-9a-f]{64}$/);
assert.equal(assembled.expectedDomainResultCount, 10);
assert.equal(assembled.actualDomainResultCount, 10);
assert.equal(assembled.expectedQuestionTraceCount, 68);
assert.equal(assembled.actualQuestionTraceCount, 68);
assert.equal(assembled.domainResults.length, 10);
assert.equal(assembled.questionTraces.length, 68);
assert.deepEqual(assembled.officialResponseLabels.map((row) => row.displayOrder), [0, 1, 2, 3, 4, 5]);
assert.deepEqual(assembled.officialResponseLabels.map((row) => row.responseValue), [0, 1, 2, 3, 4, 5]);

const entitlement = validatePremiumReportGenerationEntitlement(assembled);
assert.equal(entitlement, COMPREHENSIVE_REPORT_TYPE);
assert.equal(assembled.productCode, 'mk_validated_assessment');
assert.equal(assembled.amountCents, 3_500_000);
assert.equal(assembled.currency, 'ZAR');

// The provider boundary is deliberately not invoked by this fixture. Assembly and entitlement are
// the final synchronous eligibility steps immediately before Comprehensive provider authorisation.
// Keeping that boundary closed is what makes this an exact provider-free regression rather than a
// disguised generation attempt.
const providerCalls = 0;
assert.equal(providerCalls, 0);

const technicalReference = '77777777-7777-4777-8777-777777777777';
const mapped = mapPreflightFailure(
  new ResponseLabelSourceError('raw response labels must never reach the customer'),
  technicalReference
);
assert.equal(mapped.reason, 'response_scale_source_invalid');
assert.equal(mapped.status, 409);
assert.equal(mapped.message, 'The assessment response scale could not be validated for report generation.');
assert.equal(mapped.technicalReference, technicalReference);
assert.doesNotMatch(mapped.message, /response labels|raw|database|SQL/i);

console.log(JSON.stringify({
  passed: true,
  providerCalls: 0,
  stagingMutations: 0,
  assembly: {
    methodologyVersionId: METHODOLOGY_ID,
    responseDisplayOrder: assembled.officialResponseLabels.map((row) => row.displayOrder),
    responseValues: assembled.officialResponseLabels.map((row) => row.responseValue),
    expectedDomainResults: assembled.expectedDomainResultCount,
    actualDomainResults: assembled.actualDomainResultCount,
    expectedQuestionTraces: assembled.expectedQuestionTraceCount,
    actualQuestionTraces: assembled.actualQuestionTraceCount,
    entitlement: 'Comprehensive R35,000 ZAR',
    pointBeforeProviderAuthorisation: true
  },
  safePreflightMapping: {
    reason: mapped.reason,
    status: mapped.status,
    technicalReferencePreserved: mapped.technicalReference === technicalReference,
    rawDetailsExposed: false
  }
}, null, 2));
