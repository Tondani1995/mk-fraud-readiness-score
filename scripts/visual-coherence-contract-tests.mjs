import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {buildSync} from 'esbuild';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const baseline='49dfdcbd';
const files=execFileSync('git',['ls-tree','-r','--name-only',baseline,'src/lib/scoring','src/lib/adaptive','src/lib/respondent','src/lib/security','src/lib/commercial','src/lib/snapshot','src/app/score/api','src/components/adaptive/AdaptiveAssessmentExperience.tsx','src/app/layout.tsx'],{encoding:'utf8'}).trim().split('\n');
for(const file of files)assert.equal(fs.readFileSync(file,'utf8'),execFileSync('git',['show',`${baseline}:${file}`],{encoding:'utf8'}),`Protected behaviour changed: ${file}`);
const css=fs.readFileSync('src/app/clarity.css','utf8');
const oldCss=execFileSync('git',['show',`${baseline}:src/app/clarity.css`],{encoding:'utf8'});
for(const variable of ['--mk-motion-enter','--mk-motion-collapse','--mk-motion-ease']){
 const expression=new RegExp(`${variable}:([^;]+);`);assert.equal(css.match(expression)?.[1],oldCss.match(expression)?.[1],variable);
}
for(const selector of ['.answer-slot {',".answer-slot[data-exiting='true'] {",'.question-stage {',".assessment-instrument[data-transition-phase='entering'] .question-stage {"]){
 const block=text=>text.slice(text.indexOf(selector),text.indexOf('}',text.indexOf(selector))+1);
 assert.equal(block(css),block(oldCss),`Motion CSS changed: ${selector}`);
}
const require=createRequire(import.meta.url);
const code=buildSync({stdin:{contents:`
 import React from 'react'; import {renderToStaticMarkup} from 'react-dom/server';
 import {DomainScoreRail} from './src/components/clarity/DomainScoreRail';
 import {DomainReadinessMap} from './src/components/clarity/DomainReadinessMap';
 import {buildCalculatedSnapshotFixture,CALCULATED_VARIANTS} from './src/lib/visual-review/calculated-fixtures';
 export const rail=(p)=>renderToStaticMarkup(React.createElement(DomainScoreRail,p));
 export const cases=CALCULATED_VARIANTS.map(name=>{const snapshot=buildCalculatedSnapshotFixture(name);return {name,snapshot,markup:renderToStaticMarkup(React.createElement(DomainReadinessMap,{snapshot}))};});
`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,platform:'node',format:'cjs',write:false,external:['react','react-dom/server'],jsx:'automatic'}).outputFiles[0].text;
const module={exports:{}};vm.runInNewContext(code,{module,exports:module.exports,require});
const {rail,cases}=module.exports;
for(const {name,snapshot,markup} of cases){
 assert.equal((markup.match(/data-domain-score-rail/g)||[]).length,snapshot.domains.length,name);
 assert.doesNotMatch(markup,/NaN|undefined%|null%/);
 let previous=-1;
 for(const domain of snapshot.domains){
  const at=markup.indexOf(`aria-label="${domain.domainName}:`);assert.ok(at>previous,`${name}: domain order preserved`);previous=at;
  assert.ok(markup.includes(`${domain.criticalGapCount} critical-control gaps. Explore area.`),`${name}: exact gap count`);
 }
 if(snapshot.resultStatus==='INSUFFICIENT_VISIBILITY')assert.doesNotMatch(markup,/Focus \d/);
}
for(const score of [0,49.75,100,null]){
 const markup=rail({name:'Synthetic domain',score,criticalGaps:3,priority:2});
 assert.match(markup,/>3<\/b>/);assert.match(markup,/Focus 2/);
 if(score===null){assert.match(markup,/Not scored/);assert.doesNotMatch(markup,/data-readiness-marker/);}
 else {assert.ok(markup.includes(`left:${score}%`));assert.ok(markup.includes(`width:${score}%`));}
}
console.log(JSON.stringify({ok:true,protectedFilesUnchanged:files.length,calculatedCases:cases.length,railBoundaries:[0,49.75,100,null],scope:'Actual presentation components preserve recorded values, nulls, gaps, domain order and withholding; scoring, persistence, API/security, commercial projection and timings unchanged.'},null,2));
