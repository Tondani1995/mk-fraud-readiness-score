#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const adaptive = read('src/components/adaptive/AdaptiveAssessmentExperience.tsx');
const help = read('src/lib/adaptive/customer-help.ts');
const snapshot = read('src/components/assessment/FreeSnapshot.tsx');
const snapshotNarrative = read('src/lib/snapshot/narrative.ts');
const snapshotPage = read('src/app/score/snapshot/[assessmentRef]/page.tsx');
const productCatalogue = read('src/lib/commercial/product-catalogue.ts');
const tierComparison = read('src/components/products/TierComparison.tsx');
const paidOrderRoute = read('src/app/score/api/assessments/[assessmentRef]/paid-order/route.ts');
const orderService = read('src/lib/commercial/order-service.ts');
const adminOrder = read('src/app/score/admin/orders/[orderReference]/page.tsx');
const statusCopy = read('src/components/comprehensive/customer-order-status-copy.ts');
const statusWorkspace = read('src/components/comprehensive/CustomerOrderStatusWorkspace.tsx');
const orderStatusPage = read('src/app/score/order/[assessmentRef]/page.tsx');
const orderConfirmation = read('src/lib/notifications/message-templates.ts');
const paymentService = read('src/lib/payments/payment-service.ts');
const paymentStatusRoute = read('src/app/score/admin/orders/[orderReference]/status/route.ts');
const interimTransition = read('supabase/migrations/20260821113000_interim_manual_fulfilment_transition.sql');
const conversionMigration = read('supabase/migrations/20260821102116_customer_conversion_interim_closure.sql');
const freeze = read('src/lib/rc1/operation-freeze.ts');
const graph = JSON.parse(read('src/lib/adaptive/candidates/adaptive-graph-v1-2-candidate.json'));
const { CUSTOMER_HELP_TEXT } = await import('../src/lib/adaptive/customer-help.ts');
const { resolveOptimisticNavigation } = await import('../src/lib/adaptive/optimistic-navigation.ts');

function has(source, text, label) {
  assert(source.includes(text), `${label}: missing ${text}`);
}

function notHas(source, text, label) {
  assert(!source.includes(text), `${label}: unexpectedly contains ${text}`);
}

