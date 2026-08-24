import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const V11_PATH = resolve(ROOT, 'docs/adaptive-assessment/adaptive-graph-v1-draft.json');
const V12_VERSION = 'MFRS-V1.2-ADAPTIVE-CANDIDATE-20260821';
const V12_METHODOLOGY = 'MFRS-V1.2-CANDIDATE-OWNER-CORRECTION';
const V11_VERSION = 'MFRS-V1.1-ADAPTIVE-DRAFT-20260804';
const V11_FINGERPRINT = 'fa4505253f7e85a76f37e87e0836db76c553a786a4030fe29298153fc3b8f7ab';

const v11 = JSON.parse(readFileSync(V11_PATH, 'utf8'));
const v11ById = new Map(v11.questions.map((question) => [question.questionId, question]));

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function sha(value) {
  return createHash('sha256').update(value).digest('hex');
}

function opt(value, label) { return { value, label }; }
function eq(questionId, values) { return { questionId, in: values }; }
function all(...conditions) { return { all: conditions }; }
function any(...conditions) { return { any: conditions }; }

const responseScale = [
  [0, 'Not in place', 'The capability is absent or is not recognised as required.'],
  [1, 'Informal / reactive', 'Some activity occurs, but it is informal, reactive or dependent on individual effort.'],
  [2, 'Partly designed', 'The capability has been partly designed, but important elements are incomplete or inconsistent.'],
  [3, 'Implemented in key areas', 'The capability operates in key areas, but coverage or consistency is not yet organisation-wide.'],
  [4, 'Consistently operating', 'The capability is defined, operating consistently and supported by evidence.'],
  [5, 'Embedded and improving', 'The capability is measured, governed and deliberately improved over time.'],
].map(([responseValue, label, operationalMeaning]) => ({ responseValue, label, operationalMeaning, normalisedScore: responseValue * 20 }));

const unknownOption = {
  value: 'unknown', label: "I don't know / cannot confirm", scoringStatus: 'unknown',
  uncertaintyTreatment: 'retained_in_scope_zero_readiness_credit_reported_as_unconfirmed', excludedFromDenominatorRule: 'never',
};

const gateways = [
  ['G01', 'Organisation profile', 'What best describes your organisation’s main operating environment?', [opt('professional_services', 'Professional services'), opt('retail_consumer', 'Retail or consumer-facing'), opt('construction_projects', 'Construction or project delivery'), opt('technology_digital_platform', 'Technology, digital or platform services'), opt('manufacturing_production', 'Manufacturing or production'), opt('public_nonprofit_member', 'Public, nonprofit or member-based'), opt('other_mixed', 'Other or mixed'), opt('unknown', unknownOption.label)], 'primary operating environment', null],
  ['G02', 'Organisation profile', 'How many people work for the organisation, including regular employees?', [opt('employees_1_9', '1–9 people'), opt('employees_10_49', '10–49 people'), opt('employees_50_249', '50–249 people'), opt('employees_250_999', '250–999 people'), opt('employees_1000_plus', '1,000 or more people'), opt('unknown', unknownOption.label)], 'explicit employee headcount band', null],
  ['G03', 'Suppliers and third parties', 'Does the organisation use external suppliers, contractors or service providers?', [opt('yes', 'Yes'), opt('no', 'No'), opt('unknown', unknownOption.label)], 'whether external suppliers or providers exist', null],
  ['G04', 'Suppliers and third parties', 'Who is primarily responsible for supplier onboarding and ongoing supplier management?', [opt('organisation', 'Our organisation'), opt('group_function', 'A group or shared-service function'), opt('external_provider', 'An external service provider'), opt('shared_hybrid', 'A shared or hybrid model'), opt('unknown', unknownOption.label)], 'primary responsibility for supplier onboarding and ongoing supplier management', eq('G03', ['yes'])],
  ['G05', 'Procurement and sourcing', 'Who is primarily responsible for procurement and sourcing?', [opt('dedicated_internal', 'Dedicated internal procurement or sourcing function'), opt('business_owners', 'Business owners or managers'), opt('group_function', 'A group or shared-service function'), opt('external_provider', 'External service provider'), opt('shared_hybrid', 'Shared or hybrid model'), opt('no_procurement', 'No defined procurement or sourcing process'), opt('unknown', unknownOption.label)], 'primary responsibility for procurement and sourcing', null],
  ['G06', 'Money and physical assets', 'Does the organisation handle physical cash as part of normal operations?', [opt('yes', 'Yes'), opt('no', 'No'), opt('unknown', unknownOption.label)], 'physical cash exposure', null],
  ['G07', 'Money and physical assets', 'Does the organisation hold or manage stock, inventory or valuable physical assets?', [opt('yes', 'Yes'), opt('no', 'No'), opt('unknown', unknownOption.label)], 'stock, inventory or physical-asset exposure', null],
  ['G08', 'People and payroll', 'Who is primarily responsible for delivering payroll?', [opt('organisation', 'Our organisation'), opt('group_function', 'A group or shared-service function'), opt('external_provider', 'An external payroll provider'), opt('shared_hybrid', 'A shared or hybrid model'), opt('no_payroll', 'The organisation does not run payroll'), opt('unknown', unknownOption.label)], 'primary responsibility for payroll delivery', null],
  ['G09', 'Digital channels and users', 'Which statement best describes the organisation’s customer or user digital channels?', [opt('own', 'Our organisation operates them'), opt('provider', 'A third-party platform operates them'), opt('both', 'Our organisation and third-party platforms both operate them'), opt('none', 'We do not operate customer or user digital channels'), opt('unknown', unknownOption.label)], 'own versus third-party customer or user digital channels', null],
  ['G10', 'Digital payments', 'Does the organisation accept customer or user payments through card, online, app, portal or other digital channels?', [opt('yes', 'Yes'), opt('no', 'No'), opt('unknown', unknownOption.label)], 'customer or user digital-payment exposure', null],
  ['G11', 'Data and identity', 'Does the organisation handle personal or identity information about customers, users, employees or suppliers?', [opt('yes', 'Yes'), opt('no', 'No'), opt('unknown', unknownOption.label)], 'personal and identity-data exposure', null],
  ['G12', 'Financial and stock adjustments', 'Can people make manual financial, stock or similar record adjustments?', [opt('yes', 'Yes'), opt('no', 'No'), opt('unknown', unknownOption.label)], 'manual financial or stock adjustment capability', null],
  ['G13', 'Operating footprint', 'Does the organisation operate from more than one site, store or project location?', [opt('yes', 'Yes'), opt('no', 'No'), opt('unknown', unknownOption.label)], 'multi-site or multi-project operation', null],
  ['G14', 'People and workforce', 'Does the organisation use temporary, seasonal or subcontracted workers?', [opt('yes', 'Yes'), opt('no', 'No'), opt('unknown', unknownOption.label)], 'temporary, seasonal or subcontracted workforce exposure', null],
  ['G15', 'Digital access', 'Can people access systems or organisation data remotely?', [opt('yes', 'Yes'), opt('no', 'No'), opt('unknown', unknownOption.label)], 'remote system or data access', null],
  ['G16', 'Payment governance', 'Which approval arrangement normally applies to higher-risk payments or significant spending?', [opt('one_person', 'One person within the organisation'), opt('two_or_more', 'Two or more people within the organisation'), opt('group_function', 'A group or shared-service function'), opt('external_provider', 'An external service provider'), opt('no_formal', 'No defined approval arrangement'), opt('unknown', unknownOption.label)], 'approval arrangement for higher-risk payments or significant spending', null],
  ['G17', 'Intermediaries', 'Does the organisation use agents, brokers, distributors or other intermediaries?', [opt('yes', 'Yes'), opt('no', 'No'), opt('unknown', unknownOption.label)], 'agent, broker, distributor or intermediary exposure', null],
].map(([questionId, section, prompt, responseOptions, construct, conditionalWhen], sortOrder) => ({ questionId, section, prompt, construct, constructCount: 1, questionType: 'single_select', responseDimension: construct, gatewayStatus: 'gateway', sortOrder, responseOptions, scoringStatus: 'profile_only', conditionalWhen }));

