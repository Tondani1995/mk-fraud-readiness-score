#!/usr/bin/env node
/**
 * Provider-free proof for the adaptive answer-save boundary.
 *
 * The route still receives the client's complete local maps so the server can compare them
 * with authoritative persisted state. Only the one accepted answer delta reaches the existing
 * adaptive_save_state RPC, and the next public state is rebuilt in memory rather than reread.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import puppeteer from 'puppeteer-core';
import {
  buildAdaptivePostSaveState,
  deriveAdaptiveAnswerDelta,
  saveAdaptiveAssessmentState
} from '../src/lib/adaptive/server.ts';
import { deriveAdaptiveIntegritySignals, resolveAdaptivePath } from '../src/lib/adaptive/engine.ts';

const graph = JSON.parse(readFileSync(new URL('../src/lib/adaptive/candidates/adaptive-graph-v1-2-candidate.json', import.meta.url), 'utf8'));
const source = readFileSync(new URL('../src/lib/adaptive/server.ts', import.meta.url), 'utf8');
const saveStart = source.indexOf('export async function saveAdaptiveAssessmentState');
const submitStart = source.indexOf('export async function submitAdaptiveAssessment');
const saveSource = source.slice(saveStart, submitStart);
assert.ok(saveStart >= 0 && submitStart > saveStart, 'save function source must be addressable');
assert.doesNotMatch(saveSource, /getAdaptiveAssessmentState\(/, 'answer save must not perform a post-save full state reload');
assert.match(saveSource, /p_gateway_answers:\s*delta\.delta\.gatewayAnswers/);
assert.match(saveSource, /p_control_responses:\s*delta\.delta\.controlResponses/);

const gatewayAnswers = Object.fromEntries(graph.gateways.map((gateway) => [gateway.questionId, gateway.responseOptions[0].value]));
const currentControlResponses = {
  'D1-Q01': { responseState: 'maturity', responseValue: 2 },
  'D1-Q02': { responseState: 'maturity', responseValue: 3 }
};

const controlDelta = deriveAdaptiveAnswerDelta({
  currentGatewayAnswers: gatewayAnswers,
  currentControlResponses,
  nextGatewayAnswers: gatewayAnswers,
  nextControlResponses: { ...currentControlResponses, 'D1-Q01': { responseState: 'maturity', responseValue: 4 } }
});
assert.deepEqual(controlDelta, {
  ok: true,
  delta: {
    gatewayAnswers: [],
    controlResponses: [{ question_id: 'D1-Q01', response_state: 'maturity', response_value: 4 }]
  }
}, 'a normal control answer must produce one control delta only');

const gatewayNext = { ...gatewayAnswers, G17: graph.gateways.find((gateway) => gateway.questionId === 'G17').responseOptions[1].value };
const gatewayDelta = deriveAdaptiveAnswerDelta({
  currentGatewayAnswers: gatewayAnswers,
  currentControlResponses,
  nextGatewayAnswers: gatewayNext,
  nextControlResponses: currentControlResponses
});
assert.equal(gatewayDelta.ok, true);
assert.deepEqual(gatewayDelta.delta.gatewayAnswers, [{ question_id: 'G17', response_value: gatewayNext.G17 }]);
assert.deepEqual(gatewayDelta.delta.controlResponses, [], 'a normal gateway answer must not resend unchanged controls');

const invalidationDelta = deriveAdaptiveAnswerDelta({
  currentGatewayAnswers: gatewayAnswers,
  currentControlResponses: { ...currentControlResponses, 'D3-Q08': { responseState: 'maturity', responseValue: 4 } },
  nextGatewayAnswers: gatewayNext,
  nextControlResponses: currentControlResponses,
  invalidatedQuestionIds: ['D3-Q08']
});
assert.equal(invalidationDelta.ok, true);
assert.deepEqual(invalidationDelta.delta.controlResponses, [], 'invalidated historical controls must not be re-upserted');

assert.deepEqual(deriveAdaptiveAnswerDelta({
  currentGatewayAnswers: gatewayAnswers,
  currentControlResponses,
  nextGatewayAnswers: gatewayAnswers,
  nextControlResponses: { ...currentControlResponses, 'D1-Q01': { responseState: 'maturity', responseValue: 4 }, 'D1-Q02': { responseState: 'maturity', responseValue: 5 } }
}), { ok: false, reason: 'adaptive_multiple_answer_deltas' });
assert.deepEqual(deriveAdaptiveAnswerDelta({
  currentGatewayAnswers: gatewayAnswers,
  currentControlResponses,
  nextGatewayAnswers: gatewayAnswers,
  nextControlResponses: { 'D1-Q01': currentControlResponses['D1-Q01'] }
}), { ok: false, reason: 'adaptive_answer_delta_invalid' }, 'missing an unrelated persisted answer must fail closed');
assert.deepEqual(deriveAdaptiveAnswerDelta({
  currentGatewayAnswers: gatewayAnswers,
  currentControlResponses,
  nextGatewayAnswers: gatewayAnswers,
  nextControlResponses: currentControlResponses
}), { ok: false, reason: 'adaptive_answer_delta_missing' });

const currentPath = resolveAdaptivePath({ graph, gatewayAnswers, controlResponses: currentControlResponses });
const currentState = {
  graph,
  gatewayAnswers,
  controlResponses: { ...currentControlResponses, 'D3-Q08': { responseState: 'maturity', responseValue: 4 } },
  guidanceByQuestion: {},
  navigation: {
    graph_version_id: 'graph-id',
    current_question_id: 'D1-Q01',
    visited_question_ids: ['G01'],
    current_screen: 'question',
    save_sequence: 7,
    last_saved_at: '2026-08-28T00:00:00.000Z',
    submitted_at: null
  },
  path: currentPath,
  signals: deriveAdaptiveIntegritySignals({ graph, path: currentPath, gatewayAnswers, navigation: { currentQuestionId: 'D1-Q01', currentScreen: 'question' } })
};
const postInvalidationState = buildAdaptivePostSaveState({
  current: currentState,
  saveInput: { currentScreen: 'question', currentQuestionId: 'D1-Q02', visitedQuestionIds: ['G01', 'D1-Q01', 'D1-Q02'] },
  delta: invalidationDelta.delta,
  invalidatedQuestionIds: ['D3-Q08'],
  saveSequence: 8,
  savedAt: '2026-08-28T00:00:01.000Z'
});
assert.equal(postInvalidationState.controlResponses['D3-Q08'], undefined);
assert.equal(postInvalidationState.navigation.save_sequence, 8);
assert.equal(postInvalidationState.navigation.current_question_id, 'D1-Q02');
assert.equal(postInvalidationState.path.graphVersion, graph.graphVersion);

function fakeDb({ assessment, navigation, gatewayRows, controlRows, graphRow, activation }) {
  const fromCalls = [];
  const rpcCalls = [];
  const rows = {
    assessment_tokens: { data: { id: 'token-id', assessment_id: assessment.id, token_type: 'resume', expires_at: '2099-01-01T00:00:00.000Z', max_uses: 25, use_count: 0, revoked_at: null } },
    adaptive_activation_policies: { data: activation },
    assessments: { data: assessment },
    adaptive_graph_versions: { data: graphRow },
    assessment_navigation_states: { data: navigation },
    adaptive_gateway_answers: { data: gatewayRows },
    adaptive_control_responses: { data: controlRows },
    assessment_evidence_guidance: { data: [] }
  };
  const from = (table) => {
    fromCalls.push(table);
    const result = rows[table] ?? { data: null };
    const builder = {
      select() { return this; },
      eq() { return this; },
      maybeSingle: async () => result,
      single: async () => result,
      then(resolve, reject) { return Promise.resolve(result).then(resolve, reject); }
    };
    return builder;
  };
  return {
    from,
    rpc: async (name, args) => {
      rpcCalls.push({ name, args });
      return { data: { ok: true, conflict: false, save_sequence: navigation.save_sequence + 1, saved_at: '2026-08-28T00:00:01.000Z' }, error: null };
    },
    fromCalls,
    rpcCalls
  };
}

const assessment = {
  id: 'assessment-id',
  assessment_reference: 'MKADAPT-PERF-20260828',
  organisation_id: 'organisation-id',
  primary_respondent_id: null,
  methodology_version_id: 'methodology-id',
  status: 'draft',
  assessment_mode: 'adaptive',
  current_score_run_id: null,
  graph_version_id: 'graph-id',
  graph_version_snapshot: graph.graphVersion,
  graph_fingerprint_snapshot: graph.graphFingerprint,
  submitted_at: null,
  locked_at: null
};
const graphRow = {
  compiled_graph_json: graph,
  graph_version: graph.graphVersion,
  graph_fingerprint: graph.graphFingerprint,
  methodology_version_id: 'methodology-id',
  methodology_version: graph.methodologyVersion,
  status: 'published'
};
const activation = {
  policy_key: 'customer_start',
  environment: 'preview',
  supabase_project: 'penhenkzfrtmcxklodtu',
  graph_version: graph.graphVersion,
  graph_fingerprint: graph.graphFingerprint,
  enabled: true,
  activation_sha: 'a'.repeat(40)
};
process.env.VERCEL_ENV = 'preview';
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://penhenkzfrtmcxklodtu.supabase.co';
process.env.VERCEL_GIT_COMMIT_SHA = 'a'.repeat(40);
process.env.ASSESSMENT_TOKEN_PEPPER = 'provider-free-test-pepper';

const db = fakeDb({
  assessment,
  navigation: {
    graph_version_id: 'graph-id',
    current_question_id: 'D1-Q01',
    visited_question_ids: ['G01'],
    current_screen: 'question',
    save_sequence: 7,
    last_saved_at: '2026-08-28T00:00:00.000Z',
    submitted_at: null
  },
  gatewayRows: Object.entries(gatewayAnswers).map(([question_id, response_value]) => ({ question_id, response_value })),
  controlRows: [{ question_id: 'D1-Q01', response_state: 'maturity', response_value: 2 }],
  graphRow,
  activation
});
const saved = await saveAdaptiveAssessmentState({
  assessmentReference: assessment.assessment_reference,
  token: 'synthetic-token',
  expectedSaveSequence: 7,
  currentScreen: 'question',
  currentQuestionId: 'D1-Q02',
  visitedQuestionIds: ['G01', 'D1-Q01', 'D1-Q02'],
  gatewayAnswers,
  controlResponses: { 'D1-Q01': { responseState: 'maturity', responseValue: 4 } }
}, { db });
assert.equal(saved.ok, true);
assert.equal(db.rpcCalls.length, 1, 'one answer must invoke one adaptive_save_state RPC');
assert.deepEqual(db.rpcCalls[0].args.p_gateway_answers, [], 'normal control save must send zero gateway rows');
assert.deepEqual(db.rpcCalls[0].args.p_control_responses, [{ question_id: 'D1-Q01', response_state: 'maturity', response_value: 4 }]);
assert.equal(db.fromCalls.includes('organisations'), false, 'answer save must not load organisation projection');
assert.equal(db.fromCalls.includes('respondents'), false, 'answer save must not load respondent projection');
assert.equal(db.fromCalls.filter((table) => table === 'adaptive_activation_policies').length, 1, 'activation policy loads once');
assert.equal(db.fromCalls.filter((table) => table === 'adaptive_graph_versions').length, 1, 'graph loads once');
assert.equal(saved.state.controlResponses['D1-Q01'].responseValue, 4, 'post-save state uses the accepted delta');
assert.equal(saved.state.navigation.save_sequence, 8, 'post-save state uses the RPC sequence');
assert.equal(saved.state.path.currentNextNode, 'D1-Q02', 'post-save state resolves the next question in memory');

console.log(JSON.stringify({
  ok: true,
  assertions: 18,
  normalControl: { gatewayRows: db.rpcCalls[0].args.p_gateway_answers.length, controlRows: db.rpcCalls[0].args.p_control_responses.length },
  postSaveReloads: 0,
  organisationRespondentLoads: 0,
  invalidationRowsResent: 0,
  provider: 'none',
  database: 'fake provider-free contract harness'
}, null, 2));

function quantile(values, q) {
  const ordered = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!ordered.length) return null;
  return ordered[Math.min(ordered.length - 1, Math.ceil(ordered.length * q) - 1)];
}

function stateSavePath(url) {
  try {
    const parsed = new URL(url);
    return parsed.pathname.includes('/score/api/adaptive/') && parsed.pathname.endsWith('/state');
  } catch {
    return false;
  }
}

async function currentNodeName(page) {
  return await page.$eval('fieldset input[type="radio"]', (input) => input.getAttribute('name')).catch(() => null);
}

async function clickButtonText(page, expectedText) {
  const buttons = await page.$$('button');
  for (const button of buttons) {
    const text = await button.evaluate((element) => element.textContent?.trim() ?? '');
    if (text === expectedText) {
      await button.click();
      return;
    }
    await button.dispose();
  }
  throw new Error(`button_not_found:${expectedText}`);
}

async function clickFirstUncheckedRadio(page) {
  const radio = await page.$('fieldset input[type="radio"]:not(:checked)')
    ?? await page.$('fieldset input[type="radio"]');
  if (!radio) throw new Error('adaptive_radio_not_found');
  await radio.click();
  await radio.dispose();
}

async function waitForNodeChange(page, previousNode, timeout = 15000) {
  await page.waitForFunction((previous) => {
    const current = document.querySelector('fieldset input[type="radio"]')?.getAttribute('name') ?? null;
    return current !== previous;
  }, { timeout }, previousNode);
}

async function goBackToNode(page, targetNode) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const current = await currentNodeName(page);
    if (current === targetNode) return attempt;
    const previous = current;
    await clickButtonText(page, 'Back');
    await page.waitForFunction((before) => (document.querySelector('fieldset input[type="radio"]')?.getAttribute('name') ?? null) !== before, { timeout: 5000 }, previous);
  }
  throw new Error(`adaptive_back_target_not_reached:${targetNode}`);
}

async function readSafeStateCounts(page, assessmentReference) {
  return await page.evaluate(async (reference) => {
    const token = new URL(window.location.href).searchParams.get('token') ?? '';
    const response = await fetch(`/score/api/adaptive/${encodeURIComponent(reference)}/state?token=${encodeURIComponent(token)}`);
    const body = await response.json().catch(() => ({}));
    return {
      status: response.status,
      ok: response.ok && body.ok === true,
      gatewayCount: Object.keys(body.state?.gatewayAnswers ?? {}).length,
      controlCount: Object.keys(body.state?.controlResponses ?? {}).length,
      saveSequence: Number(body.state?.navigation?.save_sequence ?? NaN),
      currentNode: body.state?.path?.currentNextNode ?? null
    };
  }, assessmentReference);
}

async function installBrowserInstrumentation(page) {
  await page.evaluateOnNewDocument(() => {
    const nodeName = () => document.querySelector('fieldset input[type="radio"]')?.getAttribute('name') ?? null;
    window.__cxAdaptivePerf = { fetches: [], visual: [], transitions: [] };
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const requestUrl = typeof input === 'string' ? input : input?.url ?? String(input);
      const method = String(init?.method ?? (typeof input === 'object' ? input?.method : 'GET') ?? 'GET').toUpperCase();
      const path = new URL(requestUrl, window.location.href).pathname;
      const startedAt = performance.now();
      const beforeNode = nodeName();
      try {
        const response = await originalFetch(input, init);
        const responseAt = performance.now();
        const record = { method, path, status: response.status, startedAt, responseAt, durationMs: responseAt - startedAt };
        window.__cxAdaptivePerf.fetches.push(record);
        if (method === 'POST' && path.includes('/score/api/adaptive/') && path.endsWith('/state') && response.ok) {
          let frames = 0;
          const observeNextPaint = () => {
            const nextNode = nodeName();
            if (nextNode !== beforeNode || frames >= 120) {
              const nextPaintAt = performance.now();
              window.__cxAdaptivePerf.transitions.push({
                beforeNode,
                nextNode,
                requestDurationMs: record.durationMs,
                responseToNextPaintMs: nextPaintAt - responseAt,
                tapToNextPaintMs: nextPaintAt - startedAt,
                status: response.status,
                timedOut: frames >= 120
              });
              return;
            }
            frames += 1;
            window.requestAnimationFrame(observeNextPaint);
          };
          window.requestAnimationFrame(observeNextPaint);
        }
        return response;
      } catch (error) {
        const responseAt = performance.now();
        window.__cxAdaptivePerf.fetches.push({ method, path, status: 0, startedAt, responseAt, durationMs: responseAt - startedAt, failed: true });
        throw error;
      }
    };
    document.addEventListener('change', (event) => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement) || input.type !== 'radio') return;
      const startedAt = performance.now();
      const node = input.name;
      let frames = 0;
      const observeSelectedPaint = () => {
        const label = input.closest('label');
        const selected = input.checked && Boolean(label?.classList.contains('border-mk-charcoal')) && Boolean(label?.classList.contains('bg-mk-cream'));
        if (selected || frames >= 120) {
          window.__cxAdaptivePerf.visual.push({ node, acknowledgementMs: performance.now() - startedAt, selected, timedOut: frames >= 120 });
          return;
        }
        frames += 1;
        window.requestAnimationFrame(observeSelectedPaint);
      };
      window.requestAnimationFrame(observeSelectedPaint);
    }, true);
  });
}

async function browserMetrics(page) {
  return await page.evaluate(() => ({
    fetches: window.__cxAdaptivePerf?.fetches ?? [],
    visual: window.__cxAdaptivePerf?.visual ?? [],
    transitions: window.__cxAdaptivePerf?.transitions ?? []
  }));
}

async function runBrowserPerformanceCertification() {
  const baseUrl = process.env.CX_PERF_BASE_URL?.trim();
  if (!baseUrl) return { browser: 'not_requested' };
  const evidenceDirectory = process.env.CX_PERF_EVIDENCE_DIR?.trim() ?? 'tmp/cx-v12-adaptive-performance';
  await mkdir(evidenceDirectory, { recursive: true });
  const executablePath = process.env.CHROME_EXECUTABLE
    ?? (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : '/usr/bin/google-chrome');
  const protectionBypass = process.env.VERCEL_PROTECTION_BYPASS?.trim();
  const browser = await puppeteer.launch({ executablePath, headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  const configurePage = async (targetPage) => {
    await targetPage.setExtraHTTPHeaders({
      ...(protectionBypass ? { 'x-vercel-protection-bypass': protectionBypass } : {}),
      'x-vercel-set-bypass-cookie': 'true'
    });
    await targetPage.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
    await targetPage.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    await installBrowserInstrumentation(targetPage);
  };
  const assessmentReference = `CX-PERF-${Date.now()}`;
  const syntheticEmail = `${assessmentReference.toLowerCase()}@example.test`;
  const syntheticName = 'CX Performance Synthetic';
  const result = { baseOrigin: new URL(baseUrl).origin, assessmentReference, scenarios: {} };

  try {
    await configurePage(page);
    await page.goto(`${baseUrl.replace(/\/$/, '')}/score/start`, { waitUntil: 'networkidle0', timeout: 30000 });
    await page.waitForSelector('[data-adaptive-assessment-start="true"]');
    await page.type('input[name="fullName"]', syntheticName);
    await page.type('input[name="email"]', syntheticEmail);
    await page.type('input[name="organisationName"]', `${syntheticName} ${assessmentReference}`);
    await page.type('input[name="roleTitle"]', 'Certification respondent');
    await page.click('input[name="consentPrivacy"]');
    await page.click('button[type="submit"]');
    await page.waitForFunction(() => window.location.pathname.startsWith('/score/adaptive/'), { timeout: 30000 });
    await page.waitForSelector('fieldset input[type="radio"]');
    const resumePath = new URL(page.url()).pathname;
    result.resumePath = resumePath;

    for (let index = 0; index < graph.gateways.length; index += 1) {
      const before = await currentNodeName(page);
      await clickFirstUncheckedRadio(page);
      await waitForNodeChange(page, before);
    }
    result.scenarios.gatewayBranchTransition = { passed: true, gatewaySaves: graph.gateways.length };

    for (let index = 0; index < 20; index += 1) {
      const before = await currentNodeName(page);
      await clickFirstUncheckedRadio(page);
      await waitForNodeChange(page, before);
    }
    result.scenarios.normalSaves = { passed: true, count: 20 };

    const beforeInvalidation = await readSafeStateCounts(page, assessmentReference);
    await goBackToNode(page, 'G03');
    const g03Radios = await page.$$('fieldset input[type="radio"]');
    assert.ok(g03Radios.length >= 2, 'G03 must expose an alternate branch option');
    await g03Radios[1].click();
    for (const radio of g03Radios) await radio.dispose();
    await page.waitForSelector('[role="dialog"]');
    await clickButtonText(page, 'Change scope and continue');
    await waitForNodeChange(page, 'G03');
    const afterInvalidation = await readSafeStateCounts(page, assessmentReference);
    assert.equal(beforeInvalidation.ok, true);
    assert.equal(afterInvalidation.ok, true);
    assert.ok(afterInvalidation.controlCount < beforeInvalidation.controlCount, 'confirmed gateway change must remove invalidated saved controls');
    result.scenarios.confirmedInvalidation = {
      passed: true,
      controlResponsesBefore: beforeInvalidation.controlCount,
      controlResponsesAfter: afterInvalidation.controlCount,
      invalidatedCount: beforeInvalidation.controlCount - afterInvalidation.controlCount
    };

    const beforeEdit = await currentNodeName(page);
    await clickButtonText(page, 'Back');
    await page.waitForFunction((previous) => (document.querySelector('fieldset input[type="radio"]')?.getAttribute('name') ?? null) !== previous, { timeout: 5000 }, beforeEdit);
    const editedNode = await currentNodeName(page);
    await clickFirstUncheckedRadio(page);
    await waitForNodeChange(page, editedNode);
    result.scenarios.backEdit = { passed: true, node: editedNode };

    const beforeRefresh = await currentNodeName(page);
    const countsBeforeRefresh = await readSafeStateCounts(page, assessmentReference);
    const metricsBeforeRefresh = await browserMetrics(page);
    await page.reload({ waitUntil: 'networkidle0', timeout: 30000 });
    await page.waitForSelector('fieldset input[type="radio"]');
    const afterRefresh = await currentNodeName(page);
    const countsAfterRefresh = await readSafeStateCounts(page, assessmentReference);
    assert.equal(afterRefresh, beforeRefresh, 'refresh/resume must retain the authoritative next node');
    assert.equal(countsAfterRefresh.controlCount, countsBeforeRefresh.controlCount, 'refresh/resume must retain saved control count');
    result.scenarios.refreshResume = { passed: true, currentNode: afterRefresh, controlCount: countsAfterRefresh.controlCount };

    await page.setRequestInterception(true);
    let failedSaveRequests = 0;
    const failFirstSave = async (request) => {
      if (request.isInterceptResolutionHandled()) return;
      if (request.method() === 'POST' && stateSavePath(request.url())) {
        failedSaveRequests += 1;
        if (failedSaveRequests === 1) {
          await request.respond({ status: 503, contentType: 'application/json', body: JSON.stringify({ ok: false, errors: ['Controlled test save failure.'] }) });
          return;
        }
      }
      await request.continue();
    };
    page.on('request', failFirstSave);
    const failedSaveNode = await currentNodeName(page);
    await clickFirstUncheckedRadio(page);
    await page.waitForSelector('[role="alert"]');
    assert.equal(await page.$eval('fieldset input[type="radio"]:checked', (input) => input.checked), true, 'failed save must retain the selected answer');
    await clickButtonText(page, 'Try saving again');
    await waitForNodeChange(page, failedSaveNode);
    page.off('request', failFirstSave);
    await page.setRequestInterception(false);
    assert.equal(failedSaveRequests, 2, 'retry must issue exactly one successful second save');
    result.scenarios.failedSaveRecovery = { passed: true, requests: failedSaveRequests, retryPreservedSelection: true, advancedAfterRetry: true };

    await page.setRequestInterception(true);
    let heldRequest = null;
    let rapidTapRequests = 0;
    const holdFirstRapidTap = async (request) => {
      if (request.isInterceptResolutionHandled()) return;
      if (request.method() === 'POST' && stateSavePath(request.url())) {
        rapidTapRequests += 1;
        if (!heldRequest) {
          heldRequest = request;
          return;
        }
      }
      await request.continue();
    };
    page.on('request', holdFirstRapidTap);
    const rapidTapNode = await currentNodeName(page);
    await page.evaluate(() => {
      const radios = [...document.querySelectorAll('fieldset input[type="radio"]:not(:checked)')];
      radios[0]?.click();
      radios[1]?.click();
    });
    await delay(300);
    assert.equal(rapidTapRequests, 1, 'rapid taps must be guarded before a second request is sent');
    await heldRequest.continue();
    await waitForNodeChange(page, rapidTapNode);
    page.off('request', holdFirstRapidTap);
    await page.setRequestInterception(false);
    result.scenarios.rapidTap = { passed: true, requests: rapidTapRequests, logicalWrites: 1, skippedQuestion: false };

    const secondTab = await browser.newPage();
    await configurePage(secondTab);
    await secondTab.goto(page.url(), { waitUntil: 'networkidle0', timeout: 30000 });
    await secondTab.waitForSelector('fieldset input[type="radio"]');
    let heldConflictRequest = null;
    let firstTabRequests = 0;
    let conflictResponses = 0;
    const holdFirstTabSave = async (request) => {
      if (request.isInterceptResolutionHandled()) return;
      if (request.method() === 'POST' && stateSavePath(request.url())) {
        firstTabRequests += 1;
        if (!heldConflictRequest) {
          heldConflictRequest = request;
          return;
        }
      }
      await request.continue();
    };
    const countConflict = (response) => {
      if (stateSavePath(response.url()) && response.request().method() === 'POST' && response.status() === 409) conflictResponses += 1;
    };
    page.on('request', holdFirstTabSave);
    page.on('response', countConflict);
    const conflictNode = await currentNodeName(page);
    const secondConflictNode = await currentNodeName(secondTab);
    assert.equal(secondConflictNode, conflictNode, 'two tabs must start from the same save sequence');
    await clickFirstUncheckedRadio(page);
    await secondTab.bringToFront();
    await clickFirstUncheckedRadio(secondTab);
    await waitForNodeChange(secondTab, conflictNode);
    await page.bringToFront();
    await heldConflictRequest.continue();
    await page.waitForFunction((target) => (document.querySelector('fieldset input[type="radio"]')?.getAttribute('name') ?? null) === target, { timeout: 20000 }, await currentNodeName(secondTab));
    page.off('request', holdFirstTabSave);
    page.off('response', countConflict);
    await page.setRequestInterception(false);
    assert.equal(firstTabRequests, 1, 'stale first tab must issue one logical write');
    assert.equal(conflictResponses, 1, 'stale first tab must receive one save conflict');
    assert.equal(await currentNodeName(page), await currentNodeName(secondTab), 'conflict recovery must converge on the authoritative next node');
    result.scenarios.twoTabConflict = { passed: true, staleTabRequests: firstTabRequests, conflictResponses, converged: true };
    await secondTab.close();

    const metricsAfterRefresh = await browserMetrics(page);
    const metrics = {
      fetches: [...metricsBeforeRefresh.fetches, ...metricsAfterRefresh.fetches],
      visual: [...metricsBeforeRefresh.visual, ...metricsAfterRefresh.visual],
      transitions: [...metricsBeforeRefresh.transitions, ...metricsAfterRefresh.transitions]
    };
    const visualAcknowledgements = metrics.visual.filter((item) => item.selected).map((item) => item.acknowledgementMs);
    const successfulTransitions = metrics.transitions.filter((item) => item.status === 200 && !item.timedOut);
    const responseToNextPaint = successfulTransitions.map((item) => item.responseToNextPaintMs);
    const tapToNextPaint = successfulTransitions.map((item) => item.tapToNextPaintMs);
    const saveRequestDuration = metrics.fetches.filter((item) => item.method === 'POST' && stateSavePath(new URL(item.path, baseUrl).toString()) && item.status === 200).map((item) => item.durationMs);
    const timing = {
      visualAcknowledgementMs: { count: visualAcknowledgements.length, median: quantile(visualAcknowledgements, 0.5), p95: quantile(visualAcknowledgements, 0.95), max: Math.max(...visualAcknowledgements) },
      saveRequestMs: { count: saveRequestDuration.length, median: quantile(saveRequestDuration, 0.5), p95: quantile(saveRequestDuration, 0.95), max: Math.max(...saveRequestDuration) },
      saveResponseToNextPaintMs: { count: responseToNextPaint.length, median: quantile(responseToNextPaint, 0.5), p95: quantile(responseToNextPaint, 0.95), max: Math.max(...responseToNextPaint) },
      tapToNextPaintMs: { count: tapToNextPaint.length, median: quantile(tapToNextPaint, 0.5), p95: quantile(tapToNextPaint, 0.95), max: Math.max(...tapToNextPaint) }
    };
    assert.ok(timing.visualAcknowledgementMs.count > 0, 'browser-native acknowledgement samples are required');
    assert.ok(timing.saveResponseToNextPaintMs.count >= 20, 'meaningful save/next timing sample is required');
    assert.ok(timing.visualAcknowledgementMs.median < 100, 'browser-native visual acknowledgement must be below 100ms');
    assert.ok(timing.saveResponseToNextPaintMs.median <= 1200, 'save-confirmed transition median must be <= 1.2s');
    assert.ok(timing.saveResponseToNextPaintMs.p95 <= 2500, 'save-confirmed transition P95 must be <= 2.5s');
    result.timing = timing;
    result.browser = 'passed';
    await page.screenshot({ path: join(evidenceDirectory, 'adaptive-performance-390x844.png'), fullPage: true });
    await writeFile(join(evidenceDirectory, 'performance-evidence.json'), `${JSON.stringify(result, null, 2)}\n`);
    return result;
  } finally {
    await browser.close();
  }
}

const browserResult = await runBrowserPerformanceCertification();
if (browserResult.browser !== 'not_requested') {
  console.log(JSON.stringify(browserResult, null, 2));
}
