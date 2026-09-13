import assert from 'node:assert/strict';
import { monitorFetch, monitorDatabaseError, monitorSelfHealth } from '../src/lib/monitoring/database.ts';
import { runProductionMonitor, sendMonitoringEmail, upsertHeartbeat } from '../src/lib/monitoring/production-monitor.ts';
import { monitorHeartbeatReadiness } from '../src/lib/monitoring/production-readiness.ts';
import { monitorAdaptiveStalledLeads } from '../src/lib/notifications/internal-assessment-notifications.ts';

// Hard stop for accidental provider or database access: all tests use in-memory doubles.
globalThis.fetch = async () => { throw new Error('External calls forbidden in reliability tests'); };
process.env.MK_INTERNAL_NOTIFICATIONS_EMAIL = 'info@mkfraud.co.za';
process.env.VERCEL_GIT_COMMIT_SHA = 'a'.repeat(40);
let time = new Date('2026-09-12T12:00:00Z');
const now = () => time;
const advance = () => { time = new Date(time.getTime() + 15 * 60000); };
const sent = [];
const sendEmail = async payload => { assert.equal(payload.audience, 'internal'); assert.equal(payload.to,'info@mkfraud.co.za'); sent.push(structuredClone(payload)); return {ok:true,mode:'live',providerMessageId:`id-${sent.length}`}; };
const pass = s => console.log(`ok - ${s}`);

let attempts = 0;
let f = monitorFetch(async () => { attempts++; return new Response('{}', {status: attempts===1 ? 504 : 200}); }, async () => {});
assert.equal((await f('https://db.test/rest/v1/production_monitor_heartbeats',{method:'POST',body:'{}'})).status,200);
assert.equal(attempts,2);
attempts=0;
f = monitorFetch(async () => { attempts++; return new Response('{}',{status:504}); },async()=>{});
assert.equal((await f('https://db.test/rest/v1/production_monitor_heartbeats',{method:'POST'})).status,504); assert.equal(attempts,2);
attempts=0;
await f('https://db.test/rest/v1/rpc/record_production_monitor_alert',{method:'POST'}); assert.equal(attempts,1);
await f('https://api.resend.com/emails',{method:'POST'}); assert.equal(attempts,2);
pass('gateway retry recovers once, is bounded, and excludes counter and provider writes');
assert.deepEqual(monitorDatabaseError({message:'Gateway Timeout',details:'customer@example.com',code:''}),{code:null,reason:'gateway_timeout'});
assert.equal(JSON.stringify(monitorDatabaseError({message:'customer@example.com token secret',code:'42501'})).includes('customer'),false);
pass('plain-object errors have useful PII-safe classification');