const supplierExists = eq('G03', ['yes', 'unknown']);
const supplierDirect = any(eq('G03', ['unknown']), all(eq('G03', ['yes']), eq('G04', ['organisation', 'shared_hybrid', 'unknown'])));
const supplierProviderOnly = all(eq('G03', ['yes']), eq('G04', ['group_function', 'external_provider']));
const supplierOversight = any(eq('G03', ['unknown']), all(eq('G03', ['yes']), eq('G04', ['group_function', 'external_provider', 'unknown'])));
const procurementDirect = eq('G05', ['dedicated_internal', 'business_owners', 'shared_hybrid', 'unknown']);
const procurementProviderOnly = eq('G05', ['group_function', 'external_provider']);
const procurementOversight = eq('G05', ['group_function', 'external_provider', 'unknown']);
const payrollDirect = eq('G08', ['organisation', 'shared_hybrid', 'unknown']);
const payrollProviderOnly = eq('G08', ['group_function', 'external_provider']);
const payrollOversight = eq('G08', ['group_function', 'external_provider', 'unknown']);
const cashExposure = eq('G06', ['yes', 'unknown']);
const assetExposure = eq('G07', ['yes', 'unknown']);
const adjustmentExposure = eq('G12', ['yes', 'unknown']);
const contingentWorkforce = eq('G14', ['yes', 'unknown']);
const intermediaryExposure = eq('G17', ['yes', 'unknown']);
const ownDigital = eq('G09', ['own', 'both', 'unknown']);
const thirdPartyDigital = eq('G09', ['provider', 'unknown']);
const paymentExposure = eq('G10', ['yes', 'unknown']);
const personalDataExposure = eq('G11', ['yes', 'unknown']);
const remoteAccess = eq('G15', ['yes', 'unknown']);
const digitalExposure = any(ownDigital, thirdPartyDigital, paymentExposure, remoteAccess);
const identityExposure = any(ownDigital, thirdPartyDigital, paymentExposure, personalDataExposure);
const thirdPartyRisk = any(supplierExists, intermediaryExposure);
const highRiskOperationalExposure = any(cashExposure, assetExposure, adjustmentExposure, contingentWorkforce);

const skipReasonCodes = {
  no_external_party_exposure: 'No external supplier, provider or intermediary exposure was confirmed.',
  no_relevant_digital_exposure: 'No relevant customer/user digital channel, digital payment or remote-access exposure was confirmed.',
  no_direct_supplier_delivery: 'The organisation is not primarily responsible for supplier management; retained provider oversight is assessed where relevant.',
  no_direct_procurement_delivery: 'The organisation is not primarily responsible for procurement; retained provider oversight is assessed where relevant.',
  no_manual_adjustment_capability: 'No manual financial or stock adjustment capability was confirmed.',
  no_high_risk_operational_exposure: 'No relevant cash, asset, adjustment or contingent-workforce exposure was confirmed.',
  no_direct_payroll_delivery: 'The organisation is not primarily responsible for payroll delivery; retained payroll oversight is assessed where relevant.',
  no_physical_cash_exposure: 'No physical cash exposure was confirmed.',
  no_stock_or_asset_exposure: 'No stock or physical-asset exposure was confirmed.',
  no_identity_or_digital_exposure: 'No relevant identity or digital exposure was confirmed.',
};

const promptOverrides = {
  'D1-Q01': ['A named senior owner is accountable for fraud risk management and has authority to drive action.', 'senior accountability'],
  'D1-Q04': ['Management owns fraud-risk decisions and control action.', 'management ownership'],
  'D1-Q05': ['Written guidance sets out how fraud should be prevented and detected, and how suspected fraud should be reported and handled.', 'written fraud guidance'],
  'D2-Q02': ['Fraud risks are mapped to the organisation’s important processes.', 'process-level fraud mapping'],
  'D3-Q03': ['Supplier onboarding verifies business identity, ownership and initial banking information before approval.', 'supplier onboarding checks'],
  'D3-Q04': ['System and data access is granted against current role requirements.', 'access provisioning'],
  'D3-Q05': ['Refunds, credits, write-offs, stock adjustments, manual journals and overrides receive independent review where used.', 'manual adjustment review'],
  'D4-Q02': ['Exception reporting provides defined alerts for unusual transactions or activities and a documented review process.', 'exception reporting and review'],
  'D4-Q05': ['Monitoring covers fraud and control misuse by people inside the organisation.', 'internal misuse monitoring'],
  'D5-Q03': ['Roles and decision rights are defined for fraud triage, investigation, escalation and case closure.', 'triage, investigation, escalation and closure decision rights'],
  'D5-Q04': ['Fraud investigations follow documented procedures that protect confidentiality and fair treatment and record key facts, decisions and actions.', 'investigation records and fair treatment'],
  'D6-Q02': ['Employees know how to recognise suspected fraud and use the reporting channel.', 'reporting channel awareness'],
  'D6-Q05': ['Relevant external stakeholders have an appropriate way to report suspected fraud or misconduct.', 'external stakeholder reporting access'],
  'D7-Q04': ['Supplier payments include checks for invoice manipulation, false vendors and supplier bank-detail changes.', 'supplier payment integrity'],
  'D8-Q02': ['The organisation monitors suspicious access, account or transaction behaviour across its relevant systems and digital channels, including through provider reporting where a third party operates the channel.', 'coherent digital monitoring'],
  'D8-Q04': ['Access to sensitive systems, administrator rights and confidential data is restricted.', 'sensitive access restriction'],
  'D8-Q08': ['The organisation can detect identity misuse, account takeover or impersonation.', 'identity misuse detection'],
  'D9-Q05': ['Fraud awareness uses practical examples or scenarios.', 'scenario-based awareness'],
  'D9-Q03': ['Leadership communicates clear expectations on ethical conduct, conflicts of interest, fraud prevention and the consequences of misconduct.', 'leadership expectations and misconduct consequences'],
  'D9-Q06': ['Managers record and respond to fraud or misconduct concerns through a defined process.', 'manager response to concerns'],
};

const mergedCurrentIds = new Set(['D5-Q02', 'D5-Q07', 'D6-Q06', 'D8-Q05', 'D9-Q04', 'D10-Q04', 'D10-Q05']);
const retiredCurrentIds = new Set(['D9-Q06']);
const retainedIds = [
  ...['D1-Q01', 'D1-Q02', 'D1-Q03', 'D1-Q04', 'D1-Q05', 'D1-Q06'],
  ...['D2-Q01', 'D2-Q02', 'D2-Q03', 'D2-Q04', 'D2-Q05', 'D2-Q06', 'D2-Q07', 'D2-Q08'],
  ...['D3-Q01', 'D3-Q02', 'D3-Q03', 'D3-Q04', 'D3-Q05', 'D3-Q06', 'D3-Q07'],
  ...['D4-Q01', 'D4-Q02', 'D4-Q03', 'D4-Q04', 'D4-Q05', 'D4-Q06', 'D4-Q07'],
  ...['D5-Q01', 'D5-Q03', 'D5-Q04', 'D5-Q05', 'D5-Q06'],
  ...['D6-Q01', 'D6-Q02', 'D6-Q03', 'D6-Q04', 'D6-Q05'],
  ...['D7-Q01', 'D7-Q02', 'D7-Q03', 'D7-Q04', 'D7-Q05', 'D7-Q06', 'D7-Q07'],
  ...['D8-Q01', 'D8-Q02', 'D8-Q03', 'D8-Q04', 'D8-Q06', 'D8-Q07', 'D8-Q08'],
  ...['D9-Q01', 'D9-Q02', 'D9-Q03', 'D9-Q05'],
  ...['D10-Q01', 'D10-Q02', 'D10-Q03', 'D10-Q06'],
];

