import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const root = process.cwd();

const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

function loadCommonJs(relativePath, filename) {
  const filePath = path.join(root, relativePath);
  const source = read(relativePath);
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: filePath
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(output, {
    module,
    exports: module.exports,
    console,
    Object,
    String
  }, { filename });
  return module.exports;
}

function loadCustomerExplanations() {
  return loadCommonJs('src/lib/adaptive/customer-explanations.ts', 'customer-explanations.cx.cjs');
}

function loadCatalogue() {
  return loadCommonJs('src/lib/commercial/product-catalogue.ts', 'product-catalogue.cx.cjs');
}

let checks = 0;
function check(label, fn) {
  fn();
  checks += 1;
  console.log(`  ok - ${label}`);
}

const graph = JSON.parse(read('src/lib/adaptive/candidates/adaptive-graph-v1-2-candidate.json'));
const registrySource = read('src/lib/adaptive/customer-explanations.ts');
const { CUSTOMER_EXPLANATIONS, customerExplanationForNode } = loadCustomerExplanations();
const { COMMERCIAL_CATALOGUE, COMPREHENSIVE_PRODUCT_CODE, COMPREHENSIVE_PRICE_CENTS, listCatalogue, paidProductForTier } = loadCatalogue();
const coreNodes = [...graph.gateways, ...graph.questions];
const displayNodes = [...coreNodes, ...graph.oversightVariants];
const coreIds = coreNodes.map((node) => node.nodeId ?? node.questionId ?? node.id);
const displayIds = displayNodes.map((node) => node.nodeId ?? node.questionId ?? node.id);

check('the canonical V1.2 matrix contains 17 gateways and 68 scored controls', () => {
  assert.equal(graph.gateways.length, 17);
  assert.equal(graph.questions.length, 68);
  assert.equal(new Set(coreIds).size, 85);
});

