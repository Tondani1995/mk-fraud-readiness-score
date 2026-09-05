// Offline browser regression: production component + POST handler + real generation service.
// Auth, assembly, SQLite-backed RPC adapter, writer and PDF renderer are explicit test doubles.
// This is not proof of production PostgreSQL RPCs or the deployed Next.js/auth integration.
import assert from 'node:assert/strict';
import {createOfflineJourney} from './offline-journey.mjs';
import {createRequire} from 'node:module';
import {Phase1GenerationError} from '../../src/lib/reports/phase1-manual-fulfilment.ts';
import { build } from 'esbuild';
import { chromium, webkit, devices } from '@playwright/test';
import { createServer } from 'node:http';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';

const work = await mkdtemp(join(tmpdir(), 'mk-essential-retry-'));
const component = join(process.cwd(), 'src/components/admin/FulfilmentActions.tsx');
const props = {orderReference:'MKORD-OFFLINE-RETRY', essentialRetryRequestKey:'offline-server-key',generationState:'GENERATION_FAILED',generationStuck:false,deliveryState:'NOT_READY',eligible:true,storageReady:false,storageCandidate:false,canGenerate:true,canRegenerate:true,canDeliver:true,capabilityAvailable:true};
const shared = `import React from 'react'; import {FulfilmentActions} from ${JSON.stringify(component)}; const props=${JSON.stringify(props)};`;
const options={bundle:true,write:false,jsx:'automatic',tsconfig:'tsconfig.json',logLevel:'silent'};
const client = await build({...options,stdin:{contents:shared+`import {hydrateRoot} from 'react-dom/client';hydrateRoot(document.getElementById('root'),<FulfilmentActions {...props}/>); window.hydrated=true;`,loader:'tsx',resolveDir:process.cwd()},platform:'browser',define:{'process.env.NODE_ENV':'"production"'}});
const ssr = await build({...options,stdin:{contents:shared+`import {renderToString} from 'react-dom/server'; export default renderToString(<FulfilmentActions {...props}/>);`,loader:'tsx',resolveDir:process.cwd()},platform:'node',format:'esm',packages:'external'});
// Place SSR bundle beside node_modules so external React resolves normally.
const ssrFile=join(process.cwd(),`scripts/recovery/.ssr-${randomUUID()}.mjs`);
await writeFile(ssrFile,ssr.outputFiles[0].contents);
const markup=(await import(pathToFileURL(ssrFile))).default;
let requests=[]; let mode='ok'; let journey;
globalThis.__retryTest = {Phase1GenerationError, generate: key => journey.generate(key), admin: () => ({id:'offline-admin',role:mode==='forbidden'?'read_only_admin':'platform_admin'})};
const routeFile=join(process.cwd(),`scripts/recovery/.route-${randomUUID()}.cjs`);
await build({entryPoints:['src/app/score/api/admin/orders/[orderReference]/generate-report/route.ts'],outfile:routeFile,bundle:true,platform:'node',format:'cjs',packages:'external',tsconfig:'tsconfig.json',plugins:[{name:'offline-boundaries',setup(b){
 b.onResolve({filter:/^@\/lib\/(auth\/admin-route|reports\/phase1-manual-fulfilment|rc1\/operation-freeze)$/},a=>({path:a.path,namespace:'offline'}));
 b.onLoad({filter:/.*/,namespace:'offline'},a=>({contents:a.path.includes('admin-route')?'export const getAdminSession = async () => globalThis.__retryTest.admin();':a.path.includes('operation-freeze')?'export const getRc1OperationFreezeResponse = async () => null;':'export const Phase1GenerationError = globalThis.__retryTest.Phase1GenerationError; export const generateManualPhase1Report = input => globalThis.__retryTest.generate(input.requestKey);'}));
}}]});
const {POST}=createRequire(import.meta.url)(routeFile);
// No server-side network use is permitted: all provider and persistence boundaries are local.
globalThis.fetch=()=>{throw new Error('External network forbidden in offline regression');};
const server=createServer(async(req,res)=>{
  if(req.url==='/client.js'){res.setHeader('Content-Type','text/javascript');res.end(client.outputFiles[0].contents);return;}
  if(req.method==='POST'){
    let body='';for await(const part of req)body+=part;
    const values=req.headers['content-type']?.includes('json')?JSON.parse(body):Object.fromEntries(new URLSearchParams(body));
    requests.push({url:req.url,headers:req.headers,values});
    if(mode==='disconnect'){req.socket.destroy();return;}
    if(mode==='html'){res.end('<html>Session expired</html>');return;}
    const response=await POST(new Request(`http://127.0.0.1${req.url}`,{method:'POST',headers:req.headers,body}),{params:Promise.resolve({orderReference:'MKORD-OFFLINE-RETRY'})});
    res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());return;
  }
  res.setHeader('Content-Type','text/html');res.end(`<!doctype html><html><body><h1>Failed paid Essential order</h1><div id="root">${markup}</div><script src="/client.js"></script></body></html>`);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin=`http://127.0.0.1:${server.address().port}`;
const evidence=[];
try{
for(const [engine,device] of [[chromium,{}],[chromium,devices['Pixel 7']],[webkit,devices['iPhone 13']]]){
const browser=await engine.launch();
try{
for(const scenario of ['normal','missing-uuid','no-javascript','chunk-failure','construction-failure','disconnect','html','forbidden','double-click']){
journey=createOfflineJourney(join(work,randomUUID()+'.sqlite'));
requests=[];mode=['disconnect','html','forbidden'].includes(scenario)?scenario:'ok';
const context=await browser.newContext({...device,javaScriptEnabled:scenario!=='no-javascript'});
await context.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());
const page=await context.newPage(); const errors=[];page.on('pageerror',e=>errors.push(e.message));
if(scenario==='missing-uuid') await page.addInitScript(()=>Object.defineProperty(Crypto.prototype,'randomUUID',{value:undefined}));
if(scenario==='chunk-failure')await page.route('**/client.js',route=>route.abort());
await page.goto(origin);
if(!['no-javascript','chunk-failure'].includes(scenario))await page.waitForFunction(()=>window.hydrated);
if(scenario==='construction-failure')await page.evaluate(()=>{window.AbortController=class{constructor(){throw new Error('unsupported');}}});
const posted=page.waitForRequest(r=>r.method()==='POST').catch(()=>null);
if(scenario==='double-click')await page.getByRole('button',{name:'Retry Generation',exact:true}).evaluate(e=>{e.click();e.click();});
else await page.getByRole('button',{name:'Retry Generation',exact:true}).click();
if(scenario==='construction-failure'){
 await page.getByRole('alert').filter({hasText:'could not be submitted'}).waitFor();assert.equal(requests.length,0);
}else{
 await posted;
 if(['disconnect','html','forbidden'].includes(scenario))await page.getByRole('alert').waitFor();
 else await page.waitForLoadState('networkidle');
 if(scenario==='disconnect') { assert.ok(requests.length >= 1); assert.ok(requests.every(r=>r.values.requestKey==='offline-server-key')); }
 else assert.equal(requests.length,1,`${scenario} sends exactly one POST`);
 assert.equal(requests[0].url,'/score/api/admin/orders/MKORD-OFFLINE-RETRY/generate-report');
 assert.equal(requests[0].values.action,'admin_retry');assert.equal(requests[0].values.requestKey,'offline-server-key');
 if(!['no-javascript','chunk-failure'].includes(scenario))assert.equal(requests[0].headers['x-idempotency-key'],'offline-server-key');
}
assert.deepEqual(errors,[]);
if(['normal','missing-uuid','no-javascript','chunk-failure','double-click'].includes(scenario))journey.verify();
else assert.equal(journey.ledger.prepare('SELECT COUNT(*) AS n FROM attempts').get().n,1);
journey.ledger.close();
evidence.push({engine:engine.name(),device:device.defaultBrowserType?'mobile':'desktop',scenario,posts:requests.length,passed:true});
await context.close();
}
}finally{await browser.close();}
}
console.log(JSON.stringify({passed:true,externalProviderCalls:0,productionMutations:0,evidence},null,2));
}finally{server.close();await rm(ssrFile,{force:true});await rm(routeFile,{force:true});await rm(work,{recursive:true,force:true});}