const conditionOverrides = {
  'D2-Q05': [thirdPartyRisk, 'no_external_party_exposure'], 'D2-Q08': [any(ownDigital, thirdPartyDigital), 'no_relevant_digital_exposure'],
  'D3-Q03': [supplierDirect, 'no_direct_supplier_delivery'], 'D3-Q05': [adjustmentExposure, 'no_manual_adjustment_capability'], 'D3-Q07': [highRiskOperationalExposure, 'no_high_risk_operational_exposure'],
  'D7-Q01': [supplierDirect, 'no_direct_supplier_delivery'], 'D7-Q02': [procurementDirect, 'no_direct_procurement_delivery'], 'D7-Q03': [thirdPartyRisk, 'no_external_party_exposure'],
  'D7-Q04': [supplierDirect, 'no_direct_supplier_delivery'], 'D7-Q05': [supplierDirect, 'no_direct_supplier_delivery'], 'D7-Q06': [procurementDirect, 'no_direct_procurement_delivery'], 'D7-Q07': [thirdPartyRisk, 'no_external_party_exposure'],
  'D8-Q01': [identityExposure, 'no_identity_or_digital_exposure'], 'D8-Q02': [digitalExposure, 'no_relevant_digital_exposure'],
  'D8-Q06': [digitalExposure, 'no_relevant_digital_exposure'], 'D8-Q07': [digitalExposure, 'no_relevant_digital_exposure'], 'D8-Q08': [identityExposure, 'no_identity_or_digital_exposure'],
};

const redirectOverrides = {
  'D3-Q03': { condition: supplierProviderOnly, redirectTo: 'OV-D3-Q03' },
  'D7-Q01': { condition: supplierProviderOnly, redirectTo: 'OV-D7-Q01' }, 'D7-Q02': { condition: procurementProviderOnly, redirectTo: 'OV-D7-Q02' },
  'D7-Q04': { condition: supplierProviderOnly, redirectTo: 'OV-D7-Q04' }, 'D7-Q05': { condition: supplierProviderOnly, redirectTo: 'OV-D7-Q05' },
  'D7-Q06': { condition: procurementProviderOnly, redirectTo: 'OV-D7-Q06' }, 'D8-Q02': { condition: all(eq('G09', ['provider']), { not: any(ownDigital, paymentExposure, remoteAccess) }), redirectTo: 'OV-D8-Q02' },
};
const oversightIdsByBase = { 'D3-Q03': ['OV-D3-Q03'], 'D7-Q01': ['OV-D7-Q01'], 'D7-Q02': ['OV-D7-Q02'], 'D7-Q04': ['OV-D7-Q04'], 'D7-Q05': ['OV-D7-Q05'], 'D7-Q06': ['OV-D7-Q06'], 'D8-Q02': ['OV-D8-Q02'] };

function makeQuestion({ id, sourceId = id, prompt, construct, controlObjective, weight, weightBasis, origin = 'RETAINED', splitFrom = null, sourceCurrentIds = [sourceId], condition = null, skipReasonCode = null, isCritical = false, isHardGate = false, redirectWhen = null, oversightVariantIds = [] }) {
  return {
    questionId: id, questionCode: id, domainCode: id.split('-')[0], prompt, construct, constructCount: 1,
    responseDimension: 'single_capability_maturity', questionType: 'maturity_scale', controlObjective,
    weight, weightBasis, origin, newControl: origin !== 'RETAINED', splitFrom, sourceCurrentIds,
    isCritical, isHardGate, sortOrder: 0, applicabilityClass: condition ? 'FACTUALLY_CONDITIONAL' : 'ALWAYS_APPLICABLE',
    applicabilityCondition: condition, skipReasonCode, redirectWhen, oversightVariantIds, evidenceReference: `V12-${id}`,
    unknownRetained: true, naReason: condition ? 'deterministic_factual_gateway_absence' : null,
  };
}

function retained(id, overrides = {}) {
  const source = v11ById.get(id);
  const [prompt = source.prompt, construct = id] = promptOverrides[id] ?? [];
  const [condition, skipReasonCode] = conditionOverrides[id] ?? [null, null];
  return makeQuestion({ id, sourceId: id, prompt: prompt ?? source.prompt, construct: construct ?? id, controlObjective: prompt ?? source.prompt, weight: source.weight, weightBasis: `V1.1 ${id} weight retained exactly`, isCritical: Boolean(source.isCritical), isHardGate: Boolean(source.isHardGate), condition, skipReasonCode, redirectWhen: redirectOverrides[id] ?? null, oversightVariantIds: oversightIdsByBase[id] ?? [], ...overrides });
}

function splitControl(input) { return makeQuestion({ ...input, origin: 'SPLIT', splitFrom: input.sourceId, sourceCurrentIds: [input.sourceId] }); }
function newControl(input) { return makeQuestion({ ...input, origin: 'NEW', sourceCurrentIds: [] }); }

