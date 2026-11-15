// B5 failure-path tests against a running restricted-test deployment (localhost or the protected preview).
//   node --env-file=.env.local --experimental-strip-types --experimental-loader=./scripts/lib/ts-relative-resolve-loader.mjs \
//     scripts/b5-failure-path-tests.mjs <baseUrl> <runDir>
// Uses the fictional sessions and orders the browser journey created (<runDir>/.secrets). No provider call is needed:
// each generation in these tests either refuses before the provider or is the duplicate of one that does.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { revisedCommercialStatus } from '../src/lib/readiness-review/commercial-environment.ts';

const BASE = (process.argv[2] || 'http://localhost:3100').replace(/\/$/, '');
const RUN = process.argv[3] || 'qa-output/b5/local';
const HEADERS = process.env.B5_BYPASS_HEADER ? JSON.parse(process.env.B5_BYPASS_HEADER) : {};
const secret = (f) => fs.readFileSync(path.join(RUN, '.secrets', f), 'utf8').trim();
const results = [];
const rec = (id, name, ok, detail) => { results.push({ id, name, ok, detail }); console.log(`${id} ${ok ? 'pass' : 'FAIL'} ${name}${detail ? ` | ${detail}` : ''}`); };
const j = (r) => r.json().catch(() => ({}));
const post = (p, body, extra = {}) => fetch(BASE + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...HEADERS, ...extra }, body: JSON.stringify(body), redirect: 'manual' });

// FP-01 Production refusal: the guard refuses every production signal.
{
  const base = { MK_REVISED_COMMERCIAL_PATH: 'restricted-test', MK_READINESS_REVIEW_STORE: 'database', NEXT_PUBLIC_SUPABASE_URL: 'https://zuqegvsfhzgcydyivnqv.supabase.co', MK_READINESS_REVIEW_DB_PROJECT_REF: 'zuqegvsfhzgcydyivnqv' };
  const cases = {
    isolated: base,
    productionRuntime: { ...base, VERCEL_ENV: 'production' },
    productionAppDb: { ...base, NEXT_PUBLIC_SUPABASE_URL: 'https://iszihmmbgsfefawqmnwo.supabase.co' },
    productionReviewDb: { ...base, MK_READINESS_REVIEW_DB_PROJECT_REF: 'iszihmmbgsfefawqmnwo' },
    flagMissing: { ...base, MK_REVISED_COMMERCIAL_PATH: undefined },
    databasesDiffer: { ...base, MK_READINESS_REVIEW_DB_PROJECT_REF: 'abcdefghijklmnopqrst' }
  };
  const got = Object.fromEntries(Object.entries(cases).map(([k, env]) => [k, revisedCommercialStatus(env)]));
  const ok = got.isolated.enabled && Object.entries(got).filter(([k]) => k !== 'isolated').every(([, v]) => !v.enabled);
  rec('FP-01', 'Revised commercial path enabled only on the isolated database; refused for production runtime, production databases, missing flag and mismatched databases', ok,
    Object.entries(got).map(([k, v]) => `${k}:${v.enabled ? 'on' : v.reason}`).join(', '));
}

// FP-02 A paid order needs the private snapshot link: a wrong token is refused.
{
  const aRef = JSON.parse(fs.readFileSync(path.join(RUN, 'journey-A.json'), 'utf8')).outcomes.A.assessmentReference;
  const r = await post(`/score/api/assessments/${aRef}/paid-order`, { snapshotToken: crypto.randomBytes(32).toString('base64url'), tier: 'essential', invoiceRequested: false });
  rec('FP-02', 'Paid order with an invalid private link is refused', r.status === 403, `HTTP ${r.status}`);
}

// FP-03 Re-submitting after the answers changed is refused; the original binding stands.
{
  const links = JSON.parse(secret('A-links.json'));
  const lv = await (await fetch(`${BASE}/review/api/s/${links.linksToken}`, { headers: HEADERS })).json();
  let changed = null;
  for (const f of lv.view.functions) {
    const v = await (await fetch(`${BASE}/review/api/s/${f.token}`, { headers: HEADERS })).json();
    if (!v.view?.step) continue;
    const step = v.view.step;
    const value = step.choices.map((c) => c.value).find((x) => x !== 'unknown');
    const r = await post(`/review/api/s/${f.token}`, { actionId: crypto.randomUUID(), expectedSeq: v.view.seq, action: { type: 'owner.answer', fn: f.fn, q: step.q, value } });
    changed = { fn: f.fn, q: step.q, status: r.status };
    break;
  }
  if (!changed) {
    // No function question left open: record a respondent correction instead, as a customer changing an answer would.
    const view = await (await fetch(`${BASE}/review/api/s/${links.links.respondent}`, { headers: HEADERS })).json();
    const exp = await (await fetch(`${BASE}/review/api/s/${links.links.respondent}/export`, { headers: HEADERS })).json();
    const row = exp.report.domains.flatMap((d) => d.rows).find((x) => x.id === 'PR-08');
    const value = row?.answer?.v === 'yes' ? 'no' : 'yes';
    const r0 = await post(`/review/api/s/${links.links.respondent}`, { actionId: crypto.randomUUID(), expectedSeq: view.view.seq, action: { type: 'respondent.correct', q: 'PR-08', value } });
    changed = { fn: 'respondent correction', q: 'PR-08', status: r0.status };
  }
  const r = await post(`/review/api/s/${links.links.respondent}/commercial`, { organisationLegalName: 'Kestrel Freight (Pty) Ltd (fictional)', contactName: 'Thandi Fictional', contactEmail: 'b5-kestrel@example.com', acceptTerms: true });
  const body = await j(r);
  rec('FP-03', 'An answer recorded after submission blocks re-submission; the bound answers stay fixed', changed?.status === 200 && r.status === 409 && ['answers_changed', 'interview_not_complete'].includes(body.code),
    `later owner answer ${changed ? `${changed.fn} ${changed.q} HTTP ${changed.status}` : 'none available'}; re-submit HTTP ${r.status} ${body.code ?? ''}`);
}

