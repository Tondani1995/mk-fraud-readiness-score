import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {buildSync} from 'esbuild';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const baseline='897ead6d';
const files=execFileSync('git',['ls-tree','-r','--name-only',baseline,'src/lib','src/app/score/api','public/fonts','src/app/layout.tsx','package.json','package-lock.json'],{encoding:'utf8'}).trim().split('\n');
for(const file of files)assert.ok(fs.readFileSync(file).equals(execFileSync('git',['show',`${baseline}:${file}`],{maxBuffer:20*1024*1024})),`Protected behaviour changed: ${file}`);
const instrumentPath='src/components/adaptive/AdaptiveAssessmentExperience.tsx';
const oldInstrument=execFileSync('git',['show',`${baseline}:${instrumentPath}`],{encoding:'utf8'});
const instrument=fs.readFileSync(instrumentPath,'utf8');
const logic=text=>{const start=text.indexOf('export function AdaptiveAssessmentExperience(');const end=text.indexOf('  return (\n    <>\n      <div\n        ref={rootRef}',start);assert.ok(start>=0&&end>start);return text.slice(start,end);};
// The presentation-only layout effect may now measure confirmation/area context.
// Freeze every other handler/effect byte, including persistence and motion coordination.
const omitScrollEffect=text=>{
 const start=text.indexOf('  useStageLayoutEffect(() => {');
 const end=text.indexOf('  }, [currentId, screen]);',start);
 assert.ok(start>=0&&end>start,'Find exactly the question scroll-layout effect');
 return text.slice(0,start)+'  /* reviewed question scroll geometry */'+text.slice(end+'  }, [currentId, screen]);'.length);
};
const expectedLogic=omitScrollEffect(logic(oldInstrument)).replace('      headerHeight + 28,', '      headerHeight + 48,');
assert.equal(omitScrollEffect(logic(instrument)),expectedLogic,'Only the reviewed scroll-layout effect and 20px preferred-clearance offset may differ; all state, save, recovery and transition handlers remain protected');
assert.ok(fs.readFileSync('src/app/clarity.css','utf8').split('\n').length<=5444,'Do not grow the legacy stylesheet');
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
console.log(JSON.stringify({ok:true,protectedFilesUnchanged:files.length,calculatedCases:cases.length,railBoundaries:[0,49.75,100,null],scrollClearanceException:'Presentation-only scroll-layout effect and preferred-clearance offset; every other handler/effect byte is protected.',scope:'Spatial presentation preserves five calculated cases, exact values/null/gaps/order/withholding. All library/API/font/package files and assessment state/persistence/transition handlers are unchanged from the reviewed security checkpoint.'},null,2));
