// The session contacts migration against a real, throwaway local PostgreSQL (never a hosted database): contact recorded
// once, validated by the table, removed with the session; notifications claimed once, released on failure, stalled
// re-armed by new activity; the stalled list excludes fictional, finished and ordered reviews; service role only.
//   LOCAL_PG_URL=postgres://postgres@127.0.0.1:55432/postgres node scripts/revised-reports/session-contacts-sql-tests.mjs
import fs from 'node:fs';
import pg from 'pg';

const admin = process.env.LOCAL_PG_URL;
if (!admin || !/@(127\.0\.0\.1|localhost)[:/]/.test(admin)) { console.error('LOCAL_PG_URL must point at a local PostgreSQL'); process.exit(2); }
const dbName = `mk_contacts_${Date.now()}`;
const root = new pg.Client({ connectionString: admin }); await root.connect();
await root.query(`create database ${dbName}`);
const c = new pg.Client({ connectionString: admin.replace(/\/[^/]*$/, `/${dbName}`) }); await c.connect();
for (const r of ['anon', 'authenticated', 'service_role']) await c.query(`do $$ begin if not exists (select 1 from pg_roles where rolname = '${r}') then create role ${r} nologin; end if; end $$`);
await c.query(fs.readFileSync('supabase/migrations/20261111100000_readiness_review_store.sql', 'utf8'));
// The bridge migration needs the commercial schema; only its bindings table matters here.
// Production accepts real sessions (20261115110000, under the production switch); only the dropped check matters here.
await c.query(`alter table readiness_review.sessions drop constraint sessions_fictional_check`);
await c.query(`create table readiness_review.commercial_bindings (session_id text primary key references readiness_review.sessions (session_id))`);
await c.query(fs.readFileSync('supabase/migrations/20261115150000_readiness_review_session_contacts.sql', 'utf8'));

const results = [];
const T = async (id, name, fn) => { try { const [ok, detail] = await fn(); results.push({ id, ok, name, detail }); } catch (e) { results.push({ id, ok: false, name, detail: String(e.message).slice(0, 300) }); } };
const session = async (id, { fictional = false, last = '2026-11-14T08:00:00Z', count = 5 } = {}) => {
  await c.query(`insert into readiness_review.sessions (session_id, created_at_iso, created_at, organisation_label, fictional, contract_version, engine_sha256, bank_version, link_tokens, action_count, last_action_at)
    values ($1, '2026-11-14T07:00:00Z', '2026-11-14T07:00:00Z', $2, $3, '1.3.0', $4, '1.3', '{}'::jsonb, $5, $6)`, [id, `Org ${id}`, fictional, 'a'.repeat(64), count, last]);
};
const one = async (sql, args) => (await c.query(sql, args)).rows[0];
const contact = (sessionId, extra = {}) => ({ sessionId, fullName: 'Thandi Example', email: 'Thandi@Example.CO.ZA', roleTitle: 'CFO', ...extra });

