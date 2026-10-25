/** Adversarial tests of the actual HTTP route and limiter, with only infrastructure substituted. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { createRequire } from 'node:module';
import crypto from 'node:crypto';
const require = createRequire(import.meta.url);
const { NextResponse } = require('next/server');
const checks = [];
const test = async (name, run) => { await run(); checks.push(name); };
function compile(file, dependencies) {
  const module = { exports: {} };
  const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  new Function('require', 'module', 'exports', output)((name) => {
    assert.ok(name in dependencies, `Unexpected dependency ${name}`);
    return dependencies[name];
  }, module, module.exports);
  return module.exports;
}
function setup(outcomes = [true, true], recovery) {
  const calls = [], recoveries = [];
  let clientFailure = false;
  const limiter = compile('src/lib/security/rate-limit.ts', {
    '@/lib/supabase/server': { createSupabaseServiceClient() {
      if (clientFailure) throw new Error('private-config-detail');
      return { async rpc(name, args) {
        assert.equal(name, 'check_rate_limit');
        const value = outcomes[calls.length % outcomes.length];
        calls.push(args);
        if (value instanceof Error) throw value;
        if (value && typeof value === 'object' && 'error' in value) return value;
        return { data: value, error: null };
      } };
    } },
    '@/lib/env/server': { getNumberEnv: (_key, fallback) => fallback }
  });
  const route = compile('src/app/score/api/adaptive/[assessmentRef]/result/route.ts', {
    'next/server': { NextResponse },
    '@/lib/security/rate-limit': limiter,
    '@/lib/security/hash': { hashIpAddress: () => 'synthetic-ip-digest' },
    '@/lib/adaptive/server': { async recoverAdaptiveResultAccess(ref, token, options) {
      recoveries.push({ ref, token, options });
      return recovery ? recovery(ref, token) : { ok: true, snapshotUrl: '/score/snapshot/SYNTHETIC?token=synthetic-private-link' };
    } }
  });
  return { route, limiter, calls, recoveries, failClient() { clientFailure = true; } };
}
const url = 'https://staging.invalid/score/api/adaptive/SYNTHETIC/result';
const props = { params: Promise.resolve({ assessmentRef: 'SYNTHETIC' }) };
function request(body = JSON.stringify({ token: 'synthetic-resume' }), headers = {}) {
  return new Request(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body });
}
async function expect(fixture, req, status, recoveryCalls = 0) {
  const response = await fixture.route.POST(req, props);
  assert.equal(response.status, status);
  assert.equal(fixture.recoveries.length, recoveryCalls);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow');
  const body = await response.json();
  if (status !== 200) {
    assert.equal(body.ok, false);
    assert.ok(!('snapshotUrl' in body));
    assert.ok(!JSON.stringify(body).includes('private-config-detail'));
    assert.ok(!JSON.stringify(body).includes('synthetic-resume'));
  }
  return body;
}
const originalLog = console.error;
const logs = [];
console.error = (...args) => logs.push(args);
try {
  await test('legacy default remains explicit and unchanged', async () => {
    const x = setup([{ error: { message: 'limiter unavailable' } }]);
    assert.equal((await x.limiter.checkRateLimits([{ key: 'synthetic', maxHits: 1, windowSeconds: 60 }])).allowed, true);
  });
  for (const failure of [null, undefined, 'true', 1, {}, { error: { message: 'private-config-detail' } }, new Error('private-config-detail')]) {
    for (const index of [0,1]) await test(`strict bucket ${index}: rejects ${String(failure)}`, async () => {
      const outcomes = [true,true]; outcomes[index] = failure;
      const x = setup(outcomes);
      await expect(x, request(), 503);
      assert.equal(x.calls.length, 2, 'Both independent buckets must run');
    });
  }
  for (const outcomes of [[false,true],[true,false],[false,false]]) await test(`budget rejects ${outcomes}`, async () => {
    const x = setup(outcomes); await expect(x, request(), 429); assert.equal(x.calls.length, 2);
  });
  await test('limiter client failure cannot reach recovery', async () => {
    const x = setup(); x.failClient(); await expect(x, request(), 503);
  });
  await test('empty strict policy denies', async () => {
    const x = setup(); const result = await x.limiter.checkRateLimits([], { failureMode: 'closed' });
    assert.equal(result.allowed, false); assert.equal(result.unavailable, true);
  });
  for (const headers of [{origin:'https://attacker.invalid'},{origin:'null'},{'sec-fetch-site':'cross-site'}]) {
    await test(`cross-origin denied ${JSON.stringify(headers)}`, async () => {
      const x=setup(); await expect(x,request(undefined,headers),403); assert.equal(x.calls.length,0);
    });
  }
  for (const body of ['', '{', 'null', '[]', '{}', '{"token":1}', '{"token":""}', JSON.stringify({token:'x'.repeat(513)})]) {
    await test(`invalid body ${body.slice(0,35)}`, async () => {
      const x=setup(); await expect(x,request(body),['','{'].includes(body)?400:403);
    });
  }
  await test('oversized announced body denied', async () => {
    await expect(setup(),request('{}',{'content-length':'4097'}),413);
  });
  await test('oversized actual stream denied despite absent length', async () => {
    const stream = new ReadableStream({ start(controller) {
      controller.enqueue(new TextEncoder().encode('{"token":"'));
      controller.enqueue(new TextEncoder().encode('x'.repeat(4097)));
      controller.close();
    } });
    await expect(setup(),new Request(url,{method:'POST',body:stream,duplex:'half'}),413);
  });
  await test('rate denial precedes reading malformed body', async () => {
    await expect(setup([false,true]),request('{'),429);
  });
  for (const headers of [{origin:'https://staging.invalid'},{'sec-fetch-site':'same-origin'},{}]) {
    await test(`valid exchange ${JSON.stringify(headers)}`, async () => {
      const x=setup(); const result=await expect(x,request(undefined,headers),200,1);
      assert.ok(result.snapshotUrl.startsWith('/score/snapshot/'));
      assert.equal(x.recoveries[0].ref,'SYNTHETIC');
      assert.equal(x.calls[0].p_key,'adaptive_result:ip:synthetic-ip-digest');
      assert.equal(x.calls[1].p_key,'adaptive_result:ref:SYNTHETIC');
      assert.equal(x.calls[0].p_max_hits,30); assert.equal(x.calls[1].p_max_hits,20);
    });
  }
  for (const [reason,status] of [['snapshot_pending',202],['recorded_result_unavailable',409],['private_access_required',403]]) {
    await test(`service state ${status}`,async()=>{
      await expect(setup([true,true],()=>({ok:false,reason,status})),request(),status,1);
    });
  }
  for (const [message,status] of [['adaptive_invalid_token',403],['adaptive_activation_disabled',403],['private-config-detail',503]]) {
    await test(`service exception ${status}`, async()=>{
      await expect(setup([true,true],()=>{throw new Error(message);}),request(),status,1);
    });
  }
  await test('POST only; strict logs omit credential and raw failure detail', async()=>{
    assert.deepEqual(Object.keys(setup().route),['POST']);
    const strictLogs=logs.filter(x=>x[0]==='Strict rate-limit decision unavailable');
    assert.ok(strictLogs.length>0);assert.ok(strictLogs.every(x=>x.length===1));
  });
  function privateFixture() {
    const raw='synthetic-snapshot-only';
    const digest=crypto.createHmac('sha256','synthetic-pepper').update(raw).digest('hex');
    const data={
      assessment_tokens:[{id:'snapshot-id',assessment_id:'a',token_hash:digest,token_type:'snapshot',expires_at:'2099-01-01',revoked_at:null,use_count:0,max_uses:2}],
      assessments:[{id:'a',assessment_reference:'SYNTHETIC',status:'scored',current_score_run_id:'locked-run',organisation_id:'org',primary_respondent_id:null}],
      organisations:[{id:'org',legal_name:'Synthetic only'}]
    };
    let consumed=0;
    const db={from(table){assert.ok(table in data);const conditions=[];return {
      select(){return this;},eq(k,v){conditions.push([k,v]);return this;},
      async maybeSingle(){return {data:data[table].find(row=>conditions.every(([k,v])=>row[k]===v))??null,error:null};},
      async insert(){return {error:null};}
    };},async rpc(name){assert.equal(name,'consume_assessment_token');consumed++;return {data:{ok:true,token_id:'snapshot-id'},error:null};}};
    data.audit_logs=[];
    const tokens=compile('src/lib/respondent/tokens.ts',{
      '@/lib/utils/date':{addHours:(d,h)=>new Date(d.getTime()+h*3600000)},
      '@/lib/env/server':{getNumberEnv:(_key,fallback)=>fallback},
      '@/lib/security/hash':{
        hashAssessmentToken:value=>crypto.createHmac('sha256','synthetic-pepper').update(value).digest('hex'),
        hashIpAddress:()=>null,createUrlSafeToken:()=>crypto.randomBytes(32).toString('base64url')
      },
      '@/lib/supabase/server':{createSupabaseServiceClient:()=>db}
    });
    return {data,tokens,get consumed(){return consumed;},run:(ref='SYNTHETIC',token=raw)=>tokens.validateSnapshotToken({assessmentReference:ref,rawToken:token,consume:false})};
  }
  for(const [name,mutate] of [
    ['expired',x=>x.data.assessment_tokens[0].expires_at='2000-01-01'],
    ['revoked',x=>x.data.assessment_tokens[0].revoked_at='2026-10-25'],
    ['exhausted',x=>x.data.assessment_tokens[0].use_count=2],
    ['resume token',x=>x.data.assessment_tokens[0].token_type='resume'],
    ['cross-assessment',x=>x.data.assessment_tokens[0].assessment_id='other'],
    ['draft assessment',x=>x.data.assessments[0].status='draft'],
    ['missing score',x=>x.data.assessments[0].current_score_run_id=null]
  ]) await test(`private Snapshot rejects ${name}`,async()=>{
    const x=privateFixture();mutate(x);const result=await x.run();assert.equal(result.ok,false);assert.equal(x.consumed,0);
  });
  await test('private Snapshot denies reference guessing and wrong bearer',async()=>{
    const x=privateFixture();assert.equal((await x.run('OTHER')).ok,false);assert.equal((await x.run('SYNTHETIC','wrong')).ok,false);
  });
  await test('private Snapshot render is non-consuming, not a strict per-view allowance',async()=>{
    const x=privateFixture();assert.equal((await x.run()).ok,true);assert.equal((await x.run()).ok,true);
    assert.equal(x.consumed,0);assert.equal(x.data.assessment_tokens[0].use_count,0);
  });
} finally { console.error = originalLog; }
console.log(JSON.stringify({ok:true,cases:checks.length,checks,scope:'Actual route + actual limiter + NextResponse with synthetic RPC/recovery dependencies. Service and real SQL tests run separately; no hosted or external security certification.'},null,2));
