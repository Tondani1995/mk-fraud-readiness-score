/**
 * Acceptance tests for the Fraud Readiness review stalled-monitoring correction (25 November 2026).
 *
 * Disposable Postgres with the full committed migration chain replayed, then the real TypeScript notification pipeline
 * (monitorReviewStalledLeads -> sendReviewNotice -> queueAndDispatchInternalNotification ->
 * dispatchInternalAssessmentNotification) runs against the real email_events table and the real readiness_review SQL
 * functions, with a controlled clock and an injected email provider. It never connects to Supabase, Resend or Vercel.
 *
 * Run: node --experimental-strip-types --experimental-loader=./scripts/lib/ts-relative-resolve-loader.mjs \
 *        scripts/review-stalled-monitoring-tests.mjs
 */
import assert from 'node:assert/strict';
import { startReplayedDatabase, pgSupabaseAdapter } from './lib/disposable-migration-replay.mjs';

process.env.MK_INTERNAL_LEADS_EMAIL = 'admin@mkfraud.co.za';
process.env.MK_EMAIL_PROVIDER = 'live';
process.env.EMAIL_PROVIDER_MODE = 'live';
process.env.NEXT_PUBLIC_APP_URL = 'https://mkfraud.co.za';

const { monitorReviewStalledLeads, sendReviewNotice, notifyReviewCompleted, recoverStalledReviews, reviewNoticeMessage } =
  await import('../src/lib/readiness-review/review-notifications.ts');
const { parseStalledLeadControl } = await import('../src/lib/notifications/internal-assessment-notifications.ts');
const { stalledLeadMonitorReadiness } = await import('../src/lib/monitoring/stalled-lead-heartbeat.ts');

const results = [];
function check(id, condition, label) {
  assert.ok(condition, `${id}: ${label}`);
  results.push({ id, label });
  console.log(`  ok - ${id} ${label}`);
}

const env = await startReplayedDatabase({ label: 'review-stalled' });
if (!env) {
  console.log('SKIPPED: embedded-postgres/pg not installed.');
  process.exit(0);
}
const { db } = env;
let failure = null;

// ---- fixtures -------------------------------------------------------------------------------------------------------
// Fixture time is two days in the past, so SQL markers stamped with the database's real now() fall after the go-live
// boundary the test sets just before T0, exactly as they would in production.
const T0 = new Date(Math.floor((Date.now() - 2 * 86_400_000) / 3_600_000) * 3_600_000);
const minutes = (n) => n * 60_000;
const at = (base, mins) => new Date(base.getTime() + minutes(mins));
let seqBySession = new Map();