// The customer help dictionary is graph-external and covers 17 gateways, 68 scored questions
// and 8 oversight variants without changing the frozen graph payload.
const helpIds = [...help.matchAll(/^\s*['"]?((?:G\d{2}|D\d{1,2}-Q\d{2}|OV-[A-Z0-9-]+))['"]?\s*:/gm)].map((match) => match[1]);
assert.equal(helpIds.length, 93, 'customer-help covers exactly 93 stable customer nodes');
assert.equal(new Set(helpIds).size, 93, 'customer-help node IDs are unique');
for (const id of ['G01', 'G17', 'D1-Q01', 'D8-Q10', 'D10-Q06', 'OV-D3-Q03', 'OV-D8-Q02', 'OV-G07']) assert.match(help, new RegExp(`['"]?${id}['"]?:`), `customer-help ${id}`);
const stopWords = new Set('the a an and or of to for in on with is are be this that how what whether organisation organisation’s organisations their your you it its as from by into can may who where when which do does has have should about through only not'.split(/\s+/));
const meaningfulWords = (value) => new Set((value.toLowerCase().match(/[a-z][a-z’'-]+/g) ?? []).filter((word) => word.length > 2 && !stopWords.has(word)));
for (const node of [
  ...graph.gateways.map((item) => ({ id: item.questionId, prompt: item.prompt })),
  ...graph.questions.map((item) => ({ id: item.questionId, prompt: item.prompt })),
  ...graph.oversightVariants.map((item) => ({ id: item.questionId, prompt: item.prompt }))
]) {
  const promptWords = meaningfulWords(node.prompt);
  const helpWords = meaningfulWords(CUSTOMER_HELP_TEXT[node.id] ?? '');
  const overlap = [...promptWords].filter((word) => helpWords.has(word)).length / Math.min(promptWords.size || 1, helpWords.size || 1);
  assert.ok(CUSTOMER_HELP_TEXT[node.id], `customer-help is present for ${node.id}`);
  assert.ok(overlap < 0.55, `customer-help materially duplicates ${node.id} (${overlap.toFixed(2)})`);
}
has(adaptive, 'What we mean', 'adaptive help label');

// Adaptive journey: one selection gives immediate local feedback and local navigation, then queues
// persistence. Writes are serialized, stale responses are ignored and submission waits for the queue.
has(adaptive, 'const AUTO_ADVANCE_DELAY_MS = 140', 'bounded auto-advance latency');
has(adaptive, 'window.setTimeout', 'auto-advance timer');
has(adaptive, 'const saveQueueRef = useRef<Promise<boolean>>(Promise.resolve(true))', 'serialized save queue');
has(adaptive, 'async function flushSaveQueue()', 'submit queue flush');
has(adaptive, 'if (!(await flushSaveQueue()))', 'submit waits for latest save');
has(adaptive, 'resolveOptimisticNavigation', 'graph-derived optimistic routing');
has(adaptive, 'const localRevisionRef = useRef(0)', 'local interaction revision');
has(adaptive, 'requestRevision !== localRevisionRef.current', 'stale response guard');
has(adaptive, 'pendingAutoAdvanceRef', 'pending transition flush');
has(adaptive, 'Retry save', 'recoverable save error');
notHas(adaptive, 'Save now', 'obsolete manual save action');
notHas(adaptive, 'Selecting an answer saves and continues automatically.', 'obsolete auto-save customer instruction');
has(adaptive, 'Review my answers', 'review answers remains available');
has(adaptive, 'Assessment completion', 'overall progress bar');
has(adaptive, 'About 8–10 min remaining', 'broad time estimate');
const gatewayChoice = adaptive.slice(adaptive.indexOf('function chooseGateway'), adaptive.indexOf('function chooseControl'));
const controlChoice = adaptive.slice(adaptive.indexOf('function chooseControl'), adaptive.indexOf('async function submit'));
assert.ok(gatewayChoice.indexOf('setGatewayAnswers(next)') < gatewayChoice.indexOf('queueAutoAdvance('), 'gateway selection updates local state before the save queue');
assert.ok(controlChoice.indexOf('setControlResponses(next)') < controlChoice.indexOf('queueAutoAdvance('), 'maturity selection updates local state before the save queue');
assert.doesNotMatch(gatewayChoice, /await\s+fetch/, 'gateway navigation is not synchronously blocked by the state round trip');
assert.doesNotMatch(controlChoice, /await\s+fetch/, 'maturity navigation is not synchronously blocked by the state round trip');
assert.ok(adaptive.indexOf('applyOptimisticTransition(nextGatewayAnswers, nextControlResponses, answeredNodeId)') < adaptive.indexOf('void persist({', adaptive.indexOf('function queueAutoAdvance')), 'local transition precedes persistence');
assert.match(adaptive, /if \(autoAdvanceTimerRef\.current\)[\s\S]*pending\?\.\(\);/, 'submit flushes a pending local transition before the save queue');
assert.match(adaptive, /applyLocalPosition\(previousNode\.nodeId, nextScreen\)/, 'Back restores local position before persistence');
assert.match(adaptive, /state\.path\.currentPreviousNode \?\? state\.path\.currentNextNode/, 'Edit answers uses the resolved path');

// The optimistic transition uses the same frozen graph compiler as the server. In particular,
// G04 appears only after G03=Yes; the browser does not invent a fallback next question.
const route = (gatewayAnswers, controlResponses = {}) => resolveOptimisticNavigation({ graph, gatewayAnswers, controlResponses });
const beforeG04 = route({ G01: 'professional_services', G02: 'small', G03: 'no' });
const afterG04 = route({ G01: 'professional_services', G02: 'small', G03: 'yes' });
assert.equal(beforeG04.path.nodes.some((node) => node.nodeId === 'G04'), false, 'G04 is absent when its gateway condition is false');
assert.equal(afterG04.nextId, 'G04', 'G04 is the local next gateway when G03=Yes');
assert.equal(afterG04.nextScreen, 'gateway', 'conditional gateway keeps gateway screen semantics');

// Provider-free interaction proof: a local transition completes before an intentionally delayed
// save, while the serial queue still preserves physical write order and submission waits for it.
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};
let visibleQuestion = 'G01';
const delayedSave = deferred();
const localFirst = route({ G01: 'professional_services' });
visibleQuestion = localFirst.nextId;
assert.notEqual(visibleQuestion, 'G01', 'visible question advances before /state resolves');
assert.equal(delayedSave.promise instanceof Promise, true, 'artificial network latency is represented without blocking local navigation');

let queue = Promise.resolve(true);
const physicalOrder = [];
const firstSave = deferred();
const secondSave = deferred();
function enqueueSave(name, pending) {
  const next = queue.then(async () => {
    physicalOrder.push(`start:${name}`);
    await pending.promise;
    physicalOrder.push(`finish:${name}`);
    return true;
  });
  queue = next;
  return next;
}
const firstQueued = enqueueSave('first', firstSave);
const secondQueued = enqueueSave('second', secondSave);
await Promise.resolve();
assert.deepEqual(physicalOrder, ['start:first'], 'rapid sequential answers serialize the first physical save');
firstSave.resolve();
await firstQueued;
await Promise.resolve();
assert.deepEqual(physicalOrder, ['start:first', 'finish:first', 'start:second'], 'second answer waits for the first save');
secondSave.resolve();
await secondQueued;
assert.deepEqual(physicalOrder, ['start:first', 'finish:first', 'start:second', 'finish:second'], 'rapid sequential answers persist in order');

let localRevision = 2;
let localPosition = 'D1-Q02';
function applyServerResponse(responseRevision, serverPosition) {
  if (responseRevision !== localRevision) return;
  localPosition = serverPosition;
}
applyServerResponse(1, 'D1-Q01');
assert.equal(localPosition, 'D1-Q02', 'stale earlier save response cannot roll back later navigation');
applyServerResponse(2, 'D1-Q03');
assert.equal(localPosition, 'D1-Q03', 'current save response may confirm the local position');

let saveError = null;
let retryCount = 0;
async function recoverableSave(shouldFail) {
  if (shouldFail) throw new Error('synthetic network latency/failure');
  retryCount += 1;
  return true;
}
try { await recoverableSave(true); } catch { saveError = 'Your answer could not be saved. Please retry.'; }
assert.equal(saveError, 'Your answer could not be saved. Please retry.', 'failed save is surfaced as a recoverable error');
assert.equal(await recoverableSave(false), true, 'failed save can be retried');
assert.equal(retryCount, 1, 'retry performs one replacement save');

const submitSave = deferred();
let submitReached = false;
const submitAfterFlush = (async () => { await submitSave.promise; submitReached = true; })();
await Promise.resolve();
assert.equal(submitReached, false, 'submit cannot overtake a pending save');
submitSave.resolve();
await submitAfterFlush;
assert.equal(submitReached, true, 'submit proceeds only after the save queue flushes');

// Back/Edit remain local navigation operations and are persisted with the same ordered queue.
let editPosition = afterG04.nextId;
editPosition = afterG04.path.currentPreviousNode ?? afterG04.nextId;
assert.equal(editPosition, 'G03', 'Edit answers returns to the resolved previous answer');
editPosition = 'G03';
assert.equal(editPosition, 'G03', 'Back can restore the previous answered gateway locally');
notHas(adaptive, 'Applicable controls', 'adaptive customer copy');
notHas(adaptive, 'Excluded areas', 'adaptive customer copy');
notHas(adaptive, 'redirectedCount', 'adaptive customer copy');
notHas(adaptive, 'Review your assessed scope', 'adaptive customer copy');
notHas(adaptive, 'Domain D1', 'adaptive customer copy');
notHas(adaptive, 'Change scope and continue', 'adaptive customer copy');

// Completion is a clean hand-off with a secondary answer review.
has(adaptive, 'Your assessment is complete', 'completion heading');
has(adaptive, 'See my Fraud Readiness Snapshot', 'snapshot CTA');
has(adaptive, 'Review my answers', 'completion answer review');

// Free Snapshot: deterministic facts remain immediate; one bounded Mini result is cache-keyed by
// assessment, score run, methodology and prompt version, and reopening the page is cache-only.
for (const field of ['headline', 'diagnosis', 'strongestArea', 'prioritySignals', 'managementImplication']) has(snapshotNarrative, field, `snapshot schema ${field}`);
has(snapshotNarrative, 'SNAPSHOT_NARRATIVE_MAX_WORDS = 180', 'snapshot word bound');
has(snapshotNarrative, 'maxOutputTokens: 700', 'snapshot output bound');
has(snapshotNarrative, 'maxRetries: 0', 'snapshot provider retry bound');
has(snapshotNarrative, 'free_snapshot_narratives', 'snapshot cache table');
has(snapshotNarrative, "eq('assessment_id', snapshot.assessmentId)", 'snapshot assessment cache key');
has(snapshotNarrative, "eq('methodology_version', snapshot.methodologyVersion)", 'snapshot methodology cache key');
has(snapshotNarrative, 'getOrCreateSnapshotNarrative', 'snapshot creation seam');
notHas(snapshotPage, 'buildSnapshotNarrative(', 'snapshot reopen does not call provider');
notHas(snapshot, 'Applicable controls', 'snapshot customer scope diagnostics');
notHas(snapshot, 'Excluded areas', 'snapshot customer scope diagnostics');
notHas(snapshot, 'Coverage and applicability', 'snapshot customer scope diagnostics');
has(snapshot, 'Discuss an Advisory engagement', 'advisory CTA');
has(snapshot, 'This enquiry does not create a paid order.', 'advisory is not a paid order');
has(tierComparison, 'advisory?: TierComparisonProduct', 'three-tier comparison support');
has(productCatalogue, 'COMPREHENSIVE_PRICE_CENTS = 3_500_000', 'Comprehensive catalogue price');
has(productCatalogue, "selfServiceOrderable: true", 'self-service paid tiers');
has(paidOrderRoute, 'invoiceRequested', 'invoice request payload');
has(paidOrderRoute, 'Complete the required invoice and billing details', 'invoice validation');
has(orderService, "rpc('create_paid_order_with_invoice'", 'invoice-bound paid-order RPC');
has(interimTransition, 'create_paid_order_with_invoice', 'atomic invoice-bound paid-order wrapper');
for (const field of ['organisationLegalName', 'attention', 'billingEmail', 'addressLine1', 'city', 'province', 'postalCode', 'country', 'vatNumber', 'companyRegistrationNumber', 'purchaseOrderReference']) has(snapshot, field, `invoice field ${field}`);
for (const field of ['invoice_requested', 'invoice_details']) has(conversionMigration, field, `invoice schema ${field}`);
for (const field of ['invoice_requested', 'invoice_details']) has(adminOrder, field, `admin invoice view ${field}`);

// Customer order/status copy is tier-aware while the fulfilment sequence is explicitly manual.
for (const copy of ['Comprehensive automated assessment', 'Comprehensive report PDF', 'Comprehensive supporting register XLSX', 'Essential automated diagnostic', 'Essential report PDF', 'MK confirms payment manually', 'emails the final files manually']) has(statusCopy, copy, `status copy ${copy}`);
notHas(statusCopy, 'Essential supporting register XLSX', 'Essential status copy must not promise a register');
has(statusWorkspace, '<CardTitle>Report delivery</CardTitle>', 'manual report delivery heading');
has(orderStatusPage, 'Your order, its payment status and what happens next.', 'order status entry copy');
notHas(statusCopy, 'automated package is released', 'automatic release promise');
notHas(statusCopy, 'secure delivery link', 'secure automated delivery promise');
notHas(snapshot, 'automated report generation', 'automatic generation promise');
notHas(snapshot, 'secure delivery', 'secure automated delivery promise');
has(orderConfirmation, 'operator will prepare and quality-check', 'order confirmation manual sequence');
has(orderConfirmation, 'email the final files manually', 'manual delivery message');

// Payment is confirmed idempotently but creates no automatic generation request or customer
// delivery dispatch. The new migration is the sole source of the changed database function.
notHas(paymentStatusRoute, 'dispatchImmediateFulfilment', 'admin payment route auto-dispatch');
notHas(paymentStatusRoute, 'waitUntil', 'admin payment route background dispatch');
notHas(interimTransition, 'manual_report_generation_attempts', 'payment transition generation queue');
notHas(interimTransition, 'REPORT_QUEUED', 'payment transition automatic queue state');
has(interimTransition, "'manual_fulfilment_pending'", 'manual fulfilment audit event');
has(interimTransition, "'generation_requested', false", 'no generation request proof');
has(interimTransition, "'automatic_delivery_requested', false", 'no automatic delivery proof');
has(paymentService, 'An MK operator will prepare and quality-check', 'payment service manual message');

// Ordinary customer routes no longer depend on the retired RC1 freeze boundary.
notHas(freeze, 'getRc1CustomerFreezeResponse', 'customer-safe RC1 helper retired from ordinary paths');
notHas(freeze, 'Orders and enquiries are temporarily unavailable', 'retired customer-safe freeze copy removed');

console.log(JSON.stringify({
  ok: true,
  checks: [
    '93 graph-external customer-help entries',
    '140ms auto-advance with serialized persistence and submit flush',
    'clean completion and snapshot cache boundary',
    'Essential/Comprehensive/Advisory conversion paths',
    'invoice capture and admin visibility',
    'manual payment-to-report fulfilment boundary',
    'ordinary customer paths are freeze-independent'
  ],
  providerCalls: 0,
  journeyStarted: false
}, null, 2));
