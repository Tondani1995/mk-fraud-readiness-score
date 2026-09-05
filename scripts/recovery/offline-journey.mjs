import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { buildAdvisoryEvidenceModel } from '../../src/lib/reports/evidence-model/index.ts';
import { randomUUID } from 'node:crypto';
import { generateManualPhase1Report } from '../../src/lib/reports/phase1-manual-fulfilment.ts';
import { buildDirectAssembly, createProviderFreeWholeWriter, createDirectGenerationDb, providerFreeFlags } from './offline-fixtures.mjs';

// The real orchestration and entitlement run against an isolated persisted adapter. This
// exercises service transitions, not the production PostgreSQL migration implementation.
export function createOfflineJourney(path) {
 const ledger=new DatabaseSync(path);
 ledger.exec('CREATE TABLE attempts (id TEXT PRIMARY KEY, request_key TEXT UNIQUE, status TEXT, retry_count INTEGER);');
 ledger.prepare('INSERT INTO attempts VALUES (?,?,?,?)').run('original-failed','original-key','GENERATION_FAILED',0);
 const transitions=[];const wired=createDirectGenerationDb();const writer=createProviderFreeWholeWriter();
 const db=wired.db;
 db.rpc=async(name,args)=>{
  wired.calls.rpc.push({name,args});
  if(name==='claim_manual_report_generation'){
   assert.equal(args.p_trigger_source,'admin_retry');
   const existing=ledger.prepare('SELECT * FROM attempts WHERE request_key=?').get(args.p_request_key);
   if(existing)return {data:{claimed:false,reason:'idempotent_replay',attempt:existing},error:null};
   const id=randomUUID(); ledger.prepare('INSERT INTO attempts VALUES (?,?,?,?)').run(id,args.p_request_key,'REPORT_QUEUED',1);
   transitions.push('REPORT_QUEUED');return {data:{claimed:true,generation_started:false,attempt:{id,report_version:1,retry_count:1,order_id:'offline-order'}},error:null};
  }
  if(name==='start_manual_report_generation'){
   ledger.prepare('UPDATE attempts SET status=? WHERE id=?').run('REPORT_GENERATING',args.p_attempt_id);transitions.push('REPORT_GENERATING');return {data:{ok:true},error:null};
  }
  if(name==='complete_manual_report_generation'){
   ledger.prepare('UPDATE attempts SET status=? WHERE id=?').run('REPORT_READY',args.p_attempt_id);transitions.push('REPORT_READY');return {data:{report:{id:'offline-report',report_reference:'OFFLINE-ESS-V1',version_number:1},superseded_report_id:null},error:null};
  }
  if(name==='fail_manual_report_generation'){
   ledger.prepare('UPDATE attempts SET status=? WHERE id=?').run('GENERATION_FAILED',args.p_attempt_id);transitions.push('GENERATION_FAILED');return {data:{ok:true},error:null};
  }
  throw new Error(`Unexpected RPC ${name}`);
 };
 const data=buildDirectAssembly();
 // Two distinct digital findings consolidate into one risk; a third detection finding
 // produces the second risk. The old algorithm produced only two scenarios here.
 const questions=['D8-Q02','D8-Q05','D4-Q02'];
 data.questionTraces=data.questionTraces.filter(t=>questions.includes(t.questionCode));
 data.criticalMajorGaps=data.criticalMajorGaps.filter(t=>questions.includes(t.questionCode));
 data.expectedQuestionTraceCount=data.actualQuestionTraceCount=data.questionTraces.length;
 const model=buildAdvisoryEvidenceModel(data);
 assert.equal(model.riskRegister.length,2);
 assert.equal(model.scenarios.length,3,'consolidation top-up must reach the unchanged three-scenario minimum');
 Object.assign(data,{orderId:'offline-order',orderReference:'MKORD-OFFLINE-RETRY',orderStatus:'payment_received',orderVerifiedAt:'2026-09-01T10:00:00Z',orderVerifiedBy:'offline-admin',amountCents:750000,orderCreatedAt:'2026-09-01T10:00:00Z',requiresPaymentVerification:true,paymentVerification:{legacyOrderVerification:true},productPriceVersionId:'offline-price',productPriceVersions:[{id:'offline-price',productId:data.productId,versionNumber:1,priceCents:750000,currency:'ZAR',effectiveFrom:'2026-08-01T00:00:00Z',effectiveTo:null}]});
 return {
  ledger,transitions,writer,
  async generate(requestKey){return generateManualPhase1Report({orderReference:data.orderReference,action:'admin_retry',requestKey,requestedBy:'offline-admin'},{db,assembleReportData:async()=>structuredClone(data),getPhase1SchemaCapability:async()=>({status:'available',schemaVersion:'offline',message:null,checks:{}}),getPremiumReportAutomationFlags:providerFreeFlags(),wholeManuscriptWriter:writer.writer,renderValidatedCommercialPdf:async()=>Buffer.from(`%PDF-1.7\n${'0'.repeat(1200)}`)});},
  verify(){const rows=ledger.prepare('SELECT * FROM attempts ORDER BY retry_count').all();assert.equal(rows.length,2);assert.equal(rows[0].id,'original-failed');assert.equal(rows[0].status,'GENERATION_FAILED');assert.equal(rows[0].retry_count,0);assert.equal(rows[1].status,'REPORT_READY');assert.equal(rows[1].retry_count,1);assert.deepEqual(transitions,['REPORT_QUEUED','REPORT_GENERATING','REPORT_READY']);assert.equal(writer.calls.write,1);return rows;}
 };
}