async function createReview(sessionId, label, createdAt, { fictional = false, contact = true } = {}) {
  const iso = createdAt.toISOString().replace(/\.\d{3}Z$/, '.000Z');
  await db.query(
    `insert into readiness_review.sessions (session_id, created_at_iso, created_at, organisation_label, fictional, contract_version, engine_sha256, bank_version, link_tokens, action_count, last_action_at)
     values ($1, $2, $3, $4, $5, '1.3.0', repeat('a', 64), 'test', '{}'::jsonb, 0, $3)`,
    [sessionId, iso, createdAt, label, fictional]
  );
  if (contact) {
    await db.query(`insert into readiness_review.session_contacts (session_id, full_name, email, role_title) values ($1, 'Test Respondent', 'respondent@example.com', 'CFO')`, [sessionId]);
  }
  seqBySession.set(sessionId, 0);
}
async function act(sessionId, when, type, actor, questionId) {
  const seq = seqBySession.get(sessionId);
  seqBySession.set(sessionId, seq + 1);
  const id = `${sessionId.slice(0, 8)}-${String(seq).padStart(4, '0')}`;
  const action = { id, seq, type, actor, at: when.toISOString(), ...(questionId ? { q: questionId } : {}) };
  await db.query(
    `insert into readiness_review.actions (session_id, seq, action_id, type, actor, at, question_id, action) values ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [sessionId, seq, id, type, actor, when, questionId ?? null, JSON.stringify(action)]
  );
}
const answer = (s, when, q) => act(s, when, 'respondent.answer', 'respondent', q);
const serve = (s, when, q) => act(s, when, 'respondent.serve', 'system', q);

// ---- store and dependencies bound to the replayed database ---------------------------------------------------------
function storeFor(client) {
  return {
    stalledReviews: async (cutoff) => (await client.query('select public.review_stalled_contacts($1) as r', [cutoff])).rows[0].r,
    stalledNotificationsFrom: async () => {
      const v = (await client.query('select public.review_stalled_notifications_from() as v')).rows[0].v;
      return v ? new Date(v) : null;
    },
    completionsPendingNotification: async () => (await client.query('select public.review_completions_pending_notification() as r')).rows[0].r
  };
}
const sent = [];
let providerFailuresRemaining = 0;
async function provider(message) {
  if (providerFailuresRemaining > 0) {
    providerFailuresRemaining -= 1;
    return { ok: false, mode: 'live', error: 'simulated provider outage' };
  }
  sent.push(message);
  return { ok: true, mode: 'live', providerMessageId: `msg_${sent.length}` };
}
function depsFor(client, clock) {
  return {
    db: pgSupabaseAdapter(client),
    now: () => clock.now,
    sendEmailImpl: provider,
    providerModeImpl: () => 'live',
    trackAssessmentEventImpl: async () => undefined,
    recordNotifiedImpl: async (sessionId, kind, activityAt) =>
      (await client.query('select public.review_record_contact_notified($1,$2,$3) as ok', [sessionId, kind, activityAt])).rows[0].ok,
    contactForImpl: async (sessionId) => (await client.query('select public.review_session_contact($1) as c', [sessionId])).rows[0].c
  };
}
const control = parseStalledLeadControl({ source: 'v12_forward_contract', enabled: true, inactivity_hours: 2 });
const clock = { now: T0 };
const store = storeFor(db);
const deps = depsFor(db, clock);
const run = (now) => { clock.now = now; return monitorReviewStalledLeads(control, { now, store, dependencies: deps, completionNotifier: (id) => notifyReviewCompleted(id, deps) }); };
const emailRows = async (type) => (await db.query(
  `select id, status, retry_count, sent_at, delivered_at, dedupe_key, metadata_json from public.email_events where notification_type = $1 order by created_at`, [type])).rows;
const contactRow = async (s) => (await db.query('select * from readiness_review.session_contacts where session_id = $1', [s])).rows[0];

try {
  // ---- migration and policy ----------------------------------------------------------------------------------------
  check('M1', control.inactivityMinutes === 120, 'the shared control resolves to 120 minutes for both flows');
  check('M2', parseStalledLeadControl(null).inactivityMinutes === 120, 'the code default is 120 minutes, not 24 hours');
  const job = (await db.query(`select schedule from cron.job where jobname = 'v12-stalled-lead-monitor'`)).rows[0];
  check('M3', job?.schedule === '*/15 * * * *', 'the stalled-lead job runs every 15 minutes after the migration');
  const heartbeatSeed = (await db.query(`select status from public.production_monitor_heartbeats where monitor_name = 'stalled-lead-monitor'`)).rows[0];
  check('M4', heartbeatSeed?.status === 'never_run', 'the migration seeds the stalled-lead heartbeat as never_run');
  // Disposable database only: real (non-fictional) sessions need the production bridge flag, as in production.
  await db.query(`insert into readiness_review.environment_flags (flag_key, flag_value, set_at, set_by) values ('commercial_bridge', 'production', now(), 'disposable test database') on conflict (flag_key) do update set flag_value = excluded.flag_value`);
  // The replay applies the migration "now"; for the fixture timeline move the go-live boundary to before T0.
  await db.query(`update readiness_review.environment_flags set flag_value = $1 where flag_key = 'stalled_notifications_from'`, [at(T0, -1).toISOString()]);

  // ---- 1. Started -------------------------------------------------------------------------------------------------
  const A = 'sessionAAAA0001';
  await createReview(A, 'Alpha Holdings', T0);
  const startOutcome = await sendReviewNotice(A, { kind: 'started', organisationLabel: 'Alpha Holdings', contact: { fullName: 'Test Respondent', email: 'respondent@example.com', roleTitle: 'CFO' }, answersRecorded: 0 }, deps);
  const startedRows = await emailRows('review_started');
  check('1', startOutcome.sent && startedRows.length === 1 && startedRows[0].status === 'sent' && (await contactRow(A)).started_notified_at,
    'a started review sends one started notification immediately and records it');
  const again = await sendReviewNotice(A, { kind: 'started', organisationLabel: 'Alpha Holdings', contact: { fullName: 'Test Respondent', email: 'respondent@example.com', roleTitle: 'CFO' }, answersRecorded: 0 }, deps);
  check('1b', !again.sent && (await emailRows('review_started')).length === 1 && sent.length === 1, 'repeating the start never sends a second started notification');

  // Respondent activity, plus system serve events that must not count as activity.
  await serve(A, at(T0, 0.1), 'Q1');
  await answer(A, at(T0, 1), 'Q1');
  await serve(A, at(T0, 1.1), 'Q2');
  await answer(A, at(T0, 2), 'Q2');
  const lastA = at(T0, 2);

  // ---- 2. Under 120 minutes ---------------------------------------------------------------------------------------
  await serve(A, at(lastA, 90), 'Q3'); // a later system serve must not reset or extend the inactivity window
  let r = await run(at(lastA, 119));
  check('2', r.notified === 0 && (await emailRows('review_stalled')).length === 0, 'inactivity under 120 minutes produces no stalled notification');

  // ---- 3. Reaching 120 minutes ------------------------------------------------------------------------------------
  r = await run(at(lastA, 120));
  check('3a', r.notified === 0, 'exactly 120 minutes is not yet "more than" the threshold at that instant');
  r = await run(at(lastA, 135)); // the next 15-minute check
  let stalledRows = await emailRows('review_stalled');
  check('3', r.notified === 1 && stalledRows.length === 1 && stalledRows[0].status === 'sent', 'reaching 120 minutes produces exactly one stalled notification at the next scheduled check');
  check('3c', stalledRows[0].metadata_json.last_activity_at === lastA.toISOString(), 'the episode is identified by the respondent\'s last answer, not the later system serve');
  const stalledMsg = sent[sent.length - 1];
  check('3d', /Questions answered: 2/.test(stalledMsg.text) && /at least 2 hours/.test(stalledMsg.text) && !/token|\/review\/s\//i.test(stalledMsg.text),
    'the notice reports questions answered (2), not raw actions (5), and carries no private link');
  check('3e', stalledMsg.to === 'admin@mkfraud.co.za', 'commercial notifications go to admin@mkfraud.co.za');

  // ---- 4. Repeated scheduler runs -----------------------------------------------------------------------------------
  for (const m of [150, 165, 180, 600]) await run(at(lastA, m));
  check('4', (await emailRows('review_stalled')).length === 1 && sent.filter((m) => /stalled/.test(m.subject)).length === 1, 'repeated scheduler runs produce no duplicate notification');

  // ---- 5. Resumed activity resets the window ------------------------------------------------------------------------
  const resumedAt = at(lastA, 700);
  await answer(A, resumedAt, 'Q3');
  r = await run(at(resumedAt, 60));
  check('5', r.notified === 0 && (await emailRows('review_stalled')).length === 1, 'a genuine answer resets the inactivity window (no notice 60 minutes later)');

  // ---- 6. A second inactivity episode -------------------------------------------------------------------------------
  r = await run(at(resumedAt, 135));
  stalledRows = await emailRows('review_stalled');
  check('6', r.notified === 1 && stalledRows.length === 2 && new Set(stalledRows.map((x) => x.dedupe_key)).size === 2, 'a later inactivity episode produces exactly one additional notification');
  await run(at(resumedAt, 200));
  check('6b', (await emailRows('review_stalled')).length === 2, 'the second episode is also notified only once');

  // ---- 7. Completion prevents stalled notices ------------------------------------------------------------------------
  const B = 'sessionBBBB0002';
  await createReview(B, 'Bravo Ltd', at(T0, 10));
  await answer(B, at(T0, 11), 'Q1');
  await db.query('select public.review_mark_session_completed($1)', [B]);
  const done = await notifyReviewCompleted(B, deps);
  r = await run(at(T0, 11 + 500));
  check('7', done.sent && (await emailRows('review_completed')).length === 1 && !(await emailRows('review_stalled')).some((x) => x.metadata_json.review_session_id === B),
    'a completed review sends one completion notice and never a stalled one');

  // Completion recorded but the completion email failed: still never stalled, and the notice is retried.
  const B2 = 'sessionBBBB0003';
  await createReview(B2, 'Bravo Two Ltd', at(T0, 20));
  await answer(B2, at(T0, 21), 'Q1');
  await db.query('select public.review_mark_session_completed($1)', [B2]);
  providerFailuresRemaining = 1;
  const failedCompletion = await notifyReviewCompleted(B2, deps);
  r = await run(at(T0, 21 + 500));
  const b2Completed = (await emailRows('review_completed')).filter((x) => x.metadata_json.review_session_id === B2);
  check('7b', !failedCompletion.sent && r.completionsRetried === 1 && b2Completed.length === 1 && b2Completed[0].status === 'sent' && b2Completed[0].retry_count === 2
    && !(await emailRows('review_stalled')).some((x) => x.metadata_json.review_session_id === B2),
    'a failed completion notice is retried by the monitor and the finished review is never reported as stalled');

  // ---- 8. Concurrent workers ---------------------------------------------------------------------------------------
  const C = 'sessionCCCC0004';
  await createReview(C, 'Charlie plc', at(T0, 30));
  await answer(C, at(T0, 31), 'Q1');
  const second = await env.connect();
  const clockB = { now: at(T0, 31 + 150) };
  const depsB = depsFor(second, clockB);
  const beforeC = sent.length;
  const [w1, w2] = await Promise.all([
    run(at(T0, 31 + 150)),
    monitorReviewStalledLeads(control, { now: clockB.now, store: storeFor(second), dependencies: depsB })
  ]);
  await second.end();
  const cRows = (await emailRows('review_stalled')).filter((x) => x.metadata_json.review_session_id === C);
  check('8', cRows.length === 1 && sent.length - beforeC === 1 && w1.notified + w2.notified === 1, 'two concurrent workers produce exactly one notification');

  // ---- 9. Provider failure is recoverable and observable -------------------------------------------------------------
  const D = 'sessionDDDD0005';
  await createReview(D, 'Delta Group', at(T0, 40));
  await answer(D, at(T0, 41), 'Q1');
  providerFailuresRemaining = 1;
  r = await run(at(T0, 41 + 150));
  let dRows = (await emailRows('review_stalled')).filter((x) => x.metadata_json.review_session_id === D);
  check('9a', r.failed === 1 && dRows.length === 1 && dRows[0].status === 'send_failed' && !(await contactRow(D)).stalled_notified_at,
    'a provider failure leaves a send_failed row (seen by the production monitor) and no notified marker');
  const degraded = stalledLeadMonitorReadiness({ heartbeat: { status: 'degraded', last_completed_at: at(T0, 41 + 150).toISOString(), consecutive_failures: 2 }, now: at(T0, 41 + 152), production: true });
  check('9b', degraded.status === 'FAIL', 'repeated degraded runs become a production incident (technical mailbox)');
  r = await run(at(T0, 41 + 165));
  dRows = (await emailRows('review_stalled')).filter((x) => x.metadata_json.review_session_id === D);
  check('9c', r.notified === 1 && dRows.length === 1 && dRows[0].status === 'sent' && dRows[0].retry_count === 2 && (await contactRow(D)).stalled_notified_at,
    'the next run recovers the same row and records the notice only after it was sent');
  check('9d', dRows[0].sent_at && dRows[0].delivered_at === null, 'provider acceptance (sent_at) is recorded separately from confirmed delivery (delivered_at, set by the Resend webhook)');
  const stale = stalledLeadMonitorReadiness({ heartbeat: { status: 'healthy', last_completed_at: at(T0, 0).toISOString() }, now: at(T0, 40), production: true });
  check('9e', stale.status === 'FAIL' && stale.safeCode === 'stalled_lead_monitor_stale', 'a stopped job (no heartbeat for 35 minutes) is a production incident');

  // ---- 10. Historical recovery does not resend ------------------------------------------------------------------------
  // A review notified under the old marker before the correction: the migration backfill marks its episode notified.
  const E = 'sessionEEEE0006';
  await createReview(E, 'Echo Holdings', at(T0, -3000));
  await answer(E, at(T0, -2990), 'Q1');
  await db.query(`update readiness_review.session_contacts set stalled_notified_at = $2, stalled_for_action_count = 1 where session_id = $1`, [E, at(T0, -1500)]);
  await db.query(`update readiness_review.sessions set action_count = 1 where session_id = $1`, [E]).catch(() => undefined);
  await db.query(`update readiness_review.session_contacts c set stalled_for_activity_at = (select max(a.at) from readiness_review.actions a where a.session_id = c.session_id and a.actor = 'respondent')
                  where c.session_id = $1 and c.stalled_notified_at is not null and c.stalled_for_activity_at is null`, [E]);
  // A review that stalled before the go-live boundary and was never notified: left to recovery.
  const F = 'sessionFFFF0007';
  await createReview(F, 'Foxtrot Pty', at(T0, -600));
  await answer(F, at(T0, -590), 'Q1');
  await answer(F, at(T0, -585), 'Q2');
  r = await run(at(T0, 60));
  const fRowsAuto = (await emailRows('review_stalled')).filter((x) => [E, F].includes(x.metadata_json.review_session_id));
  check('10a', fRowsAuto.length === 0 && r.deferredToRecovery >= 1, 'episodes that stalled before go-live are not sent automatically; the earlier-notified one is not even a candidate');
  const dry = await recoverStalledReviews(control, { sessionIds: [E, F, A], execute: false, now: at(T0, 60), store, dependencies: deps });
  check('10b', dry.entries.find((e) => e.sessionId === F)?.outcome === 'would_notify' && dry.entries.find((e) => e.sessionId === E)?.outcome === 'not_eligible'
    && (await emailRows('review_stalled')).filter((x) => [E, F].includes(x.metadata_json.review_session_id)).length === 0,
    'the recovery dry run lists Foxtrot as outstanding, Echo as already notified, and sends nothing');
  const exec1 = await recoverStalledReviews(control, { sessionIds: [F], execute: true, now: at(T0, 60), store, dependencies: deps });
  const exec2 = await recoverStalledReviews(control, { sessionIds: [F, E], execute: true, now: at(T0, 75), store, dependencies: deps });
  const fRows = (await emailRows('review_stalled')).filter((x) => x.metadata_json.review_session_id === F);
  check('10', exec1.entries[0].outcome === 'notified' && exec2.entries.every((e) => e.outcome === 'not_eligible') && fRows.length === 1,
    'an executed recovery sends once; repeating it sends nothing and never resends a previously delivered notice');

  // ---- 11. Synthetic sessions --------------------------------------------------------------------------------------
  const S = 'sessionSSSS0008';
  await createReview(S, 'MK synthetic monitor review-1', at(T0, 100), { fictional: true });
  await serve(S, at(T0, 100.1), 'Q1');
  r = await run(at(T0, 100 + 300));
  check('11', !(await emailRows('review_stalled')).some((x) => x.metadata_json.review_session_id === S)
    && (await db.query('select public.review_stalled_contacts($1) as r', [at(T0, 100 + 300)])).rows[0].r.every((x) => x.sessionId !== S),
    'explicitly fictional (synthetic) sessions never produce commercial notifications');

  // ---- 12. Start and completion keep working ------------------------------------------------------------------------
  const startedCount = (await emailRows('review_started')).length;
  const G = 'sessionGGGG0009';
  await createReview(G, 'Golf Trading', at(T0, 200));
  const gStart = await sendReviewNotice(G, { kind: 'started', organisationLabel: 'Golf Trading', contact: { fullName: 'Test Respondent', email: 'respondent@example.com', roleTitle: null }, answersRecorded: 0 }, deps);
  await answer(G, at(T0, 201), 'Q1');
  await db.query('select public.review_mark_session_completed($1)', [G]);
  const gDone = await notifyReviewCompleted(G, deps);
  const gContact = await contactRow(G);
  check('12', gStart.sent && gDone.sent && (await emailRows('review_started')).length === startedCount + 1 && gContact.started_notified_at && gContact.completed_notified_at && gContact.completed_at,
    'start and completion notifications continue to send once each and are recorded');

  // ---- content safety ----------------------------------------------------------------------------------------------
  const preview = reviewNoticeMessage({ kind: 'stalled', organisationLabel: 'X', contact: { fullName: 'N', email: 'e@x.co', roleTitle: null }, answersRecorded: 3, lastActivityAt: T0.toISOString(), inactiveMinutes: 120, consoleUrl: 'https://mkfraud.co.za/score/admin/reviews/abc' });
  check('C1', /score\/admin\/reviews/.test(preview.html) && !/\/review\/s\//.test(preview.html), 'notices link to the admin console only, never to the respondent\'s private review link');
  const allMetadata = (await db.query(`select metadata_json from public.email_events where notification_type like 'review_%'`)).rows.map((x) => JSON.stringify(x.metadata_json)).join(' ');
  check('C2', !/respondent@example\.com|Test Respondent|Q1|Q2/.test(allMetadata), 'email_events metadata holds no respondent contact details or answers');

  // ---- first-party conversion attribution (only exact commissioned campaign IDs) --------------------------------
  const recordCampaign = async (session, content) => (await db.query('select public.review_record_campaign_attribution($1,$2) as ok', [session,content])).rows[0].ok;
  check('A1', await recordCampaign(G, 'fr0001'), 'real completed session accepts the exact campaign ID');
  check('A2', !(await recordCampaign(G, 'fr0002')) && (await contactRow(G)).acquisition_campaign_content === 'fr0001', 'first attribution is immutable');
  check('A3', !(await recordCampaign(S, 'fr2400')) && !(await recordCampaign(B2, 'fr2401')) && !(await recordCampaign(B2, 'private@example.com')), 'fictional, invalid and private values are rejected');
  check('A4', await recordCampaign(B, 'fr2400') && Boolean((await contactRow(B)).completed_at), 'campaign identity can be measured against durable respondent completion');
  const grants = (await db.query("select has_function_privilege('anon','public.review_record_campaign_attribution(text,text)','EXECUTE') as anon, has_function_privilege('authenticated','public.review_record_campaign_attribution(text,text)','EXECUTE') as auth, has_function_privilege('service_role','public.review_record_campaign_attribution(text,text)','EXECUTE') as service")).rows[0];
  check('A5', !grants.anon && !grants.auth && grants.service, 'campaign writes are service-role only');

  console.log(JSON.stringify({ status: 'PASS', checks: results.length, migrationsReplayed: env.migrationCount, providerSends: sent.length }, null, 2));
} catch (error) {
  failure = error;
} finally {
  await env.stop();
}
if (failure) {
  console.error('Review stalled-monitoring tests FAILED');
  console.error(failure);
  process.exit(1);
}
console.log('Review stalled-monitoring tests: PASS');
