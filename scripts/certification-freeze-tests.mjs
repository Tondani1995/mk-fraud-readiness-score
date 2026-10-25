import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
const baseline='3fced66f';
const exceptions=new Set(['src/lib/security/rate-limit.ts','src/app/score/api/adaptive/[assessmentRef]/result/route.ts','src/app/score/layout.tsx']);
const paths=execFileSync('git',['ls-tree','-r','--name-only',baseline,'src','public','tailwind.config.ts'],{encoding:'utf8'}).trim().split('\n');
let unchanged=0;
for(const file of paths){
  if(exceptions.has(file))continue;
  assert.ok(execFileSync('git',['show',`${baseline}:${file}`],{maxBuffer:20*1024*1024}).equals(fs.readFileSync(file)),`${file} changed outside certification scope`);
  unchanged++;
}
const layout=fs.readFileSync('src/app/score/layout.tsx','utf8');
assert.equal(layout.replace("  referrer: 'no-referrer',\n",''),execFileSync('git',['show',`${baseline}:src/app/score/layout.tsx`],{encoding:'utf8'}));
console.log(JSON.stringify({ok:true,baseline,unchangedFiles:unchanged,exceptions:[...exceptions],scope:'All pre-existing src/public/Tailwind files frozen except the reviewed limiter, recovery HTTP boundary and non-visual referrer metadata. Design, engine, persistence, commercial projection and timing unchanged.'}));