check('the presentation registry has no runtime graph dependency', () => {
  assert.doesNotMatch(registrySource, /adaptive-graph|\.json|require\s*\(/i);
  assert.match(registrySource, /customerExplanationForNode/);
});

check('every gateway, scored control and possible oversight node has exact copy', () => {
  assert.deepEqual(Object.keys(CUSTOMER_EXPLANATIONS).sort(), [...new Set(displayIds)].sort());
  for (const node of displayNodes) {
    const id = node.nodeId ?? node.questionId ?? node.id;
    const explanation = customerExplanationForNode(id);
    assert.equal(typeof explanation, 'string', `${id} must have an explanation`);
    assert.ok(explanation.trim().length >= 40, `${id} explanation must be useful`);
    assert.notEqual(explanation.trim().toLowerCase(), String(node.prompt ?? '').trim().toLowerCase(), `${id} explanation must not repeat its prompt`);
    assert.doesNotMatch(explanation, /generic tailoring|internal scoring|methodology identifier|routing terminology/i, `${id} explanation must stay customer-facing`);
  }
});

check('the eight V1.2-only scored controls are covered without adding fallback playbooks', () => {
  for (const id of ['D1-Q07', 'D3-Q08', 'D3-Q09', 'D3-Q10', 'D3-Q11', 'D4-Q08', 'D8-Q09', 'D8-Q10']) {
    assert.ok(CUSTOMER_EXPLANATIONS[id], `${id} must resolve from the V1.2 registry`);
  }
  assert.equal(customerExplanationForNode('D1-Q99'), null);
  assert.doesNotMatch(registrySource, /This short question helps tailor/);
});

const publicCtaFiles = [
  'src/components/layout/Header.tsx',
  'src/components/layout/Footer.tsx',
  'src/components/website/Navbar.tsx',
  'src/components/website/Footer.tsx',
  'src/components/website/Home/HeroSection.tsx',
  'src/components/website/Home/ServicesSection.tsx',
  'src/components/website/Home/LeadMagnetSection.tsx',
  'src/components/website/Home/CTASection.tsx',
  'src/components/website/Services/FraudReadinessScoreSection.tsx',
  'src/components/website/Services/FraudHealthCheckSection.tsx'
];

check('the public CTA inventory resolves assessment actions to the adaptive start route', () => {
  for (const relativePath of publicCtaFiles) {
    const source = read(relativePath);
    assert.doesNotMatch(source, /fraud-readiness-score#start-score/, `${relativePath} has a stale legacy CTA target`);
  }
  const ctaSource = publicCtaFiles.map(read).join('\n');
  assert.ok((ctaSource.match(/\/score\/start/g) ?? []).length >= 10, 'public CTA inventory should point to /score/start');
  const landing = read('src/app/(website)/fraud-readiness-score/page.tsx');
  assert.doesNotMatch(landing, /StartAssessmentForm|data-native-assessment-start|\/score\/api\/assessments\/start|\/score\/assessment\//);
  assert.match(landing, /id="start-score"/);
  assert.match(landing, /href="\/score\/start"/);
  assert.match(landing, /data-adaptive-assessment-entry/);
});

check('the adaptive start intake remains minimal and canonical', () => {
  const startForm = read('src/components/adaptive/AdaptiveStartForm.tsx');
  for (const field of ['fullName', 'email', 'organisationName', 'roleTitle', 'consentPrivacy', 'consentResearch']) assert.match(startForm, new RegExp(field));
  for (const legacyField of ['phone', 'tradingName', 'industry', 'sector', 'province', 'employeeBand', 'revenue']) assert.doesNotMatch(startForm, new RegExp(`name=["']${legacyField}`));
  assert.match(startForm, /\/score\/api\/adaptive\/start/);
  assert.match(startForm, /body\.data\.resumeUrl/);
});

const adaptiveExperience = read('src/components/adaptive/AdaptiveAssessmentExperience.tsx');
const productChoice = read('src/components/products/ProductChoice.tsx');
const adaptiveSubmitRoute = read('src/app/score/api/adaptive/[assessmentRef]/submit/route.ts');
const snapshotLoading = read('src/app/score/snapshot/[assessmentRef]/loading.tsx');
check('answer selection saves once, waits for acknowledgement, then consumes the authoritative next node', () => {
  assert.match(adaptiveExperience, /savingRef/);
  assert.match(adaptiveExperience, /pendingWriteRef/);
  assert.match(adaptiveExperience, /setCurrentId\(body\.state\.path\?\.currentNextNode \?\? null\)/);
  assert.match(adaptiveExperience, /expectedSaveSequence/);
  assert.match(adaptiveExperience, /Try saving again/);
  assert.doesNotMatch(adaptiveExperience, /function continueFromCurrent/);
  assert.doesNotMatch(adaptiveExperience, />Save now</);
  assert.doesNotMatch(adaptiveExperience, />Continue</);
  assert.doesNotMatch(adaptiveExperience, /Applicable controls complete/);
  assert.doesNotMatch(adaptiveExperience, /Domain \$\{/);
  assert.match(adaptiveExperience, /customerExplanationForNode/);
  assert.match(adaptiveExperience, /setScreen\(body\.state\.navigation\?\.current_screen/);
});

check('the review and progress surfaces avoid implementation counts and identifiers', () => {
  assert.match(adaptiveExperience, /Your assessment is ready to submit/);
  assert.match(adaptiveExperience, /Areas included in your review/);
  assert.match(adaptiveExperience, /Assessment progress/);
  assert.match(adaptiveExperience, /assessmentProgressLabel/);
  assert.match(adaptiveExperience, /applicable assessment questions completed/);
  assert.match(adaptiveExperience, /assessment scope is being determined/);
  assert.doesNotMatch(adaptiveExperience, /timeRemaining|1\.5 minutes/);
  assert.doesNotMatch(adaptiveExperience, /Review your assessed scope/);
  assert.doesNotMatch(adaptiveExperience, /excludedCount|redirectedCount|skipReason|redirectTo/);
  assert.doesNotMatch(adaptiveExperience, /currentNode\.nodeId\}<|domain\.domainCode\}/);
});

check('paid product selection navigates immediately and sends analytics without blocking', () => {
  assert.doesNotMatch(productChoice, /async function chooseTier/);
  assert.match(productChoice, /navigatingTierRef/);
  assert.match(productChoice, /router\.prefetch\(/);
  assert.match(productChoice, /router\.push\(destination\)/);
  assert.match(productChoice, /keepalive: true/);
  assert.match(productChoice, /void post\('report_option_selected'\)/);
  assert.match(productChoice, /void post\(`\$\{tier\}_selected`\)/);
  assert.doesNotMatch(productChoice, /await post\(/);
  assert.ok(productChoice.indexOf('router.push(destination)') < productChoice.indexOf("void post('report_option_selected')"), 'navigation must be initiated before analytics dispatch');
  for (const payloadField of ['snapshotToken', 'eventType', 'optionCode: tier', "sourceSection: 'next_step'"]) assert.match(productChoice, new RegExp(payloadField.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

check('submission gives immediate processing feedback and recovers safely', () => {
  assert.match(adaptiveExperience, /submissionState/);
  assert.match(adaptiveExperience, /setSubmissionState\('processing'\)/);
  assert.match(adaptiveExperience, /Preparing your Fraud Readiness Snapshot/);
  assert.match(adaptiveExperience, /Your assessment has been submitted\. We are calculating your result/);
  assert.match(adaptiveExperience, /window\.location\.replace\(body\.snapshotUrl\)/);
  assert.match(adaptiveExperience, /Try submission again/);
  assert.doesNotMatch(adaptiveExperience, /free readiness snapshot is ready/);
});

check('submit notifications run after the customer response when the runtime supports it', () => {
  assert.match(adaptiveSubmitRoute, /import \{ after, NextResponse \} from 'next\/server'/);
  assert.match(adaptiveSubmitRoute, /after\(async \(\) =>/);
  assert.match(adaptiveSubmitRoute, /await notifyScoredAssessmentCompletion\(completionNotificationInput\)/);
  assert.doesNotMatch(adaptiveSubmitRoute, /const completionNotification = await notifyScoredAssessmentCompletion/);
  assert.match(adaptiveSubmitRoute, /scheduled_after_response/);
});

check('the Snapshot route exposes a polished loading state without technical language', () => {
  assert.match(snapshotLoading, /Preparing your Fraud Readiness Snapshot/);
  assert.match(snapshotLoading, /Your assessment has been submitted/);
  assert.match(snapshotLoading, /role="progressbar"/);
  assert.doesNotMatch(snapshotLoading, /\b(provider|model|AI|fallback|implementation|internal)\b/i);
});

check('new transition customer copy contains no em dash', () => {
  for (const [name, source] of Object.entries({ productChoice, adaptiveExperience, snapshotLoading })) {
    assert.doesNotMatch(source, /—/, `${name} contains a customer-facing em dash`);
  }
});

check('the three-way commercial ladder preserves identity/history and restores paid Comprehensive ordering', () => {
  const catalogue = read('src/lib/commercial/product-catalogue.ts');
  const paidOrderRoute = read('src/app/score/api/assessments/[assessmentRef]/paid-order/route.ts');
  const snapshot = read('src/components/assessment/SnapshotResult.tsx');
  assert.match(catalogue, /COMPREHENSIVE_PRODUCT_CODE = 'mk_validated_assessment'/);
  assert.match(catalogue, /COMPREHENSIVE_PRICE_CENTS = 3_500_000/);
  assert.match(catalogue, /selfServiceOrderable: true/);
  assert.match(catalogue, /fulfilmentModel: 'automated_analytical'/);
  assert.match(catalogue, /deliveryMode: 'mk_controlled_pdf'/);
  assert.match(catalogue, /export function paidProductForTier/);
  assert.doesNotMatch(paidOrderRoute, /if \(body\?\.tier === 'comprehensive'\)/);
  assert.match(paidOrderRoute, /parseInvoiceRequest/);
  assert.match(paidOrderRoute, /createPaidOrderForAssessment/);
  assert.match(snapshot, /<ProductChoice/);
  assert.match(productChoice, /Choose \$\{product\.label\}/);
  assert.doesNotMatch(snapshot, /ComprehensiveRequestPanel/);
  assert.match(productChoice, /MK Advisory/);
  assert.match(productChoice, /href="\/contact"/);
  const publicComprehensive = listCatalogue().find((listing) => listing.tier === 'comprehensive');
  assert.equal(publicComprehensive?.selfServiceOrderable, true);
  assert.equal(publicComprehensive?.fulfilmentModel, 'automated_analytical');
  assert.equal(COMMERCIAL_CATALOGUE.comprehensive.productCode, COMPREHENSIVE_PRODUCT_CODE);
  assert.equal(COMMERCIAL_CATALOGUE.comprehensive.priceCents, COMPREHENSIVE_PRICE_CENTS);
  assert.equal(paidProductForTier('comprehensive')?.productCode, COMPREHENSIVE_PRODUCT_CODE);
});

check('both paid products use the invoice-aware order confirmation path', () => {
  const snapshot = read('src/components/assessment/SnapshotResult.tsx');
  const orderJourney = read('src/components/commercial/OrderJourney.tsx');
  const orderService = read('src/lib/commercial/order-service.ts');
  assert.match(snapshot, /<ProductChoice/);
  assert.match(productChoice, /\['essential', 'comprehensive'\]/);
  assert.match(orderJourney, /fetch\(\`\$\{SCORE_BASE_PATH\}\/api\/assessments\/\$\{assessmentReference\}\/paid-order\`/);
  assert.match(orderJourney, /invoiceRequested/);
  assert.match(orderService, /db\.rpc\('create_paid_order_with_invoice'/);
});

check('the manual Comprehensive handoff continues to use the existing event/internal notification seam', () => {
  const eventRoute = read('src/app/score/api/assessments/[assessmentRef]/commercial-event/route.ts');
  assert.match(eventRoute, /'comprehensive_selected'/);
  assert.match(eventRoute, /notificationType: selectionTier === 'comprehensive' \? 'comprehensive_selected' : 'essential_selected'/);
});

console.log(JSON.stringify({
  ok: true,
  checks,
  matrix: { gateways: graph.gateways.length, scoredControls: graph.questions.length, coreItems: coreIds.length, displayItems: displayIds.length },
  provider: 'none',
  liveMutation: false
}, null, 2));