const controls = [
  ...retainedIds.map((id) => retained(id)),
  splitControl({ id: 'D1-Q07', sourceId: 'D1-Q04', prompt: 'Fraud risk and key controls receive independent review appropriate to the organisation’s size and operating model.', construct: 'independent assurance', controlObjective: 'Separate management ownership from independent review by an assurance function, governing body or external specialist where appropriate.', weight: 0.5, weightBasis: 'Split from D1-Q04 V1.1 weight 1.5; explicit 0.5 owner-review allocation.' }),
  splitControl({ id: 'D3-Q08', sourceId: 'D3-Q04', prompt: 'System and data access is reviewed periodically and removed when no longer required.', construct: 'access recertification', controlObjective: 'Remove inappropriate or obsolete access before it creates an opportunity for misuse.', weight: 0.5, weightBasis: 'Split from D3-Q04 V1.1 weight 1.5; explicit 0.5 owner-review allocation.' }),
  splitControl({ id: 'D4-Q08', sourceId: 'D4-Q05', prompt: 'Monitoring covers fraud threats from external parties relevant to the organisation.', construct: 'external fraud monitoring', controlObjective: 'Detect relevant external fraud threats and counterparty abuse.', weight: 0.5, weightBasis: 'Split from D4-Q05 V1.1 weight 1.0; explicit 0.5 owner-review allocation.', condition: thirdPartyRisk, skipReasonCode: 'no_external_party_exposure' }),
  splitControl({ id: 'D8-Q09', sourceId: 'D8-Q04', prompt: 'Sensitive access and administrator rights are reviewed periodically.', construct: 'sensitive access review', controlObjective: 'Identify and remove inappropriate privileged or sensitive access.', weight: 0.5, weightBasis: 'Split from D8-Q04 V1.1 weight 1.5; explicit 0.5 owner-review allocation.' }),
  splitControl({ id: 'D8-Q10', sourceId: 'D8-Q08', prompt: 'The organisation can investigate and contain identity misuse, account takeover or impersonation.', construct: 'identity misuse response', controlObjective: 'Investigate and contain identity misuse and account compromise.', weight: 0.5, weightBasis: 'Split from D8-Q08 V1.1 weight 1.5; explicit 0.5 owner-review allocation.', condition: identityExposure, skipReasonCode: 'no_identity_or_digital_exposure' }),
  newControl({ id: 'D3-Q09', prompt: 'Payroll master-file changes and unusual payroll records receive review before payment.', construct: 'payroll master and ghost-worker review', controlObjective: 'Reduce fraud through fictitious workers, altered payroll records or unauthorised payroll changes.', weight: 0.5, weightBasis: 'NEW; explicit 0.5 owner-review weight for payroll integrity gap.', condition: payrollDirect, skipReasonCode: 'no_direct_payroll_delivery', redirectWhen: { condition: payrollProviderOnly, redirectTo: 'OV-G07' }, oversightVariantIds: ['OV-G07'] }),
  newControl({ id: 'D3-Q10', prompt: 'Physical cash is counted, safeguarded and reconciled by defined people.', construct: 'cash custody and reconciliation', controlObjective: 'Reduce loss and concealment opportunities in physical cash handling.', weight: 0.5, weightBasis: 'NEW; explicit 0.5 owner-review weight for physical-cash gap.', condition: cashExposure, skipReasonCode: 'no_physical_cash_exposure' }),
  newControl({ id: 'D3-Q11', prompt: 'Stock and physical assets are safeguarded and reconciled by defined people.', construct: 'stock and asset custody', controlObjective: 'Reduce loss and concealment opportunities in stock and physical-asset handling.', weight: 0.5, weightBasis: 'NEW; explicit 0.5 owner-review weight for physical-asset gap.', condition: assetExposure, skipReasonCode: 'no_stock_or_asset_exposure' }),
].sort((a, b) => a.domainCode.localeCompare(b.domainCode) || a.questionId.localeCompare(b.questionId, undefined, { numeric: true }));

const primarySplitAllocations = {
  'D1-Q04': [1, 'D1-Q04 V1.1 weight 1.5 divided: 1.0 retained management ownership; 0.5 allocated to D1-Q07 independent assurance.'],
  'D3-Q04': [1, 'D3-Q04 V1.1 weight 1.5 divided: 1.0 retained access provisioning; 0.5 allocated to D3-Q08 periodic review.'],
  'D4-Q05': [0.5, 'D4-Q05 V1.1 weight 1.0 divided: 0.5 retained internal monitoring; 0.5 allocated to D4-Q08 external monitoring.'],
  'D8-Q04': [1, 'D8-Q04 V1.1 weight 1.5 divided: 1.0 retained sensitive-access restriction; 0.5 allocated to D8-Q09 periodic review.'],
  'D8-Q08': [1, 'D8-Q08 V1.1 weight 1.5 divided: 1.0 retained identity detection; 0.5 allocated to D8-Q10 investigation/containment.'],
};
for (const [id, [weight, weightBasis]] of Object.entries(primarySplitAllocations)) {
  const item = controls.find((question) => question.questionId === id);
  if (item) { item.weight = weight; item.weightBasis = weightBasis; }
}
const mergedSourceIds = {
  'D6-Q02': ['D6-Q02', 'D5-Q02', 'D6-Q06'],
  'D10-Q03': ['D10-Q03', 'D5-Q07'],
  'D8-Q02': ['D8-Q02', 'D8-Q05'],
  'D9-Q03': ['D9-Q03', 'D9-Q04'],
  'D2-Q06': ['D2-Q06', 'D10-Q04'],
  'D2-Q03': ['D2-Q03', 'D10-Q05'],
};
for (const [id, sourceCurrentIds] of Object.entries(mergedSourceIds)) {
  const item = controls.find((question) => question.questionId === id);
  if (item) item.sourceCurrentIds = sourceCurrentIds;
}
controls.forEach((item, index) => { item.sortOrder = index + 1; });

const oversightVariants = [
  ['OV-D3-Q03', 'D3-Q03', 'D3', 'G04', supplierProviderOnly, 'The organisation retains assurance over supplier identity, ownership and initial banking checks performed on its behalf.', 'supplier onboarding oversight'],
  ['OV-D7-Q01', 'D7-Q01', 'D7', 'G04', supplierProviderOnly, 'The organisation defines and monitors the third-party due-diligence standard managed on its behalf.', 'third-party due-diligence oversight'],
  ['OV-D7-Q02', 'D7-Q02', 'D7', 'G05', procurementProviderOnly, 'The organisation retains oversight of supplier selection, price integrity and conflict controls delivered on its behalf.', 'procurement oversight'],
  ['OV-D7-Q04', 'D7-Q04', 'D7', 'G04', supplierProviderOnly, 'The organisation independently verifies supplier payment controls, including bank-detail changes, performed on its behalf.', 'supplier payment oversight'],
  ['OV-D7-Q05', 'D7-Q05', 'D7', 'G04', supplierProviderOnly, 'The organisation receives and reviews risk information about high-risk third parties managed on its behalf.', 'third-party monitoring oversight'],
  ['OV-D7-Q06', 'D7-Q06', 'D7', 'G05', procurementProviderOnly, 'The organisation reviews procurement and vendor-management activity delivered on its behalf.', 'procurement activity oversight'],
  ['OV-D8-Q02', 'D8-Q02', 'D8', 'G09', eq('G09', ['provider']), 'The organisation reviews fraud, dispute and account-security reporting from the third-party platform it uses.', 'third-party digital-channel oversight'],
  ['OV-G07', 'D3-Q09', 'D3', 'G08', payrollProviderOnly, 'The organisation independently reviews a payroll register processed on its behalf for unknown, duplicate or altered records.', 'payroll register oversight'],
].map(([questionId, replaces, domainCode, exposureGateway, applicabilityCondition, prompt, construct]) => ({ questionId, replaces, baseControlId: replaces, domainCode, exposureGateway, prompt, construct, constructCount: 1, questionType: 'maturity_scale', responseDimension: 'single_capability_maturity', applicabilityClass: 'OVERSIGHT_VARIANT', applicabilityCondition, scoringStatus: 'inherits_base_control_weight', weightPolicy: 'inherits_base', displayGuidance: 'Outsourcing moves the activity, not the accountability; shared or hybrid delivery remains on the direct path to avoid double-weighting the same family.', evidenceReference: `V12-${questionId}`, unknownRetained: true }));

const gatewayBlocks = [
  { phase: 'profile', title: 'About your organisation', intro: 'Short factual questions establish scope before the scored capabilities.' },
  { phase: 'supplier_and_procurement', title: 'Suppliers and procurement', intro: 'Supplier and sourcing answers distinguish direct controls from retained oversight.' },
  { phase: 'money_people_and_footprint', title: 'Money, people and operating footprint', intro: 'Cash, assets, payroll, workforce and location answers establish factual exposure.' },
  { phase: 'digital_and_identity', title: 'Digital, identity and access', intro: 'Channel, payment, data and remote-access answers distinguish digital pathways.' },
  { phase: 'payment_and_intermediary_governance', title: 'Payment arrangement and intermediaries', intro: 'Approval arrangement and intermediary answers complete the exposure profile.' },
];

