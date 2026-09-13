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
