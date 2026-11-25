// Run the actual server page in an isolated local bundle. Framework navigation and client UI are doubled;
// the application catalogue and campaign policy are real. No HTTP request or customer record is made.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { build } from 'esbuild';

const filename='src/app/score/start/page.tsx';
const baselineRef=process.env.CAMPAIGN_BASELINE_REF;
const original=baselineRef ? execFileSync('git',['show',`${baselineRef}:${filename}`],{encoding:'utf8'}) : null;
const corrected=fs.readFileSync(filename,'utf8');
async function route(source,release){
  const result=await build({stdin:{contents:source,sourcefile:filename,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'node',format:'esm',jsx:'automatic',tsconfig:'tsconfig.json',plugins:[{name:'isolated-entry',setup(b){
    b.onResolve({filter:/^next\/navigation$/},()=>({path:'nav',namespace:'test'}));
    b.onResolve({filter:/^@\/lib\/website\/readiness-release$/},()=>({path:'release',namespace:'test'}));
    b.onResolve({filter:/^@\/components\//},args=>({path:args.path,namespace:'ui'}));
    b.onLoad({filter:/.*/,namespace:'test'},args=>({contents:args.path==='nav'?`export function redirect(url){throw Object.assign(new Error('redirect'),{location:url});}`:`export function revisedReleaseEffective(){return ${release};}`}));
    b.onLoad({filter:/.*/,namespace:'ui'},()=>({contents:'export const AdaptiveStartForm=()=>null; export const FraudReadinessTermsGate=()=>null; export const Card=()=>null; export const CardContent=()=>null; export const CardHeader=()=>null; export const CardTitle=()=>null; export const SectionShell=()=>null;'}));
  }}]});
  return (await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)).default;
}
const tags={utm_source:'x',utm_medium:'organic_social',utm_campaign:'fraud_readiness_100d',utm_content:'fr0001'};
async function destination(page,searchParams){try{await page({searchParams:Promise.resolve(searchParams)});return null;}catch(e){if(e.location)return e.location;throw e;}}
const before=original ? await destination(await route(original,true),tags) : null;
const after=await destination(await route(corrected,true),{...tags,token:'must-not-be-forwarded',email:'private@example.invalid'});
if(original) assert.equal(before,'/review');
assert.deepEqual(Object.fromEntries(new URL(after,'https://mkfraud.co.za').searchParams),tags);
assert.equal(await destination(await route(corrected,true),{}),'/review');
assert.equal(await destination(await route(corrected,false),{}),null);
console.log('PASS: actual entry page retains the commissioned tuple and excludes private fields. Untagged and legacy entry behaviour preserved.');
console.log(original ? `Baseline ${baselineRef}: reproduced loss of all four campaign tags before the fix.` : 'Optional before/after reproduction: set CAMPAIGN_BASELINE_REF to the pre-fix commit (8eb0f15650483ba8df979c21cd49b196dfa32754).');
