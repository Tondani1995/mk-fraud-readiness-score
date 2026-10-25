/** Real disposable local Postgres security-boundary test. Never connects to hosted services. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
import { recoverAdaptiveResultAccess } from '../src/lib/adaptive/server.ts';
import { hashAssessmentToken } from '../src/lib/security/hash.ts';
process.env.ASSESSMENT_TOKEN_PEPPER='disposable-test-only';process.env.VERCEL_ENV='preview';
process.env.NEXT_PUBLIC_SUPABASE_URL='https://aaaaaaaaaaaaaaaaaaaa.supabase.co';process.env.VERCEL_GIT_COMMIT_SHA='a'.repeat(40);
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'mk-result-recovery-'));
const port=58800+(process.pid%150);
const bin=process.env.MK_TEST_POSTGRES_BIN;
const postgres=bin ? {
 async initialise(){execFileSync(path.join(bin,'initdb'),['-D',directory,'-U','postgres','-A','trust'],{stdio:'pipe'});},
 async start(){execFileSync(path.join(bin,'pg_ctl'),['-D',directory,'-l',path.join(directory,'server.log'),'-o',`-h 127.0.0.1 -p ${port}`,'-w','start'],{stdio:'pipe'});},
 async stop(){execFileSync(path.join(bin,'pg_ctl'),['-D',directory,'-m','fast','-w','stop'],{stdio:'pipe'});}
} : new EmbeddedPostgres({databaseDir:directory,user:'postgres',password:'local-test-only',port,persistent:false});
let pool;
try {
 await postgres.initialise();await postgres.start();
 pool=new pg.Pool({host:'127.0.0.1',port,user:'postgres',password:'local-test-only',database:'postgres',max:8});
 await pool.query(`create role anon;create role authenticated;create role service_role;
 create type public.assessment_token_type as enum ('resume','snapshot');
 create table public.assessment_tokens(id uuid primary key default gen_random_uuid(),assessment_id uuid,token_hash text unique,token_type public.assessment_token_type,expires_at timestamptz,revoked_at timestamptz,use_count integer default 0,max_uses integer,last_used_at timestamptz,last_used_ip_hash text);
 create table public.adaptive_activation_policies(policy_key text,environment text,supabase_project text,graph_version text,graph_fingerprint text,enabled boolean,activation_sha text);
 create table public.assessments(id uuid primary key,assessment_reference text,organisation_id uuid,primary_respondent_id uuid,methodology_version_id uuid,status text,assessment_mode text,current_score_run_id uuid,graph_version_id uuid,graph_version_snapshot text,graph_fingerprint_snapshot text,submitted_at timestamptz,locked_at timestamptz,monitoring_synthetic boolean,monitoring_run_id uuid);
 create table public.score_runs(id uuid primary key,assessment_id uuid,methodology_version_id uuid,status text,locked_at timestamptz);`);
 const sql=fs.readFileSync('supabase/migrations/20260808180000_atomic_access_token_consumption.sql','utf8');
 const start=sql.indexOf('create or replace function public.consume_assessment_token(');const end=sql.indexOf('-- 2. Customer report access.');
 await pool.query(sql.slice(start,end));
 const id=crypto.randomUUID(),method=crypto.randomUUID(),score=crypto.randomUUID(),graph=crypto.randomUUID();const token='synthetic-resume-local-postgres';const ref='LOCAL-PG-RECOVERY';
 await pool.query('insert into adaptive_activation_policies values ($1,$2,$3,$4,$5,true,$6)',['customer_start','preview','a'.repeat(20),'test-v1','b'.repeat(64),'a'.repeat(40)]);
 await pool.query('insert into assessments(id,assessment_reference,methodology_version_id,status,assessment_mode,current_score_run_id,graph_version_id,graph_version_snapshot,graph_fingerprint_snapshot,submitted_at,locked_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9,now(),now())',[id,ref,method,'scored','adaptive',score,graph,'test-v1','b'.repeat(64)]);
 await pool.query("insert into score_runs values($1,$2,$3,'completed',now())",[score,id,method]);
 await pool.query("insert into assessment_tokens(assessment_id,token_hash,token_type,expires_at,max_uses) values($1,$2,'resume',now()+interval '1 hour',1),($1,'existing-snapshot','snapshot',now()+interval '1 hour',100)",[id,hashAssessmentToken(token)]);
 const queries=[];
 const adapter={from(table){assert.ok(['assessment_tokens','adaptive_activation_policies','assessments','score_runs'].includes(table));let columns='*';const conditions=[];return {select(value){columns=value;return this;},eq(k,v){conditions.push([k,v]);return this;},async maybeSingle(){queries.push(table);try{const result=await pool.query(`select ${columns} from public.${table} where ${conditions.map(([k],i)=>`${k}=$${i+1}`).join(' and ')}`,conditions.map(([,v])=>v));return {data:result.rows[0]??null,error:null};}catch(error){return {data:null,error};}}};},async rpc(name,args){assert.equal(name,'consume_assessment_token');const result=await pool.query('select public.consume_assessment_token($1,$2,$3) as result',[args.p_token_hash,args.p_token_type,args.p_ip_hash]);return {data:result.rows[0].result,error:null};}};
 const issued=[];const issueToken=async input=>{assert.equal(input.revokeExisting,false);const raw=crypto.randomBytes(32).toString('base64url');await pool.query("insert into assessment_tokens(assessment_id,token_hash,token_type,expires_at,max_uses) values($1,$2,'snapshot',now()+interval '1 hour',100)",[input.assessmentId,hashAssessmentToken(raw)]);issued.push(true);return {rawToken:raw,expiresAt:new Date(Date.now()+3600000).toISOString()};};
 const original=JSON.stringify((await pool.query('select * from score_runs')).rows);
 const outcomes=await Promise.allSettled(Array.from({length:5},()=>recoverAdaptiveResultAccess(ref,token,{db:adapter,issueToken})));
 assert.equal(outcomes.filter(x=>x.status==='fulfilled'&&x.value.ok).length,1);assert.equal(issued.length,1);
 assert.equal((await pool.query("select use_count from assessment_tokens where token_type='resume'")).rows[0].use_count,1);
 assert.equal((await pool.query("select revoked_at from assessment_tokens where token_hash='existing-snapshot'")).rows[0].revoked_at,null);
 assert.equal(JSON.stringify((await pool.query('select * from score_runs')).rows),original);
 const denied=await pool.query("select public.consume_assessment_token('existing-snapshot','resume',null) as result");assert.equal(denied.rows[0].result.ok,false);
 console.log(JSON.stringify({ok:true,checks:6,concurrentRequests:5,granted:1,scope:'Actual recovery service + disposable local Postgres + exact existing token-consumption SQL. Thin query/issuance adapters; not hosted PostgREST, RLS or staging certification.'}));
} finally {if(pool)await pool.end();await postgres.stop();fs.rmSync(directory,{recursive:true,force:true});}
