import assert from 'node:assert/strict';
import { recoverAdaptiveResultAccess } from '../src/lib/adaptive/server.ts';
import { hashAssessmentToken } from '../src/lib/security/hash.ts';
process.env.ASSESSMENT_TOKEN_PEPPER='synthetic-regression-only';
process.env.NEXT_PUBLIC_SUPABASE_URL='https://aaaaaaaaaaaaaaaaaaaa.supabase.co';
process.env.VERCEL_ENV='preview';process.env.VERCEL_GIT_COMMIT_SHA='a'.repeat(40);
const reference='SYNTHETIC-RECOVERY';const raw='synthetic-resume-only';
function fixture() {
 const data={
  assessment_tokens:[{id:'resume-id',assessment_id:'assessment-a',token_hash:hashAssessmentToken(raw),token_type:'resume',expires_at:'2099-01-01T00:00:00Z',revoked_at:null,use_count:0,max_uses:25}],
  adaptive_activation_policies:[{policy_key:'customer_start',environment:'preview',supabase_project:'a'.repeat(20),graph_version:'fixture-v1',graph_fingerprint:'b'.repeat(64),enabled:true,activation_sha:'a'.repeat(40)}],
  assessments:[{id:'assessment-a',assessment_reference:reference,organisation_id:'org-a',primary_respondent_id:null,methodology_version_id:'method-a',status:'scored',assessment_mode:'adaptive',current_score_run_id:'score-a',graph_version_id:'graph-a',graph_version_snapshot:'fixture-v1',graph_fingerprint_snapshot:'b'.repeat(64),submitted_at:'2026-10-24T00:00:00Z',locked_at:'2026-10-24T00:00:00Z'}],
  score_runs:[{id:'score-a',assessment_id:'assessment-a',methodology_version_id:'method-a',status:'completed',locked_at:'2026-10-24T00:00:00Z'}]
 };
 const reads=[],rpc=[],issued=[];let rpcError=false;
 const db={from(table){assert.ok(data[table],`Unexpected table ${table}: recovery must not load customer identity or reporting data`);const conditions=[];return {select(){return this;},eq(k,v){conditions.push([k,v]);return this;},async maybeSingle(){reads.push(table);return {data:data[table].find(row=>conditions.every(([k,v])=>row[k]===v))??null,error:null};}};},async rpc(name,args){assert.equal(name,'consume_assessment_token','Recovery cannot submit, rescore or enqueue jobs');rpc.push(name);if(rpcError)return {error:{message:'unavailable'}};const token=data.assessment_tokens[0];if(token.use_count>=token.max_uses||token.revoked_at)return {data:{ok:false,reason:'denied'}};token.use_count++;assert.equal(args.p_token_type,'resume');return {data:{ok:true,token_id:token.id}};}};
 const issueToken=async(input)=>{assert.equal(input.assessmentId,'assessment-a');assert.equal(input.assessmentReference,reference);assert.equal(input.revokeExisting,false,'Previously issued private URLs remain valid');issued.push(input);return {rawToken:'new-synthetic-snapshot',expiresAt:'2099-01-01T00:00:00Z'};};
 return {data,reads,rpc,issued,db,issueToken,failRPC(){rpcError=true;},run:(ref=reference,token=raw)=>recoverAdaptiveResultAccess(ref,token,{db,issueToken})};
}
let checks=0;
const good=fixture();let result=await good.run();assert.equal(result.ok,true);assert.equal(result.snapshotUrl,`/score/snapshot/${reference}?token=new-synthetic-snapshot`);assert.equal(good.data.assessment_tokens[0].use_count,1);assert.equal(good.issued.length,1);assert.ok(!good.reads.includes('organisations'));assert.deepEqual(good.rpc,['consume_assessment_token']);checks+=6;
const originalScore=structuredClone(good.data.score_runs),originalAssessment=structuredClone(good.data.assessments);
await good.run();assert.deepEqual(good.data.score_runs,originalScore);assert.deepEqual(good.data.assessments,originalAssessment);assert.equal(good.issued.length,2);checks+=3;
for(const [name,mutate]of [
 ['expired',x=>x.data.assessment_tokens[0].expires_at='2000-01-01'],
 ['revoked',x=>x.data.assessment_tokens[0].revoked_at='2026-10-24'],
 ['exhausted',x=>x.data.assessment_tokens[0].use_count=25],
 ['wrong-token-type',x=>x.data.assessment_tokens[0].token_type='snapshot'],
 ['wrong-assessment',x=>x.data.assessment_tokens[0].assessment_id='other'],
 ['non-adaptive',x=>x.data.assessments[0].assessment_mode='legacy'],
 ['graph-drift',x=>x.data.assessments[0].graph_fingerprint_snapshot='c'.repeat(64)],
 ['activation-disabled',x=>x.data.adaptive_activation_policies[0].enabled=false],
 ['wrong-deployment',x=>x.data.adaptive_activation_policies[0].activation_sha='c'.repeat(40)]
]) {const x=fixture();mutate(x);await assert.rejects(x.run(),undefined,name);assert.equal(x.issued.length,0);assert.equal(x.rpc.length,0);checks+=3;}
for(const [name,mutate,status]of [
 ['draft',x=>x.data.assessments[0].status='draft',409],
 ['pending',x=>{x.data.assessments[0].status='submitted';x.data.assessments[0].current_score_run_id=null;},202],
 ['assessment-not-locked',x=>x.data.assessments[0].locked_at=null,409],
 ['missing-run',x=>x.data.score_runs=[],409],
 ['cross-assessment-run',x=>x.data.score_runs[0].assessment_id='other',409],
 ['cross-methodology-run',x=>x.data.score_runs[0].methodology_version_id='other',409],
 ['unlocked-run',x=>x.data.score_runs[0].locked_at=null,409],
 ['unfinished-run',x=>x.data.score_runs[0].status='failed',409],
 ['consumption-unavailable',x=>x.failRPC(),403]
]) {const x=fixture();mutate(x);const response=await x.run();assert.equal(response.ok,false,name);assert.equal(response.status,status,name);assert.equal(x.issued.length,0);checks+=3;}
for(const [ref,tok]of [['wrong-reference',raw],[reference,'wrong-token']]){const x=fixture();await assert.rejects(x.run(ref,tok));assert.equal(x.issued.length,0);checks+=2;}
const race=fixture();race.data.assessment_tokens[0].max_uses=1;
const outcomes=await Promise.allSettled([race.run(),race.run()]);assert.equal(outcomes.filter(x=>x.status==='fulfilled'&&x.value.ok).length,1);assert.equal(race.issued.length,1);checks+=2;
console.log(JSON.stringify({ok:true,checks,scope:'Real recovery service + faithful query/atomic-consumption double; no hosted Supabase or production certification.'}));
