// The generation ledger migration against a real, throwaway local PostgreSQL (never a hosted database): reservation
// before dispatch, lifetime order ceiling, campaign call and cost ceilings with worst-case charging, concurrency at the
// boundary, append-only guards, idempotent checkpoints and service-role-only grants.
//   LOCAL_PG_URL=postgres://postgres@127.0.0.1:55432/postgres node scripts/revised-reports/generation-ledger-sql-tests.mjs
import fs from 'node:fs';
import crypto from 'node:crypto';
import pg from 'pg';

const admin = process.env.LOCAL_PG_URL;
if (!admin || !/@(127\.0\.0\.1|localhost)[:/]/.test(admin)) { console.error('LOCAL_PG_URL must point at a local PostgreSQL'); process.exit(2); }
const dbName = `mk_ledger_${Date.now()}`;
const root = new pg.Client({ connectionString: admin }); await root.connect();
await root.query(`create database ${dbName}`);
const url = admin.replace(/\/[^/]*$/, `/${dbName}`);
const c = new pg.Client({ connectionString: url }); await c.connect();
for (const r of ['anon', 'authenticated', 'service_role']) await c.query(`do $$ begin if not exists (select 1 from pg_roles where rolname = '${r}') then create role ${r} nologin; end if; end $$`);
await c.query(fs.readFileSync('supabase/migrations/20261111100000_readiness_review_store.sql', 'utf8'));
await c.query(fs.readFileSync('supabase/migrations/20261113150000_readiness_review_generation_ledger.sql', 'utf8'));

const results = [];
const T = async (id, name, fn) => { try { const [ok, detail] = await fn(); results.push({ id, ok, name, detail }); } catch (e) { results.push({ id, ok: false, name, detail: String(e.message).slice(0, 300) }); } };
const D = 'a'.repeat(64);
const reserve = async (p, client = c) => (await client.query('select public.review_reserve_generation_call($1) r', [{ inputDigest: D, attemptId: 'att-1', stage: 'writer', model: 'openai/gpt-5-mini', maxOutputTokens: 48000, ...p }])).rows[0].r;
const settle = async (p) => (await c.query('select public.review_settle_generation_call($1) r', [p])).rows[0].r;
const budget = (campaign, calls, cost) => c.query(`insert into readiness_review.generation_budgets (campaign, max_calls, max_cost_usd, approved_by) values ($1,$2,$3,'test')`, [campaign, calls, cost]);
const count = async (where = 'true') => Number((await c.query(`select count(*) n from readiness_review.generation_calls where ${where}`)).rows[0].n);