const graphWithoutFingerprint = {
  graphVersion: V12_VERSION, methodologyVersion: V12_METHODOLOGY, status: 'draft_candidate', activationPolicy: 'owner_approval_required',
  provenance: 'V1.2 owner-review correction built from the frozen V1.1 graph; no V1.1 customer graph, historical response or active route is changed.',
  responseScale, uncertaintyOption: unknownOption,
  notApplicablePolicy: { label: 'Not applicable', availableOnlyFrom: 'deterministic_factual_gateway_absence', neverAvailableFrom: 'maturity_judgement_or_unknown_response' },
  domains: v11.domains.map((domain, index) => ({ ...domain, sortOrder: index + 1, v11WeightTotal: Number(v11.questions.filter((question) => question.domainCode === domain.domainCode).reduce((sum, question) => sum + question.weight, 0).toFixed(6)), candidateWeightTotal: Number(controls.filter((item) => item.domainCode === domain.domainCode).reduce((sum, item) => sum + item.weight, 0).toFixed(6)) })),
  gateways, gatewayBlocks: [{ phase: 'profile', title: 'About your organisation', intro: 'Short factual questions establish scope before the scored capabilities.' }, { phase: 'supplier_and_procurement', title: 'Suppliers and procurement', intro: 'Supplier and sourcing answers distinguish direct controls from retained oversight.' }, { phase: 'money_people_and_footprint', title: 'Money, people and operating footprint', intro: 'Cash, assets, payroll, workforce and location answers establish factual exposure.' }, { phase: 'digital_and_identity', title: 'Digital, identity and access', intro: 'Channel, payment, data and remote-access answers distinguish digital pathways.' }, { phase: 'payment_and_intermediary_governance', title: 'Payment arrangement and intermediaries', intro: 'Approval arrangement and intermediary answers complete the exposure profile.' }],
  questions: controls, oversightVariants,
  applicabilityStates: ['always_applicable', 'factually_conditional', 'activity_exists_internal', 'activity_outsourced', 'activity_shared_hybrid', 'activity_absent', 'unknown'],
  scoringStatuses: ['profile_only', 'always_applicable', 'factually_conditional', 'oversight_variant', 'unknown', 'not_in_place', 'informal_reactive', 'partly_designed', 'implemented_in_key_areas', 'consistently_operating', 'embedded_and_improving', 'redirected', 'excluded_by_factual_gateway'],
  skipReasonCodes,
  graphInvariants: { gatewayCount: gateways.length, questionCount: controls.length, oversightVariantCount: oversightVariants.length, customerRoutingEnabled: false, activeCustomerGraph: V11_VERSION, unknownRetainedByDefault: true, sharedHybridAvoidsDoubleWeight: true, newCriticalControls: 0, newHardGates: 0, retiredQuestionIds: [...retiredCurrentIds], mergedQuestionIds: [...mergedCurrentIds] },
};
const graph = { ...graphWithoutFingerprint, graphFingerprint: sha(canonical(graphWithoutFingerprint)) };

function evaluate(condition, answers) {
  if (condition === null) return true;
  if (!condition || typeof condition !== 'object') return false;
  if (Array.isArray(condition.all)) return condition.all.every((item) => evaluate(item, answers));
  if (Array.isArray(condition.any)) return condition.any.some((item) => evaluate(item, answers));
  if (condition.not) return !evaluate(condition.not, answers);
  return typeof answers[condition.questionId] === 'string' && condition.in.includes(answers[condition.questionId]);
}

function resolveCandidatePath(answers) {
  const rows = [];
  for (const item of controls) {
    const redirected = item.redirectWhen && evaluate(item.redirectWhen.condition, answers);
    const applicable = item.applicabilityCondition === null || evaluate(item.applicabilityCondition, answers);
    if (redirected) {
      rows.push({ id: item.questionId, kind: 'control', state: 'redirected', redirectTo: item.redirectWhen.redirectTo, weight: item.weight });
      const variant = oversightVariants.find((candidate) => candidate.questionId === item.redirectWhen.redirectTo);
      if (variant) rows.push({ id: variant.questionId, kind: 'oversight', state: 'active', redirectTo: null, weight: item.weight });
    } else rows.push({ id: item.questionId, kind: 'control', state: applicable ? 'active' : 'excluded', redirectTo: null, weight: item.weight });
  }
  return rows;
}

function routeSummary(answers) {
  const rows = resolveCandidatePath(answers);
  return { active: rows.filter((row) => row.state === 'active').map((row) => row.id), excluded: rows.filter((row) => row.state === 'excluded').map((row) => row.id), redirected: rows.filter((row) => row.state === 'redirected').map((row) => `${row.id}→${row.redirectTo}`), activeWeight: Number(rows.filter((row) => row.state === 'active').reduce((sum, row) => sum + row.weight, 0).toFixed(6)) };
}

const allUnknown = Object.fromEntries(gateways.map((gateway) => [gateway.questionId, 'unknown']));
const representativeProfiles = [
  ['typical', { ...allUnknown, G01: 'professional_services', G02: 'employees_10_49', G03: 'yes', G04: 'organisation', G05: 'business_owners', G06: 'no', G07: 'no', G08: 'organisation', G09: 'none', G10: 'no', G11: 'yes', G12: 'no', G13: 'no', G14: 'no', G15: 'no', G16: 'two_or_more', G17: 'no' }],
  ['complex_high_exposure', { ...allUnknown, G01: 'construction_projects', G02: 'employees_250_999', G03: 'yes', G04: 'shared_hybrid', G05: 'shared_hybrid', G06: 'yes', G07: 'yes', G08: 'shared_hybrid', G09: 'both', G10: 'yes', G11: 'yes', G12: 'yes', G13: 'yes', G14: 'yes', G15: 'yes', G16: 'two_or_more', G17: 'yes' }],
  ['provider_only', { ...allUnknown, G01: 'technology_digital_platform', G02: 'employees_50_249', G03: 'yes', G04: 'external_provider', G05: 'external_provider', G06: 'no', G07: 'no', G08: 'external_provider', G09: 'provider', G10: 'yes', G11: 'yes', G12: 'yes', G13: 'no', G14: 'yes', G15: 'no', G16: 'external_provider', G17: 'yes' }],
  ['low_exposure', { ...allUnknown, G01: 'professional_services', G02: 'employees_1_9', G03: 'no', G05: 'no_procurement', G06: 'no', G07: 'no', G08: 'no_payroll', G09: 'none', G10: 'no', G11: 'no', G12: 'no', G13: 'no', G14: 'no', G15: 'no', G16: 'no_formal', G17: 'no' }],
  ['unknown', allUnknown],
];

const gatewayTargetMap = { G01: ['G01'], G02: ['G02'], G03: ['G03', 'G04'], G04: ['G05'], G05: ['G06'], G06: ['G07'], G07: ['G08'], G08: ['G09', 'G10'], G09: ['G11'], G10: ['G12'], G11: ['G13'], G12: ['G14'], G13: ['G09', 'G15'], G14: ['G16'] };
const targetById = new Map([...gateways, ...controls, ...oversightVariants].map((item) => [item.questionId, item]));
const controlTargetMap = new Map();
for (const question of v11.questions) {
  const targets = controls.filter((item) => item.sourceCurrentIds.includes(question.questionId)).map((item) => item.questionId);
  if (targets.length) controlTargetMap.set(question.questionId, targets);
}
const variantTargetMap = new Map(v11.oversightVariants.map((variant) => [variant.questionId, [variant.questionId]]));