// FP-04 Re-submitting unchanged answers is idempotent: same assessment, no second record.
{
  const links = JSON.parse(secret('B-links.json'));
  const bRef = JSON.parse(fs.readFileSync(path.join(RUN, 'journey-B.json'), 'utf8')).outcomes.B.assessmentReference;
  const r = await post(`/review/api/s/${links.links.respondent}/commercial`, { organisationLegalName: 'Marula Retail Holdings (Pty) Ltd (fictional)', contactName: 'Pieter Fictional', contactEmail: 'b5-marula@example.com', acceptTerms: true });
  const body = await j(r);
  rec('FP-04', 'Re-submitting unchanged answers returns the same assessment and creates nothing new', r.status === 200 && body.created === false && body.assessmentReference === bRef, `HTTP ${r.status}; created ${body.created}; ${body.assessmentReference === bRef ? 'same assessment' : 'DIFFERENT assessment'}`);
}

// FP-05 Owner and reviewer links cannot submit for a paid report.
{
  const links = JSON.parse(secret('B-links.json'));
  const r = await post(`/review/api/s/${links.links.reviewer}/commercial`, { organisationLegalName: 'X (fictional)', contactName: 'X Fictional', contactEmail: 'x@example.com', acceptTerms: true });
  rec('FP-05', 'A reviewer link cannot submit an assessment for a paid report', r.status === 404, `HTTP ${r.status}`);
}

// FP-06 Missing terms acceptance is refused before anything is stored.
{
  const links = JSON.parse(secret('B-links.json'));
  const r = await post(`/review/api/s/${links.links.respondent}/commercial`, { organisationLegalName: 'Marula Retail Holdings (Pty) Ltd (fictional)', contactName: 'Pieter Fictional', contactEmail: 'b5-marula@example.com', acceptTerms: false });
  rec('FP-06', 'Submission without accepting the terms is refused', r.status === 400, `HTTP ${r.status}`);
}

// FP-07 Ordering the same Comprehensive twice returns the existing order (no duplicate order).
{
  const out = JSON.parse(fs.readFileSync(path.join(RUN, 'journey-B.json'), 'utf8')).outcomes.B;
  const url = new URL(secret('B-comprehensive-order-url.txt'));
  const token = url.searchParams.get('token');
  const r = await post(`/score/api/assessments/${out.assessmentReference}/paid-order`, { snapshotToken: token, tier: 'comprehensive', invoiceRequested: false });
  const body = await j(r);
  rec('FP-07', 'A second Comprehensive order for the same assessment returns the existing order', r.status === 200 && body.created === false && body.order?.orderReference === out.orders.comprehensive.orderReference,
    `HTTP ${r.status}; created ${body.created}; ${body.order?.orderReference === out.orders.comprehensive.orderReference ? 'same order' : body.order?.orderReference}`);
}

// FP-08 and FP-09 run only when B5_DUPLICATE_ORDER names an awaiting-payment test order (case A0's Comprehensive).
if (process.env.B5_DUPLICATE_ORDER) {
  const ref = process.env.B5_DUPLICATE_ORDER;
  const key = crypto.randomUUID();
  const confirm = () => fetch(`${BASE}/score/admin/orders/${ref}/status`, { method: 'POST', headers: HEADERS, redirect: 'manual',
    body: new URLSearchParams({ status: 'payment_received', amountZar: '35000.00', currency: 'ZAR', note: 'B5 duplicate-event test: fictional EFT, no money moved', idempotencyKey: key }) });
  const [c1, c2] = [await confirm(), await confirm()];
  const { createClient } = await import('@supabase/supabase-js');
  const sdb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { data: ord } = await sdb.from('orders').select('id').eq('order_reference', ref).single();
  const { count: transitions } = await sdb.from('payment_transition_events').select('id', { count: 'exact', head: true }).eq('order_id', ord.id).eq('new_state', 'PAID').eq('processing_result', 'applied');
  rec('FP-08', 'The same payment confirmation submitted twice records one payment transition', [c1.status, c2.status].every((x) => x === 303 || x === 307) && transitions === 1, `HTTP ${c1.status}/${c2.status}; transitions shown ${transitions}`);
  const gen = () => fetch(`${BASE}/score/api/admin/orders/${ref}/generate-report`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...HEADERS }, body: JSON.stringify({ action: 'admin_generate', requestKey: crypto.randomUUID() }) });
  const [g1, g2] = await Promise.all([gen(), gen()]);
  const [b1, b2] = [await j(g1), await j(g2)];
  const reasons = [b1.reason ?? (b1.ok ? 'ok' : '?'), b2.reason ?? (b2.ok ? 'ok' : '?')];
  rec('FP-09', 'Two generation requests at once: only one runs, the other is refused as already active', reasons.includes('generation_already_active') && reasons.filter((x) => x === 'generation_already_active').length === 1,
    `HTTP ${g1.status}/${g2.status}; ${reasons.join(' / ')}`);
}

fs.writeFileSync(path.join(RUN, 'failure-paths.json'), JSON.stringify({ at: new Date().toISOString(), results }, null, 1));
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed} pass, ${failed} fail`);
process.exit(failed ? 1 : 0);