function dbDouble() {
 const rows = new Map(); const faults = new Map();
 rows.set('production_monitor_heartbeats',[{monitor_name:'production-incident-monitor',run_count:1,consecutive_failures:0,safe_summary_json:{}}]);
 rows.set('phase14_operational_alerts',[]); rows.set('production_monitor_notifications',[]);
 let markerFailures=0;
 return {rows,faults,set markerFailures(n){markerFailures=n;},
 from(table){
  let op='read', payload, opts={}, single=false; const filters=[];
  const q={select(){return q;},eq(k,v){filters.push(r=>r[k]===v);return q;},in(k,v){filters.push(r=>v.includes(r[k]));return q;},gte(){return q;},not(){return q;},or(){return q;},limit(){return q;},maybeSingle(){single=true;return q;},single(){single=true;return q;},upsert(p,o){op='upsert';payload=p;opts=o;return q;},insert(p){op='insert';payload=p;return q;},update(p){op='update';payload=p;return q;},then(resolve,reject){return Promise.resolve().then(()=>{
   const fault=faults.get(`${table}:${op}`); if(fault){ if(typeof fault==='number'){faults.set(`${table}:${op}`,fault-1);} return {data:null,error:{message:'Gateway Timeout'}}; }
   let data=rows.get(table)??[]; rows.set(table,data);
   if(op==='upsert'){const key=opts.onConflict; const old=data.find(r=>r[key]===payload[key]); if(old){if(!opts.ignoreDuplicates)Object.assign(old,payload);}else data.push({...structuredClone(payload),created_at:now().toISOString()});}
   if(op==='insert')data.push(structuredClone(payload));
   const found=data.filter(r=>filters.every(fn=>fn(r)));
   if(op==='update')found.forEach(r=>Object.assign(r,payload));
   return {data:structuredClone(single ? found[0]??null : found),error:null};
  }).then(resolve,reject);}};return q;
 },
 async rpc(name,p){
  const alerts=rows.get('phase14_operational_alerts'); let row=alerts.find(r=>r.alert_key===p.p_alert_key);
  if(name==='record_production_monitor_alert'){
   if(!row){row={alert_key:p.p_alert_key};alerts.push(row);}
   if(row.status==='resolved'||!row.status)Object.assign(row,{first_detected_at:p.p_now,occurrence_count:0,last_notified_at:null,last_recovery_notified_at:null});
   Object.assign(row,{status:'open',source:'production_monitor',monitoring_priority:p.p_priority,category:p.p_category,stage:p.p_stage,error_category:p.p_error_category,detail_json:p.p_detail,last_seen_at:p.p_now,occurrence_count:row.occurrence_count+1});
  }else if(name==='resolve_production_monitor_alert'){if(row.status==='resolved')return {data:null,error:null};row.status='resolved';row.resolved_at=p.p_now;
  }else if(name==='mark_production_monitor_alert_notified'){
   if(markerFailures-->0)return {data:null,error:{message:'Gateway Timeout'}};
   row[p.p_is_recovery?'last_recovery_notified_at':'last_notified_at']=p.p_notified_at;
  }else throw new Error(`unexpected RPC ${name}`);
  return {data:structuredClone(row),error:null};
 }};
}
let db=dbDouble();
assert.equal(await upsertHeartbeat(db,{monitor_name:'production-incident-monitor',status:'healthy'}),true);
db.faults.set('production_monitor_heartbeats:upsert',1);
assert.equal(await upsertHeartbeat(db,{monitor_name:'production-incident-monitor',status:'running'}),false);
assert.equal(await upsertHeartbeat(db,{monitor_name:'production-incident-monitor',status:'healthy'}),true);
pass('heartbeat persistence success and failed write are observable');
assert.equal(monitorHeartbeatReadiness({heartbeat:{status:'failed',last_completed_at:now().toISOString()},now:now(),staleMinutes:30,production:true}).safeCode,'monitor_heartbeat_failed');
assert.equal(monitorHeartbeatReadiness({heartbeat:{status:'failed',last_completed_at:'2026-09-11T00:00:00Z'},now:now(),staleMinutes:30,production:true}).safeCode,'monitor_heartbeat_stale_or_missing');
let h=monitorSelfHealth(null,true);assert.equal(h.self_active,false);h=monitorSelfHealth(h,true);assert.equal(h.self_active,true);h=monitorSelfHealth(h,false);assert.equal(h.self_active,true);h=monitorSelfHealth(h,false);assert.equal(h.self_active,false);
pass('self-health escalates after two failures and recovers after two successes; freshness semantics remain distinct');

const healthy=async()=>({status:'HEALTHY',checks:[],currentDeploymentSha:'a'.repeat(40),checkedAt:now().toISOString()});
const broken=async()=>({status:'INCIDENT',checks:[{key:'public_home',category:'public_route',status:'FAIL',safeCode:'public_route_unavailable'}],currentDeploymentSha:'a'.repeat(40),checkedAt:now().toISOString()});
db=dbDouble(); sent.length=0;
const deps={db,now,sendEmail,evaluateReadiness:broken};
db.markerFailures=1;
await runProductionMonitor({},deps);assert.equal(sent.length,1);
advance();await runProductionMonitor({},deps);assert.equal(sent.length,1);
assert.equal(db.rows.get('production_monitor_heartbeats')[0].status,'healthy');
pass('failed notification marker does not duplicate alert; customer P1 does not fail the heartbeat');
advance();await runProductionMonitor({},{...deps,evaluateReadiness:healthy});assert.equal(sent.length,2);assert.match(sent[1].subject,/RECOVERED/);
advance();await runProductionMonitor({},{...deps,evaluateReadiness:healthy});assert.equal(sent.length,2);
advance();await runProductionMonitor({},deps);assert.equal(sent.length,3);assert.notEqual(sent[2].idempotencyKey,sent[0].idempotencyKey);
pass('one recovery email, real reopen gets a distinct episode key');
db.markerFailures=1;
advance();await runProductionMonitor({},{...deps,evaluateReadiness:healthy});assert.equal(sent.length,4);
advance();await runProductionMonitor({},{...deps,evaluateReadiness:healthy});assert.equal(sent.length,4);
assert.ok(db.rows.get('phase14_operational_alerts')[0].last_recovery_notified_at);
pass('recovery marker failure retries bookkeeping without repeating recovery email');

// A missing orders result must preserve a known open fulfilment P1.
db=dbDouble();sent.length=0;
db.rows.get('phase14_operational_alerts').push({alert_key:'fulfilment:paid_order_without_report',status:'open',source:'production_monitor',monitoring_priority:'P1',first_detected_at:now().toISOString(),last_notified_at:now().toISOString(),detail_json:{count:8}});
db.faults.set('orders:read',true);
await runProductionMonitor({},{db,now,sendEmail,evaluateReadiness:healthy});
assert.equal(db.rows.get('phase14_operational_alerts')[0].status,'open');assert.equal(sent.length,0);
advance();await runProductionMonitor({},{db,now,sendEmail,evaluateReadiness:healthy});assert.equal(sent.length,1);assert.match(sent[0].text,/monitor_infrastructure_unavailable/);
pass('unavailable fulfilment preserves incidents; repeated internal failure raises only self-health');