function md(value) { return String(value ?? '').replaceAll('|', '\\|').replaceAll('\n', '<br>'); }
function currentItems() { return [...v11.gateways.map((item) => ({ kind: 'gateway', ...item })), ...v11.questions.map((item) => ({ kind: 'control', ...item })), ...v11.oversightVariants.map((item) => ({ kind: 'oversight', ...item }))]; }
function applicabilityText(target) {
  const condition = target.applicabilityCondition ?? target.conditionalWhen;
  if (!condition) return `${target.questionId}: always applicable`;
  if (condition.questionId === 'G03' && condition.in?.length === 1 && condition.in[0] === 'yes') return `${target.questionId}: only when G03 = Yes`;
  return `${target.questionId}: ${target.skipReasonCode ?? 'conditional'}; unknown retained`;
}
function mappingFor(item) {
  if (item.kind === 'gateway') { const targets = gatewayTargetMap[item.questionId] ?? []; return { targets, disposition: targets.length > 1 ? 'split' : 'rewritten', reason: targets.length > 1 ? 'Separate factual dimensions are now routed independently.' : 'Retained with precise customer wording.' }; }
  if (item.kind === 'oversight') return { targets: variantTargetMap.get(item.questionId) ?? [], disposition: 'retained_relinked', reason: 'Existing oversight variant retained with corrected base-control and gateway mapping.' };
  const targets = controlTargetMap.get(item.questionId) ?? [];
  if (!targets.length) return { targets, disposition: 'retired', reason: 'Retired because the capability is duplicated, not sufficiently observable as a separate score, or superseded by a clearer retained control.' };
  const target = targetById.get(targets[0]);
  const split = targets.length > 1 || target?.origin === 'SPLIT';
  const merged = targets.length === 1 && (target?.sourceCurrentIds?.length ?? 0) > 1 && target.sourceCurrentIds.includes(item.questionId);
  return { targets, disposition: split ? 'split_retained' : merged ? 'merged' : 'retained', reason: split ? 'Separate maturity can materially change management action.' : merged ? 'Merged into the primary retained control to remove duplicate burden while preserving traceability.' : 'Retained with original ID, exact V1.1 weight and factual routing.' };
}

const audit = currentItems().map((item) => {
  const mapping = mappingFor(item); const targets = mapping.targets.map((id) => targetById.get(id)).filter(Boolean);
  const first = targets[0];
  return { currentId: item.questionId, kind: item.kind, currentWording: item.prompt, targets: mapping.targets, disposition: mapping.disposition, reason: mapping.reason, proposedWording: targets.map((target) => target.prompt ?? target.questionId).join(' | ') || 'Retired from customer pathway', questionType: first?.questionType ?? 'retired', responses: first?.questionType === 'maturity_scale' ? `${responseScale.map((option) => option.label).join(' / ')} / ${unknownOption.label}` : first?.responseOptions?.map((option) => option.label).join(' / ') ?? 'none', applicability: targets.map(applicabilityText).join(' | ') || 'retired', weight: targets.map((target) => `${target.questionId}=${target.weight ?? 'inherits base'}`).join(' | ') || 'retired', flags: targets.map((target) => `${target.questionId}: ${target.isCritical ? 'critical' : 'not critical'} / ${target.isHardGate ? 'hard gate' : 'not hard gate'}`).join(' | ') || 'retired', objective: targets.map((target) => target.controlObjective ?? 'Profile context only').join(' | '), evidence: targets.map((target) => target.evidenceReference).join(' | ') || 'none' };
});

const truthRows = [];
for (const gateway of gateways) for (const option of gateway.responseOptions) {
  const answers = { ...allUnknown, [gateway.questionId]: option.value };
  if (gateway.questionId === 'G04') answers.G03 = 'yes';
  const result = routeSummary(answers);
  truthRows.push({ gateway: gateway.questionId, response: option.label, routeKey: option.value, ...result });
}

const questionnaireMarkdown = [
  '# MK Fraud Readiness Adaptive Assessment V1.2 — revised owner-review questionnaire', '', `Candidate version: ${V12_VERSION}`, `Candidate fingerprint: ${graph.graphFingerprint}`, 'Status: revised draft candidate only; not published, not active and not connected to customer start.', '',
  '## Response scale for every scored capability', '', '| Value | Customer label | Meaning |', '|---:|---|---|', ...responseScale.map((option) => `| ${option.responseValue} | ${md(option.label)} | ${md(option.operationalMeaning)} |`), `| — | ${unknownOption.label} | Separate unconfirmed state; retained in scope and receives no readiness credit. |`, '', 'Not applicable is never a maturity answer. It is available only when a factual gateway proves the activity is absent.', '',
  '## Sequential gateways', '', '| # | ID | Customer question | Customer options | Asked when |', '|---:|---|---|---|---|', ...gateways.map((item, index) => `| ${index + 1} | ${item.questionId} | ${md(item.prompt)} | ${md(item.responseOptions.map((option) => option.label).join(' / '))} | ${item.conditionalWhen ? 'Only when G03 = Yes' : 'Always'} |`), '', 'G04 is not asked when G03 is unknown. Supplier exposure remains conservatively in scope without forcing a responsibility answer the respondent cannot logically give. Routing values are implementation metadata and are not customer labels.', '',
  '## Scored controls', '', '| # | ID | Domain | Customer wording | Construct | Weight | Origin | Applicability | Critical / hard gate |', '|---:|---|---|---|---|---:|---|---|---|', ...controls.map((item, index) => `| ${index + 1} | ${item.questionId} | ${md(v11.domains.find((domain) => domain.domainCode === item.domainCode)?.name)} | ${md(item.prompt)} | ${md(item.construct)} | ${item.weight} | ${item.origin}${item.splitFrom ? ` from ${item.splitFrom}` : ''} | ${md(item.applicabilityCondition ? skipReasonCodes[item.skipReasonCode] : 'Always applicable')} | ${item.isCritical ? 'Critical' : 'Not critical'} / ${item.isHardGate ? 'Hard gate' : 'Not hard gate'} |`), '',
  '## Retained oversight variants', '', '| # | ID | Base control | Customer wording | Weight policy |', '|---:|---|---|---|---|', ...oversightVariants.map((item, index) => `| ${index + 1} | ${item.questionId} | ${item.baseControlId} | ${md(item.prompt)} | Inherits the base control weight; shared/hybrid remains direct to avoid double-weighting. |`),
].join('\n');

const routingMarkdown = [
  '# V1.2 revised routing truth table', '', `Candidate: ${V12_VERSION} (${graph.graphFingerprint}),`, 'Unknown never means no. Factual absence is the only route to exclusion. Provider-only delivery redirects to retained oversight. Shared/hybrid delivery remains direct so the same control family is not double-weighted. G04 rows below are evaluated only when G03 = Yes.', '',
  '| Gateway | Customer response | Internal route key | Scored controls shown | Excluded | Redirected |', '|---|---|---|---:|---:|---:|', ...truthRows.map((row) => `| ${row.gateway} | ${md(row.response)} | ${md(row.routeKey)} | ${row.active.length} | ${row.excluded.length} | ${row.redirected.length} |`), '', '## Representative pathway counts', '', '| Pathway | Scored controls shown | Active weight | Excluded | Redirected | Owner note |', '|---|---:|---:|---:|---:|---|', ...representativeProfiles.map(([name, answers]) => { const result = routeSummary(answers); const note = name === 'complex_high_exposure' && result.active.length > 70 ? 'Above 70: owner justification required because all three exposure-specific controls and all defensible splits are active.' : 'Within the proposed burden envelope.'; return `| ${name} | ${result.active.length} | ${result.activeWeight} | ${result.excluded.length} | ${result.redirected.length} | ${note} |`; }),
].join('\n');