await T('SC-01', 'A contact is recorded once, email lower-cased; a second record is ignored', async () => {
  await session('sess-aaaa1');
  const a = (await one('select public.review_record_session_contact($1) r', [contact('sess-aaaa1')])).r;
  const b = (await one('select public.review_record_session_contact($1) r', [contact('sess-aaaa1', { fullName: 'Someone Else' })])).r;
  const got = (await one(`select public.review_session_contact('sess-aaaa1') r`)).r;
  return [a === true && b === false && got.fullName === 'Thandi Example' && got.email === 'thandi@example.co.za' && got.roleTitle === 'CFO' && got.bound === false, JSON.stringify({ a, b, email: got.email })];
});
await T('SC-02', 'The table refuses a malformed email and an empty name', async () => {
  await session('sess-aaaa2');
  let badEmail = false, emptyName = false;
  try { await c.query('select public.review_record_session_contact($1)', [contact('sess-aaaa2', { email: 'not-an-email' })]); } catch { badEmail = true; }
  try { await c.query('select public.review_record_session_contact($1)', [contact('sess-aaaa2', { fullName: '' })]); } catch { emptyName = true; }
  return [badEmail && emptyName, `bad email refused ${badEmail}; empty name refused ${emptyName}`];
});
await T('SC-03', 'Started and completed are claimed once; a released claim can be claimed again', async () => {
  const s1 = (await one(`select public.review_claim_contact_notification('sess-aaaa1','started') r`)).r;
  const s2 = (await one(`select public.review_claim_contact_notification('sess-aaaa1','started') r`)).r;
  await c.query(`select public.review_release_contact_notification('sess-aaaa1','started')`);
  const s3 = (await one(`select public.review_claim_contact_notification('sess-aaaa1','started') r`)).r;
  const d1 = (await one(`select public.review_claim_contact_notification('sess-aaaa1','completed') r`)).r;
  const d2 = (await one(`select public.review_claim_contact_notification('sess-aaaa1','completed') r`)).r;
  return [s1 && !s2 && s3 && d1 && !d2, JSON.stringify({ s1, s2, s3, d1, d2 })];
});
await T('SC-04', 'Stalled: listed when inactive past the cutoff; not for fictional, finished or ordered reviews; re-armed by new activity', async () => {
  await session('sess-stall1', { count: 7 });
  await c.query('select public.review_record_session_contact($1)', [contact('sess-stall1')]);
  await session('sess-fict01', { fictional: true });
  await c.query('select public.review_record_session_contact($1)', [contact('sess-fict01')]);
  await session('sess-bound1');
  await c.query('select public.review_record_session_contact($1)', [contact('sess-bound1')]);
  await c.query(`insert into readiness_review.commercial_bindings values ('sess-bound1')`);
  await session('sess-fresh1', { last: new Date().toISOString() });
  await c.query('select public.review_record_session_contact($1)', [contact('sess-fresh1')]);
  const cutoff = new Date(Date.now() - 3_600_000).toISOString();
  const listed = (await one('select public.review_stalled_contacts($1) r', [cutoff])).r.map((x) => x.sessionId).sort();
  // sess-aaaa1 is finished (completed claimed in SC-03); sess-aaaa2 has no contact.
  const claimed = (await one(`select public.review_claim_contact_notification('sess-stall1','stalled',7) r`)).r;
  const again = (await one('select public.review_stalled_contacts($1) r', [cutoff])).r.map((x) => x.sessionId);
  await c.query(`update readiness_review.sessions set action_count = 9 where session_id = 'sess-stall1'`);
  const rearmed = (await one('select public.review_stalled_contacts($1) r', [cutoff])).r.map((x) => x.sessionId);
  return [JSON.stringify(listed) === '["sess-stall1"]' && claimed && again.length === 0 && JSON.stringify(rearmed) === '["sess-stall1"]', `listed ${listed}; after claim ${again.length}; after new answers ${rearmed}`];
});
await T('SC-05', 'Purging a session removes its contact', async () => {
  await c.query(`select public.review_purge_session('sess-aaaa2')`);
  await c.query(`select public.review_purge_session('sess-stall1')`);
  const n = Number((await one(`select count(*) n from readiness_review.session_contacts where session_id = 'sess-stall1'`)).n);
  return [n === 0, `${n} left`];
});
await T('SC-06', 'Only the service role can execute the functions or read the table', async () => {
  const fns = ['review_record_session_contact(jsonb)', 'review_session_contact(text)', 'review_claim_contact_notification(text,text,integer)', 'review_release_contact_notification(text,text)', 'review_stalled_contacts(timestamptz)'];
  const rows = [];
  for (const f of fns) for (const r of ['anon', 'authenticated', 'service_role']) rows.push([f, r, (await one(`select has_function_privilege($1, 'public.${f}', 'execute') p`, [r])).p]);
  const table = (await one(`select has_table_privilege('anon', 'readiness_review.session_contacts', 'select') a, has_table_privilege('service_role', 'readiness_review.session_contacts', 'select') s`));
  const ok = rows.every(([, r, p]) => (r === 'service_role') === p) && !table.a && !table.s;
  return [ok, ok ? 'service role only; table not directly readable' : JSON.stringify(rows.filter(([, r, p]) => (r === 'service_role') !== p))];
});

await c.end();
await root.query(`drop database ${dbName}`); await root.end();
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.id} ${r.name}\n     ${r.detail}`);
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} of ${results.length} passed`);
process.exit(failed.length ? 1 : 0);