db=dbDouble();db.faults.set('app_settings:read',true);
await assert.rejects(monitorAdaptiveStalledLeads({adminUrlFor:()=>''},{db}),e=>e.message==='Gateway Timeout');
assert.equal(db.rows.get('phase14_operational_alerts').length,0);
pass('stalled-lead setting failure does not default into notification side effects');

// Persisted payload is immutable even when a retry occurs with a new observation/time.
db=dbDouble();sent.length=0;
const candidate={alertKey:'test:p1',priority:'P1',category:'test',stage:'dependency'};
const first=now().toISOString();
await sendMonitoringEmail(candidate,{firstDetected:first,detectedAt:first,occurrenceCount:1},{db,now,sendEmail});
advance();await sendMonitoringEmail(candidate,{firstDetected:first,detectedAt:now().toISOString(),occurrenceCount:2},{db,now,sendEmail});
assert.equal(sent.length,1);
assert.equal(db.rows.get('production_monitor_notifications').length,1);
pass('one durable notification per episode/period; no customer email or external calls');

// Count-notified fulfilment P1s: notify on first detection and count increases, never on elapsed time alone.
{
  const { alertNotificationDecision, COUNT_NOTIFIED_P1_ALERT_KEYS } = await import('../src/lib/monitoring/production-monitor.ts');
  assert.deepEqual([...COUNT_NOTIFIED_P1_ALERT_KEYS].sort(), ['fulfilment:comprehensive_generation_failed', 'fulfilment:paid_order_without_report']);
  time = new Date('2026-09-13T17:00:00Z');
  const hoursAgo = (h) => new Date(time.getTime() - h * 3_600_000).toISOString();
  const minutes = (m) => { time = new Date(time.getTime() + m * 60_000); };
  const paid = (id, product) => ({ id, status: 'verified', product_name: product, created_at: hoursAgo(300), verified_at: hoursAgo(300), assessment_id: null });
  const failedAttempt = (orderId) => ({ order_id: orderId, status: 'generation_failed', retry_count: 0, max_attempts: 5, requested_at: hoursAgo(290), started_at: hoursAgo(290), completed_at: hoursAgo(290) });
  db = dbDouble(); sent.length = 0;
  const run = () => runProductionMonitor({}, { db, now, sendEmail, evaluateReadiness: healthy });
  const alert = (key) => db.rows.get('phase14_operational_alerts').find((row) => row.alert_key === key);
  const subjects = (from) => sent.slice(from).map((mail) => mail.subject);
  const COMP = 'fulfilment:comprehensive_generation_failed';
  const PAID = 'fulfilment:paid_order_without_report';

  // 1 + 4. No existing alerts: one initial email per key.
  db.rows.set('orders', [paid('o1', 'comprehensive')]);
  db.rows.set('manual_report_generation_attempts', [failedAttempt('o1')]);
  await run();
  assert.equal(sent.length, 2);
  assert.deepEqual(subjects(0).sort(), ['[MK P1] Fraud Readiness fulfilment requires attention', '[MK P1] Fraud Readiness report_generation requires attention']);
  assert.equal(alert(COMP).detail_json.count, 1); assert.equal(alert(PAID).detail_json.count, 1);

  // 2. Same counts: silent at +15m, after 4h and after 24h, while both incidents stay open.
  minutes(15); await run();
  minutes(4 * 60); await run();
  minutes(24 * 60); await run();
  assert.equal(sent.length, 2, 'static P1 counts never re-email because the cooldown elapsed');
  assert.equal(alert(COMP).status, 'open'); assert.equal(alert(PAID).status, 'open');
  pass('count-notified fulfilment P1s: initial email once; unchanged count silent after 4h and 24h');

  // 3 + 4. Increases email immediately, inside the same four-hour period as the previous send.
  db.rows.get('orders').push(paid('o2', 'essential'));
  minutes(15); await run();
  assert.deepEqual(subjects(2), ['[MK P1] Fraud Readiness fulfilment requires attention']);
  assert.match(sent[2].text, /Affected event count: 2/);
  db.rows.get('orders').push(paid('o3', 'comprehensive'));
  db.rows.get('manual_report_generation_attempts').push(failedAttempt('o3'));
  minutes(15); await run();
  assert.equal(sent.length, 5);
  assert.deepEqual(subjects(3).sort(), ['[MK P1] Fraud Readiness fulfilment requires attention', '[MK P1] Fraud Readiness report_generation requires attention']);
  assert.equal(alert(COMP).detail_json.count, 2); assert.equal(alert(PAID).detail_json.count, 3);
  assert.equal(new Set(sent.map((mail) => mail.idempotencyKey)).size, sent.length, 'every send has a distinct receipt key');
  pass('count increase (1->2 comprehensive, 1->2->3 paid-unfulfilled) emails immediately');

  // 5. Decreases that stay above zero update state without email.
  db.rows.set('manual_report_generation_attempts', [failedAttempt('o1')]);
  db.rows.set('orders', [paid('o1', 'comprehensive'), paid('o3', 'comprehensive')]);
  minutes(15); await run();
  assert.equal(sent.length, 5, 'count decrease is not news');
  assert.equal(alert(COMP).detail_json.count, 1); assert.equal(alert(PAID).detail_json.count, 2);
  assert.equal(alert(COMP).status, 'open'); assert.equal(alert(PAID).status, 'open');
  pass('count decrease (2->1, 3->2) updates the open incident silently');

  // 6. Clear: exactly one recovery email per incident, and nothing more afterwards.
  db.rows.set('orders', []); db.rows.set('manual_report_generation_attempts', []);
  minutes(15); await run();
  minutes(15); await run();
  minutes(4 * 60); await run();
  assert.equal(sent.length, 7);
  assert.deepEqual(subjects(5).map((subject) => subject.startsWith('[RECOVERED]')), [true, true]);
  assert.equal(alert(COMP).status, 'resolved'); assert.equal(alert(PAID).status, 'resolved');
  pass('clearing sends exactly one recovery per incident');

  // 7. Genuine reopen: a fresh initial notification under a new episode identity.
  const earlierKeys = new Set(sent.map((mail) => mail.idempotencyKey));
  db.rows.set('orders', [paid('o9', 'comprehensive')]);
  db.rows.set('manual_report_generation_attempts', [failedAttempt('o9')]);
  minutes(15); await run();
  assert.equal(sent.length, 9);
  assert.ok(sent.slice(7).every((mail) => !earlierKeys.has(mail.idempotencyKey) && /^\[MK P1\]/.test(mail.subject)));
  minutes(4 * 60); await run();
  assert.equal(sent.length, 9, 'reopened static count stays silent too');
  pass('reopen after resolve sends a new initial email with a new episode key');

  // 8. Every other P1 keeps the four-hour reminder, including count-bearing funnel P1s.
  db = dbDouble(); sent.length = 0;
  const outage = () => runProductionMonitor({}, { db, now, sendEmail, evaluateReadiness: broken });
  await outage(); assert.equal(sent.length, 1);
  minutes(15); await outage(); assert.equal(sent.length, 1);
  minutes(4 * 60); await outage(); assert.equal(sent.length, 2, 'public route P1 still reminds after 4h');
  assert.notEqual(sent[1].idempotencyKey, sent[0].idempotencyKey);
  const staticP1 = { status: 'open', last_notified_at: new Date(time.getTime() - 5 * 3_600_000).toISOString(), detail_json: { count: 1 } };
  for (const key of ['funnel:submitted_without_snapshot', 'funnel:snapshot_generation_failed', 'production-readiness:adaptive_activation_binding', 'production-readiness:database_reachable', 'fulfilment:some_future_p1']) {
    assert.equal(alertNotificationDecision({ existing: staticP1, now: time, priority: 'P1', underlyingCount: 1, alertKey: key }), 'send_reminder', key);
  }
  assert.equal(alertNotificationDecision({ existing: staticP1, now: time, priority: 'P1', underlyingCount: 1 }), 'send_reminder', 'no key keeps the cooldown');
  assert.equal(alertNotificationDecision({ existing: staticP1, now: time, priority: 'P1', underlyingCount: 1, alertKey: COMP }), 'suppress');
  pass('unrelated P1s (route, adaptive, snapshot, database, future) keep the four-hour reminder');

  // 9. P2 count semantics unchanged.
  const p2 = { status: 'open', last_notified_at: new Date(time.getTime() - 30 * 3_600_000).toISOString(), detail_json: { count: 9 } };
  assert.equal(alertNotificationDecision({ existing: p2, now: time, priority: 'P2', underlyingCount: 9, alertKey: 'fulfilment:notification_queue_stalled' }), 'suppress');
  assert.equal(alertNotificationDecision({ existing: p2, now: time, priority: 'P2', underlyingCount: 10, alertKey: 'fulfilment:notification_queue_stalled' }), 'send_reminder');
  assert.equal(alertNotificationDecision({ existing: p2, now: time, priority: 'P2', underlyingCount: 8 }), 'suppress');
  assert.equal(alertNotificationDecision({ existing: { ...p2, status: 'resolved' }, now: time, priority: 'P2', underlyingCount: 9 }), 'send_initial');
  pass('P2 count alerts unchanged: same/lower suppress, higher reminds, resolved re-initialises');
}
