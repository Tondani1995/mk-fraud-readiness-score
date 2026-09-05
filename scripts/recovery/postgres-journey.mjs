import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { buildAdvisoryEvidenceModel } from '../../src/lib/reports/evidence-model/index.ts';
import { generateManualPhase1Report } from '../../src/lib/reports/phase1-manual-fulfilment.ts';
import { buildDirectAssembly, createProviderFreeWholeWriter, createDirectGenerationDb, providerFreeFlags } from './offline-fixtures.mjs';

// Fixed loopback connection only. Never consumes a Supabase URL or production credentials.
export async function createPostgresJourney() {
 const client = new pg.Client({host:'127.0.0.1',port:Number(process.env.MK_RETRY_POSTGRES_PORT??56371),user:'postgres',database:'mk_v12_replay'});
 await client.connect();
 const id=randomUUID();const assessmentId=randomUUID();const orgId=randomUUID();const scoreId=randomUUID();const adminId=randomUUID();
 const ref=`MKORD-RETRY-${id}`;
 const method=(await client.query('select id from methodology_versions limit 1')).rows[0].id;
 const product=(await client.query("select * from products where product_code='essential_self_assessment'")).rows[0];
 await client.query('insert into auth.users (id,email) values ($1,$2)',[adminId,`${adminId}@example.test`]);
 await client.query("insert into admin_profiles (id,email,role) values ($1,$2,'platform_admin')",[adminId,`${adminId}@example.test`]);
 await client.query('insert into organisations (id,legal_name) values ($1,$2)',[orgId,'Offline Retry Certification']);
 await client.query("insert into assessments (id,assessment_reference,organisation_id,methodology_version_id,status,submitted_at,locked_at) values ($1,$2,$3,$4,'scored',now(),now())",[assessmentId,`MK-ESS-${id}`,orgId,method]);
 await client.query("insert into score_runs (id,assessment_id,methodology_version_id,run_number,status,locked_at,input_hash,overall_score,calculated_maturity,final_maturity,exposure_score,exposure_band,coverage_pct) values ($1,$2,$3,1,'completed',now(),$4,68,'Developing','Developing',58,'High',100)",[scoreId,assessmentId,method,'a'.repeat(64)]);
 await client.query('update assessments set current_score_run_id=$1 where id=$2',[scoreId,assessmentId]);
 await client.query("insert into orders (id,order_reference,assessment_id,product_id,status,amount_cents,currency,verified_by,verified_at) values ($1,$2,$3,$4,'payment_received',750000,'ZAR',$5,now())",[id,ref,assessmentId,product.id,adminId]);
 const original=(await client.query("select claim_manual_report_generation($1,$2,$3,'admin_generate',$4) as value",[ref,adminId,randomUUID(),randomUUID()])).rows[0].value.attempt;
 await client.query('select start_manual_report_generation($1)',[original.id]);
 await client.query("select fail_manual_report_generation($1,'generation_failed','Offline original failure')",[original.id]);
 const wired=createDirectGenerationDb(); const transitions=[]; const db=wired.db;
 db.rpc=async(name,args={})=>{
  assert.match(name,/^[a-z_][a-z0-9_]*$/);const keys=Object.keys(args);keys.forEach(k=>assert.match(k,/^[a-z_][a-z0-9_]*$/));
  try{
   const result=await client.query(`select public.${name}(${keys.map((k,i)=>`${k} => $${i+1}`).join(',')}) as value`,Object.values(args));
   const rows=(await client.query('select status from manual_report_generation_attempts where order_id=$1 and id<>$2 order by created_at',[id,original.id])).rows;
   if(rows[0]&&transitions.at(-1)!==rows[0].status)transitions.push(rows[0].status);
   return {data:result.rows[0].value,error:null};
  }catch(error){return {data:null,error};}
 };
 // Narrow read adapter: all reads still use the real local PostgreSQL tables.
 db.from=table=>{
  assert.ok(['app_settings','report_templates','report_content_blocks','manual_report_generation_attempts','reports'].includes(table));
  let fields='*',where=[],values=[],order='',limit='',single=false;
  const q={select(x){fields=x;assert.match(x,/^[a-z_,*]+$/);return q;},eq(k,v){assert.match(k,/^[a-z_][a-z0-9_]*$/);values.push(v);where.push(`${k}=$${values.length}`);return q;},order(k,{ascending}){assert.match(k,/^[a-z_][a-z0-9_]*$/);order=` order by ${k} ${ascending?'asc':'desc'}`;return q;},limit(n){assert.ok(Number.isInteger(n));limit=` limit ${n}`;return q;},maybeSingle(){single=true;return q;},single(){single=true;return q;},then(resolve,reject){return client.query(`select ${fields} from ${table}${where.length?' where '+where.join(' and '):''}${order}${limit}`,values).then(r=>({data:single?r.rows[0]??null:r.rows,error:null}),error=>({data:null,error})).then(resolve,reject);}};
  return q;
 };
 const writer=createProviderFreeWholeWriter();const data=buildDirectAssembly();
 const questions=['D8-Q02','D8-Q05','D4-Q02'];data.questionTraces=data.questionTraces.filter(t=>questions.includes(t.questionCode));data.criticalMajorGaps=data.criticalMajorGaps.filter(t=>questions.includes(t.questionCode));data.expectedQuestionTraceCount=data.actualQuestionTraceCount=data.questionTraces.length;
 const model=buildAdvisoryEvidenceModel(data);assert.equal(model.riskRegister.length,2);assert.equal(model.scenarios.length,3);
 Object.assign(data,{orderId:id,orderReference:ref,orderStatus:'payment_received',assessmentId,orderAssessmentId:assessmentId,organisationId:orgId,currentScoreRunId:scoreId,assessmentReference:`MK-ESS-${id}`,orderVerifiedAt:'2026-09-01T10:00:00Z',orderVerifiedBy:adminId,amountCents:750000,orderCreatedAt:'2026-09-01T10:00:00Z',requiresPaymentVerification:true,paymentVerification:{legacyOrderVerification:true},productId:product.id,productPriceVersionId:'offline-price',productPriceVersions:[{id:'offline-price',productId:product.id,versionNumber:1,priceCents:750000,currency:'ZAR',effectiveFrom:'2026-08-01T00:00:00Z',effectiveTo:null}],scoreRun:{...data.scoreRun,id:scoreId,assessmentId}});
 return {orderReference:ref,adminId,original,transitions,writer,
  generate(requestKey){return generateManualPhase1Report({orderReference:ref,action:'admin_retry',requestKey,requestedBy:adminId},{db,assembleReportData:async()=>structuredClone(data),getPremiumReportAutomationFlags:providerFreeFlags(),wholeManuscriptWriter:writer.writer,renderValidatedCommercialPdf:async()=>Buffer.from(`%PDF-1.7\n${'0'.repeat(1200)}`)});},
  async verify(success=true){const rows=(await client.query('select id,status,retry_count,request_key,output_report_id from manual_report_generation_attempts where order_id=$1 order by created_at',[id])).rows;assert.equal(rows.length,success?2:1);assert.equal(rows[0].id,original.id);assert.equal(rows[0].status,'GENERATION_FAILED');assert.equal(rows[0].retry_count,0);if(success){assert.equal(rows[1].status,'REPORT_READY');assert.equal(rows[1].retry_count,1);assert.ok(rows[1].output_report_id);assert.deepEqual(transitions,['REPORT_QUEUED','REPORT_GENERATING','REPORT_READY']);assert.equal(writer.calls.write,1);}return rows;},
  close(){return client.end();}
 };
}