const weightRows = v11.domains.map((domain) => {
  const old = v11.questions.filter((question) => question.domainCode === domain.domainCode); const candidate = controls.filter((question) => question.domainCode === domain.domainCode);
  const mapped = new Set(candidate.flatMap((question) => question.sourceCurrentIds)); const retiredMerged = old.filter((question) => retiredCurrentIds.has(question.questionId) || mergedCurrentIds.has(question.questionId)).length;
  const oldWeight = old.reduce((sum, question) => sum + question.weight, 0); const newWeight = candidate.reduce((sum, question) => sum + question.weight, 0);
  return { domain, oldCount: old.length, retained: candidate.filter((question) => question.origin === 'RETAINED').length, splits: candidate.filter((question) => question.origin === 'SPLIT').length, newControls: candidate.filter((question) => question.origin === 'NEW').length, retiredMerged, oldWeight: Number(oldWeight.toFixed(6)), newWeight: Number(newWeight.toFixed(6)), difference: Number((newWeight - oldWeight).toFixed(6)) };
});
const weightMarkdown = ['# V1.2 individual weight reconciliation', '', 'Retained controls use exact V1.1 weights unless a documented split allocates the original source weight. No domain-wide normalisation is used. NEW controls carry explicit proposed owner-review weights. Domain percentages remain the frozen V1.1 percentages.', '', '| Domain | V1.1 controls | Retained | Splits | NEW | Retired/merged | V1.1 weight | Candidate weight | Difference |', '|---|---:|---:|---:|---:|---:|---:|---:|---:|', ...weightRows.map((row) => `| ${row.domain.domainCode} ${md(row.domain.name)} | ${row.oldCount} | ${row.retained} | ${row.splits} | ${row.newControls} | ${row.retiredMerged} | ${row.oldWeight} | ${row.newWeight} | ${row.difference} |`), '', `| Total | ${weightRows.reduce((sum, row) => sum + row.oldCount, 0)} | ${weightRows.reduce((sum, row) => sum + row.retained, 0)} | ${weightRows.reduce((sum, row) => sum + row.splits, 0)} | ${weightRows.reduce((sum, row) => sum + row.newControls, 0)} | ${weightRows.reduce((sum, row) => sum + row.retiredMerged, 0)} | ${weightRows.reduce((sum, row) => sum + row.oldWeight, 0)} | ${Number(weightRows.reduce((sum, row) => sum + row.newWeight, 0).toFixed(6))} | ${Number(weightRows.reduce((sum, row) => sum + row.difference, 0).toFixed(6))} |`, '', 'Retired and merged controls are explicit and are not silently reweighted. Split allocations and NEW weights remain owner-review proposals.'].join('\n');

const oldCritical = v11.questions.filter((question) => question.isCritical).map((question) => question.questionId); const oldHard = v11.questions.filter((question) => question.isHardGate).map((question) => question.questionId);
const criticalMarkdown = ['# V1.2 critical and hard-gate reconciliation', '', `V1.1 critical controls: ${oldCritical.length} (${oldCritical.join(', ')})`, `V1.1 hard gates: ${oldHard.length} (${oldHard.join(', ')})`, `V1.2 critical controls: ${controls.filter((question) => question.isCritical).length} (${controls.filter((question) => question.isCritical).map((question) => question.questionId).join(', ')})`, `V1.2 hard gates: ${controls.filter((question) => question.isHardGate).length} (${controls.filter((question) => question.isHardGate).map((question) => question.questionId).join(', ')})`, 'NEW critical controls proposed: none', 'NEW hard gates proposed: none', '', 'The 19 critical-control and 17 hard-gate counts are deliberately preserved. This is count preservation, not a claim that every compound V1.1 construct remains compound: D1-Q04/Q07, D3-Q04/Q08, D8-Q04/Q09 and D8-Q08/Q10 narrow the relevant capability into distinct questions, while the retained primary control carries the V1.1 critical/hard-gate flag and each split carries no new flag. No new critical control or hard gate is proposed, so no new maturity-cap effect is introduced. Any later gate change requires owner approval.', '', '| Domain | V1.1 critical | V1.2 critical | V1.1 hard gates | V1.2 hard gates |', '|---|---:|---:|---:|---:|', ...v11.domains.map((domain) => `| ${domain.domainCode} ${md(domain.name)} | ${v11.questions.filter((question) => question.domainCode === domain.domainCode && question.isCritical).length} | ${controls.filter((question) => question.domainCode === domain.domainCode && question.isCritical).length} | ${v11.questions.filter((question) => question.domainCode === domain.domainCode && question.isHardGate).length} | ${controls.filter((question) => question.domainCode === domain.domainCode && question.isHardGate).length} |`)].join('\n');

const newControlsMarkdown = ['# V1.2 new-control review', '', 'The previous candidate had eight genuinely new controls. The correction removes two because existing methodology/context covers them, retains three exposure-specific controls, and removes three additional controls whose coverage is already present in retained domains. Split controls are listed in the separate split review.', '', '| Previous candidate control | Revised treatment | Revised ID | Proposed weight | Critical / hard gate | Reason |', '|---|---|---|---:|---|---|', '| D1-C08 programme resourcing | Removed | — | — | No | Management context remains visible through ownership, leadership reporting and effectiveness review without another scored burden item. |', '| D3-C10 payment authority operation | Removed | — | — | No | G16 remains factual payment context; D3-Q02 already tests independent review above defined thresholds. |', '| D3-C11 payroll master and ghost-worker review | Retained as NEW | D3-Q09 | 0.5 | No | Material payroll integrity gap; conditional and provider-oversight aware. |', '| D3-C12 cash custody and reconciliation | Retained as NEW | D3-Q10 | 0.5 | No | Material cash gap; conditional on factual exposure. |', '| D3-C13 stock and asset custody | Retained as NEW | D3-Q11 | 0.5 | No | Material physical-asset gap; conditional on factual exposure. |', '| D7-C08 third-party contract protections | Removed | — | — | No | Existing third-party monitoring, procurement oversight and intermediary controls cover retained accountability without another question. |', '| D7-C09 third-party incident reporting | Removed | — | — | No | Existing third-party monitoring plus incident root-cause and improvement controls cover the lifecycle. |', '| D10-C04 control-effectiveness measures | Removed | — | — | No | D10-Q01 and D10-Q06 already test monitoring rhythm and leadership effectiveness review. |'].join('\n');

const splitReviewMarkdown = ['# V1.2 split and retirement review', '', '| Source V1.1 control | Revised treatment | Revised IDs | Reason |', '|---|---|---|---|', '| D1-Q04 management ownership and assurance | Retained split | D1-Q04 + D1-Q07 | Management ownership and independent assurance can mature separately and lead to different management action. |', '| D3-Q04 access provisioning and periodic review | Retained split | D3-Q04 + D3-Q08 | Access can be correctly granted while stale access remains; remediation differs. |', '| D4-Q02 alert generation and alert review | Reversed | D4-Q02 | One end-to-end exception-reporting control is retained to keep normal burden within target; wording names both generation and review. |', '| D4-Q05 internal and external monitoring | Retained split | D4-Q05 + D4-Q08 | Internal misuse and external fraud monitoring can be independently mature; D4-Q08 is conditional on external exposure. |', '| D5-Q03 roles and decision rights | Reversed | D5-Q03 | One triage/investigation ownership question is retained; escalation and closure authority remain in the response process. |', '| D5-Q04 investigation fairness and documentation | Reversed | D5-Q04 | Fair treatment remains explicit; evidence custody and incident-improvement controls provide the observable documentation chain. |', '| D3-Q03/D7-Q04 supplier bank-detail coverage | Reversed duplication | D3-Q03 + D7-Q04 | D3-Q03 covers initial banking information; D7-Q04 is the sole control covering bank-detail changes during payment. |', '| D8-Q04 access restriction and review | Retained split | D8-Q04 + D8-Q09 | Sensitive access can be restricted correctly but not reviewed periodically; remediation differs. |', '| D8-Q08 identity detection and investigation | Retained split | D8-Q08 + D8-Q10 | Detection and investigation/containment are separate operational capabilities. |', '| D9-Q06 workforce belief / manager response | Retired | — | The original belief construct was not reasonably answerable; the revised pathway relies on observable reporting-channel, independent-review and retaliation-protection controls. |'].join('\n');