await T('GL-01', 'No approved campaign, no paid call: nothing is reserved', async () => {
  const a = await reserve({ campaign: null, orderReference: 'ORD-A', reservedCostUsd: 0.1 });
  const b = await reserve({ campaign: 'not-approved', orderReference: 'ORD-A', reservedCostUsd: 0.1 });
  return [!a.allowed && a.reason === 'campaign_budget_missing' && !b.allowed && b.reason === 'campaign_budget_missing' && (await count()) === 0, `${a.reason}; ${b.reason}`];
});
await T('GL-02', 'The order ceiling is lifetime (every attempt and report version) and clamped to the approved bound of 6', async () => {
  await budget('order-test', 50, 25);
  const got = [];
  for (let i = 0; i < 8; i++) got.push(await reserve({ campaign: 'order-test', orderReference: 'ORD-B', attemptId: `att-${i}`, reservedCostUsd: 0.01, orderCeiling: 10 }));
  const allowed = got.filter((x) => x.allowed).length;
  const lower = [];
  for (let i = 0; i < 3; i++) lower.push(await reserve({ campaign: 'order-test', orderReference: 'ORD-C', reservedCostUsd: 0.01, orderCeiling: 2 }));
  return [allowed === 6 && got[6].reason === 'order_ceiling_reached' && got[6].orderCeiling === 6 && lower.filter((x) => x.allowed).length === 2, `ORD-B allowed ${allowed} of 8 with ceiling 10 requested; ORD-C allowed ${lower.filter((x) => x.allowed).length} of 3 with ceiling 2`];
});
await T('GL-03', 'Campaign calls and cost: worst case charged until settled; a known lower cost frees headroom; an indeterminate call stays at worst case', async () => {
  await budget('cost-test', 10, 1.0);
  const a = await reserve({ campaign: 'cost-test', orderReference: 'ORD-D', reservedCostUsd: 0.6 });
  const b = await reserve({ campaign: 'cost-test', orderReference: 'ORD-E', reservedCostUsd: 0.6 });
  const s = await settle({ callId: a.callId, status: 'succeeded', costUsd: 0.05, usage: { inputTokens: 1, outputTokens: 2 } });
  const c2 = await reserve({ campaign: 'cost-test', orderReference: 'ORD-E', reservedCostUsd: 0.6 });
  await settle({ callId: c2.callId, status: 'indeterminate', usage: null });
  const d = await reserve({ campaign: 'cost-test', orderReference: 'ORD-F', reservedCostUsd: 0.4 });
  const e = await reserve({ campaign: 'cost-test', orderReference: 'ORD-F', reservedCostUsd: 0.0 });
  const ok = a.allowed && !b.allowed && b.reason === 'campaign_cost_exhausted' && s.settled && c2.allowed && !d.allowed && d.reason === 'campaign_cost_exhausted' && !e.allowed && e.reason === 'cost_not_bounded';
  return [ok, `0.6 allowed; second 0.6 refused (${b.reason}); after settling at 0.05 a 0.6 fits; indeterminate keeps 0.6 so 0.4 is refused (${d.reason}); zero cost refused (${e.reason})`];
});
await T('GL-04', 'Campaign call count is enforced', async () => {
  await budget('calls-test', 2, 5);
  const r = [];
  for (let i = 0; i < 3; i++) r.push(await reserve({ campaign: 'calls-test', orderReference: `ORD-G${i}`, reservedCostUsd: 0.01 }));
  return [r.filter((x) => x.allowed).length === 2 && r[2].reason === 'campaign_calls_exhausted', r.map((x) => x.allowed ? 'allowed' : x.reason).join(', ')];
});
await T('GL-05', 'Concurrent reservations for the last unit of an order: exactly one succeeds', async () => {
  await budget('race-test', 50, 25);
  for (let i = 0; i < 5; i++) await reserve({ campaign: 'race-test', orderReference: 'ORD-H', reservedCostUsd: 0.01 });
  const clients = await Promise.all(Array.from({ length: 6 }, async () => { const x = new pg.Client({ connectionString: url }); await x.connect(); return x; }));
  const out = await Promise.all(clients.map((x) => reserve({ campaign: 'race-test', orderReference: 'ORD-H', reservedCostUsd: 0.01 }, x)));
  await Promise.all(clients.map((x) => x.end()));
  return [out.filter((x) => x.allowed).length === 1 && (await count(`order_reference = 'ORD-H'`)) === 6, `${out.filter((x) => x.allowed).length} of 6 concurrent requests allowed; ORD-H holds ${await count(`order_reference = 'ORD-H'`)}`];
});
await T('GL-06', 'Append-only: a settled call cannot change, reservation fields cannot change, nothing can be deleted; budgets and checkpoints are immutable', async () => {
  const errs = [];
  const tryq = async (sql) => { try { await c.query(sql); errs.push(`ALLOWED: ${sql.slice(0, 60)}`); } catch { /* refused */ } };
  const id = (await c.query(`select call_id from readiness_review.generation_calls where status = 'succeeded' limit 1`)).rows[0].call_id;
  const res = (await c.query(`select call_id from readiness_review.generation_calls where status = 'reserved' limit 1`)).rows[0].call_id;
  await tryq(`update readiness_review.generation_calls set status = 'failed', settled_at = now() where call_id = '${id}'`);
  await tryq(`update readiness_review.generation_calls set reserved_cost_usd = 0.0001 where call_id = '${res}'`);
  await tryq(`delete from readiness_review.generation_calls where call_id = '${res}'`);
  await tryq(`update readiness_review.generation_budgets set max_calls = 49 where campaign = 'race-test'`);
  await tryq(`delete from readiness_review.generation_budgets where campaign = 'race-test'`);
  const again = await settle({ callId: id, status: 'failed', costUsd: 0 });
  return [!errs.length && again.settled === false, errs.join('; ') || 'every change refused; a second settlement is a no-op'];
});
await T('GL-07', 'Checkpoints are idempotent per attempt and stage; a different payload is detected; unlinked audits are listed until linked', async () => {
  const cp = (stage, extra = {}) => ({ orderReference: 'ORD-K', inputDigest: D, attemptId: 'att-k', stage, factPackDigest: 'b'.repeat(64), manuscript: 'text', auditPackage: { a: 1 }, payloadDigest: 'c'.repeat(64), ...extra });
  const rec = async (p) => (await c.query('select public.review_record_generation_checkpoint($1) r', [p])).rows[0].r;
  const first = await rec(cp('validated'));
  const dup = await rec(cp('validated'));
  const diff = await rec(cp('validated', { payloadDigest: 'd'.repeat(64) }));
  const unlinked = (await c.query(`select public.review_unlinked_generation_audits('ORD-K') r`)).rows[0].r;
  await rec(cp('linked', { manuscript: null, auditPackage: null, reportId: crypto.randomUUID(), payloadDigest: 'e'.repeat(64) }));
  const after = (await c.query(`select public.review_unlinked_generation_audits('ORD-K') r`)).rows[0].r;
  let badLinked = false; try { await rec(cp('linked', { attemptId: 'att-z', reportId: '' })); } catch { badLinked = true; }
  let updateRefused = false; try { await c.query(`update readiness_review.generation_checkpoints set manuscript = 'x'`); } catch { updateRefused = true; }
  return [!first.duplicate && dup.duplicate && dup.matches && diff.duplicate && !diff.matches && unlinked.length === 1 && after.length === 0 && badLinked && updateRefused,
    `first ${first.duplicate ? 'dup' : 'new'}; repeat matches ${dup.matches}; different payload matches ${diff.matches}; unlinked ${unlinked.length} then ${after.length}`];
});
await T('GL-08', 'Only the service role can execute the functions or touch the tables', async () => {
  const q = await c.query(`select r.rolname, has_function_privilege(r.rolname, 'public.review_reserve_generation_call(jsonb)', 'execute') f, has_table_privilege(r.rolname, 'readiness_review.generation_calls', 'select') t from pg_roles r where r.rolname in ('anon','authenticated','service_role')`);
  const m = Object.fromEntries(q.rows.map((r) => [r.rolname, r]));
  return [!m.anon.f && !m.authenticated.f && m.service_role.f && !m.anon.t && !m.authenticated.t, JSON.stringify(q.rows)];
});

await c.end();
await root.query(`drop database ${dbName}`); await root.end();
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.id} ${r.name}\n     ${r.detail}`);
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} of ${results.length} passed`);
fs.mkdirSync('qa-output/corrective', { recursive: true });
fs.writeFileSync('qa-output/corrective/generation-ledger-sql.json', JSON.stringify(results, null, 2));
process.exit(failed.length ? 1 : 0);