const crosswalkMarkdown = ['# V1.1 → V1.2 revised complete crosswalk', '', `Source: ${V11_VERSION} (${V11_FINGERPRINT}),`, `Target: ${V12_VERSION} (${graph.graphFingerprint}),`, '', '| # | Current item | Revised item(s) | Disposition | Proposed wording | Weight / flags | Applicability |', '|---:|---|---|---|---|---|---|', ...audit.map((row, index) => `| ${index + 1} | ${md(row.currentId)} | ${md(row.targets.join(', ') || 'none')} | ${md(row.disposition)} | ${md(row.proposedWording)} | ${md(row.weight)} / ${md(row.flags)} | ${md(row.applicability)} |`), '', 'All 88 V1.1 customer-visible items are represented. Existing retained controls keep original IDs; new IDs are sequential within their domain; retired/merged items are explicit and are not silently renumbered. V1.1 remains immutable.'].join('\n');
const auditMarkdown = ['# Frozen V1.1 88-item audit for revised V1.2', '', `Frozen source graph: ${V11_VERSION}`, `Frozen source fingerprint: ${V11_FINGERPRINT}`, `Revised candidate graph: ${V12_VERSION}`, `Revised candidate fingerprint: ${graph.graphFingerprint}`, '', 'This audit covers all 14 V1.1 gateways, 68 scored controls and 6 oversight variants. It records retained IDs, deliberate splits, explicit merges/retirements, factual routing, weights and critical/hard-gate treatment.', '', '| # | Current ID | Type | Current wording | Revised wording | Type | Responses | Applicability | Weight / flags | Objective | Evidence | Disposition | Reason |', '|---:|---|---|---|---|---|---|---|---|---|---|---|---|', ...audit.map((row, index) => `| ${index + 1} | ${md(row.currentId)} | ${md(row.kind)} | ${md(row.currentWording)} | ${md(row.proposedWording)} | ${md(row.questionType)} | ${md(row.responses)} | ${md(row.applicability)} | ${md(row.weight)} / ${md(row.flags)} | ${md(row.objective)} | ${md(row.evidence)} | ${md(row.disposition)} | ${md(row.reason)} |`)].join('\n');
const reviewMarkdown = ['# MK Fraud Readiness Adaptive Assessment V1.2 — revised owner review pack', '', `Candidate graph version: ${V12_VERSION}`, `Candidate graph fingerprint: ${graph.graphFingerprint}`, `Counts: ${gateways.length} gateways, ${controls.length} scored controls, ${oversightVariants.length} oversight variants`, 'Activation status: revised draft candidate only; no customer routing; no staging activation; V1.1 remains active and immutable.', '', '## Correction outcome', '', '- Retained controls use original D*-Q* IDs. New IDs are sequential within domains; no C IDs are used.', `- V1.1 critical/hard-gate treatment is restored: ${oldCritical.length} critical controls and ${oldHard.length} hard gates; no new flags are proposed.`, '- No domain-wide weight normalisation is used. Retained weights are exact, split allocations are explicit and NEW weights are proposed for owner approval.', '- G04 is asked only when G03 = Yes; G03 = unknown retains supplier exposure without forcing G04.', '- G06 is a factual Yes / No / I don\'t know question about normal physical-cash handling.', '- G10 covers customer/user digital-payment exposure only.', '- Shared/hybrid delivery remains direct to avoid double-weighting; provider-only delivery receives retained oversight.', '', '## Pathways', ...representativeProfiles.map(([name, answers]) => { const result = routeSummary(answers); return `- ${name}: ${result.active.length} scored controls shown, ${result.excluded.length} excluded, ${result.redirected.length} redirected.`; }), '', '## Documents', '- [Revised full questionnaire](./v1-2-questionnaire.md)', '- [Complete old-ID → revised-ID crosswalk](./v1-2-crosswalk.md)', '- [Frozen 88-item audit](./v1-2-v1-1-audit.md)', '- [Genuinely new-control review](./v1-2-new-controls.md)', '- [Split review](./v1-2-split-review.md)', '- [Routing truth table and pathway counts](./v1-2-routing-truth-table.md)', '- [Score-parity fixtures and comparison](./v1-2-score-parity.md)', '- [Individual weight reconciliation](./v1-2-weight-reconciliation.md)', '- [Critical and hard-gate reconciliation](./v1-2-critical-hard-gate-reconciliation.md)', '- [Candidate graph JSON](./adaptive-graph-v1-2-candidate.json)', '', '## Safety boundary', '', 'No migration, activation policy update, staging graph insert, customer-start route change, provider call, Comprehensive generation, Production mutation, email or report generation is part of this correction. Stop for owner approval.'].join('\n');

const outputFiles = [
  ['docs/adaptive-assessment/adaptive-graph-v1-2-candidate.json', `${JSON.stringify(graph, null, 2)}\n`], ['src/lib/adaptive/candidates/adaptive-graph-v1-2-candidate.json', `${JSON.stringify(graph, null, 2)}\n`],
  ['docs/adaptive-assessment/v1-2-v1-1-audit.md', `${auditMarkdown}\n`], ['docs/adaptive-assessment/v1-2-crosswalk.md', `${crosswalkMarkdown}\n`], ['docs/adaptive-assessment/v1-2-questionnaire.md', `${questionnaireMarkdown}\n`], ['docs/adaptive-assessment/v1-2-routing-truth-table.md', `${routingMarkdown}\n`], ['docs/adaptive-assessment/v1-2-weight-reconciliation.md', `${weightMarkdown}\n`], ['docs/adaptive-assessment/v1-2-critical-hard-gate-reconciliation.md', `${criticalMarkdown}\n`], ['docs/adaptive-assessment/v1-2-new-controls.md', `${newControlsMarkdown}\n`], ['docs/adaptive-assessment/v1-2-split-review.md', `${splitReviewMarkdown}\n`], ['docs/adaptive-assessment/v1-2-review.md', `${reviewMarkdown}\n`],
];
for (const [relative, content] of outputFiles) { const target = resolve(ROOT, relative); mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, content); }

console.log(JSON.stringify({ graphVersion: graph.graphVersion, graphFingerprint: graph.graphFingerprint, gatewayCount: gateways.length, questionCount: controls.length, oversightVariantCount: oversightVariants.length, auditedV11ItemCount: audit.length, representativePathCounts: Object.fromEntries(representativeProfiles.map(([name, answers]) => { const result = routeSummary(answers); return [name, { active: result.active.length, excluded: result.excluded.length, redirected: result.redirected.length, activeWeight: result.activeWeight }]; })), outputFiles: outputFiles.map(([relative]) => relative) }, null, 2));
